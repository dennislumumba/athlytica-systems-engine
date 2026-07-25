-- =====================================================================
-- 20260713110000_sec001_rls_hardening.sql
-- CLOSES SEC-001 (.agentic-os/02_SECURITY_SWEEP.md §4.1):
--   * versioned DDL for cohort_telemetry / scouting_metric_log (they had
--     NO DDL in this repository — RLS on undeclared tables is fiction)
--   * ENABLE + FORCE ROW LEVEL SECURITY on both
--   * tenant_isolation_policy — session-GUC path (app.current_tenant_id)
--   * tenant_member_policy — JWT path, so the MCP edge gateway
--     (anon key + caller JWT => `authenticated` role) keeps functioning
--     the moment RLS flips on. Without this policy, enabling RLS would
--     silently zero out every MCP read: a broken wall, not a safe one.
--
-- ADDITIVE-ONLY. Lives in supabase/migrations/ — NOT prisma/migrations/ —
-- because this repo's deployment DDL source of truth is Supabase
-- (prisma/schema.prisma header: "do NOT prisma migrate"). One migration
-- directory, zero drift.
--
-- ROLE / BYPASS FACTS (verify at deploy, cannot be proven from repo):
--   * Supabase `service_role` carries BYPASSRLS — every adminClient()
--     route bypasses these policies BY DESIGN. The 02 §2 application
--     barrier remains the primary wall on service-role routes. RLS here
--     is the database net for anon/authenticated/direct-SQL access.
--   * Any direct-SQL connection string (Prisma, psql, workers) MUST use
--     a dedicated non-superuser, non-BYPASSRLS role. Superusers and
--     BYPASSRLS roles walk through RLS silently.
--   * Tenant context for direct-SQL sessions is set ONLY via the
--     parameterized form inside a transaction:
--       SELECT set_config('app.current_tenant_id', $1, true);
--     NEVER by interpolating the tenant id into raw SQL text — that is
--     an injection vector inside the security control itself.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Versioned DDL (shapes match app/api/v1/mcp/route.ts column usage)
-- ---------------------------------------------------------------------
create table if not exists public.cohort_telemetry (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id),
  cohort_id        text not null,
  vertical         text,
  enrolled_count   integer not null default 0 check (enrolled_count >= 0),
  active_count     integer not null default 0 check (active_count >= 0),
  conversion_rate  numeric(6, 5) check (conversion_rate is null
                     or (conversion_rate >= 0 and conversion_rate <= 1)),
  last_updated_at  timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  unique (tenant_id, cohort_id)
);

create table if not exists public.scouting_metric_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  -- passport-plane athlete identity (public.athlete, managed outside
  -- Prisma) — intentionally no FK across the plane boundary.
  athlete_id   uuid not null,
  metric_code  text not null,
  value        double precision not null,
  context      text not null default 'training_session',
  logged_at    timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

-- If a deployed variant of either table pre-exists WITHOUT tenant_id,
-- add it nullably (additive; cannot backfill unknown tenancy here).
-- RLS below treats tenant_id IS NULL as invisible-to-everyone: fail closed.
alter table public.cohort_telemetry
  add column if not exists tenant_id uuid references public.tenants(id);
alter table public.scouting_metric_log
  add column if not exists tenant_id uuid references public.tenants(id);

-- §5 extension law: composite indexes led by tenant_id.
create index if not exists idx_cohort_telemetry_tenant
  on public.cohort_telemetry (tenant_id, cohort_id);
create index if not exists idx_scouting_metric_tenant_athlete_time
  on public.scouting_metric_log (tenant_id, athlete_id, logged_at desc);

-- ---------------------------------------------------------------------
-- 2. Row-level security — ENABLE + FORCE (owner included; no
--    SECURITY DEFINER function touches these tables, so FORCE is safe)
-- ---------------------------------------------------------------------
alter table public.cohort_telemetry enable row level security;
alter table public.cohort_telemetry force row level security;
alter table public.scouting_metric_log enable row level security;
alter table public.scouting_metric_log force row level security;

-- ---------------------------------------------------------------------
-- 3. Policies
-- ---------------------------------------------------------------------
-- 3a. Session-GUC isolation (direct-SQL / future ORM connections).
--     current_setting(..., true) returns NULL when unset; NULLIF guards
--     the empty string. Unset context => predicate NULL => zero rows.
--     FAIL CLOSED BY CONSTRUCTION.
drop policy if exists tenant_isolation_policy on public.cohort_telemetry;
create policy tenant_isolation_policy on public.cohort_telemetry
  for all
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

drop policy if exists tenant_isolation_policy on public.scouting_metric_log;
create policy tenant_isolation_policy on public.scouting_metric_log
  for all
  using (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.current_tenant_id', true), '')::uuid);

-- 3b. JWT-mapped tenant membership (MCP edge gateway path: anon key +
--     caller JWT). Identity chain mirrors resolveCallerTenant():
--     auth email -> public.users -> tenant_id.
drop policy if exists tenant_member_policy on public.cohort_telemetry;
create policy tenant_member_policy on public.cohort_telemetry
  for select
  to authenticated
  using (tenant_id in (
    select u.tenant_id from public.users u
     where u.email = (auth.jwt() ->> 'email')
  ));

drop policy if exists tenant_member_policy on public.scouting_metric_log;
create policy tenant_member_policy on public.scouting_metric_log
  for all
  to authenticated
  using (tenant_id in (
    select u.tenant_id from public.users u
     where u.email = (auth.jwt() ->> 'email')
  ))
  with check (tenant_id in (
    select u.tenant_id from public.users u
     where u.email = (auth.jwt() ->> 'email')
  ));

-- 3c. Anonymous role: zero access to telemetry planes, ever.
revoke all on public.cohort_telemetry from anon;
revoke all on public.scouting_metric_log from anon;

-- ---------------------------------------------------------------------
-- 4. SEC-002 (adjacent hole surfaced by this sweep): resolveCallerTenant
--    reads public.users through the anon-key+JWT client. With users RLS
--    disabled, ANY authenticated JWT could enumerate the entire users
--    table via PostgREST. Lock to self-read.
--
--    ENABLE only — deliberately NOT FORCE: settle_payment_transaction is
--    SECURITY DEFINER (owner-run) and must keep inserting users rows;
--    the Supabase `postgres` owner role does NOT carry BYPASSRLS, so
--    FORCE here would break atomic account construction.
-- ---------------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists users_self_read on public.users;
create policy users_self_read on public.users
  for select
  to authenticated
  using (email = (auth.jwt() ->> 'email'));

revoke all on public.users from anon;
