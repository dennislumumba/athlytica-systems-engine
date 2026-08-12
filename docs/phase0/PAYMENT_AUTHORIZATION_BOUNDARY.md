# Phase 0.3E — Payment Authorization Boundary

**Date:** 2026-08-12 · **Follows:** Phase 0.3D (`PAYMENT_ADJACENT_PATH_AUDIT.md`)
**Migration:** M4 `20260812172530_m4_payment_authorization_boundary` — **applied**
**Pre-apply test:** 29/29 in a rolled-back transaction against the production schema
**Application suite:** 164/164 (was 149/149)

---

## 1. Current architecture

Money enters through exactly one door and fans out into four planes.

```
/register (stk-push)          /api/v1/auth/register
   │  ATH-XXXX ref               │  REG-#<hash16> ref
   └──────────────┬──────────────┘
                  ▼
           registrations          ← venture_context + amount_expected_kes,
                  │                  both server-derived from the tier table
                  ▼
   POST /api/v1/biz/mpesa-callback[/<secret>]
                  │  DARAJA_CALLBACK · BANK_RAIL · MANUAL_RECON
                  ▼
       settle_payment_transaction()
                  ├── payment_events        (append-only, immutable trigger)
                  ├── gate_states G-W6-PAY
                  ├── users / athletes / athlete_tenant_links
                  └── registrations.payment_status = PAYMENT_SETTLED
                          │
                          ▼  post-settlement, outside the transaction
        ┌─────────────────┼─────────────────┐
        ▼                 ▼                 ▼
  draft webhook   NRHL onboarding    Big Ice onboarding
                       pack          ├── bigice_athlete   (permanent ID)
                                     ├── bigice_enrollment
                                     ├── bigice_document
                                     └── parent portal
```

Two other doors reach the same planes without passing the callback:
`retry-onboarding` (ops token) and `onboard-paid-athlete` (HMAC).

---

## 2. The old authorization path

There wasn't one. There were four unrelated checks, none of which asked
whether the payment was real:

| Path | Its idea of "paid" | What that actually proved |
|---|---|---|
| `mpesa-callback` | `result.outcome === "SETTLED"` | money moved and matched a registration |
| `retry-onboarding` | `payment_status === "PAYMENT_SETTLED"` | money moved at some point |
| `onboard-paid-athlete` | `mpesaReceipt` is 4–64 chars | **nothing** |
| `onboardBigIceAthlete` | — | nothing; it trusted its caller |

None consulted `record_classification`. None checked the venture. So:

- a first-arrival TEST payment settled fully and minted an identity (**F-1**);
- classifying it afterwards removed it from revenue and nothing else (**F-2**);
- any 4-character string minted an NRHL identity (**F-3**);
- `RECONCILIATION_REQUIRED` was reported as `reconciliationRequired: false` (**F-4**);
- a Big Ice payment could settle an NRHL registration (**F-5**).

---

## 3. The new authorization path

```
PAYMENT RECEIVED   payment_events row exists            ← the ledger records
                                                          everything that arrives
      ≠
PAYMENT SETTLED    matched a registration, status flipped
      ≠
ENROLLMENT         payment_service_authorization() = AUTHORIZED
AUTHORIZED
      ≠
ATHLETE CREATED    bigice_athlete / nrhl_athlete row
      ≠
SERVICE            enrollment + documents + portal
ENTITLEMENT
```

Every arrow is now a real check, and the third one is the boundary:

```
  caller ──▶ lib/services/payment-authorization.ts
                   │  supplies DARAJA_ENV (the app knows the rail;
                   │  Postgres cannot see it)
                   ▼
             public.payment_service_authorization(receipt, venture, rail_is_production)
                   │
                   ▼
        AUTHORIZED │ NOT_AUTHORIZED │ RECONCILIATION_REQUIRED
```

### The inversion that resolves F-1

F-1 could not be fixed by classifying earlier, because a receipt number is
minted by Safaricom and first observed *in the callback*. Any rule of the
form "has someone marked this as a test?" is unanswerable on first arrival.

So the question is inverted, and so is its default:

| | Question | Default | Why that default |
|---|---|---|---|
| **Revenue** (M2) | is this **not** production? | PRODUCTION | a forgotten classification over-counts money rather than hiding a real payment |
| **Service** (M4) | is this **positively** authorized? | NOT_AUTHORIZED | a forgotten anything must not mint a permanent identity |

