# Data Quality Remediation Plan — Phase 0

**Status:** PLAN. No remediation executed.
**Date:** 2026-08-12

Issue IDs continue the register in `docs/ATHLYTICA_DATA_QUALITY_ISSUES.md`.

---

## 1. Remediation classes

| Class | Definition | Automatable |
|---|---|---|
| **A — Preserve verbatim** | Source is wrong; the wrongness is evidence. Load as-is with a quality flag. | yes |
| **B — Recompute** | Derived value is broken or unusable; inputs are sound. | yes, once the rule is decided |
| **C — Lookup-mapped** | Vocabulary drift resolvable by a decided mapping table. | yes, once mappings are decided |
| **D — Human adjudication** | Identity or semantics cannot be settled from data. | **no** |
| **E — Re-source** | The local copy is not authoritative; fix by re-exporting. | no |

**Nothing in class D or E is ever automated.** Class B and C run only after
their decision closes.

---

## 2. Class A — preserve verbatim

Every one of these loads with `raw_value` intact and a `quality_status`.
**No value is fabricated, cleaned or dropped.**

| Issue | Volume | Handling |
|---|---|---|
| `#REF!` in `Session_Load` | 984 (100% of 2022) | `raw_value='#REF!'`, `value_numeric=NULL`, `quality_status='SOURCE_ERROR'` |
| `#VALUE!` in `Longitude` | 48 | same |
| `#N/A` | 3 | same |
| `°` in coordinates (`36.965000°`) | 1,754 | `raw_value` verbatim; parsed value stripped; `quality_status='OK'`; normalization rule `COORD_STRIP_DEGREE_v1` logged per row |
| `"Didn't manage to take the speed"` | — | `quality_status='NOT_RECORDED'`, `not_recorded_reason` = the verbatim string. **Never 0, never bare NULL.** |
| Impossible dates (`1303/2022`, `31/10/203`, `23/02024`, `19/12/24`) | 4 | `observed_at=NULL`, `date_confidence='SOURCE_ERROR'`, `observed_at_raw` verbatim |
| Undecidable dates (both parts ≤12) | 1,041 | `observed_at=NULL`, `date_confidence='UNKNOWN'`, `date_resolution_note` states why |
| Trailing-space header `Athlete_ID ` | 2 files | header map, source header preserved |
| Backslash header `Low_Center_of\_Gravity` | 1 file | header map, source header preserved |

### §15 — the 2022 `Session_Load` `#REF!`

**Investigated. Not recoverable from the CSV.**

The `#REF!` is a broken *cell reference* in the source spreadsheet — the
referenced range was deleted. A `#REF!` carries no recoverable operand, unlike
`#VALUE!` (wrong type) or `#DIV/0!` (known operands). The exported CSV contains
only the error token.

Two paths, neither fabricating a value:

1. **Preserve** — `raw_source_value='#REF!'`, `normalized_value=NULL`,
   `quality_status='SOURCE_ERROR'`. Always done.
2. **Recompute** — `DV_SESSION_LOAD` appears to be `RPE × duration` (2020 rows:
   `300 = 5×60`, `420 = 7×60`). Both inputs survive in 2022. A recomputed value
   is written to the **derived** layer with `rule_version`, never back into the
   observation.

The formula is `INFERRED` from two rows and is not attested by any protocol
document. Confirming it is Decision **D-14**. Until then, 2022 session load is
**absent**, not zero.

---

## 3. Class B — recompute

| Issue | Blocked by | Rule |
|---|---|---|
| Compliance % all zero (§ below) | **D-09** | `count(ordinal >= T) / count(observed)` |
| `technical_rating` direction | **D-10** | versioned `technical_rating_v2`; v1 retained untouched |
| `Session_Load` | **D-14** | `RPE × duration`, derived layer only |
| `total_points` from collapsed goals | — | recover assisted/solo from `Scrimmage Tracker`, then `NRHL-PTS-v1` |
| `attendance_rate_pct` | — | recompute from attendance observations |
| `DV_NRHL_COMPOSITE` | — | `attendance% + 20×coach_grade + points`, per-discipline percentile |

### The compliance-rate finding — corrected

The Phase-audit report stated these columns were empty and concluded the data
was absent. **That was wrong.** Measured against `RAW DATA INPUT 2026(5).csv`:

| Level | Perfect Recovery | Full Extension | Low COG |
|---|---|---|---|
| 1 | 12 | 17 | 21 |
| 2 | 62 | 73 | 86 |
| 3 | 153 | 180 | 173 |
| 4 | 150 | 101 | 90 |
| 5 | 6 | 12 | 13 |
| **n** | **383** | **383** | **383** |

