# Migration Runbook — Phase 0

**Status:** RUNBOOK. **Phase 0 has not been executed against production.**
**Date:** 2026-08-12

> **Stop condition.** This runbook may not be executed past step 0.4 until the
> eleven items in `DECISION_REGISTER.md` marked *approval required* are
> approved. Nothing below step 0.4 has been run.

---

## 0. Phase 0 — containment (the only steps in scope now)

| # | Step | State |
|---|---|---|
| 0.1 | Read-only audit of Supabase, repo and legacy corpus | **DONE** |
| 0.2 | Read protocol documents; reconcile metric registry to V2 | **DONE** |
| 0.3 | Produce specs, decision register, migration + rollback scripts | **DONE** |
| 0.4 | Apply RLS containment (`0001_rls_containment.sql`) | **HELD — needs D-01** |
| 0.5 | Freeze `normalize-legacy-ids.js`; correct the `convexAdapter` message | **HELD — needs D-05** |
| 0.6 | Copy source CSVs to `data/legacy/` read-only with MD5s | **HELD — needs D-04** |

### 0.4 — applying RLS containment

Prerequisite: **D-01 approved.**

```bash
# 1. Create an isolated branch. NEVER run first against production.
#    (Supabase branches are a paid resource — create only with approval.)

# 2. Pre-flight, on the branch. All must return 0 / 500.
```
```sql
select count(*) from athlytica_core.parents;             -- expect 0
select count(*) from athlytica_core.athletes;            -- expect 0
select count(*) from athlytica_core.performance_logs;    -- expect 0
select current_value from athlytica_core.scalable_id_sequence;  -- expect 500
```
```bash
# 3. Apply on the branch. The script self-aborts if pre-flight fails.
#    Then run tests/rls-policy.test.mts (R1-R12 in RLS_POLICY_MATRIX.md §8).
# 4. Smoke-test registration and the parent portal against the branch.
# 5. Only then apply to production, in a low-traffic window.
# 6. Re-run the Supabase advisor; confirm `rls_disabled` is cleared.
```

Rollback: `0001_rls_containment_rollback.sql`. It **refuses to run** if the
tables have taken data — see `ROLLBACK_PLAN.md` §3.

---

## 1. Environment rule

**All schema work happens on a Supabase branch or an isolated dev database.**
No DDL is executed against production until it has been applied, tested and
rolled back at least once on a branch.

> A Supabase branch is a **billable resource**. It is not created as part of
> this phase. Creating one requires explicit approval — it is listed as a
> prerequisite, not an action taken.

Every migration ships as a matched pair:

```
docs/phase0/sql/NNNN_name.sql
docs/phase0/sql/NNNN_name_rollback.sql
```

A migration without a tested rollback does not get applied.

---

## 2. Re-export the authoritative source (Phase 1 — gate G2)

Prerequisite: **D-04 approved.**

Source: Google Sheets workbook `Athlytica Data`,
id `1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss`, **16 tabs**.

**Hazards — both confirmed, both must be defended against:**

1. `gviz` **silently returns the first tab** when a sheet name does not match.
   It does not error. A control request for a nonexistent tab returned the same
   92-row `RAW DATA INPUT 2020` payload as legitimate requests. Any pipeline
   that trusts a `gviz` response without checking will ingest 2020 inline
   skating data and report success.
2. `gviz` **truncates mid-row** on large payloads.

Procedure:

1. Enumerate real tab names from the rendered document first.
2. Export all 16 tabs in **one session**, same timestamp.
3. For each response, **assert on a known column** of that specific tab before
   accepting it.
4. Record `md5`, `byte_size`, `row_count` into `source_document`.
5. Mark exactly one document per logical tab `AUTHORITATIVE`.
6. Mark the 23 existing local copies `SUPERSEDED`. **Do not delete them.**

Four tabs are absent locally and must be recovered:
`Certificate Tracker` (holds `NRHL-COMP-v1` and the certificate tiers),
`Roller Hockey Parent Report`, `Parent_Report`, `Award_Generator`.

Also register as sources: the 11 Parent Audit PDFs, the Riverside capture sheet,
and the Benson Mbatia Performance ID PDFs.

**Exit gate:** every logical tab has exactly one `AUTHORITATIVE` document, or
migration does not proceed.

---

## 3. Phase sequence

Each phase has an exit gate. A failed gate stops the run; it does not warn.

| Phase | Work | Exit gate | Blocked by |
|---|---|---|---|
| **1** | Canonical schema on a branch. Seed `organization`, `discipline`, `metric_registry` v2, `vocabulary_map`. | Schema tests pass; **zero writes to production** | D-01 |
| **2** | Re-export; register `source_document`; build `source_header_map` per file | One `AUTHORITATIVE` doc per tab | **D-04** |
| **3** | Stage all-text into `stage.*` | `rows_staged` reconciles to `source_document.row_count` **exactly** | — |
| **4** | Validate → `data_quality_issue`. Nothing rejected, everything labelled. | Every issue in the register reproduced automatically | — |
| **5** | Identity resolution. Human adjudication of Class 1/3. | Zero `UNRESOLVED` in Class 1; ambiguous names load unattributed | D-02, D-06, D-08 |
| **6** | Issue `athlytica_id` in random order; populate `athlete_identifier` | Every legacy code has a ledger row; zero numeric collisions | — |
| **7** | Load **raw observations only. No scores.** | `observation` count = validated stage count | D-03, D-07, D-11 |
| **8** | Reconcile against `Athlete Progress`, `Dashboard`, Parent Audit PDFs | Recomputed figures explain every published figure, or the diff is documented | — |
| **9** | Compute derived layer | Truncate-and-recompute is byte-identical | D-09, D-10, D-14 |
| **10** | Projections: passport, `nrhl_athlete`, `bigice_athlete` as views | No dashboard reads a base table | — |
| **11** | Cutover. Mark legacy tables read-only. | Single canonical athlete root | D-15 |

