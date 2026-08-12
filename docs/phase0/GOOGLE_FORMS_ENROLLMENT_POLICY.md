> ## ⛔ SUPERSEDED IN PART BY PHASE 0.3H — THE CHANNEL IS RETIRED
>
> The owner confirmed Google Forms is no longer used, closing **D-26c**.
> `/api/v1/onboarding/google-forms` was retired on 2026-08-12 and now
> answers `410 CHANNEL_RETIRED`, creating nothing.
>
> **Google Forms is not a supported athlete onboarding channel.**
>
> §5's `enrollment_basis` design was **not implemented** — its only
> identified use case was this channel, and the channel is gone. §6's
> "recommended future flow" describes a future that will not happen.
> Everything else — the seven-record investigation (§0–§4), the payment
> boundary (§7), the portal analysis (§8) and the disposition (§9) — still
> stands and is the record of why retirement was the right answer.
>
> Retirement detail: §13 below.

# Phase 0.3G — Google Forms Enrollment Policy (D-26)

**Date:** 2026-08-12 · **Follows:** 0.3F (`BUILD_AND_CREATION_BOUNDARY_AUDIT.md`)
**Production changes:** **none.** No migration, no data write, no schema change.
**Application suite:** 178/178 · **Mutations:** 15/15 caught

---

## 0. The finding that changes the question

0.3F recorded seven `cohort_session_registry` rows as *"unpaid enrollments
against a priced commercial tier"* and rated F-7 MEDIUM, pending an owner
decision about whether Google Forms is a paid channel.

Investigating the rows first, as instructed, produced a different answer:

| Evidence | Value |
|---|---|
| Submissions | 7 |
| Distinct athlete rows | 7 |
| **Distinct athlete names** | **1** |
| `submission_id` prefixed `test-` | **7 / 7** |
| `legal_name` containing "test" | **7 / 7** |
| Distinct cohort labels | 1 — **"Test Cohort A"** |
| Time span | **68 minutes**, 2026-07-09 20:00 → 21:08 UTC |
| Guardian e-mail present | **0 / 7** |
| Corresponding payments | **0** |
| Registrations | **0** |
| Portal bridges (`passport_athlete_id`) | **0** |
| Documents issued | **0** |

**These are not seven unpaid customers. They are one fake athlete submitted
seven times during a single developer session.** Every discriminator agrees,
and they agree in the record's own self-description — the submission ids
literally begin `test-`.

Consequently: **the Google Forms path has never processed a real
submission.** There is no production usage, and therefore no business
behaviour to infer from the data.

---

## 1. What Google Forms currently does

`POST /api/v1/onboarding/google-forms` → `onboard_athlete_from_google_form`:

```
HMAC-SHA256 over the raw body        ← verified before parsing or any DB work
   ↓
provenance                            data_source='self_reported',
   ↓                                  verification_status='unverified'
athlete                               gen_random_uuid() — NOT the ATH- sequence
   ↓
cohort_session_registry               enrollment_status='enrolled'
   ↓                                  price_tier_id → commercial_price_tier
google_form_submission_log            idempotency key
```

Idempotent on `form_response_id`; a redelivered webhook returns the original
result. Only `service_role` may execute the RPC, and the route holds the
service key behind the HMAC wall.

**Correction to 0.3F.** I described the price tier as *"the table Big Ice
charges from"*. That is true of the **table** but not the **rows**: Google
Forms used `tier_group = 'intake_funnel'` (Baseline Track, KES 7,500). The
`academy` group — the four tiers Big Ice actually sells on bigice.co.ke,
16,500–350,000 — has **never** been referenced by this path. The overlap was
narrower than stated.

---

## 2. What the seven records represent

**Synthetic test submissions.** Not paid, not unpaid-but-real, not
complimentary, not sponsored, not historical import. Test.

The brief's own distinction is the operative one:

> TEST means synthetic/non-production financial activity.
> UNPAID means a legitimate athlete/registration with no payment.

These are the first kind. There is no family, no guardian contact, no
child — one repeated fake name across a 68-minute window.

---

## 3. Paid / unpaid / administrative?

**None of the above — they are test records**, so they carry no signal about
what the Google Forms channel is *for*.

The policy question therefore cannot be answered from production data. It is
answered by the owner's decision recorded in this phase's brief:

