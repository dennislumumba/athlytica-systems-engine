# Phase 0.3 — Payment Integrity & Athlete ID Transaction Safety

**Status:** ANALYSIS + DESIGN. **Zero production mutations.**
**Date:** 2026-08-12 · **Commit:** `658936e`
**Scope:** D-20, D-23, D-22. §4 (local RLS) **stopped — Docker not installed.**

Every database statement executed this phase was a `SELECT`.

---

# 1. D-20 — Athlete ID issuance integrity

## 1.1 Call graph — every path that can consume the sequence

```
                    ┌─────────────────────────────────────────┐
                    │  athlytica_core.scalable_id_sequence     │
                    │  current_value = 504   (ONE counter)     │
                    └───────────────▲─────────────────────────┘
                                    │ update … +1 … returning
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
 bigice_next_athlete_code()  nrhl_next_athlete_code()  generate_scalable_athlete_code()
   → 'BIIF-YYYY-NNNN'          → 'ATH-NNNNN'             → 'ATH-NNNNN'
   SECURITY DEFINER            SECURITY DEFINER          BEFORE INSERT trigger
        │                           │                           │
        │                           │                    athlytica_core.athletes
        │                           │                    (0 rows — never fired)
        │                  ┌────────┴────────┐
        │                  │                 │
        │        onboard-paid-athlete   leagues/nrhl/ingest
        │            route.ts:144          route.ts:146
        │                  │                 │
        │             nrhl_athlete       nrhl_athlete
        │             (upsert)           (insert)
        │
  onboardBigIceAthlete()  lib/services/bigice-onboarding.ts:190
        │
        ├── ENTRY 1: POST /api/v1/biz/mpesa-callback      (route.ts:356)
        └── ENTRY 2: POST /api/v1/biz/retry-onboarding    (route.ts:40)
                  │
             bigice_athlete (insert)
```

**Five consumers, one shared counter.** Entry points that can reach it:

| # | Entry point | Trigger | Issuer | Target |
|---|---|---|---|---|
| 1 | `POST /api/v1/biz/mpesa-callback` | Safaricom callback, `outcome = SETTLED` | `bigice_next_athlete_code` | `bigice_athlete` |
| 2 | `POST /api/v1/biz/retry-onboarding` | admin retry | `bigice_next_athlete_code` | `bigice_athlete` |
| 3 | `POST /api/v1/workspaces/nrhl/onboard-paid-athlete` | authed staff | `nrhl_next_athlete_code` | `nrhl_athlete` |
| 4 | `POST /api/v1/leagues/nrhl/ingest` | authed ingest | `nrhl_next_athlete_code` | `nrhl_athlete` |
| 5 | `INSERT INTO athlytica_core.athletes` | BEFORE INSERT trigger | `generate_scalable_athlete_code` | itself |

Path 5 is the **only atomic one** — the trigger fires inside the insert's own
transaction, so a rolled-back insert rolls back the increment. It is also the
only one never used (0 rows).

## 1.2 Is creation atomic? **No.** Verbatim evidence.

`lib/services/bigice-onboarding.ts`:

```ts
190:  const { data: next, error: seqError } = await db.rpc("bigice_next_athlete_code");
      //  ── HTTP round-trip #1 → autocommit → SEQUENCE PERMANENTLY CONSUMED
197:  biifCode = next.trim();
200:  const { error: insertError } = await db.from("bigice_athlete").insert({ … });
      //  ── HTTP round-trip #2 → a DIFFERENT transaction
210:  if (insertError) {
215:    return { onboarded: false, reviewRequired: code === UNIQUE_VIOLATION, … };
      //  ── returns with the code already spent and unrecoverable
```

`app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts` has the same shape at
`:144` (mint) → `:155` (upsert), and additionally calls `link_guardian()` at
`:136` — **before** the athlete exists — swallowing its error. That is a second
orphan class: a `athlytica_core.parents` row with no athlete.

