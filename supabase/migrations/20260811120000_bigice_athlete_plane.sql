-- =====================================================================
-- 20260811120000_bigice_athlete_plane.sql
-- BIG ICE ATHLETE PLANE — the persistent athlete identity the parent
-- portal, onboarding documents and progress record all hang off.
--
-- WHY A SEPARATE PLANE FROM public.nrhl_athlete:
--   Big Ice is not the league. It sells skating development across
--   inline / ice / figure / hockey / fitness, to children who may never
--   enter NRHL. Reusing nrhl_athlete would make every Big Ice pupil a
--   league entity and put a `division` CHECK on a five-year-old learning
--   to stop. The two planes CROSS-REFERENCE (bigice_athlete.nrhl_athlete_code)
--   rather than merge, which is what keeps the pathway
--   Big Ice -> NRHL legible without fusing two organisations' records.
--
-- WHY NOT athlytica_core.athletes DIRECTLY: unchanged from
--   20260728130000 — birth_certificate_hash is NOT NULL UNIQUE there and
--   a registration form cannot supply one. The bridge columns are
--   populated later, when the documents exist.
--
-- ONE ISSUER. bigice_next_athlete_code() draws from the SAME
--   athlytica_core.scalable_id_sequence counter that stamps ATH- codes.
--   A second counter is how ATH-047 came to name two children; a shared
--   one guarantees a number is handed out once across every venture,
--   even though the prefixes differ.
--
-- RLS: policy class D (RLS on, zero client policies, grants stripped).
-- Every read and write goes through an API route behind workspace RBAC.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Athlete code issuance — BIIF-2026-0501
--
-- THIS FUNCTION IS THE ID FORMAT CONFIG POINT. Prefix, year segment and
-- width live here and nowhere else; issued codes are immutable, so a
-- format change applies to codes minted after it and never rewrites
-- history.
-- ---------------------------------------------------------------------
create or replace function public.bigice_next_athlete_code()
returns text
language plpgsql
volatile
security definer
set search_path = athlytica_core, public
as $$
declare
  next_sequence int;
begin
  update athlytica_core.scalable_id_sequence
     set current_value = current_value + 1
   where id = 1
  returning current_value into next_sequence;

  if next_sequence is null then
    raise exception 'athlytica_core.scalable_id_sequence row id=1 is missing; athlete codes cannot be issued';
  end if;

  return 'BIIF-' || to_char(now(), 'YYYY') || '-' || lpad(next_sequence::text, 4, '0');
end;
$$;

revoke all on function public.bigice_next_athlete_code() from public, anon, authenticated;
grant execute on function public.bigice_next_athlete_code() to service_role;

