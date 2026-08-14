# D-40 — Migration History Reconciliation

**Phase:** 0.4 · **Date:** 2026-08-15 · **Read-only. Nothing was changed.**
No `migration repair`, no `db push`, no table creation, no ledger write.

---

## Executive answer

**The `supabase/migrations` directory has never been the origin of this
database, and cannot rebuild it.**

**31 of 67 production tables (46%) have no creating migration** — including
`public.athlete`, which is the anchor of the entire passport plane and is
FK-referenced by the *first* file in replay order. A clean database therefore
fails at line 3 of file 1. That is not a defect in `20260709_multi_sport_junctions.sql`;
it is the migration directory being a **partial additive overlay** on a schema
that was built by some other means.

**Separately and more seriously: the production ledger was rewritten between
2026-08-13 and 2026-08-15.** The 0.3L snapshot and today's reading are different
data from the same table, read with the same tool.

---

## 1. Local migration files — VERIFIED

**38 files**, all `supabase/migrations/*.sql`, all unique names, no duplicates.
Between them they contain `CREATE TABLE` for **37 tables**.

## 2. `supabase_migrations.schema_migrations` — VERIFIED

**38 rows.** Every version string matches a local filename version exactly.
Columns: `version, statements, name, created_by, idempotency_key, rollback`.

**Two distinct writers, distinguishable by `created_by`:**

| Writer | Rows | `created_by` | Statements per row | Line endings |
|---|---|---|---|---|
| CLI family (`db push` / `db pull` / history reconcile) | **32** | `(null)` | 6–9 (file split into statements) | CRLF on the older files |
| MCP `apply_migration` | **6** | `dennislumush@gmail.com` | 1 (whole body) | LF |

The 6 MCP rows are exactly M2, M3, M4, `crm_core`, `crm_sales_ops_role`, M5.
`32 + 6 = 38` = the local file count. **The CLI writer inserted precisely the
set of local files that MCP had not already recorded.**

`idempotency_key`: 0 rows. `rollback`: 0 rows. Neither column is in use.

## 3. Production objects vs. what the migrations create — VERIFIED

| | Count |
|---|---|
| Production base tables (`public` + `athlytica_core`) | **67** |
| Tables any local migration creates | **37** |
| **In production with NO creating migration** | **31** |
| **Created by a migration but ABSENT from production** | **1** |

### 3a. The 31 tables no migration creates

```
athlete                  ← the passport-plane anchor
provenance               guardian_contact         biometric_record
injury_record            custody_record           metric_value
performance_record       sport_profile            cohort_session_registry
representation_claim     transfer_event           digital_product_ledger
commercial_inventory     commercial_price_tier    competition_event
metric_registry          audit_log                google_form_submission_log
agency                   agent                    club
federation               division                 division_scoring_rule
discipline_taxonomy      sport_taxonomy

athlytica_core.athletes  athlytica_core.parents
athlytica_core.performance_logs   athlytica_core.scalable_id_sequence
```

This is not a fringe set. It is the athlete record, its provenance, its
guardians, its medical history, its metrics, the commercial catalogue, and the
**entire `athlytica_core` schema** — which holds `scalable_id_sequence`, the
object at the centre of R4.

### 3b. The one table a migration creates that does not exist

`public.inventory_waitlist_alerts` ← `20260720095900_inventory_allocation_trigger.sql`.

Also absent: `handle_inventory_allocation()`, `inventory_column_exists()`.
The row **is** in the ledger, with **6 statements recorded**, `created_by` null.

**So the ledger records an application whose objects do not exist.** Two
candidate explanations, and the evidence does not separate them:

- the statements were recorded without being executed (a history-reconcile
  flow inserts rows without running DDL), or
- they ran and the objects were dropped afterwards.

**Cause: UNKNOWN.** There is no timestamp column on `schema_migrations` and no
DDL audit trail to settle it.

*(This corrects D-31 twice over. 0.3L said "never applied", inferred from a
stale ledger reading and from looking for triggers on `commercial_inventory` —
the wrong table. The migration targets `public.athlete`, and deliberately skips
attaching its trigger when `skate_size`/`protective_kit_size` are absent, which
they are. The decisive test is object existence, and all three objects are
missing.)*

