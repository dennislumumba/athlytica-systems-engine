# Phase 0.3L — Foundation Consolidation Report

**Date:** 2026-08-13 (evidence captured 2026-08-12 23:30–2026-08-13 00:20 UTC)
**Scope:** reconcile documentation against live state. No schema change, no
migration, no RLS, no payment change, no CRM change, no feature work.

Labels used throughout: **VERIFIED** (read from the live database, the Vercel
API, or an HTTP response in this phase) · **UNVERIFIED** · **BLOCKED** ·
**OWNER DECISION** · **DEFERRED**.

Everything in §1–§9 was read live. Where documentation disagreed with the
database, the database won and the disagreement is recorded.

---

## 1. Current verified architecture

### 1.1 Deployment — VERIFIED

| | |
|---|---|
| `HEAD` = `origin/main` | `0c21b3b87f3f97af911df45a62dc29ffdf90b4cc` |
| Production deployment | `dpl_9H2ZZawMZRQaoEbk2URRHUFdQLjQ` |
| Source / branch / sha | `git` · `main` · `0c21b3b` — matches `HEAD` exactly |
| Build | READY |
| Production alias | `athlytica-systems-engine.vercel.app` |
| `pnpm verify:production` | **6/6 chain checks pass, 7/7 HTTP probes pass** |

Phase 0.3K holds. The invariant *git main → Vercel Git deployment → production
→ expected commit → alias → probes* is intact and re-derivable on demand.

### 1.2 Database — VERIFIED

Supabase `qxfrypvevjsyzkquewxh`. **68 base tables** (64 `public`, 4
`athlytica_core`) + 4 views. **36 migrations applied.**

### 1.3 Reachability — VERIFIED, and this is the finding that matters most

| Schema | `anon` | `authenticated` | `service_role` |
|---|---|---|---|
| `athlytica_core` | **no USAGE** | **no USAGE** | **no USAGE** |
| `public` | USAGE | USAGE | USAGE |

`athlytica_core` is unreachable by every client role — R2's downgrade is
**confirmed correct**. But `public` is a different surface, and the project
state document has never described it:

- `authenticated` holds **`SELECT, INSERT, UPDATE, DELETE, TRUNCATE,
  REFERENCES, TRIGGER`** on **44 `public` tables** and **3 views**, including
  `athlete`, `athletes`, `guardian_contact`, `registrations`, `users`,
  `user_profiles`, `workspace_roles`, `biometric_record`, `injury_record`,
  `custody_record`, `metric_value`, `performance_logs`.
- `anon` holds **no table grants at all**.

Deny-by-default therefore rests entirely on RLS policies for signed-in users.
See §6.

---

## 2. CRM status

### 2.1 The three states, kept separate — VERIFIED

> **This section changed during the phase.** It was written against an
> uncommitted working tree. At **2026-08-13 00:29 UTC**, while this report was
> being drafted, the CRM author committed the entire module as **`307bacb`
> — "chore(migrations): snapshot before supabase pull"**, 23 files, **5,197
> insertions**. The finding below is preserved because the *shape* of the risk
> did not go away — it moved one link down the chain.

| State | Answer |
|---|---|
| **SOURCE-COMMITTED** | ✅ **YES** — `307bacb`, all 23 files |
| **PUSHED** | ❌ **NO** — `main` is **ahead of `origin/main` by 1**. It exists on one laptop. |
| **DEPLOYED** | ❌ **NO.** Production runs `0c21b3b`; no build contains any CRM code. |
| **PRODUCTION-VERIFIED** | schema **YES**, application **NO** |

