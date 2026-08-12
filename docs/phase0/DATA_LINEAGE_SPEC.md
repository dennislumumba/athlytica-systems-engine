# Data Lineage Specification — Phase 0

**Status:** DESIGN. No data ingested.
**Date:** 2026-08-12

> **Rule:** do not create "clean" data that cannot be traced back to its source.
> A value with no lineage is not evidence — it is an assertion.

---

## 1. Lineage chain

Every canonical row must resolve backwards through this chain without a gap:

```
canonical row
  └─ import_batch_id ──────────► import_batch (who ran it, when, which ruleset)
  └─ source_file + source_row ─► stage row (verbatim, all-text)
  └─ source_sheet ─────────────► source_document (file, MD5, provenance)
  └─ normalization_rule_id ────► normalization_rule (versioned, reversible)
  └─ provenance_id ────────────► public.provenance (who observed, verification)
```

Five links. If any is null on a migrated row, the row is not migrated.

---

## 2. Lineage tables

```sql
create table athlytica_core.source_document (
  source_document_id uuid primary key default gen_random_uuid(),
  logical_name       text not null,        -- 'RAW DATA INPUT 2021'
  file_name          text not null,        -- 'Athlytica Data - RAW DATA INPUT 2021(1).csv'
  file_path          text not null,
  md5                char(32) not null,
  byte_size          bigint not null,
  row_count          integer,
  source_system      text not null,        -- 'google_sheets' | 'pdf' | 'supabase'
  workbook_id        text,                 -- Google Sheets document id
  sheet_tab          text,
  captured_at        timestamptz not null, -- when WE took the copy
  source_modified_at timestamptz,          -- sheet's own mtime, if obtainable
  authority_status   text not null default 'SOURCE_CANDIDATE'
                     check (authority_status in
                       ('SOURCE_CANDIDATE','AUTHORITATIVE','SUPERSEDED','REJECTED')),
  authority_note     text,
  decided_by         text,
  decided_at         timestamptz,
  unique (md5)
);

create table athlytica_core.import_batch (
  import_batch_id  uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  mode             text not null check (mode in ('DRY_RUN','EXECUTE')),
  ruleset_version  text not null,
  operator         text not null,
  git_sha          text not null,
  rows_read        integer,
  rows_staged      integer,
  rows_loaded      integer,
  rows_quarantined integer,
  status           text not null default 'RUNNING'
                   check (status in ('RUNNING','SUCCEEDED','FAILED','ROLLED_BACK')),
  note             text
);

create table athlytica_core.normalization_rule (
  rule_id       text primary key,        -- 'DISCIPLINE_MAP_v1'
  rule_version  text not null,
  domain        text not null,           -- discipline | age_band | date | boolean | level
  description   text not null,
  is_reversible boolean not null,
  created_at    timestamptz not null default now()
);

create table athlytica_core.vocabulary_map (
  domain         text not null,
  source_value   text not null,          -- verbatim, including whitespace
  canonical_code text,                   -- NULL = undecided = blocks the load
  rule_id        text references athlytica_core.normalization_rule,
  decided_by     text,
  decided_at     timestamptz,
  note           text,
  primary key (domain, source_value)
);
```

**`vocabulary_map.canonical_code IS NULL` blocks the load for that value.**
That is the mechanism that makes every vocabulary decision explicit and
attributable, and it is why `Foundational Skating` cannot be resolved by
accident.

---

## 3. Staging is verbatim and all-text

```sql
create table stage.raw_session (
  stage_id        bigserial primary key,
  import_batch_id uuid not null references athlytica_core.import_batch,
  source_document_id uuid not null references athlytica_core.source_document,
  source_row      integer not null,
  -- every column text, named exactly as the source header (trimmed only)
  session_id text, session_date text, athlete_id text, athlete_name text,
  age_group text, location text, latitude text, longitude text,
  primary_discipline text, session_focus text, session_duration_mins text,
  rpe text, session_load text, student_level text, determinant_drill text,
  performance_score text, passed_determinant_drill text, coach_grade text,
  work_rate text, technical_breaks text, technical_precision text,
  perfect_recovery text, full_extension_on_push text, low_centre_of_gravity text,
  raw_time_10m_dash text, speed_score text, power_score text,
  scheduled_status text, attendance_status text, payment_status text,
  observation_notes text,
  raw_line        text not null,       -- the entire original CSV line
  unique (source_document_id, source_row)
);
```