> **Google Forms is UNPAID / ADMINISTRATIVE REGISTRATION** unless the
> existing records and workflow prove otherwise.

The records prove nothing either way. **The stated default stands
unopposed**, and that is the basis for everything below.

Classification per 0.3F's taxonomy moves from
**G — UNCERTAIN** to **A — TRUSTED ADMINISTRATIVE CREATION**.

---

## 4. The current semantic defect

F-7 is **real as an architecture defect and void as a data defect.**

| | Verdict |
|---|---|
| Can this path create an enrollment carrying a price with no payment? | **Yes.** Real. |
| Has it ever done so for a real customer? | **No.** Zero real submissions. |
| Is any live customer record in a wrong state? | **No.** |
| Could a future real submission be misread as paid? | **Yes** — that is the defect worth fixing. |

The precise defect: `cohort_session_registry` records **that** an athlete is
enrolled and **what the programme costs**, but nothing about **why they are
enrolled** or **whether anyone paid**. A future consumer joining
`enrollment_status='enrolled'` to `price_amount` would produce a revenue
figure out of thin air.

It has not happened. Every current consumer treats the column as roster
membership, correctly:

| Consumer | Uses `enrollment_status` as |
|---|---|
| `portal/route.ts:104` | schedule filter, inside guardian-owned scope |
| `dashboard:248` | ops counts |
| `BigIceDashboard.tsx` | ops display |
| `command-metrics.ts:1093` | metrics denominator |

**Downgrade F-7: MEDIUM → LOW.** Latent, not live.

---

## 5. Recommended domain model — one column, not five

`cohort_enrollment_status_enum` is `{enrolled, waitlisted, cancelled,
completed}` — a roster vocabulary with no payment concept in it. **That is
correct and should not change.** `enrolled` is not a lie.

Mapping the five requested concepts onto what already exists:

| Concept | Already represented by | Needs new schema? |
|---|---|---|
| **registration_status** | `registrations.payment_status` (payment funnel) | no |
| **enrollment_status** | `cohort_session_registry.enrollment_status` | no |
| **payment_status** | `payment_events` + `registrations.payment_status` | no |
| **entitlement_status** | `payment_service_authorization()` — M4, derived not stored | no |
| **enrollment_basis** | **nothing** | **yes — this is the only gap** |

**Recommendation: one nullable column, `cohort_session_registry.enrollment_basis`.**

Minimum vocabulary the real business actually evidences — not the full
eight from the brief, because five of them have no instance anywhere:

| Value | Justified by |
|---|---|
| `PAID` | the M4-authorized Big Ice path |
| `ADMINISTRATIVE` | the D-26 decision for Google Forms |
| `IMPORT` | `nrhl/ingest`, the legacy corpus |
| `UNKNOWN` | rows predating the column |

`COMPLIMENTARY`, `SPONSORED`, `SCHOLARSHIP` and `TRIAL` are **deliberately
omitted**. Not one exists in the data, and the brief warns against
implementing the list blindly. Widening an enum later is a one-line
migration; removing a value that code has begun to branch on is not.

### Why this is NOT built in this phase

Every condition for building it is absent:

- **No production data needs it.** The only rows are test rows.
- **No real workflow exists** to model — the path has zero real usage.
- Building a column, an enum and a backfill for a path that has never
  served a customer is speculative, and the brief forbids new migrations
  until the semantics are deterministic in *practice*.

The design is recorded so it can be applied the day Google Forms takes a
real submission. **That is the trigger, and it should be treated as a
blocker on that day, not before.**

---

## 6. Recommended future Google Forms flow

```
Google Forms submission
   ↓  HMAC (unchanged)
provenance + athlete                          identity — always allowed
   ↓
cohort_session_registry                       roster membership
   enrollment_status = 'enrolled'             ← unchanged; a roster fact
   enrollment_basis  = 'ADMINISTRATIVE'       ← new, explicit, non-null
   ↓
                            ✗ no bigice_enrollment
                            ✗ no bigice_document
                            ✗ no payment_events
                            ✗ no portal entitlement
                            ✗ no revenue
   ↓
if money later arrives for this athlete, it arrives through /register →
callback → M4, and the PAID artefacts are created there — independently.
```

