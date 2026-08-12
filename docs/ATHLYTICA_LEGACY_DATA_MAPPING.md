# Athlytica — Legacy Data Mapping Specification

**Companion to** `ATHLYTICA_DATA_ARCHITECTURE_AUDIT.md`.
**Status:** proposal. Nothing here has been executed.
**Date:** 2026-08-12

Target entities referenced below are the canonical model proposed in audit §16
(`athlete`, `athlete_identifier`, `organization`, `organization_membership`,
`session`, `observation`, `fixture`, `fixture_participation`, `provenance`).

Two rules apply to every dataset in this document:

1. **The source file is never modified.** It is copied to `data/legacy/` with its
   MD5 and treated as read-only from then on.
2. **Every canonical row carries `source_file` + `source_row`.** Any figure on
   any dashboard must be traceable to a CSV line number.

---

## Source inventory and checksums

Captured 2026-08-12 from `C:\Users\User Profile\Downloads`. These MD5s pin the
exact bytes this audit was performed against.

| File | Rows | MD5 |
|---|---|---|
| `RAW DATA INPUT 2020.csv` | 92 | `757bf6a4dac02306c49186493d1d1590` |
| `RAW DATA INPUT 2020(1).csv` | 92 | `9aee8f1bbd91da10f3d25f6eef70fa7e` |
| `RAW DATA INPUT 2021.csv` | 93 | `2a67ef512d9d500eb55df2eec4580337` |
| `RAW DATA INPUT 2021(1).csv` | **1,020** | `8d44f06b9192973cee0ba0e8439b14b4` |
| `RAW DATA INPUT 2022.csv` | 222 | `a48404ec2326c7d82994a09996ca7b19` |
| `RAW DATA INPUT 2023.csv` | 482 | `6b37a9cd55e289ef183e029c70fd14e3` |
| `RAW DATA INPUT 2024.csv` | 308 | `5a645332da1e162a55846117af5c484a` |
| `RAW DATA INPUT 2025.csv` | 480 | `4bf0887dce3cc958e94aaf6cef90021e` |
| `RAW DATA INPUT 2025(1).csv` | 480 | `41085a36c3a3166e12354162e40d0be0` |
| `RAW DATA INPUT 2026.csv` | 282 | `f59731d45cff4c9bac8d4a885654cfda` |
| `RAW DATA INPUT 2026(1).csv` | 327 | `f1112acd082341d12231b4a11af02021` |
| `RAW DATA INPUT 2026(2).csv` | 327 | `03687c7a9fa4cffa98963d607f761b08` |
| `RAW DATA INPUT 2026(3).csv` | 327 | `9efc6f2e088010b5b80c82bbbe971663` |
| `RAW DATA INPUT 2026(4).csv` | 342 | `d7555a442895fd0aa903662c65b9d532` |
| `RAW DATA INPUT 2026(5).csv` | **492** | `7714beffd606ed3c2e07815e1d31ef10` |
| `Athlete Progress.csv` | 17 | `97cdcb17546d4d319d4136631eb54f0e` |
| `Athlete Progress(1).csv` | 17 | `7fd3c55ab3953868e0d8ed0f222ec2a7` |
| `Group sessions.csv` | 11 | `ead40ef2bc4ca58443573fa564a0dc52` |
| `Group sessions(1).csv` | 11 | `ead40ef2bc4ca58443573fa564a0dc52` |
| `Outsourced.csv` | 77 | `2cac438009d4551d50dbb6be8fd4029b` |
| `Dashboard.csv` | 26 | `a3f02f83368ea4d9c62400106323c8f3` |
| `Scrimmage Tracker.csv` | 157 | `1b8a8bd58b90e9eb16a9116aa47c6dc0` |
| `Scrimmage Tracker(1).csv` | 157 | `1b8a8bd58b90e9eb16a9116aa47c6dc0` |

Only `Group sessions` and `Scrimmage Tracker` have identical pairs. **Every
other `(n)` pair differs.** `Athlete Progress` is the subtlest case: identical
byte length (2,189), different content.

Repo extracts, `core-engine/schemas/seed/nrhl_legacy/`:
`athlete_individual_stats.csv` (31 rows), `legacy_scrimmages.csv` (10 rows).
Both are **derived** from `Scrimmage Tracker.csv` with provenance lost.

---