**There is no transaction spanning mint and insert anywhere except path 5.**
Supabase JS issues one HTTP request per call; each is its own transaction. This
cannot be fixed from the application side.

## 1.3 Why 4 codes were burned with 0 athletes

The insert-failure branch is not an edge case — it is a **designed-for** path:

> *"The unique index caught a duplicate the matcher did not — two same-named
> children with no household hash to separate them. Deliberately fails closed
> rather than merging their records."* — `bigice-onboarding.ts:211-213`

Failing closed is correct. Burning an identifier while doing so is not. And
because `retry-onboarding` re-enters the same function, **every retry after a
failed insert burns another code**: no athlete row exists, so `matchAthlete`
returns no match, so it mints again. Four retries, four codes, zero athletes.

## 1.4 What is already correct — do not regress it

| Behaviour | Location | Verdict |
|---|---|---|
| Identity resolution before mint | `bigice-onboarding.ts:157-170` | **correct** — `loadCandidates` by `name_key` **and** `guardian_msisdn_hash`, then `matchAthlete` |
| `MATCH` reuses the existing code, mints nothing | `:175-188` | **correct** — the D-20 invariant already holds for existing athletes |
| Enrich blanks only, never overwrite a known contact | `:180-186` | **correct** — *"would let the most recent payer silently take over an existing athlete's household record"* |
| `REVIEW` verdict mints nothing | `:171-173` | **correct** |
| Returning-family status asked of enrollment history, not of `minted` | `:233-241` | **correct** — survives the retry case |

**The policy is right. Only the transaction boundary is missing.**

## 1.5 Contrast: the NRHL path resolves identity on name alone

`onboard-paid-athlete:122-126` resolves by
`select athlete_code from nrhl_athlete where display_name = name`.

Combined with `nrhl_athlete_display_name_key UNIQUE (display_name)` (DQ-029),
two children with the same display name **cannot both exist** — the second
silently adopts the first's identity via `upsert onConflict: display_name`.

Against a legacy roster containing `Eli Das` / `Eli Araka`, `Leon Sila` /
`Leroy Sila`, and 101 single-word names, that is the R10 name-matching hazard
made structural. **The Big Ice matcher is materially safer than the NRHL one.**

## 1.6 Proposed correction (design only — NOT implemented)

Smallest safe change: **one `SECURITY DEFINER` function that resolves, inserts
and mints in a single transaction.** The mint moves *inside* the insert.

```sql
-- DESIGN. Not applied. Requires D-20 approval.
create or replace function public.bigice_claim_athlete_code(
  p_name_key      text,
  p_full_name     text,
  p_guardian_hash text,
  p_guardian_email text,
  p_guardian_name text,
  p_receipt       text
) returns table (biif_code text, minted boolean)
language plpgsql volatile security definer
set search_path to 'athlytica_core','public','pg_temp'
as $$
declare v_code text; v_existing text;
begin
  -- one transaction from here to the end
  select ba.biif_code into v_existing
    from public.bigice_athlete ba
   where ba.name_key = p_name_key
     and (ba.guardian_msisdn_hash is not distinct from p_guardian_hash
          or ba.guardian_msisdn_hash is null)
   limit 1;

  if v_existing is not null then
    return query select v_existing, false;      -- existing athlete: NO mint
    return;
  end if;

  update athlytica_core.scalable_id_sequence
     set current_value = current_value + 1
   where id = 1
  returning 'BIIF-'||to_char(now(),'YYYY')||'-'||lpad(current_value::text,4,'0')
    into v_code;

  insert into public.bigice_athlete
    (biif_code, full_name, guardian_name, guardian_email,
     guardian_msisdn_hash, origin, identity_note)
  values
    (v_code, p_full_name, p_guardian_name, p_guardian_email,
     p_guardian_hash, 'REGISTRATION',
     'Minted on settlement of receipt '||p_receipt);
  -- a unique violation here rolls the sequence back with the insert

  return query select v_code, true;
end $$;

revoke all on function public.bigice_claim_athlete_code(text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.bigice_claim_athlete_code(text,text,text,text,text,text)
  to service_role;
```

