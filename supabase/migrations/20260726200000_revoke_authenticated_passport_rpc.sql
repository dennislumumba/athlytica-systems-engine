-- =====================================================================
-- PASSPORT RPC — drop the last client-role grant (founder directive
-- 2026-07-26).
--
-- athlete_passport_longitudinal(uuid) is SECURITY DEFINER and performs
-- NO internal scoping: it returns the full longitudinal passport for
-- whatever athlete_id it is handed. 20260726180000 removed the PUBLIC
-- and anon grants; the `authenticated` grant kept from 20260714090000
-- still let ANY signed-in account read ANY athlete's passport given a
-- UUID — horizontal privilege escalation across every family on the
-- platform.
--
-- The only caller, /api/v1/athletes/passport, builds a service_role
-- client, so no application path depends on the authenticated grant.
-- EXECUTE is now service_role (and owner) only.
--
-- If a browser-side caller is ever needed, do NOT restore this grant:
-- add an internal `p_athlete_id in (select public.jwt_athlete_ids())`
-- guard to the function body first, so the scope check travels with the
-- function instead of relying on every caller to be trustworthy.
-- =====================================================================

revoke execute on function public.athlete_passport_longitudinal(uuid)
  from authenticated;
