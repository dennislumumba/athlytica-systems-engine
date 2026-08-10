# 04 — NOTION SYNC MAP: The Growth Ops Schema

**Status:** BINDING SCHEMA SPECIFICATION. Unlike manuals 01–03, this maps a system that is **not yet implemented in this repository** (verified 2026-07-12: no Notion/Calendar sync code exists in `app/`, `scripts/`, or `apps-script/` referencing these structures). Downstream models implementing the sync MUST build to this schema exactly — property names and types are contract, not suggestion.
**Purpose:** one relational spine connecting code-level metrics → Notion Enterprise Dashboard → Google Workspace Calendar, so venture execution across Athlytica, NRHL, and Big Ice is tracked in a single queryable surface.

---

## 1. Canonical Notion Database: `Growth Ops — Execution Ledger`

Every tracked unit of work is one row. Exact property schema (Notion API types are load-bearing — filters and rollups break if a select is created as rich_text):

| Property | Notion type | Contract |
|---|---|---|
| `Task Name` | `title` | Imperative, outcome-stated. One deliverable per row — split compound tasks. |
| `Venture Context` | `select` | Exactly one of: `Athlytica`, `NRHL`, `Big Ice`. Cross-venture work is filed under the venture that owns the deadline. No new options without founder sign-off. |
| `Funnel Stage` | `select` | Exactly one of: `Backlog`, `Scoped`, `In Build`, `Gate Review`, `Live`, `Blocked`. `Blocked` rows must name the blocker in the row body. |
| `Google Calendar Trigger` | `date` (with time, TZ `Africa/Nairobi`) | The datetime that materializes a Calendar event. Empty = no calendar footprint. See §3 sync semantics. |
| `Primary KPI` | `rich_text` | The single measurable the task moves, stated with target and unit (e.g., `paid registrations ≥ 40`, `ingest p95 latency < 800ms`). One KPI per row — a task "improving three metrics" is unscoped. |

### 1.1 Required system properties (sync plumbing)

| Property | Notion type | Contract |
|---|---|---|
| `GCal Event ID` | `rich_text` | Write-once by the sync worker after event creation; the idempotency key preventing duplicate events. |
| `Gate ID` | `select` | Populated only for rows in the §4 gate ledger (`G-W6-PAY`, `G-W4-ROSTER`, …). |
| `Due Date` | `date` | Hard deadline. `Google Calendar Trigger` may be earlier (prep block); `Due Date` is the commitment. |
| `Last Synced` | `date` | Set by the worker on every successful push. Stale > 24h with pending changes = sync fault. |

### 1.2 Notion API payload shape (create)

```json
{
  "parent": { "database_id": "<GROWTH_OPS_DB_ID>" },
  "properties": {
    "Task Name": { "title": [{ "text": { "content": "Ship W-6 payment gate to production" } }] },
    "Venture Context": { "select": { "name": "NRHL" } },
    "Funnel Stage": { "select": { "name": "In Build" } },
    "Google Calendar Trigger": { "date": { "start": "2026-07-17T09:00:00+03:00" } },
    "Primary KPI": { "rich_text": [{ "text": { "content": "payment gate live; first successful KES transaction logged" } }] },
    "Gate ID": { "select": { "name": "G-W6-PAY" } },
    "Due Date": { "date": { "start": "2026-07-19" } }
  }
}
```

---

## 2. Code-Level Metric Feeds (repo → Notion)

Metrics that auto-populate dashboard rollups originate from these code surfaces:

| Source | Metric | Feed rule |
|---|---|---|
| `performance_logs` (Postgres) | rows/week, distinct athletes, avg `composite_score` per tenant | Read-only aggregate query; NEVER row-level athlete data into Notion (multi-tenant boundary — manual 02 applies to exports too) |
| `telemetry_ingest_queue` | queue depth, stuck-job count | Threshold alert row when stuck > 0 |
| `athlete_tenant_links` | onboarded athletes per tenant | Weekly snapshot row per venture |
| Payment provider (once W-6 gate is live) | paid registrations count, KES collected | Daily push during the §4 gate window |

Sync direction is **one-way: system → Notion** for metrics, **Notion → Calendar** for scheduling. Notion is never a write-source for the production database.

---

## 3. Google Calendar Sync Semantics

1. Worker scans rows where `Google Calendar Trigger` is set and `GCal Event ID` is empty → creates event on the founder's primary calendar (`Africa/Nairobi`), title `[<Venture Context>] <Task Name>`, description embedding `Primary KPI` and the Notion page URL → writes back `GCal Event ID` + `Last Synced`.
2. Trigger date edits update the existing event via stored ID — never create-and-orphan.
3. `Funnel Stage → Live` prepends `✅` to the event title; events are never deleted (audit trail).
4. Gate-ledger rows (§4) additionally get a **T-48h reminder event** — gates do not get discovered late.

