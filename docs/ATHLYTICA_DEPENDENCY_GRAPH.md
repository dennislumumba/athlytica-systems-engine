# Athlytica — Dependency Graph

**Established:** Phase 0.3L, 2026-08-13.
**Companion to** [`ATHLYTICA_MASTER_ROADMAP.md`](ATHLYTICA_MASTER_ROADMAP.md).
Evidence: [`phase0/ATHLYTICA_FOUNDATION_0_3L_REPORT.md`](phase0/ATHLYTICA_FOUNDATION_0_3L_REPORT.md).

This document answers one question: **what has to be true before this work can
start?** It exists because the answer has twice been assumed rather than
checked, and both times the assumption was wrong.

---

## 1. The vertical spine

Each layer needs the one above it to be **true in production**, not merely
written.

```
┌──────────────────────────────────────────────────────────────┐
│  DEPLOYMENT                                    ✅ COMPLETE   │
│  git main → Vercel Git → production → alias → probe          │
│  Without this, every layer below is a claim about a build    │
│  nobody is running.                                          │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  RLS / SECURITY                                🟡 READY      │
│  deny-by-default before the first real row is written        │
│  Retrofitting RLS onto populated PII tables means a window   │
│  where the data was exposed. That window cannot be closed    │
│  retroactively.                                              │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  IDENTITY                                      🟡 READY      │
│  athlete_uid · athlytica_id · legacy ledger · membership     │
│  Two of these four layers do not exist in the database.      │
│  An identifier issued wrongly is permanent.                  │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  SOURCE OF TRUTH                               🔴 BLOCKED    │
│  one authoritative export, identities resolved               │
│  D-04. No file in the repository is authoritative.           │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  STAGING                                       ⚪ DEFERRED   │
│  load, issue IDs in randomised order, prove, then rollback   │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  DERIVED ANALYTICS                             🔴 BLOCKED    │
│  0 UNKNOWN metrics · reproducible formulas · observed_at     │
│  Blocked on decisions (D-09/10/11/12/14), not on data.       │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  ATHLETE PASSPORT                              ⚪ DEFERRED   │
│  the longitudinal record — the product                       │
└───────────────────────────┬──────────────────────────────────┘
                            ▼
┌──────────────────────────────────────────────────────────────┐
│  COMMERCIAL EXPERIENCE                         🟠 SHIPPED    │
│  /register · checkout · CRM · dashboards · portal            │
│  ⚠ Already live, several layers ahead of its foundation.     │
└──────────────────────────────────────────────────────────────┘
```

### Why the bottom box is orange

The spine describes the order in which these layers *should* have been built.
The commercial layer was built first. That is not a criticism — it is why
there is a business to have a foundation for — but it inverts the dependency
graph, and the inversion is the single largest structural risk in the project.

**It is survivable only while every PII table holds synthetic data.** That is
true today: `public.athlete` holds 13 synthetic rows, `guardian_contact` holds
3, `bigice_athlete`/`nrhl_athlete`/`athlytica_core.athletes` and all six
`crm_*` tables hold **zero**, and production has never processed a real
payment. It stops being true the moment one family completes a PIN entry.

---

## 2. Cross-cutting systems

Payments and CRM do not sit on one rung. They cut across the spine.

```
                    ┌───────────────┐
                    │      CRM      │  schema applied to production
                    │   (6 tables)  │  code UNCOMMITTED — D-30
                    └───────┬───────┘
                            │ crm_opportunity.registration_id
                            │ (references money, never restates it)
                            ▼
   ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐
   │ REGISTRATION │──▶│   PAYMENT    │──▶│   AUTHORIZATION    │
   │  /register   │   │ STK · Daraja │   │  M3 replay · M4    │
   │  3 rows      │   │ callback     │   │  venture boundary  │
   │  PENDING     │   │ 5 events,    │   │  settle_payment_   │
   │              │   │ all TEST     │   │  transaction()     │
   └──────────────┘   └──────────────┘   └─────────┬──────────┘
                                                    │
                    ┌───────────────────────────────┘
                    │  a settlement is money truth,
                    │  NOT permission to create an athlete
                    ▼
   ┌──────────────┐   ┌──────────────┐   ┌────────────────────┐
   │   ATHLETE    │◀──│  MEMBERSHIP  │◀──│    ENROLMENT       │
   │  identity    │   │ athlete_     │   │  bigice_enrollment │
   │  layer       │   │ tenant_links │   │  cohort_session_   │
   │  (0.4)       │   │  6 rows      │   │  registry          │
   └──────────────┘   └──────────────┘   └────────────────────┘
```

### The direction of the arrows is the security invariant

Money flows **left to right**. Identity is created **right to left**, and only
with authorization. M4 exists to keep those two directions from collapsing into
one: before it, a settlement that matched nothing would settle *something*, and
settling implied creating.

Three consequences hold today and must keep holding:

1. **A settlement never creates an athlete.** It authorizes a creation that
   some other, gated path performs.
