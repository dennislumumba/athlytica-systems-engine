# 05 — CORPORATE SKILLS: Charlie OS 42-Skill Manifest Registry

**Status:** ACTIVE REGISTRY (ratified 2026-07-12).
**Authority chain:** per `01_PROJECT_PLANNER.md` — this document < observed repository state < `supabase/migrations/` DDL. When this registry and the repo disagree, the repo is truth.
**Execution frameworks:** Next.js 14 App Router route handlers (`app/api/v1/<domain>/route.ts`), Prisma schema (`prisma/schema.prisma`, drift-check only — deployment DDL lives in Supabase migrations), PostgreSQL (Supabase).

---

## 0. Honesty Contract (read before consuming this registry)

A manifest row is a **routing target**, not a capability claim. Exactly three skills below are **CODE-BACKED** as of 2026-07-12 (this session); every other row is a **MANIFEST TARGET** awaiting implementation through the full Plan–Apply–Unify loop in `01_PROJECT_PLANNER.md`. Downstream models must not treat MANIFEST-TARGET rows as existing endpoints, and must not scaffold them without a founder-authorized task.

**Security law inherited from `02_SECURITY_SWEEP.md`:** every new surface either enforces the tenant barrier, carries the ops-token guard (`utils/opsGuard.ts`), or documents a tenant-exemption justification in its header. No fourth category exists.

---

## 1. Department Registry

### Department 1 — Developers (Engineering & Memory)

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 1.01 | Superpowers (Skill Forge) | Parameterized deploy scripts under `scripts/` | MANIFEST TARGET |
| 1.02 | Context7 (Docs Fetcher) | `app/api/v1/dev/context-fetcher/route.ts` — dev-only dependency index | **CODE-BACKED** |
| 1.03 | MCP Builder (Tool Wright) | Extends `app/api/v1/mcp/route.ts` tool registry (tenant barrier mandatory) | MANIFEST TARGET |
| 1.04 | Skill Creator (Skill Smith) | `.claude/agents/` runtime abstraction generators | MANIFEST TARGET |
| 1.05 | Webapp Testing (QA Engineer) | Playwright e2e harness (`playwright` already in deps) against multi-tenant fixtures | MANIFEST TARGET |
| 1.06 | Claude-Mem (Memory Keeper) | `.agentic-os/` manuals as the cross-session context store (this mechanism, already in use) | MANIFEST TARGET |

### Department 2 — Designers (UI/UX Production)

No UI surface exists yet; per `01_PROJECT_PLANNER.md`, Tailwind conventions activate only when the first `app/<segment>/page.tsx` lands. All six rows are dormant until then.

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 2.01 | UI UX Pro Max (Design Lead) | Design token definitions → `tailwind.config` (on first UI surface) | MANIFEST TARGET |
| 2.02 | Taste (Taste Maker) | Code/theme/layout critique pass in the Unify phase | MANIFEST TARGET |
| 2.03 | Frontend Design (Front of House) | App Router components `app/<segment>/page.tsx` — never `pages/` | MANIFEST TARGET |
| 2.04 | Transitions (Motion Artist) | framer-motion parameters (dependency not yet installed) | MANIFEST TARGET |
| 2.05 | Web Artifacts (Prototyper) | Sandbox renderings before repo commit | MANIFEST TARGET |
| 2.06 | Brand Guidelines (Brand Keeper) | `brand-big-ice/`, `brand-nrhl/` hex boundaries | MANIFEST TARGET |

### Department 3 — Marketing (Conversion Copy)

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 3.01 | Copywriting (Word Smith) | Landing copy for the G-W5-REG registration funnel | MANIFEST TARGET |
| 3.02 | AI SEO (Search Whisperer) | Metadata/route-segment config on future UI surfaces | MANIFEST TARGET |
| 3.03 | CRO (Conversion Lead) | `app/api/v1/marketing/cro/route.ts` — onboarding drop-off vectors → `onboarding_funnel_events` | **CODE-BACKED** |
| 3.04 | Ad Creative (Ad Maker) | Asset formatting under brand dirs | MANIFEST TARGET |
| 3.05 | Customer Research (Voice of Customer) | Interview transcript semantic maps → `config/` context docs | MANIFEST TARGET |
| 3.06 | Lead Magnets (Bait Master) | Distribution templates tied to registration funnel | MANIFEST TARGET |

### Department 4 — Social Media (Distribution Loops)

All six are content-pipeline skills with no repository code surface; they consume repo context (brand dirs, `config/brand-voice.md`) but write no routes.

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 4.01 | Post Writer (Ghostwriter) | Content scripts from `config/brand-voice.md` | MANIFEST TARGET |
| 4.02 | Profile Optimizer (Profile Doctor) | Authority indexing configs | MANIFEST TARGET |
| 4.03 | Reels Scripting (Reel Writer) | Short-form narration loops | MANIFEST TARGET |
| 4.04 | Hook Generator (Hook Smith) | Opening-frame optimization | MANIFEST TARGET |
| 4.05 | Voice Builder (Voice Coach) | Narrative modeling from brand voice doc | MANIFEST TARGET |
| 4.06 | YouTube Thumbnail (Cover Tester) | CTR contrast scoring | MANIFEST TARGET |

