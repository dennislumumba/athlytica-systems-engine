-- =====================================================================
-- 20260720100000_sec001_full_surface_rls_lockdown.sql
-- SEC-001 FULL-SURFACE HARDENING — closes the remaining 41 wide-open
-- public tables ahead of the 2026-07-21 live multi-sport testing session.
--
-- Extends the architecture proven in 20260713110000_sec001_rls_hardening
-- (cohort_telemetry / scouting_metric_log): JWT-validated tenant or
-- identity scope, session-GUC path for direct SQL, fail-closed defaults.
--
-- LIVE-STATE FACTS THIS FILE IS BUILT AGAINST (verified 2026-07-20):
--   * 41/45 public tables: RLS disabled, zero policies.
--   * settle_payment_transaction: SECURITY DEFINER with EXECUTE granted
--     to PUBLIC + anon + authenticated => unauthenticated REST callers
--     could forge settlement evidence. Revoking anon alone is
--     insufficient — the PUBLIC grant must fall too.
--   * Views bone_age_dispute_evidence (audit alias: "home_age_dispute_
--     evidence" — live object is bone_age_*), solidarity_claim_input,
--     actuarial_injury_exposure_summary: owned by postgres WITHOUT
--     security_invoker => definer-style views that bypass RLS on the
--     PII base tables they join (athlete, biometric_record,
--     injury_record, custody_record, transfer_event).
--   * Every app route uses SUPABASE_SERVICE_ROLE_KEY (BYPASSRLS), so
--     this lockdown is the database-plane net for anon/authenticated/
--     direct-SQL access; app-layer behavior is unchanged.
--
-- POLICY CLASSES:
--   A. Tenant-plane tables (tenant_id column): GUC isolation policy +
--      JWT tenant-membership policy (mirrors scouting_metric_log).
--   B. Passport-plane PII tables (athlete-keyed): SELECT-only for
--      authenticated callers whose JWT resolves to that athlete
--      (self-claim via public.athletes bridge) or to a tenant holding
--      custody via athlete_tenant_links. All client writes fail closed
--      (service-role / definer-RPC writes only).
--   C. Reference/taxonomy tables: authenticated read-only.
--   D. System/ledger tables: RLS on, ZERO client policies, grants
--      stripped — service_role only.
--
-- FORCE RLS is deliberately NOT applied outside the two already-forced
-- telemetry tables: settle_payment_transaction and the passport RPCs
-- are SECURITY DEFINER functions owned by postgres and must keep
-- writing payment_events / registrations / gate_states.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Identity-resolution helpers (SECURITY DEFINER, locked search_path)
-- ---------------------------------------------------------------------

-- Tenant scope: JWT -> public.users -> tenant_id (mirrors
-- resolveCallerTenant()), with id- and email-chain support.
create or replace function public.jwt_tenant_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select u.tenant_id
    from public.users u
   where u.tenant_id is not null
     and (
       u.email = (auth.jwt() ->> 'email')
       or u.id = auth.uid()
     )
$$;

-- Session-GUC tenant (direct-SQL path). Unset context => NULL => zero
-- rows. FAIL CLOSED BY CONSTRUCTION.
create or replace function public.app_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;

-- Athlete scope: self-claimed passport identities (public.athletes
-- bridge: user_id -> passport_athlete_id) UNION athletes under the
-- caller's tenant custody (athlete_tenant_links).
create or replace function public.jwt_athlete_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.passport_athlete_id
    from public.athletes a
   where a.user_id = auth.uid()
     and a.passport_athlete_id is not null
  union
  select l.athlete_id
    from public.athlete_tenant_links l
   where l.tenant_id in (select public.jwt_tenant_ids())
$$;

revoke all on function public.jwt_tenant_ids() from public, anon;
revoke all on function public.jwt_athlete_ids() from public, anon;
grant execute on function public.jwt_tenant_ids() to authenticated, service_role;
grant execute on function public.jwt_athlete_ids() to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 2. Blanket lockdown: ENABLE RLS on every public table, strip anon
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.oid::regclass as tbl
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
  loop
    execute format('alter table %s enable row level security', r.tbl);
    execute format('revoke all on table %s from anon', r.tbl);
  end loop;
end;
$$;

revoke usage on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------------------------------------------------------------------
-- 3A. Tenant-plane tables — GUC + JWT policies
--     (registrations, performance_logs, venues, tenants)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['registrations', 'performance_logs', 'venues'] loop
    if to_regclass('public.' || t) is null then continue; end if;

    execute format('drop policy if exists tenant_isolation_policy on public.%I', t);
    execute format(
      'create policy tenant_isolation_policy on public.%I
         for all
         using (tenant_id = public.app_tenant_id())
         with check (tenant_id = public.app_tenant_id())', t);

    execute format('drop policy if exists tenant_member_policy on public.%I', t);
    execute format(
      'create policy tenant_member_policy on public.%I
         for select
         to authenticated
         using (tenant_id in (select public.jwt_tenant_ids()))', t);
  end loop;
end;
$$;

-- tenants: members see only their own tenant row.
drop policy if exists tenant_self_select on public.tenants;
create policy tenant_self_select on public.tenants
  for select
  to authenticated
  using (id in (select public.jwt_tenant_ids()) or id = public.app_tenant_id());

-- ---------------------------------------------------------------------
-- 3B. Passport-plane PII tables — athlete-scoped SELECT, writes fail
--     closed. ABSOLUTE-PRIORITY SET: athlete, biometric_record,
--     injury_record, guardian_contact, performance_record + records.
-- ---------------------------------------------------------------------
do $$
declare
  spec text[];
  specs text[][] := array[
    array['athlete',                 'athlete_id'],
    array['biometric_record',        'athlete_id'],
    array['injury_record',           'athlete_id'],
    array['guardian_contact',        'athlete_id'],
    array['performance_record',      'athlete_id'],
    array['custody_record',          'athlete_id'],
    array['representation_claim',    'athlete_id'],
    array['transfer_event',          'athlete_id'],
    array['sport_profile',           'athlete_id'],
    array['athlete_metrics_log',     'athlete_id'],
    array['athlete_coaches',         'athlete_id'],
    array['athlete_sports',          'athlete_id'],
    array['sessions',                'athlete_id'],
    array['cohort_session_registry', 'student_athlete_id'],
    array['digital_product_ledger',  'licensed_to_athlete_id'],
    array['commercial_inventory',    'issued_to_athlete_id']
  ];
begin
  foreach spec slice 1 in array specs loop
    if to_regclass('public.' || spec[1]) is null then continue; end if;

    execute format('drop policy if exists athlete_scope_select on public.%I', spec[1]);
    execute format(
      'create policy athlete_scope_select on public.%I
         for select
         to authenticated
         using (%I in (select public.jwt_athlete_ids()))',
      spec[1], spec[2]);
  end loop;
end;
$$;

-- metric_value has no direct athlete_id: scope through sport_profile /
-- performance_record lineage.
drop policy if exists athlete_scope_select on public.metric_value;
create policy athlete_scope_select on public.metric_value
  for select
  to authenticated
  using (
    sport_profile_id in (
      select sp.sport_profile_id from public.sport_profile sp
       where sp.athlete_id in (select public.jwt_athlete_ids())
    )
    or performance_record_id in (
      select pr.performance_record_id from public.performance_record pr
       where pr.athlete_id in (select public.jwt_athlete_ids())
    )
  );

-- athletes bridge: strict self-scope (identity root — must never leak).
drop policy if exists self_identity_policy on public.athletes;
create policy self_identity_policy on public.athletes
  for all
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- athlete_tenant_links: visible only inside the caller's tenant scope.
drop policy if exists tenant_member_policy on public.athlete_tenant_links;
create policy tenant_member_policy on public.athlete_tenant_links
  for select
  to authenticated
  using (tenant_id in (select public.jwt_tenant_ids()));

-- ---------------------------------------------------------------------
-- 3C. Reference / taxonomy tables — authenticated read-only
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'sport_taxonomy', 'discipline_taxonomy', 'metric_registry',
    'division', 'division_scoring_rule', 'federation', 'club',
    'agency', 'agent', 'competition_event', 'commercial_price_tier',
    'provenance'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists reference_read_policy on public.%I', t);
    execute format(
      'create policy reference_read_policy on public.%I
         for select
         to authenticated
         using (true)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 3D. System / ledger tables — service_role ONLY. RLS on with zero
--     client policies + grants stripped: fail closed on both layers.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'payment_events', 'gate_states', 'audit_log',
    'sync_dead_letter_queue', 'telemetry_ingest_queue',
    'onboarding_funnel_events', 'google_form_submission_log',
    'inventory_waitlist_alerts'
  ] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. REST payment exploit — settle_payment_transaction
--    Live grants included PUBLIC: revoking anon alone leaves the door
--    open through the PUBLIC grant. Strip PUBLIC + anon + authenticated;
--    the M-PESA callback route runs service_role and is unaffected.
-- ---------------------------------------------------------------------
revoke execute on function public.settle_payment_transaction(
  text, numeric, text, text, integer, timestamptz
) from public, anon, authenticated;

grant execute on function public.settle_payment_transaction(
  text, numeric, text, text, integer, timestamptz
) to service_role;

-- ---------------------------------------------------------------------
-- 5. Definer-style view refactor — bone_age_dispute_evidence,
--    solidarity_claim_input, actuarial_injury_exposure_summary.
--    security_invoker = true (PG15+; live is PG17) makes each view
--    execute with the CALLER's privileges, so base-table RLS now
--    applies through the view instead of being silently bypassed.
--    Guarded: these views exist on live but are not created by any
--    migration in this directory.
-- ---------------------------------------------------------------------
do $$
declare
  v text;
begin
  foreach v in array array[
    'bone_age_dispute_evidence',
    'solidarity_claim_input',
    'actuarial_injury_exposure_summary'
  ] loop
    if to_regclass('public.' || v) is null then continue; end if;
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on public.%I from anon', v);
  end loop;
end;
$$;
