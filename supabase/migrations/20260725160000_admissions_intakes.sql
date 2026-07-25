-- =====================================================================
-- ADMISSIONS INTAKES — lead capture for the concierge intake wizard
-- (components/onboarding/get-intake-dialog.tsx -> /api/admissions/submit).
--
-- Concierge tiers (200k–1M KES) sit OUTSIDE the unified M-Pesa tier
-- taxonomy: no payment expectation, no session lifecycle — this is a
-- plain append-only lead ledger for founder follow-up.
-- RLS enabled with NO policies: service-role writes only, no client
-- surface (same posture as the settlement tables).
-- =====================================================================

create table if not exists public.admissions_intakes (
  id           uuid primary key default gen_random_uuid(),
  parent_name  text not null,
  email        text not null,
  athlete_name text not null,
  program      text not null,
  athlete_goal text,
  created_at   timestamptz not null default now()
);

alter table public.admissions_intakes enable row level security;

create index if not exists admissions_intakes_created_idx
  on public.admissions_intakes (created_at desc);
