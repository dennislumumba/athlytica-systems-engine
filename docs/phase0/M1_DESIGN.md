# M1 — Transactional Athlete Creation: Design

**Phase:** 0.4 · **Date:** 2026-08-13
**Status:** DESIGN ONLY. **NOT APPLIED. NOT FINAL — blocked on R4.**

M1 is written here so the decision boundary is visible. It must not be applied
until R4 is decided, because R4 determines the issuer's output format and the
issuer's output format is this function's contract.

---

## 1. The defect M1 fixes — VERIFIED

### Big Ice (`lib/services/bigice-onboarding.ts`)

```ts
const { data: next } = await db.rpc("bigice_next_athlete_code");   // ← round trip 1: COMMITS
biifCode = next.trim();
const { error: insertError } = await db.from("bigice_athlete").insert({...});  // ← round trip 2
if (insertError) { return { onboarded: false, reviewRequired: code === UNIQUE_VIOLATION, ... }; }
```

### NRHL (`app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts`)

```ts
await db.rpc("link_guardian", { p_phone_e164 });        // ← round trip 1: writes a parent
await db.rpc("nrhl_next_athlete_code");                 // ← round trip 2: COMMITS the increment
await db.from("nrhl_athlete").upsert({...});            // ← round trip 3
```

**Three round trips, no transaction.** Each PostgREST call is its own
autocommit transaction. `scalable_id_sequence` is a **row in a table**, updated
by `UPDATE ... SET current_value = current_value + 1`, so the increment commits
at the end of round trip 2 and is not rolled back by a failure in round trip 3.

**Proven in production:** sequence advanced 500 → 504 with **zero athlete rows
persisted**. Four identifiers burned. (R15, Phase 0.2 §2.)

**The failure is not theoretical.** `bigice_athlete` has a unique index on the
athlete name, and the code path *explicitly expects* it to fire
(`reviewRequired: code === UNIQUE_VIOLATION`). Every two-same-named-children
case burns a code by design.

## 2. Design

Two `SECURITY DEFINER` functions, one per venture, each performing mint and
insert in a single transaction:

```sql
create or replace function public.bigice_create_athlete(
  p_full_name        text,
  p_guardian_name    text,
  p_guardian_email   text,
  p_guardian_msisdn_hash text,
  p_origin           text,
  p_identity_note    text
) returns table (biif_code text, created boolean)
language plpgsql security definer set search_path to 'athlytica_core','public'
as $$
declare v_code text;
begin
  v_code := public.bigice_next_athlete_code();     -- same transaction
  insert into public.bigice_athlete (biif_code, full_name, guardian_name,
         guardian_email, guardian_msisdn_hash, origin, identity_note)
  values (v_code, p_full_name, p_guardian_name, p_guardian_email,
          p_guardian_msisdn_hash, p_origin, p_identity_note);
  return query select v_code, true;
end $$;

revoke all on function public.bigice_create_athlete(...) from public, anon, authenticated;
grant execute on function public.bigice_create_athlete(...) to service_role;
```

`nrhl_create_athlete(...)` mirrors this and additionally calls `link_guardian`
inside the same transaction, collapsing all three NRHL round trips into one.

**Callers change from three `db.rpc`/`db.from` calls to one `db.rpc`.** No
other application change. The existing `UNIQUE_VIOLATION` → `reviewRequired`
branch is preserved by mapping SQLSTATE `23505` to the same outcome.

**Authorization is unchanged.** Both callers already sit behind the M4
`payment_service_authorization` gate. M1 does not touch that gate, and must not
be described as authorizing anything: *a settlement is money truth, not
permission to create an athlete.*

## 3. The acceptance criterion, and the honest limit on it

The brief states:

> For every successful athlete creation: sequence advancement == number of
> committed athlete identities created.
> For failed creation: no permanent sequence advancement attributable to that
> failed creation.

**Both halves are achievable here, and it is worth being explicit about why**,
because for a native Postgres `SEQUENCE` the second half would be **impossible**.

| | `nextval()` on a real sequence | `UPDATE ... current_value + 1` on a row |
|---|---|---|
| Is the increment transactional? | **No.** Non-transactional by design, so concurrent sessions never block. | **Yes.** It is an ordinary row update. |
| Rolled back on failure? | **No.** Gaps are permanent and expected. | **Yes.** |
| Concurrency behaviour | lock-free | **row lock held to end of transaction** |

