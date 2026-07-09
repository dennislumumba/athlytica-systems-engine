---
name: athlytica-venture-context
description: Core facts about the Athlytica / Big Ice / NRHL venture and the 10-agent sequential pipeline this conversion-builder role sits inside (Agent 7)
metadata:
  type: project
---

Athlytica is a pre-revenue B2B sports-data infrastructure venture (tied to Big Ice / NRHL) building "Verifiable Athlete Infrastructure" (VAI). This agent (Conversion Systems Architect) runs as **Agent 7** in a 10-agent sequential venture-orchestration pipeline. Upstream agents relevant so far:
- Agent 3 = Positioning (category, tagline, segment value props, objection handling) — see [[positioning_framework]]
- Agent 5 = Legal/compliance guardrails — see [[compliance_guardrails]]
- Agent 6 = Video/content blueprint — defines the lead magnet artifact and on-camera claims that landing pages/emails must honor exactly

**Why:** Each agent's output is a hard constraint for the next. Agent 7's job is to build landing page + email assets strictly on top of Agent 6 (content promises) and Agent 5 (compliance), never introducing new claims.

**How to apply:** Before building conversion assets in future sessions, check whether a fresh Agent 6/Agent 5/Agent 3 handoff has been provided in the prompt — if so, treat the current prompt's handoff as authoritative over this memory (specifics like artifact names/offer prices may change between pipeline runs). Use this memory mainly to recall the *shape* of the venture and the offer ladder pattern, not to skip re-reading a new handoff.

Known offer ladder pattern (as of 2026-07-08 run): Free structural lead magnet (schema/template) → Data Void Audit (a paid diagnostic priced as a range, e.g. $2,000–$5,000) → Athlytica Core (recurring platform, segmented by operator type: Academy/Agency/Federation/Insurer/League). Email sequences must escalate through this exact order without skipping the paid-audit middle step.

Lead magnet artifact from the 2026-07-08 run: "Athlytica Scouting Passport Schema" (JSON schema + PostgreSQL templates + data dictionary), Apache 2.0 licensed, synthetic data only (SYN- prefixed IDs), pseudonymized identity fields, tamper-evident (not "immutable") audit trail.
