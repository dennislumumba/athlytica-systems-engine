# Phase 0.3D — Payment-Adjacent Path Audit

**Date:** 2026-08-12 · **Commit audited:** `6b19bbc` (already on `origin/main`)
**Method:** execution-path tracing, not string search. Every claim below is
anchored to a file:line or a read-only production query.
**Production changes:** none. One test file added (`tests/payment-authorization-boundary.test.mts`).

---

## 0. Correction to the brief's premise

`6b19bbc` **is pushed.** `git rev-parse HEAD` and `origin/main` are the same
SHA and `git branch -r --contains 6b19bbc` lists `origin/main`. There is
nothing to push and no bundling risk. The only dirty path is the generated
`next-env.d.ts`.

---

## 1. The question this audit answers

The brief asks whether a TEST/AUDIT/DEMO payment can become real customer
value. The answer turns on a distinction the codebase does not currently
draw:

```
PAYMENT EVENT  →  PAYMENT SETTLEMENT  →  ENROLLMENT  →  SERVICE ENTITLEMENT
```

M2 and M3 built a genuine boundary at the **first** arrow. There is no
boundary at the second or third. `record_classification` governs exactly
one predicate today — *is this money?* — and no other.

**Verified in production, 2026-08-12:**

```
record_classification: 5 rows, record_table = 'payment_events' only, all TEST
```

No registration, enrollment, athlete, document or portal grant is
classifiable at all. The vocabulary does not reach them.

---

## 2. Classification consumer matrix

| # | Path | Reads | Classification aware? | Can create enrollment? | Can issue ID? | Risk | Action |
|---|---|---|---|---|---|---|---|
| 1 | `settle_payment_transaction` (RPC) | `payment_events`, `record_classification`, `registrations` | **YES** — but only for a *pre-existing* row | **YES** (`users`, `athletes`, `athlete_tenant_links`) | no | **CRITICAL** (F-1) | close the ordering hole |
| 2 | `_payment_replay_verdict` | `payment_events` | no — never reaches the gate | no | no | LOW | none |
| 3 | `mpesa-callback` route | RPC result | inherits #1 | drives #5, #6 | via #5 | HIGH (F-4) | handle new outcomes |
| 4 | `retry-onboarding` | `registrations` only | **NO** | **YES** | **YES** | **CRITICAL** (F-2) | add classification check |
| 5 | `onboardBigIceAthlete` | `registrations`, `bigice_athlete`, `bigice_enrollment` | **NO** | **YES** | **YES** (`bigice_next_athlete_code`) | **CRITICAL** (F-2) | gate at entry |
| 6 | `deliverBigIcePack` / `deliverOnboardingPack` | `registrations`, `bigice_enrollment` | **NO** | writes `bigice_document` | no | HIGH | inherits #5 |
| 7 | `onboard-paid-athlete` (NRHL) | **nothing payment-related** | **NO** | **YES** (`nrhl_athlete`) | **YES** (`nrhl_next_athlete_code`) | **CRITICAL** (F-3) | require settlement |
| 8 | `check-status` | `registrations`, `bigice_enrollment`, `bigice_document` | **NO** | no | no | MEDIUM | reports test as PAID |
| 9 | `resolveGuardian` → portal | `bigice_athlete` by guardian email | **NO** | no | no | HIGH | inherits #5 |
| 10 | `portal/document/[id]` | `bigice_document` scoped to #9 | **NO** | no | no | MEDIUM | inherits #9 |
| 11 | dashboard `railTotalKes` | `payment_events_production` | **YES** | no | no | none | ✅ 0.3C |
| 12 | `cash-watcher` | `payment_events_production` | **YES** | no | no | none | ✅ 0.3C |
| 13 | dashboard ledger lists (×2) | `payment_events` | deliberate raw read | no | no | none | correct as-is |
| 14 | dashboard athlete/enrollment counts | `bigice_athlete`, `bigice_enrollment`, `nrhl_athlete` | **NO** | no | no | MEDIUM | test athletes inflate KPIs |
| 15 | `stk-push` / `auth/register` | `registrations` | **NO** | creates registration | no | LOW | pre-money |
| 16 | `leagues/nrhl/ingest` | CSV → `nrhl_athlete` | **NO** | **YES** | **YES** | HIGH (not payment-adjacent) | D-06/M1 |
| 17 | `sync/convex` queue | adapted athlete/metric rows | **NO** | no | no | MEDIUM | test athletes egress |
| 18 | `google-forms` → `onboard_athlete_from_google_form` | RPC | **NO** | **YES** | — | MEDIUM | no payment involved |

