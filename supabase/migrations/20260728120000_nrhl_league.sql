-- =====================================================================
-- 20260728120000_nrhl_league.sql
-- NRHL LEAGUE COMMAND CENTER — persistence for the legacy backfill, the
-- division standings engine, the draft board, and certificate issuing.
--
-- WHY NEW TABLES RATHER THAN public.performance_logs:
--   performance_logs requires athlete_id -> public.athletes(id) -> a
--   public.users row, plus a session_id and 1..100-bounded vectors. The
--   legacy corpus has none of those: 31 athletes with no accounts, no
--   sessions, ~40% blank dates, and metrics on six incompatible scales
--   (signed -2..+4, ordinal 0-10, pct, count). Forcing it through that
--   table would mean inventing user rows and rescaling measurements —
--   Evaluation Rubric EV-08 rule 3 says missing data is NULL, never
--   estimated. So legacy lands in its own plane and bridges to the
--   passport via nrhl_athlete.passport_athlete_id when an athlete is
--   actually onboarded.
--
-- The dossier names the target schema `athlytica_core.*`. That schema
-- DOES exist on this database (parents, athletes, performance_logs,
-- scalable_id_sequence, generate_scalable_athlete_code) — all empty as
-- of 2026-07-28. The league plane still lives in public because
-- athlytica_core.athletes requires a NOT NULL UNIQUE
-- birth_certificate_hash the legacy corpus cannot supply; see the
-- companion migration nrhl_league_single_id_issuer for the full
-- reasoning and the bridge columns.
--
-- RLS: policy class D from 20260720100000_sec001_full_surface_rls_lockdown
-- (RLS on, zero client policies, grants stripped). Every read and write
-- goes through /api/v1/leagues/nrhl behind the workspace RBAC gate.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Athlete code issuance
--
-- Legacy ids are 3-digit (ATH-047); the target is 5-digit (ATH-00047).
--
-- NOTE: the body below is superseded by nrhl_league_single_id_issuer,
-- which repoints this function at athlytica_core.scalable_id_sequence —
-- the counter athlytica_core.athletes already stamps codes from. Two
-- issuers for one identifier space is how ATH-047 came to be bound to
-- two different children. This definition is kept only so the file
-- replays in order on a fresh database.
-- ---------------------------------------------------------------------
create sequence if not exists public.scalable_id_sequence start with 100 increment by 1;

create or replace function public.nrhl_next_athlete_code()
returns char(9)
language sql
volatile
set search_path = public
as $$
  select 'ATH-' || lpad(nextval('public.scalable_id_sequence')::text, 5, '0')
$$;