**This is the 0.3K lesson recurring one link earlier.** A commit is not a push,
a push is not a deploy. The CRM has advanced from "in no repository" to "in one
repository, on one machine" — better, and still not durable. `git push origin
main` completes it, and `pnpm verify:production` will then prove it.

**The database remains ahead of the deployed application.** Two CRM migrations
are applied to production; the application code that reads them is in `main`
but not in any build:

| Path | Lines |
|---|---|
| `app/api/v1/crm/route.ts` | 540 |
| `app/(app)/dashboard/crm/{page,layout,contacts,pipeline,reports,tasks}` | 2,076 |
| `lib/services/crm-metrics.ts` | 550 |
| `components/workspace/crm.tsx` | 370 |
| `config/crm.ts` | 211 |
| `lib/validation/crm-schemas.ts` | 212 |
| `tests/crm-{metrics,permissions}.test.mts` | 586 |
| `supabase/migrations/2026081222{1912,2626}_*.sql` + rollback | 500 |

Plus 6 modified tracked files (`config/workspaces.ts`,
`app/api/v1/workspace/dashboard/route.ts`, `components/workspace/{AppShell,
WorkspaceProvider}.tsx`, `lib/auth/landing.ts`, `docs/ATHLYTICA_PROJECT_STATE.md`).

**Nothing in this phase staged, committed or reverted any of it.** The CRM
author committed it themselves.

### 2.1a ⚠ `supabase pull` — read this before running it

`307bacb`'s message states its purpose: *"snapshot before supabase pull"*. The
snapshot was the right instinct. **The pull is the dangerous part, and D-16 is
exactly why.**

`supabase db pull` compares the remote `supabase_migrations.schema_migrations`
table against local filenames. **30 of 37 local files carry a different version
string than the migration that actually applied them** (§7). The CLI will
therefore report a migration-history mismatch and direct you to
`supabase migration repair --status applied <version>`.

**`supabase migration repair` writes to the remote migration history table.**
That table is currently the only accurate record of what has been applied to
this database, and §7's recommendation is to freeze it as authoritative.
Repairing it to match a local directory that disagrees with it in 30 places
would overwrite the accurate record with the inaccurate one.

`supabase db pull` itself does **not** alter the remote schema, and
`supabase db push` remains prohibited (R5). The specific hazard is the *repair*
step the pull will recommend.

**Recommendation: do not run `supabase migration repair` against this project
until D-16 has a decision.** If a local schema baseline is wanted now, dump the
remote schema to a file (`supabase db dump --schema public,athlytica_core`) —
it reads and writes nothing on the remote history.

**Risk before the commit, preserved for the record:** one `rm -rf`, one
`git clean -fd`, one disk failure and a production schema would have lost the
only code that understood it. It was the same class of fault as D-28 — a truth
that exists in one place and is believed to exist in another.

### 2.2 What is verified about the CRM itself

| Item | Status | Evidence |
|---|---|---|
| `crm_core` migration | **VERIFIED APPLIED** | version `20260812221912`, 6 tables: `crm_activity`, `crm_contact`, `crm_opportunity`, `crm_opportunity_event`, `crm_organization`, `crm_task` |
| `SALES_OPS` role | **VERIFIED APPLIED** | `20260812222626_crm_sales_ops_role` widened the `workspace_roles` CHECK; `SALES_OPS` present in `config/workspaces.ts:87` |
| CRM API | **VERIFIED IN SOURCE, NOT DEPLOYED** | `app/api/v1/crm/route.ts`, gated by `requireWorkspaceRole(request, "athlytica_hq", CRM_ROLES)`; `CRM_ROLES = ["GLOBAL_FOUNDER","SALES_OPS"]` |
| CRM UI | **VERIFIED IN SOURCE, NOT DEPLOYED** | 6 pages under `app/(app)/dashboard/crm/` |
| CRM metrics | **VERIFIED IN SOURCE, NOT DEPLOYED** | `lib/services/crm-metrics.ts` — "booked ≠ collected" is the file's stated law |
| CRM permissions | **VERIFIED IN SOURCE** | deliberately **not** served by `/api/v1/workspace/dashboard`, because that payload is all-or-nothing to any grant holder — this correctly honours the CLAUDE.md security invariant |
| **RLS on `crm_*`** | **VERIFIED: enabled, 0 policies, NOT forced** | grants are `postgres` + `service_role` only; `anon`/`authenticated` have none |
| registration → opportunity | **VERIFIED** | `crm_opportunity.registration_id → registrations`; money is referenced, never restated |
| `payment_events_production` usage | **VERIFIED** | `app/api/v1/crm/route.ts:155` reads the view, never `payment_events` |
| settlement → won | **VERIFIED APPLIED** | trigger `registrations_crm_settlement_won`, `AFTER UPDATE OF payment_status ... WHEN (new = 'PAYMENT_SETTLED' AND old IS DISTINCT FROM 'PAYMENT_SETTLED')` → `trg_crm_settlement_won()` |
| "settled but not won" | **VERIFIED IN SOURCE** | `crm-metrics.ts` computes `settledNotWon` — deals whose money landed but which are not marked won |

**CRM row counts: all six tables are empty (0 rows).** No customer or prospect
PII exists in the CRM today. That is the cheapest moment there will ever be to
fix its RLS posture.

**RLS note, precise:** RLS-enabled-with-zero-policies denies `anon` and
`authenticated`, but `service_role` bypasses RLS entirely and — because
`FORCE ROW LEVEL SECURITY` is **not** set — the `postgres` owner does too. The
real control today is the absence of grants, not the RLS flag. That is
adequate while the tables are empty and reachable only through a role-gated
API. It is not adequate once they hold parent contact details.

---

## 3. Payment status

### 3.1 Live in the database — VERIFIED

| Migration | Version | What it enforces |
|---|---|---|
| **M2** classification | `20260812083829_record_classification` | 5 rows, all `payment_events` classified **TEST** |
| **M3** replay integrity | `20260812122254_m3_payment_replay_integrity` | `settle_payment_transaction` — duplicate with identical immutable attrs = idempotent no-op; any difference = `RECONCILIATION_REQUIRED` |
| **M4** authorization boundary | `20260812172530_m4_payment_authorization_boundary` | `payment_service_authorization` — settlement is money truth, not permission to create an athlete |

Supporting objects verified present: view `payment_events_production`
(`security_invoker` **off**, **no client grants**, service-role only, **0
rows**); trigger `payment_events_immutable` (BEFORE DELETE OR UPDATE);
`payment_reconciliation_exception` (0 rows).

**Correction to prior documentation.** `record_classification.record_id` keys
on **`mpesa_receipt_number`**, not on `payment_events.id`. A join on the
surrogate id returns five NULLs and looks like "nothing is classified". All
five *are* classified TEST — verified directly. The natural key is load-bearing
for the `payment_events_production` predicate.

### 3.2 Live in application code — VERIFIED

| Consumer | Reads |
|---|---|
| `app/api/v1/biz/mpesa-callback/route.ts:254` | `settle_payment_transaction` RPC; handles the full outcome union including `TEST_CLASSIFIED` and `RECONCILIATION_REQUIRED` |
| `lib/services/payment-authorization.ts:93` | `payment_service_authorization` RPC; returns `SCHEMA_DEBT` if the M4 function is missing |
| `app/api/v1/biz/retry-onboarding/route.ts:163` | the same authorization gate |
| `app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts:145` | the same gate; `409` on `RECONCILIATION_REQUIRED`, `402` otherwise |
| `app/api/v1/biz/cash-watcher/route.ts:76` | `payment_events_production` |
| `app/api/v1/workspace/dashboard/route.ts:513` | `payment_events_production` |
| `app/api/v1/crm/route.ts:155` | `payment_events_production` |

All of the above are in `0c21b3b` and therefore **VERIFIED IN PRODUCTION**.

### 3.3 Production-verified behaviour — VERIFIED

| Probe | Result |
|---|---|
| `/api/v1/biz/mpesa-callback` (GET) | 405 — POST-only |
| `/api/v1/biz/retry-onboarding` (GET) | 405 — POST-only |
| `/api/v1/biz/stk-push` (GET) | 405 — POST-only |
| `/api/v1/workspaces/nrhl/onboard-paid-athlete` (GET) | 405 — POST-only |
| `/api/v1/biz/check-status` | 400 without input |
| `/api/v1/biz/cash-watcher` | 403 without authorization |
| `/api/v1/onboarding/google-forms` | **410** — retired, on both hosts |

**The M-Pesa rail is live and working.** All three registrations carry a
`stk_pushed_at` and a `checkout_request_id`, the most recent at
**2026-08-12 19:28:13 UTC**. Safaricom accepted an STK push four hours before
this audit. The registrations are `PENDING_PAYMENT` because nobody finished
entering a PIN — **not** because of config debt. `DARAJA_STK_SHORTCODE`
defaults to `MPESA_PAYBILL` (`4325935`) in `utils/mpesaDaraja.ts:52`, so its
absence from the Vercel environment is by design.

### 3.4 Venture boundary — VERIFIED live

Three registrations, **one household** (identical `msisdn_hash` prefix
`061ed95c`), **two ventures**:

| ref | venture | tier | expected | status |
|---|---|---|---|---|
| `ATH-9YWQ` | NRHL | `combine_27500` | 27,500 | PENDING_PAYMENT |
| `ATH-WKTR` | BIG_ICE | academy `…000005` | 180,000 | PENDING_PAYMENT |
| `ATH-ZVPD` | BIG_ICE | academy `…000004` | 95,000 | PENDING_PAYMENT |

This is the live F-5 case, three deep. Under M4 a payment from that phone that
does not match by `account_reference` resolves to `AMBIGUOUS_VENTURE` →
`RECONCILIATION_REQUIRED` rather than settling the wrong one. **The protection
lives in `settle_payment_transaction`, in the database, and the application
code that calls it is deployed.** Both halves are live.

### 3.5 What remains incomplete

- **Production has never processed a real payment.** `payment_events_production`
  returns 0 rows. Revenue reads KES 0.00 and that is correct.
- `payment_reconciliation_exception` has 0 rows — the M3/M4 exception paths are
  unit-tested and have never fired in production. **UNVERIFIED under real load.**
- **D-25 residue, see §9.**

---

## 4. Deployment status

**VERIFIED — see §1.1.** `pnpm verify:production` passes 13/13.

Residual items from 0.3K, both still open and both cheap:

- **D-28a** — the application cannot name its own build. Production identity is
  established from Vercel metadata plus a hand-picked behavioural probe.
- **D-28b** — `origin/master` still exists at `574e672`, wired to nothing.

---

## 5. Identity status

### 5.1 The five competing representations, classified — VERIFIED

Nothing was merged, renamed or altered. This is a classification of what
exists.

| Table | Rows | Shape | Classification |
|---|---|---|---|
| **`athlytica_core.athletes`** | **0** | 7 cols | **CANONICAL TARGET — not yet canonical.** Designed in `CANONICAL_ATHLETE_ARCHITECTURE.md`. Empty. Unreachable by every client role. It cannot be the source of truth for a record it does not hold. |
| **`public.athlete`** | **13** | 16 cols — `athlete_id` uuid, `legal_name`, `date_of_birth`, `is_dob_estimated`, `is_legacy`, `claim_token`, `provenance_id`, `national_id_hash`, `parent_email` | **DE-FACTO PRIMARY / LEGACY-BEARING.** The only table carrying provenance, legacy flags and claim tokens. Everything real is here: 7 synthetic Google Forms records + 6 TTA demo seeds. Becomes the **migration source**, then a **MIRROR**, then **DEPRECATED**. |
| **`public.athletes`** | **6** | 5 cols — `id`, `user_id` (UNIQUE, FK→`users`), `passport_athlete_id` (FK→`athlete.athlete_id`) | **NOT AN ATHLETE TABLE.** It is a `user ⇄ athlete` claim link, misnamed. **Rename or absorb.** It is also the privilege-escalation surface in §6.3. |
| **`public.bigice_athlete`** | **0** | 21 cols | **VENTURE PROJECTION.** Empty. |
| **`public.nrhl_athlete`** | **0** | 33 cols | **VENTURE PROJECTION.** Empty. |
| `public.athlete_tenant_links` | 6 | 4 cols | **MEMBERSHIP** — 1 distinct tenant. Correctly a separate relationship, per the established architecture. |

The established four-layer architecture maps cleanly onto this:

```
athlete_uid            → athlytica_core.athletes (canonical internal identity, EMPTY)
athlytica_id           → NOT ISSUED — sequence not created (see §5.2)
legacy identifier ledger → NOT BUILT — legacy codes live only in CSVs today
organization membership → public.athlete_tenant_links (exists, 6 rows, 1 tenant)
```

**Two of the four layers do not exist yet.** That is the honest statement of
Phase 0.4's starting position.

### 5.2 R4 — the sequence collision, stated precisely

**VERIFIED live:** `athlytica_core.scalable_id_sequence.current_value = 504`.

| | |
|---|---|
| Legacy occupied range | `ATH-500` … `ATH-638` (corpus max 638) |
| Next value the old issuer would mint | **505** — inside the occupied range |
| Named collisions | `ATH-537` Elaine · `ATH-566` Shaya Das · `ATH-598` Shirley Makena · `ATH-620` contested (Johari Keige / Tyler) |
| Codes already burned | **4** (500 → 504, zero athlete rows persisted — R15) |
| Issuers that increment this one row | `nrhl_next_athlete_code`, `bigice_next_athlete_code`, `athlytica_core.generate_scalable_athlete_code` |

**M1 does not solve this.** M1 makes minting and insertion atomic; it does not
change *which number* is minted. An atomic issuer pointed at 504 will atomically
issue an identifier that already belongs to a real child.

**No new production ID was minted in this phase.** The collision is contained
only by the fact that all three issuers are currently uncalled.

#### Recommended permanent strategy — RECOMMENDATION ONLY, NOT IMPLEMENTED

**Separate the public identifier from every internal sequence.** Four parts:

1. **`athlete_uid` (uuid) is the only join key.** Nothing user-facing, nothing
   guessable, nothing that can collide. Already the design.
2. **`athlytica_id` is a new, independent, zero-padded 6-digit sequence
   starting at 1** — `ATH-000001`. It shares no numeric space with the legacy
   block because the *format* differs: `ATH-000537` and `ATH-537` are different
   strings, and a 6-digit-padded format never re-renders as a 3-digit one. This
   is why `ATHLETE_ID_SPEC.md` §3 pads to six. The collision is dissolved by
   format, not by range-skipping — range-skipping (start at 639) would work
   today and break the first time a 639th legacy record surfaced.
3. **Legacy codes live only in an identifier ledger, as claims with
   provenance** — never as a primary key, never re-issued, never authoritative.
   `ATH-500` becomes "a code this person was known by in the BIIF scheme",
   scheme-qualified, because a `legacy_biif` `ATH-500` and a `legacy_nrhl`
   `ATH-500` may be different people.
4. **Retire `scalable_id_sequence` and all three issuers.** Do not continue it,
   do not reset it — leave it at 504 as evidence and revoke it.

**Ordering constraint, non-negotiable:** IDs are issued only *after* identity
resolution. Issuing before resolution gives one duplicated person two permanent
identifiers and makes the duplication canonical. Assignment must be in
**randomised order** — legacy-ordered assignment would make `ATH-000003` leak
that its holder is an early registrant, which is exactly what the format is
designed not to encode.

**OWNER DECISION required** before Phase 0.4 implements any of this.

---

## 6. RLS status — D-01 remains OPEN

**Nothing was enabled, altered or disabled in this phase.** This is the
baseline Phase 0.4 will execute against.

### 6.1 `athlytica_core` — VERIFIED

| Table | RLS | FORCE | Policies |
|---|---|---|---|
| `athletes`, `parents`, `performance_logs`, `scalable_id_sequence` | **off** | off | **0** |

**Not exposed.** No client role holds `USAGE` on the schema, so RLS here is
defence-in-depth, not the control. Adding it must **not** be accompanied by
grants — R17 records that the original containment script would have converted
"no access" into "policy-filtered access", i.e. weakened security.

**Documentation correction:** the state document says "advisor `rls_disabled`
still red". It is **not** in the current advisor output. That lint only covers
API-exposed schemas, and `athlytica_core` is not one. The live security
advisors return: 23 × `rls_enabled_no_policy` (INFO), 6 ×
`function_search_path_mutable` (WARN), 1 × `anon_security_definer_function_executable`
(WARN), 2 × `authenticated_security_definer_function_executable` (WARN), 1 ×
`auth_leaked_password_protection` (WARN).

### 6.2 `public` — VERIFIED

All 64 tables have RLS **enabled**. Only **two** have `FORCE ROW LEVEL
SECURITY`: `cohort_telemetry`, `scouting_metric_log`.

**23 tables have RLS enabled and zero policies** → deny-all to `anon` and
`authenticated`: `admissions_intakes`, `audit_log`, `bigice_athlete`,
`bigice_document`, `bigice_enrollment`, all six `crm_*`, `gate_states`,
`google_form_submission_log`, `nrhl_athlete`, `nrhl_metric`, `nrhl_scrimmage`,
`nrhl_stat_line`, `onboarding_funnel_events`, `payment_events`,
`payment_reconciliation_exception`, `record_classification`,
`sync_dead_letter_queue`, `telemetry_ingest_queue`.

**FORCE RLS requirement:** without it, the `postgres` table owner bypasses every
policy. Migrations, admin tooling and any `postgres`-connected job therefore see
everything. For tables holding PII or money this should be `FORCE`, and today
only two of sixty-four are.

### 6.3 Privilege escalation — HIGH, unrecorded until now

`public.athletes` carries policy `self_identity_policy`, **`FOR ALL`**, role
`authenticated`:

```
USING      (user_id = auth.uid())
WITH CHECK (user_id = auth.uid())
```

`authenticated` also holds `INSERT`/`UPDATE` grants on the table. The check
constrains **`user_id`** and nothing else. **`passport_athlete_id` is
unconstrained and carries no UNIQUE constraint** — only
`FOREIGN KEY → athlete(athlete_id)`.

`passport_athlete_id` is the first branch of `jwt_athlete_ids()`, which is the
`USING` clause of the SELECT policy on **`athlete`, `guardian_contact`,
`biometric_record`, `injury_record`, `custody_record`,
`cohort_session_registry`**.

So a signed-in user can write their own row in `public.athletes`, point
`passport_athlete_id` at any athlete uuid that exists, and thereby read that
child's name, date of birth, national-ID hash, guardian contact details, injury
history, biometrics and custody record.

**Mitigating today, and only today:**

- The FK forces the uuid to already exist, and uuids are not enumerable — the
  attack needs a *leaked* athlete uuid, not a guessed one.
- `public.athlete` holds 13 rows, all synthetic (7 Google Forms test records +
  6 TTA demo seeds). `guardian_contact` holds 3 rows. **No real child's data is
  behind this door yet.**

**Not mitigating:** the absence of a UNIQUE constraint means an attacker who
learns a uuid can claim it *before* the legitimate parent does. And the moment
one athlete uuid appears in a URL, an API response, a report or an email, this
becomes a live PII breach. **This must be closed before any real athlete row is
written.**

### 6.4 Tenant isolation — a latent foot-gun, inert today

`registrations`, `performance_logs`, `cohort_telemetry` and
`scouting_metric_log` each carry `tenant_isolation_policy`, **`FOR ALL`**,
applied to **PUBLIC** (all roles), with `tenant_id = app_tenant_id()`.

```sql
app_tenant_id() := nullif(current_setting('app.current_tenant_id', true), '')::uuid
```

A PostgREST client cannot set that GUC, so it evaluates to `NULL`, the
comparison is `NULL`, and the policy grants nothing. **Inert — VERIFIED.**

But permissive policies **OR** together. The day anyone adds a PostgREST
`pre-request` hook, a pooled connection initialiser, or any server path that
sets `app.current_tenant_id`, this silently becomes an **all-command** door on
`registrations` — the table M4 matches payments against. It should be deleted or
restricted, not left as a sleeping `FOR ALL` policy on the money path.

Separately: all three registrations have `tenant_id = NULL`, so
`tenant_member_policy` also matches nothing. Registrations are currently
unreadable by any client. **Correct, but by accident of data rather than by
design.**

### 6.5 Guardian PII exposure

`jwt_athlete_ids()` has a second branch:

```sql
union
select l.athlete_id from athlete_tenant_links l
 where l.tenant_id in (select jwt_tenant_ids())