The application then calls **one** RPC instead of two, and the
`UNIQUE_VIOLATION` branch still fails closed — it just no longer costs an
identifier.

### Deliberately NOT in this design

- **No ID recycling.** `ATH-000500`–`ATH-000504` and every other issued code stay
  burned. `ROLLBACK_PLAN.md` §6 already specifies the `athlytica_id_burned`
  ledger. Sequence gaps are meaningless because the ID is opaque.
- **No change to the matcher.** `matchAthlete`'s REVIEW/MATCH/NEW verdicts stay
  exactly as they are; the SQL above deliberately keeps only the *narrow*
  resolution and still expects the application matcher to run first. Moving
  fuzzy matching into SQL would be a redesign, not a containment fix.
- **No NRHL change yet.** Fixing `onboard-paid-athlete` requires deciding the
  `display_name` uniqueness question (DQ-029) first, which is D-06 territory.

## 1.7 D-20 test matrix — current predicted behaviour

Prediction from code reading. **None of these has been executed** — all require
the isolated environment that does not exist.

| # | Scenario | Current behaviour | Post-fix expected |
|---|---|---|---|
| 1 | New registration | mints + inserts, non-atomically | mints + inserts atomically |
| 2 | Duplicate registration | `stk-push` reuses the open row; no second athlete | unchanged |
| 3 | Browser retry | reuses open registration (`stk-push:271`) | unchanged |
| 4 | Payment callback retry | `DUPLICATE` from settlement; onboarding not re-entered | unchanged |
| 5 | Onboarding retry after **successful** insert | `MATCH` → no mint | unchanged |
| 6 | **Failure AFTER athlete creation** (e.g. document delivery) | athlete exists; retry matches; **no burn** | unchanged |
| 7 | **Failure BEFORE athlete creation** (insert fails) | **CODE BURNED; every retry burns another** | **rollback, no burn** |
| 8 | Existing athlete registers again | `MATCH` → reuses code | unchanged |

**Row 7 is the whole defect.** Rows 1–6 and 8 already satisfy the invariant.

**Invariant status:** `ONE REAL ATHLETE = ONE UID = ONE PERMANENT ID` holds
today for every path *except* the failure-before-creation path, which produces
**zero** athletes and **N** consumed identifiers — the inverse failure. It never
produces two IDs for one athlete.

---

# 2. D-23 — G-W6-PAY payment reconciliation

## 2.1 What creates the gate row

**Exactly one writer**, inside `settle_payment_transaction`:

```sql
insert into public.gate_states (gate_id, live, live_at, evidence)
values ('G-W6-PAY', true, p_tx_ts, p_receipt)
on conflict (gate_id) do nothing;
```

No application code writes `gate_states`. Verified across `app/`, `lib/` and all
32 migrations.

## 2.2 Two gate mechanisms exist; only one touches the database

`config/nrhl-gates.ts:188-191` documents `settlePaymentGate()` as:

> *"The ONLY sanctioned way to flip G-W6-PAY live: a schema-valid settlement
> event… callers must not catch-and-force."*

In `mpesa-callback/route.ts`, its return value `gateState` is used **once**, at
`:310`, as a webhook payload. **It never writes to the database.** The persisted
row comes from the SQL function, which does no schema validation of its own.

So the documented "gate law" validator and the actual gate persistence are
**two independent mechanisms**. The TS validator gates whether the callback is
*processed*; the SQL insert decides what is *recorded*. They agree today only
because both sit on the same request path.

## 2.3 Why the row is synthetic, and whether it resembles a real transaction

`MpesaSettlementEventSchema` accepts `mpesaReceiptNumber: string, min 8, max 20`.

| Receipt | Length | Passes validator? |
|---|---|---|
| `AUDITTEST001` | 12 | **yes** |
| `SGX7HQ2LM9` | 10 | **yes** |