## 1. `RAW DATA INPUT <year>.csv` — the BIIF/NRHL session corpus

**Source** Google Sheets tab export, one tab per year, 2020–2026.
**Purpose** The primary coaching record: one row per athlete per session.
**Organization** Both. Split by `Primary_Discipline` (§13/§14 of the audit):
BIIF 2,467 rows / NRHL 520 rows / unassigned 109, over the canonical set.
**Volume** 3,096 canonical rows · 209 athlete IDs · 1,364 session IDs.

### Candidate target entities

| Source concern | Target entity |
|---|---|
| `Session_ID`, `Session_Date`, `Session_Format`, `Location`, `Lat`/`Long` | `session` (+ `venue`) |
| `Athlete_ID`, `Athlete_Name` | `athlete` + `athlete_identifier` |
| `Primary_Discipline` | `athlete_discipline`, `discipline` |
| `Age_Group`, `Student_Level` | `session_participation` attributes — **not** athlete attributes |
| RPE, Load, Duration, Coach_Grade, Work_Rate, Technical_Breaks, the three compliance rubrics, Performance_Score, Determinant drill | `observation` (one row per metric per athlete per session) |
| `Attendance_Status`, `Scheduled_Status` | `observation` (`ATTENDANCE_STATUS`) |
| `Payment_Status` | **Commerce, not performance.** Route to `registrations`/`enrollment`. |
| `Observation & Action Notes` | `coach_note` — free text, attributed, timestamped |

### Field mapping

| Source column | Target | Transform | Risk |
|---|---|---|---|
| `Session_ID` | `session.external_ref` | Trim. Format `ATHL-NNNN`. | **Not unique** — one ID spans multiple athlete rows (correct: it is a session key). 969 of 1,364 IDs appear in >1 file due to duplicate exports. |
| `Session_Date` | `session.occurred_on` + `observed_at_confidence` | Multi-format parser | **1,041 dates undecidable.** See §Dates. |
| `Athlete_ID ` | `athlete_identifier(scheme='legacy_ath')` | Trim — **2020 header has a trailing space** | 13 IDs bind to >1 human. Never auto-merge. |
| `Athlete_Name` | `athlete.legal_name` | Trim, preserve original | 101 one-word names; alias table is unsafe (see §Identity) |
| `Age / Age_Group` / `Age_Group` / `Age` | `session_participation.age_band` | Lookup table | **10 spellings, 4 bands.** `U16 (13+ years)` ≠ `U16 (13-16 years)`. |
| `Location` | `venue.name` | Trim | Free text; no venue registry exists |
| `Latitude`, `Longitude` | `venue.coordinates` | Strip `°`; reject `#VALUE!` | 1,754 rows carry a degree symbol; 48 carry `#VALUE!`. 2020–2021 have no coordinates at all. |
| `Activity_Type` | `session.activity_type` | Lookup | Low cardinality |
| `Primary_Discipline` | `discipline.code` | **Lookup table, not string edit** | 20 spellings → 13 disciplines. `Foundational Skating` unresolved (D-3). |
| `Session_Focus` | `session.focus` | Trim, uppercase | e.g. `BALANCE`, `SKATING`, `FLOW` |
| `Session_Duration (mins)` | `observation` `SESSION_DURATION_MIN` | Strip `min` suffix | Unit sometimes inline |
| `RPE (0-10)` | `observation` `SESSION_RPE` | Parse leading int; retain label | Label vocabulary drifts |
| `Session_Load` | **DO NOT IMPORT** — recompute | — | `#REF!` for 100% of 2022 (984 corpus-wide) |
| `Student_Level` | `session_participation.level` | Direct | **Clean** — only 4 values |
| `Determinant_Drill` | `session.determinant_drill` | Trim | Free text; needed to interpret the pass/fail |
| `Performance_Score (0-10)` | `observation` `PERFORMANCE_SCORE` | Numeric | Absent from 2026 |
| `Passed_Determinant_Drill` | `observation` `DETERMINANT_DRILL_PASSED` | Map `TRUE/YES`→true, `FALSE/NO`→false | **Encoding changes 2020→2022** |
| `Coach_Grade (1-5)` | `observation` `COACH_GRADE` | Parse leading int; retain label | Spacing and spelling drift |
| `Work_Rate (0-10)` | `observation` `WORK_RATE` | Parse leading int before `;`/`:` | Delimiter drifts |
| `Technical_Breaks (Count)` | `observation` `TECHNICAL_BREAKS_COUNT` | Integer | **This is the raw metric — migrate this one** |
| `Technical_Precision` / `Technical precision` | **DO NOT IMPORT** | — | `= 4 − 2×breaks`, 265/265 verified. Zero added information. |
| `Perfect_Recovery` | `observation` `PERFECT_RECOVERY` | Parse leading int; **retain full prose** | Three column spellings across years |
| `Full_Extension_on_Push` | `observation` `FULL_EXTENSION_ON_PUSH` | as above | |
| `Low Center of Gravity` / `Low_Center_of\_Gravity` | `observation` `LOW_CENTRE_OF_GRAVITY` | as above | **2022 header contains a literal backslash** |
| `Raw Time(10m dash)` | `observation` `LEGACY_RAW_TIME_10M_DASH` | Numeric, **else** `not_recorded_reason` | Free text `"Didn't manage to take the speed"` |
| `Speed score` | `observation` (derived, flagged) | Parse leading int | Derivation UNKNOWN; not a function of Raw Time |
| `Power Score` | `observation` (derived, flagged) | Numeric | Float precision betrays a formula; inputs UNKNOWN |
| `Scheduled_Status` / `Attendance_Status` | `observation` `ATTENDANCE_STATUS` | Composite | `excused` state does not exist in source |
| `Payment_Status` | **Do not load into performance** | — | Commerce concern |
| `Observation & Action Notes` | `coach_note.body` | Preserve verbatim | Contains child names and behaviour notes — **PII, access-gate it** |

