# M3 — Payment Replay Integrity: Test Results

**Date:** 2026-08-12 · **Applied as:** `20260812122254_m3_payment_replay_integrity`
**Method:** every assertion executed inside a `BEGIN … ROLLBACK` transaction
against the live production schema. Nothing persisted; verified afterwards that
`payment_events` was still 5 rows and no M3 object existed.

**Result: 19 / 19 PASS.**

---

## 1. Immutable transaction attributes (duplicate equivalence set)

Established by inspecting `public.payment_events`, not invented.

| Column | In equivalence? | Reason |
|---|---|---|
| `mpesa_receipt_number` | **key** | `UNIQUE`. The identity of the transaction. |
| `gate_id` | yes | which gate the settlement belongs to |
| `amount_kes` | **yes** | what was paid |
| `msisdn_hash` | **yes** | who paid (HMAC-SHA256; the raw MSISDN never persists) |
| `account_reference` | **yes** | what it was paid for |
| `transaction_timestamp` | **yes** | when Safaricom says it happened |
| `result_code` | yes | `CHECK`-constrained to 0; included for completeness |
| `id` | **no** | our surrogate, assigned by us, never by the payer |
| `created_at` | **no** | when *we* recorded it. A genuine retry legitimately has a later `created_at`; including it would make **every** retry a false conflict. |

`account_reference` is safe to compare because the callback derives it
deterministically (`mpesa-callback/route.ts:241-243`): a phone-bearing reference
is canonicalised through HMAC with a fixed key; an opaque reference passes
through untouched. Same input, same output.

> Residual dependency: if `MSISDN_HASH_KEY` were rotated, derived references
> would change and legitimate retries would read as conflicts. `utils/msisdn.ts`
> already documents rotation as catastrophic for settlement matching, so M3
> introduces no new exposure — but it does add one more thing that breaks.

---

## 2. State machine as implemented

```
receipt not seen ─────────────► record event
                                  ├─ classified non-PRODUCTION → TEST_CLASSIFIED
                                  └─ otherwise → flip gate → match → SETTLED
                                                                  │
                                                                  ├─ no match → SETTLED_UNMATCHED + exception row
                                                                  └─ underpaid → SETTLED_UNDERPAID

receipt seen, all attrs equal ─► DUPLICATE                (idempotent no-op)

receipt seen, any attr differs ► RECONCILIATION_REQUIRED  (exception row written,
                                                           stored event untouched,
                                                           NOTHING settled)
```

Concurrency: the pre-check `SELECT` cannot see another transaction's uncommitted
row, so two concurrent callbacks both reach the `INSERT`. One wins; the loser
catches `unique_violation`, re-reads the now-committed row and runs **the same
verdict function**. That is what guarantees exactly one settlement, and it is
why the verdict logic lives in a shared helper rather than being written twice.

---

## 3. Results

| # | Test | Expected | Actual | Result |
|---|---|---|---|---|
| 1 | first legitimate payment | `SETTLED` | `SETTLED` | **PASS** |
| 2 | exact duplicate callback | `DUPLICATE` | `DUPLICATE` | **PASS** |
| 3 | same receipt, different **amount** | `RECONCILIATION_REQUIRED` | same | **PASS** |
| 4 | same receipt, different **MSISDN** | `RECONCILIATION_REQUIRED` | same | **PASS** |
| 5 | same receipt, different **timestamp** | `RECONCILIATION_REQUIRED` | same | **PASS** |
| 6 | pre-classified TEST receipt | `TEST_CLASSIFIED` | same | **PASS** |
| 7 | **CRITICAL** — real callback vs stale synthetic `AUDITTEST001` | `RECONCILIATION_REQUIRED` | same | **PASS** |
| 8 | callback retry is idempotent | `DUPLICATE` | `DUPLICATE` | **PASS** |
| 9 | committed row, identical data (race loser) | `DUPLICATE` | `DUPLICATE` | **PASS** |
| 10 | committed row, conflicting data (race loser) | `RECONCILIATION_REQUIRED` | same | **PASS** |
| 11 | conflict names `amount_kes` only | `{amount_kes}` | `{amount_kes}` | **PASS** |
| 12 | legitimate payment settled its registration | `1` | `1` | **PASS** |
| 13 | **no settlement from any conflicting replay** | `0` | `0` | **PASS** |
| 14 | stored `AUDITTEST001` amount **unchanged** | `180000.00` | `180000.00` | **PASS** |
| 15 | gate untouched by a `TEST_CLASSIFIED` receipt | `AUDITTEST001` | `AUDITTEST001` | **PASS** |
| 16 | `CONFLICTING_REPLAY` exceptions (T3,T4,T5,T7,T10) | `5` | `5` | **PASS** |
| 17 | **athlete ID sequence untouched by replay** | `504` | `504` | **PASS** |
| 18 | `payment_events` grew by exactly 2 new receipts | `7` | `7` | **PASS** |
| 19 | production-only view excludes classified rows | `1` | `1` | **PASS** |