The rule: **a Google Forms submission may create identity and roster
membership, and nothing that represents money.** Paid entitlement is
created only where payment is proved, which is the M4 boundary and nowhere
else.

`price_tier_id` should stay on the row: it records which programme the
athlete joined, which is a scheduling fact. With `enrollment_basis`
present it can no longer be mistaken for a charge.

---

## 7. Payment boundary — unchanged and unchallenged

All four statements hold, and 0.3E's tests already prove them:

| Statement | Enforced by |
|---|---|
| A priced package does not prove payment | no path derives payment from `commercial_price_tier` |
| An enrollment does not prove payment | `cohort_session_registry` writes nothing to the money plane |
| A Google Forms submission does not prove payment | this phase's guards |
| An M-Pesa receipt string does not prove payment | M4 `NO_PAYMENT_EVENT` (0.3E test 14) |

Only `payment_service_authorization()` establishes payment-authorized
service entitlement. Google Forms does not call it, and **must not** — it
has no payment to authorize, and calling it would imply one.

---

## 8. Portal and document implications

**No change, and none needed.** Verified against production:

```
gform athletes bridged to bigice_athlete : 0
documents issued to them                 : 0
payments matching a submission id        : 0
registrations naming them                : 0
```

The portal's cohort query is reachable only via `passportIds` — the
`passport_athlete_id` values of `bigice_athlete` rows already resolved from
the authenticated guardian's e-mail. Google Forms creates no
`bigice_athlete` row and captures no guardian e-mail, so `passportIds` is
empty and the query is skipped entirely.

**Structural, not incidental:** entitlement flows from guardian ownership of
a payment-authorized athlete, and `enrollment_status` filters *within* that
scope. It never grants it. Guarded and mutation-tested.

An administratively enrolled athlete therefore gets identity and a roster
place, and no paid entitlement — which is exactly the D-26 policy.

---

## 9. Seven-record disposition

**Recommendation: RECLASSIFY as TEST. Do not alter the rows themselves.**

Historical truth is preserved: the rows keep `enrollment_status='enrolled'`.
They *were* enrolled — by a developer, in a test. Rewriting them to pretend
otherwise would be the error the brief warns against.

`record_classification` is the right instrument, and this is its first
non-payment consumer — closing the gap F-6 identified. It annotates
externally and mutates nothing, exactly as M2 did for `payment_events`.

**This is NOT a payment classification.** It classifies
`cohort_session_registry` and `athlete` records. No `payment_events` row is
touched; the count stays at 5.

### Verified, not applied

The statement below was executed inside `BEGIN … ROLLBACK` against
production and then rolled back:

| Check | Result |
|---|---|
| cohort rows classified | **7** |
| athlete rows classified | **7** |
| over-reach beyond `test-%` submissions | **0** |
| `payment_events` classifications | **5 — untouched** |
| `cohort_session_registry` rows modified | **0** |
| `athlete` rows modified | **0** |
| still `enrolled` afterwards | **7 — history preserved** |

Post-rollback production state re-verified: 5 classifications, 0
non-payment, 7 cohort rows, 13 athlete rows, sequence 504, 34 migrations.

```sql
-- Phase 0.3G — classify the seven synthetic Google Forms submissions.
-- ADDITIVE ONLY. Verified 2026-08-12 in a rolled-back transaction.
insert into public.record_classification
  (record_table, record_id, classification, reason, classified_by)
select 'cohort_session_registry', csr.registry_id::text, 'TEST',
       'Synthetic Google Forms submission. submission_id prefixed "test-", '
       'athlete legal_name contains "test", cohort_label "Test Cohort A". '
       'All 7 submissions share one athlete name and landed in a 68-minute '
       'window on 2026-07-09. No payment, no registration, no portal bridge, '
       'no documents.',
       'phase-0.3G (D-26)'
  from public.cohort_session_registry csr
  join public.google_form_submission_log gfl on gfl.registry_id = csr.registry_id
 where gfl.submission_id like 'test-%'
on conflict (record_table, record_id) do nothing;

insert into public.record_classification
  (record_table, record_id, classification, reason, classified_by)
select 'athlete', a.athlete_id::text, 'TEST',
       'Synthetic athlete created by a test Google Forms submission '
       '(see the matching cohort_session_registry classification).',
       'phase-0.3G (D-26)'
  from public.athlete a
  join public.google_form_submission_log gfl on gfl.athlete_id = a.athlete_id
 where gfl.submission_id like 'test-%'
on conflict (record_table, record_id) do nothing;
```