Both are fail-safe; they simply fail safe in opposite directions, because
the cost of being wrong points the opposite way.

### The positive evidence, and why it is sound

A production payment is one that **matched a registration created by the
production intake funnel**. `registrations` rows are written only by
`stk-push` and `auth/register`, whose `venture_context` and
`amount_expected_kes` come from the server-side tier table, never a client
field.

Measured against production, all five synthetic `payment_events` match
**zero** registrations:

| receipt | amount | account_reference | ref match | hash match |
|---|---|---|---|---|
| AUDITTEST001 | 180,000 | ATH-SZTV | 0 | 0 |
| AUDITTEST002 | 350,000 | ATH-TRKK | 0 | 0 |
| AUDITTEST003 | 16,500 | ATH-BF9V | 0 | 0 |
| AUDITTEST004 | 95,000 | ATH-R7K2 | 0 | 0 |
| SGX7HQ2LM9 | 16,500 | ATH-9GG9 | 0 | 0 |

Every one fails the rule naturally. **Test 25 proves this without any
classification row at all** — the classification was deleted inside the
transaction and `AUDITTEST001` was still denied. The rule would have
blocked all five on first arrival, in 2026-08, before M2 existed.

---

## 4. Authoritative payment states

`settle_payment_transaction` returns exactly one:

| Outcome | Money | Service | Meaning |
|---|---|---|---|
| `SETTLED` | recorded | *authorization decides* | matched a registration in one venture |
| `SETTLED_UNDERPAID` | recorded | no | matched, paid less than expected |
| `SETTLED_UNMATCHED` | recorded | no | no registration; exception written |
| `DUPLICATE` | already recorded | no-op | every immutable attribute equal |
| `RECONCILIATION_REQUIRED` | recorded | no | conflicting replay, ambiguous venture, or ambiguous registration |
| `TEST_CLASSIFIED` | recorded | no | pre-existing non-PRODUCTION classification |

`payment_service_authorization` returns exactly one:

| Status | Reasons |
|---|---|
| `AUTHORIZED` | `MATCHED_PRODUCTION_REGISTRATION` |
| `NOT_AUTHORIZED` | `RECEIPT_ABSENT` · `VENTURE_NOT_SPECIFIED` · `NO_PAYMENT_EVENT` · `NOT_SETTLEMENT_EVIDENCE` · `CLASSIFIED_TEST/AUDIT/DEMO` · `NON_PRODUCTION_RAIL` · `NO_SETTLED_REGISTRATION` · `VENTURE_UNKNOWN` · `VENTURE_MISMATCH` · `UNDERPAID` · `SCHEMA_DEBT` · `AUTHORIZATION_LOOKUP_FAILED` |
| `RECONCILIATION_REQUIRED` | `OPEN_RECONCILIATION_EXCEPTION` · `MULTIPLE_SETTLED_REGISTRATIONS` |

**Trusted classification sources, in precedence order.** Every one is
server-side; none is settable by a caller:

1. `record_classification` — the owner's explicit decision, outranks all below
2. unresolved `payment_reconciliation_exception` — disputed evidence
3. `DARAJA_ENV` — the rail; sandbox Daraja calls back for every well-formed request
4. the matched registration — the intent record
5. nothing matched — deny

---

## 5. Venture isolation rules

**A payment's venture is the `venture_context` of the registration it
matched. It is never inferred from amount, phone, receipt shape or price.**

| Layer | Isolated | How |
|---|---|---|
| Intake | yes | `venture_context` from the server-side tier table |
| Ledger | no (by design) | one `payment_events`, one gate; venture lives on the registration |
| **Matching** | **yes (new)** | account_reference is UNIQUE; the household fallback refuses to cross ventures |
| **Authorization** | **yes (new)** | caller names its venture; mismatch denies |
| Onboarding dispatch | yes | `venture_context !== 'BIG_ICE'` returns early |
| Athlete plane | yes | separate tables, `BIIF` vs `ATH-` |
| ID sequence | **no** | one `scalable_id_sequence` behind all three issuers — R4, M1 |
| Portal | yes | Big Ice only, guardian email |