### Identity fields

`Athlete_ID` (primary), `Athlete_Name` (secondary, unreliable).
Neither is sufficient alone. See audit §12.

### Date fields

`Session_Date` only. Observed shapes across the canonical set:

| Shape | Count |
|---|---|
| `DD/MM/YYYY` or `MM/DD/YYYY` (ambiguous) | 2,393 |
| `YYYY-MM-DD` | 480 |
| `DD-MM-YYYY` | 58 |
| `D/M/YYYY` (ambiguous) | 52 |
| Unparseable | 4 |
| Missing | 109 |

**1,041 have both parts ≤ 12 and cannot be resolved from the value.** Reuse the
existing `normaliseDate` / confidence model in `lib/services/nrhl-etl.ts` rather
than writing a new parser. Map its `0|1|2` directly onto
`observation.observed_at_confidence`.

Unparseable samples: `1303/2022`, `31/10/203`, `23/02024`, `19/12/24`.

### Known ambiguities

1. **Which copy is authoritative** (D-4). `2021.csv` 93 rows vs `2021(1).csv`
   1,020. Six 2026 variants. No marker.
2. **`Foundational Skating`** (D-3) — 1,669 rows, ice or inline unknown.
3. **`Session_ID` semantics** — a session key, not a row key. A group session
   correctly produces N rows. Naive dedup on `Session_ID` would delete
   athletes.
4. **Age group vs level** — both recorded per session and both drift over an
   athlete's history. They are participation attributes, not identity.
5. **Coach identity** — no coach column. Attribution is UNKNOWN per row. Only
   `Dennis` is identifiable, from the scrimmage log.

### Migration risks

- Concatenating all 15 files duplicates ~969 sessions.
- Importing `Technical precision` as raw re-creates the derived/raw collapse.
- Coercing `#REF!`/`#VALUE!` to 0 or NULL silently fabricates data.
- Stripping `°` without logging loses the fact that the column was malformed.
- Loading `Payment_Status` into a performance table mixes commerce with
  evidence.

### Required human decisions

D-3 (`Foundational Skating`), D-4 (authoritative copies).
Plus: is coach attribution recoverable from another source? Currently **UNKNOWN**.

---

## 2. `Scrimmage Tracker.csv` — the NRHL competition corpus

**Source** Google Sheets tab, "Athlytica Group Roller Hockey 2026".
**Purpose** Match log + cumulative per-athlete stats. **This is the NRHL source
of truth** — `legacy_scrimmages.csv` and `athlete_individual_stats.csv` are both
derived from it, lossily.
**Organization** NRHL. **Volume** 157 rows: ~10 fixtures + a 15-athlete
cumulative block.

### Structure

Two logical tables side by side in one sheet. Columns A–I are the match log;
columns M–R are cumulative stats. Row 1 carries the orphaned labels
`Assisted Goals` / `Unassisted Goals` over columns D–E.

