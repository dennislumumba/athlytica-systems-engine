# Authoritative Source Export Specification — Phase 0.1

**Status:** SPECIFICATION. **No export has been performed.**
**Date:** 2026-08-12

---

## 1. The source

| | |
|---|---|
| Workbook | `Athlytica Data` |
| Document id | `1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss` |
| Tabs | **16** |
| Local coverage | 12 tabs, 23 files, 8 divergent pairs, **4 tabs missing entirely** |

**No local file may be selected as authoritative.** Selection by row count is
explicitly prohibited — `2021.csv` (93 rows) vs `2021(1).csv` (1,020 rows) has
no correct answer derivable from the files themselves.

---

## 2. Required tab manifest

All 16 must export. A partial export **fails the run**.

| # | Tab | Local? | Notes |
|---|---|---|---|
| 1 | `RAW DATA INPUT 2020` | 2 copies, differ | |
| 2 | `Outsourced` | 1 | institutional bookings, no athlete identity |
| 3 | `RAW DATA INPUT 2021` | **93 vs 1,020 rows** | the widest divergence |
| 4 | `RAW DATA INPUT 2022` | 1 | `#REF!` in 100% of `Session_Load` |
| 5 | `RAW DATA INPUT 2023` | 1 | |
| 6 | `RAW DATA INPUT 2024` | 1 | |
| 7 | `RAW DATA INPUT 2025` | 2 copies, differ | |
| 8 | `RAW DATA INPUT 2026` | **6 copies, all differ** | |
| 9 | `Group sessions` | 2 identical | documents the 3-pts-for-assists doctrine |
| 10 | `Scrimmage Tracker` | 2 identical | **NRHL source of truth**; holds assisted/solo split |
| 11 | `Athlete Progress` | 2, same size, different MD5 | broken compliance-% rollup |
| 12 | `Dashboard` | 1 | presentation only |
| 13 | **`Certificate Tracker`** | **MISSING** | **holds `NRHL-COMP-v1` + the n=18 pool. Blocks DQ-050.** |
| 14 | **`Roller Hockey Parent Report`** | **MISSING** | source of the 11 Parent Audit PDFs |
| 15 | **`Parent_Report`** | **MISSING** | |
| 16 | **`Award_Generator`** | **MISSING** | |

Tab 13 is the highest-value item in this specification. Without it DQ-050 cannot
be resolved and no certificate decision can be made.

---

## 3. Fail-closed requirement — non-negotiable

> **If a requested tab does not exist, or its name does not match exactly, the
> pipeline MUST FAIL. It must never silently return the first tab.**

This is not defensive programming. It is a measured hazard.

The `gviz` CSV endpoint **silently returns the first tab when a sheet name does
not match** — it does not error, does not warn, and returns HTTP 200. A control
request for a nonexistent tab returned the identical 92-row
`RAW DATA INPUT 2020` payload as legitimate requests for other tabs.

**Consequence:** a pipeline requesting `INPUT 2026` receives 2020 inline-skating
data, writes it under the 2026 label, and reports success. Every downstream
count, every discipline classification and every athlete roster derived from it
would be wrong, and nothing would indicate a failure.

Two tab names cited in previously shipped Parent Audit PDFs — `INPUT 2026` and
`Group Sessions Week 12` — **do not exist in the workbook**. Any pipeline built
from those PDFs has already been requesting phantom tabs.

### Mandatory guards

| # | Guard | Failure mode caught |
|---|---|---|
| **G1** | Enumerate real tab names from the document **before** requesting any data. Reject any name not in the enumeration. | phantom tab names |
| **G2** | For each response, assert on a **tab-specific known column** before accepting. | silent first-tab substitution |
| **G3** | Assert the returned row count is not identical to tab 1's row count, unless the tab *is* tab 1. | first-tab substitution on same-shaped tabs |
| **G4** | Assert every expected column name is present. | truncated or reordered export |
| **G5** | Reject any payload whose final line is not a complete record. | `gviz` mid-row truncation on large payloads |
| **G6** | Fail the **entire run** if any tab fails. No partial manifest is valid. | mixed-vintage corpus |

### Per-tab assertion columns (G2)

| Tab | Assert column present | Assert value |
|---|---|---|
| `RAW DATA INPUT 2020` | `Athlete_ID ` *(trailing space)* | header has no `Latitude` |
| `RAW DATA INPUT 2022` | `Low_Center_of\_Gravity` *(literal backslash)* | header has `Latitude` |
| `RAW DATA INPUT 2026` | `Raw Time(10m dash)` | header has `Speed score` |
| `Scrimmage Tracker` | `Assisted Goals` | row 1 col D |
| `Athlete Progress` | `Avg Tech Precision` | header row is row 3, not row 1 |
| `Certificate Tracker` | composite / tier columns | to be confirmed on first sight |
| `Group sessions` | `Skills Targeted` | contains "3pts for assist goals" |
| `Outsourced` | `Institution` | exactly 2 columns |

