-- =====================================================================
-- M5 — D-01a containment: the identity bridge is not client-writable
--
-- public.athletes is the passport ⇄ app-plane bridge:
--   athlete.athlete_id → athletes.passport_athlete_id → athletes.id
--                      → athlete_tenant_links.athlete_id → tenant_id
--
-- passport_athlete_id is the first branch of jwt_athlete_ids(), which is
-- the USING clause of the SELECT policy on athlete, guardian_contact,
-- biometric_record, injury_record, custody_record and
-- cohort_session_registry. Writing that column IS writing the caller's
-- own authorization context.
--
-- Before this migration, `authenticated` held INSERT/UPDATE/DELETE on the
-- table and self_identity_policy was FOR ALL with WITH CHECK on user_id
-- only. The policy constrained who the row belonged to and said nothing
-- about which athlete it claimed.
--
-- That was not exploitable in production, but only because
-- athletes.user_id references public.users, and public.users shares no id
-- and no email with auth.users (D-37). The exploit arms the moment
-- anything bridges them — which is exactly what a parent portal, athlete
-- onboarding, or a stock handle_new_user() trigger does. Proven both ways
-- in a rolled-back transaction: blocked at SQLSTATE 23503 without the
-- bridge, SUCCEEDS with it.
--
-- So this does NOT tighten the policy and call it done. It removes the
-- capability, at the privilege layer, so the containment holds whether or
-- not the FK ever stops being an accident.
--
-- NOT CHANGED, deliberately:
--   * service_role and postgres keep every grant. Creating an ownership
--     claim is a server-side operation behind an authorization check —
--     the same posture as every identity-creating path since 0.3F.
--   * No UNIQUE on passport_athlete_id. Whether one athlete may have more
--     than one owner (two guardians, guardian + athlete) is a cardinality
--     decision for the identity ownership model (D-37), not a containment
--     one. Adding it here would bake in a 1:1 that the live F-5 household
--     suggests is wrong.
--   * No FORCE RLS. That is gated on D-35 and must be runtime-tested.
--
-- This is D-01a containment. It is NOT "RLS complete".
-- =====================================================================

-- 1. The client cannot write the bridge. TRIGGER and REFERENCES go too:
--    TRIGGER would let a client attach code to the table, REFERENCES
--    would let it pin rows it does not own.
revoke insert, update, delete, truncate, references, trigger
  on public.athletes from authenticated;

-- 2. Read-your-own stays, so the guardian path remains structurally
--    possible: the owner reads their bridge row, jwt_athlete_ids()
--    resolves their athlete, and the athlete-scoped policies admit it.
drop policy if exists self_identity_policy on public.athletes;

create policy athletes_self_read on public.athletes
  for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.athletes is
  'Passport ⇄ app-plane identity bridge. passport_athlete_id feeds '
  'jwt_athlete_ids(), so writing it writes the caller''s authorization '
  'context. Client-writable: NO (M5 / D-01a). Claims are created '
  'server-side behind an authorization check. See '
  'docs/phase0/RLS_IDENTITY_THREAT_MODEL.md.';
