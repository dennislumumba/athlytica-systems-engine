# Metric Registry V2 — Phase 0 Reconciliation

**Status:** DESIGN. Not loaded into `metric_registry`.
**Date:** 2026-08-12
**Machine-readable companion:** `metric_registry_v2.json`

This supersedes the 49-metric draft in `docs/athlytica_metric_registry.json`,
which was written **before** the protocol documents were read. Reconciliation
outcome is summarised in §5.

---

## 1. Status vocabulary

| Status | Meaning |
|---|---|
| `VERIFIED` | Definition, unit, method and direction are attested by a protocol document or reproduced deterministically from data. |
| `INFERRED` | Reasonable reading of the evidence, not attested. Must be reviewed before it drives anything parent-facing. |
| `UNKNOWN` | The metric exists in data but its definition, derivation or direction cannot be established. |
| `DEPRECATED` | Superseded, redundant, or structurally unsound. Retained for provenance. |

**`UNKNOWN` is never silently promoted to `VERIFIED`.** Promotion requires a
named source document and a dated decision, recorded in `DECISION_REGISTER.md`.

---

## 2. Protocol sources newly admitted in Phase 0

| Source | What it establishes | Grade |
|---|---|---|
| `Baseline capture sheet- Riverside.pdf` (2 Apr 2026, surface Concrete/Roller) | 12 metric definitions across 3 blocks + the 4-category per-session capture contract + **discipline gating** | Primary |
| `Benson_Mbatia_Performance_ID_FINAL.pdf` | Real measured values, the 1–10 band + label pattern, bilateral asymmetry with threshold | Primary |
| `NRHL_Parent_Audit_PDFs_2026_A4_Final/` (11 PDFs) | Per-athlete measured values | Primary |
| `NRHL_CONTEXT_DOSSIER.md` §2.5, §2.8 | The Nairobi Deficit ontology, 15 tier-specific metrics, capture modes, band thresholds | Secondary |

### The per-session capture contract (verbatim from the capture sheet)

> **Raw data to take every session**
> 1. **Technical Compliance** — Low COG, Full Extension on Push, Perfect recovery
> 2. **Performance** — Raw Dash (10m) sprint
> 3. **Effort/Engagement** — Technical Breaks (Count), Work Rate, Rate of Perceived Exertion
> 4. **Outcome** — Passed determinant drill

This maps 1:1 onto the `RAW DATA INPUT` columns and is therefore the
**protocol authority** for the session sheet.

**Correction to the Phase-audit draft.** `TECHNICAL_BREAKS_COUNT` was classified
under `technical_skill`. The protocol places it under **Effort/Engagement**.
Reclassified to dimension `engagement`. This matters: it is a discipline/effort
signal, not a skill signal, and must not be aggregated into a technical composite.

### Discipline gating (verbatim from Block 3)

The capture sheet uses an explicit `N/A` matrix:

| Metric | Nahayan (Hockey) | Nile (Junior) | Nyla (Figure) |
|---|---|---|---|
| Stickhandling Weave (s) | ✓ | ✓ | **N/A** |
| Target Accuracy (x/10) | ✓ | ✓ | **N/A** |
| Spiral/Glide Hold (s) | **N/A** | **N/A** | ✓ |
| 1-Foot Spin Rotations | **N/A** | **N/A** | ✓ |

This is the documented answer to *"not every discipline has every metric"* —
discipline is a first-class gate, attested, not invented.

---

## 3. Required fields per metric

Every entry defines all of:

```
metric_id · name · definition · unit · measurement_method · capture_mode
higher_is_better · lower_is_better · source · protocol_version
validity_constraints · minimum_sample · confidence_method · status
dimension · applicable_disciplines · raw_or_derived
```

`higher_is_better` and `lower_is_better` are **both stated explicitly** and must
not both be true. Where direction is genuinely undefined (e.g. exposure
measures) both are `false` and `status` records why.

`capture_mode` — from the dossier's schema implication, three modes needing
different widgets, validation and confidence weighting:

| Mode | Meaning | Example |
|---|---|---|
| `TIMED` | Stopwatch / gate | 20m Sprint |
| `COUNT` | Tally producing a rate | Scan-Before-Touch Rate |
| `OBSERVE` | Subjective ordinal | Crossover Quality 1–5 |

---

## 4. The registry

### 4.1 Block 1 — General Athleticism (off-skate) · protocol VERIFIED