Rules:

1. **No type coercion in staging.** `#REF!`, `36.965000°` and
   `"Didn't manage to take the speed"` all land intact.
2. **`raw_line` holds the full original line**, so a column-mapping bug is
   recoverable without re-reading the file.
3. **Header drift is handled at the mapping layer, not by editing the source.**
   The 2020 header `Athlete_ID ` (trailing space) and the 2022 header
   `Low_Center_of\_Gravity` (literal backslash) map to the same staging columns
   via a per-file header map.

---

## 4. Per-file header maps

Because the column set changes every year, each source document carries an
explicit header map. Nothing is matched by fuzzy name.

```sql
create table athlytica_core.source_header_map (
  source_document_id uuid not null references athlytica_core.source_document,
  source_header      text not null,     -- verbatim, including whitespace/backslash
  stage_column       text,              -- NULL = deliberately not ingested
  note               text,
  primary key (source_document_id, source_header)
);
```

Known drift already catalogued:

| Source header | Years | Stage column |
|---|---|---|
| `Athlete_ID ` *(trailing space)* | 2020, 2022 | `athlete_id` |
| `Age / Age_Group` | 2020 | `age_group` |
| `Age_Group` | 2022–2025 | `age_group` |
| `Age` | 2026 | `age_group` |
| `Low Center of Gravity` | 2020 | `low_centre_of_gravity` |
| `Low_Center_of\_Gravity` *(backslash)* | 2022 | `low_centre_of_gravity` |
| `Low Center of Gravity (Check)` | 2026 | `low_centre_of_gravity` |
| `Technical_Precision` / `Technical precision` | 2022, 2026 | `technical_precision` *(staged, not migrated — derived)* |
| `Raw Time(10m dash)` | 2026 | `raw_time_10m_dash` |

An unmapped header **fails the batch**. Silent column drops are how 927 rows go
missing without anyone noticing.

---

## 5. Observation-level lineage

Every `athlytica_core.observation` row carries, non-nullable:

| Column | Meaning |
|---|---|
| `source_file` | file name as ingested |
| `source_row` | 1-indexed data row |
| `source_sheet` | tab name where applicable |
| `import_batch_id` | FK to the batch |
| `raw_value` | the source cell, verbatim, always |
| `provenance_id` | FK to `public.provenance` |

Plus, where normalisation occurred:

| Column | Meaning |
|---|---|
| `observed_at_raw` | source date string, verbatim |
| `date_confidence` | `VERIFIED` / `AMBIGUOUS` / `UNKNOWN` / `SOURCE_ERROR` |
| `date_resolution_note` | which rule fired, or why none could |
| `quality_status` | `OK` / `SOURCE_ERROR` / `UNPARSEABLE` / `NOT_RECORDED` / `QUARANTINED` |

**A round-trip is required:** for any observation, `raw_value` + the referenced
`normalization_rule` must reproduce `value_numeric`. This is assertable in a
test and is the practical definition of "traceable".

---

## 6. Source authority control

Per §22, no file is migrated while its authority is unresolved.

**All 23 local CSV copies are registered as `SOURCE_CANDIDATE`.** None is
`AUTHORITATIVE`. Migration reads only from `AUTHORITATIVE` documents; the loader
refuses any other status.

The authoritative source is known:

> Google Sheets workbook **`Athlytica Data`**, document id
> `1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss`, **16 tabs**.

Local copies represent only 8 distinct tabs. **Four tabs referenced in the
dossier are not present locally at all** — `Certificate Tracker` (which holds
the composite formula and certificate tiers), `Roller Hockey Parent Report`,
`Parent_Report`, `Award_Generator`. `RAW DATA INPUT 2021`–`2024` exist locally
but were outside the dossier's extraction window.

### Re-export protocol — mandatory

1. Export **all 16 tabs** in one session, same timestamp.
2. Record MD5, byte size and row count per tab into `source_document`.
3. **Enumerate real tab names first.** The `gviz` CSV endpoint *silently returns
   the first tab* when a sheet name does not match — it does not error. A control
   request for a nonexistent tab returned the identical 92-row
   `RAW DATA INPUT 2020` payload as requests for other tabs. Any pipeline that
   trusts a `gviz` response without asserting on a known column will ingest 2020
   inline-skating data and report success.
4. **Assert on a known column** of each tab before accepting the payload.
5. `gviz` truncates mid-row on large payloads — push aggregation server-side or
   export via the sheet UI rather than paginating client-side.
