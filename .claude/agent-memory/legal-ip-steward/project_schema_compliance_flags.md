---
name: project-schema-compliance-flags
description: The six compliance flags Agent 4 raised on the Scouting Passport Schema and this agent's resolution/determination for each
metadata:
  type: project
---

Agent 4's schema (athlete core identity, guardian_contact, biometric_record incl.
tanner_stage/bone_age_estimate_years, injury_record, custody_record, performance_record,
representation_claim, hash-chained append-only provenance/audit_trail) shipped with six
explicit flags for legal review. Determinations made in the 2026-07-08 compliance pass:

1. **national_id_hash pseudonymization standard** — needs a documented salted-hash spec
   (e.g., HMAC-SHA256 with a secret, rotating salt, key held separately from the hashed
   dataset) before it qualifies as "pseudonymization" rather than mere hashing under Kenya
   DPA. Flagged P0 before any paying customer onboards.

2. **guardian_contact lawful basis / cross-border** — parental consent alone is not
   sufficient once data crosses borders (Kenya/Nigeria athlete, Europe-based buying
   club/insurer). Requires Kenya DPA Section 48 transfer safeguard (SCC-equivalent, adequacy,
   or informed consent to the transfer specifically) layered on top of the parental consent
   for collection.

3. **tanner_stage field-level access control** — confirmed as correctly identified highest-
   sensitivity field in the schema (pubertal development data on minors ~10-11). Table-level
   RLS is insufficient; recommended field-level encryption + separate explicit consent capture
   + dedicated access-audit logging distinct from general biometric_record access.

4. **injury_record distinct lawful basis** — resolved as needing per-purpose consent/lawful
   basis tagging (athlete/guardian consent for club use vs contractual necessity for insurer
   use), not a single blanket consent covering the whole biometric/medical category.

5. **representation_claim.contract_reference_hash hash-only design** — confirmed as sound
   IP/PII isolation pattern; keep as-is, do not expand to store raw contract terms in-schema.

6. **OSS release must contain zero real athlete data** — confirmed as the single highest-
   priority pre-publication gate. Any bundled example/sample payloads must be synthetic only,
   with a documented synthetic-data generation note in the repo so the claim is verifiable.

**Why this matters:** these six items map directly to the remediation punch-list delivered to
the pipeline; future agents/turns should treat items 1, 2, 3, and 6 as blocking for the OSS
release, and items 1-4 collectively as blocking for enterprise (paying) onboarding.

**How to apply:** if a future turn revisits the schema, check whether these six items were
actually implemented before assuming they're resolved — this memory records the
recommendation, not confirmation of engineering completion.
