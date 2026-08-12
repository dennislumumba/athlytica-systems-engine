# Athlytica — Data Quality Issue Register

**Companion to** `ATHLYTICA_DATA_ARCHITECTURE_AUDIT.md`.
**Date:** 2026-08-12
**Status of every issue below:** `OPEN`. Nothing has been fixed, cleaned, merged
or deleted.

## Severity definitions

| Severity | Meaning |
|---|---|
| **CRITICAL** | Will corrupt athlete identity, misattribute performance, or expose PII. Blocks migration. |
| **HIGH** | Will produce wrong numbers or unrecoverable loss. Must be resolved before load. |
| **MEDIUM** | Degrades quality or blocks a feature. Resolve during load. |
| **LOW** | Cosmetic or low-volume. Resolve opportunistically. |
| **REVIEW_REQUIRED** | Cannot be resolved from data. Needs a human decision. |

Counts: **9 CRITICAL · 13 HIGH · 12 MEDIUM · 4 LOW · 7 REVIEW_REQUIRED** (45 total).

---

## CRITICAL

### DQ-001 · One athlete ID bound to two different humans
- **Source** `RAW DATA INPUT 2020–2026`
- **Reference** `ATH-047`, `ATH-546`, `ATH-013`, `ATH-540`, `ATH-541`, `ATH-542`, `ATH-620`, `ATH-014`
- **Category** identity / duplicate ID
- **Severity** CRITICAL
- **Description** Eight legacy IDs each resolve to two distinct names. These are not spelling variants — they are different people sharing a code.
- **Evidence** `ATH-047` → *Sam Inoue* and *Shirley Makena*. `ATH-546` → *Jasmine Kariuki* and *Liam Pashani*. `ATH-013` → *Nathan Mulani* and *Scooter Araka*. `ATH-620` → *Johari Keige* and *Tyler*.
- **Recommended action** Split into separate athletes. Record **both** claims in `athlete_identifier` with `is_contested = true`. Never pick a winner silently.
- **Requires human review** YES
- **Status** OPEN — see Decision D-2

### DQ-002 · `NAME_ALIASES` maps an ambiguous first name to one athlete
- **Source** `lib/services/nrhl-etl.ts`
- **Reference** `NAME_ALIASES.eli = "Eli Das"`
- **Category** identity / live defect
- **Severity** CRITICAL
- **Description** The ETL resolves every bare `"Eli"` to *Eli Das*. **`Eli Araka` is on the same roster.** `Scrimmage Tracker.csv` degrades to first names from row ~30, so real participations will be attributed to the wrong child.
- **Evidence** Both names appear in `athlete_individual_stats.csv`. The tracker contains bare `Eli` in fixture rosters.
- **Recommended action** Remove `eli` from the alias table. Unresolvable names must load with `athlete_id = NULL` and an unresolved flag. Audit `sam`, `sky`, `shaya`, `raimi`, `asher`, `noel`, `kyler`, `leon`, `dakota`, `mbatia` for the same hazard.
- **Requires human review** YES
- **Status** OPEN

### DQ-003 · One human holding two athlete IDs
- **Source** `RAW DATA INPUT 2020–2026`
- **Reference** 15 pairs incl. `ATH-006`/`ATH-566` (Shaya Das), `ATH-009`/`ATH-567` (Eli Das), `ATH-025`/`ATH-568` (Keila Naitore), `ATH-064`/`ATH-569` (Lavrin Dickens)
- **Category** identity / duplicate athlete
- **Severity** CRITICAL
- **Description** 15 names resolve to two IDs each. Longitudinal history is split across both, so every trend and total is understated.
- **Evidence** `ATH-566/567/568/569` are **consecutive** and map to `ATH-006/009/025/064` — the signature of a bulk re-registration that did not retire the old codes.
- **Recommended action** Adjudicate individually. On confirmation, merge via `merged_into_id` tombstone, retaining both identifiers. Never delete.
- **Requires human review** YES
- **Status** OPEN