Level 5 is attested 6/12/13 times, so **no threshold — not even `= 5` —
produces 0% for every athlete.** The `Athlete Progress` rollup formula is
broken.

Remediation is therefore **class B (recompute)**, not "no data". The raw
ordinals migrate normally; the rate is derived once the threshold is decided.

The dossier independently characterises these as compliance *rates*
(`sessions compliant / sessions observed`) and warns that modelling them as
continuous performance metrics is a category error — consistent with the above.

---

## 4. Class C — lookup-mapped

Every mapping lives in `athlytica_core.vocabulary_map`. **A NULL
`canonical_code` blocks the load for that value** — no value is silently
passed through, and no string is edited in place.

### Discipline — 20 source spellings

| Source value | Proposed canonical | Rows | Status |
|---|---|---|---|
| `Inline / Roller Hockey` | `inline_hockey` | 1,089 | proposed |
| `Roller Hockey` | `inline_hockey` | 112 | proposed |
| `Inline Hockey` | `inline_hockey` | 54 | proposed |
| `Ice Hockey` | `ice_hockey` | 227 | proposed |
| `Inline Skating` | `inline_skating` | 812 | proposed |
| `Inline skating` | `inline_skating` | 172 | proposed |
| `Figure Skating` | `figure_skating` | 340 | proposed |
| `Basic Ice Skating` | `ice_skating` | 208 | proposed |
| `Ice Foundation` | `ice_skating` | 169 | proposed |
| `Ice Skating Foundational` | `ice_skating` | 21 | proposed |
| `Strength & Conditioning` | `strength_conditioning` | 116 | proposed |
| `Urban / Freestyle` | `street` | 88 | proposed |
| `Pylometrics` | `plyometrics` | 60 | proposed *(source misspelling)* |
| `Pylometrics & Agility` | `plyometrics` | 11 | proposed |
| `Dryland workout` | `dryland` | 11 | proposed |
| `Dryland workouts` | `dryland` | 8 | proposed |
| `Off ice conditioning` | `dryland` | 6 | proposed |
| `Slalom` | `slalom` | 12 | proposed |
| `Speed Skating` | `speed_skating` | 4 | proposed |
| **`Foundational Skating`** | **NULL — BLOCKED** | **1,669** | **D-03** |

### §16 — `Foundational Skating`

1,669 rows, 54% of the BIIF corpus, and the source label does not say ice or
inline.

**Handling, per the directive:**

```
discipline_code = 'UNKNOWN'
source_label    = 'Foundational Skating'
surface         = 'unknown'
```

It is **not** classified as inline hockey and **not** as ice skating. It loads
under an explicit `UNKNOWN` discipline that carries the source label forward, so
a later decision can reclassify without re-reading the CSVs.

A follow-up inference pass may narrow it using `Location` (an ice rink implies
ice), but that produces `source_confidence='INFERRED'`, never `VERIFIED`.

### Age group — 10 spellings

| Source | Canonical | Rows |
|---|---|---|
| `U8 (Under 8 years)` | `U8` | 1,858 |
| `U8(Under 8 years)` | `U8` | 1,080 |
| `U12(9-12years)` | `U12` | 974 |
| `U12 (9–12 years)` *(en-dash)* | `U12` | 898 |
| `U12 (9-12 years)` | `U12` | 282 |
| `U16(13-16years)` | `U16` | 37 |
| `U16 (13-16 years)` | `U16` | 14 |
| `U16 (13+ years)` | **NULL — BLOCKED** | 22 |
| `Over 16` | `OVER16` | 23 |
| `Over16` | `OVER16` | 1 |

`U16 (13+ years)` is **unbounded** and therefore not the same band as
`U16 (13-16 years)`. It is blocked, not whitespace-normalised.

Compounding this: **three incompatible age vocabularies exist system-wide** —
`public.division` uses `U9`/`U13`, `nrhl_athlete.age_tier` CHECKs `U8`/`U12`/`U15`,
and the corpus uses `U8`/`U12`/`U16`. No two agree. Decision **D-11**.

### Booleans

| Source | Canonical | Note |
|---|---|---|
| `TRUE` / `FALSE` | true / false | 2020 |
| `YES` / `NO` | true / false | 2022 |
| anything else | **fail the batch** | a third encoding is a signal, not noise |

---

## 5. Class D — human adjudication

Never automated. Full evidence in `LEGACY_IDENTIFIER_MAPPING.md`.