```

Any user whose `public.users.tenant_id` matches sees **every athlete linked to
that tenant** — and therefore every one of those athletes' guardian contacts,
injuries, biometrics and custody records. That is presumably intended for
coaches. It is *not* self-scoping, and the tenant-wide read is not
role-differentiated: there is no "coach sees performance, not custody"
distinction. `jwt_tenant_ids()` matches `public.users` by **email OR id**,
which widens it further.

`users` = 8 rows, all with a tenant. `athlete_tenant_links` = 6 rows across 1
tenant. Small today; a design decision that needs to be explicit before it is
large.

### 6.6 SECURITY DEFINER functions — VERIFIED

14 in `public`. Client-executable ones:

| Function | Executable by | Note |
|---|---|---|
| `jwt_athlete_ids()` | `authenticated` | RLS helper; direct call leaks only the caller's own scope (**R19**) |
| `jwt_tenant_ids()` | `authenticated` | same (**R19**) |
| `touch_user_profiles_updated_at()` | **`anon`**, `authenticated` | a **trigger** function in the exposed API surface; errors on undefined `TG_OP` when called directly, so impact is low, but it does not belong there (**R18**) |

The money-path definers — `settle_payment_transaction`,
`payment_service_authorization`, `_payment_replay_verdict` — and the identity
definers — `bigice_next_athlete_code`, `nrhl_next_athlete_code`,
`link_guardian`, `athlete_passport_longitudinal` — have **no client EXECUTE**.
Correct.

**6 functions have a mutable `search_path`** (advisor WARN):
`trg_custody_age_band`, `onboard_athlete_from_google_form`,
`athlytica_core.generate_scalable_athlete_code`,
`trg_performance_logs_immutable`, `trg_touch_updated_at`,
`trg_payment_events_immutable`, `generate_legacy_claim_token`. Two of those sit
on the payment and performance immutability triggers. A `SECURITY DEFINER`
function with a mutable `search_path` is the classic Postgres privilege-
escalation primitive; these are `SECURITY INVOKER` triggers except
`generate_legacy_claim_token`, which **is** `SECURITY DEFINER` **and** has no
`search_path`. That one is the real item.

### 6.7 Views — VERIFIED

| View | `security_invoker` | Client grants |
|---|---|---|
| `payment_events_production` | **off** | **none** — service-role only. Correct. |
| `actuarial_injury_exposure_summary` | on | `authenticated` |
| `bone_age_dispute_evidence` | on | `authenticated` |
| `solidarity_claim_input` | on | `authenticated` |

The three `authenticated`-granted views are `security_invoker = true`, so the
caller's RLS applies to the underlying tables. Safe — and worth keeping that way.

### 6.8 What Phase 0.4 inherits

A clean baseline: nothing was changed here. The work is (1) close §6.3, (2)
resolve §6.4, (3) decide §6.5's coach-scope semantics, (4) `FORCE` RLS where PII
and money live, (5) give `crm_*` policies before it holds contacts, (6) apply
`athlytica_core` containment **without grants**, (7) fix `generate_legacy_claim_token`.

---

## 7. Migration status — D-16 remains OPEN

**VERIFIED**, computed by matching applied migration *names* against local
filenames.

| Category | Count |
|---|---|
| **TOTAL LOCAL** | **37** |
| **TOTAL APPLIED** | **36** |
| **MATCHING** (version and name identical) | **5** |
| **RENAMED / APPLIED UNDER A DIFFERENT VERSION** | **30** |
| **APPLIED BUT NO LOCAL FILE** | **1** |
| **LOCAL BUT NEVER APPLIED** | **2** |
| **DUPLICATES** | **0** |
| **UNSAFE TO REPLAY** | **all 37** |

**MATCHING (5)** — every one deliberately aligned by renaming the local file to
the version Postgres stamped:
`20260812083829_record_classification`,
`20260812122254_m3_payment_replay_integrity`,
`20260812172530_m4_payment_authorization_boundary`,
`20260812221912_crm_core`,
`20260812222626_crm_sales_ops_role`.

*(Prior documentation says "four match". It is now five — `crm_sales_ops_role`
also aligns.)*

**APPLIED BUT NO LOCAL FILE (1)** — `20260811012454_bigice_academy_name_parity`.
**R7.** A production schema change with no source. Its *effect* is the Big Ice
tier-name realignment; whether the local
`20260811090000_bigice_beginner_package.sql` fully reproduces it is
**UNVERIFIED**.

**LOCAL BUT NEVER APPLIED (2)** — and they are not the same case:

| File | Effects in the database? |
|---|---|
| `20260713_cohort_telemetry_scouting_metric_log_rls.sql` | **PRESENT.** Both tables have `FORCE RLS` + `tenant_isolation_policy`/`tenant_member_policy`. Applied under another ledger entry (almost certainly folded into `sec001_*`). Ledger gap only. |
| `20260720095900_inventory_allocation_trigger.sql` | **ABSENT.** `commercial_inventory` has **no triggers at all**. This migration has genuinely never run. |

The second is a real gap: an inventory-allocation trigger the repository
believes exists and the database has never had. Whether that matters depends on
whether `commercial_inventory` allocation is used — **UNVERIFIED**, and out of
scope here.

**Root cause, unchanged:** `apply_migration` stamps
`to_char(current_timestamp, …)` rather than honouring the filename version, so
every migration applied through the MCP tool lands under a wall-clock version.
`supabase db push` **must not be run** — it would attempt to replay 32
migrations against a schema that already has them (**R5**).

### Recommended reconciliation strategy — RECOMMENDATION ONLY

Do **not** rewrite history and do **not** try to make the 30 renamed files
match. Three steps, none destructive:

1. **Declare the applied ledger authoritative and freeze it.** Add a
   `supabase/migrations/APPLIED_LEDGER.md` recording the 36 applied
   `(version, name)` pairs as read from the database, with the date read. The
   local filenames become *source*, the ledger becomes *state*, and the two are
   never expected to match again for anything before `20260812083829`.
2. **Adopt the alignment discipline going forward, which already works.** Every
   migration from M2 onward is applied first, then the local file is renamed to
   the stamped version. Five for five. Make it the written rule.
3. **Close the two real gaps individually:** reconstruct
   `bigice_academy_name_parity` from the live schema into a local file marked
   *reconstructed, not replayable* (R7); and decide whether
   `inventory_allocation_trigger` should be applied or deleted — it is the only
   file in the repository claiming a database object that does not exist.

**OWNER DECISION** on step 3's second half. Steps 1–2 are documentation and cost
nothing.

---

## 8. Data migration blockers — BLOCKED, nothing imported

**Nothing was imported, mapped, resolved or minted in this phase.**

| # | Blocker | Status | Owner decision? | Source needed? | Engineering? | Blocks |
|---|---|---|---|---|---|---|
| 1 | **D-04 — authoritative 16-tab export** | **BLOCKED** | **YES** | **YES** — the Google Sheet, exported whole | no | **Everything.** No file in the repository is authoritative. |
| 2 | **2021 duplicate source** | BLOCKED | YES | YES | no | Identity resolution. `2021.csv` 93 rows vs `2021(1).csv` 1,020 (**R6**) |
| 3 | **`Foundational Skating`** (D-03) | BLOCKED | **YES** | no | no | Phase 7 — 1,669 rows have no defined meaning |
| 4 | **Identity resolution** | BLOCKED | partly | depends on D-04 | **YES** | ID issuance (§5.2 ordering constraint), staging, everything downstream |
| 5 | **Contested IDs** (D-02 `ATH-047`, `ATH-620`) | BLOCKED | **YES** | YES | no | Identity resolution |
| 6 | **Duplicate pairs** (D-06 bare first names) | BLOCKED | **YES** | YES | some | Identity resolution. `eli` → Eli Das, but Eli Araka exists (**R10**) |
| 7 | **Age / DOB** (D-11) | BLOCKED | **YES** | **YES** — DOB is collected nowhere | **YES** | **19 of 27 verified cognitive metrics are unscorable** (**R9**) |
| 8 | **Certificate Tracker** (D-17/18/19) | BLOCKED | **YES** | YES | no | Certificate re-issue |
| 9 | **`NRHL-COMP-v1`** | BLOCKED | **YES** | no | **YES** | Reproduces exactly but is structurally unsafe (DQ-050). `nrhl_athlete` is empty so nothing is issued today. Freeze recommended (**R8**) |
| 10 | **Metric registry** (D-09/10/12/14) | BLOCKED | **YES** | YES | **YES** | Phase 9. 27 VERIFIED / 2 INFERRED / 4 UNKNOWN / 1 DEPRECATED, 5 blockers |
| 11 | **`observed_at`** | BLOCKED | no | **YES** | **YES** | Longitudinal analytics — a metric without a trustworthy timestamp cannot be trended |
| 12 | **Derived formulas** (D-09/12/14) | BLOCKED | **YES** | YES | **YES** | Phase 9. 3 unreproducible: compliance %, Speed/Power score, `Session_Load` (**R11**) |

**Legacy corpus, unchanged:** ~3,096 session rows, 209 athlete IDs across 23
`SOURCE_CANDIDATE` CSVs. **Nothing migrated.**

**D-04 gates all twelve.** Until one export is declared authoritative, every
downstream decision is a decision about an unknown input.

---

## 9. Decision register reconciliation

Full text in [`DECISION_REGISTER.md`](DECISION_REGISTER.md). Changes made in
this phase:

| ID | Before | After | Why |
|---|---|---|---|
| **D-01** RLS | OPEN | **OPEN — baseline now documented** | §6 is the clean starting point Phase 0.4 needs. Two new sub-items raised: **D-01a** (§6.3 escalation) and **D-01b** (§6.4 dormant `FOR ALL` policy). |
| **D-04** export | OPEN | **OPEN — unchanged, still gates everything** | No new evidence. |
| **D-11** age/DOB | OPEN | **OPEN — unchanged** | Still blocks 19 of 27 metrics. |
| **D-16** drift | OPEN | **OPEN — now quantified** | 37/36/5/30/1/2/0. Reconciliation strategy proposed in §7. |
| **D-20** atomic issuance | OPEN | **OPEN — re-scoped** | M1 makes issuance atomic but does **not** address R4. Both are needed, and R4 comes first: an atomic issuer pointed at 504 atomically issues a colliding ID. |
| **D-25** second M-Pesa rail | OPEN | **PARTIALLY RESOLVED** | Code **gone** — `performance/route.ts` is 83 lines with no STK client, and no source file reads `MPESA_CONSUMER_KEY`/`_SECRET`/`_PASSKEY`/`_SHORTCODE`. **Credentials remain**: five unused `MPESA_*` variables are still provisioned in Vercel production (created 13:51–18:11 on 2026-08-12, exactly when the pasted client existed). Only `MPESA_CALLBACK_SECRET` is genuinely used. **OWNER DECISION: delete the five, or say what they are for.** |
| **D-27** Apps Script trigger | OPEN | **OPEN — unchanged, now harmless** | The endpoint returns 410 in production (§3.3). Hygiene only. |
| **D-28** deployment chain | CLOSED | **CLOSED — re-verified** | §1.1, 13/13. |
| **D-29** CRM concurrent work | OPEN — informational | **RESOLVED as a concurrency problem** | The CRM author committed the module as `307bacb` at 00:29 UTC. There is no longer a second uncommitted actor. |
| **D-30** commit the CRM | *(raised in this phase)* | **RESOLVED — superseded by D-30a** | Committed as `307bacb`, 23 files, 5,197 insertions. |
| **D-30a** push the CRM | *(new)* | **OPEN — one command** | `main` is **ahead of `origin/main` by 1**. The CRM exists on one machine. `git push origin main`, then `pnpm verify:production`. |
| **D-32** `supabase pull` / `migration repair` | *(new)* | **OPEN — caution, raised 0.3L** | `307bacb` announces an intent to run `supabase pull`. With 30 of 37 local versions mismatched, the CLI will recommend `supabase migration repair`, which **writes to the remote migration history** — the only accurate record of what was applied. See §2.1a. |
| **R4** legacy ID collision | OPEN | **OPEN — strategy recommended, not implemented** | §5.2. Needs **OWNER DECISION** before Phase 0.4. |

**New:**

| ID | Item |
|---|---|
| **D-01a** | `public.athletes.self_identity_policy` is `FOR ALL` with `WITH CHECK` on `user_id` only; `passport_athlete_id` is unconstrained and not unique, and it feeds `jwt_athlete_ids()`. **HIGH — must close before the first real athlete row.** (§6.3) |
| **D-01b** | `tenant_isolation_policy` is a `FOR ALL` policy applied to **PUBLIC** on `registrations` (and 3 others), gated only by a GUC no client can set. Inert today; an all-command door on the money path the day anything sets that GUC. (§6.4) |
| **D-01c** | Only 2 of 64 `public` tables have `FORCE ROW LEVEL SECURITY`. The `postgres` owner bypasses every policy on the other 62. (§6.2) |
| **D-30** | **Commit the CRM.** **RESOLVED during this phase** — `307bacb`. (§2.1) |
| **D-30a** | **Push the CRM.** `main` is ahead of `origin/main` by 1. Committed ≠ pushed ≠ deployed. (§2.1) |
| **D-31** | `20260720095900_inventory_allocation_trigger.sql` has never been applied and `commercial_inventory` has no triggers. Apply it or delete it. (§7) |
| **D-32** | Do not run `supabase migration repair` until D-16 is decided — it overwrites the accurate remote ledger with a local directory that disagrees with it in 30 places. (§2.1a) |

**Closed in this phase: none.** No decision was resolved by evidence gathered
here; several were sharpened.

---

## 10. Roadmap

Delivered as [`../ATHLYTICA_MASTER_ROADMAP.md`](../ATHLYTICA_MASTER_ROADMAP.md)
— nine phases (0.1 → 1.0), each with objective, status, dependencies, blocking
decisions, production risk, acceptance criteria and next action.

Summary: **0.1, 0.2, 0.3 COMPLETE. 0.4 READY (with one owner decision).
0.5 BLOCKED on D-04. 0.6–1.0 DEFERRED behind 0.5.**

## 11. Dependency graph

Delivered as
[`../ATHLYTICA_DEPENDENCY_GRAPH.md`](../ATHLYTICA_DEPENDENCY_GRAPH.md) — the
vertical spine, payments and CRM as cross-cutting systems, and an explicit
split of what can proceed in parallel versus what must wait.

---

## 12. Exact next action

> **Push `307bacb`, then run `pnpm verify:production`.**
>
> The CRM was committed during this phase but **not pushed** — `main` is ahead
> of `origin/main` by one commit, so 5,197 lines of application code for an
> applied production schema exist on exactly one machine. One command closes
> it, and the deployment chain repaired in 0.3K will carry it to production
> without further instruction.
>
> **Do not run `supabase migration repair`** on the way (§2.1a).

**Then Phase 0.4 — Identity + RLS Foundation.** Do not start it before the
following three owner decisions, because each one changes what 0.4 builds:

| Decision | Question | Consequence if deferred |
|---|---|---|
| **R4** (§5.2) | Adopt the padded-format `athlytica_id` independent of `scalable_id_sequence`? | 0.4 cannot design the identity layer |
| **D-01a** (§6.3) | Close the `public.athletes` escalation now, or after identity resolution? | Every real athlete row written before the fix is exposed to anyone holding a leaked uuid |
| **D-25** (§9) | Delete the five unused production `MPESA_*` credentials? | Live M-Pesa credentials with no consumer sit in the production environment |

**D-04 is not on that list, and that is deliberate.** It gates Phase 0.5, not
0.4. Identity and RLS can be built against an empty canonical table; they do not
need the authoritative export. **0.4 is the last phase that can proceed without
D-04.**

---

## Testing

| Check | Result |
|---|---|
| `pnpm typecheck` | **clean** |
| `pnpm test` | **210 pass / 0 fail** (178 base + 32 from the uncommitted `crm-metrics` and `crm-permissions`) |
| `pnpm verify:production` | **6/6 chain checks, 7/7 HTTP probes** |

No test was modified. No production data was mutated: every database
interaction in this phase was a `SELECT` against catalogs or row counts.
