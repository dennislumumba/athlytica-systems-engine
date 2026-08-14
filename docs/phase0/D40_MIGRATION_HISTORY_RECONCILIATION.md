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

---

# PART II — Baseline built and verified (2026-08-15, owner-approved)

`supabase/migrations/00000000000000_baseline_pre_migrations.sql`, 59 KB,
generated by reading `pg_catalog` / `information_schema` through the MCP
connector. **Production was read-only**: no `migration repair`, no `db push`,
no `db pull`, no write to `supabase_migrations.schema_migrations`. No
historical migration was reordered, rewritten or deleted.

## 10. Object counts — baseline vs production

| Object | Production | Baseline | |
|---|---|---|---|
| Tables | 31 | **31** | ✅ |
| Columns (across all 31) | 273 | **273** | ✅ — all 31 tables match individually |
| Enum types | 16 | **16** | ✅ |
| Constraints (total) | 120 | **120** | ✅ |
| — primary keys | 31 | **31** | ✅ |
| — unique | 11 | **11** | ✅ |
| — check | 27 | **27** | ✅ |
| — foreign keys | 51 | **51** | ✅ |
| Non-constraint indexes | 23 | **23** | ✅ |
| Functions | 5 | **5** | ✅ |
| Triggers | 3 | **3** | ✅ |
| Views | 3 | **3** | ✅ |
| RLS-enabled tables | 27 | **27** | ✅ |
| `anon` grants | **0** | **0** | ✅ must stay 0 |
| RLS policies | n/a | **0** | ✅ by design — migrations own them |

Representative objects confirmed present in production and correctly
attributed: `public.athlete`, `club`, `provenance`, `guardian_contact`,
`biometric_record`, `injury_record`, `custody_record`,
`commercial_price_tier`, all four `athlytica_core.*` including
`scalable_id_sequence` → **baseline**. M2 `record_classification`, M3
`settle_payment_transaction` / `payment_events_production` /
`payment_reconciliation_exception`, M4 `payment_service_authorization`, CRM
`crm_contact` / `crm_opportunity` / `trg_crm_settlement_won`, M5
`athletes_self_read` → **migration-owned, correctly excluded**.

## 11. Two defects the verification caught

Both were in the generated baseline, and neither was findable by comparing
counts. They are recorded because they are the argument for doing the local
replay rather than trusting a catalog dump.

**(a) Primary keys are not `duplicate_object`.** Re-applying
`add constraint … PRIMARY KEY` to a table that has one raises **42P16
`invalid_table_definition`**, not 42710. The first exception handler did not
catch it, so the whole section aborted. The header's idempotency claim was
false until fixed. Caught by a rolled-back transaction against production.

**(b) A generated column read as a default.** `pg_attrdef` stores the
expression for generated columns *and* for defaults, so
`biometric_record.chronological_bone_age_delta` was emitted as
`default (age_at_measurement_years - bone_age_estimate_years)`, which fails
with **0A000 `cannot use column reference in DEFAULT expression`**. It is
`GENERATED ALWAYS AS (…) STORED` (`attgenerated = 's'`, PostgreSQL 17.6).
**Only the local replay could have caught this** — the column exists in
production with the right expression, so every count and every catalog
comparison matched. Three other generated columns exist
(`bigice_athlete.name_key`, `crm_opportunity.expected_value_kes`,
`nrhl_stat_line.points`) and all three are migration-owned, so they are
correctly outside the baseline.

## 12. `npx supabase start` — Docker now available; chain gets 10 files deep

**Docker is working** (`29.7.2`). D-35's environment blocker has been cleared
by the owner since it was reported, so this ran for real.

```
Applying migration 00000000000000_baseline_pre_migrations.sql...   ✅
Applying migration 20260709_multi_sport_junctions.sql...           ✅  ← previously the failure point
Applying migration 20260711120000_hercules_core_merge.sql...       ✅
Applying migration 20260711130000_telemetry_ingest_queue.sql...    ✅
Applying migration 20260712190000_payment_and_funnel_events.sql... ✅
Applying migration 20260712210000_registrations_and_settlement_rpc.sql... ✅
Applying migration 20260713100000_registration_sessions_v2.sql...  ✅
Applying migration 20260713110000_sec001_rls_hardening.sql...      ✅
Applying migration 20260713_cohort_telemetry_scouting_metric_log_rls.sql...  ❌
  ERROR: syntax error at or near "NOT" (SQLSTATE 42601)
  CREATE POLICY IF NOT EXISTS allow_authenticated_select_on_cohort_telemetry
```