### DQ-004 · Derived value stored in a column named `rating`, with inverted sign
- **Source** `athlete_individual_stats.csv`, `Athlete Progress.csv`, `nrhl_athlete.technical_rating`
- **Reference** `technical_rating`, `Avg Tech Precision`
- **Category** derived-as-raw / semantic inversion
- **Severity** CRITICAL
- **Description** `technical_rating` is the per-athlete mean of `Technical precision`, which is itself `4 − 2 × Technical_Breaks`. The name implies higher-is-better; the data is the opposite.
- **Evidence** Top scorers hold the most negative values — Noel Inoue `-1.667`, Dakota Weening `-2.0`, Lavrin Dickens `-2.0`. The weakest athlete holds the highest — Leroy Sila `+2.4`, with 40% attendance and speed `1.6`. **`ORDER BY technical_rating DESC` ranks the worst athletes first.**
- **Recommended action** Do not migrate. Migrate `TECHNICAL_BREAKS_COUNT` as raw; recompute in the derived layer with `higher_is_better` explicit.
- **Requires human review** NO — but the direction must be confirmed
- **Status** OPEN

### DQ-005 · Derived value indistinguishable from a raw measurement
- **Source** `RAW DATA INPUT 2022, 2026`
- **Reference** `Technical precision`
- **Category** derived-as-raw
- **Severity** CRITICAL
- **Description** Sits beside genuine measurements in the same sheet with no marker that it is computed.
- **Evidence** `Technical precision = 4 − (2 × Technical_Breaks)` holds on **265 of 265 rows, zero mismatches**. Observed pairs: `(0,4) (1,2) (2,0) (3,−2) (4,−4)`.
- **Recommended action** Exclude from the raw load. Record the formula in the metric registry.
- **Requires human review** NO
- **Status** OPEN

### DQ-006 · Points formula input destroyed by the export
- **Source** `athlete_individual_stats.csv`
- **Reference** `goals`, `total_points`
- **Category** lossy derivation
- **Severity** CRITICAL
- **Description** `NRHL-PTS-v1` is `3×assisted + 1×unassisted + 1×assists`. The extract has a single `goals` column, so the split the formula needs is gone.
- **Evidence** `Scrimmage Tracker.csv` row 1 labels columns `Assisted Goals` / `Unassisted Goals`; the cumulative block reports only combined `Goals`. Noel Inoue: goals+assists = **58**, stored points = **124**. Recoverable by algebra for all 31 athletes, but that is reconstruction, not data.
- **Recommended action** Recover the split from per-fixture rows in `Scrimmage Tracker.csv`. Do not rely on the algebraic solution.
- **Requires human review** NO
- **Status** OPEN

### DQ-007 · RLS disabled on four tables holding guardian and minor PII
- **Source** Supabase `qxfrypvevjsyzkquewxh`
- **Reference** `athlytica_core.parents`, `.athletes`, `.performance_logs`, `.scalable_id_sequence`
- **Category** security
- **Severity** CRITICAL
- **Description** Fully exposed to the `anon` and `authenticated` roles. Anyone with the publishable anon key can read or modify every row.
- **Evidence** Supabase advisor `rls_disabled`, priority 1. `athlytica_core.parents` stores guardian phone numbers; `athlytica_core.athletes` stores `birth_certificate_hash UNIQUE NOT NULL` for minors.
- **Mitigating** All four tables are currently **empty**. Nothing has leaked.
- **Recommended action** Enable RLS **with policies designed alongside** — enabling alone blocks all access, and the `SECURITY DEFINER` functions (`link_guardian`, `bigice_next_athlete_code`, `nrhl_next_athlete_code`) bypass RLS regardless. Do before any registration traffic.
- **Requires human review** YES
- **Status** OPEN

### DQ-008 · ID sequence will re-issue numbers already held by legacy athletes
- **Source** `athlytica_core.scalable_id_sequence` + legacy corpus
- **Reference** `current_value = 500`; legacy IDs run `ATH-001` → `ATH-638`
- **Category** identity / collision
- **Severity** CRITICAL
- **Description** The sequence issues `ATH-00501` … `ATH-00638`, whose numeric parts are already held by distinct legacy humans. The strings differ only by zero-padding.
- **Evidence** `ATH-500` Jason Jabali, `ATH-537` Elaine, `ATH-566` Shaya Das all exist in the CSVs. Three SQL functions increment this same row, so `ATH-`, `BIIF-` and NRHL codes share one interleaved counter.
- **Recommended action** Do not advance the sequence. Mint canonical IDs from a **new** `athlytica_id_seq` starting at 1, 6-digit padded, so `ATH-000047` is visually distinct from `ATH-047`.
- **Requires human review** NO
- **Status** OPEN — see Decision D-6