The fallback matcher, precisely:

```
open registrations for this msisdn_hash
  ├── spanning >1 venture      → RECONCILIATION_REQUIRED / AMBIGUOUS_VENTURE
  ├── exactly 1 candidate      → settle it
  └── >1 candidate, 1 venture  → exact amount match must pick exactly one,
                                 else RECONCILIATION_REQUIRED / AMBIGUOUS_REGISTRATION
```

Amount may disambiguate **between siblings inside one venture** and nowhere
else. It is deliberately *not* an exclusion filter: excluding on amount
would turn a genuine underpayment into an unmatched settlement and destroy
the `SETTLED_UNDERPAID` signal ops needs (test 22).

> **This stopped being theoretical during this phase.** A live registration
> `ATH-WKTR` (Big Ice academy, KES 180,000) arrived while the work was in
> progress. Production now holds **one household with two open
> registrations spanning BIG_ICE and NRHL** — exactly the F-5 case. Under
> the pre-M4 matcher a payment from that phone whose amount matched neither
> row would have settled whichever was pushed most recently, regardless of
> venture. Under M4 it is `RECONCILIATION_REQUIRED`.

---

## 6. F-1 remediation — first-arrival classification

**Status: FIXED.**

- Authorization requires positive evidence; absence denies (§3).
- `DARAJA_ENV` added as a trusted first-arrival rail signal. It already
  existed in `utils/mpesaDaraja.ts` and was simply never consulted for
  authorization — this is a discovered mechanism, not an invented one.
- `lib/services/payment-authorization.ts` reads it from `process.env` in
  one place; there is no request field that can set it.
- The gate flip moved **below** matching: an unmatched settlement is no
  longer gate evidence (tests 1, 2, 26).

Proof: tests 3, 9, 12, 13, 25.

## 7. F-2 remediation — retry-onboarding

**Status: FIXED.**

`retry-onboarding` keeps `PAYMENT_SETTLED` as a cheap early exit and adds
`authorizePaymentForService(db, settled_receipt, "BIG_ICE")` before
`onboardBigIceAthlete`. A denial returns 409 with the reason and mints
nothing.

Post-hoc classification now actually revokes service (tests 15, 16, 17) —
previously it only removed the payment from revenue. Open reconciliation
exceptions block the retry (test 18). Idempotency is unchanged and still
carried by `matchAthlete()` + the `mpesa_receipt` UNIQUE constraint.

## 8. F-3 remediation — NRHL onboard-paid-athlete

**Status: FIXED.**

The route now verifies server-side, before `link_guardian` and before
`nrhl_next_athlete_code`, that the receipt names a payment which exists, is
settled, is production-classified, is not in reconciliation, arrived on the
production rail, and belongs to **NRHL**. Denials return 402; reconciliation
returns 409.

The HMAC proves *who is asking*. It cannot prove money arrived, and
conflating the two is what made a route named "onboard-**paid**-athlete"
have no concept of payment.

> **No live caller.** `brand-nrhl/site/README.md` documents this as the
> destination for the NRHL site's payment webhook, but the real money path
> is `/register` → `stk-push` → callback (proxied via `vercel.json`). The
> route is a designed-but-unused surface, so tightening it breaks nothing
> today. **If the NRHL site is ever wired to it, it must send a receipt
> from a settled NRHL registration in this engine** — which is the correct
> contract and was not previously enforced.

Proof: test 14 (invented receipt), tests 10 and 11 (wrong venture).

## 9. F-4 remediation — callback outcome contract

**Status: FIXED.**

- The outcome union now names all six states, so the compiler forces a
  decision instead of leaving safety to strict equality.
- Response carries `serviceAuthorization` and `authorizationReason`
  alongside `status` — money and permission answered separately.
- `reconciliationRequired` is derived from the authorization verdict plus
  the settlement verdict, so `RECONCILIATION_REQUIRED` can no longer be
  reported as `false`.
- HTTP 200 now requires `SETTLED` **and** authorized; everything else is 202.
- A `SETTLED`-but-unauthorized settlement logs `console.error` — a state a
  person must see.

## 10. F-5 remediation — venture boundary

**Status: FIXED.** See §5. Proof: tests 4, 5, 6, 7, 8, 10, 11.

---

## 11. The service authorization rule