2. **The CRM references money; it never restates it.** `wonKes` comes from
   `crm_opportunity.stage` (what the founder believes closed). `collectedKes`
   comes from `payment_events_production` (what actually arrived). A won
   opportunity with no settled registration is a forecast, and the CRM says so
   — `settledNotWon` is a first-class output, not an error.
3. **`payment_events_production` is the only definition of revenue.** Three
   application consumers read it: `cash-watcher`, `workspace/dashboard`,
   `crm`. None reads `payment_events` for money. It returns 0 rows, so revenue
   correctly reads KES 0.00.

### Where CRM attaches to the spine

CRM is **not** downstream of identity, and that is deliberate — a prospect is
not an athlete and must be representable before anyone is enrolled. But it
**is** downstream of RLS, because a CRM is a PII store by definition. Today its
six tables have RLS enabled, **zero policies**, no `FORCE RLS`, and grants only
to `service_role`. Safe while empty. Not safe once it holds a parent's phone
number.

---

## 3. What can proceed in parallel

These have no unmet dependency on each other. They can be worked simultaneously
by different people.

| Work | Why it is unblocked |
|---|---|
| **Commit the CRM (D-30)** | Pure git hygiene. Depends on nothing. Blocks nothing except itself — and it is the only item on this page that can be *lost* rather than delayed. |
| **RLS containment on `athlytica_core`** | The schema is empty and unreachable. Nothing to break. Must add RLS **without** grants (R17). |
| **Close D-01a** (`public.athletes` escalation) | A policy change on a 6-row table. Independent of identity design. Should happen before any real athlete row exists. |
| **Resolve D-01b** (dormant `FOR ALL` policy on `registrations`) | Deleting an inert policy. No behavioural change today. |
| **`FORCE RLS`** on PII/money tables (D-01c) | Independent of policy content. |
| **Pin `search_path` on `generate_legacy_claim_token`** | One-line migration. |
| **Metric decisions D-09/10/12/14** | Owner decisions about *definitions*. They need the owner, not the dataset — and settling them now removes them from Phase 0.7's critical path. |
| **DOB capture design (D-11)** | A **product** gap, not a data gap. No import fixes it. Design the capture now; it changes `/register` and onboarding, both of which are live. |
| **D-25 credential cleanup** | Deleting five unused Vercel env vars. |
| **D-28a** (`/api/v1/version`) / **D-28b** (delete `master`) | Small, independent, deployment-layer only. |
| **Obtaining the D-04 export** | Not engineering at all. It is a request to the owner, and it should be made **now** because everything in Phase 0.5+ waits behind it. |

## 4. What must wait, and on what

| Work | Waits on | Why the order cannot be swapped |
|---|---|---|
| **Issuing any `athlytica_id`** | R4 decision **and** identity resolution (0.5) | An identifier is permanent. Issued against 504 it collides with a real child (`ATH-537` Elaine, `ATH-566` Shaya Das, `ATH-598` Shirley Makena). Issued before resolution, a duplicated person gets two permanent IDs and the duplication becomes canonical. |
| **M1 / D-20 atomic issuance** | R4 | M1 makes minting atomic. It does not change *which number* is minted. An atomic issuer pointed at 504 atomically issues a colliding identifier — M1 alone makes the bug reliable. |
| **Any legacy import** | **D-04** | No file is authoritative. `2021.csv` has 93 rows; `2021(1).csv` has 1,020. Importing either is a coin toss recorded as fact. |
| **Identity resolution** | D-04, D-02, D-06, D-08 | Resolving `eli` to Eli Das when Eli Araka exists is not a data-quality issue; it is attributing one child's record to another. |
| **Derived analytics on real data** | 0.6 + D-11 | 19 of 27 verified cognitive metrics are unscorable without DOB. |
| **Athlete Passport** | 0.6, 0.7, and RLS | The passport is the most PII-dense surface in the product and it is the thing families keep. |
| **Certificate re-issue** | D-17/18/19 | `NRHL-COMP-v1` reproduces exactly and is structurally unsafe (DQ-050). Freeze holds. |
| **New commercial features** | 0.4 | Not a hard technical dependency — a deliberate hold. Every feature added from here increases the PII sitting behind an unclosed RLS posture. |

---

## 5. The critical path

Everything else is parallel work around this line:

```
D-04 export ──▶ identity resolution ──▶ athlytica_id issuance ──▶ staging
                                              ▲
                                              │ (also requires)
                                          R4 decision
```

**D-04 is the longest pole and it is not an engineering task.** It is a request
for a Google Sheet. Every week it is not asked for is a week Phase 0.5 cannot
start, while Phase 0.4 — which does not need it — is the last thing that can
be built in the meantime.

## 6. The two inversions worth naming

**Inversion 1 — commercial ahead of foundation.** Phase 1.0 shipped before
0.4. Contained today by the absence of real data; uncontained the day a
payment settles.

**Inversion 2 — database ahead of repository.** The CRM schema is applied to
production and its application code is committed nowhere. This is the same
shape as D-28: a truth that exists in one place and is believed to exist in
another. D-28 cost a month of undeployed security work to discover. This one is
cheaper to fix — one commit — and more expensive to lose.