### The critical D-23 regression test (row 7)

A synthetic record exists for `AUDITTEST001` (KES 180,000). A "real" callback
arrives for the same receipt with a different amount (KES 99,999), different
MSISDN and different timestamp.

| Requirement | Observed |
|---|---|
| NOT `DUPLICATE` | ✅ returned `RECONCILIATION_REQUIRED` |
| NOT overwritten | ✅ stored amount still `180000.00` (row 14) |
| NOT silently ignored | ✅ `CONFLICTING_REPLAY` row written with `differing_fields` |
| NOT automatically settled | ✅ zero registrations settled by it (row 13) |

---

## 4. A real bug the test caught

The first run **failed at test 3** with:

```
22P02: malformed array literal: "amount_kes"
QUERY: v_diff := v_diff || 'amount_kes'
```

`text[] || 'literal'` resolves to `anyarray || anyarray`, so Postgres tried to
parse `'amount_kes'` as an array. Replaced with `array_append(v_diff, …)`.

**This would have thrown on the first conflicting replay in production** — the
exact moment the feature exists to handle, and a moment when a real payment is
in flight. It was caught only because the tests ran before the apply.

One further discrepancy: test 16 initially read `expected 4, actual 5`. **My
expectation was wrong, not the code** — the suite produces five conflicts
(T3, T4, T5, T7, T10), not four. Corrected and re-run for a clean 19/19.

---

## 5. Post-apply verification (production)

| Check | Value |
|---|---|
| `payment_events` count | **5 — unchanged** |
| `payment_events_immutable` trigger | **`O` (enabled)** |
| `G-W6-PAY` live | **`false`** |
| `G-W6-PAY` evidence / live_at | **`null` / `null`** |
| settlement fn contains replay check | **true** |
| `_payment_replay_verdict` exists | 1 |
| `payment_reconciliation_exception` | exists, 0 rows |
| `payment_events_production` view | exists, **0 rows** |
| PRODUCTION revenue | **KES 0** |
| excluded synthetic | **KES 658,000.00** |
| registrations / settled | 1 / **0** |
| `bigice_athlete` / `nrhl_athlete` | 0 / 0 |
| athlete ID sequence | **504 — unmoved** |
| anon read exception table | **false** |
| authenticated write exception table | **false** |
| authenticated read production view | **false** |
| `record_classification` | 5 — untouched |
| `athlytica_core` RLS | **unchanged** — all 4 still disabled |

M2's privilege model is preserved: the new table and view are revoked from
`anon` and `authenticated` and granted only to `service_role`, matching
`record_classification`. **No privilege escalation was introduced.**

---

## 6. Scope discipline

The migration contains **only** payment objects. Verified by grep before apply:
no `athlytica_core`, no `scalable_id_sequence`, no `FORCE ROW LEVEL SECURITY`,
no `bigice_athlete`/`nrhl_athlete`, no application code.

RLS remains a separate gate. `athlytica_core` is untouched and still awaits the
`FORCE RLS` vs `SECURITY DEFINER` test, which needs an isolated environment.

---

## 7. What is NOT yet done

**The M2 classification now has a database consumer (`payment_events_production`)
but no application consumer.** Two financial reads still query `payment_events`
directly:

| Consumer | File | What it computes | Counts synthetic money? |
|---|---|---|---|
| `railTotalKes` | `app/api/v1/workspace/dashboard/route.ts:542` | sum of `amount_kes` over settled payments | **YES** |
| run-rate aggregate | `app/api/v1/biz/cash-watcher/route.ts:71` | 30-day and 7-day `amount_kes` sums | **YES** |

Both should read `payment_events_production`. That is a two-line application
change and is **deliberately excluded from M3** — the phase brief forbids
combining application changes into this migration.

Consumers left unmodified, and why:

| Consumer | Line | Why unchanged |
|---|---|---|
| NRHL payments list | `dashboard:86` | displays the last 25 events; a ledger view should show everything that arrived, including test rows |
| HQ payments list | `dashboard:505` | same — raw rail listing, explicitly commented as such |
| Big Ice metrics feed | `dashboard:701` | selects `amount_kes` but does not sum it |
| `byVenture.settledKes` | `dashboard:556` | sums `registrations.amount_expected_kes`, not `payment_events`. Different source; unaffected by classification. |
| `retry-onboarding` | route | reads a settled registration, not the payment ledger |

**Until the two financial consumers are switched, revenue figures can still
count synthetic money.** They currently read KES 658,000 of it.