**One authoritative source.** `public.payment_service_authorization`, reached
only through `lib/services/payment-authorization.ts`.

```ts
authorizePaymentForService(db, receipt, venture)
  → { status: "AUTHORIZED" | "NOT_AUTHORIZED" | "RECONCILIATION_REQUIRED", … }
mayCreateCustomerValue(auth) → boolean
```

The rule lives in SQL because every fact it needs is in the database and
must be read consistently. The module supplies the one fact that is not
(`DARAJA_ENV`) and maps the answer to a typed verdict.

**It fails closed on every path**: RPC error, missing function (42883),
null response, malformed response, and even `AUTHORIZED` arriving without a
`registration_id`. A lookup that failed is not a lookup that said yes.

Consumers, and nothing else: `mpesa-callback`, `retry-onboarding`,
`onboard-paid-athlete`. A guard test asserts none of them re-implements the
rule with its own `record_classification` query.

---

## 12. Test matrix

### Database — 29/29, rolled-back transaction against the production schema

| # | Test | Result |
|---|---|---|
| 1 | unmatched settlement is not a match | PASS |
| 2 | gate stays false after an unmatched settlement | PASS |
| 3 | unmatched payment denies service | PASS |
| 4 | **Big Ice payment settles Big Ice registration** | PASS |
| 5 | **NRHL payment settles NRHL registration** | PASS |
| 6 | **same amount across ventures cannot cross-settle** | PASS |
| 7 | cross-venture attempt settled nothing | PASS |
| 8 | `AMBIGUOUS_VENTURE` evidence preserved | PASS |
| 9 | **legitimate production payment AUTHORIZED** | PASS |
| 10 | **Big Ice receipt cannot authorize NRHL** | PASS |
| 11 | **NRHL receipt cannot authorize Big Ice** | PASS |
| 12 | sandbox rail denies a matched payment | PASS |
| 13 | null rail flag denies | PASS |
| 14 | **invented receipt string is not proof** | PASS |
| 15 | **post-hoc TEST revokes authorization** | PASS |
| 16 | **AUDIT revokes authorization** | PASS |
| 17 | **DEMO revokes authorization** | PASS |
| 18 | open exception forces reconciliation | PASS |
| 19 | M3 regression — exact duplicate | PASS |
| 20 | M3 regression — conflicting replay never settles | PASS |
| 21 | M3 regression — stored amount unmodified | PASS |
| 22 | underpayment keeps its `SETTLED_UNDERPAID` signal | PASS |
| 23 | existing `AUDITTEST001` denied | PASS |
| 24 | existing `SGX7HQ2LM9` denied | PASS |
| 25 | **synthetic denied WITHOUT any classification row** | PASS |
| 26 | gate flips on the first matched settlement | PASS |
| 27 | pre-existing ledger rows unmodified | PASS |
| 28 | athlete ID sequence unmoved (504) | PASS |
| 29 | a later settlement does not overwrite gate evidence | PASS |

### Application — 164/164

15 new: 8 boundary guards (`payment-authorization-boundary.test.mts`) and
7 behavioural tests of the rule's TypeScript half
(`payment-authorization-rule.test.mts`, stub Supabase client — no database).

### Mutation verification — 6/6 caught

Every guard was verified to fail when its subject is broken:

| Mutation | Caught by |
|---|---|
| retry-onboarding branch neutered to `if (false)` (call still runs) | `retry-onboarding authorizes before it can mint` |
| callback side effect reverted to outcome-only gating | `callback side effects are gated on authorization…` |
| `reconciliationRequired` loses the authorization verdict | `the callback reports RECONCILIATION_REQUIRED honestly` |
| response stops reporting `serviceAuthorization` | same |
| NRHL mints before verifying payment | `NRHL onboarding verifies a payment…` |
| fail-closed removed from the rule | `an RPC error denies rather than falling open` |

The first mutation is the instructive one: an earlier version of that guard
only checked that `authorizePaymentForService` was *called*, and survived a
mutation that discarded the answer. Calling the rule is not obeying it.

---

## 13. Production changes

