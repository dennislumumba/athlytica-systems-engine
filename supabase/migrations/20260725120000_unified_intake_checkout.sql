-- =====================================================================
-- UNIFIED INTAKE CHECKOUT — additive columns for the cross-domain
-- /register funnel + STK checkout tracking (founder directive 2026-07-25).
--
-- ADDITIVE-ONLY DDL, same law as registration_sessions_v2:
--   * athlete_name / tier / preferred_campus — intake profile fields
--     captured by /api/v1/biz/stk-push (parent registers the athlete);
--   * checkout_request_id — Daraja CheckoutRequestID for the dispatched
--     STK push, polled by /api/v1/biz/check-status.
-- The settlement RPC (settle_payment_transaction) is UNCHANGED: it
-- already stamps settled_receipt + settled_at and matches sessions by
-- account_reference equality (ATH-XXXX manual payments) then
-- msisdn_hash (STK callbacks).
-- =====================================================================

alter table public.registrations
  add column if not exists athlete_name        text,
  add column if not exists tier                text,
  add column if not exists preferred_campus    text,
  add column if not exists checkout_request_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_tier_check') then
    alter table public.registrations add constraint registrations_tier_check
      check (tier is null or tier in ('baseline_7500', 'combine_27500', 'acceleration_45000'));
  end if;
end $$;

create index if not exists registrations_checkout_request_idx
  on public.registrations (checkout_request_id)
  where checkout_request_id is not null;