**Phases 7 and 9 must not be merged.** If a score is written before the Phase 8
reconciliation gate passes, the raw/derived separation has already failed.

---

## 4. Batch discipline

Every load runs under one `import_batch`:

```sql
insert into athlytica_core.import_batch
  (mode, ruleset_version, operator, git_sha)
values ('DRY_RUN', 'v2.0', :operator, :git_sha)
returning import_batch_id;
```

Rules:

1. **`DRY_RUN` is the default.** `EXECUTE` requires an explicit flag.
2. Every loaded row carries `import_batch_id`. That is the rollback unit.
3. One transaction per source file. A file loads completely or not at all.
4. `rows_read`, `rows_staged`, `rows_loaded`, `rows_quarantined` recorded per
   batch and must reconcile: `loaded + quarantined = staged`.
5. Re-running `DRY_RUN` after `EXECUTE` must report **zero new rows**
   (idempotence, assertion L8).

---

## 5. Reconciliation targets (Phase 8)

Recomputed values must explain the published ones, or the difference must be
documented. These are the known anchors:

| Target | Expected | Source |
|---|---|---|
| `DV_NRHL_POINTS` per athlete | 94/94 fixture records reconcile | dossier §2A.3 |
| `assisted + solo == total_goals` | 94/94 | dossier §2A.3 |
| Noel Inoue points | **124** (not 58) | all three sources agree |
| Benson Mbatia legacy ID | `ATH-043` | CSV **and** shipped Performance ID PDF |
| `DV_NRHL_COMPOSITE` | 18/18, max residual 0.048 | dossier §2A.4 |
| Noel Inoue composite | 100.0 + 20×4.000 + 124 = **304.00** | dossier §2A.4 |
| `TC_*` ordinal distributions | 383 obs each; Low COG 21/86/173/90/13 | measured this phase |
| `DV_TECHNICAL_PRECISION` | `4 − 2×breaks`, 265/265 | measured this phase |
| Athlete count | **must state its scope** — 18 (Dashboard) vs 31 (stats CSV) vs 209 (session corpus) are different denominators | DQ-043 |

The athlete-count row is a genuine trap: three published numbers, three
different scopes, none of which declares its scope. No count ships without one.

---

## 6. Abort conditions

Stop the run immediately if any of these occur:

- A source header is not in `source_header_map`.
- A `vocabulary_map` lookup returns `NULL canonical_code`.
- `rows_loaded + rows_quarantined ≠ rows_staged`.
- Any `observation` would be written with a NULL `provenance_id`,
  `source_file` or `import_batch_id`.
- Any `athlytica_id` numeric part collides with a legacy identifier's.
- `scalable_id_sequence.current_value` has moved.
- A derived value is about to be written before Phase 8 passes.
- A merge would be applied to a pair not marked `CONFIRMED_SAME`.

Each is a defect in the plan, not a data problem to work around.

---

## 7. What this runbook must never do

- Migrate from a `SOURCE_CANDIDATE` document.
- Choose between `2021.csv` and `2021(1).csv` by size, date or heuristic.
- Merge athletes on identifier collision or name similarity.
- Attribute an observation to an athlete resolved only from a bare first name.
- Guess a day/month order for an undecidable date.
- Write 0 where a source said `#REF!`, `#VALUE!` or "Didn't manage to take the speed".
- Classify `Foundational Skating` as ice or inline.
- Force the 109 unassigned rows into Big Ice or NRHL.
- Issue an `athlytica_id` before identity resolution completes.
- Advance `athlytica_core.scalable_id_sequence`.
- Back-apply the 12 NRHL teams to 2023–2026 sessions.
- Migrate `Kids Group`, `Dennis`, or `Tobu (Parent)` as athletes.
- Change registration, pricing, M-Pesa, onboarding or portal behaviour.

---

## 8. Test fixtures required before Phase 3

| Fixture | Purpose |
|---|---|
| `fixtures/session_2020_sample.csv` | trailing-space header, `TRUE`/`FALSE` booleans |
| `fixtures/session_2022_sample.csv` | backslash header, `#REF!`, `YES`/`NO` |
| `fixtures/session_2026_sample.csv` | `°` coords, `#VALUE!`, free-text dash, group session with duplicate `Session_ID` |
| `fixtures/dates_ambiguous.csv` | both-parts-≤12, mid-file convention change, all 4 impossible dates |
| `fixtures/identity_collisions.csv` | `ATH-047` two humans; `ATH-006`/`ATH-566` one human; `ATL-020` typo |
| `fixtures/names_ambiguous.csv` | bare `Eli`, bare `Leon`, `Dennis(Me)`, `Tobu (Parent)`, `Kids Group` |
| `fixtures/scrimmage_tracker_sample.csv` | captain-named teams, `_` vs `-` scores, `50` vs `50 min` |

Each fixture asserts the **absence** of a wrong behaviour as much as the
presence of a right one — e.g. the ambiguous-name fixture asserts that bare
`Eli` resolves to **no** athlete.