**The baseline works. `public.athlete` now resolves and the original blocker
is gone.** The static dependency scan agrees: after the baseline, the only
FK target not created by a migration is `auth.users`, which Supabase supplies.

### The new blocker is a pre-existing defect in a historical migration

`20260713_cohort_telemetry_scouting_metric_log_rls.sql` contains **five**
`CREATE POLICY IF NOT EXISTS` statements. **PostgreSQL has never supported
`IF NOT EXISTS` on `CREATE POLICY`, in any version.** That file has never been
executable as written.

Its policy names — `allow_authenticated_select_on_cohort_telemetry`,
`allow_owner_insert_on_scouting_metric_log`,
`allow_owner_select_on_scouting_metric_log` — **do not exist in production**.
The policies those tables actually carry are `tenant_isolation_policy` and
`tenant_member_policy`, created by
`20260720100000_sec001_full_surface_rls_lockdown.sql`.

> **So this is a second, independently proven instance of the `inventory_allocation_trigger` pattern: a file recorded in the ledger, whose objects do not exist, which could not have produced them.** Part I inferred that pattern from object existence. This one is proven from the SQL itself — the file cannot parse.
>
> **It was not modified.** The brief forbids silently rewriting historical
> migrations, and it is the right call: this file is evidence.

## 13. What still cannot be reconstructed

| Item | Status |
|---|---|
| `auth.users` | Supplied by Supabase locally. Not a gap. |
| The 5 policies in `20260713_…_rls.sql` | **Unreconstructable — the SQL is invalid.** Their intended effect is superseded by `sec001`. Owner decision required (§14). |
| `inventory_allocation_trigger` objects | Recorded applied, absent from production (Part I §3b). Cannot be reproduced from production because they are not there. |
| Row data | **Deliberately excluded.** Schema only — no athlete, guardian, payment or registration row is reproduced. |
| Supabase-managed schemas (`storage`, `realtime`, `vault`, `extensions` internals) | Out of scope; the local stack provisions its own. |
| The true pre-2026-07-09 schema | **Unrecoverable.** The baseline is a snapshot of the *current* orphan objects, so replay reproduces today's schema, not history. Stated in the file header. |

## 14. Recommended next steps — NOT EXECUTED

1. **Decide `20260713_cohort_telemetry_scouting_metric_log_rls.sql`.** Three
   options, all owner decisions: (a) mark it superseded and exclude it from
   replay, (b) correct the five statements to `drop policy if exists` +
   `create policy` — a rewrite of history, which needs explicit approval, or
   (c) delete it as never-applied. **Recommendation: (a)** — it is the only
   option that keeps the file as evidence while unblocking replay.
2. **Then re-run `npx supabase start`** and take the chain to the end. Until
   it completes, the baseline is verified against production by counts and by
   ten applied migrations, but the full chain is not proven.
3. **Then D-35's FORCE RLS matrix** becomes runnable — the environment is now
   available.
4. **Only then** move M6 out of `pending/`.

## 15. Can M6 move to the applied path?

**Not yet.** The gate was "D-40 reconciled", and reconciliation is now
*substantially* done — the baseline exists, is verified against production
object-for-object, and carries the chain ten files deep — but **the chain does
not yet replay to completion**, so there is still no environment in which M6
can be tested end to end alongside the migrations that precede it. Moving it
now would put it into a chain that cannot run.

**One further reason to wait, which is D-33's own constraint:** M6 must become
the authoritative venture-plane issuer. `bigice_next_athlete_code()` still
consumes `scalable_id_sequence`. Applying M6 alone would create exactly the
mixed state the owner ruled out — NRHL allocating randomly while Big Ice
still draws from the legacy counter. **M6 and the Big Ice conversion must ship
together, or neither.**

---

## 9. What was NOT done

No `migration repair`. No `db push`. No `db pull`. No table created. No ledger
row written or deleted. No migration file renamed. Production schema, data and
the sequence (504) are untouched. Every statement above is a read.
