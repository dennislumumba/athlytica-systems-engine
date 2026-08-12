# Phase 0.2 — Production Containment & Identity Integrity

**Status:** AUDIT COMPLETE. **Zero production mutations.**
**Date:** 2026-08-12 · **Commit at start and end:** `0441e0c`

Every SQL statement executed in this phase was `SELECT`. No `INSERT`, `UPDATE`,
`DELETE`, DDL or RPC was run against production.

---

## 1. STEP 1 — `SGX7HQ2LM9` investigation

### ✅ RESOLVED 2026-08-12 — SYNTHETIC

**The owner checked the Safaricom statement. `SGX7HQ2LM9` is not on it. It was
the founder's own test.**

Consequences:

1. **No customer impact.** No family paid 16,500 KES and went unserved. R13 is
   closed, not mitigated.
2. **All five `payment_events` are synthetic** — 658,000 KES of fake
   settlements. R14's scope widens from four rows to five.
3. **Production has never processed a real payment.** Combined with zero
   athletes, zero guardians and zero enrollments, **the system has never held
   real customer data.**
4. **A new finding follows from it** — see §15, `G-W6-PAY`.

The database-side analysis below stands and is retained: it is the record of
what could and could not be determined without the statement, and it correctly
declined to guess. Note that the strongest "may be real" signals — genuine
receipt shape, a distinct HMAC'd phone, 1.5s callback latency, an exact live
price — were all present on a record that was synthetic. **A test payment
crafted to look real is indistinguishable from a real one inside the database.**
That is precisely why D-22 needs a classification mechanism rather than a
heuristic.

---

### Original verdict (retained): UNRESOLVED from the database alone

| Question | Answer |
|---|---|
| 1. Real customer payment? | **CANNOT BE DETERMINED FROM THE DATABASE** — see §1.3 |
| 2. Which transaction generated it? | **UNKNOWN.** No registration carries `account_reference = ATH-9GG9` |
| 3. Product/package intended? | KES 16,500 uniquely matches **Beginner Skating Programme** (`commercial_price_tier`, `tier_group = academy`, active) |
| 4. Payment verification successful? | Yes — `result_code = 0`, accepted by `settle_payment_transaction` |
| 5. Enrollment created? | **No.** `bigice_enrollment` = 0 rows |
| 6. Athlete created? | **No.** `bigice_athlete` = 0 rows |
| 7. Athlete ID issued? | **No** athlete row exists to hold one |
| 8. Onboarding generated? | **No.** `bigice_document` = 0 rows |
| 9. Portal access? | **No.** Portal reads `bigice_athlete`, which is empty |
| 10. Where did it stop? | **At settlement.** The payment was recorded and the workflow never advanced past it. |

### 1.1 What is in `payment_events`

| Receipt | KES | Ref | msisdn_hash prefix | tx time (UTC) | latency |
|---|---|---|---|---|---|
| `AUDITTEST001` | 180,000 | `ATH-SZTV` | `cd291ce0a481…` | 22:20:23 | 6.4s |
| `AUDITTEST002` | 350,000 | `ATH-TRKK` | `cd291ce0a481…` | 22:21:41 | 3.7s |
| `AUDITTEST003` | 16,500 | `ATH-BF9V` | `cd291ce0a481…` | 22:21:41 | 6.9s |
| `AUDITTEST004` | 95,000 | `ATH-R7K2` | `5a6dd41c2d3e…` | 22:21:41 | 10.2s |
| **`SGX7HQ2LM9`** | **16,500** | `ATH-9GG9` | **`261b92e60e35…`** | **22:27:48** | **1.5s** |

**None of the five matches any registration** — by reference, by phone, or by
`settled_receipt`. All five settled as `SETTLED_UNMATCHED`.

### 1.2 Evidence it may be real

- Receipt `SGX7HQ2LM9` has genuine M-Pesa shape (10 uppercase alphanumerics).
  The other four are self-describing test strings.
- **Distinct `msisdn_hash`** — not the phone used for the `AUDITTEST` batch
  (three share one hash, a fourth shares another).
- **1.5s callback latency**, consistent with a real network round-trip. The four
  test rows share a single frozen `transaction_timestamp` of 22:21:41 with
  latencies of 3.7–10.2s, the signature of a script replaying a fixed value.
- KES 16,500 is an **exact live price**, not a round test number.

### 1.3 Evidence it may be synthetic

