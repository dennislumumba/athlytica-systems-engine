-- =====================================================================
-- ANON EXECUTE REVOKE — SECURITY DEFINER functions reachable over REST
-- (founder directive 2026-07-26).
--
-- Closes the two surfaces the linter flagged after the SEC-001 full
-- lockdown landed.
--
-- 1. athlete_passport_longitudinal(uuid) — SECURITY DEFINER, does NO
--    internal scoping: it returns whatever athlete_id it is handed. It
--    was already REVOKEd from anon by 20260714090000, but the live ACL
--    still read "=X/postgres" — the PUBLIC grant, which anon inherits.
--    Revoking anon alone is a no-op; PUBLIC must fall too. This is the
--    identical trap SEC-001 documented for settle_payment_transaction.
--    The explicit `authenticated` grant is deliberately KEPT — that was
--    20260714090000's intent, and /api/v1/athletes/passport runs
--    service_role either way.
--
-- 2. generate_legacy_claim_token() — a TRIGGER function (references
--    NEW; bound to trg_generate_claim_token on public.athlete). It has
--    no legitimate direct caller in any role, so EXECUTE is stripped
--    from all three client roles. Trigger firing does not check the
--    calling role's EXECUTE privilege, so trg_generate_claim_token is
--    unaffected.
-- =====================================================================

revoke execute on function public.athlete_passport_longitudinal(uuid)
  from public, anon;

revoke execute on function public.generate_legacy_claim_token()
  from public, anon, authenticated;