-- ---------------------------------------------------------------------
-- 2. The athlete — a long-lived person, not a purchase
--
-- Everything here is true of the CHILD regardless of what was bought.
-- Anything true only of a purchase belongs in bigice_enrollment below.
--
-- NATURAL KEY: (normalised name, guardian phone). Name alone is what
-- collided in the NRHL corpus — two children genuinely share a name, and
-- the household phone is what separates them. Siblings share the phone
-- and differ by name, so the pair holds in both directions.
-- date_of_birth is deliberately NOT in the key: legacy records arrive
-- without one, and a NULL there must not mint a second identity.
-- ---------------------------------------------------------------------
create table if not exists public.bigice_athlete (
  biif_code           text primary key,
  legacy_code         text,                        -- prior spreadsheet / roster id, preserved forever
  full_name           text not null,
  date_of_birth       date,
  -- Generated, so the uniqueness rule cannot drift from the matcher's
  -- normalisation. Mirrors normaliseName() in lib/services/bigice-athlete.ts.
  name_key            text generated always as (
                        trim(lower(regexp_replace(full_name, '[^a-zA-Z0-9]+', ' ', 'g')))
                      ) stored,

  primary_discipline  text check (primary_discipline in
                        ('INLINE','ICE','FIGURE','HOCKEY','FITNESS')),
  skating_level       text check (skating_level in
                        ('Beginner','Developing','Intermediate','Advanced')),

  -- Household. Phone is E.164 only; it is also the join key into
  -- athlytica_core.parents via link_guardian().
  guardian_name       text,
  guardian_email      text,
  guardian_phone_e164 text check (guardian_phone_e164 is null or guardian_phone_e164 ~ '^\+254[17]\d{8}$'),

  -- Bridges. Populated when the athlete has what each plane requires —
  -- never speculatively.
  core_athlete_id     uuid references athlytica_core.athletes(athlete_id) on delete set null,
  core_parent_id      uuid references athlytica_core.parents(parent_id)   on delete set null,
  nrhl_athlete_code   char(9) references public.nrhl_athlete(athlete_code) on delete set null,

  -- Portal access is a parent-account event, not an athlete attribute,
  -- but the "awaiting activation" count on the admin dashboard reads it
  -- per athlete, so the timestamp lives here.
  portal_activated_at timestamptz,

  origin              text not null default 'REGISTRATION'
                        check (origin in ('REGISTRATION','LEGACY_IMPORT','MANUAL')),
  status              text not null default 'ACTIVE'
                        check (status in ('ACTIVE','DORMANT','WITHDRAWN')),
  identity_note       text,                        -- why this code was issued the way it was
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- NULLS NOT DISTINCT: a household with no phone on file must still
-- collapse to one row per name rather than one row per re-registration.
create unique index if not exists uq_bigice_athlete_identity
  on public.bigice_athlete (name_key, guardian_phone_e164) nulls not distinct;

create index if not exists idx_bigice_athlete_guardian_phone on public.bigice_athlete (guardian_phone_e164);
create index if not exists idx_bigice_athlete_guardian_email on public.bigice_athlete (lower(guardian_email));
create index if not exists idx_bigice_athlete_legacy on public.bigice_athlete (legacy_code) where legacy_code is not null;

-- ---------------------------------------------------------------------
-- 3. Enrollment — one row per thing bought
--
-- An athlete accumulates these. Buying the next programme appends a row
-- and never touches biif_code, which is the entire point of §2 of the
-- brief: the identity outlives the purchase.
--
-- PRICING: price_tier_id points at public.commercial_price_tier for the
-- academy cohorts; tier_id names a config/registration-fees.ts tier for
-- everything else. Exactly one of the two, same law as /api/v1/biz/stk-push
-- — an enrollment that could name both could disagree with what was charged.
-- ---------------------------------------------------------------------
create table if not exists public.bigice_enrollment (
  enrollment_id     uuid primary key default gen_random_uuid(),
  biif_code         text not null references public.bigice_athlete(biif_code) on delete cascade,

  programme_label   text not null,                 -- what the parent saw on the page
  discipline        text check (discipline in ('INLINE','ICE','FIGURE','HOCKEY','FITNESS')),
  price_tier_id     text,                          -- commercial_price_tier.tier_id
  tier_id           text,                          -- config/registration-fees.ts key
  amount_kes        numeric(12,2) check (amount_kes is null or amount_kes > 0),

  -- Settlement evidence. NULL receipt = not paid; the row exists so a
  -- failed payment leaves an auditable attempt rather than nothing
  -- (brief §55), but nothing downstream may treat it as enrolled.
  mpesa_receipt     text unique,
  status            text not null default 'PENDING_PAYMENT'
                      check (status in ('PENDING_PAYMENT','ACTIVE','COMPLETED','CANCELLED')),

  coach_name        text,
  location          text,
  starts_on         date,
  ends_on           date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint bigice_enrollment_one_price_source
    check (num_nonnulls(price_tier_id, tier_id) = 1)
);

create index if not exists idx_bigice_enrollment_athlete on public.bigice_enrollment (biif_code, created_at desc);
create index if not exists idx_bigice_enrollment_status on public.bigice_enrollment (status);

-- ---------------------------------------------------------------------
-- 4. The guardian bridge is not league-specific
--
-- nrhl_link_guardian() writes athlytica_core.parents, which is the
-- household identity for every venture. Renamed rather than duplicated —
-- a second function inserting into the same UNIQUE phone column is the
-- same two-issuer mistake in a different costume. Caller updated in
-- app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts.
-- ---------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'nrhl_link_guardian'
  ) then
    alter function public.nrhl_link_guardian(text) rename to link_guardian;
  end if;
end $$;

revoke all on function public.link_guardian(text) from public, anon, authenticated;
grant execute on function public.link_guardian(text) to service_role;

-- ---------------------------------------------------------------------
-- 5. Lockdown — service_role only (policy class D)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['bigice_athlete','bigice_enrollment'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;
