# Phase 0.3F — Build Integrity + Non-Payment Athlete-Creation Boundary

**Date:** 2026-08-12 · **Follows:** 0.3D (path audit) and 0.3E (payment authorization boundary)
**Production migrations:** none. M4 remains the latest (`20260812172530`).
**Application suite:** 171/171 · **Typecheck:** clean · **Mutations:** 11/11 caught

---

## 1. Build integrity

`npx tsc --noEmit` now exits clean. It did not at the start of this phase:
`app/api/v1/performance/route.ts` produced ten parser errors and was the
only failing file. That file is repaired (§2) and the build is green.

| Check | Result |
|---|---|
| TypeScript | **clean**, 0 errors |
| Application tests | **171 / 171** |
| Mutation tests | **11 / 11 caught** (6 from 0.3E, 5 new) |
| Database state | unchanged — no migration, no data write |
| Untracked build artefacts | none (`.next/`, `*.bak`, logs all absent from status) |
| Unrelated source modifications | none |
| M1 | not started; sequence still 504 |

---

## 2. `performance/route.ts` repair

### What changed

One line was replaced and 93 inserted. The deletion:

```
-  }).catchall(z.any()),
```

The replacement re-added that line with `// ...existing code...` appended,
then inserted a complete M-Pesa STK-push implementation —
`normalizeKenyanPhone`, `getMpesaToken`, `timestampYYMMDDhhmmss`,
`sendStkPush` — **inside the `universalTaxonomyEngineSchema` Zod object
literal**, before its closing `});`. `export function` inside an object
literal is a syntax error, which is why the file stopped parsing.

### Attribution: unambiguous

| Evidence | Finding |
|---|---|
| `git log` for the file | last commit `3dad364`, long before this session. The corruption is working-tree only. |
| The `// ...existing code...` marker | an unresolved patch placeholder, left in the source |
| Insertion point | inside an object literal — no author familiar with the file would place an `export function` there |
| Subject matter | payment rail code, in a **performance-metrics validation schema** |
| 0.3E report | recorded this file as concurrently modified and left it untouched |

### Why the inserted code was discarded rather than relocated

It is not salvageable content that landed in the wrong file. It is a
duplicate, inferior re-implementation of infrastructure this repo already
has, and adopting it anywhere would be a regression:

| Problem | Detail |
|---|---|
| **Invented env namespace** | uses `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_ENV`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_CALLBACK_URL`. **None exist.** `.env.example` provisions `DARAJA_*`; the only `MPESA_*` key is `MPESA_CALLBACK_SECRET`. |
| **Duplicates `utils/mpesaDaraja.ts`** | token fetch, timestamp, password, STK dispatch — all already implemented there, with a 10s timeout and a fail-soft result type this version lacks (it throws). |
| **Duplicates `utils/msisdn.ts`** | `normalizeKenyanPhone` re-implements `normalizeKenyanMsisdn`, which is the documented single implementation ("opsGuard law: never fork per-route copies"). |
| **Violates a documented invariant** | `sendStkPush({ amount })` pushes a caller-supplied amount straight to Daraja. CLAUDE.md: *"Money is never client-priced."* `stk-push` re-derives every charge server-side and rejects a mismatched client amount. |
| **Dead** | zero references anywhere in `app/`, `lib/`, `utils/`, `config/`, `tests/`. |

### The repair

`git checkout -- app/api/v1/performance/route.ts`. Deterministic: the
corruption was the file's only working-tree change, so reverting restores
the last valid version exactly and introduces nothing.

**Deterministic: yes.** No business logic was inferred or invented.

The removed block is preserved as a patch in the session scratchpad
(`performance-route-corruption.patch`) so nothing is lost if the author
wants it — but it should be rewritten against `utils/mpesaDaraja.ts`
rather than restored, and it must not be given a client-supplied amount.

> **Owner decision (D-25):** if someone is building a second M-Pesa
> integration, it needs to be reconciled with the existing `DARAJA_*` rail
> before any of it lands. Two STK clients with two env namespaces against
> one Paybill is how a payment stops arriving.

---

## 3. Non-payment athlete-creation matrix

Three doors create athlete records without a payment check.

| | 1. `nrhl/ingest` | 2. `onboarding/google-forms` | 3. `athlytica_core` trigger |
|---|---|---|---|
| **1. Who can invoke** | NRHL `GLOBAL_FOUNDER` / `HEAD_COACH` | holder of `GOOGLE_FORMS_WEBHOOK_SECRET` | nothing — see below |
| **2. Exposure** | authenticated + grant-checked | machine-to-machine, HMAC | internal trigger |
| **3. AuthZ mechanism** | `requireWorkspaceRole()` — bearer → actor → grant; 401/403; 503 if unprovisioned | HMAC-SHA256 over raw body, timing-safe, **before** parsing or DB work; unset secret ⇒ 500 | none needed; unreachable |
| **4. Creates** | `nrhl_scrimmage`, `nrhl_athlete`, metrics, certificate tiers | `provenance`, `athlete` (passport plane), `cohort_session_registry`, `google_form_submission_log` | would stamp a code on `athlytica_core.athletes` |
| **5. New athlete?** | **yes** | **yes** (passport plane) | yes, in principle |
| **6. Issues `ATH-XXXXXX`?** | **YES** — `nrhl_next_athlete_code` | **no** — `gen_random_uuid()`; never touches the sequence | yes, in principle |
| **7. Guardian/user?** | no | no | no |
| **8. Org membership?** | NRHL roster row | none — no `venture_context` anywhere on this path | no |
| **9. Portal access?** | **no** — portal reads `bigice_athlete` | **no** — see §6 | no |
| **10. Paid entitlement?** | **no** | **`enrollment_status = 'enrolled'` against a `commercial_price_tier`** — see F-7 | no |
| **11. Bypass venture isolation?** | no — writes NRHL tables only | n/a — it has no venture | no |
| **12. Can a parent invoke it?** | **no** | **no** | **no** |
| **13. Intended use** | legacy corpus backfill (10 scrimmages, 31 athletes) | Google Forms intake → cohort scheduling | superseded identity plane |
| **Classification** | **B — TRUSTED DATA IMPORT** | **G — UNCERTAIN, REQUIRES OWNER DECISION** | **E — UNUSED / DEPRECATED** |

### Why the trigger is E and not F

`athlytica_core.generate_scalable_athlete_code` carries `EXECUTE` for
`anon` and `authenticated`, which looks alarming and is not:

```
role            schema USAGE   seq SELECT   seq UPDATE   athletes INSERT
anon            false          false        false        false
authenticated   false          false        false        false
service_role    false          false        false        false
```

**No client role holds USAGE on `athlytica_core`** — not even
`service_role`. Without schema USAGE, an `EXECUTE` grant on a function
inside it is unreachable. The function is also `SECURITY INVOKER`, so even
if reached it would run with the caller's (nonexistent) privileges on the
sequence.

This is precisely the shape of R2: a privilege the advisor and
`has_function_privilege` both report as present, and which no client can
actually use. It is a **latent grant**, not an exposure. It should be
revoked as defence-in-depth during the RLS phase — not now, because
touching `athlytica_core` grants is exactly what D-01 is for.

---

## 4. Athlete ID issuance matrix

Only `athlytica_core.scalable_id_sequence` issues a permanent public
identifier. Three SQL functions read it; three application sites call them.

| Path | Creates athlete? | Issues ID? | Authorization | Venture | Intended use |
|---|---|---|---|---|---|
| `mpesa-callback` → `onboardBigIceAthlete` | yes | **yes** — `bigice_next_athlete_code` (BIIF) | callback secret **+ `payment_service_authorization`** | BIG_ICE | paid onboarding |
| `retry-onboarding` → `onboardBigIceAthlete` | yes | **yes** — BIIF | ops token **+ `payment_service_authorization`** | BIG_ICE | recovery of a failed paid onboarding |
| `onboard-paid-athlete` | yes | **yes** — `nrhl_next_athlete_code` (`ATH-`) | HMAC **+ `payment_service_authorization`** | NRHL | paid onboarding |
| `nrhl/ingest` | yes | **yes** — `ATH-` | founder / head coach | NRHL | **legacy import — no payment by design** |
| `google-forms` | yes (passport) | **no** | HMAC | none | form intake |
| `athlytica_core` trigger | — | unreachable | none | none | unused |
| `normalize-legacy-ids.js` | — | mints `ATH-YYYY-NNNN` | script, not deployed | — | **frozen — D-05** |

**M1's legitimate callers are therefore exactly three application sites
across two RPCs.** Three of the four issuing paths are payment-authorized;
the fourth (`nrhl/ingest`) is an administrator-gated import that must
remain able to create an athlete without payment.

Two constraints M1 must respect, both already documented:

- **R4** — the sequence is at 504 and legacy codes run `ATH-500`–`ATH-638`.
  `nrhl/ingest` is the path most likely to collide, because it is the one
  that loads that corpus.
- **D-05** — `normalize-legacy-ids.js` must stay frozen; the adapter still
  points operators at it.

---

## 5. Identity vs membership vs enrollment vs entitlement vs portal

The system does distinguish these, but across **five planes rather than
one model**, and the distinction is carried by table separation rather
than by an explicit column anywhere.

| Concept | Where it lives today | Payment required? |
|---|---|---|
| **Identity** | `bigice_athlete`, `nrhl_athlete`, `public.athlete`, `athlytica_core.athletes` | **no** |
| **Organization membership** | implied by *which table the row is in* + `athlete_tenant_links` | **no** |
| **Program enrollment** | `bigice_enrollment` (paid), `cohort_session_registry` (form intake) | **mixed — F-7** |
| **Payment entitlement** | `registrations.payment_status` + `payment_events` + M4 authorization | **yes** |
| **Portal access** | `bigice_athlete.guardian_email` → `resolveGuardian()` | **indirectly** |

**"Athlete exists" does not mean "athlete has paid".** This is correct and
must stay correct: legacy athletes, imported competition athletes,
scrimmage participants and administratively registered athletes are all
legitimate un-paid identities. `nrhl/ingest` depends on it.

**"Athlete has paid" does not mean "athlete belongs to every venture".**
Enforced in three independent places since M4: the settlement matcher
refuses to cross ventures, the authorization rule takes an explicit
venture, and `onboardBigIceAthlete` self-selects on `venture_context`.

**The gap, flagged for the architecture phase, not fixed here:** membership
is *implicit in table identity*. There is no `organization_membership`
row. One human who skates at Big Ice and plays in NRHL today gets **two
identity rows in two tables with two different code formats** (`BIIF…`
and `ATH-…`) and nothing links them. `ORGANIZATION_MEMBERSHIP_SPEC.md` and
`CANONICAL_ATHLETE_ARCHITECTURE.md` already design the fix; neither is
built.

---

## 6. Big Ice / NRHL boundary findings

| Requirement | Status | Mechanism |
|---|---|---|
| Big Ice enrollment cannot become NRHL enrollment | **holds** | matcher + rule + `venture_context !== "BIG_ICE"` early return; guard test |
| NRHL enrollment cannot become Big Ice enrollment | **holds** | NRHL doors write only `nrhl_*`; guard test |
| Payment authorization is venture-specific | **holds** | `payment_service_authorization(receipt, venture, …)`; `VENTURE_MISMATCH` |
| Documents are venture-specific | **holds** | `bigice_document` keyed on `biif_code`; NRHL packs are e-mail only |
| Portal entitlements are venture-specific | **holds** | portal reads `bigice_athlete` only |
| Pricing records are venture-specific | **holds** | `commercial_price_tier` is Big Ice academy; `REGISTRATION_TIERS` carries `venture` |
| **One person = one ID + multiple memberships** | **DOES NOT HOLD** | one identity row **per venture**, per §5 |

The last row is the discrepancy Part E asks to flag. It is **not** fixed
here — it is the identity-model work, and the brief says flag it. Two
consequences worth recording now:

1. A dual-venture child has two identifiers and no link between them, so
   any longitudinal view spanning both ventures is impossible today.
2. `bigice_athlete.passport_athlete_id` is the only existing bridge
   between a venture plane and the passport plane. It is the natural
   attachment point for a real membership model, and it is currently the
   thing standing between `cohort_session_registry` and the portal (§7).

---

## 7. Security findings

### F-7 — unpaid enrollment against a commercial price tier · **MEDIUM** · owner decision

`onboard_athlete_from_google_form` writes:

```sql
INSERT INTO cohort_session_registry (…, price_tier_id, enrollment_status)
VALUES (…, v_tier_id, 'enrolled');
```

It resolves a row from `commercial_price_tier` (the table Big Ice actually
charges from), records its `price_amount` and `currency`, and marks the
enrollment **`'enrolled'` — with no payment anywhere in the path.**

**Production already holds 7 such rows.** All 7 `cohort_session_registry`
rows are `enrolled`, all 7 have a `google_form_submission_log` entry, and
none corresponds to a payment. They are the "7 Test Athlete duplicates"
recorded in the project state.

**Why this is MEDIUM and not CRITICAL — the containment, verified:**

- It cannot reach the portal. `/api/v1/portal` queries
  `cohort_session_registry` only for `passportAthleteId` values taken from
  `bigice_athlete` rows **already owned by the authenticated guardian's
  e-mail**. The Google Forms path creates no `bigice_athlete` row and no
  guardian e-mail, so `passportIds` is empty and the query never runs.
- It cannot produce documents — `bigice_document` is written only by
  `deliverBigIcePack`, on the payment-authorized path.
- It cannot produce revenue — it never writes `payment_events`.
- It cannot issue a public `ATH-` code (§4).
- It is HMAC-gated; no customer can invoke it.

**What it does violate** is Part F's rule as stated: a non-payment path
must not create paid package entitlement. `enrollment_status='enrolled'`
against a priced commercial tier is, semantically, exactly that — even
though nothing currently reads it as one.

**This is an owner decision, not a bug to fix unilaterally (D-26):** is the
Google Forms channel a *paid* intake (in which case it needs the M4
boundary, and the enrollment should start `pending_payment`) or an
*unpaid* administrative/waitlist intake (in which case the status value is
wrong and should say so)? I have not guessed. Nothing was changed.

### F-8 — latent `anon`/`authenticated` EXECUTE on the core ID generator · **LOW**

Covered in §3. Unreachable today; revoke during the RLS phase.

### F-6 (carried from 0.3D) — classification vocabulary stops at `payment_events` · **MEDIUM**

`record_classification.record_table` is designed to classify any record;
only `payment_events` rows exist. Athletes, enrollments and registrations
remain unclassifiable, so the 7 unpaid cohort rows and the 13 passport
athletes cannot be marked TEST. Matters more now that F-7 names concrete
rows that ought to carry a marker.

### No path creates a permanent athlete identity from an untrusted public request

Checked against every externally reachable athlete-creating route:

| Route | Reachable by an untrusted caller? |
|---|---|
| `mpesa-callback` (+ `[secret]`) | no — callback secret or ops token, **and** M4 authorization |
| `retry-onboarding` | no — ops token, **and** M4 authorization |
| `onboard-paid-athlete` | no — HMAC, **and** M4 authorization |
| `nrhl/ingest` | no — NRHL founder/head-coach grant |
| `google-forms` | no — HMAC, verified before any parsing or DB work |
| `athlytica_core` trigger | no — unreachable at the schema level |

**Every externally reachable athlete-creation path is either
payment-authorized or a properly trusted administrative/import path.** No
route mints a permanent identity from an anonymous request.

That claim is scoped exactly to identity creation and the authorization
model of each door. It is **not** a claim that athlete creation is
"secure" in general: F-7 remains open, membership is not modelled (§6),
and ID issuance is still non-atomic (D-20/M1).

---

## 8. Tests

| Suite | Result |
|---|---|
| Application total | **171 / 171** (164 + 7 new) |
| `athlete-creation-boundary.test.mts` | 7 / 7 new |
| `payment-authorization-boundary.test.mts` | 8 / 8 |
| `payment-authorization-rule.test.mts` | 7 / 7 |
| `payment-revenue-source.test.mts` | 4 / 4 |
| Database (M4, 0.3E, rolled-back transaction) | 29 / 29 — re-verified in place, not re-run |
| Typecheck | clean |

### Mutation coverage — every externally reachable creation route

| # | Mutation | Caught by |
|---|---|---|
| 1 | retry-onboarding branch neutered to `if (false)` | retry guard |
| 2 | callback side effect back to outcome-only gating | callback guard |
| 3 | `reconciliationRequired` loses the authorization verdict | callback honesty guard |
| 4 | response stops reporting `serviceAuthorization` | same |
| 5 | NRHL mints before verifying payment | NRHL guard |
| 6 | fail-closed removed from the rule | rule unit test |
| **7** | **ingest gate result ignored** (`return gate.denied` deleted) | ingest guard |
| **8** | **ingest role widened to include `ATHLETE`** | ingest guard |
| **9** | **google-forms HMAC check disabled** | gforms guard |
| **10** | **google-forms unset secret falls open** | gforms guard |
| **11** | **a non-payment door writes `bigice_enrollment`** | paid-artefact guard |

**11 / 11 caught.** Mutations 7–10 cover the two doors that had no guard
before this phase.

---

## 9. Production state

**Unchanged by this phase. No migration, no data write.**

| | |
|---|---|
| `payment_events` | 5 (all TEST) |
| `record_classification` | 5 |
| `payment_reconciliation_exception` | 0 |
| `registrations` | 2 (one household, BIG_ICE + NRHL) |
| `bigice_athlete` + `nrhl_athlete` | 0 |
| `public.athlete` (passport) | 13 |
| `cohort_session_registry` | 7 — all `enrolled`, all unpaid (F-7) |
| `scalable_id_sequence` | **504** |
| `G-W6-PAY` | `false / null` |
| Applied migrations | 34 |
| `SGX7HQ2LM9` authorization | `NOT_AUTHORIZED` |

---

## 10. Commit

`0.3D + 0.3E + 0.3F` committed as one foundation commit: **`67b2cef`**. The concurrent `performance/route.ts`
corruption was **reverted, not committed**, and no other concurrent work
was bundled.

---

## 11. M1 readiness

**Design ready. Execution still blocked, and the blocker is unchanged.**

0.3F delivers M1's missing precondition: a closed, enumerated set of
legitimate callers (§4) — three application sites over two RPCs, of which
three paths are payment-authorized and one is an administrator-gated
import that must keep working without payment.

Still required before M1 can be called done:

- **Docker.** Acceptance is "the sequence moved by exactly the number of
  athletes that committed", which no rolled-back transaction can prove.
- **R4 collision decision.** The sequence is at 504 inside the legacy
  `ATH-500`–`ATH-638` block. M1 makes issuance atomic; it does not make it
  non-colliding. Doing M1 first is still correct — a burned code and a
  colliding code are separate defects — but R4 must not be forgotten
  because M1 closed.

---

## 12. Remaining blockers

| | Blocker | Owner action |
|---|---|---|
| 1 | **D-26 — is Google Forms a paid or unpaid intake?** (F-7) | decide; it changes whether `cohort_session_registry` needs the M4 boundary |
| 2 | **D-25 — a second M-Pesa integration is being written somewhere** | reconcile with `DARAJA_*` before any of it lands |
| 3 | M1 — Docker for acceptance | install |
| 4 | R4 — sequence 504 collides with legacy `ATH-500`–`ATH-638` | decide |
| 5 | Identity model — one person, two venture rows, no link (§6) | architecture phase |
| 6 | D-04 — no authoritative legacy source | export the 16 tabs |
| 7 | F-6 — classification stops at `payment_events` | extend when F-7 resolves |
| 8 | D-16 — migration ledger drift (3 of 35 aligned) | ongoing |
| 9 | RLS untested; F-8 latent grant | RLS phase |

---

## 13. Recommended next action

**Answer D-26: is the Google Forms channel paid or unpaid?**

It is the only finding in this phase that is a live semantic error in
production data — 7 rows currently assert `enrolled` against a priced
commercial tier with no money behind them. Every other open item is either
already contained, already designed, or waiting on Docker.

It is also cheap to resolve and it unblocks two others: the answer decides
whether `cohort_session_registry` needs the M4 boundary (F-7) and gives
`record_classification` its first non-payment consumer (F-6).