| metric_id | Unit | Method | Direction | Status |
|---|---|---|---|---|
| `GA_SPRINT_20M_S` | s | TIMED, 25m tape, standing start, off-skate | lower better | **VERIFIED** |
| `GA_BROAD_JUMP_CM` | cm | TIMED→distance, two-foot take-off | higher better | **VERIFIED** |
| `GA_SHUTTLE_5_10_5_S` | s | TIMED, pro-agility shuttle | lower better | **VERIFIED** |
| `GA_PLANK_HOLD_S` | s | TIMED, hold to failure | higher better | **VERIFIED** |

Rationale strings are recorded verbatim from the sheet (`Raw acceleration`,
`Explosive leg power`, `Lateral agility`, `Core/skating posture`).

> Protocol is VERIFIED; **captured values are not present in the CSV corpus.**
> The Riverside sheet is a blank template. Measured values exist only in the
> Performance ID / Parent Audit PDFs. `minimum_sample` is therefore unmet for
> every one of these — they cannot yet drive a composite.

### 4.2 Block 2 — Skating Technicals (on-skate) · protocol VERIFIED

| metric_id | Unit | Capture mode | Direction | Status |
|---|---|---|---|---|
| `SK_FIGURE8_S` | s | TIMED | lower better | **VERIFIED** |
| `SK_CROSSOVER_QUALITY` | ordinal 1–5 | OBSERVE | higher better | **VERIFIED** |
| `SK_TSTOP_POWER_BRAKE` | boolean | OBSERVE | pass better | **VERIFIED** |
| `SK_FWD_BWD_TRANSITION` | **UNKNOWN** | UNKNOWN | UNKNOWN | **UNKNOWN** |

`SK_FWD_BWD_TRANSITION` appears on the sheet **with no unit, no scale and no
pass/fail box** — the row is present but the instrument is undefined. It stays
`UNKNOWN`. It is not guessed into an ordinal.

### 4.3 Block 3 — Sport-specific, discipline-gated · protocol VERIFIED

| metric_id | Unit | Disciplines | Direction | Status |
|---|---|---|---|---|
| `HK_STICKHANDLING_WEAVE_S` | s | hockey, junior | lower better | **VERIFIED** |
| `HK_TARGET_ACCURACY_X10` | x/10 | hockey, junior | higher better | **VERIFIED** |
| `FS_SPIRAL_GLIDE_HOLD_S` | s | figure | higher better | **VERIFIED** |
| `FS_ONE_FOOT_SPIN_ROTATIONS` | count | figure | higher better | **VERIFIED** |

### 4.4 Block 4 — Per-session capture contract · protocol VERIFIED, data ABUNDANT

| metric_id | Category | Unit | Mode | Direction | Status |
|---|---|---|---|---|---|
| `TC_LOW_COG` | Technical Compliance | ordinal 1–5 | OBSERVE | higher better | **VERIFIED** |
| `TC_FULL_EXTENSION_PUSH` | Technical Compliance | ordinal 1–5 | OBSERVE | higher better | **VERIFIED** |
| `TC_PERFECT_RECOVERY` | Technical Compliance | ordinal 1–5 | OBSERVE | higher better | **VERIFIED** |
| `PF_RAW_DASH_10M_S` | Performance | s | TIMED | lower better | **VERIFIED** |
| `EE_TECHNICAL_BREAKS` | Effort/Engagement | count | COUNT | **lower better** | **VERIFIED** |
| `EE_WORK_RATE` | Effort/Engagement | ordinal 0–10 | OBSERVE | higher better | **VERIFIED** |
| `EE_RPE` | Effort/Engagement | ordinal 0–10 | OBSERVE | neither | **VERIFIED** |
| `OU_PASSED_DETERMINANT_DRILL` | Outcome | boolean | OBSERVE | pass better | **VERIFIED** |

Measured distribution of the three compliance ordinals in
`RAW DATA INPUT 2026(5).csv` (n=383 each) — all five levels attested:

```
level          1    2     3     4    5
Perfect Rec.  12   62   153   150    6
Full Ext.     17   73   180   101   12
Low COG       21   86   173    90   13
```

`EE_RPE` has **no direction**: high RPE is neither good nor bad, it is a load
descriptor. Both direction flags are `false`.

> **Provenance note on RPE.** The source records it as coach-assigned, not
> athlete-reported. Standard session-RPE is athlete-reported. Recorded as
> `INFERRED` on `confidence_method`; the metric itself is `VERIFIED` because the
> protocol names it.

