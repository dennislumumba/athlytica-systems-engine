-- =====================================================================
-- ROOT FOUNDER EMAIL SWAP — dennis@athlyticahq.com → dennis@bigice.co.ke
-- (founder directive 2026-07-26).
--
-- The predicate is the ONLY place SQL encodes the root identity, so a
-- single create-or-replace moves the bypass. Its TypeScript twin is
-- GLOBAL_FOUNDER_EMAIL in config/workspaces.ts — the two must agree or
-- RLS and the API will disagree about who the founder is.
--
-- Any workspace_roles rows granted to the old address are left alone:
-- they were explicit grants, not the bypass, and revoking them is a
-- founder decision made through the permission matrix.
-- =====================================================================

create or replace function public.is_global_founder()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'dennis@bigice.co.ke';
$$;
