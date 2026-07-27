---
name: project-scouting-passport-schema-design
description: Key architecture decisions in the Athlytica Scouting Passport Schema v1.0.0 (JSON Schema + Postgres backing) delivered 2026-07-08
metadata:
  type: project
---

Delivered v1.0.0 of the Athlytica Scouting Passport Schema (JSON Schema 2020-12, `$id: https://schema.athlytica.io/scouting-passport/v1.0.0/passport.schema.json`) plus a PostgreSQL relational backing (`athlytica_passport_schema.sql`) as Agent 4 output in the venture pipeline — see [[project-athlytica-vai-pipeline]].

Core design decisions:
- **Provenance is a first-class, normalized concept**, not embedded metadata — every mutable domain table (athlete, sport_profile, biometric_record, custody_record, performance_record, injury_record, representation_claim) carries a `provenance_id` FK into a shared `provenance` table (data_source, entered_by, verification_status/method, confidence_score, source_document_hash for tamper-evidence).
- **Multi-sport extensibility is achieved via a taxonomy/registry pattern, not JSON Schema enums.** `sport_taxonomy`, `discipline_taxonomy`, and `metric_registry` tables let a new vertical (e.g., NRHL inline hockey) onboard via `INSERT` statements only — zero JSON Schema version bump, zero DDL migration. `MetricValue.metric_code` uses a namespaced pattern `^[a-z0-9_]+\.[a-z0-9_]+$` (e.g. `ice_hockey.shot_speed_kmh`) validated against `metric_registry` at ingestion time, not against a hard schema enum.
- **FIFA Article 21/Annex 5 solidarity calc support**: `custody_record.age_band` and `.age_at_start_years` are computed server-side via a `BEFORE INSERT/UPDATE` trigger (`trg_custody_age_band`) referencing `athlete.date_of_birth`, since JSON Schema/generated columns can't cross-table-reference. A `solidarity_claim_input` view pre-joins the rate (0.25%/16-23 vs 0.5%/12-15 — actually 0.25% for 12-15, 0.5% for 16-23) against transfer fee data.
- **Bone-age dispute defense requires longitudinal series, not a scalar field** — `biometric_record` is a table/array keyed by `(athlete_id, measured_at)`, not a single field on `athlete`, because defense strength comes from a continuous series from age ~10-11 onward.
- **Tamper-evidence mechanism**: append-only `audit_log` table (INSERT-only grants in prod), hash-chained via `event_hash = sha256(prev_event_hash || canonical_json(payload))`, computed client/application-side (deliberately not a DB trigger, to keep hashing logic portable/auditable).
- **Sensitive-data flags raised for legal-ip-steward (Agent 5) review**: `athlete.date_of_birth/.legal_name/.national_id_hash`, `guardian_contact.*` (third-party PII, minors), `biometric_record.tanner_stage` (flagged as single most sensitive field in schema — pubertal development marker on minors as young as ~10-11, needs field-level access control beyond table-level RLS), `injury_record.*` (special-category medical data, likely distinct lawful basis from performance data), `representation_claim.contract_reference_hash` (hash-only by design, raw contracts stored off-schema).

**Why:** These decisions directly support the "category-definition" pitch (schema must genuinely extend to non-football sports without a fork) and the "verifiable/tamper-evident" trust claim that Agent 1's research identified as the core differentiator.

**How to apply:** If asked to revise, version-bump, or extend this schema (e.g., add a new buyer segment or sport vertical), preserve the taxonomy/registry extensibility pattern and the normalized provenance table — do not regress to embedding provenance as inline metadata or hardcoding sport-specific fields into the core schema, as this breaks both the extensibility claim and the audit/verification query surface.
