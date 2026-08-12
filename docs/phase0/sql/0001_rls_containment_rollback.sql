-- =====================================================================
-- 0001_rls_containment_rollback.sql
-- Reverses 0001_rls_containment.sql exactly.
--
-- STATUS: PROPOSED. Paired with the forward script; neither is applied.
--
-- WARNING — READ BEFORE RUNNING
-- This restores the state the Supabase advisor flags as CRITICAL:
-- athlytica_core becomes readable and writable by anyone holding the
-- anon key, including guardian phone numbers and birth-certificate
-- hashes for minors.
--
-- Run this ONLY if the containment migration broke a production code
-- path AND that path cannot be fixed forward within the incident window.
-- Rolling forward (adding the missing policy) is almost always correct.
--
-- Before running, record in the incident log:
--   - which code path broke
--   - the exact error
--   - why a forward fix was not possible
-- =====================================================================

begin;

-- ── 1. SAFETY CHECK ─────────────────────────────────────────────────
-- Refuse to roll back if the tables have since taken real data. Once
-- guardian PII exists, re-exposing it to anon is a disclosure event,
-- not a rollback.
do $$
declare
  n bigint;
begin
  select (select count(*) from athlytica_core.parents)
       + (select count(*) from athlytica_core.athletes)
       + (select count(*) from athlytica_core.performance_logs)
    into n;

  if n <> 0 then
    raise exception
      'ROLLBACK REFUSED: athlytica_core now holds % row(s). Reverting RLS would expose guardian/minor PII to the anon key. Fix forward instead.', n;
  end if;
end $$;


-- ── 2. DROP POLICIES ────────────────────────────────────────────────
drop policy if exists founder_read_parents           on athlytica_core.parents;
drop policy if exists founder_read_athletes          on athlytica_core.athletes;
drop policy if exists founder_read_performance_logs  on athlytica_core.performance_logs;


-- ── 3. DISABLE RLS ──────────────────────────────────────────────────
alter table athlytica_core.parents              no force row level security;
alter table athlytica_core.athletes             no force row level security;
alter table athlytica_core.performance_logs     no force row level security;
alter table athlytica_core.scalable_id_sequence no force row level security;

alter table athlytica_core.parents              disable row level security;
alter table athlytica_core.athletes             disable row level security;
alter table athlytica_core.performance_logs     disable row level security;
alter table athlytica_core.scalable_id_sequence disable row level security;


-- ── 4. RESTORE PRIOR GRANTS ─────────────────────────────────────────
-- Restores the pre-migration posture: anon and authenticated could read
-- and write these tables directly.
grant usage on schema athlytica_core to anon, authenticated;

grant all on athlytica_core.parents              to anon, authenticated;
grant all on athlytica_core.athletes             to anon, authenticated;
grant all on athlytica_core.performance_logs     to anon, authenticated;
grant all on athlytica_core.scalable_id_sequence to anon, authenticated;


-- ── 5. RE-STATE THE RISK ────────────────────────────────────────────
do $$
begin
  raise warning
    'ROLLBACK COMPLETE. athlytica_core is again fully exposed to the anon key. The Supabase advisor will re-flag rls_disabled as CRITICAL. Re-apply containment as soon as the blocking issue is resolved.';
end $$;

commit;