**Not applied.** The evidence is deterministic and I would defend applying
it — but the brief says *"do not change the seven production records
automatically"*, and an audit-shaped phase is the wrong place to write to
production unilaterally on my own judgement. It is one reviewed command,
and it is reversible by deleting two sets of rows.

> **Note on the remaining 6 `public.athlete` rows.** 13 athletes exist; 7 are
> these. The other 6 are the TTA football demo seed
> (`tta_international_football_academy_demo.sql`) and are **out of scope** —
> a different seeding path, not Google Forms. They are also arguably
> classifiable as DEMO, and that should be its own decision rather than
> being swept in here.

---

## 10. Test plan — delivered

| # | Brief requirement | Test | Status |
|---|---|---|---|
| 1 | submission does not imply payment | `cannot record a payment` | ✅ |
| 2 | cannot create paid entitlement without authorized payment | `cannot create paid entitlement` | ✅ |
| 3 | administrative enrollment remains possible | `administrative enrollment remains possible` | ✅ |
| 4 | complimentary/sponsored possible if supported | **n/a — not supported, deliberately (§5)** | — |
| 5 | paid registration requires independent authorization | 0.3E boundary guards + M4 tests 9–14 | ✅ |
| 6 | TEST payment cannot satisfy authorization | 0.3E DB tests 15–17, 23–25 | ✅ |
| 7 | UNPAID is not classified as TEST | `never marked as a TEST payment` | ✅ |
| 8 | portal follows entitlement, not enrollment_status | `portal schedule access follows guardian ownership` | ✅ |
| 9 | documents follow entitlement, not price tier | `documents are issued by the paid delivery path only` | ✅ |
| 10 | existing gform athletes remain accessible | `remain reachable by the ops surfaces` | ✅ |

**178/178 application tests.** Item 4 is answered by not building an
unevidenced vocabulary; a test asserting a capability that deliberately
does not exist would be a meaningless test.

### Mutation coverage — 15/15

Four new, all on the Google-Forms-to-entitlement boundary:

| # | Mutation | Caught by |
|---|---|---|
| 12 | gform writes `bigice_enrollment` | `cannot create paid entitlement` |
| 13 | gform classifies its own registration as a payment | `never marked as a TEST payment` |
| 14 | portal cohort query unscoped from the guardian | `portal schedule access follows guardian ownership` |
| 15 | gform writes `payment_events` | `cannot record a payment` |

---

## 11. Production changes

**None.** No migration, no schema change, no data write.

| | |
|---|---|
| Migrations applied | 34 — unchanged, M4 still latest |
| `record_classification` | 5 — unchanged |
| `cohort_session_registry` | 7 — unchanged, all still `enrolled` |
| `athlete` | 13 — unchanged |
| `payment_events` | 5 — unchanged |
| Sequence | 504 — unchanged |

---

## 12. Owner decisions required

| | Decision | Cost |
|---|---|---|
| **D-26a** | Apply the §9 classification? Verified, additive, reversible. | one command |
| **D-26b** | Classify the 6 TTA demo athletes as DEMO? Separate seeding path. | one command |
| **D-26c** | Is the Google Forms channel **still in use**? It has never taken a real submission and the intake funnel now runs through `/register`. If it is dead, retiring it removes a door entirely — strictly better than guarding one. | judgement |
| **D-25** | (carried) reconcile the second M-Pesa client with the `DARAJA_*` rail | judgement |

**D-26c is the interesting one.** Every finding in this phase is about a
path with no users. The cheapest resolution to a door nobody walks through
is to close it.

---

# 13. Phase 0.3H — Retirement (D-26c CLOSED)

**Date:** 2026-08-12 · **Production changes: none.** No migration, no schema
change, no data write.

## 13.1 What was retired

`app/api/v1/onboarding/google-forms/route.ts` — replaced with a
deterministic `410 CHANNEL_RETIRED`. It now builds **no database client**,
reads **no request body**, and calls **no RPC**. There is nothing to
authenticate because there are no side effects.

410 rather than 404, and rather than deleting the file: the Apps Script
trigger still runs in the owner's Google account and will keep POSTing. A
404 reads like a deploy fault; a 410 says the channel is permanently gone
and names `/register` as its replacement.