## 4. Dependency analysis — why a clean database cannot replay

Scanning every `REFERENCES <table>` in the 38 files and subtracting the tables
those files create leaves **five phantom dependencies**:

| Referenced table | Created by any migration? | First referenced in | Files affected |
|---|---|---|---|
| **`public.athlete`** | ❌ **no** | **`20260709_multi_sport_junctions.sql`** ← *file 1* | **5** |
| `athlytica_core.athletes` | ❌ no | `20260728130000_nrhl_league_single_id_issuer.sql` | 2 |
| `athlytica_core.parents` | ❌ no | `20260728130000_nrhl_league_single_id_issuer.sql` | 2 |
| `public.club` | ❌ no | `20260812221912_crm_core.sql` | 1 |
| `auth.users` | n/a — supplied by Supabase | `20260726120000_workspace_rbac.sql` | 3 |

Only `auth.users` is legitimately external. The other four are project tables
with no origin in the repository.

### The exact failure

`20260709_multi_sport_junctions.sql` is **first in lexical replay order**, and
its **third line** is:

```sql
CREATE TABLE IF NOT EXISTS public.athlete_sports (
    athlete_sport_id BIGSERIAL PRIMARY KEY,
    athlete_id UUID NOT NULL REFERENCES public.athlete(athlete_id) ON DELETE CASCADE,
```

`IF NOT EXISTS` guards the table being created, **not the table being
referenced**. Against an empty database Postgres raises
`relation "public.athlete" does not exist` and the replay stops.

> **The reported `npx supabase start` failure is the expected and correct
> behaviour of a consistent tool against an inconsistent history.** It is
> evidence for D-40, exactly as characterised. It is **not** a migration to
> repair, and creating `public.athlete` by hand to get past it would convert an
> honest failure into a schema that merely resembles production.

**No local migration creates `public.athlete`** — verified by scanning all 38
files for `create table … athlete`. The only matches are `nrhl_athlete`
(`20260728120000`) and `bigice_athlete` (`20260811120000`), both distinct
tables. `public.athlete` predates every file in the directory.

## 5. The ledger was rewritten — VERIFIED by comparison

The same tool (`list_migrations`), same project, two readings:

| | **0.3L — 2026-08-13** | **Today — 2026-08-15** |
|---|---|---|
| Rows | **36** | **38** |
| `multi_sport_junctions` version | `20260719215746` | **`20260709`** |
| `hercules_core_merge` version | `20260719215816` | **`20260711120000`** |
| `sync_monitoring` version | `20260719220022` | **`20260714`** |
| `bigice_academy_name_parity` | **present** | **absent** |
| `20260713 cohort_telemetry…rls` | absent | **present** |
| `20260720095900 inventory_allocation_trigger` | absent | **present** |
| Version scheme | wall-clock stamps | **local filename versions** |

The 0.3L reading is preserved verbatim in
[`ATHLYTICA_FOUNDATION_0_3L_REPORT.md`](ATHLYTICA_FOUNDATION_0_3L_REPORT.md) §7
and in the `dbcaecc` commit. **This is not a tool discrepancy — the underlying
table changed.**

### What was lost, and what survived

`bigice_academy_name_parity` was recorded as applied on 2026-08-13 and is no
longer in the ledger. **Its effect survives**: `commercial_price_tier` still
carries the realigned academy names —

```
12-Month Development | 3-Month Development | 6-Month Development | Beginner Skating Programme
```

— which is precisely what CLAUDE.md records that migration as having fixed
("Quarterly" → "3-Month Development"). **So the database still has the work and
no longer has the record of it.** R7 ("applied with no local file") is not
reproducible today, not because it was wrong, but because the row it described
has been deleted.

### Most probable cause