**Classification-aware paths: 3 of 18.** Two of those three are the revenue
reads fixed in 0.3C; the third is the settlement RPC, and its awareness is
conditional (F-1).

---

## 3. Critical findings

### F-1 · The classification gate cannot fire on a first arrival — **CRITICAL**

The check is real, but it runs *after* the ledger insert and can only match a
classification row that already exists. Verified against the **deployed**
function by character offset:

```
insert into payment_events   @ 1045
record_classification check  @ 1792   ← after the insert
insert into gate_states      @ 2282
insert into users            @ 4002
athlete_tenant_links         @ 4407
```

A receipt number is minted by Safaricom and first observed *in the callback*.
For any genuinely new TEST/AUDIT/DEMO payment there is no classification row
to find, so `v_is_production` is true and the function proceeds to flip the
gate, create `users`/`athletes`/`athlete_tenant_links`, and mark the
registration `PAYMENT_SETTLED`. The callback then runs Big Ice onboarding —
Athlete ID, enrollment, documents, portal access.

Classifying it afterwards removes it from **revenue only**. Every other
artefact stands.

> M3's own test 6 ("pre-classified TEST receipt → `TEST_CLASSIFIED`") passes
> because the test *inserts the classification first*. That is a valid test of
> the mechanism and an invalid model of the arrival order.

**There is currently no way to mark an incoming payment as non-production
at the moment it arrives.** The three callback sources are already
distinguishable (`DARAJA_CALLBACK` / `BANK_RAIL` / `MANUAL_RECON`) and the
route knows which one it is — that signal is discarded before the RPC.

### F-2 · `retry-onboarding` mints identity with no classification check — **CRITICAL**

`app/api/v1/biz/retry-onboarding/route.ts:118` gates on
`payment_status === 'PAYMENT_SETTLED'` and a non-null `settled_receipt`. It
never consults `record_classification`, and neither does
`onboardBigIceAthlete` (`lib/services/bigice-onboarding.ts:123`).

So the exact remediation workflow D-22 exists to support — *settle, then
discover it was a test, then classify it* — leaves a live button that mints a
permanent Athlete ID, writes an enrollment, renders documents and grants
portal access for a payment the business has formally declared synthetic.
Ops-token guarded, so not externally reachable; entirely reachable by the
person doing the remediation.

### F-3 · NRHL onboarding has no payment lookup at all — **CRITICAL**

`app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts` accepts
`mpesaReceipt: z.string().trim().min(4).max(64)` and **never reads
`payment_events`, `payment_events_production`, `registrations` or
`record_classification`**. It verifies an HMAC over the body and then mints
`ATH-00xxx` from the shared sequence (`:144`), writes guardian PII through
`link_guardian` (`:136`), and upserts `nrhl_athlete` (`:155`).

The receipt string is recorded in `identity_note` as prose. Any 4-character
string — `TEST`, `AUDITTEST001`, a receipt already classified TEST — produces
a permanent NRHL athlete identity indistinguishable from a real one.

This is R3 with its payment dimension made explicit: the route is named
`onboard-**paid**-athlete` and has no concept of payment. It trusts
`nairobihockey.com` completely, and nairobihockey.com does not hold the
settlement ledger — this engine does.

### F-4 · The callback mishandles both outcomes M3 added — **HIGH**

`app/api/v1/biz/mpesa-callback/route.ts:277-286` types `result.outcome` as
`"DUPLICATE" | "SETTLED" | "SETTLED_UNMATCHED" | "SETTLED_UNDERPAID"`.
M3 added `TEST_CLASSIFIED` and `RECONCILIATION_REQUIRED`. Consequences:

- **Safe by luck.** Neither equals `"SETTLED"`, so the three post-settlement
  blocks are skipped. The boundary holds because of strict equality, not
  because anyone handled the case. That is what the new guard test pins.
- **Actively wrong reporting.** `reconciliationRequired` (`:406`) is computed
  as `SETTLED_UNMATCHED || SETTLED_UNDERPAID`. A `RECONCILIATION_REQUIRED`
  verdict — the one case M3 built to demand human attention — is returned to
  the caller as HTTP 202 with `reconciliationRequired: **false**`. Scenario G
  from the brief (a real payment arriving after a synthetic conflicting
  reference) is detected correctly in the database and then announced as
  unremarkable.