- Arrived **6 minutes after** the test batch, plausibly the same working session.
- `ATH-9GG9` is in `generateAthReference()` format
  (`app/api/v1/biz/stk-push/route.ts:90`) — **but that function inserts a
  `registrations` row in the same request** (`:298-302`). A real Big Ice
  checkout therefore *always* leaves a registration. **There is none.**
- `settle_payment_transaction` is `SECURITY DEFINER`, granted to `service_role`
  only. It can be invoked directly, bypassing checkout entirely — which
  produces exactly this shape: a payment event with a well-formed reference and
  no registration behind it.

### 1.4 Why the database cannot settle it

`msisdn_hash` is **HMAC-SHA256 keyed on `MSISDN_HASH_KEY`**, not a plain digest
(`utils/msisdn.ts`). Candidate phone numbers cannot be tested without the
secret, and **I did not read the key and did not attempt to reverse the hash.**
Doing so would de-anonymise a minor's guardian, which is the precise harm that
design prevents. The DPA-2019 posture documented in that file is correct and
was respected.

Postgres logs were searched. Every hit for `settle_payment_transaction`,
`link_guardian` and `bigice_next_athlete_code` was **migration DDL text**, not a
runtime invocation. No runtime record of this payment survives in the 24-hour
log window.

### 1.5 The one decisive check — for a human

> Look up receipt **`SGX7HQ2LM9`**, KES **16,500**, **2026-08-11 22:27:48 UTC**
> (**2026-08-12 01:27:48 EAT**), Paybill **4325935**, on the Safaricom
> statement or M-Pesa portal.

- **Present** → a real family paid 16,500 KES and has **no enrollment, no
  onboarding document and no portal access**. That is a service failure with a
  person behind it, and it needs manual reconciliation.
- **Absent** → synthetic, and R14 (test-data classification) applies.

**Per the phase's stop condition, no reconciliation was attempted and no record
was created.** Inventing the missing registration would require guessing the
athlete's name, the guardian's identity and the campus — none of which exist
anywhere in the system.

---

## 2. STEP 2 — Why the ID sequence moved 500 → 504

### Root cause: the code is minted in a separate round-trip from the insert.

`lib/services/bigice-onboarding.ts`:

```ts
190:  const { data: next, error: seqError } = await db.rpc("bigice_next_athlete_code");
      //  ↑ increments athlytica_core.scalable_id_sequence and COMMITS
200:  const { error: insertError } = await db.from("bigice_athlete").insert({ … });
      //  ↑ a SEPARATE statement, in a SEPARATE transaction
210:  if (insertError) { … return { onboarded: false, reviewRequired: true, … } }
      //  ↑ the code is already spent and can never be recovered
```

`bigice_next_athlete_code()` is `plpgsql`/`volatile`/`SECURITY DEFINER`. It runs
`update … set current_value = current_value + 1 … returning`. As a standalone
RPC it autocommits. **Any failure after line 190 burns a permanent identifier.**

The identical pattern exists at
`app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts:144` and
`app/api/v1/leagues/nrhl/ingest/route.ts:146`.

**Observed consequence:** sequence advanced 4, `bigice_athlete` = 0 rows.
Codes `BIIF-2026-0501` … `0504` (or equivalent) are burned.

The file header already states the correct intent — *"A CODE IS MINTED ONLY FOR
A CONFIDENT NEW ATHLETE"* — and the identity-resolution guard above it
(`:98-120`, match by `name_key` then `guardian_msisdn_hash`) is sound. **The
policy is right; the transaction boundary is missing.**

### Proposed invariant (D-20) — design only, not implemented

> A new `athlytica_id` may be issued **only** as part of a committed canonical
> athlete row, in one transaction. Existing athletes never receive a new ID.

```
resolve identity  ─┬─ EXISTING → reuse athlete_uid + athlytica_id, mint nothing
                   └─ NEW      → single RPC, one transaction:
                                   1. insert athlete
                                   2. nextval → athlytica_id
                                   3. insert identifier ledger row
                                   4. insert membership
                                 any failure → rollback, no orphan, no burn
```

Implementation shape: replace the two round-trips with **one `SECURITY DEFINER`
function** that does resolution, insert and mint atomically. The current
two-call pattern cannot be made safe from the application side — a Postgres
function is the only place the boundary can exist.