## 13.2 Proof there were no legitimate callers

| Question | Evidence |
|---|---|
| Any other function/view/trigger referencing it? | **No** — only `onboard_athlete_from_google_form` itself |
| FKs into `google_form_submission_log`? | **0** |
| Scheduled jobs? | **No** — `pg_cron` not installed |
| Database webhooks? | **No** — `pg_net` not installed |
| RPC reachable by a client role? | **No** — `anon`/`authenticated` denied; `service_role` only |
| Frontend references? | **0** |
| Real submissions ever? | **0** — all 7 synthetic |
| In-repo callers | `scripts/test-form-ingestion.js` (removed) and the external Apps Script |

## 13.3 What was deliberately NOT removed

| Kept | Why |
|---|---|
| `GOOGLE_FORMS_WEBHOOK_SECRET` | **Shared with `app/api/v1/sync/convex/route.ts`.** Despite the name it is not Google-Forms-exclusive; removing it as "dead config" would have sealed the live Convex bridge. A guard test now pins this so the next person to tidy up finds out in CI. |
| `public.onboard_athlete_from_google_form` | Orphaned but preserved. It and the log table are the only way to read and explain the seven historical rows. Dropping them would delete audit capability, which Part G forbids. `service_role`-only, now caller-less; a guard asserts no source file calls it. |
| `public.google_form_submission_log`, `cohort_session_registry`, `provenance`, `athlete` rows | Historical evidence. Nothing deleted. |
| `apps-script/onboarding_google_form_webhook.gs` | The record of what is deployed in the owner's Google account — needed in order to disable it (**D-27**). |
| `provenance` infrastructure | Generic, not Google-Forms-specific. |

## 13.4 Removed

| File | Why |
|---|---|
| `scripts/test-form-ingestion.js` | Drove the retired endpoint exclusively. Would now just POST into a 410. |
| `tests/google-forms-enrollment-policy.test.mts` | Guarded the live path's boundaries. Superseded by `tests/google-forms-retired.test.mts`, which asserts the absence of the capability rather than its limits. |

## 13.5 Creation doors after retirement

| Door | Type | Trusted? | Payment required? | Creates identity? | M1 caller? |
|---|---|---|---|---|---|
| `mpesa-callback` → Big Ice onboarding | paid | callback secret / ops token | **yes — M4** | yes (BIIF) | **yes** |
| `retry-onboarding` → Big Ice onboarding | paid recovery | ops token | **yes — M4** | yes (BIIF) | **yes** |
| `onboard-paid-athlete` | paid | HMAC | **yes — M4** | yes (`ATH-`) | **yes** |
| `nrhl/ingest` | trusted import | founder / head coach | **no, by design** | yes (`ATH-`) | **yes** |
| `athlytica_core` trigger | unused | unreachable (no schema USAGE) | n/a | n/a | no |
| ~~`google-forms`~~ | **retired** | — | — | **no** | **no** |

**Four live doors, down from five.** Three are payment-authorized; one is a
grant-gated import that must keep working without payment. No new door was
created, and no public or untrusted surface can mint a permanent identity.

## 13.6 `enrollment_basis` — not implemented, and now unlikely to be

§5 designed one column to record *why* an athlete is enrolled. Its only
identified use case was distinguishing an unpaid Google Forms enrollment
from a paid one. **That channel no longer exists**, so the column has no
caller and is not being built.

It should be revisited only if a genuine non-paid enrollment channel
appears — an administrator enrolling a scholarship athlete, say. Until
then, `cohort_session_registry` holds seven synthetic rows and takes no
new writes from any live path.

## 13.7 Verification

| Check | Result |
|---|---|
| Application tests | 178 → **178 pass / 0 fail** |
| Mutation tests | 15 → **21 / 21 caught** (6 new, all on retirement guards) |
| Typecheck | **clean** |
| `next build` | **✓ Compiled successfully**; `/api/v1/onboarding/google-forms` still resolves |
| Database rows | unchanged: 7 log, 7 cohort, 13 athlete, 12 provenance, 5 classifications, 5 ledger |
| Sequence | **504 — unmoved** |
| Migrations | **34 — unchanged** |
| RPC preserved | yes |
