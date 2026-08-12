# Athlytica — Master Foundation Status

**Phase 0 · 0.1 · 0.2 complete · Phase 1 NOT started**
**Date:** 2026-08-12 · **Commit:** `0441e0c`
**Production data changes to date: zero.**

> **Durable context lives in [`docs/ATHLYTICA_PROJECT_STATE.md`](../ATHLYTICA_PROJECT_STATE.md).**
> Read that first. This document is the architectural status; that one is the
> operational state a future session resumes from.

---

## 0. PHASE 0.2 STATUS

**Objective:** production containment, identity integrity, payment
reconciliation, authorization security. Full report:
[`PHASE_0_2_CONTAINMENT_REPORT.md`](PHASE_0_2_CONTAINMENT_REPORT.md).

### WHAT WAS VERIFIED

- **Test suite executed: 142 pass / 0 fail.** Real run, not assumed.
- **`likeEscape` is committed to `main`** (`0441e0c`) and wired into
  `resolveGuardian()`. **4 of STEP 4's 10 cases pass at unit level** — the
  wildcard class, which is the actual defect. The other 6 need a database.
- **Root cause of the burned IDs found in code**: `bigice-onboarding.ts:190`
  mints via RPC, `:200` inserts in a separate round-trip, no transaction. Any
  failure between them burns a permanent identifier. Same pattern in two NRHL
  routes.
- **Migration drift root cause confirmed verbatim from postgres logs**:
  `apply_migration` stamps `to_char(current_timestamp,'YYYYMMDDHH24MISS')`.
- **`bigice_academy_name_parity` confirmed applied with no local file** — the
  repo cannot rebuild production.
- **Payment state machine audited**: append-only enforced, callback idempotent,
  settlement deterministic, failed payments cannot enroll. All five payments
  stopped at `PAYMENT_CONFIRMED`.
- **Big Ice / NRHL separation: no package contamination found.**

### WHAT WAS CHANGED

Two documents. **No source file, no schema, no data.**

### WHAT WAS NOT CHANGED

No production mutation of any kind — every statement executed was `SELECT`. No
migration applied, renamed or deleted. No RLS change. No certificate touched.
No legacy data migrated. No branch created. No burned ID recycled.

### PRODUCTION CHANGES

**None.**

### CORRECTIONS TO EARLIER REPORTING

- Postgres-log hits for `link_guardian` (10) and `bigice_next_athlete_code` (6)
  are **migration DDL text, not runtime calls**. `athlytica_core.parents` is 0
  because the function has never been invoked at runtime. My initial reading of
  those counts as invocations was wrong and is corrected in the report.

### D-21 CLOSED — 2026-08-12

Owner checked the Safaricom statement: **`SGX7HQ2LM9` is not on it. It was the
founder's own test.** No customer impact.

Three consequences:

1. **All five `payment_events` are synthetic** — 658,000 KES of fake
   settlements. R14 widens from four rows to five.
2. **Production has never processed a real payment.** With zero athletes,
   guardians and enrollments, **the system has never held real customer data.**
   Every "empty table, zero blast radius" claim in these documents is now
   confirmed across the payment plane as well.
3. **New finding R16 / D-23:** `gate_states.G-W6-PAY` is `live = true` with
   `evidence = 'AUDITTEST001'`. It is the root of the NRHL critical path;
   `G-W5-REG` depends on it and `assertDraftEngineUnblocked()` hard-blocks on
   it. Its KPI — *"First validated M-Pesa settlement event"* — is recorded as
   met and has never occurred. Because settlement writes the gate with
   `on conflict (gate_id) do nothing`, a genuine first payment will **never**
   overwrite the test evidence.

### NEXT SINGLE ACTION

> **Decide OPS-1: approve a billable Supabase branch, or nominate an equivalent
> isolated environment — then run RLS tests R1–R12.**

RLS is now the last critical finding that can still be closed *before* any real
data exists, and it is blocked only on an environment decision.

---

## 1. EXECUTIVE STATUS

The foundation is **designed and evidenced, not built**. Nothing has been
migrated, no athlete record altered, no public Athlete ID issued.

Three things changed the picture in Phase 0.1:

1. **A live cross-household data leak was found in the parent portal**, already
   fixed in uncommitted parallel work. `resolveGuardian()` passes the signed-in
   email straight into `.ilike()`, so `_` acts as a SQL wildcard — one household
   matched another's children. The fix (`likeEscape`) exists but is **not
   committed and not deployed**. Exposure is currently zero only because
   `bigice_athlete` has no rows.
2. **DQ-050's diagnosis was wrong, and the correct one changes the fix.** The
   certificate distortion is driven by **exposure**, not discipline: all 16
   zero-point athletes have zero scrimmage appearances, and the discipline label
   is near-constant across the file. Segmenting percentile by discipline — the
   previously recommended fix — would not have worked.
3. **Every local migration version differs from its applied version.** The
   database is fine; the ledger is not. A single `supabase db push` would replay
   32 migrations and halt on the sixth.

Then a fourth thing happened **during Phase 0.1 itself** — see §1a. The system
is not static, and two claims in this document's first draft were already stale
when written.

---

## 1a. STATE CHANGE OBSERVED MID-PHASE — read this before acting

Re-verified at the close of Phase 0.1:

| Fact | At Phase 0 close | Now | Meaning |
|---|---|---|---|
| `athlytica_core.scalable_id_sequence` | **500** | **504** | **Four athlete codes were issued during this session** |
| `bigice_athlete` / `nrhl_athlete` rows | 0 | **0** | …and no athlete row persisted. Four codes are **burned**. |
| `payment_events` | reported 0 | **5** | The Phase 0 "0" came from `list_tables`, which returns a **stale `reltuples` estimate**, not a count. The rows predate this session. |
| `registrations` | 1 | 1 | unchanged |

**Two corrections to my own prior reporting:**

1. **"Zero IDs issued under the new model" remains true** — but the *old*
   issuer is live and moved four places. `nrhl_next_athlete_code()` /
   `bigice_next_athlete_code()` ran, drew `501`–`504`, and nothing was written.
   This is R3/R4 **materialising during the audit**, not hypothetically.
2. **`payment_events` was never empty.** Phase 0 read a cached row estimate and
   I repeated it. Corrected here.

### What is in `payment_events`

| Receipt | Amount | Account ref | Matched a registration? |
|---|---|---|---|
| `AUDITTEST001` | 180,000 | `ATH-SZTV` | no |
| `AUDITTEST002` | 350,000 | `ATH-TRKK` | no |
| `AUDITTEST003` | 16,500 | `ATH-BF9V` | no |
| `AUDITTEST004` | 95,000 | `ATH-R7K2` | no |
| **`SGX7HQ2LM9`** | **16,500** | `ATH-9GG9` | **no** |

Four are self-evidently synthetic (`AUDITTEST00n`). **The fifth is not.**
`SGX7HQ2LM9` has M-Pesa receipt shape and 16,500 KES is exactly the live
Beginner Skating Programme price.

The only `registrations` row is `ATH-9YWQ` — *Adonis*, NRHL, `combine_27500`,
still `PENDING_PAYMENT`. **No account reference in `payment_events` matches any
registration**, so all five settled as `SETTLED_UNMATCHED`.

**Two consequences that are not architecture problems:**

- **A possibly-real 16,500 KES payment is unreconciled.** If it is real, a
  parent has paid and has no enrollment, no document and no portal access.
  This needs a human to check today. It is a customer-service question before
  it is a data question.
- **Four test receipts are now permanent.** `payment_events` is append-only,
  enforced by a trigger that raises on DELETE. Synthetic receipts in production
  cannot be removed — only annotated. Any future revenue figure must exclude
  them explicitly, and nothing currently marks them as test.

**Neither was caused by this phase, and neither was fixed by it.** Both are
reported, not touched.

### Effect on the containment script

`0001_rls_containment.sql` hardcoded `expected sequence = 500`. It would now
**correctly refuse to run** — the guard did its job. The script has been updated
to compare against a value observed immediately before apply, rather than a
constant, because the sequence is demonstrably moving.

Nothing here is a crisis, because the athlete tables are still empty. That is
also the entire reason to act now rather than later — the window is visibly
closing.

---

## 2. CANONICAL ARCHITECTURE

One canonical athlete. Full designation register in
`CANONICAL_ATHLETE_ARCHITECTURE.md` §1.