### DQ-009 · Workspace payload is not role-filtered server-side
- **Source** `app/api/v1/workspace/dashboard/route.ts`
- **Category** security / segregation
- **Severity** CRITICAL
- **Description** The endpoint returns a venture's entire payload — `payment_events`, `registrations`, revenue, permission matrix — to any holder of a grant. Role filtering (`canSee`, `visibleNav`) happens client-side at render.
- **Evidence** Documented in `CLAUDE.md` as a known invariant. An `ATHLETE` grant returns the same JSON the founder gets.
- **Impact** 30 athletes are already in both BIIF and NRHL. A second organization cannot be onboarded without exposing the first's commercial data.
- **Recommended action** Move filtering server-side before any external organization joins. See audit §22.
- **Requires human review** YES
- **Status** OPEN — see Decision D-1

---

## HIGH

### DQ-010 · Divergent duplicate file copies with no authority marker
- **Source** `Downloads`
- **Reference** `RAW DATA INPUT 2021.csv` (93 rows) vs `2021(1).csv` (1,020 rows); six 2026 variants (282/327/327/327/342/492)
- **Category** provenance
- **Severity** HIGH
- **Evidence** MD5s all differ. `Athlete Progress.csv` and `(1).csv` are **identical in byte length (2,189) but differ in MD5**.
- **Recommended action** Do not guess. Re-export the live Google Sheet once and treat that as authoritative for every tab.
- **Requires human review** YES — Decision D-4
- **Status** OPEN

### DQ-011 · 1,041 dates are mathematically undecidable
- **Source** `RAW DATA INPUT` (all years), `Scrimmage Tracker.csv`
- **Category** date integrity
- **Severity** HIGH
- **Evidence** 2,393 `DD/MM` or `MM/DD` + 52 unpadded = 2,445 slash-dates, of which **1,041 have both parts ≤ 12**. `Scrimmage Tracker` proves the convention changes mid-file: `03/01/2026`, `10/01/2026`, `17/01/2026` are day-first (confirmed against `legacy_scrimmages.csv`), then `1/24/2026`, `1/31/2026`, `2/7/2026` are month-first.
- **Recommended action** Reuse the `0|1|2` confidence model in `lib/services/nrhl-etl.ts`. Store `observed_at_confidence`. **Never guess to fill a NOT NULL column.**
- **Requires human review** NO
- **Status** OPEN

### DQ-012 · Broken spreadsheet formulas written into data
- **Source** `RAW DATA INPUT 2022–2026`
- **Reference** `Session_Load`, `Longitude`
- **Category** validity
- **Severity** HIGH
- **Evidence** `#REF!` × 984 (100% of 2022 `Session_Load`), `#VALUE!` × 48 (2026 `Longitude`), `#N/A` × 3.
- **Recommended action** Never coerce to 0 or NULL. Load as `not_recorded_reason = 'source formula error: #REF!'`. Recompute `Session_Load` from RPE × duration.
- **Requires human review** NO
- **Status** OPEN

### DQ-013 · Degree symbol inside numeric coordinates
- **Source** `RAW DATA INPUT 2026*`
- **Reference** `Longitude` = `36.965000°`
- **Category** format
- **Severity** HIGH
- **Evidence** 1,754 occurrences.
- **Recommended action** Strip and log. Do not silently repair — the malformation is evidence about how the sheet was maintained.
- **Requires human review** NO
- **Status** OPEN

### DQ-014 · Free text in a numeric measurement column
- **Source** `RAW DATA INPUT 2026*`
- **Reference** `Raw Time(10m dash)` = `"Didn't manage to take the speed"`
- **Category** schema mismatch
- **Severity** HIGH
- **Description** This is **correct coach behaviour** — refusing to invent a number — recorded in a column that cannot hold it.
- **Recommended action** Load into `observation.not_recorded_reason`. The target schema must have a first-class "attempted, not recorded" state.
- **Requires human review** NO
- **Status** OPEN

