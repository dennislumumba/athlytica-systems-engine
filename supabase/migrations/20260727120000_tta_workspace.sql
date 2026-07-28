-- =====================================================================
-- TTA WORKSPACE — fourth workspace in the RBAC taxonomy (founder
-- directive 2026-07-27, ahead of the TTA International Football Academy
-- demo).
--
-- 20260726120000_workspace_rbac.sql states that adding a workspace is a
-- founder decision that edits this CHECK rather than a runtime insert.
-- This is that edit. config/workspaces.ts carries the mirror — the two
-- lists must stay in step.
--
-- No grant rows are seeded: is_global_founder() short-circuits the
-- lookup, so the root account holds GLOBAL_FOUNDER in 'tta' the moment
-- the constraint admits it.
-- =====================================================================

alter table public.workspace_roles
  drop constraint if exists workspace_roles_workspace_check;

alter table public.workspace_roles add constraint workspace_roles_workspace_check
  check (workspace in ('nrhl', 'big_ice', 'athlytica_hq', 'tta'));