### Department 5 — Finance (Treasury Operations)

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 5.01 | Financial Statements (Statement Builder) | Reads `payment_events` ledger (migration `20260712…`) | MANIFEST TARGET |
| 5.02 | Journal Entry (Journal Keeper) | `payment_events` is append-oriented; immutability trigger is open debt (§3) | MANIFEST TARGET |
| 5.03 | Reconciliation (Reconciler) | Daraja settlement callbacks vs `payment_events` rows | MANIFEST TARGET |
| 5.04 | Variance Analysis (Variance Analyst) | Windowed deltas already emitted by cash-watcher payload | MANIFEST TARGET |
| 5.05 | Audit Support (Auditor) | Ledger proof compilation from receipt-unique rows | MANIFEST TARGET |
| 5.06 | Close Management (The Closer) | Period-end settlement over `payment_events` | MANIFEST TARGET |

### Department 6 — Small Business (Cash Management)

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 6.01 | Cash Flow Snapshot (Cash Watcher) | `app/api/v1/biz/cash-watcher/route.ts` — liquidity payload over `payment_events` | **CODE-BACKED** |
| 6.02 | Invoice Chase (Debt Chaser) | Collections reminders keyed on `account_reference` | MANIFEST TARGET |
| 6.03 | Plan Payroll (Payroll Planner) | Compensation dispatch tables | MANIFEST TARGET |
| 6.04 | Margin Analyzer (Margin Analyst) | COGS grids vs settlement amounts | MANIFEST TARGET |
| 6.05 | Tax Prep (Tax Prepper) | KRA category filing routines over the ledger | MANIFEST TARGET |
| 6.06 | Run Campaign (Campaign Runner) | Promotion allocations feeding CRO funnel stages | MANIFEST TARGET |

### Department 7 — Legal (Risk Mitigations)

Document-analysis skills; no code surface. They gate contracts/vendors before anything touches the repo.

| # | Skill (codename) | Execution mapping | Status |
|---|---|---|---|
| 7.01 | Review Contract (Contract Reviewer) | Indemnification text audits | MANIFEST TARGET |
| 7.02 | Triage NDA (NDA Triage) | Disclosure timeline checks | MANIFEST TARGET |
| 7.03 | Compliance Check (Compliance Officer) | Platform/data-protection conformity (Kenya DPA 2019 — minors' data in scope) | MANIFEST TARGET |
| 7.04 | Legal Risk Assessment (Risk Assessor) | Boundary risk flagging | MANIFEST TARGET |
| 7.05 | Vendor Check (Vendor Vetter) | Third-party risk profiling (Daraja/payment vendors first) | MANIFEST TARGET |
| 7.06 | Signature Request (Signature Wrangler) | Multi-party execution tracks | MANIFEST TARGET |

---

## 2. Code-Backed Hook Contracts (implemented 2026-07-12)

| Route | Method | Guard | Contract |
|---|---|---|---|
| `/api/v1/dev/context-fetcher` | GET `?package=<npm-name>` | **Dev-only** (403 in production) + npm-name regex + realpath confinement to `node_modules/` | Returns package manifest index + bounded `.d.ts` file listing. Never returns arbitrary file contents; never accepts paths. |
| `/api/v1/biz/cash-watcher` | GET | `X-Ops-Token` vs `OPS_CONSOLE_TOKEN` env (fail-closed if unset) | 30d/7d liquidity aggregation over `payment_events`: gross KES, tx count, avg ticket, daily run-rate, G-W6-PAY evidence status. `42P01` → 503 SCHEMA_DEBT. |
| `/api/v1/marketing/cro` | POST (public, tenant-exempt — justification in header) / GET (ops-token) | POST: strict Zod, UUID anonymous id, closed stage enum, zero free-text. GET: guarded | POST upserts idempotently into `onboarding_funnel_events`; GET returns per-stage counts + stage-to-stage conversion into `PAYMENT_SETTLED` (G-W6-PAY milestone, due **2026-07-19**). |

**Shared guard:** `utils/opsGuard.ts` — single implementation, never fork per-route copies.

## 3. Open Debt

- ~~**SKL-001**~~ CLEARED 2026-07-12: `payment_events` append-only trigger shipped in migration `20260712210000`.
- ~~**SKL-002**~~ CLEARED 2026-07-12: `app/api/v1/biz/mpesa-callback/route.ts` + `settle_payment_transaction()` RPC now write the ledger (polymorphic origins, all authenticated — see 04 §5).
- **SKL-003:** env secrets must be provisioned in hosting env or guarded surfaces stay sealed: `OPS_CONSOLE_TOKEN`, `MPESA_CALLBACK_SECRET`, `MSISDN_HASH_KEY`, optional `DRAFT_AUTH_WEBHOOK_URL`.
- **SKL-004:** draft-authorization webhook is best-effort (no durable dispatch queue). If draft-profile authorization becomes correctness-critical, promote to the telemetry-queue pattern.
- **SKL-005:** `SETTLED_UNMATCHED` ledger rows require manual reconciliation; resolve the account-reference matching ambiguity flagged in 04 §5 BEFORE funnel launch.
- **SEC-001 (inherited from 02 §4.1):** RLS policies still uncommitted for `cohort_telemetry` / `scouting_metric_log`; new tables here also ship without RLS and rely on the service-role + guard model.