### F-5 · Cross-organization settlement is possible via the household fallback — **HIGH**

`registrations.account_reference` is `UNIQUE`, so the primary match
(`= p_account_reference`) is genuinely 1:1 and safe.

The fallback is not. STK callbacks do not echo `AccountReference` (the
route's own comment, `:54-57`), so real Daraja settlements routinely reach
the second matcher:

```sql
select * from registrations
 where msisdn_hash = p_msisdn_hash and payment_status <> 'PAYMENT_SETTLED'
 order by (amount_expected_kes = p_amount_kes) desc,
          stk_pushed_at desc nulls last, created_at desc
 limit 1;
```

**No `venture_context` predicate** — confirmed against the deployed function:
the string `venture_context` does not appear in it. `registrations_open_checkout_key`
deliberately permits a household to hold several open registrations
(sibling, different tier), and those may span ventures.

Amount is a *sort preference*, not a filter. When two open registrations
share a price, or when `amount_expected_kes` is null, the winner is simply
the most recent STK push. The matched row's `venture_context` then decides
which onboarding pipeline runs, which athlete plane gets a row, which
documents are issued and which portal the family lands in.

A Big Ice payment can therefore settle an NRHL registration, and vice versa.
Blast radius is zero today (one registration, zero athletes) and becomes real
the moment a second venture registration exists for one phone number.

### F-6 · Test athletes are indistinguishable downstream — **MEDIUM**

`record_classification` has no rows for `bigice_athlete`, `bigice_enrollment`,
`nrhl_athlete` or `registrations`. Once F-1 lets a synthetic payment through,
the resulting athlete counts (dashboard `:223`/`:230`/`:730`), portal
listings, document store and the Convex sync egress all treat it as real, and
there is no vocabulary in which to say otherwise. The classification table's
`record_table` column already accommodates this; nothing uses it.

---

## 4. Brief scenarios, evaluated

| | Scenario | Current behaviour | Verdict |
|---|---|---|---|
| **A** | Genuine production payment | settles, enrolls, mints, onboards, portal | ✅ correct |
| **B** | Exact duplicate callback | `DUPLICATE`, zero state change, no second ID | ✅ correct (M3 t2, t8) |
| **C** | TEST payment | **settles fully** unless classified in advance (F-1); classified later, still reachable via retry (F-2) | ❌ **FAILS** |
| **D** | AUDIT payment | identical to C | ❌ **FAILS** |
| **E** | DEMO payment | identical to C; no documented demo workflow exists | ❌ **FAILS** |
| **F** | Conflicting replay | `RECONCILIATION_REQUIRED`, nothing settled, no ID, evidence preserved | ✅ correct in DB — ⚠ misreported by the route (F-4) |
| **G** | Real payment after synthetic conflicting reference | not lost, not `DUPLICATE`, requires reconciliation | ✅ correct in DB — ⚠ announced as `reconciliationRequired: false` (F-4) |

B, F and G are the M3 work and they hold. C, D and E are the boundary M3 was
never asked to build.

---

## 5. The organization boundary, as it actually stands

| Layer | Isolated? | Mechanism |
|---|---|---|
| Registration intake | yes | `venture_context` written from the server-derived tier (`stk-push:288/309`) |
| Payment ledger | **no** | `payment_events` has no venture column; one `gate_id` for all |
| Settlement matching | **no** | fallback ignores `venture_context` (F-5) |
| Onboarding dispatch | yes | `onboardBigIceAthlete` returns early unless `venture_context === 'BIG_ICE'` (`:145`); NRHL packs filter on `isProgrammeId(tier)` |
| Athlete plane | yes | separate tables, separate code prefixes (`BIIF` vs `ATH-`) |
| ID sequence | **no** | one `athlytica_core.scalable_id_sequence` behind all three issuer functions |
| Portal | yes | Big Ice only, guardian email → `bigice_athlete` |

Isolation is enforced **downstream of matching and nowhere upstream of it**.
Onboarding dispatch is correct precisely because it re-reads
`venture_context` from the registration — which means the whole boundary
rests on the matcher having picked the right registration, and the matcher
has no venture predicate.

---

## 6. M1 preconditions — answered

| Question | Answer |
|---|---|
| When is an Athlete ID actually required? | At the first durable athlete record. Big Ice: post-settlement onboarding. NRHL: the webhook, and legacy ETL. |
| Is payment a prerequisite? | **Big Ice yes** (`retry-onboarding:118`; callback gated on `SETTLED`). **NRHL no** — F-3. **ETL no** — founder-gated bulk load. |
| Is enrollment a prerequisite? | **No.** In Big Ice the ID is minted *before* the enrollment upsert (`bigice-onboarding.ts:200` → `:251`), and an enrollment failure returns `reviewRequired` with the code already permanent. |
| Do legacy athletes bypass issuance? | **No, and this is R4.** `leagues/nrhl/ingest:146` mints from the same sequence, now at 504, into a corpus whose real codes run `ATH-500`–`ATH-638`. Legacy migration is separately blocked by D-04. |
| Can a payment retry trigger issuance? | **No.** A repeated receipt returns `DUPLICATE` before any onboarding; a conflicting one returns `RECONCILIATION_REQUIRED`. M3 test 17 confirms the sequence did not move under replay. |
| Can an onboarding retry trigger issuance? | **Not a second one for the same athlete** — `matchAthlete()` resolves the household first. **But it can mint the first one for a classified-TEST payment** (F-2), and a failure between mint and insert still burns a code (R15/D-20). |

The canonical rule — one real athlete, one canonical UID, one permanent
Athlytica ID — is not violated by *retries*. It is violated by *sequence
burn* (D-20) and threatened by *unauthorized issuance* (F-2, F-3).

---

## 7. Tests

| Suite | Result |
|---|---|
| Full application suite (`node --test "tests/**/*.test.mts"`) | **146 / 146 pass** |
| `tests/payment-revenue-source.test.mts` (0.3C revenue guards) | 4 / 4 pass |
| M3 regression (19 assertions, `M3_TEST_RESULTS.md`) | applied migration verified in place; production state unchanged and matching the recorded post-apply table |
| **New:** `tests/payment-authorization-boundary.test.mts` | **3 / 3 pass** |

The new guards, and why each is not ceremony:

1. **Issuance census = 3 sites.** M1 is only auditable while the set of
   minting paths is enumerable. A fourth must be reviewed, not discovered.
2. **Post-settlement work is gated on `outcome === "SETTLED"`, exactly.**
   Mutation-verified: rewriting one guard to `!== "DUPLICATE"` fails the
   test. That single edit is the difference between "a TEST payment onboards
   nobody" and "a TEST payment onboards a child", and today it is the only
   thing preventing it.
3. **`retry-onboarding` keeps its `PAYMENT_SETTLED` precondition, before the
   call it guards.** It is that route's only money check.

No test asserts a defect as correct, and none was written for behaviour that
does not exist.

---

## 8. Proposed M1 design — **not implemented**

Scope stays exactly D-20: make mint and insert one transaction. The findings
above are separate remediations and must not be folded in.

### Migration `M1_atomic_athlete_issuance`

```sql
-- One round trip, one transaction. The sequence advances only if the
-- athlete row commits; a failed insert rolls the draw back with it.
create or replace function public.bigice_create_athlete(
  p_full_name            text,
  p_guardian_name        text,
  p_guardian_email       text,
  p_guardian_msisdn_hash text,
  p_identity_note        text
) returns text
language plpgsql security definer set search_path to 'public'
as $$
declare v_code text;
begin
  v_code := public.bigice_next_athlete_code();   -- same issuer, same format
  insert into public.bigice_athlete
    (biif_code, full_name, guardian_name, guardian_email,
     guardian_msisdn_hash, origin, identity_note)
  values
    (v_code, p_full_name, p_guardian_name, p_guardian_email,
     p_guardian_msisdn_hash, 'REGISTRATION', p_identity_note);
  return v_code;
end;
$$;

revoke all on function public.bigice_create_athlete(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bigice_create_athlete(text,text,text,text,text)
  to service_role;
```

`nrhl_create_athlete` mirrors it over `nrhl_athlete`. Both keep the existing
`*_next_athlete_code` functions untouched so nothing else breaks.

**Why a function and not a client-side transaction:** supabase-js has no
multi-statement transaction. The mint and the insert can only share a
transaction by being in the same function body. This is the smallest change
that makes the burn impossible.

**Unique-violation contract is preserved.** The insert still raises `23505`
on a duplicate `full_name`; `onboardBigIceAthlete` already distinguishes that
code and returns `reviewRequired`. The RPC must surface the SQLSTATE
unchanged so that branch keeps working. This is the single most likely way to
break the fix while appearing to apply it.

### Application change

`lib/services/bigice-onboarding.ts:190-224` — replace the two-call block with
one `db.rpc("bigice_create_athlete", {...})`. Net deletion. The
`insertError.code === UNIQUE_VIOLATION` branch survives verbatim.

`app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts:143-170` — same
substitution against `nrhl_create_athlete`.

### Paths that must be tested before M1 is called done

| # | Path | Must prove |
|---|---|---|
| 1 | Big Ice first settlement, clean | code minted, athlete row exists, sequence +1 |
| 2 | Big Ice settlement, insert fails on duplicate name | `reviewRequired`, **sequence unmoved** — the whole point |
| 3 | Big Ice settlement, insert fails on a non-unique error | no athlete, **sequence unmoved** |
| 4 | Returning family (`matchAthlete` → MATCH) | RPC never called, sequence unmoved |
| 5 | Duplicate callback | `DUPLICATE`, sequence unmoved |
| 6 | `retry-onboarding` after a mint-then-delivery failure | reuses the same code, sequence unmoved |
| 7 | Concurrent settlement, two receipts, same child | one code, one athlete |
| 8 | NRHL webhook, new athlete | code minted, sequence +1 |
| 9 | NRHL webhook retry (same name) | existing code returned, sequence unmoved |
| 10 | Sequence value before/after the whole suite | moved by exactly the number of committed athletes |

Test 10 is the acceptance criterion. It is also why M1 cannot be proved by a
rolled-back transaction the way M2 and M3 were: the burn is only observable
when the failing insert commits its rollback while the sequence draw does
not — which requires the two-call path to run for real. **Docker, or a
throwaway Supabase project, remains the blocker.**

---

## 9. Recommended remediation order (after M1)

| | Fix | Addresses |
|---|---|---|
| M4 | Classify at intake: pass the callback `source` into the RPC; `MANUAL_RECON` and a `TEST_MODE` flag write a `record_classification` row **inside** the settlement transaction, before the gate | F-1 |
| M5 | Add a classification predicate to `onboardBigIceAthlete` entry and `retry-onboarding` | F-2 |
| M6 | Require a settled, production-classified `payment_events` row in `onboard-paid-athlete` | F-3 |
| M7 | Add `venture_context` to the msisdn_hash fallback; return `SETTLED_AMBIGUOUS` on a cross-venture tie | F-5 |
| M8 | Widen the callback outcome union; fix `reconciliationRequired` | F-4 |

M8 is two lines and cosmetic in the database sense — but it is the line that
tells a human a real payment is in dispute, so it should not wait behind the
larger items.

---

## 10. Final answers

1. **Is classification enforced across every path that can create real
   customer value?** **No.** 3 of 18 paths are classification-aware, and two
   of those three only report revenue.
2. **Can a TEST/AUDIT/DEMO payment create an enrollment or entitlement?**
   **Yes** — F-1 on first arrival, F-2 on retry after classification, F-3
   with no payment at all.
3. **Can a payment retry issue an Athlete ID?** **No.** `DUPLICATE` and
   `RECONCILIATION_REQUIRED` both return before onboarding.
4. **Can an onboarding retry issue an Athlete ID?** **Yes, the first one**,
   including for a classified-TEST settlement (F-2). Not a *second* one for
   the same athlete.
5. **Can cross-organization payment state leak?** **Yes** — F-5, via the
   household fallback matcher. Zero blast radius today.
6. **Is M1 ready to implement?** **Design yes, execution no.** The six
   preconditions are answered (§6) and the design is above. It still needs an
   isolated environment, because acceptance is "the sequence moved by exactly
   the number of athletes that committed".
7. **Highest-risk remaining defect:** **F-1.** It is the only finding that
   needs no operator error and no unusual state — the next genuinely new
   test payment settles fully, mints a permanent Athlete ID and grants portal
   access, and the classification that was built to prevent this cannot
   exist yet at the moment it would have to.

**Revenue reporting being correct is not the payment architecture being
complete.** 0.3C fixed what the books say. What a payment *authorizes* is
still ungoverned.
