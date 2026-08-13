-- =====================================================================
-- CRM CORE — the commercial layer around the existing data model
-- (founder directive 2026-08-13).
--
-- WHAT THIS IS NOT: a second athlete table, a second payment record, a
-- second price list. Every CRM row that refers to a real person, a real
-- venture or real money holds a REFERENCE:
--
--   crm_contact.athlete_id      -> public.athlete
--   crm_contact.user_id         -> auth.users
--   crm_organization.tenant_id  -> public.tenants   (once they buy)
--   crm_organization.club_id    -> public.club      (registry entity)
--   crm_opportunity.registration_id -> public.registrations
--
-- MONEY TRUTH IS UNCHANGED. `stage = 'won'` means the founder believes
-- the deal closed. Cash collected is only ever read by joining
-- registrations -> payment_events with the record_classification
-- exclusion (M2). A won opportunity with no settled registration is a
-- forecast, and every revenue surface must say so.
--
-- ONE TABLE FOR LEAD AND OPPORTUNITY. The eight lead statuses in the
-- brief and the eight pipeline stages are the same eight states; a lead
-- is an opportunity that has not reached 'qualified'. Two tables would
-- need two copies of that vocabulary, and the drift between them is
-- exactly the "impossible pipeline state" the brief asks us to prevent.
--
-- ACCESS: no policies are declared. RLS is enabled and every table is
-- revoked from anon and authenticated, so these tables are reachable
-- ONLY by service_role behind the gate in app/api/v1/crm — the same
-- lockdown the nrhl_* league tables use (20260728120000). CRM data must
-- never ride /api/v1/workspace/dashboard, whose payload is all-or-
-- nothing to any grant holder.
--
-- Taxonomy is mirrored in config/crm.ts. Widen both or neither.
-- =====================================================================

-- ---------------------------------------------------------------------
-- ORGANIZATIONS — schools, academies, clubs, corporates.
--
-- A prospect is not a tenant. `public.tenants` is a paying tenant of the
-- platform and `public.club` is a federation registry entity; neither
-- models "a school we are pitching". The links are filled in when the
-- prospect becomes one of those things.
-- ---------------------------------------------------------------------
create table if not exists public.crm_organization (
  org_id     uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 2 and 160),
  org_type   text not null check (org_type in ('school', 'academy', 'club', 'corporate', 'federation', 'other')),
  phone      text,
  email      text,
  location   text,
  tenant_id  uuid references public.tenants (id) on delete set null,
  club_id    uuid references public.club (club_id) on delete set null,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Duplicate DETECTION, not prevention: the brief says warn, never block.
-- Two campuses of one school are two rows and that is correct.
create index if not exists crm_organization_name_idx
  on public.crm_organization (lower(btrim(name)));