### Candidate target entities

| Source concern | Target |
|---|---|
| Date, Format, Score, Duration, Notes | `fixture` |
| `Team A` / `Team B` column values | `team` (captain-named) + `roster_entry` |
| Roster names under each captain | `fixture_participation` |
| Cumulative Games/Assists/Goals/Points | **Derived** — recompute, do not import |

### Field mapping

| Source | Target | Transform | Risk |
|---|---|---|---|
| `Date` | `fixture.played_on` | Multi-format | **Convention changes mid-file**: `03/01/2026` is day-first, `1/24/2026` is month-first |
| `Format` | `fixture.format` | Direct | `5v5`, `3v3`, `4v3`, `4v4` — asymmetric formats are real |
| `Team A` (first row of a block) | `team.captain_athlete_id` | Name resolution | Teams are **named after their captain** |
| rows beneath | `fixture_participation` | Name resolution | Blank date marks continuation |
| `Score (A-B)` | `fixture.home_score` / `away_score` | Split on `-` or `_` | Separators drift: `11-10`, `5 _ 4`, `8 _ 10`, `5_5` |
| `Duration (min)` | `fixture.duration_min` | Strip `min` | `50` vs `50 min` |
| `Notes` | `fixture.note` | Verbatim | Contains athlete names and behaviour |
| `Substitute` | `fixture_participation.is_substitute` | Boolean | Sparse |
| Cumulative block | **Do not import** | Recompute | See below |

### Known ambiguities

1. **Names degrade to first names from row ~30**: `Sam`, `Mbatia`, `Noel`,
   `Shaya`, `Kyler`, `Raimi`, `Asher`, `Eli`.
   **`Eli` is ambiguous** — both `Eli Das` and `Eli Araka` are on the roster.
   The current `NAME_ALIASES` in `nrhl-etl.ts` resolves it to Eli Das
   unconditionally. **This is a live mis-attribution defect.**
2. **Non-athletes participate**: `Dennis(Me)` (the coach) and `Tobu (Parent)`
   appear as team members. `NON_ATHLETES` in the ETL handles both correctly.
3. **Cumulative goals are collapsed.** The block reports one `Goals` figure.
   `NRHL-PTS-v1` needs assisted and unassisted separately. The split is
   recoverable per athlete by solving `2·assisted = points − assists − goals`,
   and it resolves cleanly for all 31 athletes — but it should be **recovered
   from the per-fixture rows**, not from algebra on a rollup.
4. **Only 3 of 10 fixtures have scores.** Fixtures 004–010 have blank scores in
   `legacy_scrimmages.csv`; the tracker shows scores for some of them
   (`5 _ 4`, `8 _ 10`, `5_5`, `4_4`). **The derived extract lost scores the
   source has.** Re-derive from the tracker.

### Migration risks

- Using `legacy_scrimmages.csv` instead of this file loses captain names,
  scores, formats, durations and notes.
- Auto-resolving bare first names mis-attributes goals to the wrong child — the
  single most damaging error possible in a scouting product.
- Importing cumulative stats as fact makes them un-recomputable and freezes
  `NRHL-PTS-v1` into the data.

### Required human decisions

D-2 (`ATH-047`), D-5 (teams historical vs forward-looking), and:
**is bare `Eli` resolvable at all?** If not, those participations must load with
`athlete_id = NULL` and an unresolved-identity flag — never a guess.

---

## 3. `Athlete Progress.csv` — per-athlete rollup

**Source** Google Sheets tab "ATHLETE PROGRESS TRACKER".
**Purpose** Coach/parent-facing summary. **Presentation, not evidence.**
**Organization** BIIF. **Volume** 17 rows (3 header + 14 athletes).

Header row is row 3, not row 1.