| Change | Detail |
|---|---|
| **M4 migration** | `20260812172530_m4_payment_authorization_boundary`, applied |
| New function | `public.payment_service_authorization(text,text,boolean)` — revoked from `anon`/`authenticated`, granted to `service_role` |
| Replaced function | `settle_payment_transaction` — venture-constrained fallback; gate moved below matching; gate `ON CONFLICT` fixed |
| Widened CHECK | `payment_reconciliation_exception.kind` + `AMBIGUOUS_VENTURE`, `AMBIGUOUS_REGISTRATION` |
| **Data mutated** | **none** |

Post-apply verification: `payment_events` 5 · `record_classification` 5 ·
exceptions 0 · gate `false/null` · sequence 504 · immutable trigger enabled
(`O`) · `anon`/`authenticated` execute = false · `service_role` = true ·
`SGX7HQ2LM9` → `NOT_AUTHORIZED`.

### A second bug the pre-apply test caught

Test 26 initially failed. The gate flip was
`on conflict (gate_id) do nothing`, and M3 step 5 left the row present with
`live=false` — so **`G-W6-PAY` could never flip again**. M3's reset was
irreversible by any real payment. Zero impact today (nothing reads
`gate_states`) and it would have surfaced the day the draft engine was
wired up. Fixed with a conditional `DO UPDATE` that flips exactly once and
never overwrites the first real evidence (tests 26, 29).

This is the second consecutive migration whose test-before-apply discipline
caught a real defect. M3 caught a `22P02` that would have thrown on the
first conflicting replay.

---

## 14. Rollback plan

`supabase/migrations/rollback/20260812172530_m4_payment_authorization_boundary_rollback.sql`

1. **Roll back the application first.** Consumers call
   `payment_service_authorization`; if it vanishes while they are deployed
   they get 42883 and fail closed — safe, but Big Ice onboarding stops.
2. `drop function payment_service_authorization`.
3. Restore the M3 `settle_payment_transaction` verbatim (reinstates F-5).
4. Narrow the `kind` CHECK — **fails if any `AMBIGUOUS_*` row exists**, and
   that is deliberate: refusal evidence must not be deleted to make a
   rollback tidy. Resolve those rows, or leave the widened CHECK (it is
   permissive and harmless under M3).

Touches no data. `payment_events`, `record_classification`, `registrations`
and `gate_states` are left exactly as they are.

---

## 15. Remaining blockers

| | Blocker | Note |
|---|---|---|
| 1 | **`app/api/v1/performance/route.ts` is syntactically broken** | **Not mine.** Modified concurrently during this session; contains an `export function` pasted inside a Zod object literal and an `// ...existing code...` marker. It is the *only* file with typecheck errors and **it will fail the Vercel build**. Left untouched — the intent is not mine to guess. |
| 2 | **M1 — athlete-ID atomicity (D-20)** | Designed, not implemented. Needs Docker: acceptance is "the sequence moved by exactly the number of athletes that committed", unprovable by a rolled-back transaction. |
| 3 | Live cross-venture household | One household, two open registrations, BIG_ICE + NRHL. M4 makes this reconcile rather than mis-settle, but that family's payment will now need manual reconciliation unless they pay with the correct `ATH-XXXX` account number. |
| 4 | D-04 — no authoritative legacy source | Gates all migration. |
| 5 | D-16 — migration ledger drift | 3 of 35 files now match their applied version (M2, M3, M4). |
| 6 | RLS untested | Unchanged by this phase, deliberately. |
| 7 | `record_classification` still has no non-`payment_events` rows | Athletes, enrollments and registrations remain unclassifiable (F-6, 0.3D). Only matters once a test payment gets through, which M4 now prevents. |

---

## 16. What this phase does **not** claim

Authorization is enforced on every path that can create production customer
value **today**: the callback, the retry, and the NRHL webhook. Three other
paths can still create athlete records without any payment involvement, and
were never in scope:

| Path | Auth | Payment involved |
|---|---|---|
| `leagues/nrhl/ingest` | founder / head coach | no — bulk legacy ETL |
| `onboarding/google-forms` | HMAC | no |
| `athlytica_core` trigger | — | no; table unused |

These are legitimate non-payment doors. They are listed so that "every path
is covered" is never read more broadly than it was proved.

Legacy athlete access is unchanged: `resolveGuardian` still resolves by
verified guardian email against `bigice_athlete`, and nothing in M4 touches
that path or any existing row.
