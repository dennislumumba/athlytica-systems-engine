# Athlytica Scouting Passport Schema

Open-source data infrastructure for verifiable athlete records — the Verifiable Athlete Infrastructure (VAI) layer beneath video/wearable scouting tools (Wyscout, InStat, Hudl, Catapult), designed to feed directly into the FIFA Clearing House, federation grant-compliance reporting, and insurance underwriting.

## Contents

- `passport.schema.json` — JSON Schema (2020-12) definition of the canonical Athlytica Scouting Passport record.
- `athlytica_passport_schema.sql` — PostgreSQL 15+ relational backing (DDL) for the schema above.
- `seed/` — synthetic seed data (`SYN-` prefixed identifiers only — never real athlete data).
- `LICENSE` — Apache License 2.0.

## The Three-Layer IP Boundary

This repository is **Layer 1 only**. Understanding the boundary between the three layers is essential to understanding what is — and is not — open source here.

**Layer 1 — Schema (OPEN SOURCE, this repo).**
The JSON Schema, the PostgreSQL DDL, field documentation, and record-type taxonomy. This is the *shape* of verifiable athlete data — not a workflow implementation, not populated data, and not the platform that operates on it. Licensed under Apache 2.0 (see `LICENSE`).

**Layer 2 — Platform (PROPRIETARY, "Athlytica Core").**
The verification workflow engine, matching/deduplication logic, actuarial/risk-scoring models, access-control implementation, UI/UX, and multi-tenant hosting. None of this is, or will be, published in this repository.

**Layer 3 — Data (CUSTOMER-CONTROLLED, never open).**
Actual populated athlete records. Governed entirely by contract between Athlytica and the institution (academy, federation, agency, insurer, or league operator) that owns the data. No real athlete data appears anywhere in this repository, under any circumstance.

The claim "you keep the schema, you keep the data, you keep control" is legally coherent only because this boundary is enforced contractually at the platform layer, not merely illustrated here as an architecture diagram.

## License and Trademark

The schema and DDL in this repository are licensed under the **Apache License, Version 2.0** (see `LICENSE`). Apache 2.0 was chosen specifically for its express patent grant and its permissive-license adoption properties — this repository is meant to let a category form around the taxonomy, not restrict downstream use the way a copyleft license would.

The Apache 2.0 license does **not** grant any rights to the "Athlytica" or "Athlytica Scouting Passport Schema" names, logos, or branding. Trademark terms are governed separately (see `TRADEMARKS.md`, when published).

## Synthetic Data Only

Every example record in this repository — including anything under `seed/` — is synthetic and clearly marked with a `SYN-` prefix. This repository contains no real, identifiable athlete data. Hashed identity fields (e.g. `national_id_hash`) are **pseudonymized, not anonymized** — they remain re-identifiable under an organization's own access controls and are documented as such in the schema's field descriptions. The `audit_trail` / `audit_log` mechanism is **tamper-evident** (hash-chained), not immutable — organizations retain full support for correction and deletion requests against the underlying mutable data store.

## Status

This schema is a versioned specification released for inspection, forking, and independent use. It is not, by itself, a hosted service, and downloading or forking it does not constitute a relationship with Athlytica or access to the Athlytica Core platform.
