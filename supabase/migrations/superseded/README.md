# Superseded migrations — excluded from replay, preserved as evidence

Files in this directory are **not** part of the migration replay path. The
Supabase CLI only reads `*.sql` directly in `supabase/migrations/`, so moving a
file here removes it from `supabase db reset` / `supabase start` without
deleting it.

**Nothing in this directory has been edited.** Each file is byte-identical to
the version that was in the replay path — git records the move as a 100%
rename. They are kept because a migration that cannot run is evidence about how
this database was actually built (D-40), and destroying it would destroy the
evidence.

**None of these files may be "fixed" and moved back without an explicit
decision.** Correcting a historical migration is a rewrite of history.

---

## `20260720095900_inventory_allocation_trigger.sql`

**Superseded 2026-08-15 · D-31 · owner-approved.**
Blob `2e6600c4d68e9809ac567a6e5ba69ed504fee553`, unchanged by the move.

### Why it is excluded

Unlike the file below, **this migration is valid SQL and applies cleanly** — it
ran without error during the D-40 clean reconstruction. It is excluded because
it is **functionally inert against the current schema**, and applying it would
put a trigger on the athlete-creation path for no behaviour.

It creates four objects:

```
table     public.inventory_waitlist_alerts
function  public.inventory_column_exists(text, text)
function  public.handle_inventory_allocation()
trigger   athlete.trg_inventory_allocation   -- AFTER INSERT ON public.athlete
```

**1. None of them exist in production**, and no `%inventory%` object exists
there beyond `commercial_inventory` and its own indexes.

**2. Nothing live depends on them.** Three independent reasons, each sufficient:

| | |
|---|---|
| `commercial_inventory` | **0 rows** — there is no stock to allocate |
| `organization_source` (read by the function off `NEW`) | **exists on no table in the database** |
| `public.athlete.skate_size` / `.protective_kit_size` | **do not exist** — and they are the input the whole mechanism keys on |

**3. It is a proven no-op.** Run in the isolated reconstruction *where all four
objects do exist*: inserting a row into `public.athlete` **succeeded and wrote
zero rows** to `inventory_waitlist_alerts`. `handle_inventory_allocation()`
returns `NEW` immediately, because `to_jsonb(NEW) ->> 'skate_size'` is NULL on a
table without that column. Verified behaviourally, not by reading.

**4. Applying it would not fix the one caller that names it.**
`app/api/v1/sessions/evaluate/route.ts` documents a stock-reservation workflow
driven by these objects. That workflow cannot work, and this migration does not
make it work — **it deliberately does not add the missing size columns**; it
detects their absence and attaches an inert INSERT-only trigger. Recorded
separately as **D-42**, which is a product decision, not a migration one.

**5. Nothing downstream breaks by excluding it.**
`20260720100000_sec001_full_surface_rls_lockdown.sql:269` lists
`inventory_waitlist_alerts` among the service-role-only tables, but guards it
with `if to_regclass('public.' || t) is null then continue`. It runs *after*
this migration and skips the absent table cleanly.

### Did these objects ever exist in production?

**UNKNOWN. No evidence exists either way**, and this is recorded as unknown
rather than inferred:

- `supabase_migrations.schema_migrations` has **no timestamp column**.
- `public.audit_log` is **empty (0 rows)** and is a domain event log, not a DDL
  trail.
- **No residue survives** — no `idx_inventory_waitlist_alerts_athlete`, no
  comment, no `pg_depend` entry.

The only indicator, and it is not proof, is that `sec001` was written to run
immediately after this migration and **already guards for the table's absence**.

Its ledger row records 6 statements with `created_by` null — the CLI-family
writer described in `D40_MIGRATION_HISTORY_RECONCILIATION.md` §2.

### What was deliberately not done

- The file was **not edited** and **not deleted**.
- **No `migration repair`** — production's ledger row for `20260720095900` is
  untouched.
- **The four objects were not created, dropped or altered in production.** They
  were absent before this decision and are absent after it.
- **D-42 was not implemented.** The sizing branch in
  `/api/v1/sessions/evaluate` is unchanged.

---

## `20260713_cohort_telemetry_scouting_metric_log_rls.sql`

**Superseded 2026-08-15 · D-41 · owner-approved.**

### Why it is excluded

**1. PostgreSQL rejects it.** The file contains **five**
`CREATE POLICY IF NOT EXISTS` statements. **`CREATE POLICY` has never accepted
`IF NOT EXISTS` in any PostgreSQL version.** Replaying it fails immediately:

```
ERROR: syntax error at or near "NOT" (SQLSTATE 42601)
At statement: 2
CREATE POLICY IF NOT EXISTS allow_authenticated_select_on_cohort_telemetry
                 ^
```

Observed on PostgreSQL 17.6 during the D-40 clean reconstruction, at the tenth
file in replay order.

**2. The policies it names do not exist in production.** Verified against the
live database:

| Policy the file declares | In production? |
|---|---|
| `allow_authenticated_select_on_cohort_telemetry` | **no** |
| `allow_owner_insert_on_scouting_metric_log` | **no** |
| `allow_owner_select_on_scouting_metric_log` | **no** |

**3. The live policies belong to `sec001`.** `public.cohort_telemetry` and
`public.scouting_metric_log` each carry `tenant_isolation_policy` and
`tenant_member_policy`, created by
[`../20260720100000_sec001_full_surface_rls_lockdown.sql`](../20260720100000_sec001_full_surface_rls_lockdown.sql).
Both tables also have `FORCE ROW LEVEL SECURITY` — the only two tables in the
database that do — and that too came from `sec001`.

**4. Therefore it cannot be treated as an executable historical migration.** It
is recorded in `supabase_migrations.schema_migrations` as applied, and it
cannot have been: the SQL does not parse, and the objects it would have created
are absent while equivalents from a different migration are present.

### What this file is evidence of

It is the **second proven instance** of the D-40 pattern — a ledger row that
does not describe the database. The first,
`20260720095900_inventory_allocation_trigger.sql`, was inferred from missing
objects (`inventory_waitlist_alerts`, `handle_inventory_allocation()`,
`inventory_column_exists()` all absent). This one is proven from the SQL
itself: it could not have run, so the ledger entry is false on its face.

Together they are the strongest available argument for two standing rules:

- **Never run `supabase migration repair`** (D-32). It rewrites the very table
  that is already known to disagree with reality.
- **Object existence, not the ledger, is the authority** on what has been
  applied (D-40 §6).

### What was deliberately not done

- The file was **not edited**. Its five invalid statements are intact.
- It was **not deleted**.
- No `supabase migration repair` was run; the production ledger still contains
  its row, untouched.
- Its intent — RLS on `cohort_telemetry` and `scouting_metric_log` — is already
  satisfied in production by `sec001`, so nothing is lost by excluding it. **If
  that ever stops being true, the fix is a new forward migration, not a
  correction to this one.**
