# Migration Reconciliation — Phase 0.1

**Status:** AUDIT. Production migration history was **not** altered.
**Date:** 2026-08-12

---

## 1. Headline

**Not one of the 32 local migration files has a version that matches the applied
history.** 31 migrations are applied; 32 files exist locally; the names mostly
correspond but **every version prefix differs**.

| | Count |
|---|---|
| Local migration files | 32 |
| Applied migrations | 31 |
| Local files whose version matches an applied version | **0** |
| Local files whose *name* matches an applied name | 30 |
| Local files with no applied counterpart | 2 |
| Applied migrations with no local file | 1 |

---

## 2. Root cause — benign, but consequential

The applied versions cluster in tight bursts (`20260719215746`, `…215816`,
`…215831`, 15–30 seconds apart) while the local filenames use hand-picked round
timestamps (`20260711120000`, `20260711130000`).

That is the signature of **`apply_migration` via the Supabase MCP/API, which
assigns its own version timestamp at apply time**, while the local files were
authored and named by hand. The DDL is the same; only the bookkeeping diverged.

Verified against live state rather than assumed:

```sql
select pg_get_functiondef(oid) ~* 'stk_pushed_at desc nulls last'
  from pg_proc where proname = 'settle_payment_transaction';  -- true
```

The local `20260812091000_settlement_deterministic_session_match.sql`
introduces exactly that ordering. It is **live**. The file is applied; its
version is recorded as `20260811214054`.

**This is not a broken database.** It is a broken *ledger*.

---

## 3. The actual risk

`supabase db push` reconciles by **version**, not by name or content. Because
zero versions match, it would treat **all 32 local files as unapplied** and
replay every one against production.

Replay outcome, assessed file by file:

| Statement class | Guarded? | Replay result |
|---|---|---|
| `create table` | **32/32 use `if not exists`** | no-op |
| `create index` | **34/34 use `if not exists`** | no-op |
| `add column` | **27/28 use `if not exists`** | 1 error |
| `create policy` | 23/28 preceded by `drop policy if exists` | **5 errors** |
| `create or replace function` | n/a | re-runs — silently reverts any later hand-applied change |
| DML on `commercial_price_tier` | `on conflict (tier_name) do update` | idempotent |
| DML on `payment_events` / `gate_states` | `on conflict … do nothing` | idempotent |

**Two files would raise and halt the push:**

| File | Problem |
|---|---|
| `20260713_cohort_telemetry_scouting_metric_log_rls.sql` | 5 × `create policy`, 0 × `drop policy if exists` → `42710 duplicate_object` |
| `20260714_sync_monitoring.sql` | 1 of 2 `add column` unguarded → `42701 duplicate_column` |

A halt mid-push leaves the schema partially replayed with no transaction
boundary across files. That is the real hazard — not the individual errors.

The pricing DML is idempotent, so a replay would **not** corrupt tier prices.
Worth stating explicitly given `CLAUDE.md`'s rule that money is never
client-priced and tier names are a parent-facing contract.

---

## 4. Divergences

### 4.1 Local files never applied (2)

| File | Objects | Do the objects exist live? |
|---|---|---|
| `20260713_cohort_telemetry_scouting_metric_log_rls.sql` | RLS policies on `cohort_telemetry`, `scouting_metric_log` | **Yes** — both tables carry `tenant_isolation_policy` and `tenant_member_policy` |
| `20260720095900_inventory_allocation_trigger.sql` | trigger + table for `commercial_inventory` | `commercial_inventory` exists |

So both are **applied-in-effect but unrecorded** — the DDL reached production by
some other route. They are `SUPERSEDED` in practice, not pending.

### 4.2 Applied with no local file (1)

| Applied | Version |
|---|---|
| `bigice_academy_name_parity` | `20260811012454` |

Its content — realigning `commercial_price_tier.tier_name` with bigice.co.ke —
is partially present in `20260811090000_bigice_beginner_package.sql` and
`20260812090000_bigice_catalog_and_sibling_registrations.sql`, both of which
reference the same tier names. **No local file reproduces it exactly.**

This is the one genuine gap: applied schema with no local definition. If the
project were rebuilt from `supabase/migrations/`, the tier-name parity fix would
be missing — and `CLAUDE.md` records that this exact drift ("Quarterly" vs
"3-Month Development") already burned the project once, on a screen a parent
reads immediately before entering their M-Pesa PIN.

### 4.3 Malformed version strings (3)

`20260709`, `20260713`, `20260714` are 8-digit dates, not 14-digit timestamps.
The Supabase CLI expects `YYYYMMDDHHMMSS`. These sort before every other file,
which happens to be correct here, but the format is out of contract.

---

## 5. Dependency graph

```
multi_sport_junctions ──► hercules_core_merge ──► telemetry_ingest_queue
                                │
                                ├─► payment_and_funnel_events ──► registrations_and_settlement_rpc
                                │                                        │
                                │                                        ▼
                                │                              registration_sessions_v2
                                │                                        │
                                │                                        ▼
                                │                              unified_intake_checkout
                                │                                        │
                                │                                        ▼
                                │                     settlement_deterministic_session_match  ◄── HEAD (settlement)
                                │
                                ├─► sec001_rls_hardening ──► sec001_full_surface_rls_lockdown
                                │        │                            │
                                │        │                            ▼
                                │        │                   rls_helper_search_path
                                │        │                            │
                                │        ▼                            ▼
                                │   cohort_telemetry_..._rls   revoke_anon_definer_rpcs
                                │   (UNRECORDED)                      │
                                │                                     ▼
                                │                        revoke_authenticated_passport_rpc
                                │
                                ├─► workspace_rbac ──► founder_email_swap ──► user_profiles
                                │        │
                                │        └─► tta_workspace
                                │
                                ├─► nrhl_league ──► nrhl_league_single_id_issuer ──► nrhl_guardian_link_rpc
                                │                            │
                                │                            └── writes athlytica_core.scalable_id_sequence
                                │
                                └─► bigice_beginner_package ──► [bigice_academy_name_parity: NO LOCAL FILE]
                                              │
                                              ▼
                                    bigice_athlete_plane ──► bigice_passport_bridge
                                              │                      │
                                              │                      ▼
                                              │             bigice_guardian_hash ──► bigice_document
                                              │
                                              ▼
                                bigice_catalog_and_sibling_registrations  ◄── HEAD (catalog)
```

