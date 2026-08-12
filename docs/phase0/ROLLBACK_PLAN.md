# Rollback Plan — Phase 0

**Status:** PLAN. Nothing has been applied, so nothing currently needs rolling back.
**Date:** 2026-08-12

---

## 1. Rollback posture

**Roll forward by default.** A missing RLS policy is fixed by adding the
policy, not by disabling RLS. Rollback is for the case where a production path
is broken and cannot be fixed inside the incident window.

Every rollback here is **reversible and non-destructive**: it restores access
or removes structures. **No rollback in this plan deletes athlete data**, and
two of them actively refuse to run if data is present.

---

## 2. Rollback units

| Change type | Unit | Mechanism |
|---|---|---|
| Schema (DDL) | one numbered migration | paired `_rollback.sql` |
| Data load | one `import_batch_id` | `delete … where import_batch_id = :id` |
| Identity merge | one merge event | clear `merged_into_uid`, restore `identity_status` |
| ID issuance | one `athlytica_id` | **never reclaimed** — see §6 |
| Derived scores | whole derived layer | `TRUNCATE` + recompute |

---

## 3. Rollback 0001 — RLS containment

**Script:** `sql/0001_rls_containment_rollback.sql`

| | |
|---|---|
| Reverses | RLS enable + force, 3 founder-read policies, grant changes |
| Data touched | **none** |
| Duration | < 1 second |
| Reversible | yes — re-apply the forward script |

### It refuses to run if the tables hold data

```sql
if n <> 0 then
  raise exception 'ROLLBACK REFUSED: athlytica_core now holds % row(s). Reverting RLS
    would expose guardian/minor PII to the anon key. Fix forward instead.', n;
end if;
```

This is deliberate. Rolling back RLS on empty tables restores a bad-but-inert
state. Rolling it back on tables holding guardian phone numbers and a minor's
birth-certificate hash is **a disclosure event**, not a rollback. The script
will not do it.

### When rollback is correct

Only if the containment breaks a production path AND a forward fix is not
possible in the window. Before running, record: which path broke, the exact
error, and why forward was not possible.

### When it is not

- "The advisor still shows a warning" → wrong warning, or the advisor is stale.
- "A query returns 0 rows" → that is RLS working. Add the policy.
- "Registration failed" → check whether the failing call is `SECURITY DEFINER`.
  `link_guardian()` bypasses RLS and should be unaffected; if it broke, the
  cause is the `REVOKE`, and the fix is a targeted `GRANT`.

---

## 4. Rollback: canonical schema (Phase 1)

**Script:** `sql/0002_canonical_schema_rollback.sql` *(written in Phase 1)*

Drops, in dependency order: `observation`, `enrollment`,
`athlete_organization_membership`, `parent_athlete_link`,
`athlete_identifier`, `athlete`, `organization`, `source_document`,
`import_batch`, `normalization_rule`, `vocabulary_map`, `source_header_map`,
plus `athlytica_id_seq` and the helper functions.

Safe **only** while the tables are empty, which is guaranteed because Phase 1
creates structures and Phase 7 is the first load. A guard mirrors §3:

```sql
-- refuse if any canonical table holds rows
if (select count(*) from athlytica_core.athlete) <> 0 then
  raise exception 'ROLLBACK REFUSED: canonical athlete table is populated.
    Use per-batch rollback (§5) instead of dropping the schema.';
end if;
```

Nothing in `public` is touched, so `public.athlete`, `public.athletes`,
`registrations`, `payment_events` and every existing dashboard survive a full
schema rollback untouched.

---

## 5. Rollback: a data load (Phase 7)

The unit is the batch.

```sql
begin;

-- 1. Confirm the batch and its scope
select import_batch_id, mode, started_at, rows_loaded
  from athlytica_core.import_batch where import_batch_id = :id;

-- 2. Derived layer first (it references observations)
delete from athlytica_core.dimension_score  where import_batch_id = :id;
delete from athlytica_core.metric_score     where import_batch_id = :id;

-- 3. Observations. Requires the immutability trigger to be lifted for
--    this transaction — see the note below.
delete from athlytica_core.observation      where import_batch_id = :id;

-- 4. Structures created by the batch
delete from athlytica_core.enrollment       where import_batch_id = :id;
delete from athlytica_core.athlete_organization_membership where import_batch_id = :id;

-- 5. Mark the batch
update athlytica_core.import_batch
   set status = 'ROLLED_BACK', note = :reason
 where import_batch_id = :id;

commit;
```

### The immutability tension, resolved