**Sequence gaps are acceptable. Reissuing a burned ID is not.** The four burned
codes stay burned and must be recorded in an `athlytica_id_burned` ledger
(specified in `ROLLBACK_PLAN.md` §6).

**Not implemented in this phase** — it requires the canonical `athlete` table,
which is D-01/Phase 1 work.

---

## 3. STEP 3 — Duplicate registration

**Existing protections, verified in code:**

| Vector | Protection | Location |
|---|---|---|
| Double-click / refresh | Reuses the open registration for the same household+tier+athlete | `stk-push:271-286` |
| Concurrent submit | Unique index `registrations_open_checkout_key`; on `23505` it re-reads and reuses the winner | `stk-push:337-352` |
| Duplicate callback | `on conflict (mpesa_receipt_number) do nothing` → returns `DUPLICATE`, creates nothing | `settle_payment_transaction` |
| Sibling collision | `sameAthlete(r.athlete_name, …)` distinguishes two children on one phone | `stk-push:248, 345` |
| Reference collision | 3-try loop on the 4-char code | `stk-push:295-320` |
| Ambiguous onboarding | Returns `reviewRequired`, mints nothing | `bigice-onboarding.ts:170` |

**Gap:** onboarding is idempotent on the *athlete* (match-first) but the **mint
is not transactional** (§2). A retry after a failed insert burns another code.
This is the same defect, not a separate one.

**No change made.** The protections above are already committed and covered by
the 142 passing tests.

---

## 4. STEP 4 — Household authorization

### Status: fix committed; unit-verified; **integration-unverified**

`likeEscape` is in `main` at `0441e0c` and wired into `resolveGuardian()`
(`guardian.ts:32, 77, 88`).

| # | STEP 4 case | Covered | How |
|---|---|---|---|
| 1 | exact legitimate email | ✅ | `tests/guardian-scope.test.mts:59` |
| 2 | similar email | ✅ | `:38` — `john_smith@` vs `johnXsmith@` |
| 3 | `%` character | ✅ | `:50` |
| 4 | `_` character | ✅ | `:38` |
| 5 | two unrelated households | ❌ | needs a database |
| 6 | parent, multiple children | ❌ | needs a database |
| 7 | parent, one child | ❌ | needs a database |
| 8 | nonexistent parent | ❌ | needs a database |
| 9 | duplicate registration | ❌ | needs a database |
| 10 | unauthorized athlete ID lookup | ❌ | needs a database |

**4 of 10 covered.** The four covered are the *wildcard class* — the actual
defect. Cases 5–10 are integration tests requiring the isolated environment that
does not exist (STEP 5).

