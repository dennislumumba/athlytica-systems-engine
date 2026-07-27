---
name: project-athlytica-pipeline
description: Structure and purpose of the 10-agent venture orchestration pipeline for Athlytica/Big Ice/NRHL
metadata:
  type: project
---

The repo `C:\Users\User Profile\athlytica-systems-engine` runs a 10-agent sequential pipeline (see `runbooks\revenue-agent-runbook.md`) that takes `business-brief.md` through strategy, financial modeling, offer design, data schema engineering, legal/IP compliance, video/content strategy, funnel/email design, QA critique, infra/deployment audit (this agent, Agent 9), and finally operational runbook synthesis (Agent 10, league-ops-marshall).

Final consolidated deliverable path (fixed, per "Consolidation Mandate"): `outputs\revenue-agent-demo.md`. The main session (not any subagent) writes this file.

Repo is NOT a git repository as of 2026-07-08. `outputs\` exists but was empty prior to this pipeline run. `.claude\agents\` holds the 10 subagent definitions.

The core product artifact is an open-source "Athlytica Scouting Passport Schema" (JSON Schema + PostgreSQL DDL) given away free to capture institutional emails, funneling into a high-ticket B2B consult/enterprise platform offer.

**Why:** Understanding this pipeline structure matters because this agent's audits repeat each time the pipeline reruns — infra readiness gaps (no schema/ dir, no public repo, no landing page backend) are likely to recur until the founder actually builds the missing infrastructure.

**How to apply:** When re-invoked as infra-deployment-agent in this repo, check whether the gaps flagged in [[project_oss_schema_deployment_gap]] have been closed before re-flagging them as new findings.