6. Mark exactly one document per logical tab `AUTHORITATIVE`; mark the local
   copies `SUPERSEDED`, never delete them.

---

## 7. Registered source documents (Phase 0 — all SOURCE_CANDIDATE)

MD5s recorded 2026-08-12. Full table in `LEGACY_IDENTIFIER_MAPPING.md` §7 and
the Phase-audit mapping document.

| Logical tab | Local copies | Status |
|---|---|---|
| RAW DATA INPUT 2020 | 2 (differ) | SOURCE_CANDIDATE |
| RAW DATA INPUT 2021 | 2 — **93 vs 1,020 rows** | SOURCE_CANDIDATE |
| RAW DATA INPUT 2022 | 1 | SOURCE_CANDIDATE |
| RAW DATA INPUT 2023 | 1 | SOURCE_CANDIDATE |
| RAW DATA INPUT 2024 | 1 | SOURCE_CANDIDATE |
| RAW DATA INPUT 2025 | 2 (differ) | SOURCE_CANDIDATE |
| RAW DATA INPUT 2026 | **6 (all differ)** | SOURCE_CANDIDATE |
| Athlete Progress | 2 — same size, different MD5 | SOURCE_CANDIDATE |
| Group sessions | 2 (identical) | SOURCE_CANDIDATE |
| Scrimmage Tracker | 2 (identical) | SOURCE_CANDIDATE |
| Outsourced | 1 | SOURCE_CANDIDATE |
| Dashboard | 1 | SOURCE_CANDIDATE |
| Certificate Tracker | **0 — absent locally** | MISSING |
| Roller Hockey Parent Report | **0 — absent locally** | MISSING |
| Parent_Report | **0 — absent locally** | MISSING |
| Award_Generator | **0 — absent locally** | MISSING |

### Non-CSV sources also requiring registration

| Document | Content | Status |
|---|---|---|
| `Baseline capture sheet- Riverside.pdf` | Protocol definitions for 12 metrics; blank template, no values | SOURCE_CANDIDATE — **protocol authority** |
| `Benson_Mbatia_Performance_ID_FINAL.pdf` (+ v1/v2/v3) | Real measured values: 10m 2.52s, 20m 3.84s, lateral asymmetry L122/R101 | SOURCE_CANDIDATE |
| `NRHL_Parent_Audit_PDFs_2026_A4_Final/` | **11 per-athlete audit PDFs** with measured values | SOURCE_CANDIDATE |
| `NRHL_CONTEXT_DOSSIER.md` | Protocol + formula extraction, evidence-graded | SOURCE_CANDIDATE — **secondary** |

> The 11 Parent Audit PDFs are a **previously unregistered measured-data
> source**. They are derived views of the `Roller Hockey Parent Report` tab —
> which is one of the four tabs missing locally. They may be the only surviving
> local copy of those values.

**Note on the dossier.** It is a prior extraction, not a primary source. Where
it and the raw CSVs disagree, the CSV wins. Its point formula was independently
reproduced during this audit (31/31 rollups) and matches its own 94/94
per-fixture reconciliation and the `NRHL_POINT_FORMULA` constant in
`lib/services/nrhl-etl.ts` — three independent agreements, so that claim is
`VERIFIED`. Its identity table contains at least one internal contradiction
(it lists `Eli` under "unique first-name match" while its own defect table
records `Eli Das` / `Eli Araka` as ambiguous), so its identity claims are
graded `INFERRED` pending review.

---

## 8. Lineage assertions (tests)

| # | Assertion |
|---|---|
| L1 | Every `observation` has non-null `source_file`, `source_row`, `import_batch_id`, `provenance_id`. |
| L2 | Every `observation.source_file` resolves to a `source_document` with `authority_status='AUTHORITATIVE'`. |
| L3 | `(source_document_id, source_row)` is unique in staging — no double-ingest. |
| L4 | For every observation with `quality_status='OK'`, applying the referenced rule to `raw_value` reproduces `value_numeric`. |
| L5 | No `vocabulary_map` row used by a load has `canonical_code IS NULL`. |
| L6 | Every source header in an ingested file appears in `source_header_map`. |
| L7 | `sum(rows_loaded) + sum(rows_quarantined) = sum(rows_staged)` per batch. |
| L8 | Re-running a batch in `DRY_RUN` after `EXECUTE` reports zero new rows (idempotence). |