| Issue | Volume | Decision |
|---|---|---|
| One ID → two humans | 8 | D-02 (+ per-case review) |
| One human → two IDs | 15 | Phase 5 batch review |
| Bare first names (`Eli`, `Leon`) | 2 confirmed unsafe | D-06 |
| `Kids Group` as an athlete | 1 | D-08 |
| 109 undated/undisciplined rows | 109 | D-07 |
| Rollup rounding disagreement (Raimi −0.3 vs −0.387) | 1 | D-12 |
| Conference conflict in a shipped PDF | 1 | D-13 |

---

## 6. Class E — re-source

| Issue | Handling |
|---|---|
| 23 local CSV copies, 8 pairs divergent | All `SOURCE_CANDIDATE`. **None migrated.** |
| `2021.csv` 93 rows vs `2021(1).csv` 1,020 | Not chosen by heuristic. D-04. |
| Six divergent 2026 variants | Same. |
| `Athlete Progress` — same size, different MD5 | Same. |
| **4 tabs missing locally** — `Certificate Tracker`, `Roller Hockey Parent Report`, `Parent_Report`, `Award_Generator` | Must come from the re-export. `Certificate Tracker` holds `NRHL-COMP-v1` and the certificate tiers. |

**The authoritative source is identified:** Google Sheets workbook
`Athlytica Data`, id `1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss`, 16 tabs.

Re-export hazards that must be in the runbook:

- `gviz` **silently returns the first tab** on a name mismatch — it does not
  error. A control request for a nonexistent tab returned the identical 92-row
  `RAW DATA INPUT 2020` payload. Enumerate real tab names first and assert on a
  known column of each response.
- `gviz` truncates mid-row on large payloads.

---

## 7. New issues raised in Phase 0

| ID | Issue | Severity | Class |
|---|---|---|---|
| DQ-046 | `claim_token` embeds the athlete's first name in a shareable token | MEDIUM | D |
| DQ-047 | `convexAdapter.ts` instructs operators to run the year-encoding `normalize-legacy-ids.js` | MEDIUM | D |
| DQ-048 | `parents.phone_number UNIQUE` + `link_guardian()` `ON CONFLICT` = phone-enumeration oracle | HIGH | D |
| DQ-049 | **Compliance-% rollup is broken, not empty** — corrects the Phase-audit finding | HIGH | B |
| DQ-050 | `NRHL-COMP-v1` is not cross-discipline comparable, yet percentile drives certificate tier | HIGH | B |
| DQ-051 | `SK_FWD_BWD_TRANSITION` on the capture sheet has no unit, scale or checkbox | MEDIUM | D |
| DQ-052 | `SK_TSTOP_POWER_BRAKE` is one checkbox for two named skills | LOW | D |
| DQ-053 | Cone spacing undocumented for `SK_FIGURE8_S` / `HK_STICKHANDLING_WEAVE_S` | MEDIUM | D |
| DQ-054 | Dossier self-contradiction: `Eli` listed as a unique first-name match **and** as ambiguous | LOW | D |
| DQ-055 | `Benson_Mbatia_Performance_ID_FINAL.pdf` assigns The Ridge and The Summit on one page | MEDIUM | D |
| DQ-056 | 11 Parent Audit PDFs are an unregistered measured-data source | MEDIUM | E |

### DQ-050 — the composite's structural flaw

`NRHL-COMP-v1` = `attendance% + 20×avg_coach_grade + points`.

Attendance contributes up to 100 and coach grade up to 100, but the points term
is 0–124 **and only reachable by athletes who play scrimmages**. Five certified
athletes (all Inline Skating) score a structural 0 on that term — yet the
percentile rank driving certificate tier is computed across the whole n=18 pool.

Consequence: *Jaydan Morara* (19 sessions, 100% attendance, 0 points) ranks
**below** *Luke Rashed* (1 session, 4 points).

This drives a parent-facing award. Percentile must be segmented by discipline
before it runs again. The historical composite values are **not recomputed or
overwritten** — the flaw is documented and the fix is versioned.

---

## 8. Execution gates

| Gate | Condition |
|---|---|
| G1 | D-01 approved → RLS containment may be applied |
| G2 | D-04 closed and re-export complete → **any** migration may begin |
| G3 | D-03 closed → discipline mapping unblocks 1,669 rows |
| G4 | D-11 closed → age banding unblocks tier-gated metrics |
| G5 | D-02, D-06, D-08 closed → identity resolution may run |
| G6 | D-09, D-10, D-14 closed → derived layer may be computed |

**G2 gates everything.** No row moves out of staging while the authoritative
source is unresolved.