A **`supabase db pull` / link-and-reconcile flow**, which rewrites the remote
history table to mirror the local `supabase/migrations` directory. This fits
every observation: 32 rows appear bearing local filename versions and null
`created_by`; the 6 MCP rows are untouched; rows not corresponding to a local
file are removed. Commit `307bacb`'s own message — *"chore(migrations): snapshot
before supabase pull"* — states the intent.

**D-32 warned about exactly this and it has now happened.** Recorded as
**probable, not proven**: there is no audit trail, and this is a reconstruction
from state, not an observation of the act.

## 6. What the ledger is now worth

**It asserts that the local directory has been applied to production. That
assertion is false**, in both directions:

- **31 of 67 tables** were never created by anything in the directory, so the
  directory could not have built this database;
- **`inventory_allocation_trigger`** is recorded applied with its objects absent;
- and the row that documented a real, surviving change
  (`bigice_academy_name_parity`) has been deleted.

> **The ledger now describes the repository, not the database.**

**Therefore: 0.3L's D-16 arithmetic is withdrawn and must not be replaced by
today's numbers either.** Both are readings of a table that does not describe
the schema. The only witness that cannot be back-dated is **whether the objects
exist**, and §3 is the first measurement taken against that witness.

## 7. Recommended reconciliation — NOT EXECUTED

Ordered, non-destructive, no history rewriting.

1. **Freeze the ledger as evidence, not as truth.** Snapshot
   `schema_migrations` (all six columns) into a committed file, dated. It is now
   the only copy of the current state, and the previous state exists only in
   `dbcaecc`.
2. **Adopt object existence as the authority.** §3's table is the baseline. Any
   future claim that a migration is applied must be checked against the objects
   it creates, not against the ledger.
3. **Generate a genuine baseline migration** for the 31 orphan tables by
   dumping the *live* schema — `supabase db dump --schema public,athlytica_core
   --data-only=false`, which **reads only**. File it as
   `00000000000000_baseline_pre_migrations.sql`, marked *reconstructed from
   production, never to be replayed against production*. With it in place, a
   clean database can replay the chain, `npx supabase start` works, and **D-35
   becomes unblocked in the local environment**.
4. **Resolve `inventory_allocation_trigger`** (D-31) once, explicitly: apply it
   or delete both the file and the row, with the decision recorded.
5. **Re-file `bigice_academy_name_parity`** as a local file reconstructed from
   the live `commercial_price_tier` state, so the surviving change regains a
   record.
6. **Never run `supabase migration repair`.** It writes this table, and this
   table is now the least reliable object in the project. **D-32 stands and is
   reinforced.**

**Step 3 is the one that matters**, and it is the cheapest: it is a read of
production and a new file. It does not touch the ledger, does not touch
production, and it converts the migration directory from a partial overlay into
something that can actually rebuild the database.

## 8. Consequences for other decisions

| Decision | Effect |
|---|---|
| **D-16** (migration drift) | **Numbers withdrawn.** Reframed: the issue is not version drift but that the directory cannot build the schema. Supersedes the 5/30/1/2 arithmetic. |
| **R5** (`db push` would replay 32 and halt on the 6th) | **Restated and worse.** It would halt on the **1st**, at `public.athlete`. The prohibition stands, more firmly. |
| **R7** (`bigice_academy_name_parity` with no local file) | **Not reproducible** — the row was deleted. The underlying concern (a production change with no source) is now generalised to all 31 orphan tables. |
| **D-31** (`inventory_allocation_trigger`) | **Corrected twice.** It is in the ledger; its objects do not exist; it never targeted `commercial_inventory`. |
| **D-32** (do not run `migration repair`) | **Reinforced — the predicted event appears to have occurred.** |
| **D-35** (isolated Postgres) | **The blocker is now understood and is fixable without elevation.** Step 3 makes local replay possible; WSL is still required for Docker itself. |
| **D-33** (Option C) | **Unaffected.** Option C touches issuer functions only, creates no table, and depends on no phantom. Safe to design and test against production behaviour. |

## 9. What was NOT done

No `migration repair`. No `db push`. No `db pull`. No table created. No ledger
row written or deleted. No migration file renamed. Production schema, data and
the sequence (504) are untouched. Every statement above is a read.