### DQ-015 · Twenty discipline spellings for ~13 disciplines
- **Source** `RAW DATA INPUT` (all years)
- **Category** vocabulary
- **Severity** HIGH
- **Evidence** `Inline Skating` (812) vs `Inline skating` (172); `Inline / Roller Hockey` (1,089) vs `Roller Hockey` (112) vs `Inline Hockey` (54); `Basic Ice Skating` (208) vs `Ice Foundation` (169) vs `Ice Skating Foundational` (21); `Pylometrics` (60) — misspelling of *plyometrics*.
- **Recommended action** `vocabulary_map` lookup with NULL `canonical_code` blocking the load. Never string-edit in place.
- **Requires human review** YES for the merge groups
- **Status** OPEN

### DQ-016 · Largest discipline value is surface-ambiguous
- **Source** `RAW DATA INPUT` (all years)
- **Reference** `Foundational Skating` — 1,669 rows, 54% of the BIIF corpus
- **Category** vocabulary / classification
- **Severity** HIGH
- **Description** Does not state ice or inline. Benchmarks, dimensions and composites all depend on surface.
- **Recommended action** Create `foundational_skating` with `surface = 'unknown'`. Attempt inference from `Location` as a follow-up. **Never default it to inline.**
- **Requires human review** YES — Decision D-3
- **Status** OPEN

### DQ-017 · Real team identity destroyed by the derived extract
- **Source** `legacy_scrimmages.csv`
- **Reference** `team_a` = `"Team A"`, `team_b` = `"Team B"` for all 10 rows
- **Category** lossy derivation
- **Severity** HIGH
- **Evidence** `Scrimmage Tracker.csv` names teams after captains — `Leon Sila` vs `Shaya Das`, `Sam Inoue` vs `Kyler Okeyo`. The ETL replaced them with placeholders.
- **Recommended action** Re-derive from `Scrimmage Tracker.csv`. Populate `team.captain_athlete_id`.
- **Requires human review** NO
- **Status** OPEN

### DQ-018 · Scores present in source but blank in the extract
- **Source** `legacy_scrimmages.csv`
- **Reference** `NRHL-SCR-2026-004` … `010`
- **Category** lossy derivation
- **Severity** HIGH
- **Evidence** 7 of 10 fixtures have blank scores in the extract, while the tracker shows `5 _ 4`, `8 _ 10`, `5_5`, `4_4` for several. The separator drift (`_` vs `-`) is the likely cause of the parse failure.
- **Recommended action** Re-parse from the tracker with a separator-tolerant rule.
- **Requires human review** NO
- **Status** OPEN

### DQ-019 · GPS coordinates stored in a `venue` name field
- **Source** `legacy_scrimmages.csv`
- **Reference** `venue` = `"-1.224532,36.808400"` for all 10 rows
- **Category** schema mismatch
- **Severity** HIGH
- **Recommended action** Parse into `venue.coordinates`. Venue **name** is UNKNOWN for all 10 fixtures.
- **Requires human review** NO
- **Status** OPEN

### DQ-020 · No `observed_at` on the derived performance path
- **Source** `public.performance_logs`
- **Category** provenance
- **Severity** HIGH
- **Description** Only `created_at DEFAULT now()`. The session date is reachable via `sessions.start_time`, but that **also defaults to `now()`**.
- **Impact** A backdated legacy load would record the import date as the observation date — precisely the failure the brief forbids.
- **Recommended action** `observed_at` and `created_at` both mandatory on `observation`, plus a generated `is_backdated`.
- **Requires human review** NO
- **Status** OPEN

### DQ-021 · Engine confidence is persisted but not queryable
- **Source** `supabase/functions/telemetry-processor/index.ts`
- **Category** scoring integrity
- **Severity** HIGH
- **Description** The engine's contract states consumers *"MUST weight by confidence, never treat 50 as measured"*. Confidence is written to `raw_payload.confidence` jsonb; `performance_logs` has no confidence column and no index on that path.
- **Impact** A stored neutral prior of `50` is indistinguishable from a measured `50` in any SQL dashboard.
- **Recommended action** Promote confidence to columns. Store `NULL`, not `50`, where confidence is 0.
- **Requires human review** NO
- **Status** OPEN