| Designation | Tables |
|---|---|
| **CANONICAL** | `athlytica_core.athlete`, `athlete_identifier`, `organization`, `athlete_organization_membership`, `enrollment`, `observation`, `parent`, `parent_athlete_link`, `public.provenance` |
| **MIRROR** | `public.athletes` (auth↔athlete join, TTA telemetry) |
| **LEGACY** | `public.athlete` (13 rows), `public.performance_logs`, `metric_value`, `athlete_metrics_log` |
| **PROJECTION** | `public.nrhl_athlete`, `public.bigice_athlete` → views |
| **DEPRECATED** | `athlytica_core.athletes`, `athlytica_core.performance_logs`, `public.scouting_metric_log` |

Layer order, one-directional:

```
ATHLETE → ORG MEMBERSHIP → ENROLLMENT → OBSERVATION → DERIVED → PASSPORT PROJECTION
```

**Status: designed, unapproved, unbuilt.**

---

## 3. ATHLETE ID MODEL

| | |
|---|---|
| `athlete_uid` | `uuid`, primary key, every FK target |
| `athlytica_id` | `ATH-000001`, 6 digits, public, `UNIQUE NOT NULL`, never a key, never a credential, never reused |

Issued from a **new** `athlytica_core.athlytica_id_seq` starting at 1 — **not**
`scalable_id_sequence`, which sits at 500 and would collide with legacy
`ATH-500`…`ATH-638`. Assignment order randomised so the ID leaks no registration
order.

**Two live routes currently issue colliding codes** from the old sequence:
`workspaces/nrhl/onboard-paid-athlete:144` and `leagues/nrhl/ingest:146`. Both
are pre-existing, both are reachable from a settled payment. See §12.

**Status: specified. Zero IDs issued.**

---

## 4. ORGANIZATION MODEL

Organizations become rows (`BIG_ICE`, `NRHL`, `ATHLYTICA`, `TTA`), replacing
three incompatible mechanisms (`tenants` table, `workspace` enum,
`venture_context` CHECK — the last of which omits TTA).

Membership is separate from identity. **30 athletes already appear in both Big
Ice and NRHL disciplines**, so cross-organization identity is a present
requirement, not a future one.

Discipline-derived membership is always written
`source='inferred', source_confidence='INFERRED'` — never `VERIFIED`. §5 of the
directive forbids inferring organization from session data alone, and the data
shows why: the 2026 NRHL scrimmage cohort trained under a Big Ice curriculum.

**Customer-facing funnels stay separate** (§N), and parallel work has *improved*
this — a dedicated `app/register/bigice/` funnel and a central
`config/venture-links.ts` now exist.

**Status: designed, unapproved.**

---

## 5. GUARDIAN MODEL

```
GUARDIAN → parent_athlete_link → ATHLETE
```

A guardian may hold many children; an athlete may have several authorised
guardians. Authorisation is explicit — a row in `parent_athlete_link` is the
**only** path by which a parent reaches an athlete, and it is the sole basis for
parent RLS.

**Live defect, fixed but not deployed:** see §1 and §12. `likeEscape` is the fix.

**Known residual:** `parents.phone_number UNIQUE` plus `link_guardian()`'s
`ON CONFLICT … DO UPDATE … RETURNING` is a phone-enumeration oracle — a caller
learns whether a number is registered. DQ-048. Not fixed; needs a Phase 1
change to the function, not a policy change.

**Status: designed. One urgent deploy outstanding.**

---

## 6. ENROLLMENT MODEL

Enrollment ≠ membership. One athlete, one membership per organization, many
enrollments over time:

```
ATH-000123
├─ BIG_ICE membership → Performance Jan–Mar 2027 (COMPLETED)
│                     → Elite       Apr–Jun 2027 (ACTIVE)
└─ NRHL   membership → Competitive Inline Hockey 2027 (ACTIVE)
```

`enrollment.price_tier_id` FKs the existing `commercial_price_tier`, so commerce
is reused rather than duplicated. `public.bigice_enrollment` (0 rows) becomes a
projection.

**Status: designed, unapproved.**

---

## 7. OBSERVATION MODEL

Immutable, append-only, trigger-enforced. Carries `athlete_uid`,
`organization_id`, `observation_type`, `raw_value` (verbatim, always),
`value_numeric`, `unit`, `observed_at`, `observed_at_raw`, `date_confidence`,
`created_at`, `quality_status`, `not_recorded_reason`, `protocol_version`,
`confidence`, `provenance_id`, `source_file`, `source_row`, `import_batch_id`.