`observation` has a `BEFORE UPDATE OR DELETE` trigger that raises. That is what
makes it immutable — and it also blocks rollback.

Resolution: a `SECURITY DEFINER` function that disables the trigger **for one
batch inside one transaction**, and is itself audited:

```sql
create or replace function athlytica_core.rollback_import_batch(p_batch uuid, p_reason text)
returns bigint
language plpgsql
security definer
set search_path to 'athlytica_core','public','pg_temp'
as $$
declare n bigint;
begin
  if p_reason is null or length(trim(p_reason)) < 10 then
    raise exception 'rollback_import_batch requires a reason of at least 10 characters';
  end if;

  insert into public.audit_log (event_type, actor_id, record_type, record_id, event_hash, payload_snapshot)
  values ('record_revoked', auth.uid(), 'import_batch', p_batch,
          encode(digest(p_batch::text || p_reason || now()::text, 'sha256'), 'hex'),
          jsonb_build_object('reason', p_reason));

  alter table athlytica_core.observation disable trigger observation_immutable;
  delete from athlytica_core.observation where import_batch_id = p_batch;
  get diagnostics n = row_count;
  alter table athlytica_core.observation enable trigger observation_immutable;

  update athlytica_core.import_batch
     set status = 'ROLLED_BACK', note = p_reason
   where import_batch_id = p_batch;

  return n;
end $$;

revoke execute on function athlytica_core.rollback_import_batch(uuid, text) from public, anon, authenticated;
```

Properties: the only deletion path, requires a stated reason, writes to the
hash-chained `audit_log` **before** deleting, re-arms the trigger in the same
transaction, and is not executable by any client role.

**Immutability is preserved for every actor except an audited operator rolling
back a whole named batch.** That is the correct trade: the alternative is an
unrecoverable bad load.

---

## 6. `athlytica_id` is never reclaimed

If a batch that issued IDs is rolled back, the **IDs are not returned to the
sequence.**

Reason: an `athlytica_id` may already have been printed on a Performance ID
PDF, emailed to a parent, or quoted in support. Reissuing it to a different
child would create two humans with the same permanent identifier at different
points in time — the one failure mode the ID design exists to prevent.

Rolled-back IDs are recorded as burned:

```sql
insert into athlytica_core.athlytica_id_burned (athlytica_id, burned_at, reason, import_batch_id)
select athlytica_id, now(), :reason, :batch
  from athlytica_core.athlete where import_batch_id = :batch and athlytica_id is not null;
```

Gaps in the sequence are expected and carry no meaning. That is a feature — the
ID is opaque, so a gap reveals nothing.

---

## 7. Rollback: an identity merge

Merges are tombstones, so reversal restores state rather than recreating rows:

```sql
update athlytica_core.athlete
   set merged_into_uid = null,
       identity_status = 'CONTESTED'
 where athlete_uid = :merged_away_uid;
```

Observations re-pointed during the merge are restored from
`athlete_identifier.notes`, which records the pre-merge `athlete_uid` for every
moved row. **A merge that does not record what it moved cannot be reversed** —
so recording it is part of the merge, not part of the rollback.

---

## 8. What cannot be rolled back

Honest list.

| Not reversible | Why | Mitigation |
|---|---|---|
| A published `athlytica_id` | It exists on paper and in inboxes | never reclaim (§6) |
| Disclosure via an RLS rollback on populated tables | Data seen cannot be unseen | rollback **refuses** to run (§3) |
| A source CSV edited in place | The original is gone | sources are copied read-only and MD5'd; never edited |
| A parent-facing certificate already awarded from `NRHL-COMP-v1` | Already communicated | fix forward, version the rule, do not restate history |

---

## 9. Verification after any rollback

```sql
-- Batch is closed
select status from athlytica_core.import_batch where import_batch_id = :id;
-- expect ROLLED_BACK

-- No orphans
select count(*) from athlytica_core.observation where import_batch_id = :id;
-- expect 0

-- Immutability re-armed
select tgenabled from pg_trigger
 where tgname = 'observation_immutable'
   and tgrelid = 'athlytica_core.observation'::regclass;
-- expect 'O'

-- RLS still on
select relname, relrowsecurity, relforcerowsecurity from pg_class
 where relnamespace = 'athlytica_core'::regnamespace and relkind = 'r';
-- expect true/true

-- Audit trail exists
select count(*) from public.audit_log
 where record_type = 'import_batch' and record_id = :id;
-- expect >= 1
```

A rollback that leaves the immutability trigger disabled or RLS off is a failed
rollback, not a completed one.