### DQ-022 · One uncited global benchmark for all ages and disciplines
- **Source** `supabase/functions/_shared/analyticsEngine.ts`
- **Reference** `DEFAULT_BANDS`
- **Category** scoring integrity
- **Severity** HIGH
- **Evidence** Six floor/elite pairs described in a comment as *"calibrated for skating-family sports"*, with **no source, no version, no age band, no sex band, no discipline split**. `opts.bands` exists but nothing passes it.
- **Impact** A U8 beginner and a U16 advanced athlete are scored against identical anchors.
- **Recommended action** Move to a `benchmark` table with `source NOT NULL`. Seed the current values as `SKATING-LEGACY-1.0.0` with `reference_population = 'UNKNOWN'`.
- **Requires human review** YES — the bands need a real reference population
- **Status** OPEN

---

## MEDIUM

### DQ-023 · Technical-compliance rollups are zero for every athlete
- **Source** `Athlete Progress.csv`
- **Reference** `Low COG %`, `Full Extension %`, `Perfect Recovery %`
- **Severity** MEDIUM
- **Evidence** `0%` on every row.
- **Recommended action** Do not migrate as measured zeros. Recompute from the per-session ordinals, which **do** have values.
- **Requires human review** NO · **Status** OPEN

### DQ-024 · `penalty_minutes` present but empty for all 31 athletes
- **Source** `athlete_individual_stats.csv`
- **Severity** MEDIUM
- **Description** UNKNOWN whether penalties were never tracked or the export dropped them.
- **Recommended action** Do not migrate as zero. Confirm from the tracker.
- **Requires human review** YES · **Status** OPEN

### DQ-025 · A group registered as an athlete
- **Source** `RAW DATA INPUT`
- **Reference** `" Kids Group"` (leading space) under `ATH-030` **and** `ATH-055`
- **Severity** MEDIUM
- **Description** Entity-type violation: sessions are attributed to a non-person under two IDs.
- **Recommended action** Do not migrate as an athlete. Model as a group session with unattributed participation.
- **Requires human review** YES · **Status** OPEN

### DQ-026 · Ten age-group spellings, two semantically different
- **Source** `RAW DATA INPUT`
- **Severity** MEDIUM
- **Evidence** `U8 (Under 8 years)` 1,858 · `U8(Under 8 years)` 1,080 · `U12(9-12years)` 974 · `U12 (9–12 years)` 898 (**en-dash**) · `U12 (9-12 years)` 282 · `U16(13-16years)` 37 · `Over 16` 23 · `U16 (13+ years)` 22 · `U16 (13-16 years)` 14 · `Over16` 1.
- **Note** `U16 (13+ years)` is **unbounded**; `U16 (13-16 years)` is not. Not a whitespace fix.
- **Requires human review** YES · **Status** OPEN

### DQ-027 · Three incompatible age vocabularies across the system
- **Source** schema + corpus
- **Severity** MEDIUM
- **Evidence** `public.division` → `U9_COED`, `U13_COED`. `nrhl_athlete.age_tier` CHECK → `U8`, `U12`, `U15`. CSV corpus → `U8`, `U12`, `U16`. **No two agree.**
- **Recommended action** One age-band vocabulary, versioned with `effective_from`.
- **Requires human review** YES · **Status** OPEN

### DQ-028 · The word "division" carries three meanings
- **Source** schema + brief
- **Severity** MEDIUM
- **Evidence** (1) `public.division` = age division. (2) `nrhl_athlete.division` / `nrhl_scrimmage.division` CHECK = geographic conference (`The Summit`…). (3) The brief = conference containing teams.
- **Recommended action** Rename to `age_division` and `conference`. Reserve `division` for nothing.
- **Requires human review** YES · **Status** OPEN

### DQ-029 · `display_name` is UNIQUE on the NRHL athlete table
- **Source** `nrhl_athlete_display_name_key`
- **Severity** MEDIUM
- **Description** Forbids two athletes sharing a display name. With 101 one-word names and known family clusters (Das, Weening, Inoue, Masawi, Aridi, Araka, Sila, Skudi, Mary), this constraint will fire on real data.
- **Recommended action** Drop the constraint. Names are not identifiers.
- **Requires human review** NO · **Status** OPEN