`observed_at` is **nullable by design** — 1,041 dates are mathematically
undecidable and a `NOT NULL` column would force a guess.

`raw_value` is `NOT NULL` regardless of parse outcome, so `#REF!` and
`"Didn't manage to take the speed"` both survive as evidence.

**Status: designed, unapproved, zero rows.**

---

## 8. METRIC MODEL

34 metrics: **27 VERIFIED · 2 INFERRED · 4 UNKNOWN · 1 DEPRECATED**.
No `UNKNOWN` has been promoted.

Protocol authority: the Riverside capture sheet (12 metrics, discipline gating,
the 4-category per-session contract) and the dossier's Nairobi Deficit ontology
(4 deficit codes + 15 tier-specific metrics).

Corrections from Phase 0 stand and are **not reverted**:

| Correction | Basis |
|---|---|
| `EE_TECHNICAL_BREAKS` is **Effort/Engagement**, not technical skill | Riverside block 4 |
| It must **not** feed a technical composite | same |
| `technical_rating` is **confounded by exposure**, not merely sign-inverted | high performers attempt harder work and accrue more breaks |
| Compliance-% data **exists** — 383 obs/column, all 5 levels | the rollup formula is broken, not the data |
| Assisted/solo split **exists** in `Scrimmage Tracker` | 5 unlabelled columns; `assisted+solo == total` holds 94/94 |
| `Foundational Skating` = `UNKNOWN` discipline | 1,669 rows; never auto-classified |

`NRHL-PTS-v1` (`3×assisted + 1×solo + 1×assists`) is **VERIFIED three ways** and
unchanged. Never reconstruct history as `goals + assists`.

**Status: reconciled against protocols. Not finalised — 5 blockers.**

---

## 9. DERIVED DATA MODEL

Rebuildability contract: `TRUNCATE` → recompute from immutable observations +
versioned rules → byte-identical result. Anything that fails this is not modelled.

| Derived value | Rule | Rebuildable? |
|---|---|---|
| NRHL points | `NRHL-PTS-v1` | **yes** |
| NRHL composite | `NRHL-COMP-v1` | **yes** — reproduced to ≤0.010 residual |
| `technical_precision` | `4 − 2×breaks` | **yes** — 265/265 |
| Compliance rates | threshold undefined | **no** — D-09 |
| `Speed score` / `Power Score` 2026 | unknown | **no** — D-12 |
| `Session_Load` | inferred `RPE × duration` | **no** — D-14 |

Every derived row carries `rule_id`, `benchmark_version`, `computed_at`.
Historical results keep the version under which they were generated.

**Status: three formulas unreproducible. Migration cannot proceed past Phase 8.**

---

## 10. PROVENANCE MODEL

Five-link chain, no gaps permitted:

```
row → import_batch → source_file+row → source_document(md5/sha256) → normalization_rule → provenance
```

All 23 local CSVs registered `SOURCE_CANDIDATE`. **None is authoritative.**
`vocabulary_map.canonical_code IS NULL` blocks the load for that value — which
is what makes `Foundational Skating` impossible to resolve by accident.

**Status: designed. No data staged.**

---

## 11. RLS STATUS

**RLS remains disabled on all four `athlytica_core` tables.** Verified today.

| | |
|---|---|
| Containment script | written, reviewed, **not applied** |
| Rollback script | written, refuses to run if tables hold data |
| Test matrix | 12 tests specified (R1–R12) |
| **Tests executed** | **ZERO** |
| Blocker | no isolated branch exists; `list_branches` returns empty; creating one is a **billable** resource requiring owner approval |

The test matrix cannot be honestly reported as passing, because it has not run.
The directive requires production deployment only after every critical test
passes, so **RLS containment is blocked on branch provisioning**, not on the
script.

Advisor `rls_disabled` (priority 1, critical) is **still open**.

---

## 12. PARALLEL WORK STATUS

Full detail: `PARALLEL_WORK_RECONCILIATION.md`. Nothing deleted or reverted.