`scalable_id_sequence` is a **table row, not a sequence**. Therefore:

- **Transactional row creation: achievable.** ✅
- **Transactional sequence consumption: also achievable** — precisely because
  this is not a real sequence. ✅

**This distinction is the design's load-bearing fact, and it is also its
cost.** Wrapping mint and insert in one transaction means the `UPDATE` holds a
row lock on `scalable_id_sequence` id=1 until commit. Every concurrent athlete
creation across **both ventures** serialises on that single row for the
duration of the whole insert.

At current volume (0 athletes created in production, ever) this is free. It is
recorded here so it is a chosen trade, not a surprise:

```
-- ponytail: one row lock serialises all athlete creation across both ventures.
-- Fine at founder scale; if creation throughput ever matters, move to a real
-- SEQUENCE and accept permanent gaps instead (D-20 revisit).
```

**If R4 selects Option B** (non-sequential `ATH-YYYY-XXXXXX`), this trade-off
disappears entirely: a random identifier needs no shared counter, the lock goes
away, and "transactional sequence consumption" becomes vacuous because there is
no sequence to consume. **That is an additional argument for Option B that
belongs in the R4 decision.**

## 4. Test plan — REQUIRES ISOLATED ENVIRONMENT

Every case asserts the same invariant, measured before and after:

```
Δ scalable_id_sequence.current_value  ==  Δ count(athlete rows committed)
```

| # | Case | Expected |
|---|---|---|
| 1 | successful create, Big Ice | Δseq = 1, Δrows = 1 |
| 2 | successful create, NRHL | Δseq = 1, Δrows = 1 |
| 3 | validation failure (null name) | Δseq = **0**, Δrows = 0 |
| 4 | insert failure (FK / check violation) | Δseq = **0**, Δrows = 0 |
| 5 | duplicate conflict (unique name) | Δseq = **0**, Δrows = 0, SQLSTATE 23505 surfaced as `reviewRequired` |
| 6 | concurrent creates ×N | Δseq = N, Δrows = N, **no duplicate codes** |
| 7 | retry after failure | Δseq = 1 total, Δrows = 1 — the retry does not burn a second code |
| 8 | explicit rollback of the caller's transaction | Δseq = 0, Δrows = 0 |
| 9 | both callers interleaved | Δseq = total creates, no cross-venture code reuse |
| 10 | **regression: today's code burns a code on case 5** | proves the test can fail |

**Case 10 is not optional.** A test suite that passes against both the old and
the new implementation proves nothing. The mutation criterion for M1 is: revert
`bigice_create_athlete` to the two-round-trip form and **case 5 must fail**.

**Cases 6 and 9 cannot be run through the Supabase MCP connector** — it issues
one statement at a time and cannot hold two concurrent sessions. They require
an isolated Postgres with two connections.

### ACCEPTANCE GATE — M1

> M1 is **not** complete when the RPC exists and is `SECURITY DEFINER`. It is
> complete when cases 1–10 pass in an isolated environment, case 10 having been
> observed to fail against the current implementation.
>
> Blocked on: **R4** (issuer contract) and **Docker** (cases 6, 9).

## 5. Rollback

```sql
drop function if exists public.bigice_create_athlete(text,text,text,text,text,text);
drop function if exists public.nrhl_create_athlete(...);
```

The old issuers (`bigice_next_athlete_code`, `nrhl_next_athlete_code`) are
**not dropped by M1** — the new functions call them. Rollback is therefore a
pure removal, and the callers revert to the two/three-round-trip form in the
same commit. Written before apply, per the M2/M3/M4 discipline.

**Note:** if R4 Option B is adopted, the old issuers are retired as part of R4,
not M1, and this rollback changes shape. Another reason M1 waits on R4.

## 6. What M1 does NOT fix

Stated so it is not over-claimed:

- **It does not fix R4.** An atomic issuer pointed at 504 atomically issues a
  colliding identifier. M1 makes the collision *reliable*.
- **It does not fix R12.** `link_guardian`'s `ON CONFLICT ... RETURNING
  parent_id` phone-enumeration oracle is unchanged, and moving it inside a
  transaction does not close it.
- **It does not fix D-01a.** Different surface entirely.
- **It does not change authorization.** M4 remains the only gate.
- **It does not reclaim the 4 already-burned codes.** They stay burned; the
  sequence stays at 504 until R4 says otherwise.
