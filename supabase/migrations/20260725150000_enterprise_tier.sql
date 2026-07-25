-- =====================================================================
-- ENTERPRISE TIER — extend registrations_tier_check with enterprise_150k
-- (Institutional / Campus License, founder directive 2026-07-25 pt. 2).
-- Constraint swap is the only change; columns are untouched.
-- =====================================================================

alter table public.registrations
  drop constraint if exists registrations_tier_check;

alter table public.registrations add constraint registrations_tier_check
  check (
    tier is null
    or tier in ('baseline_7500', 'combine_27500', 'acceleration_45000', 'enterprise_150k')
  );
