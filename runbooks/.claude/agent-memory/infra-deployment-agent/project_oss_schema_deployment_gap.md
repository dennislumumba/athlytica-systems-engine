---
name: project-oss-schema-deployment-gap
description: The Athlytica Scouting Passport OSS schema/DDL is marketed as a live download but no hosting/repo/landing infra exists yet
metadata:
  type: project
---

As of 2026-07-08, the pipeline's Agent 4 (db-analytics-architect) designed a JSON Schema (intended future `$id`: `https://schema.athlytica.io/scouting-passport/v1.0.0/passport.schema.json`) and a PostgreSQL DDL file (`athlytica_passport_schema.sql`) as the free OSS lead-magnet download. Agent 6 (video blueprint) and Agent 7 (landing page/email funnel) reference this as "the download link" and gate it behind an institutional email capture form.

None of the following exist yet in the repo or externally: a `schema/` directory holding the JSON Schema + DDL + README + LICENSE + seed data; a public GitHub/GitLab repo; the `schema.athlytica.io` domain/hosting; a landing page backend/form; an email delivery system for the 5-step nurture sequence; an actual YouTube upload. `outputs/` in the repo was empty prior to this pipeline run.

**Why:** Marketing copy from Agents 6/7 describes this download as real/live before any of the supporting infrastructure has been built, creating a broken-link risk if published as-is.

**How to apply:** When this agent (infra-deployment-agent) is re-invoked in future pipeline runs, check whether a `schema/` directory now exists at repo root with the JSON Schema, DDL, README (Apache 2.0 LICENSE per Agent 5), and seed data — if so, this gap may be partially or fully closed and the memory should be updated rather than re-flagged wholesale.
