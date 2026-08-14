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