| Classification | Files |
|---|---|
| **SAFE — security fix, deploy urgently** | `like-escape.ts`, `guardian.ts` |
| SAFE | `stk-push`, `packages`, `register/page.tsx`, `register/bigice/`, `venture-links.ts`, `bigice-pricing.ts` |
| REQUIRES_REVIEW | `check-status`, `register/academy/page.tsx` (704 lines, payment funnel) |
| DUPLICATE | both `2026081209*` migrations — verified applied, live |

Risk checklist: **no** duplicate athletes (it fixes a sibling-overwrite bug),
**no** org-specific identities, **no** early ID assignment in changed files,
**no** insecure guardian writes (it hardens them), **no** public documents,
**no** payments outside `payment_events`, **no** Big Ice/NRHL mixing.

**The one blocking path is pre-existing, not parallel work:**

```
payment settles → onboard-paid-athlete → link_guardian()          → athlytica_core.parents (RLS OFF)
                                       → nrhl_next_athlete_code() → ATH-00501+ (collides with legacy)
```

This single route converts two "empty table, zero blast radius" findings into
permanent data damage on the first paid NRHL athlete. **Gate it.**

---

## 13. MIGRATION STATUS

Full detail: `MIGRATION_RECONCILIATION.md`. History **not** altered.

| | Count |
|---|---|
| Local files | 32 |
| Applied | 31 |
| **Version matches** | **0** |
| Local, never applied | 2 (both applied-in-effect, unrecorded) |
| Applied, no local file | 1 — `bigice_academy_name_parity` |

Root cause is benign: `apply_migration` assigns its own version; local files
were hand-named. Verified against live state — `settle_payment_transaction`
contains the deterministic tiebreak the local file introduces.

**Risk:** `supabase db push` would replay all 32 and **halt on the sixth**
(5 unguarded `create policy`, 1 unguarded `add column`). Pricing DML is
idempotent, so tier prices are not at risk.

**Standing rule: do not run `supabase db push` until D-16 closes.**

---

## 14. LEGACY DATA STATUS

Nothing migrated. All figures **provisional** pending the authoritative export.

| | |
|---|---|
| Session rows | ~3,096 |
| Athlete IDs | 209 |
| Sessions | 1,364 |
| BIIF / NRHL / unassigned | ~2,467 / ~520 / 109 |
| Athletes in both orgs | 30 |
| Contested identifiers | 8 |
| Duplicate-athlete pairs | 15 |
| Undecidable dates | 1,041 |

Identity resolution requires evidence combinations, never a bare name.
`eli` → Eli Das is **unsafe** (Eli Araka `ATH-016` exists); `leon` sits beside
sibling Leroy Sila. Ambiguous records stay `AMBIGUOUS` and load unattributed.

**Status: fully catalogued. Zero rows migrated. Zero merges applied.**

---

## 15. DQ-050 STATUS

Full detail: `DQ050_CERTIFICATE_IMPACT.md`.

- `NRHL-COMP-v1` **reproduces exactly** (residuals 0.000–0.010). Rankings are reproducible.
- **Corrected diagnosis: the driver is exposure, not discipline.** All 16
  zero-point athletes have `games_played = 0`; the discipline label is
  near-constant. **Segmenting by discipline would not have fixed it.**
- 13 athletes with real attendance and zero exposure; **9 with 100% attendance**
  are structurally incapable of scoring on a 0–124 term.
- Inversion confirmed: Jaydan 160.00 vs Luke 164.00 — a gap of exactly Luke's
  4-point term. One appearance outweighs eighteen sessions.
- **Tier recomputation is impossible here** — `Certificate Tracker` (the n=18
  pool) is one of the four missing tabs, and coach grade is known for 5 of 18.

**Recommendation: MANUAL REVIEW.** Not REISSUE — the pool cannot be
reconstructed, so reissuing would swap one unverifiable ranking for another.
**No certificate altered. Freeze new issuance under v1** (costless —
`nrhl_athlete` is empty, no automated issuance is live).

---

## 16. AGE / DOB STATUS

**DOB is collected nowhere.** Age group is unstable per athlete — Shaya Das
appears as both U8 and U12 within 2026. Three incompatible vocabularies exist
(`U9/U13` in `public.division`, `U8/U12/U15` in `nrhl_athlete`, `U8/U12/U16` in
the corpus), and `U16 (13+ years)` is unbounded so it is not the same band as
`U16 (13-16 years)`.

