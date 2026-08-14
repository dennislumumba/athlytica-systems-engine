-- =====================================================================
-- ROLLBACK for M5 — D-01a containment
--
-- Restores public.athletes to its pre-M5 posture exactly: `authenticated`
-- regains full DML and self_identity_policy returns as FOR ALL.
--
-- ⚠ RUNNING THIS RE-OPENS D-01a. It restores a state in which any
-- authenticated caller holding a public.users row can set
-- passport_athlete_id to any athlete that exists and thereby read that
-- child's name, date of birth, guardian name and guardian contact.
--
-- Only run it if M5 is shown to break a legitimate flow — and note that
-- no application code has ever written this table (one read,
-- service_role, app/api/v1/workspace/dashboard/route.ts:410), so a break
-- would mean a NEW client-side writer was added after M5. Fix that writer
-- to go through the server-side boundary instead of running this.
-- =====================================================================

drop policy if exists athletes_self_read on public.athletes;

create policy self_identity_policy on public.athletes
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant insert, update, delete, truncate, references, trigger
  on public.athletes to authenticated;

comment on table public.athletes is null;