The 2020/2022 assertions are deliberately chosen to be the *malformed* header
names. They are unique, they cannot be produced by a substituted tab, and they
double as a check that the export preserved the anomalies rather than cleaning
them.

---

## 4. Required manifest output

One row per tab. The run is invalid if any field is absent.

```jsonc
{
  "export_run_id": "uuid",
  "workbook_id": "1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss",
  "export_started_at": "ISO-8601",
  "export_completed_at": "ISO-8601",
  "exporter": "who ran it",
  "method": "sheets_ui_download | gviz | sheets_api_v4",
  "tabs": [
    {
      "tab_name": "RAW DATA INPUT 2021",
      "tab_identifier": "gid or sheetId",
      "row_count": 0,
      "column_count": 0,
      "column_names": [],
      "export_timestamp": "ISO-8601",
      "source_modified_timestamp": "ISO-8601 or null",
      "sha256": "…",
      "md5": "…",
      "byte_size": 0,
      "assertion_column": "…",
      "assertion_passed": true,
      "first_row_sample": "…",
      "last_row_complete": true
    }
  ],
  "guards": { "G1": "pass", "G2": "pass", "G3": "pass",
              "G4": "pass", "G5": "pass", "G6": "pass" },
  "status": "VALID | FAILED",
  "failure_reason": null
}
```

`sha256` is added alongside `md5`; the Phase 0 MD5s exist only to identify the
superseded local copies, and md5 is not a suitable integrity primitive going
forward.

`source_modified_timestamp` is best-effort — Sheets exposes a document-level
modified time, not per-tab. Record the document-level value and mark it as such;
do not imply per-tab precision that does not exist.

---

## 5. Validation against the Phase 0 baseline

The export is not accepted until it is diffed against the audit's measured
figures. Differences are expected — the point is that each one is *explained*.

| Baseline | Phase 0 value | On difference |
|---|---|---|
| Canonical session rows | 3,096 | recount; the canonical set was a provisional pick |
| Distinct athlete IDs | 209 | investigate any new or missing ID |
| Distinct session IDs | 1,364 | |
| BIIF / NRHL / unassigned | 2,467 / 520 / 109 | reclassify from the export |
| Athletes in both orgs | 30 | confirm — this drives the whole membership model |
| `Technical precision = 4 − 2×breaks` | 265/265 | must still hold, or the metric registry is wrong |
| Compliance ordinals per column | 383, levels 21/86/173/90/13 | must still hold |
| `NRHL-PTS-v1` | 94/94 + `assisted+solo == total` | must still hold |
| `NRHL-COMP-v1` | 18/18, max residual 0.048 | **first chance to verify — `Certificate Tracker` was missing** |
| Contested identifiers | 8 | |
| Duplicate-athlete name pairs | 15 | |
| Undecidable dates | 1,041 | |
| `#REF!` occurrences | 984 | |

**All Phase 0 figures are provisional until this diff runs.** They were measured
against `SOURCE_CANDIDATE` files.

---

## 6. Handling of superseded local copies

| Action | Applies to |
|---|---|
| Mark `SUPERSEDED` in `source_document` | all 23 local CSVs |
| **Never delete** | all 23 |
| Retain MD5 | all 23 — they identify which vintage a prior analysis used |
| Mark `AUTHORITATIVE` | exactly one document per logical tab, from this run |

A second export run supersedes the first the same way. Authority is a property
of a recorded decision, never of a filename.

---

## 7. Also to be registered as sources

Not CSVs, but they carry protocol and measured values:

| Source | Contains | Grade |
|---|---|---|
| `Baseline capture sheet- Riverside.pdf` | protocol for 12 metrics, discipline gating, the 4-category session contract | **primary protocol authority** |
| `NRHL_Parent_Audit_PDFs_2026_A4_Final/` (11 PDFs) | per-athlete measured values | primary |
| `Benson_Mbatia_Performance_ID*.pdf` (4 versions) | measured values; `ATH-043` cross-checks the CSV corpus | primary |
| `NRHL_CONTEXT_DOSSIER.md` | prior extraction, evidence-graded | **secondary** — CSV wins on conflict |

The 11 Parent Audit PDFs are derived from tab 14, which is missing locally —
they may be the only surviving local copy of those values.

---

## 8. Acceptance criteria

The export is `AUTHORITATIVE` only when **all** hold:

- [ ] All 16 tabs present; none missing, none substituted
- [ ] G1–G6 all pass
- [ ] Every tab has row count, column count, column names, timestamp, sha256, md5
- [ ] Every assertion column verified
- [ ] Last row of every tab is a complete record
- [ ] `Certificate Tracker` present and non-empty
- [ ] Diff against §5 complete, every difference explained
- [ ] Exactly one `AUTHORITATIVE` document per logical tab
- [ ] All 23 local copies marked `SUPERSEDED`, none deleted
- [ ] Manifest committed to the repository

**Until every box is ticked, no migration reads from any source.**
