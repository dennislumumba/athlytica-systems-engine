-- =====================================================================
-- 0001_rls_containment.sql   (REVISED 2026-08-12 after R1–R12 execution)
-- Phase 0.2 — DEFENCE-IN-DEPTH for athlytica_core
--
-- STATUS: PROPOSED. NOT APPLIED. Requires Decision D-01 approval.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY THIS SCRIPT CHANGED
--
-- The first version of this file was written from the Supabase advisor's
-- `rls_disabled` message, which states these tables are "fully exposed to
-- the anon and authenticated roles". THAT IS FALSE FOR THIS PROJECT, and
-- it was verified false by executing the tests rather than reading the
-- advisor:
--
--   anon          -> athlytica_core.*        DENIED: permission denied for schema
--   authenticated -> athlytica_core.*        DENIED: permission denied for schema
--   service_role  -> athlytica_core.parents  DENIED: permission denied for schema
--   anon UPDATE   -> scalable_id_sequence    DENIED: permission denied for schema
--
-- `athlytica_core` carries table privileges for `postgres` ONLY. No client
-- role holds schema USAGE. The advisor flags relrowsecurity=false without
-- checking whether any role can reach the table at all.
--
-- The application reaches these tables exclusively through SECURITY
-- DEFINER functions (link_guardian, bigice_next_athlete_code,
-- nrhl_next_athlete_code), which execute as their owner and therefore
-- bypass both the missing grants and RLS. That is the intended and only
-- access path.
--
-- CONSEQUENCE: the original script's `grant usage on schema … to
-- authenticated` and `grant select … to authenticated` would have
-- WEAKENED the current posture — converting "no access" into "access
-- filtered by policy". Those grants are removed. Absence of privilege is
-- a stronger control than a row filter, and it is what is in place today.
--
-- WHAT THIS SCRIPT NOW DOES: enables RLS as a second line of defence, so
-- that if a future migration ever grants access to athlytica_core by
-- accident, rows are still not readable without an explicit policy.
-- It grants nothing and it revokes nothing.
-- ─────────────────────────────────────────────────────────────────────
--
-- BLAST RADIUS: all four tables are empty (verified). No client role can
-- reach them today. This migration changes no data and no access path.
-- =====================================================================

begin;

-- ── PRE-FLIGHT GUARD ────────────────────────────────────────────────
-- Aborts if the tables are no longer empty, or if the id sequence moved
-- between planning and apply. The sequence is demonstrably volatile: it
-- moved 500 -> 504 during Phase 0.1 while onboarding work was running,
-- so :expected_seq must be re-observed immediately before applying.
do $$
declare
  n_parents  bigint; n_athletes bigint; n_logs bigint; seq_val integer;
begin
  select count(*) into n_parents  from athlytica_core.parents;
  select count(*) into n_athletes from athlytica_core.athletes;
  select count(*) into n_logs     from athlytica_core.performance_logs;
  select current_value into seq_val
    from athlytica_core.scalable_id_sequence where id = 1;

  if n_parents <> 0 or n_athletes <> 0 or n_logs <> 0 then
    raise exception
      'PRE-FLIGHT FAILED: athlytica_core no longer empty (parents=%, athletes=%, logs=%). Re-plan.',
      n_parents, n_athletes, n_logs;
  end if;

  if seq_val is distinct from :'expected_seq'::integer then
    raise exception
      'PRE-FLIGHT FAILED: scalable_id_sequence = % (expected %). It moved since planning — a code was issued in the interval. Re-observe and re-plan.',
      seq_val, :'expected_seq';
  end if;

  raise notice 'PRE-FLIGHT OK: four tables empty, sequence at % (unchanged).', seq_val;
end $$;


-- ── ASSERT THE CURRENT POSTURE STILL HOLDS ──────────────────────────
-- If any client role has gained access to athlytica_core since the audit,
-- this script's premise is void and the policy set must be designed
-- before RLS is enabled — otherwise enabling it silently breaks that
-- caller.
do $$
declare leaked text;
begin
  select string_agg(r, ', ') into leaked
    from unnest(array['anon','authenticated','service_role']) r
   where has_schema_privilege(r, 'athlytica_core', 'USAGE');

  if leaked is not null then
    raise exception
      'PRE-FLIGHT FAILED: role(s) % now hold USAGE on athlytica_core. This script assumes no client role can reach the schema. Design policies for those roles first.',
      leaked;
  end if;

  raise notice 'POSTURE OK: no client role holds USAGE on athlytica_core.';
end $$;


-- ── ENABLE RLS (defence in depth) ───────────────────────────────────
-- Deny-by-default at the row layer, beneath the existing deny-by-absence
-- at the privilege layer. No policies are created: no client role can
-- reach these tables, so a policy would be unreachable code. Policies
-- are added in Phase 1 alongside parent_athlete_link and the canonical
-- athlete table, when there is finally an actor to authorise.
alter table athlytica_core.parents              enable row level security;
alter table athlytica_core.athletes             enable row level security;
alter table athlytica_core.performance_logs     enable row level security;
alter table athlytica_core.scalable_id_sequence enable row level security;

-- FORCE so the table owner is also subject to RLS. NOTE: this does NOT
-- affect the SECURITY DEFINER functions' ability to work — they run as
-- `postgres`, which is a superuser and is exempt from RLS entirely.
-- Verify the onboarding path on an isolated environment before applying
-- to production (see MIGRATION_RUNBOOK step 0.4).
alter table athlytica_core.parents              force row level security;
alter table athlytica_core.athletes             force row level security;
alter table athlytica_core.performance_logs     force row level security;
alter table athlytica_core.scalable_id_sequence force row level security;


-- ── NO GRANTS, NO REVOKES ───────────────────────────────────────────
-- Deliberately empty. See the header. The privilege posture that exists
-- today is the strongest available and is left exactly as found.


-- ── POST-APPLY ASSERTION ────────────────────────────────────────────
do $$
declare unprotected text;
begin
  select string_agg(relname, ', ') into unprotected
    from pg_class
   where relnamespace = 'athlytica_core'::regnamespace
     and relkind = 'r' and not relrowsecurity;

  if unprotected is not null then
    raise exception 'POST-APPLY FAILED: RLS still disabled on: %', unprotected;
  end if;
  raise notice 'POST-APPLY OK: RLS enabled and forced on all four tables.';
end $$;

commit;

-- =====================================================================
-- VERIFY AFTER COMMIT
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--    where relnamespace='athlytica_core'::regnamespace and relkind='r';
--   -- expect true/true on all four
--
-- THEN RE-TEST THE ONBOARDING PATH. The SECURITY DEFINER functions are
-- the only way into this schema; if FORCE ROW LEVEL SECURITY affects
-- them in this Postgres version, registration breaks. This is the one
-- behaviour that must be observed on an isolated environment first.
--
-- ROLLBACK: 0001_rls_containment_rollback.sql
-- =====================================================================
