-- =====================================================================
-- RLS HELPER SEARCH_PATH PIN (founder directive 2026-07-26).
--
-- is_global_founder() and app_tenant_id() are SECURITY INVOKER and are
-- evaluated INSIDE policy expressions, so a caller who controls
-- search_path could shadow the objects they resolve and influence a
-- policy decision. Pinning search_path closes that; jwt_tenant_ids()
-- and jwt_athlete_ids() already ship pinned.
--
-- Bodies are unchanged — this is a hardening no-op on behaviour.
-- =====================================================================

create or replace function public.is_global_founder()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'dennis@bigice.co.ke';
$$;

create or replace function public.app_tenant_id()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;