### DQ-030 · Four competing "canonical" athlete ID formats
- **Source** repo
- **Severity** MEDIUM (MEDIUM only because no real data has been written)
- **Evidence** `scripts/normalize-legacy-ids.js` → `ATH-YYYY-NNNN` (declared canonical, **encodes the year**). `lib/services/nrhl-etl.ts` `migrateLegacyCode` → `ATH-NNNNN`. `athlytica_core.generate_scalable_athlete_code` → `ATH-NNNNN`. `bigice_next_athlete_code` → `BIIF-YYYY-NNNN`. `lib/converters/convexAdapter.ts` throws an error telling operators to run the year-encoding script.
- **Recommended action** Retire `normalize-legacy-ids.js`; fix the `convexAdapter` message. Year-encoded IDs violate the permanence requirement.
- **Requires human review** NO · **Status** OPEN

### DQ-031 · Three tenancy vocabularies that do not reference each other
- **Source** schema
- **Severity** MEDIUM
- **Evidence** `tenants` table (1 row, real FKs) · `workspace` text CHECK on `workspace_roles`/`user_profiles` (4 values, no table) · `venture_context` text CHECK on `registrations` (`NRHL | BIG_ICE | ATHLYTICA` — **missing TTA**).
- **Recommended action** One `organization` table. The other two become FKs.
- **Requires human review** NO · **Status** OPEN

### DQ-032 · Prefix typo creates phantom duplicate IDs
- **Source** `RAW DATA INPUT`
- **Reference** `ATL-020` (Leon Sila), `ATL-509` (Moyo)
- **Severity** MEDIUM
- **Evidence** Same numeric part, same name as `ATH-020` / `ATH-509`. 2 of 209 IDs.
- **Recommended action** Almost certainly the same athlete — but confirm, then record `ATL-020` in `athlete_identifier` rather than rewriting it.
- **Requires human review** YES · **Status** OPEN

### DQ-033 · Roster entries with no observations at all
- **Source** `athlete_individual_stats.csv`
- **Reference** `Noah Mary`, `Peter Aridi`, `Soleil Mary` — all `Ice Hockey`
- **Severity** MEDIUM
- **Evidence** Every metric column blank, including `attendance_rate_pct`.
- **Recommended action** Migrate as athletes with zero observations. Do not fabricate zeros. They are real registrations, not errors.
- **Requires human review** NO · **Status** OPEN

### DQ-034 · Boolean encoding changes between years
- **Source** `RAW DATA INPUT 2020` vs `2022`
- **Reference** `Passed_Determinant_Drill`
- **Severity** MEDIUM
- **Evidence** `TRUE`/`FALSE` in 2020, `YES`/`NO` in 2022.
- **Recommended action** Map both. Reject any third encoding loudly.
- **Requires human review** NO · **Status** OPEN

---

## LOW

### DQ-035 · Trailing space in a header name
- **Source** `RAW DATA INPUT 2020`, `2022` · **Reference** `Athlete_ID ` · **Severity** LOW
- **Recommended action** Trim headers on ingest. · **Status** OPEN

### DQ-036 · Literal backslash in a column name
- **Source** `RAW DATA INPUT 2022` · **Reference** `Low_Center_of\_Gravity` · **Severity** LOW
- **Description** Markdown escaping leaked into a spreadsheet header. Three spellings of this column across years.
- **Status** OPEN

### DQ-037 · Misspellings in source vocabulary
- **Source** `RAW DATA INPUT` · **Severity** LOW
- **Evidence** `Pylometrics` (→ *plyometrics*), `Devoloping` in the 2026 `Coach_Grade` header, `noticeaby` in a rubric string, `complains` (→ *complaints*) in a `Work_Rate` label — the latter two differ between years, so the label text itself is not stable.
- **Recommended action** Correct in the canonical vocabulary; preserve source strings.
- **Status** OPEN

