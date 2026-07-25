-- =====================================================================
-- 20260712190000_payment_and_funnel_events.sql
-- DDL source of truth for:
--   * public.payment_events          (Charlie OS 6.01 cash-watcher; G-W6-PAY evidence ledger)
--   * public.onboarding_funnel_events (Charlie OS 3.03 CRO drop-off vectors)
-- Governing manuals: .agentic-os/05_CORPORATE_SKILLS.md, 04_NOTION_SYNC_MAP.md §4
--
-- PII posture: raw MSISDN is NEVER persisted — only a SHA-256 hash for
-- dedupe/repeat-payer analysis. Reconciliation identity is the M-Pesa
-- receipt number (unique). Funnel events carry a client-generated
-- anonymous UUID and zero free-text (Kenya DPA 2019; minors in scope).
--
-- OPEN DEBT SKL-001: append-only trigger (mirror the performance_logs
-- pattern in 20260711120000_hercules_core_merge.sql) before first
-- production settlement write.
-- =====================================================================

create table if not exists public.payment_events (
  id                     uuid primary key default gen_random_uuid(),
  gate_id                text not null default 'G-W6-PAY',
  mpesa_receipt_number   text not null unique,
  amount_kes             numeric(12, 2) not null check (amount_kes > 0),
  msisdn_hash            text not null check (char_length(msisdn_hash) = 64),
  account_reference      text not null check (char_length(account_reference) between 1 and 64),
  result_code            integer not null check (result_code = 0), -- only settled evidence enters the ledger
  transaction_timestamp  timestamptz not null,
  created_at             timestamptz not null default now()
);

create index if not exists payment_events_tx_ts_idx
  on public.payment_events (transaction_timestamp desc);

create index if not exists payment_events_account_ref_idx
  on public.payment_events (account_reference);

create table if not exists public.onboarding_funnel_events (
  id            uuid primary key default gen_random_uuid(),
  anonymous_id  uuid not null,
  stage         text not null check (stage in (
                  'LANDING',
                  'REGISTRATION_STARTED',
                  'DETAILS_SUBMITTED',
                  'PAYMENT_INITIATED',
                  'PAYMENT_SETTLED'
                )),
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (anonymous_id, stage) -- idempotent stage capture per visitor
);

create index if not exists onboarding_funnel_stage_idx
  on public.onboarding_funnel_events (stage, occurred_at desc);