| Source | Target | Note |
|---|---|---|
| `Athlete_ID` | `athlete_identifier` | `ATH-003`, `ATH-005`, `ATH-006` — confirms the `ATH-NNN` legacy format |
| `Athlete_Name` | cross-check only | |
| `Age Group`, `Current Level` | cross-check | Should agree with the session corpus; **verify, do not assume** |
| `Sessions (Total)`, `(Attended)`, `Attendance %`, `Sessions Missed` | **recompute** | Derived from session rows |
| `Avg Tech Precision` | **DO NOT IMPORT** | Mean of a derived value. Negative. See audit §11. |
| `Avg Power Score` | **DO NOT IMPORT** | Mean of an UNKNOWN derivation |
| `Low COG %`, `Full Extension %`, `Perfect Recovery %` | **DO NOT IMPORT** | **`0%` for every athlete.** Empty, not zero. |
| `Drill Pass Rate` | recompute | From `DETERMINANT_DRILL_PASSED` |
| `Total Session Load` | recompute | Underlying load is `#REF!` in 2022 |
| `Trend (Tech)` | **DO NOT IMPORT** | `↓ Needs Work` for every athlete — a formula output, not an assessment |

**Value of this file:** as a **reconciliation target**. After loading the
session corpus, recompute these figures and diff against this file. Agreement
validates the load; disagreement localises a bug. That is its only safe use.

**Ambiguity:** `Athlete Progress.csv` and `(1).csv` are the same size with
different MD5s (D-4). And the rounding of `Avg Tech Precision` disagrees with
`technical_rating` in `athlete_individual_stats.csv` (Raimi `-0.3` vs `-0.387`),
so the two rollups used different windows or different code. **UNKNOWN which is
correct.**

---

## 4. `Group sessions.csv` — 2026 curriculum

**Source** Google Sheets tab "GROUP SESSION OVERVIEW - Parent Reference".
**Purpose** Weekly training plan. **Narrative, not measurement.**
**Organization** BIIF (delivered to the NRHL cohort).
**Volume** 11 rows, Weeks 1–10.

| Source | Target |
|---|---|
| `Session`, `Date` | `session_plan.week`, `.planned_on` |
| `Phase` | `session_plan.phases` |
| `Focus Area`, `Key Drills`, `Skills Targeted` | `session_plan.*` — free text |

**No athlete data. No metrics. Zero identity fields.**

**Why it matters anyway:** it is the *documentary provenance for the scoring
rule*. Week 1 `Skills Targeted` states: *"Unselfish play (3pts for assist
goals)"*. That sentence is the origin of `NRHL_POINT_FORMULA.assisted = 3`.
Load it as reference and cite it from the scoring version — it is the closest
thing to a specification the point formula has.

`Date` format `03/01/2026 Sat 9-11am` mixes date, weekday and time window in one
cell. Parse into `planned_on` + `window_start`/`window_end`.

---

## 5. `Outsourced.csv` — institutional bookings

**Source** Google Sheets tab "INSTITUTION OUTSOURCING BIIF".
**Purpose** Log of schools/academies BIIF delivered sessions to, from 2021.
**Organization** BIIF. **Volume** 77 rows. **Two columns: `Date`, `Institution`.**

| Source | Target |
|---|---|
| `Date` | `engagement.delivered_on` |
| `Institution` | `organization` (`org_type = 'school'`) |

**No athlete identity, no metrics.** Every session delivered under these
bookings is **unattributed at the athlete level** — the children who attended
are not recorded anywhere.

Institution strings are messy and carry commentary:
`Muka's Athi river school- skating lesson`, `Al Ameen Academy Eastleigh`,
`Midas Academy zimmerman`, `Hopes and Dreams Lavington`. Split
name from location/note; do not fabricate a canonical school registry from them.

**Migration risk:** this file is evidence of *reach*, not of *athletes*. It must
never inflate an athlete count. Its correct home is a commercial/engagement
table, not the athlete graph.

---

## 6. `Dashboard.csv` — rendered spreadsheet dashboard

**Source** Google Sheets tab "🏒 BIG ICE COACHING DASHBOARD".
**Purpose** Presentation. **Volume** 26 rows.

**DO NOT MIGRATE.** This is a rendered view: emoji headings, merged-cell
artefacts, `Total Athletes | 18 | | 206 | | 95%` with unlabelled columns.

Its one use is reconciliation: `18` athletes and `95%` are assertions the
migration can be checked against. Note `18` disagrees with both the 31 athletes
in `athlete_individual_stats.csv` and the 209 IDs in the session corpus — the
scopes differ (2026 active group vs all-time). **Confirm the intended scope
before treating any of these as a target.**

---

## 7. Repo extracts — `core-engine/schemas/seed/nrhl_legacy/`

Both are **second-generation derivations** of `Scrimmage Tracker.csv`.

### `athlete_individual_stats.csv` (31 rows)