Rules: **do not invent DOB.** Historical age-band is preserved as a
*per-session attribute*, separate from any verified DOB. Tier-gated metrics use
the age/division context **applicable at the time of observation** — never
current age applied backwards.

**Consequence: 19 of 27 VERIFIED cognitive/tactical metrics are unscorable.**
D-11. Fixing it needs a registration change, which is out of scope this phase.

---

## 17. PAYMENT / REGISTRATION INTERACTION

Correct sequence, and what is actually implemented:

```
registration            → registrations row (venture_context stamped)   ✅
canonical athlete       → NOT YET BUILT                                  ⬜
enrollment              → bigice_enrollment exists, 0 rows               ⬜
payment event           → payment_events, append-only, trigger-enforced  ✅
payment verification    → settle_payment_transaction, idempotent         ✅
onboarding              → onboard-paid-athlete  ⚠️ see §12
portal access           → resolveGuardian  ⚠️ leak fixed, not deployed
```

Idempotency verified: `on conflict (mpesa_receipt_number) do nothing` — a
duplicate callback returns `DUPLICATE` and creates nothing. Retries do not
create duplicate athletes, because the payment path creates no athletes at all.

Payment confirmation does **not** become identity — correct today, and the
canonical model must preserve that.

**No payment behaviour was changed in this phase.**

---

## 18. DOCUMENT SECURITY

`bigice_document` stores `content_html` inline; no storage bucket in use; no
public URL introduced. `portal/document/[id]/route.ts` is the correct choke
point and is **unmodified**.

Requirements when documents move to storage: no predictable paths (the public
`athlytica_id` is printed on the document itself and is not a secret), private
buckets, short-lived signed URLs issued only after an authorization check, LIST
denied to anon and authenticated.

**Status: requirement stated. Not implemented. Not currently exposed.**

---

## 19. OPEN DECISIONS

19 open. Detail in `DECISION_REGISTER.md`; D-16…D-19 added in Phase 0.1.

| ID | Decision | Blocks |
|---|---|---|
| **D-01** | Apply RLS containment | Phase 1, §11 |
| **D-04** | Authoritative source export | **everything** |
| D-02 | `ATH-047` collision | identity resolution |
| D-03 | `Foundational Skating` | 1,669 rows |
| D-05 | Retire `normalize-legacy-ids.js` | ID issuance |
| D-06 | Bare first-name attribution | identity resolution |
| D-07 | 109 unassigned rows | load |
| D-08 | `Kids Group` entity | identity resolution |
| D-09 | Compliance threshold | derived layer |
| D-10 | `technical_rating` normalisation | derived layer |
| D-11 | Age tiers + DOB capture | 19 metrics |
| D-12 | Unknown 2026 derivations | derived layer |
| D-13 | NRHL name; conference/team conflict | projections |
| D-14 | `Session_Load` formula | derived layer |
| D-15 | Founder-identity hardcoding | cutover |
| **D-16** | Migration version drift remediation | any `db push` |
| **D-17** | Is exposure qualification retroactive? | DQ-050 |
| **D-18** | Minimum exposure thresholds | `NRHL-COMP-v2` |
| **D-19** | Non-participant treatment | `NRHL-COMP-v2` |

Plus one operational: **branch provisioning is billable** and needs approval
before RLS testing can run.

---

## 20. MIGRATION GATES

| # | Gate | Status |
|---|---|---|
| 1 | Canonical athlete architecture approved | ⬜ |
| 2 | Athlete ID specification approved | ⬜ |
| 3 | Organization model approved | ⬜ |
| 4 | RLS tested | ⬜ **0 of 12 tests run** |
| 5 | RLS production deployment approved | ⬜ |
| 6 | Parallel work reconciled | ✅ **analysis complete**; 2 files need review, 1 fix needs deploy |
| 7 | Duplicate migrations resolved | ⬜ D-16 |
| 8 | Authoritative source supplied | ⬜ D-04 |
| 9 | Source manifest verified | ⬜ |
| 10 | Identity matching rules approved | ⬜ D-02/06/08 |
| 11 | `Foundational Skating` treatment approved | ⬜ D-03 |
| 12 | Date strategy approved | ⬜ |
| 13 | Metric registry approved | ⬜ 5 blockers |
| 14 | NRHL formula versioning approved | ⬜ D-13 |
| 15 | DQ-050 impact understood | 🟨 **mechanism understood; tier impact NOT computable** |
| 16 | Scoring eligibility rules approved | ⬜ D-17/18/19 |
| 17 | Rollback tested | ⬜ |
| 18 | Migration dry run completed | ⬜ |
| 19 | Row counts reconciled | ⬜ |
| 20 | Checksums / provenance verified | ⬜ |

