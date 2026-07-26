-- =====================================================================
-- WORKSPACE RBAC — multi-tenant identity layer for app.athlyticahq.com
-- (founder directive 2026-07-26).
--
-- ONE user identity (auth.users) fans out to N workspace roles. The
-- three workspaces are a fixed taxonomy, not rows: adding a fourth is a
-- founder decision that edits this CHECK, not a runtime insert.
--
-- ROOT FOUNDER: dennis@athlyticahq.com is hardcoded here (and in
-- config/workspaces.ts) as GLOBAL_FOUNDER of all three workspaces. The
-- bypass lives in is_global_founder() so RLS and the API agree on one
-- definition — a grant row is never required for the root account.
--
-- SUPERSEDED: 20260726140000_founder_email_swap.sql moves the root
-- identity to dennis@bigice.co.ke. This file is left as-run history.
-- =====================================================================

create table if not exists public.workspace_roles (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  workspace  text not null check (workspace in ('nrhl', 'big_ice', 'athlytica_hq')),
  role       text not null check (role in ('GLOBAL_FOUNDER', 'HEAD_COACH', 'ATHLETE')),
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, workspace)
);

create index if not exists workspace_roles_workspace_idx
  on public.workspace_roles (workspace, role);

-- ---------------------------------------------------------------------
-- Root founder predicate. STABLE + reads only the request JWT, so it is
-- safe inside RLS policies (no recursion into workspace_roles).
-- ---------------------------------------------------------------------
create or replace function public.is_global_founder()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'dennis@athlyticahq.com';
$$;

alter table public.workspace_roles enable row level security;

drop policy if exists workspace_roles_read on public.workspace_roles;
create policy workspace_roles_read on public.workspace_roles
  for select to authenticated
  using (user_id = auth.uid() or public.is_global_founder());

-- Only the root founder mutates the permission matrix.
drop policy if exists workspace_roles_founder_write on public.workspace_roles;
create policy workspace_roles_founder_write on public.workspace_roles
  for all to authenticated
  using (public.is_global_founder())
  with check (public.is_global_founder());

-- ---------------------------------------------------------------------
-- Big Ice academy packages ride the SAME checkout rail as the intake
-- tiers, priced from public.commercial_price_tier (tier_group='academy')
-- rather than the code-level tier table. Widen the constraint to admit
-- the 'academy_<tier_id>' session tier ids the STK route now stamps.
-- ---------------------------------------------------------------------
alter table public.registrations
  drop constraint if exists registrations_tier_check;

alter table public.registrations add constraint registrations_tier_check
  check (
    tier is null
    or tier in ('baseline_7500', 'combine_27500', 'acceleration_45000', 'enterprise_150k')
    or tier like 'academy\_%'
  );
