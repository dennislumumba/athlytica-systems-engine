# System Architecture Blueprint — Passport Ledger & Instant Split Engine
**Target: athlytica-engine-backend | Schema migration: `schemas/002_passport_monetization.sql` | v1.0**

---

## 1. Commercial Parameters

| Parameter | Value | Storage |
|---|---|---|
| Gross Passport Fee (F) | KES 1,500 / athlete / 30-day cycle | `fee_schedule.gross_fee_kes` |
| Coach Share (C) | 10% = KES 150 | `coach_share_bps = 1000`, derived column |
| Platform Share (P) | 90% = KES 1,350 | derived column |
| Origin frameworks | NRHL, BIIF, INDEPENDENT | `origin_framework_enum` |

Rates live in `fee_schedule` as versioned config rows with basis-point integer math. A future fee change is an INSERT with a new `effective_from` — zero code deploy, and historical splits stay attributable to the schedule that priced them.

## 2. Dual-State Ledger Mechanics

```
M-Pesa C2B / Card capture
        │
        ▼
┌─────────────────────────────┐
│ STATE A — THE HOLD          │  fn_open_subscription_and_hold()
│ passport_subscription (30d) │  • KES 150 → split_allocation
│ split: pending_verification │    (status: pending_verification)
│ wallet.pending_balance +150 │  • ledger row: split_hold
└─────────────┬───────────────┘
              │  first VALID data payload of cycle
              │  (baseline metrics | attendance init | weekly log)
              ▼
┌─────────────────────────────┐
│ STATE B — INSTANT RELEASE   │  fn_release_split_on_data_gate()
│ split: released             │  • pending −150 → available +150
│ wallet.available +150       │  • ledger row: split_release
│ WITHDRAWABLE IN REAL TIME   │  • same DB txn as payload insert
└─────────────┬───────────────┘
              │  coach taps withdraw
              ▼
┌─────────────────────────────┐
│ WITHDRAWAL                  │  fn_request_withdrawal()
│ available −N (reserved)     │  → Daraja B2C fire
│ payout_request: requested   │  → fn_settle_withdrawal() on callback
└─────────────────────────────┘
```

Design decisions that make "instant" safe:

1. **Debit-at-request, not debit-at-settlement.** Available balance is decremented the moment a withdrawal is requested (under `FOR UPDATE` row lock). A slow or replayed M-Pesa callback can never produce a double-spend; failure paths restore the balance via a `withdrawal_reversed` ledger row.
2. **The data gate is the only release path.** `fn_release_split_on_data_gate` refuses any payload that fails syntax or timestamp validation, and `uq_split_per_subscription` makes release exactly-once per billing cycle. Empty data entry cannot mint money.
3. **Balances are materialized, the ledger is truth.** `coach_wallet` columns exist for O(1) reads; `wallet_transaction` is append-only (blocking trigger + grant policy) with unique idempotency keys. A nightly reconciliation job re-derives balances from the ledger and alarms on any drift.
4. **Webhook idempotency at every ingress.** Payment replays collide on `(payment_channel, payment_reference)`; release replays collide on the split unique index; B2C callbacks collide on the payout state machine. All three exit cleanly without moving money twice.

## 3. API Surface

### `POST /api/v1/engine/wallet/withdraw`
```jsonc
// Request
{ "coach_node_id": "uuid", "amount_kes": 1500 }
// 200
{ "payout_id": "uuid", "status": "processing", "destination": "+2547XXXXXX21" }
// 422 — amount > available_balance | node not M-Pesa verified | node suspended
```
Controller pattern: call `fn_request_withdrawal` → on success fire Daraja B2C with `payout_id` as `OriginatorConversationID` → register callback route → callback invokes `fn_settle_withdrawal`. If the B2C dispatch itself throws, immediately settle as failed (funds restored) and surface a retryable error.

### `GET /api/v1/engine/metrics/node-yield?coach_node_id=…`
Backed by the `coach_node_yield` view:
```jsonc
{
  "active_passports": 27,
  "projected_monthly_yield_kes": 4050,
  "splits_awaiting_data": 4,        // KES 600 sitting behind unsubmitted session data
  "withdrawable_now_kes": 3450,
  "lifetime_earned_kes": 28950,
  "lifetime_withdrawn_kes": 25500
}
```
`splits_awaiting_data` is the behavioral lever: surface it in the coach app as "KES 600 unlocked by your next session log."

### Ingress (existing controllers, extended)
- Payment webhook (M-Pesa C2B confirm / gateway capture) → `fn_open_subscription_and_hold`.
- Data ingestion (session payloads) → insert `data_gate_payload` + `fn_release_split_on_data_gate` in one transaction.

## 4. Framework Integration
`origin_framework` on every subscription keeps NRHL, BIIF, and Independent revenue streams separable for accounting, sponsor reporting, and per-framework pricing experiments — without schema divergence. Bundle-invoiced passports (league/academy packages) enter through the same `fn_open_subscription_and_hold` path with `payment_channel = 'bundle_invoice'`, so the coach split behaves identically regardless of who paid.

## 5. Open Items Before Production
1. **Daraja B2C credentials & float account** — B2C requires a funded M-Pesa disbursement wallet and Safaricom Go-Live approval; sandbox first.
2. **Clawback policy** — `clawed_back`/`clawback` states exist in schema; the refund controller (athlete refund before data gate) still needs writing.
3. **RLS layer** — coach app must only read its own wallet/yield rows; mirror the RLS posture planned for the 001 passport tables.
4. **Reconciliation job** — implement the nightly ledger→balance re-derivation with alerting before real money flows.
5. **Tax treatment** — KES 150/passport/month royalties to coaches are income; withholding and KRA reporting obligations need a definitive position from an accountant before scale. I cannot confirm the correct treatment; do not guess it in production.