---

## 4. Critical Path: NRHL — RE-ANCHORED (founder decision 2026-07-20)

**Anchor event (current):** NRHL competitive league match-play season formally breaks puck **January 2027**. The 2026-08-22 Draft Day anchor is **RETIRED** by founder decision recorded in §4.4 — the remainder of 2026 is the operational infrastructure + Fall Combine monetization phase. All gate rows carry `Venture Context = NRHL`.

**Historical note:** everything between here and §4.1's retirement marker was authored against the retired 2026-08-22 anchor and is preserved as audit trail, not live instruction.

**Primary tracking automation: `G-W6-PAY` — the W-6 Payment Gate (M-Pesa automated transaction flow).** Canonical designation per founder directive: payment infrastructure **live by 2026-07-19**. Scope: STK push collection, settlement callback verification, receipt issuance, reconciliation sheet. (Calendar note for downstream models: 2026-07-19 is 34 days ≈ 4.9 weeks before Draft Day; `W-6` is the gate's canonical ID, not a recomputable week offset. Do not "correct" the ID.)

**Code-level enforcement (added 2026-07-12):** the gate ledger below is now typed infrastructure — `config/nrhl-gates.ts`. Draft/tournament engines MUST call `assertDraftEngineUnblocked()` at every entry point; it throws `GateBlockedError` (root cause first) while any gate in the chain is unsettled. `G-W6-PAY` flips live exclusively through `settlePaymentGate()`, which requires a schema-valid `MpesaSettlementEvent` (Daraja `resultCode 0` + receipt number). Manual assertion of gate liveness is prohibited — evidence or blocked.

### 4.1 Gate Ledger — ⚠️ RETIRED 2026-07-20 (superseded by §4.5 Fall Combine & Clinic Phase Ledger)

The W-gate ledger below (`G-W5-REG` → `G-DRAFT`, culminating 2026-08-22) is **retired** per the founder decision in §4.4. It is preserved verbatim for audit continuity. `G-W6-PAY` alone survives into the new ledger as the root payment-infrastructure gate — its breached state (§4.3) carries forward unchanged.

| Gate ID | Deliverable | Due | Depends on | Primary KPI | Retirement state |
|---|---|---|---|---|---|
| `G-W6-PAY` | Registration payment gate live — M-Pesa automated transaction flow (STK push, settlement callbacks, receipts, reconciliation) | 2026-07-19 | — (root) | First validated M-Pesa settlement event logged | **CARRIED FORWARD** into §4.5 — still Blocked → escalate |
| `G-W5-REG` | Registration funnel open + sponsor block outreach live | 2026-07-26 | `G-W6-PAY` | Registrations; sponsor conversations | RETIRED |
| `G-W4-ROSTER` | Evaluation pods scheduled; athlete pool synced to `athlete_tenant_links` | 2026-08-01 | `G-W5-REG` | 100% paid registrants linked + pod-assigned | RETIRED |
| `G-W3-EVAL` | Pod sessions executed; 5-pillar scores via telemetry ingest | 2026-08-08 | `G-W4-ROSTER` | Every draft-eligible athlete ≥ 1 scored session | RETIRED |
| `G-W2-CONF` | Conference/draft-board build from composite scores | 2026-08-15 | `G-W3-EVAL` | Draft board locked | RETIRED |
| `G-W1-OPS` | Venue, officials, comms, sponsor activation | 2026-08-20 | `G-W2-CONF` | Ops runbook signed off | RETIRED |
| `G-DRAFT` | Draft Day | 2026-08-22 | All above | Event executed | **RETIRED — re-anchored to January 2027** |

### 4.2 Automation laws for the gate window

1. `G-W6-PAY` is the **single point of failure** for the entire ledger — every downstream gate is calendar-blocked until its `Funnel Stage = Live`. The sync worker flags it `Blocked → escalate` state daily from T-72h if not `Live`. As of authoring (2026-07-12) this gate is **7 days out**.
2. A gate whose upstream dependency slips does not silently keep its date: the worker marks it `Blocked` and surfaces the cascade in the dashboard — slippage is made visible, never absorbed.
3. Gate rows are never deleted or re-dated without a founder-authored comment on the Notion page stating the tradeoff. Dates move only with a recorded decision.
4. Draft-board data flow (`G-W2-CONF`) consumes `composite_score` per manual 03 — same `engine_version` across all evaluated athletes, or scores are not comparable and the board is invalid.
5. **Financial settlement is THE blocking event.** 
---

### 4.3 Timeline Audit — 2026-07-20 (COO session): `G-W6-PAY` BREACHED

**Status transition (evidence-based, per §4.2(1)):** `G-W6-PAY` → **`Blocked → escalate`**.

**Production evidence (Supabase project `athlytica-core-engine`, queried live 2026-07-20):**

- `gate_states`: **zero rows** — no first-evidence record for `G-W6-PAY` exists
- `payment_events`: **0 events total** — no settlement of any origin ever ingested
- `registrations`: **0 total / 0 `PAYMENT_SETTLED`**

Conclusion: no schema-valid `MpesaSettlementEvent` has ever reached `settle_payment_transaction()`; `settlePaymentGate()` has never fired. The gate **did not go live by its 2026-07-19 due date**. Per §4 law ("evidence or blocked"), status is Blocked — manual liveness assertion remains prohibited.

**Cascade (rule §4.2(2) — slippage is made visible, never absorbed):**

| Gate | Due | Cascade state as of 2026-07-20 |
|---|---|---|
| `G-W6-PAY` | 2026-07-19 | 🔴 **BREACHED — Blocked → escalate** (root of critical path) |
| `G-W5-REG` | 2026-07-26 | 🟠 **CALENDAR-BLOCKED** — 6 days of runway remain; the funnel cannot open without payment capture. Every additional day of W6 slip consumes W5 build window 1:1. |
| `G-W4-ROSTER` | 2026-08-01 | 🟡 AT RISK — pod assignment depends on registrant volume from a funnel that is not yet open |
| `G-W3-EVAL` | 2026-08-08 | 🟡 INHERITED RISK — evaluation coverage window compresses with every upstream day lost |
| `G-W2-CONF` / `G-W1-OPS` / `G-DRAFT` | 08-15 / 08-20 / **08-22** | 🟡 Draft Day holds **only if** W6 produces a first validated settlement within ~72h of this audit (by 2026-07-23). Beyond that, a founder-authored re-dating decision (§4.2(3)) is mandatory — silence is not an option. |

**Escalation directive (the unblocking work, in order):** ① provision fail-closed env (`MPESA_CALLBACK_SECRET`, `MSISDN_HASH_KEY`, `OPS_CONSOLE_TOKEN`) ② resolve the §5 MATCHING WARNING — still OPEN; do not open the funnel with payer-reference ambiguity unresolved ③ execute one live KES settlement end-to-end through `app/api/v1/biz/mpesa-callback/route.ts` → `settle_payment_transaction()` and let the RPC write the first `gate_states` evidence row. Nothing else flips this gate.

---

### 4.4 Founder Re-Anchoring Decision Record (2026-07-20 — satisfies §4.2(3))

Per §4.2(3), gate dates move only with a recorded founder decision. This is that record.

**Decision:** NRHL competitive league match-play season re-anchored from 2026-08-22 to **January 2027**. Stated tradeoff: the remainder of 2026 is converted from a compressed launch sprint into a premium infrastructure phase — Athlytica OS integration depth, junior sports group personal-accident + liability underwriting, and professional modular inline court surfacing (Joker Floors partnership track) — funded by an upfront-cash Fall Combine & Clinic monetization phase (§4.5) instead of seasonal league fees.

**Effect on §4.3 cascade:** the 🟡 inherited-risk chain (`G-W4-ROSTER` → `G-DRAFT`) is dissolved by retirement, **not** by remediation. `G-W6-PAY` remains 🔴 Blocked → escalate — the Fall Combine tracks sell paid products from Day 1, so payment capture is still the root gate of the live ledger. The breach now blocks combine revenue instead of draft registration; urgency is unchanged.

### 4.5 Development Phase Ledger (ACTIVE — Aug/Sep/Oct 2026)

> **RENAMED 2026-08-11.** Customer-facing names are **Athlete Performance
> Assessment** (`baseline_7500`), **Performance Hockey Program**
> (`combine_27500`) and **Elite Individual Development**
> (`acceleration_45000`). "Fall Combine", "Tech Profile Track", "Clinic
> Track", "Acceleration Track" and Tier/Track numbering are retired in all
> public copy. Gate ids and checkout tier ids are unchanged. Canonical offer
> definition: `brand-nrhl/league-prospectus.md` §4.

**Monetization law:** all three programmes are **flat, upfront, one-time full-phase package fees**. Nothing in this ledger is monthly recurring. Public copy must never describe these as subscriptions.

| Gate ID | Deliverable | Due | Depends on | Primary KPI |
|---|---|---|---|---|
| `G-W6-PAY` | Payment capture live (carried forward, §4.3 state: **Blocked → escalate**) | OVERDUE (was 2026-07-19) | — (root) | First validated M-Pesa settlement event logged via `settle_payment_transaction()` |
| `C-AUG` | **Athlete Performance Assessment** sold and delivered — one 90-minute session: 10 m / 20 m sprints, broad jump, glide, crossovers, backward skating, stopping, transitions, puck-control skating, hockey movement assessment → Digital Athlete Performance Profile + development priorities | **2026-08-15** | `G-W6-PAY` for automated capture (manual rail per 06 §2.4 as interim) | **≥ 40 assessments × KES 7,500 = KES 300,000 upfront cash** |
| `C-SEP` | **Performance Hockey Program** (KES 27,500 one-time, 3-month phase) at full cohort acquisition — 9 × 120-min group sessions, 3 × 120-min showcase scrimmages, the assessment; 25.5 hrs total; strict 3–8 athletes per coach | **2026-09-01** | `C-AUG` funnel + **⚠️ GATED ON: finalized recurring venue contract — The Hub Karen outdoor footprint** | Cohorts filled at 3–8 cap; venue contract signed BEFORE selling dated sessions |
| `C-OCT` | **Elite Individual Development** (KES 45,000 one-time, 3-month phase) at onboarding saturation — everything in Performance plus **12 × 90-min private coaching sessions** (18 additional hours, 43.5 hrs total), movement/video review where appropriate | **2026-10-01** | `C-SEP` operational proof | Elite cohorts saturated; every Elite athlete receiving their weekly private session |
| `G-DRAFT-27` | **League match-play season + Draft** | **January 2027** (date TBD by founder) | All above — development records inform seeding | Season launched on assessment-established baselines. **No public copy may guarantee a draft position or league selection.** |

**Automation laws carried forward:** §4.2 applies to this ledger in full — blocked upstream gates cascade visibly; `G-W6-PAY` escalates daily until first settlement evidence; re-dating requires a §4.4-style decision record.

---

## 5. NCBA Payment Rail & Onboarding View Requirements (added 2026-07-12)

**Live banking rail (typed source of truth: `config/payment-rail.ts`):**

| Field | Value |
|---|---|
| Rail | NCBA / M-Pesa Paybill |
| Paybill (Business No.) | **880100** |
| NCBA settlement account | **1010539223** (bank-plane identity ONLY) |

**Onboarding view law:** the immediate user onboarding view inside the Hercules engine layout MUST render `PAYMENT_RAIL_DISPLAY` from `config/payment-rail.ts` verbatim — Paybill 880100 plus the account-number instruction — so athlete transaction entry is transparent and entry metrics are captured (the view fires the CRO `PAYMENT_INITIATED` funnel beacon, `/api/v1/marketing/cro`, at the moment rail details are displayed and payment is attempted).

**⚠️ MATCHING WARNING (founder must confirm before G-W6-PAY goes live):** settlement matching runs on each registrant's **unique** `registrations.account_reference`. If the intended payer UX is instead "every athlete enters `1010539223` as the account number," then `account_reference` cannot identify the payer and matching must be redesigned (e.g., on `msisdn_hash`) via a founder decision note. Do not launch the funnel with this ambiguity open — unmatched money lands as `SETTLED_UNMATCHED` and burns reconciliation hours during launch week.

**Enforcement path (code-backed 2026-07-12):**

1. `app/api/v1/biz/mpesa-callback/route.ts` — polymorphic settlement ingestion (`DARAJA_CALLBACK` | `BANK_RAIL` | `MANUAL_RECON`). Every origin is authenticated (`X-Callback-Secret` for machine rails, `X-Ops-Token` for manual recon); fail-closed on unset secrets. Raw MSISDN is HMAC-hashed (`MSISDN_HASH_KEY`) before persistence — DPA posture, raw number never stored.
2. `settle_payment_transaction()` RPC (migration `20260712210000`) — the single atomic transaction path: append-only `payment_events` write, `registrations.payment_status → PAYMENT_SETTLED` flip, first-evidence `gate_states` record for `G-W6-PAY`. Duplicate receipts are constraint-rejected with zero state changes.
3. `settlePaymentGate()` (`config/nrhl-gates.ts`) remains the only sanctioned evidence validator — the route derives gate state from it and never asserts liveness manually.
4. Matched settlements trigger the best-effort draft-authorization webhook (`DRAFT_AUTH_WEBHOOK_URL`); durability lives in the DB state, not the dispatch.

**Env prerequisites (all fail-closed if unset):** `MPESA_CALLBACK_SECRET`, `MSISDN_HASH_KEY`, `OPS_CONSOLE_TOKEN`, optional `DRAFT_AUTH_WEBHOOK_URL`.
