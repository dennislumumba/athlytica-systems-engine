-- =====================================================================
-- M2 — RECORD CLASSIFICATION (D-22).  Owner-approved 2026-08-12.
--
-- APPLIED to production as version 20260812083829. This filename matches
-- that version deliberately: every other local migration is versioned
-- differently from its applied counterpart (see D-16 / MIGRATION_
-- RECONCILIATION.md), because `apply_migration` stamps
-- to_char(current_timestamp,'YYYYMMDDHH24MISS') while earlier files were
-- hand-named. This one is aligned so it does not widen that drift, and
-- it is the pattern D-16 option A proposes for the rest.
--
-- WHY: production holds 5 payment_events totalling KES 658,000 that are
-- all synthetic (AUDITTEST001-004 plus SGX7HQ2LM9, the latter confirmed
-- absent from the Safaricom statement by the owner on 2026-08-12). They
-- are indistinguishable from real revenue by any existing column, and
-- payment_events is append-only by trigger so they cannot be corrected
-- in place.
--
-- DESIGN: classification is ADDITIVE and EXTERNAL. Nothing is written to
-- payment_events; its immutability is preserved exactly.
--
-- DEFAULT IS PRODUCTION BY ABSENCE. A row here means "this is NOT real".
-- That fails safe: a forgotten classification over-counts revenue rather
-- than hiding a real payment.
--
-- PRIVILEGE NOTE: default privileges on `public` grant arwdDxtm to
-- `authenticated` for tables created by `postgres`. Left alone, any
-- signed-in user could reclassify a payment and make revenue disappear.
-- The revokes below are therefore load-bearing, not ceremony. Verified
-- after apply: authenticated holds no SELECT/UPDATE/DELETE.
-- =====================================================================

create table if not exists public.record_classification (
  record_table   text        not null,
  record_id      text        not null,
  classification text        not null
    check (classification in ('PRODUCTION','TEST','AUDIT','DEMO')),
  reason         text        not null,
  classified_by  text        not null,
  classified_at  timestamptz not null default now(),
  primary key (record_table, record_id)
);

comment on table public.record_classification is
  'Marks records that are NOT production. Absence of a row means PRODUCTION. '
  'Revenue, athlete-count, enrollment and analytics reads must exclude rows '
  'whose classification <> PRODUCTION. See docs/phase0/PHASE_0_3_PAYMENT_AND_ID_INTEGRITY.md §3.';

create index if not exists idx_record_classification_lookup
  on public.record_classification (record_table, classification);

-- Deny-by-default. No policies: no client role should reach this table at
-- all, so a policy would be unreachable code.
alter table public.record_classification enable row level security;

-- Undo the inherited default privileges. Without this, `authenticated`
-- holds INSERT/UPDATE/DELETE on a table that governs what counts as money.
revoke all on public.record_classification from anon, authenticated;
grant  all on public.record_classification to   service_role;

-- ── Classify the five existing synthetic settlements ────────────────
-- Insert-only. payment_events is not touched.
insert into public.record_classification
  (record_table, record_id, classification, reason, classified_by)
values
  ('payment_events','AUDITTEST001','TEST',
   'Self-describing synthetic receipt. Shares a frozen transaction_timestamp with AUDITTEST002-004 and matches no registration. Flipped gate_states G-W6-PAY live on 2026-08-11 22:20:23.',
   'phase-0.3-M2 (owner-approved 2026-08-12)'),
  ('payment_events','AUDITTEST002','TEST',
   'Self-describing synthetic receipt. Frozen transaction_timestamp 2026-08-11 22:21:41; matches no registration.',
   'phase-0.3-M2 (owner-approved 2026-08-12)'),
  ('payment_events','AUDITTEST003','TEST',
   'Self-describing synthetic receipt. Frozen transaction_timestamp 2026-08-11 22:21:41; matches no registration.',
   'phase-0.3-M2 (owner-approved 2026-08-12)'),
  ('payment_events','AUDITTEST004','TEST',
   'Self-describing synthetic receipt. Frozen transaction_timestamp 2026-08-11 22:21:41; matches no registration.',
   'phase-0.3-M2 (owner-approved 2026-08-12)'),
  ('payment_events','SGX7HQ2LM9','TEST',
   'Owner checked the Safaricom statement for Paybill 4325935 on 2026-08-12: this receipt is NOT present. Founder test. Shaped like a real settlement (10-char receipt, distinct msisdn_hash, 1.5s callback latency, exact live 16,500 KES price) and therefore indistinguishable from production inside the database - the reason this table exists.',
   'phase-0.3-M2 (owner-approved 2026-08-12; evidence: Safaricom statement)')
on conflict (record_table, record_id) do nothing;

-- =====================================================================
-- VERIFIED AFTER APPLY (2026-08-12):
--   classified_rows          = 5
--   payment_events           = 5   (unchanged, still append-only)
--   rls_enabled              = true, policies = 0
--   anon SELECT/INSERT       = false / false
--   authenticated S/U/D      = false / false / false
--   service_role INSERT      = true
--   PRODUCTION revenue       = KES 0.00
--   excluded as synthetic    = KES 658,000.00
--
-- ROLLBACK: supabase/migrations/rollback/20260812083829_record_classification_rollback.sql
-- =====================================================================