### 4.5 Cognitive / Tactical — the Nairobi Deficit ontology · dossier-attested

Four deficits, each scored 1–4 every evaluated session:

| Code | Deficit | Direction | Status |
|---|---|---|---|
| `ND_PG` | Puck Gazing | higher better (4=Elite) | **VERIFIED** |
| `ND_PP` | Panic Passing | higher better | **VERIFIED** |
| `ND_HC` | Hero Complex | higher better | **VERIFIED** |
| `ND_SP` | Static Positioning | higher better | **VERIFIED** |

Colour encoding is specified (`1 Red · 2 Orange · 3 Blue · 4 Gold`) and carries
into the UI.

**15 tier-specific metrics**, all direction higher-better, all `VERIFIED` as
definitions:

| metric_id | Tier | Mode | Bands |
|---|---|---|---|
| `U8_M1_EYES_UP` … `U8_M5_POSITIONAL_TRUST` | U8 | OBSERVE 1–4 | — |
| `U12_M1_SCAN_BEFORE_TOUCH` | U12 | COUNT | <20 / 20–50 / 50–80 / >80 % |
| `U12_M2_PASS_ACCURACY_PRESSURE` | U12 | COUNT | accurate vs failed, defender <1 m |
| `U12_M3_SUPPORT_TRIANGLE` | U12 | OBSERVE | "Freeze" call |
| `U12_M4_POSITIONAL_AWARENESS` | U12 | OBSERVE | 5 off-puck moments |
| `U12_M5_WEAK_SIDE_UTILISATION` | U12 | OBSERVE 1–4 | — |
| `U15_M1_TRANSITION_SPEED` | U15 | **TIMED** | >5s / 3–5s / 2–3s / <2s |
| `U15_M2_DECISION_QUALITY_PRESS` | U15 | COUNT | <30 / 30–50 / 50–75 / >75 % |
| `U15_M3_WEAK_SIDE_ENTRY_RATE` | U15 | COUNT | <10 / 10–30 / 30–60 / >60 % |
| `U15_M4_REGAIN_STRUCTURE` | U15 | OBSERVE | first 3 actions post-turnover |
| `U15_M5_OFF_PUCK_CONNECTIVITY` | U15 | OBSERVE 1–4 | — |

`U8_M3_ENGAGEMENT_LEVEL` carries a **wellbeing flag**: a score of 1 is a
guardian-notification trigger, not a performance signal. Tagged
`category: wellbeing`, excluded from every performance composite.

> **Blocker.** These are tier-gated (U8/U12/U15) and tier assignment requires
> date of birth. **DOB is not collected anywhere** in the current funnel, and
> age group is unstable per athlete at source (Shaya Das appears as both U8 and
> U12 within 2026). None of these 15 metrics can be scored reliably until DOB
> capture exists. Recorded as Decision **D-11**.

### 4.6 Derived — retained, versioned, never stored as raw

| metric_id | Rule | Version | Status |
|---|---|---|---|
| `DV_TECHNICAL_PRECISION` | `4 − 2 × EE_TECHNICAL_BREAKS` | `TECHPREC-v1` | **VERIFIED** (265/265) |
| `DV_NRHL_POINTS` | `3×assisted + 1×solo + 1×assists` | `NRHL-PTS-v1` | **VERIFIED** (94/94 + 31/31 + code) |
| `DV_NRHL_COMPOSITE` | `attendance% + 20×avg_coach_grade + points` | `NRHL-COMP-v1` | **VERIFIED** (18/18, max residual 0.048) |
| `DV_TECHNICAL_RATING` | mean of `DV_TECHNICAL_PRECISION` | `TECHRATE-v1` | **DEPRECATED** — see §6 |
| `DV_COMPLIANCE_RATE_*` | rate over an ordinal threshold | — | **UNKNOWN** — threshold undefined |
| `DV_SPEED_SCORE_2026` | UNKNOWN | — | **UNKNOWN** |
| `DV_POWER_SCORE_2026` | UNKNOWN | — | **UNKNOWN** |
| `DV_SESSION_LOAD` | apparently `RPE × duration` | — | **INFERRED** |

---

## 5. Reconciliation against the 49-metric draft