-- ---------------------------------------------------------------------
-- 2. Athlete registry
--
-- display_name is unique and is the join key, because the source system
-- joins on player name (dossier §2.7: "Note Player Name as the join
-- key, not athlytica_id"). Identity resolution happens in the ETL and
-- the surviving canonical name is what lands here.
-- ---------------------------------------------------------------------
create table if not exists public.nrhl_athlete (
  athlete_code        char(9) primary key,
  legacy_code         text,                       -- ATH-047, preserved
  display_name        text not null unique,
  passport_athlete_id uuid references public.athlete(athlete_id) on delete set null,

  primary_discipline  text,
  division            text check (division in ('The Summit','The Ridge','The Plateau','The Savannah')),
  team                text,                       -- draft squad label; null until drafted
  line_assignment     text,                       -- L1/L2/L3/D1/D2/G — the Possession Triangle needs a slot per athlete
  draft_locked_at     timestamptz,
  age_tier            text check (age_tier in ('U8','U12','U15')),
  student_level       text check (student_level in ('Beginner','Novice','Intermediate','Advanced')),

  -- Certificate Tracker inputs (dossier §2A.4). NULL means unmeasured —
  -- never 0. A 0 here would read as "attended nothing", which is a
  -- different claim from "we have no attendance record".
  games_played        integer,
  attendance_rate_pct numeric(6,3),
  coach_grade_avg     numeric(4,3),
  speed_rating        numeric(6,3),               -- ordinal 0-10
  technical_rating    numeric(6,3),               -- SIGNED delta, -2..+4
  conduct_cases       integer not null default 0, -- Attitude/Discipline escalation count
  legacy_points       integer,                    -- NRHL-PTS-v1 weighted total
  composite_score     numeric(8,3),               -- NRHL-COMP-v1
  certificate_tier    text check (certificate_tier in ('Elite All-Rounder','Advanced All-Rounder','Core All-Rounder')),
  certificate_issued_at timestamptz,
  passport_issued_at  timestamptz,

  -- Parent identity sync. Phone is stored E.164 only (dossier §3.2).
  guardian_name       text,
  guardian_email      text,
  guardian_phone_e164 text check (guardian_phone_e164 is null or guardian_phone_e164 ~ '^\+254[17]\d{8}$'),
  guardian_verified_at timestamptz,
  consent_media       text check (consent_media in ('GRANTS','DENIES')),
  consent_recorded_at timestamptz,

  identity_note       text,                       -- why this code was issued the way it was
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_nrhl_athlete_division on public.nrhl_athlete (division);
create index if not exists idx_nrhl_athlete_team on public.nrhl_athlete (team);

-- ---------------------------------------------------------------------
-- 3. Scrimmage / match log
--
-- score_a and score_b are nullable on purpose: 7 of the 10 legacy
-- scrimmages were logged without a score. A scored match is a standings
-- input; an unscored one is not, and must not be counted as 0-0.
-- ---------------------------------------------------------------------
create table if not exists public.nrhl_scrimmage (
  scrimmage_id     text primary key,              -- NRHL-SCR-2026-001
  played_on        date,
  discipline       text,
  division         text check (division in ('The Summit','The Ridge','The Plateau','The Savannah')),
  team_a           text not null,
  team_b           text not null,
  score_a          integer check (score_a >= 0),
  score_b          integer check (score_b >= 0),
  decided_in_overtime boolean not null default false,
  venue            text,                          -- coordinate string pre-2027; no gazetteer exists
  attendance_count integer,
  notes            text,
  source           text not null default 'legacy_csv',
  created_at       timestamptz not null default now()
);

create index if not exists idx_nrhl_scrimmage_date on public.nrhl_scrimmage (played_on desc);

-- ---------------------------------------------------------------------
-- 4. Individual stat lines — the matchday sheet
--
-- points is GENERATED, not stored by the caller. The recovered formula
-- (dossier §2A.3, reconciles 94/94 legacy records) is the league's
-- competitive philosophy priced into the scoreboard at 4:1; an
-- application bug must not be able to write a different number.
-- ---------------------------------------------------------------------
create table if not exists public.nrhl_stat_line (
  id               uuid primary key default gen_random_uuid(),
  scrimmage_id     text not null references public.nrhl_scrimmage(scrimmage_id) on delete cascade,
  athlete_code     char(9) not null references public.nrhl_athlete(athlete_code) on delete cascade,
  side             text check (side in ('A','B')),
  assisted_goals   integer not null default 0 check (assisted_goals >= 0),
  solo_goals       integer not null default 0 check (solo_goals >= 0),
  assists          integer not null default 0 check (assists >= 0),
  points           integer generated always as (assisted_goals * 3 + solo_goals + assists) stored,
  penalty_minutes  integer not null default 0 check (penalty_minutes >= 0),
  shot_velocity_kmh numeric(6,2),
  saves            integer check (saves >= 0),
  shots_faced      integer check (shots_faced >= 0),
  conduct_note     text,                          -- qualitative; NOT a penalty-time proxy
  recorded_by      uuid,
  recorded_at      timestamptz not null default now(),
  unique (scrimmage_id, athlete_code)
);

create index if not exists idx_nrhl_stat_line_athlete on public.nrhl_stat_line (athlete_code);

-- ---------------------------------------------------------------------
-- 5. Universal Taxonomy backfill
--
-- One row per measurement, carrying its own unit and scale, because the
-- legacy corpus mixes signed deltas, 0-10 ordinals, percentages and raw
-- counts inside a single pillar. capture_confidence records how much we
-- trust the date: 0 = absent, 1 = format-ambiguous, 2 = unambiguous
-- (dossier §2.6A, source defects #2 and #4).
-- ---------------------------------------------------------------------
create table if not exists public.nrhl_metric (
  id                 bigserial primary key,
  athlete_code       char(9) not null references public.nrhl_athlete(athlete_code) on delete cascade,
  scrimmage_id       text references public.nrhl_scrimmage(scrimmage_id) on delete set null,
  metric_code        text not null,
  pillar             text not null check (pillar in ('Speed','Agility','Stamina','Technical Skill','Cognitive/Tactical')),
  metric_value       numeric(12,4),
  metric_unit        text not null,
  scale_min          numeric(8,2),
  scale_max          numeric(8,2),
  captured_at        date,
  capture_confidence smallint not null default 0 check (capture_confidence between 0 and 2),
  source_tab         text not null,
  formula_version    text,
  ingested_at        timestamptz not null default now(),
  -- NULLS NOT DISTINCT: athlete-level rollups carry no scrimmage_id, and
  -- default NULL semantics would let every re-ingest insert a duplicate.
  unique nulls not distinct (athlete_code, metric_code, source_tab, scrimmage_id)
);

create index if not exists idx_nrhl_metric_pillar on public.nrhl_metric (pillar, metric_code);

-- ---------------------------------------------------------------------
-- 6. Lockdown — service_role only (policy class D)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['nrhl_athlete','nrhl_scrimmage','nrhl_stat_line','nrhl_metric'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

revoke all on sequence public.scalable_id_sequence from anon, authenticated;
grant usage on sequence public.scalable_id_sequence to service_role;
revoke all on function public.nrhl_next_athlete_code() from public, anon, authenticated;
grant execute on function public.nrhl_next_athlete_code() to service_role;