### DQ-038 · Four impossible dates
- **Source** `RAW DATA INPUT 2022–2024` · **Severity** LOW
- **Evidence** `1303/2022` (no separator), `31/10/203` (year 203), `23/02024` (year 02024), `19/12/24` (2-digit year).
- **Recommended action** Quarantine with `observed_at_confidence = 0`. 4 rows — worth a manual fix from the source sheet.
- **Status** OPEN

---

## REVIEW_REQUIRED

### DQ-039 · Two rollups of the same metric disagree
- **Source** `Athlete Progress.csv` vs `athlete_individual_stats.csv`
- **Evidence** Raimi Skudi: `Avg Tech Precision = -0.3` but `technical_rating = -0.387`. `-0.387` rounds to `-0.4`, not `-0.3`. Shaya (`-1.1` / `-1.111`) and Malakai (`-0.7` / `-0.667`) are consistent.
- **Description** The two rollups used different windows or different code. UNKNOWN which is correct.
- **Requires human review** YES · **Status** OPEN

### DQ-040 · Coach attribution absent from the entire session corpus
- **Source** `RAW DATA INPUT` (all years)
- **Description** No coach column exists. Every one of 3,096 sessions is unattributed. The brief requires observations attributable to a coach.
- **Evidence** Only `Dennis` is identifiable anywhere, and only from the scrimmage log.
- **Requires human review** YES — is coach identity recoverable from another source? · **Status** OPEN

### DQ-041 · Outsourced institutional sessions have no athlete attribution
- **Source** `Outsourced.csv`
- **Description** 77 institutional bookings from 2021. The children who attended are recorded nowhere.
- **Recommended action** Model as commercial engagements. **Must never inflate an athlete count.**
- **Requires human review** YES · **Status** OPEN

### DQ-042 · 109 session rows with neither discipline nor date
- **Source** `RAW DATA INPUT 2026(5).csv`
- **Description** Classified `UNASSIGNED`. Likely a blank template block, but they carry athlete IDs.
- **Requires human review** YES · **Status** OPEN

### DQ-043 · Athlete counts disagree across sources
- **Source** `Dashboard.csv` (18) vs `athlete_individual_stats.csv` (31) vs session corpus (209 IDs)
- **Description** Almost certainly different scopes — 2026 active group vs 2026 roster vs all-time. But no source states its scope.
- **Requires human review** YES — confirm the intended denominator before any figure ships to a dashboard · **Status** OPEN

### DQ-044 · Same given name, different surname, one ID
- **Source** `RAW DATA INPUT` · **Reference** `ATH-014` = *Sofia Araka* / *Sofia Mulani*
- **Description** Could be one girl whose surname was corrected, or two cousins. `ATH-013` pairs a *Mulani* with an *Araka* too, suggesting a systematic confusion in one intake batch.
- **Requires human review** YES — the hardest identity case after `ATH-047` · **Status** OPEN

### DQ-045 · NRHL teams exist only in a marketing PDF
- **Source** `lib/services/nrhl-pdf-generator.ts:403-406`
- **Description** The 12 teams (Muthaiga Sovereigns, Gigiri Guardians, …) appear in exactly one static HTML table. There is no teams table, no roster table, no team FK. `nrhl_athlete.team` is free text. `Nairobi Champions Cup` appears nowhere in code or schema.
- **Evidence** In `legacy_scrimmages.csv`, `division` is empty for all 10 rows and teams are `"Team A"`/`"Team B"`.
- **Recommended action** Seed as forward-looking reference data with `effective_from`. **Never back-apply to 2023–2026 sessions that predate the structure.**
- **Requires human review** YES — Decision D-5 · **Status** OPEN

---

## Summary by category

| Category | Count |
|---|---|
| Identity (duplicate IDs, duplicate athletes, ambiguous names) | 9 |
| Derived-as-raw / lossy derivation | 6 |
| Vocabulary inconsistency | 5 |
| Date integrity | 3 |
| Security / segregation | 3 |
| Provenance gaps | 4 |
| Schema mismatch | 5 |
| Validity (broken formulas, impossible values) | 4 |
| Empty-vs-zero | 3 |
| Naming / structural collision | 3 |

**Nothing in this register has been fixed.** Each issue is recorded with its
evidence so the fix can be reviewed, versioned, and reversed.