| Draft entry | Outcome |
|---|---|
| 10 `proposed` (no data) | **7 promoted to `VERIFIED` protocol** by the Riverside sheet — `GA_SPRINT_20M_S`, `GA_BROAD_JUMP_CM`, `GA_SHUTTLE_5_10_5_S`, `GA_PLANK_HOLD_S`, `SK_FIGURE8_S`, `HK_STICKHANDLING_WEAVE_S`, `FS_ONE_FOOT_SPIN_ROTATIONS`. Protocol verified; **sample still zero**. |
| `COGNITIVE_DECISION_SPEED` (proposed, invented ordinal) | **Replaced** by the attested `U15_M2_DECISION_QUALITY_PRESS` (COUNT with bands). The invented 1–5 ordinal is discarded. |
| `TECHNICAL_BREAKS_COUNT` dimension `technical_skill` | **Corrected to `engagement`** per the capture contract. |
| "compliance % columns are empty" | **Wrong.** Raw ordinals are abundant (383 rows, all 5 levels). The rollup formula is broken. Reclassified `UNKNOWN` (threshold), not "no data". |
| `NRHL_ASSISTED_GOALS` / `UNASSISTED` "split destroyed" | **Partially wrong.** Destroyed in the *extract*; **present in the source** — `Scrimmage Tracker` carries `Assisted \| Solo \| Total \| Assists \| Points` as five unlabelled columns, with `Assisted + Solo == Total` holding 94/94. Recover from source, not algebra. |
| 13 `existing` (TTA football) | Unchanged. Out of scope for BIIF/NRHL. |
| `VEO_CLIP_TAG` | Confirmed `DEPRECATED` as a metric — it is verification evidence. |
| 15 tier-specific cognitive metrics | **New — absent from the draft entirely.** |
| 4 Nairobi Deficit codes | **New — absent from the draft entirely.** |
| `DV_NRHL_COMPOSITE` | **New — the draft missed the composite formula.** |

**Net:** the draft under-counted the verified protocol surface substantially. It
had 10 speculative `proposed` entries and no cognitive registry; the protocol
documents supply 19 attested cognitive/tactical metrics and upgrade 7 of the 10.

---

## 6. `DV_TECHNICAL_RATING` — direction audit (§11)

**Finding:** the implementation has inverted semantics relative to its name.

Evidence, from `athlete_individual_stats.csv`:

| Athlete | technical_rating | Attendance | Speed rating |
|---|---|---|---|
| Noel Inoue (top scorer, 124 pts) | **−1.667** | 100% | 8.17 |
| Dakota Weening | **−2.0** | 100% | 5.2 |
| Leroy Sila | **+2.4** | 40% | 1.6 |
| Gabi Helena | **+0.941** | 88.2% | 4.59 |

Chain: `EE_TECHNICAL_BREAKS` (lower better) → `4 − 2×breaks` (**higher better**)
→ per-athlete mean → column named `technical_rating`.

So `DV_TECHNICAL_PRECISION` is *correctly* higher-better. The defect is that the
observed values invert against performance because **high performers accumulate
more breaks** — they attempt harder work. A raw break count is confounded with
exposure and difficulty; averaging it and calling it a "rating" makes the
confound invisible.

**Action taken — none to historical values.** Per §11:

- `DV_TECHNICAL_RATING` → **`DEPRECATED`**, retained with its formula and this note.
- `technical_rating_v2` is **not defined here.** Defining it requires deciding
  whether to normalise breaks by session count, drill difficulty, or both — that
  is Decision **D-10**, not an implementation detail.
- Historical values are **not overwritten, not recomputed, not deleted.**
- Nothing is averaged into a composite until direction is explicit.

---

## 7. Metrics that block migration

| Metric | Why blocked | Decision |
|---|---|---|
| `DV_COMPLIANCE_RATE_*` | Threshold for "compliant" undefined; source rollup yields 0% against abundant data | D-09 |
| `DV_TECHNICAL_RATING` | Direction confounded with exposure | D-10 |
| `DV_SPEED_SCORE_2026`, `DV_POWER_SCORE_2026` | Derivation unknown; not a function of `PF_RAW_DASH_10M_S` (values present where the dash is free text) | D-12 |
| `SK_FWD_BWD_TRANSITION` | Instrument undefined on the sheet | D-12 |
| All 15 tier-specific metrics | Tier gating requires DOB; DOB not collected | D-11 |
| `DV_SESSION_LOAD` | `#REF!` in 100% of 2022; formula inferred not attested | D-14 |

Six open items. **The registry cannot be finalised in Phase 0**, which is the
correct outcome — §9 explicitly says not to finalise it yet.
