---
name: project-venture-context
description: Athlytica/Big Ice/NRHL venture overview and the 10-agent orchestration pipeline this agent operates within
metadata:
  type: project
---

Athlytica (with sibling brands Big Ice and NRHL, a regional hockey operator) is building
"Verifiable Athlete Infrastructure" (VAI) — sports data infrastructure aimed at eliminating
data voids in athlete scouting, tracking, and risk/insurance underwriting in emerging markets,
primarily African football academies/clubs/federations plus regional hockey (NRHL/Big Ice).
Positioning line: "what KYC did for finance, Athlytica does for sport."

Founder: Dennis Lumumba Mukhavani, based in Kenya. See [[user_founder_profile]].

Go-to-market funnel: an open-source "Athlytica Scouting Passport Schema" (JSON Schema 2020-12
+ PostgreSQL backing) is released free, institutional-email-gated, as top-of-funnel. This
converts to a paid "Data Void Audit" consult ($2K-5K), then to "Athlytica Core" — a recurring
enterprise platform with Academy/Agency/Federation/Insurer/League editions.

This work happens inside a 10-agent sequential venture-orchestration pipeline (each agent
hands a work product to the next). Known so far:
- Agent 4: produced the production-ready Scouting Passport Schema and flagged six specific
  compliance concerns (see [[project_schema_compliance_flags]]).
- Agent 5 (this agent, Legal & IP Steward): verifies Kenya DPA 2019 compliance, defines the
  IP isolation model (OSS schema vs proprietary platform vs customer-owned data), designs the
  minors' consent architecture, and produces a marketing-claims guardrail list.
- Output is handed downstream to a content-angle-strategist and a conversion-system-builder
  agent, neither of which has access to this agent's memory or conversation — every legal
  deliverable must be self-contained in the response text, not deferred to "see above."

**Why this matters:** the schema itself (the OSS artifact) is literally the free lead magnet —
so any residual PII, unresolved consent gaps, or unclear licensing in that artifact becomes a
public, permanent legal liability the moment it's published, not just an internal risk.

**How to apply:** when reviewing future artifacts from this pipeline, assume downstream agents
(content/growth/conversion) will take any claim in this agent's output and turn it into public
marketing copy verbatim unless explicitly told not to. Always end deliverables with a
green-light/red-light claims section.