-- ---------------------------------------------------------------------
-- CONTACTS — a person in a commercial conversation.
--
-- athlete_id / user_id are the anti-duplication mechanism: when a lead
-- converts, the contact POINTS AT the athlete row rather than being
-- re-keyed into one.
-- ---------------------------------------------------------------------
create table if not exists public.crm_contact (
  contact_id      uuid primary key default gen_random_uuid(),
  full_name       text not null check (length(btrim(full_name)) between 2 and 120),
  -- Canonical Kenyan 254(1|7)XXXXXXXX, normalised by utils/msisdn.ts
  -- before insert, or bare E.164 for an international partner. Anything
  -- else is a typo, and a typo is an uncallable lead.
  phone           text check (
                    phone is null
                    or phone ~ '^254[17][0-9]{8}$'
                    or phone ~ '^\+[1-9][0-9]{6,14}$'
                  ),
  email           text check (email is null or email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  contact_type    text not null check (contact_type in (
                    'parent', 'athlete', 'coach', 'school_admin', 'academy_owner',
                    'club_admin', 'organization_contact', 'partner', 'other')),
  organization_id uuid references public.crm_organization (org_id) on delete set null,
  -- The passport athlete this person IS or is buying for.
  athlete_id      uuid references public.athlete (athlete_id) on delete set null,
  -- Set once they hold a login, so a customer is one identity end to end.
  user_id         uuid references auth.users (id) on delete set null,
  source          text not null default 'other' check (source in (
                    'instagram', 'facebook', 'tiktok', 'whatsapp', 'website', 'referral',
                    'school_outreach', 'coach_referral', 'nrhl_event', 'big_ice',
                    'athlytica', 'existing_network', 'other')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists crm_contact_phone_idx on public.crm_contact (phone) where phone is not null;
create index if not exists crm_contact_email_idx on public.crm_contact (lower(email)) where email is not null;
create index if not exists crm_contact_name_idx on public.crm_contact (lower(btrim(full_name)));
create index if not exists crm_contact_athlete_idx on public.crm_contact (athlete_id) where athlete_id is not null;
create index if not exists crm_contact_org_idx on public.crm_contact (organization_id) where organization_id is not null;

-- ---------------------------------------------------------------------
-- OPPORTUNITIES — lead and deal in one row.
--
-- expected_value is GENERATED. The brief says not to store a derived
-- value; a stored generated column is Postgres computing it, so it can
-- be indexed and summed without ever being wrong.
-- ---------------------------------------------------------------------
create table if not exists public.crm_opportunity (
  opportunity_id     uuid primary key default gen_random_uuid(),
  -- No cascade: a contact with commercial history cannot be deleted out
  -- from under it. The FK refuses, which is the intended answer.
  contact_id         uuid not null references public.crm_contact (contact_id),
  organization_id    uuid references public.crm_organization (org_id) on delete set null,
  athlete_id         uuid references public.athlete (athlete_id) on delete set null,
  product            text not null check (product in (
                       'nrhl_profile', 'nrhl_standard', 'nrhl_elite',
                       'bigice_prospect', 'bigice_semi_annual', 'bigice_annual',
                       'athlytica_individual', 'athlytica_organization',
                       'institutional_partnership', 'other')),
  source             text not null default 'other' check (source in (
                       'instagram', 'facebook', 'tiktok', 'whatsapp', 'website', 'referral',
                       'school_outreach', 'coach_referral', 'nrhl_event', 'big_ice',
                       'athlytica', 'existing_network', 'other')),
  stage              text not null default 'new' check (stage in (
                       'new', 'contacted', 'qualified', 'meeting', 'proposal',
                       'payment_pending', 'won', 'lost', 'nurture')),
  temperature        text not null default 'warm' check (temperature in ('cold', 'warm', 'hot')),
  -- What we expect to be paid. Negotiated; list_price_kes is what the
  -- price table says, kept beside it so a discount is visible.
  value_kes          numeric(12, 2) not null check (value_kes >= 0),
  list_price_kes     numeric(12, 2) check (list_price_kes is null or list_price_kes >= 0),
  probability_pct    integer not null default 10 check (probability_pct between 0 and 100),
  expected_value_kes numeric(14, 2)
                       generated always as (round(value_kes * probability_pct / 100.0, 2)) stored,
  expected_close_date date,
  assigned_to        uuid references auth.users (id) on delete set null,
  -- The money link. Cash collected is read through this, never from stage.
  registration_id    uuid references public.registrations (id) on delete set null,
  lost_reason        text,
  converted_at       timestamptz,
  -- The API stamps the acting user here on every write. Triggers run as
  -- service_role, where auth.uid() is null, so this is how the audit
  -- trail learns who did it.
  last_actor         uuid references auth.users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- Impossible pipeline states, refused at the boundary:
  constraint crm_opportunity_lost_needs_reason
    check (stage <> 'lost' or (lost_reason is not null and length(btrim(lost_reason)) > 0)),
  constraint crm_opportunity_won_needs_timestamp
    check (stage <> 'won' or converted_at is not null)
);

create index if not exists crm_opportunity_stage_idx on public.crm_opportunity (stage);
create index if not exists crm_opportunity_contact_idx on public.crm_opportunity (contact_id);
create index if not exists crm_opportunity_assigned_idx on public.crm_opportunity (assigned_to);
create index if not exists crm_opportunity_close_idx on public.crm_opportunity (expected_close_date);
-- "Which deals are going stale" is the whole query behind §24.9.
create index if not exists crm_opportunity_stale_idx on public.crm_opportunity (stage, updated_at desc);
create unique index if not exists crm_opportunity_registration_idx
  on public.crm_opportunity (registration_id) where registration_id is not null;

-- ---------------------------------------------------------------------
-- ACTIVITIES — what was actually said, and when. Append-in-practice:
-- the timeline is the record of the relationship.
-- ---------------------------------------------------------------------
create table if not exists public.crm_activity (
  activity_id    uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references public.crm_contact (contact_id) on delete cascade,
  opportunity_id uuid references public.crm_opportunity (opportunity_id) on delete set null,
  activity_type  text not null check (activity_type in (
                   'call', 'whatsapp', 'sms', 'email', 'meeting', 'assessment',
                   'follow_up', 'proposal', 'payment_request', 'note', 'other')),
  subject        text not null check (length(btrim(subject)) between 1 and 200),
  notes          text,
  outcome        text,
  occurred_at    timestamptz not null default now(),
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists crm_activity_contact_idx on public.crm_activity (contact_id, occurred_at desc);
create index if not exists crm_activity_opportunity_idx on public.crm_activity (opportunity_id, occurred_at desc);

-- ---------------------------------------------------------------------
-- TASKS — the next action. This is the table the founder actually opens
-- in the morning, so due_date is mandatory: a task with no date is a
-- task that never surfaces.
-- ---------------------------------------------------------------------
create table if not exists public.crm_task (
  task_id        uuid primary key default gen_random_uuid(),
  contact_id     uuid not null references public.crm_contact (contact_id) on delete cascade,
  opportunity_id uuid references public.crm_opportunity (opportunity_id) on delete cascade,
  title          text not null check (length(btrim(title)) between 1 and 200),
  description    text,
  due_date       date not null default (current_date + 1),
  priority       text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status         text not null default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  assigned_to    uuid references auth.users (id) on delete set null,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),

  constraint crm_task_completed_timestamp
    check ((status = 'completed') = (completed_at is not null))
);

-- The morning query: open tasks, oldest due first.
create index if not exists crm_task_due_idx on public.crm_task (due_date) where status = 'pending';
create index if not exists crm_task_contact_idx on public.crm_task (contact_id);
create index if not exists crm_task_opportunity_idx on public.crm_task (opportunity_id);

-- ---------------------------------------------------------------------
-- AUDIT — stage, value, assignment and conversion history.
--
-- Written by a TRIGGER, not by the API. An application that must
-- remember to log is an application that eventually forgets; the brief
-- asks that commercially important history is not silently destroyed.
-- ---------------------------------------------------------------------
create table if not exists public.crm_opportunity_event (
  event_id       bigint generated always as identity primary key,
  opportunity_id uuid not null references public.crm_opportunity (opportunity_id) on delete cascade,
  field          text not null,
  old_value      text,
  new_value      text,
  changed_by     uuid,
  changed_at     timestamptz not null default now()
);

create index if not exists crm_opportunity_event_idx
  on public.crm_opportunity_event (opportunity_id, changed_at desc);

-- =====================================================================
-- TRIGGERS
-- =====================================================================

-- updated_at: public.trg_touch_updated_at() already exists (registrations
-- uses it). Reused rather than reimplemented three times.
drop trigger if exists crm_organization_touch on public.crm_organization;
create trigger crm_organization_touch before update on public.crm_organization
  for each row execute function public.trg_touch_updated_at();

drop trigger if exists crm_contact_touch on public.crm_contact;
create trigger crm_contact_touch before update on public.crm_contact
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- Opportunity: close timestamps are set by the database, so 'won' can
-- never be recorded without the moment it happened.
-- ---------------------------------------------------------------------
create or replace function public.trg_crm_opportunity_close()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();

  if new.stage = 'won' and new.converted_at is null then
    new.converted_at := now();
  end if;
  -- Re-opening a closed deal (§22 edge case) clears the close, so a
  -- reopened opportunity cannot keep counting as booked revenue.
  if new.stage <> 'won' and new.converted_at is not null then
    new.converted_at := null;
  end if;
  if new.stage <> 'lost' then
    new.lost_reason := null;
  end if;

  return new;
end;
$$;

drop trigger if exists crm_opportunity_close on public.crm_opportunity;
create trigger crm_opportunity_close before insert or update on public.crm_opportunity
  for each row execute function public.trg_crm_opportunity_close();

-- ---------------------------------------------------------------------
-- Opportunity audit. jsonb diff over a named field list — no dynamic
-- SQL, and adding a tracked field is one array entry.
-- ---------------------------------------------------------------------
create or replace function public.trg_crm_opportunity_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tracked text[] := array[
    'stage', 'value_kes', 'probability_pct', 'assigned_to', 'product',
    'lost_reason', 'registration_id', 'expected_close_date', 'temperature'
  ];
  k text;
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  foreach k in array tracked loop
    if (o ->> k) is distinct from (n ->> k) then
      insert into public.crm_opportunity_event (opportunity_id, field, old_value, new_value, changed_by)
      values (new.opportunity_id, k, o ->> k, n ->> k, new.last_actor);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists crm_opportunity_audit on public.crm_opportunity;
create trigger crm_opportunity_audit after update on public.crm_opportunity
  for each row execute function public.trg_crm_opportunity_audit();

-- ---------------------------------------------------------------------
-- Deterministic automation (§19). No scoring, no AI — four rules.
--
-- A new opportunity gets a first follow-up. Reaching qualified,
-- proposal or payment-pending without an open task gets one, because an
-- active deal with no next action is how a founder loses it.
-- ---------------------------------------------------------------------
create or replace function public.trg_crm_opportunity_next_action()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wanted_title text;
  wanted_due   date;
  wanted_prio  text := 'high';
begin
  if tg_op = 'INSERT' then
    wanted_title := 'First follow-up';
    wanted_due := current_date + 1;
  elsif new.stage is distinct from old.stage then
    case new.stage
      when 'qualified'       then wanted_title := 'Agree the next step'; wanted_due := current_date + 2;
      when 'proposal'        then wanted_title := 'Follow up on proposal'; wanted_due := current_date + 3;
      when 'payment_pending' then wanted_title := 'Confirm payment'; wanted_due := current_date + 2;
                                  wanted_prio := 'urgent';
      else return null;
    end case;
  else
    return null;
  end if;

  -- Never stack duplicates on a deal that already has a next action.
  if exists (
    select 1 from public.crm_task
    where opportunity_id = new.opportunity_id and status = 'pending'
  ) then
    return null;
  end if;

  insert into public.crm_task (contact_id, opportunity_id, title, due_date, priority, assigned_to)
  values (new.contact_id, new.opportunity_id, wanted_title, wanted_due, wanted_prio, new.assigned_to);

  return null;
end;
$$;

drop trigger if exists crm_opportunity_next_action on public.crm_opportunity;
create trigger crm_opportunity_next_action after insert or update on public.crm_opportunity
  for each row execute function public.trg_crm_opportunity_next_action();

-- ---------------------------------------------------------------------
-- Settlement -> won.
--
-- THE EXCEPTION BLOCK IS THE POINT. This trigger hangs off the money
-- path; a CRM failure (missing table, constraint, anything) must never
-- abort a settlement. It fails silently and the dashboard's
-- "settled but not marked won" reconciliation row catches what it missed.
-- ---------------------------------------------------------------------
create or replace function public.trg_crm_settlement_won()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.crm_opportunity
       set stage = 'won',
           probability_pct = 100,
           converted_at = coalesce(new.settled_at, now())
     where registration_id = new.id
       and stage <> 'won';
  exception when others then
    null;  -- CRM must never break a payment.
  end;
  return null;
end;
$$;

drop trigger if exists registrations_crm_settlement_won on public.registrations;
create trigger registrations_crm_settlement_won
  after update of payment_status on public.registrations
  for each row
  when (new.payment_status = 'PAYMENT_SETTLED' and old.payment_status is distinct from 'PAYMENT_SETTLED')
  execute function public.trg_crm_settlement_won();

-- =====================================================================
-- LOCKDOWN — service_role only, behind the gate in app/api/v1/crm.
-- RLS is enabled with NO policies: authenticated has no path in even if
-- a future grant is added by accident.
-- =====================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'crm_organization', 'crm_contact', 'crm_opportunity',
    'crm_activity', 'crm_task', 'crm_opportunity_event'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end;
$$;

revoke all on function public.trg_crm_opportunity_audit() from public, anon, authenticated;
revoke all on function public.trg_crm_opportunity_next_action() from public, anon, authenticated;
revoke all on function public.trg_crm_settlement_won() from public, anon, authenticated;
revoke all on function public.trg_crm_opportunity_close() from public, anon, authenticated;

comment on table public.crm_opportunity is
  'Lead and deal in one row. stage=won is a founder judgement; cash collected is read only via registration_id -> registrations -> payment_events with the record_classification PRODUCTION filter.';
comment on table public.crm_opportunity_event is
  'Append-only audit of stage/value/assignment/conversion changes, written by trigger.';