**The validator cannot distinguish test from production**, and neither can any
column in `payment_events`. `AUDITTEST001` is a schema-valid settlement event in
every respect except being real. No rule was bypassed — the gate flipped exactly
as designed, on an event that was not a payment.

Owner confirmed 2026-08-12: `SGX7HQ2LM9` is absent from the Safaricom
statement. **All five payment events are synthetic.**

## 2.4 Can a later legitimate callback repair the row? **No.**

`on conflict (gate_id) do nothing` means the **first** settlement of any kind
wins permanently. When a genuine first payment arrives, `gate_states.evidence`
will still read `AUDITTEST001`, and `live_at` will still read
`2026-08-11 22:20:23`.

**What `DO NOTHING` currently protects:** it makes settlement idempotent with
respect to the gate — a second real payment does not rewrite when the gate went
live. That is semantically defensible for a "gate went live at T" record. The
flaw is that it is provenance-blind: it protects the *first* event rather than
the first *production* event.

`gate_states` has only `gate_states_touch BEFORE UPDATE` (`trg_touch_updated_at`)
— **no immutability trigger**, unlike `payment_events`. The row is therefore
correctable by `UPDATE`.

## 2.5 Blast radius — what depends on this gate

| Consumer | Effect |
|---|---|
| `NRHL_GATE_LEDGER["G-W6-PAY"]` | **root of the critical path**, `dependsOn: null` |
| `G-W5-REG` (registration funnel + sponsor outreach) | `dependsOn: "G-W6-PAY"` |
| `assertDraftEngineUnblocked()` | **hard block** on every draft-engine entry point; throws while blocked |
| `cash-watcher`, `marketing/cro` routes | read `NRHL_GATE_LEDGER["G-W6-PAY"]` |

Its KPI — *"First validated M-Pesa settlement event (resultCode 0 + receipt)
logged"* — is recorded as met and **has never occurred**.

## 2.6 Can a synthetic reference collide with a real one?

`account_reference` is `ATH-` + 4 chars from a 31-symbol alphabet
(`generateAthReference`, `stk-push:84-91`) → 923,521 combinations. Collision is
improbable but not impossible, and `registrations.account_reference` is `UNIQUE`,
so a collision surfaces as a `23505` on registration creation and is handled by
the existing 3-try loop. **Not a live risk.**

`mpesa_receipt_number` is the true idempotency key and is `UNIQUE`. A synthetic
receipt permanently occupies that value — `AUDITTEST001` can never be reused by
a real transaction, which is harmless.

## 2.7 The reconciliation gap: case C is silently swallowed

Current behaviour, verbatim:

```sql
insert into public.payment_events (…) values (…)
on conflict (mpesa_receipt_number) do nothing
returning id into v_ledger_id;

if v_ledger_id is null then
  return jsonb_build_object('outcome','DUPLICATE','receipt',p_receipt);
end if;
```

**The incoming amount, msisdn and reference are never compared to the stored
row.** A replay of receipt `X` with a *different amount* returns `DUPLICATE`
— identical to an exact duplicate. The discrepancy is invisible.

| Case | Definition | Current | Correct |
|---|---|---|---|
| **A** | exact duplicate callback | `DUPLICATE`, no-op | ✅ acceptable |
| **B** | same receipt, identical data | `DUPLICATE`, no-op | ✅ acceptable |
| **C** | **same receipt, conflicting data** | **`DUPLICATE` — silently ignored** | ❌ **must raise an exception state** |
| **D** | test / audit event | no mechanism; settles as production | ❌ must be classified |
| **E** | legitimate new payment | settles | ✅ correct |

## 2.8 Proposed state machine (design only — NOT implemented)

```
callback
  │
  ├─ receipt NOT in payment_events ──────────────► [E] SETTLE
  │                                                 └─ classification := PRODUCTION (default)
  │                                                 └─ gate: flip only if classification = PRODUCTION
  │
  └─ receipt ALREADY in payment_events
        │
        ├─ amount, msisdn_hash, account_reference, tx_ts ALL equal
        │      └──────────────────────────────────► [A/B] DUPLICATE — idempotent no-op
        │
        └─ ANY field differs
               └───────────────────────────────────► [C] SETTLEMENT_CONFLICT
                                                       └─ append to payment_reconciliation_exception
                                                       └─ return 202, never 200
                                                       └─ never mutate the original event
```