The escape is also correct on the subtle case: `likeEscape` escapes the
backslash itself, so a trailing lone `\` cannot escape the closing quote.

### The deeper point stands

The phase brief is right that **email is an attribute, not an authorization
boundary**. `resolveGuardian()` still authorizes by matching a *string* against
`bigice_athlete.guardian_email`. `likeEscape` makes that match exact; it does
not make it an identity relationship.

The canonical fix is `parent_athlete_link` keyed on `auth.uid()`
(`ORGANIZATION_MEMBERSHIP_SPEC.md` §8) — a row, not a pattern. That is Phase 1.
**`likeEscape` is the correct minimal containment for now**, and it is deployed.

---

## 5. STEP 5 — RLS

## **RLS BLOCKED — ISOLATED ENVIRONMENT REQUIRED**

`list_branches` returns `[]`. No isolated Supabase environment exists.

Creating one is a **billable resource**. Per the phase instruction —
*"If not, STOP before creating a billable branch. Do not silently incur
infrastructure cost"* — **no branch was created.**

| | |
|---|---|
| R1–R12 executed | **0 of 12** |
| Additional STEP 4 cases executed | **0 of 6** |
| Containment script applied | **no** |
| Advisor `rls_disabled` | **still open, priority 1, critical** |

**No claim is made that RLS works.** It has never been executed.

The script `sql/0001_rls_containment.sql` carries a pre-flight guard that aborts
if the sequence has moved since planning. Because the sequence *did* move
(500 → 504), the guard was updated in Phase 0.1 to compare against a value
observed immediately before apply rather than a hardcoded constant. **The guard
working as designed is the one piece of RLS work that has been validated — by
the state change catching it.**

**Decision required: OPS-1** — approve a billable branch, or nominate an
equivalent isolated environment (local Supabase, separate project).

---

## 6. STEP 6 — Payment flow integrity

State machine as implemented:

```
REGISTRATION_CREATED   registrations row, ATH-XXXX ref        ✅ stk-push
PAYMENT_INITIATED      checkout_request_id, stk_pushed_at     ✅ stk-push
PAYMENT_PENDING        payment_status = PENDING_PAYMENT       ✅
PAYMENT_CONFIRMED      settle_payment_transaction, append-only ✅ idempotent
ENROLLMENT_CREATED     bigice_enrollment upsert                ⚠️ reachable only via onboarding
ONBOARDING_READY       bigice_document                         ⚠️ mint not transactional
PORTAL_READY           resolveGuardian → bigice_athlete        ⚠️ depends on the above
```

**Verified sound:**

- `payment_events` is append-only — `BEFORE UPDATE OR DELETE` trigger raises.
- Callback idempotency — duplicate receipt returns `DUPLICATE`, writes nothing.
- Settlement is deterministic — exact-reference match first, then phone
  fallback ordered by `(amount matches) desc, stk_pushed_at desc nulls last,
  created_at desc`. Verified present in the live function.
- Failed payments cannot create enrollments — `settle_payment_transaction`
  raises unless `result_code = 0`, and `payment_events` has a
  `CHECK (result_code = 0)`.
- Payment does not create athletes — the settlement path writes no athlete row.

**Confirmed weak point:** `PAYMENT_CONFIRMED → ENROLLMENT_CREATED` is where all
five current payments stopped. Settlement succeeded; nothing downstream ran.

---

## 7. STEP 7 — Big Ice / NRHL separation

| Check | Result |
|---|---|
| Registration funnels separate | ✅ `app/register/bigice/` distinct from `app/register/` |
| Package selection scoped | ✅ academy tiers resolve from `commercial_price_tier` (`tier_group = 'academy'`); code-table tiers separately |
| `venture_context` stamped at creation | ✅ `stk-push:288, 309` |
| DB constraint on venture | ✅ `CHECK (venture_context IN ('NRHL','BIG_ICE','ATHLYTICA'))` |
| Onboarding scoped | ✅ `bigice-onboarding.ts:146` returns `"not a Big Ice registration"` and refuses |
| Exactly one price source | ✅ `CHECK (num_nonnulls(price_tier_id, tier_id) = 1)` on `bigice_enrollment` |
| Cross-org athlete identity allowed | ✅ by design; 30 legacy athletes already in both |

**No package contamination found.** The 2026-08-12 commit — *"a Big Ice checkout
that sells Big Ice, to one family at a time"* — strengthened this.

**Gap:** `venture_context` omits `TTA`, which exists as a workspace. Pre-existing
(logged Phase 0, DQ-031). Not a contamination risk today.

---

## 8. STEP 8 — Onboarding document integrity

| Requirement | Status |
|---|---|
| Attached to athlete, not email | ✅ `bigice_document.biif_code` FK → `bigice_athlete`, `ON DELETE CASCADE` |
| Enrollment linked | ✅ `enrollment_id` FK |
| Document type + version | ✅ `slug`, `template_version` |
| Organization scoped | ⚠️ implicit — `bigice_document` is Big-Ice-only by table, not by column |
| Existing athlete keeps its ID | ✅ `bigice-onboarding.ts:187` updates the matched row; mints nothing |
| New athlete gets ID after identity creation | ⚠️ **before** — see §2 |
| No predictable public URLs | ✅ keyed on `document_id uuid`; no storage bucket in use |
| Access control | ⚠️ `portal/document/[id]` is the choke point; **not tested** (needs STEP 5 env) |

Documents currently store `content_html` inline. No public bucket exists, so
there is no enumerable URL surface today.

---

## 9. STEP 9 — Athlete ID display rules

**Current state: no canonical `athlytica_id` exists**, so nothing can display it.

What is displayed today: `bigice_athlete.biif_code` (`BIIF-YYYY-NNNN`) and
`nrhl_athlete.athlete_code` (`ATH-NNNNN`) — both organization-specific.
`app/api/v1/public/nrhl/verify` documents `ATH-00047` as the public form.

**This violates the target rule** (`ATHLETE_ID_SPEC.md` §2: the public ID must
not encode organization). It is not a defect to fix now — it is the current
state that Phase 1 replaces. Recorded so it is not mistaken for compliance.

No database UUID is exposed to parents anywhere that was inspected.

---

## 10. STEP 10 — Test data hygiene

**Problem:** production holds 4 synthetic payment events that are
indistinguishable from real ones by any column, in an **append-only table where
DELETE raises**.

They already contaminate: revenue (641,500 KES of fake settlements), payment
counts, and any funnel metric derived from `payment_events`.

### Proposed mechanism (D-22) — design only

`payment_events` cannot take a new column without a migration, and its
immutability trigger blocks `UPDATE`. So classification must be **additive and
external**:

```sql
create table public.record_classification (
  record_table   text not null,
  record_id      text not null,          -- receipt, uuid, code
  classification text not null check (classification in
                   ('PRODUCTION','TEST','AUDIT','DEMO')),
  reason         text not null,
  classified_by  text not null,
  classified_at  timestamptz not null default now(),
  primary key (record_table, record_id)
);
```

Then every revenue/count view becomes:

```sql
… where not exists (
  select 1 from record_classification c
   where c.record_table = 'payment_events'
     and c.record_id = pe.mpesa_receipt_number
     and c.classification <> 'PRODUCTION')