| Source | Target | Note |
|---|---|---|
| `athlete_name` | identity candidate | 31 names; includes one-word `Louis` |
| `primary_discipline` | `discipline` | Only `Inline / Roller Hockey` and `Ice Hockey` |
| `games_played`, `goals`, `assists` | recompute from fixtures | `goals` is the **collapsed** assisted+unassisted |
| `total_points` | **do not import** | `NRHL-PTS-v1` output |
| `penalty_minutes` | **do not import** | Empty for all 31 |
| `attendance_rate_pct` | recompute | Blank for the 3 Ice Hockey athletes |
| `speed_rating`, `technical_rating` | **do not import** | Derived rollups; `technical_rating` sign-inverted |

The 3 Ice Hockey athletes (`Noah Mary`, `Peter Aridi`, `Soleil Mary`) have
**every** metric blank. They are roster entries with no observations.

### `legacy_scrimmages.csv` (10 rows)

| Source | Target | Note |
|---|---|---|
| `scrimmage_id` | `fixture.external_ref` | `NRHL-SCR-2026-001` — clean, generated |
| `date` | `fixture.played_on` | ISO. **Already disambiguated** — use to calibrate the tracker's parser |
| `division` | — | **Empty for all 10 rows** |
| `team_a`, `team_b` | — | Literal `"Team A"` / `"Team B"` — **identity destroyed** |
| `score_team_a`, `score_team_b` | `fixture.*_score` | **Blank for 7 of 10**, though the tracker has some |
| `venue` | `venue.coordinates` | **Contains GPS `"-1.224532,36.808400"`, not a venue name** |
| `attendance_count` | `fixture.attendance_count` | Present for all 10 |

**Use `legacy_scrimmages.csv` only for its ISO dates** — they are the ground
truth that proves `03/01/2026` in the tracker is 3 January. For everything else
go to `Scrimmage Tracker.csv`.

---

## 8. Live Supabase rows

**13 `public.athlete` rows.** Seven identical `Test Athlete` (DOB 2012-04-15,
`ice_hockey`) created 2026-07-09 within 68 minutes — test artefacts. Six TTA
football demo seeds with `77000005-…` UUIDs.

| Source | Target | Action |
|---|---|---|
| 7 × `Test Athlete` | — | **Delete after confirming no FK references.** Test data, not history. |
| 6 × TTA demo | `athlete` + TTA `organization_membership` | Migrate as demo, flagged |
| `athlytica_core.*` | — | **Empty.** Nothing to migrate. Enable RLS before it fills. |
| `nrhl_*`, `bigice_*` | — | **Empty.** Schema only. |
| `workspace_roles` | — | **Empty.** No grants exist. |

**No production athlete history exists.** This is a first load, not a rewrite.

---

## Cross-cutting: vocabulary lookup tables

Every normalisation goes through a **lookup table with the original preserved**,
never an in-place string edit.

```
vocabulary_map
  domain        text   -- 'discipline' | 'age_band' | 'attendance' | 'level'
  source_value  text   -- exactly as it appears in the CSV
  canonical_code text  -- null until decided
  decided_by    text
  decided_at    timestamptz
  note          text
```

Seed with all 20 discipline spellings and all 10 age-group spellings from audit
§11, `canonical_code` NULL. **A row with a NULL `canonical_code` blocks the
load for that value.** That makes every vocabulary decision explicit and
attributable, and makes `Foundational Skating` (1,669 rows) impossible to
resolve by accident.

---

## Load order

```
1  organization           BIIF, NRHL, TTA, Athlytica HQ, + Outsourced institutions
2  discipline             from vocabulary_map, all decided
3  metric_registry        from athlytica_metric_registry.json, status in (existing, legacy)
4  benchmark              SKATING-LEGACY-1.0.0, source cited as uncited
5  athlete                after identity resolution only
6  athlete_identifier     every legacy code, including contested
7  organization_membership
8  venue, session         from RAW DATA INPUT
9  observation            raw only — NO scores
10 season, conference, team, roster_entry     forward-looking, effective_from
11 fixture, fixture_participation             from Scrimmage Tracker
12 [gate] reconcile against Athlete Progress + Dashboard
13 derived scores         only after step 12 passes
```

Steps 9 and 13 must not be merged. If a score is written before the
reconciliation gate passes, the raw/derived separation has already failed.