Case C handling, in words: **do not write, do not ignore, record and escalate.**
`payment_events` stays append-only and the original row is never touched; the
conflict is recorded in a separate exception table for a human.

```sql
-- DESIGN. Not applied.
create table if not exists public.payment_reconciliation_exception (
  exception_id   uuid primary key default gen_random_uuid(),
  mpesa_receipt_number text not null,
  kind           text not null check (kind in
                   ('CONFLICTING_REPLAY','UNMATCHED_SETTLEMENT','AMOUNT_MISMATCH')),
  stored         jsonb not null,     -- the existing payment_events row
  incoming       jsonb not null,     -- what the callback carried
  differing_fields text[] not null,
  detected_at    timestamptz not null default now(),
  resolved_at    timestamptz,
  resolved_by    text,
  resolution_note text
);
```

`UNMATCHED_SETTLEMENT` also gives the five existing `SETTLED_UNMATCHED` outcomes
a home — currently they return a status string and are recorded nowhere.

---

# 3. D-22 — test / production classification

## 3.1 Constraint

`payment_events` is append-only by trigger (`UPDATE` and `DELETE` both raise), so
classification **cannot** be a column backfill on existing rows. It must be
additive and external.

## 3.2 Minimum viable design

One table, one default, one predicate. No new columns on any existing table.

```sql
-- DESIGN. Not applied.
create table if not exists public.record_classification (
  record_table   text not null,
  record_id      text not null,           -- receipt / uuid / code
  classification text not null check (classification in
                   ('PRODUCTION','TEST','AUDIT','DEMO')),
  reason         text not null,
  classified_by  text not null,
  classified_at  timestamptz not null default now(),
  primary key (record_table, record_id)
);
```

**Default is PRODUCTION by absence.** A row means "this is *not* real". That
fails safe: a forgotten classification over-counts revenue rather than hiding a
real payment. The inverse default would let an unclassified real payment vanish.

Every revenue / count / dashboard read gains one predicate:

```sql
where not exists (
  select 1 from public.record_classification c
   where c.record_table = 'payment_events'
     and c.record_id    = pe.mpesa_receipt_number
     and c.classification <> 'PRODUCTION')
```

## 3.3 Classifying the five existing rows — safest reversible method

| Receipt | Proposed | Basis |
|---|---|---|
| `AUDITTEST001` | `TEST` | self-describing; frozen shared `transaction_timestamp` |
| `AUDITTEST002` | `TEST` | same |
| `AUDITTEST003` | `TEST` | same |
| `AUDITTEST004` | `TEST` | same |
| `SGX7HQ2LM9` | `TEST` | **owner confirmed absent from the Safaricom statement, 2026-08-12** |

This is **insert-only into a new table**. `payment_events` is not touched, so
immutability is preserved and the action is reversible by deleting the
classification rows.

## 3.4 Forward control

Classification of existing rows is remediation. The durable fix is that
synthetic settlements never reach production at all:

```sql
-- inside settle_payment_transaction, DESIGN only
if p_receipt ~ '^(AUDITTEST|TEST|DEMO)' and current_setting('app.environment', true)
   is distinct from 'development' then
  raise exception 'settle_payment_transaction: reserved test receipt % rejected in %',
    p_receipt, coalesce(current_setting('app.environment', true), 'unknown');
end if;
```

Reserved-prefix rejection would have stopped `AUDITTEST001-004`. It would **not**
have stopped `SGX7HQ2LM9`, which was deliberately shaped to look real — which is
exactly why the classification table is the primary control and the prefix guard
is only a convenience.

## 3.5 Relationship to D-23

`gate_states` should flip on the first **PRODUCTION-classified** settlement, not
the first settlement. That makes D-22 a prerequisite for D-23's repair, so the
two must land together:

```sql
-- DESIGN. Replaces the current unconditional insert.
insert into public.gate_states (gate_id, live, live_at, evidence)
select 'G-W6-PAY', true, p_tx_ts, p_receipt
 where not exists (select 1 from public.record_classification c
                    where c.record_table='payment_events'
                      and c.record_id=p_receipt
                      and c.classification <> 'PRODUCTION')
on conflict (gate_id) do nothing;
```

---

# 4. Local RLS validation — **STOPPED**

`docker --version` → `command not found`. Docker Desktop is not installed.

Per §4 of the phase brief, this subsection is stopped.

- `npx supabase start` **not run**
- `FORCE ROW LEVEL SECURITY` vs `SECURITY DEFINER` **not tested**
- guardian access, organization isolation, service-role behaviour, portal reads,
  registration writes, document access — **not tested**
- **No production RLS change made.**

**No claim is made that any of these pass.** The critical question — *does
FORCE RLS interfere with legitimate SECURITY DEFINER functions?* — remains
**UNANSWERED**.

---

# 5. Test matrix — status

`node --test "tests/**/*.test.mts"` was **not re-run** this phase; no source
changed. Last result (Phase 0.2): **142 pass / 0 fail**.

### ATHLETE ID

| Test | Status |
|---|---|
| new athlete receives one ID | ⚪ not executed — needs isolated env |
| existing athlete receives no new ID | 🟢 **code-verified** — `MATCH` branch mints nothing (`bigice-onboarding.ts:175-188`) |
| duplicate request does not create another athlete | 🟢 code-verified — `stk-push:271`, unique index + raced-row reuse |
| retry does not consume unnecessary IDs | 🔴 **FAILS** — retry after failed insert burns another code (§1.3) |
| failed transaction does not create orphan athlete | 🟡 no orphan *athlete*; **orphan identifiers instead** (4 burned) |
| burned IDs are never reused | 🟢 **holds** — sequence is monotonic; no recycling path exists |

### PAYMENTS

| Test | Status |
|---|---|
| duplicate callback is idempotent | 🟢 code-verified — `on conflict … do nothing` → `DUPLICATE` |
| conflicting callback is not silently ignored | 🔴 **FAILS** — case C is indistinguishable from A/B (§2.7) |
| synthetic payment cannot create production enrollment | 🔴 **FAILS** — no classification exists; all 5 synthetic events settled as production and flipped the gate |
| real payment can settle | ⚪ **never observed** — production has never processed a real payment |
| payment cannot create duplicate enrollment | 🟢 code-verified — `bigice_enrollment` upsert; settlement creates no athlete |

### SECURITY

| Test | Status |
|---|---|
| unrelated guardian cannot access athlete | ⚪ not executed — needs isolated env (R4/R5) |
| wildcard characters cannot bypass authorization | 🟢 **4 unit tests pass** (`tests/guardian-scope.test.mts`) |
| organization boundary remains enforced | 🟡 partially — `venture_context` CHECK + Big Ice onboarding refuses non-Big-Ice registrations; per-row RLS isolation untestable until the canonical tables exist |

**Legend:** 🟢 verified · 🟡 partial · 🔴 known failing · ⚪ not executed

---

# 6. Production changes

**NONE.**

| | |
|---|---|
| CHANGE | none |
| WHY | every correction here is a design requiring D-20 / D-22 / D-23 approval |
| FILES | 1 new document; no source, schema or data touched |
| DATABASE IMPACT | none — all statements `SELECT` |
| USER IMPACT | none |
| ROLLBACK | n/a |

Three mutations are **designed and staged but deliberately not executed**:

1. `bigice_claim_athlete_code()` — atomic mint+insert (D-20)
2. `record_classification` table + 5 classification rows (D-22)
3. `gate_states` repair + `payment_reconciliation_exception` (D-23)

Each is reported in §7 in the required CHANGE / WHY / RISK / ROLLBACK / IMPACT
form. **None is applied. Approval is not assumed.**

