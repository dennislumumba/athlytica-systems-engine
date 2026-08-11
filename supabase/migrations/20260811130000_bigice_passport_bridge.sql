-- =====================================================================
-- 20260811130000_bigice_passport_bridge.sql
-- Links a Big Ice athlete to the passport plane the cohort schedule
-- keys on.
--
-- THREE ATHLETE TABLES EXIST on this database, for historical reasons
-- no migration in this repo records:
--   public.athlete           — passport plane. cohort_session_registry
--                              .student_athlete_id points here, and
--                              nrhl_athlete.passport_athlete_id already
--                              bridges to it.
--   public.athletes          — training-log plane. sessions.athlete_id
--                              points here; settle_payment_transaction()
--                              constructs the rows.
--   athlytica_core.athletes  — core identity, birth_certificate_hash
--                              NOT NULL UNIQUE.
--
-- The parent portal's "next session" reads cohort_session_registry, so
-- Big Ice needs the SAME bridge NRHL has. This adds that one column and
-- nothing else: no bridge to public.athletes, because the Big Ice cohort
-- schedule does not live there and a fourth unpopulated link column
-- would just be a fourth thing to keep straight.
--
-- NULL is the honest default. An athlete with no passport row has no
-- scheduled cohort, and the portal renders that as "no session
-- scheduled" rather than inventing one.
-- =====================================================================

alter table public.bigice_athlete
  add column if not exists passport_athlete_id uuid
    references public.athlete(athlete_id) on delete set null;

create index if not exists idx_bigice_athlete_passport
  on public.bigice_athlete (passport_athlete_id)
  where passport_athlete_id is not null;
