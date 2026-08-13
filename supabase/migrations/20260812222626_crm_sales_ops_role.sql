-- =====================================================================
-- SALES_OPS — a grant that opens the CRM and nothing else (2026-08-13).
--
-- WHY IT IS A workspace_roles ROW AND NOT A SECOND TABLE: the founder
-- already grants and revokes access in the HQ permission matrix. A
-- parallel CRM-only permission table would be a second place to
-- remember, and the one that gets forgotten when someone leaves.
--
-- WHY THAT IS SAFE HERE: a workspace grant is normally all-or-nothing —
-- /api/v1/workspace/dashboard hands a venture's entire payload
-- (payment_events, the registration ledger, the permission matrix) to
-- anyone holding one, because role filtering happens client-side at
-- render. So this migration ships WITH a server-side guard: that route
-- now refuses any role outside VENTURE_DASHBOARD_ROLES
-- (config/workspaces.ts), and SALES_OPS is deliberately not in it.
-- Granting sales access therefore widens nothing but the CRM.
--
-- Mirrors config/workspaces.ts WORKSPACE_ROLES. Widen both or neither.
-- =====================================================================

alter table public.workspace_roles
  drop constraint if exists workspace_roles_role_check;

alter table public.workspace_roles add constraint workspace_roles_role_check
  check (role in ('GLOBAL_FOUNDER', 'HEAD_COACH', 'ATHLETE', 'SALES_OPS'));

-- 20260726120000 created the table when there were three workspaces and
-- tta arrived later (20260727120000) without restating this constraint.
-- Stated once here so the four ids the code knows about are the four the
-- database accepts.
alter table public.workspace_roles
  drop constraint if exists workspace_roles_workspace_check;

alter table public.workspace_roles add constraint workspace_roles_workspace_check
  check (workspace in ('nrhl', 'big_ice', 'athlytica_hq', 'tta'));