Three convergence points matter for Phase 1:

- **`nrhl_league_single_id_issuer`** is where the shared `scalable_id_sequence`
  became the ID source for both ventures. The canonical `athlytica_id_seq`
  supersedes it.
- **`sec001_full_surface_rls_lockdown`** covered `public` but not
  `athlytica_core` — which is exactly the gap `0001_rls_containment.sql` closes.
- **`settlement_deterministic_session_match`** is the settlement HEAD. Any
  future change to `settle_payment_transaction` must branch from it, not from
  `registration_sessions_v2`.

---

## 6. Per-migration register

Abbreviated; full DDL is in each file. `A` = applied, `U` = unrecorded.

| Local version | Name | Applied as | Tables | Fn | RLS | Status |
|---|---|---|---|---|---|---|
| 20260709 | multi_sport_junctions | 20260719215746 | 3 | – | – | A |
| 20260711120000 | hercules_core_merge | 20260719215816 | 7 | – | – | A |
| 20260711130000 | telemetry_ingest_queue | 20260719215831 | 1 | – | – | A |
| 20260712190000 | payment_and_funnel_events | 20260719215844 | 2 | – | – | A |
| 20260712210000 | registrations_and_settlement_rpc | 20260719215903 | 2 | ✓ | – | A |
| 20260713100000 | registration_sessions_v2 | 20260719215927 | – | ✓ | – | A |
| 20260713110000 | sec001_rls_hardening | 20260719215946 | 2 | – | 5 | A |
| 20260713 | cohort_telemetry_..._rls | — | – | – | 5 | **U** |
| 20260714090000 | passport_longitudinal_rpc | 20260719220008 | – | ✓ | – | A |
| 20260714 | sync_monitoring | 20260719220022 | 1 | – | – | A |
| 20260720095900 | inventory_allocation_trigger | — | 1 | ✓ | – | **U** |
| 20260720100000 | sec001_full_surface_rls_lockdown | 20260726014250 | – | – | 8 | A |
| 20260725120000 | unified_intake_checkout | 20260725101250 | – | ✓ | – | A |
| 20260725150000 | enterprise_tier | 20260725202917 | – | – | – | A |
| 20260725160000 | admissions_intakes | 20260725204143 | 1 | – | – | A |
| 20260726120000 | workspace_rbac | 20260726000746 | 1 | ✓ | 2 | A |
| 20260726140000 | founder_email_swap | 20260726004628 | – | ✓ | – | A |
| 20260726160000 | rls_helper_search_path | 20260726014455 | – | ✓ | – | A |
| 20260726180000 | revoke_anon_definer_rpcs | 20260726015358 | – | – | – | A |
| 20260726200000 | revoke_authenticated_passport_rpc | 20260726023542 | – | – | – | A |
| 20260727120000 | tta_workspace | 20260727170347 | – | – | – | A |
| 20260728120000 | nrhl_league | 20260728010214 | 4 | – | – | A |
| 20260728130000 | nrhl_league_single_id_issuer | 20260728010526 | – | ✓ | – | A |
| 20260728140000 | nrhl_guardian_link_rpc | 20260728010735 | – | ✓ | – | A |
| 20260728150000 | user_profiles | 20260728121327 | 1 | ✓ | 3 | A |
| 20260811090000 | bigice_beginner_package | 20260811012411 | – | – | – | A |
| — | **bigice_academy_name_parity** | 20260811012454 | – | – | – | **no local file** |
| 20260811120000 | bigice_athlete_plane | 20260811094333 | 2 | ✓ | – | A |
| 20260811130000 | bigice_passport_bridge | 20260811094558 | – | – | – | A |
| 20260811140000 | bigice_guardian_hash | 20260811100007 | – | – | – | A |
| 20260811150000 | bigice_document | 20260811102121 | 1 | – | – | A |
| 20260812090000 | bigice_catalog_and_sibling_registrations | 20260811214027 | – | ✓ | – | A |
| 20260812091000 | settlement_deterministic_session_match | 20260811214054 | – | ✓ | – | A |

---

## 7. Recommended remediation — not executed

**Do not repair by editing `supabase_migrations.schema_migrations`** in this
phase. §C says production migration history is not to be altered here.

Options, for decision **D-16**:

| Option | Consequence |
|---|---|
| **A. Rename local files to the applied versions (recommended)** | Repo becomes the truth. `db push` becomes a no-op. Pure file rename; touches no database. Reversible via git. |
| B. Insert the local versions into `schema_migrations` as already-applied | Alters production history — out of scope here, and it would leave two version numbers per migration forever. |
| C. Squash into a single baseline | Loses per-change provenance, which this system needs more than most. |
| D. Do nothing | The first `supabase db push` replays 32 migrations and halts on the sixth. |

**Recommended: A**, plus write a `bigice_academy_name_parity` file from the live
schema so the repo can rebuild production, plus add `if not exists` /
`drop policy if exists` guards to the two unguarded files.

**Standing rule until D-16 closes: do not run `supabase db push`.** Apply
migrations only through the reviewed, individually-versioned path.