---

# 7. Proposed mutations — awaiting explicit approval

## M1 — atomic athlete-code claim (D-20)

| | |
|---|---|
| **CHANGE** | Add `public.bigice_claim_athlete_code()`; change `bigice-onboarding.ts` to call it instead of `rpc(bigice_next_athlete_code)` + separate insert |
| **WHY** | Mint and insert are separate transactions; a failed insert burns a permanent identifier. Demonstrated: sequence 500→504, `bigice_athlete` 0 rows |
| **RISK** | Low. New function; old one left in place. The failure semantics (`UNIQUE_VIOLATION` → fail closed, review required) are preserved exactly |
| **ROLLBACK** | Revert the one call site; drop the function. No data written by the change itself |
| **USER IMPACT** | None visible. A family whose onboarding previously failed will retry without consuming additional identifiers |
| **BLAST RADIUS** | Big Ice onboarding only. NRHL paths unchanged (they need D-06 first) |
| **TEST REQUIRED FIRST** | Isolated environment — scenarios 1, 5, 7 from §1.7 |

## M2 — record classification (D-22)

| | |
|---|---|
| **CHANGE** | Create `public.record_classification`; insert 5 rows classifying all existing `payment_events` as `TEST` |
| **WHY** | 658,000 KES of synthetic settlements are currently indistinguishable from revenue |
| **RISK** | Very low. New table; insert-only; `payment_events` untouched and still immutable |
| **ROLLBACK** | `delete from record_classification where record_table='payment_events'`; drop table |
| **USER IMPACT** | None — no dashboard currently reads it. Consumers must adopt the predicate before it has effect |
| **BLAST RADIUS** | Additive only |
| **TEST REQUIRED FIRST** | None for the table itself; consumers need updating before it changes any number |

## M3 — gate repair + reconciliation exceptions (D-23)

| | |
|---|---|
| **CHANGE** | (a) `update gate_states set live=false, evidence=null where gate_id='G-W6-PAY'`; (b) create `payment_reconciliation_exception`; (c) revise `settle_payment_transaction` to detect case C and to flip the gate only on a PRODUCTION-classified receipt |
| **WHY** | The NRHL critical path is unblocked on a synthetic receipt, and a conflicting replay is silently swallowed |
| **RISK** | **Medium — the only medium-risk item here.** Setting `live=false` re-blocks `assertDraftEngineUnblocked()`. If any draft/roster tooling is currently running against that gate, it will start throwing `GateBlockedError`. That is *correct* behaviour, but it is a behaviour change |
| **ROLLBACK** | `update gate_states set live=true, live_at='2026-08-11 22:20:23+00', evidence='AUDITTEST001'` — the prior values are recorded here; `gate_states` has no immutability trigger, so this is reversible |
| **USER IMPACT** | None customer-facing. Internal: draft tooling correctly reports the payment gate as not yet met |
| **BLAST RADIUS** | `gate_states` (1 row) + settlement function |
| **TEST REQUIRED FIRST** | M3(c) changes `settle_payment_transaction`, which is on the live payment path. **Must be tested on an isolated environment before production** |

**Recommended order: M2 → M3 → M1.** M2 is a prerequisite for M3(c) and is the
lowest risk. M1 needs an isolated environment and is not urgent while
`bigice_athlete` remains empty.

---

# 8. Decision status after this phase

| ID | Status | Change |
|---|---|---|
| **D-20** | **ANALYSED — correction designed, not implemented** | Root cause proven verbatim; call graph complete; M1 staged |
| **D-22** | **DESIGNED — awaiting approval** | Minimum schema identified; all 5 rows classifiable; M2 staged |
| **D-23** | **ANALYSED — repair designed, not implemented** | Gate mechanism fully traced; case-C gap found; M3 staged |
| **D-01 / OPS-1** | **BLOCKED — Docker not installed** | §4 stopped as instructed |
| D-06 | unchanged | NRHL name-matching must resolve before its issuer is fixed |