```

**Default is PRODUCTION** — absence of a row means real. That fails safe: a
forgotten classification over-counts revenue rather than hiding a real payment.

**Going forward**, the durable fix is that test settlements never reach
production: the settlement RPC should refuse receipts matching a reserved
pattern (e.g. `^AUDITTEST`) when running against the production project. That
is a Phase 1 change.

**Not implemented.** `AUDITTEST001-004` are classifiable as `TEST` on the
evidence; `SGX7HQ2LM9` is **not classifiable** until D-21 resolves.

---

## 11. STEP 11 — Migration drift

Full analysis: `MIGRATION_RECONCILIATION.md`. Nothing renamed or deleted.

**Root cause confirmed verbatim from postgres logs this phase:**

```
insert into supabase_migrations.schema_migrations as old
  (version, name, statements, created_by, idempotency_key, rollback)
values (
  to_char(current_timestamp, 'YYYYMMDDHH24MISS'), …
```

`apply_migration` stamps **its own** version at apply time. Local filenames were
hand-picked. Hence 0 of 32 match. The database is correct; the ledger is not.

### `bigice_academy_name_parity` — investigated as instructed

| | |
|---|---|
| Applied | `20260811012454` |
| Local file | **none** |
| Content | realigns `commercial_price_tier.tier_name` with bigice.co.ke |
| Reproducible from repo? | **NO** |

This is the one true gap. If the project were rebuilt from
`supabase/migrations/`, the tier-name parity fix would be missing — and
`CLAUDE.md` records that this exact drift ("Quarterly" vs "3-Month
Development") already burned the project once, on the screen a parent reads
immediately before entering their M-Pesa PIN.

Current live values confirm the fix is applied: `3-Month Development` (95,000),
`6-Month Development` (180,000), `12-Month Development` (350,000),
`Beginner Skating Programme` (16,500).

**Recommended (D-16):** author a local file reproducing the applied statement,
and rename local files to their applied versions. **Not done** — §11 of the
brief forbids rewriting migration history this phase, and renaming is a repo
change that should land with its decision.

---

## 12. STEP 13 — Test matrix, actual results

`node --test "tests/**/*.test.mts"` → **142 pass / 0 fail / 0 skipped**.

| Group | Case | Result |
|---|---|---|
| **IDENTITY** | new athlete creates exactly one athlete | ⚪ **not tested** — needs DB |
| | existing athlete creates no duplicate | 🟡 partial — match-first logic unit-covered |
| | concurrent registration does not duplicate | ⚪ not tested — unique index exists, unexercised |
| | failed registration leaves no broken identity | ❌ **FAILS BY DESIGN** — §2, 4 codes burned |
| | Athlete ID remains permanent | ⚪ no canonical ID exists yet |
| **PAYMENT** | duplicate callback idempotent | 🟡 code-verified (`on conflict do nothing`), not executed |
| | successful payment creates correct enrollment | ❌ **observed failing** — 5 settlements, 0 enrollments |
| | failed payment creates no active enrollment | ✅ enforced by CHECK + RPC guard |
| | payment creates no duplicate athlete | ✅ settlement writes no athlete |
| **GUARDIAN** | guardian sees only authorized athletes | ⚪ needs DB |
| | unrelated guardian cannot see athlete | ⚪ needs DB |
| | wildcard email cannot bypass | ✅ **4 unit tests pass** |
| | multiple children | ⚪ needs DB |
| **ORGANIZATION** | Big Ice package cannot become NRHL enrollment | ✅ code + CHECK verified |
| | NRHL package cannot become Big Ice | ✅ same |
| | same athlete in both orgs | ⚪ canonical model not built |
| **ONBOARDING** | new athlete receives new ID | 🟡 works, but non-transactionally |
| | legacy athlete retains existing ID | ✅ unit-tested (`onboarding-delivery`) |
| | document belongs to correct athlete | ✅ FK-enforced |
| | document not accessible cross-household | ⚪ needs DB |
| **SECURITY** | API cannot enumerate athletes | ⚪ needs DB |
| | frontend filtering not sole mechanism | ❌ **currently it partly is** — workspace payload is role-filtered client-side (DQ-009) |
| | RLS works | ⚪ **BLOCKED — never executed** |

**Legend:** ✅ verified · 🟡 partially verified · ⚪ not tested · ❌ known failing

**8 verified, 3 partial, 9 untestable without an isolated environment, 3 known
failing.** Nothing is claimed as passing that was not executed.

---

## 13. Production changes

**NONE.**

| | |
|---|---|
| CHANGE | none |
| WHY | every candidate fix is gated on D-01, D-20 or OPS-1 |
| FILES | 2 new documents; no source file modified |
| DATABASE IMPACT | none — all statements were `SELECT` |
| USER IMPACT | none |
| ROLLBACK | not applicable |

The one production-affecting fix in scope — `likeEscape` — was **already
committed to `main` by parallel work before this phase began**. It was verified,
not authored, here.

---

## 15. `G-W6-PAY` is live on synthetic evidence (R16, D-23)

Discovered while closing D-21.

```
gate_states: gate_id = 'G-W6-PAY'
             live     = true
             live_at  = 2026-08-11 22:20:23+00
             evidence = 'AUDITTEST001'      ← synthetic
```

`config/nrhl-gates.ts` makes this load-bearing:

| Fact | Location |
|---|---|
| `G-W6-PAY` is **the root of the critical path** (`dependsOn: null`) | `:44-51` |
| `G-W5-REG` (registration funnel + sponsor outreach) depends on it | `:52-58` |
| `assertDraftEngineUnblocked()` is a **hard block** for every draft-engine entry point and throws while it is not live | `:176-187` |
| Its KPI is *"First validated M-Pesa settlement event (resultCode 0 + receipt) logged"* | `:50` |
| *"The ONLY sanctioned way to flip G-W6-PAY live: a schema-valid settlement event… callers must not catch-and-force."* | `:188-191` |

The gate was flipped by a schema-valid settlement event — so no rule was
bypassed. The event was simply not real. **The KPI is recorded as met and has
never occurred**, and the NRHL critical path is consequently unblocked on false
evidence.

### The durable defect

`settle_payment_transaction` writes the gate with:

```sql
insert into public.gate_states (gate_id, live, live_at, evidence)
values ('G-W6-PAY', true, p_tx_ts, p_receipt)
on conflict (gate_id) do nothing;
```

`do nothing` means **the first settlement wins permanently**. The first was
`AUDITTEST001`. When a genuine first payment arrives, the gate's evidence will
**not** update — it will still name a test receipt, forever.

### Remediation (D-23) — not applied

Unlike `payment_events`, `gate_states` has no immutability trigger (only
`trg_touch_updated_at`), so it is correctable. Two parts:

1. **Correct the row** — reset `G-W6-PAY` to `live = false`, evidence cleared,
   so the gate reflects reality and re-arms for a genuine settlement.
2. **Fix the write** — the gate should record the *first PRODUCTION-classified*
   settlement, not the first settlement of any kind. That depends on D-22's
   classification mechanism, so the two decisions should land together.

**No change made.** This is a production data mutation and requires approval.

---

## 14. Decisions raised in Phase 0.2

| ID | Decision | Urgency |
|---|---|---|
| **D-20** | Transactional athlete creation + ID issuance | blocks Phase 1 |
| **D-21** | Is `SGX7HQ2LM9` a real customer payment? | **immediate, human-only** |
| **D-22** | Test/production record classification | before any revenue reporting |
| **OPS-1** | Approve a billable branch (or nominate an isolated environment) | blocks all RLS work |