**1 of 20 complete. 1 partial. 18 open.**

---

## 21. RISKS

| # | Risk | Severity | State |
|---|---|---|---|
| R1 | Parent-portal cross-household leak | **CRITICAL** | fix written, **uncommitted**; exposure 0 (table empty) |
| R2 | `athlytica_core` RLS disabled | **CRITICAL** | script written, **untested**, unapplied |
| R3 | `onboard-paid-athlete` writes PII to RLS-off table **and** issues colliding IDs | **CRITICAL** | live route, ungated |
| R4 | ID sequence at 500 collides with legacy `ATH-500`–`ATH-638` | **CRITICAL** | contained only by not issuing |
| R5 | `supabase db push` replays 32 migrations, halts on the sixth | HIGH | standing prohibition |
| R6 | Migrating from a `SOURCE_CANDIDATE` file | HIGH | 927 rows at stake in 2021 alone |
| R7 | `bigice_academy_name_parity` has no local file | HIGH | repo cannot rebuild production; tier names are a pre-PIN parent contract |
| R8 | Certificates issued under a structurally flawed composite | HIGH | freeze recommended |
| R9 | 19 metrics unscorable without DOB | HIGH | D-11 |
| R10 | Bare-name attribution (`eli`, `leon`) | HIGH | not deployed to production data |
| R11 | Three derived formulas unreproducible | MEDIUM | blocks Phase 9 |
| R12 | Phone-enumeration oracle via `link_guardian()` | MEDIUM | DQ-048 |

| R13 | Unreconciled 16,500 KES payment (`SGX7HQ2LM9`) with no registration | **HIGH** | possible paying parent with no enrollment — needs a human today |
| R14 | 4 synthetic `AUDITTEST*` receipts permanent in append-only `payment_events` | MEDIUM | cannot be deleted; nothing marks them as test |
| R15 | Athlete-code issuer fired 4× mid-audit with no persisted athlete | **HIGH** | R3/R4 confirmed live, not theoretical |

R1–R4 are **inert only because the athlete tables are empty**. R15 shows that
condition is actively being tested: the issuer ran four times during a two-hour
audit window. Every one of R1–R4 becomes live on the first Big Ice or NRHL
registration that actually persists a row.

---

## 22. NEXT ACTIONS

Ordered. None executed.

| # | Action | Gate | Cost |
|---|---|---|---|
| 0 | **Reconcile payment `SGX7HQ2LM9`** — 16,500 KES, no registration. Real or test? If real, a parent is owed an enrollment. | none | today |
| 1 | **Commit + deploy `like-escape.ts` + `guardian.ts`** | none — independent | minutes |
| 2 | **Gate `onboard-paid-athlete`** until D-01 and canonical IDs land — the issuer fired 4× during this audit | none | minutes |
| 3 | Approve branch provisioning (billable); create branch | D-01 | owner decision |
| 4 | Run R1–R12 on the branch; report EXPECTED/ACTUAL/PASS/FAIL/RISK | gate 4 | hours |
| 5 | Apply RLS containment to production after all critical tests pass | gate 5 | minutes |
| 6 | Re-export all 16 tabs per `AUTHORITATIVE_SOURCE_EXPORT_SPEC.md` | gate 8 | ~1 hour |
| 7 | Recover `Certificate Tracker`; recompute `NRHL-COMP-v1` on the true n=18 | gate 15 | hours |
| 8 | Review `register/academy/page.tsx` and `check-status` | gate 6 | hours |
| 9 | Rename local migrations to applied versions; author the missing parity file | D-16 | ~1 hour |
| 10 | Close D-02…D-19 | gates 10–16 | owner |

**Actions 1 and 2 are the only ones with no dependency and real risk reduction.
They should not wait for the rest of this document.**

---

*No production data was modified in producing this status. The system is not
ready for migration.*
