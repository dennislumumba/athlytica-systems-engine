# ATHLYTICA — PROJECT STATE

**This is the durable context file. Read it first. Update it after every phase.**

A future session should be able to continue from this document plus the
repository, without any prior conversation.

**This document holds operational state, not evidence.** Evidence lives in the
phase reports under `docs/phase0/`. Plan and ordering live in
[`ATHLYTICA_MASTER_ROADMAP.md`](ATHLYTICA_MASTER_ROADMAP.md) and
[`ATHLYTICA_DEPENDENCY_GRAPH.md`](ATHLYTICA_DEPENDENCY_GRAPH.md). Decisions live
in [`phase0/DECISION_REGISTER.md`](phase0/DECISION_REGISTER.md).

---

## LAST VERIFIED — 2026-08-13 (Phase 0.3L)

| | |
|---|---|
| **Production SHA** | **`0c21b3b87f3f97af911df45a62dc29ffdf90b4cc`** = `HEAD` = `origin/main` |
| **Vercel deployment** | `dpl_9H2ZZawMZRQaoEbk2URRHUFdQLjQ` — `target: production`, `source: git`, `gitSource.ref: main`, READY, holding `athlytica-systems-engine.vercel.app` |
| **Deployment chain** | ⚠ **`pnpm verify:production` is currently BLIND** — the Vercel CLI token has expired (`403 forbidden, invalidToken`), so the script cannot read deployment metadata and exits before the probes. **Fix: `npx vercel login`.** The chain itself is intact: production branch is `main` (0.3K), and direct HTTP probes pass **8/8** on the alias plus the proxied `/register` (2026-08-15). |
| **`HEAD`** | **`307bacb`** — the CRM module, committed 2026-08-13 00:29 UTC (23 files, 5,197 insertions). ⚠ **`main` is ahead of `origin/main` by 1 — not pushed, not deployed. D-30a.** |
| **Working tree** | 0.3L's own documents only. |
| **Supabase project** | `qxfrypvevjsyzkquewxh` — 68 base tables (64 `public`, 4 `athlytica_core`), 4 views |
| **Migration state** | ⚠ **UNCERTAIN — two ledgers disagree (D-40).** Reading `supabase_migrations.schema_migrations` **directly**: **38 rows, versions matching all 38 local filenames exactly.** The MCP `list_migrations` tool that 0.3L used returns **36 rows with different versions**, plus one name (`bigice_academy_name_parity`) absent from the table. And the table itself is not trustworthy: `20260720095900 inventory_allocation_trigger` is recorded applied while **none of its objects exist**. **0.3L's "5 match / 30 renamed / 1 no-source / 2 unapplied" is withdrawn pending reconciliation against object existence.** Newest: `20260814210328_m5_d01a_athletes_bridge_containment` (0.4). `supabase db push` and `migration repair` **must not be run** — see D-32, D-40. |
| **Athlete-ID sequence** | `athlytica_core.scalable_id_sequence = 504` — **inside** the legacy `ATH-500`–`ATH-638` block. 4 codes burned, 0 athlete rows. Canonical `athlytica_id_seq` **not created**. **R4.** |
| **Test suite** | `pnpm test` → **210 pass / 0 fail** (178 base + 32 from the uncommitted CRM tests) |
| **Typecheck** | **clean** |

### Row counts (read-only verification, 2026-08-13)

| Table | Rows | |
|---|---|---|
| `public.athlete` | **13** | 7 synthetic Google Forms + 6 TTA demo seeds |
| `public.athletes` | **6** | not an athlete table — a `user ⇄ athlete` link (see Identity) |
| `athlytica_core.athletes` | **0** | the canonical target, empty |
| `bigice_athlete` · `nrhl_athlete` · `bigice_enrollment` · `bigice_document` | **0** | |
| `athlete_tenant_links` | 6 | 1 distinct tenant |
| `guardian_contact` | 3 | |
| `users` | 8 | all with a tenant |
| `user_profiles` · `workspace_roles` | **0** | no grant exists; the founder bypasses grant lookup |
| `registrations` | **3** | one household, two ventures — the live F-5 case |
| `payment_events` | 5 | **all classified TEST** |
| `payment_events_production` | **0** | revenue reads **KES 0.00**, correctly |
| `record_classification` | 5 | keyed on `mpesa_receipt_number`, **not** on `payment_events.id` |
| `payment_reconciliation_exception` | 0 | M3/M4 exception paths never fired in production |
| `crm_*` (6 tables) | **0** | no customer PII in the CRM yet |
| `google_form_submission_log` | 7 | channel retired; caller-less |
| `gate_states` | 1 | `G-W6-PAY` `live=false`, `evidence=null` |
| `commercial_price_tier` | 7 | |

---

## CURRENT PAYMENT STATE

**The rail is live. It has never carried a real payment.**

- **M2** (`20260812083829`) classification · **M3** (`20260812122254`) replay
  integrity · **M4** (`20260812172530`) authorization boundary — all applied,
  all with their application consumers deployed in `0c21b3b`.
- Safaricom accepted an STK push at **2026-08-12 19:28:13 UTC**. All three
  registrations carry `stk_pushed_at` and a `checkout_request_id`. They sit at
  `PENDING_PAYMENT` because nobody finished a PIN — **not** config debt.
- All 5 `payment_events` are synthetic (`AUDITTEST001-004` + `SGX7HQ2LM9`) and
  classified TEST. **Production has never processed a real payment**, so M3's
  and M4's exception paths are unit-verified and production-unexercised.
- `payment_events` is append-only by trigger. `payment_events_production` is
  `security_invoker` **off** with **no client grants** — service-role only.
- Three application consumers read the view for money: `cash-watcher`,
  `workspace/dashboard`, `crm`. **None reads `payment_events` for revenue.**
- **Google Forms is retired and live**: `GET /api/v1/onboarding/google-forms`
  → **410** on both `athlytica-systems-engine.vercel.app` and
  `www.nairobihockey.com`. **4 live athlete-creation doors, down from 5.**

## CURRENT CRM STATE

| | |
|---|---|
| **SOURCE-COMMITTED** | ✅ **YES** — `307bacb` |
| **PUSHED** | ❌ **NO** — `main` is ahead of `origin/main` by 1 |
| **DEPLOYED** | ❌ **NO** — production runs `0c21b3b`; no build contains CRM code |
| **PRODUCTION-VERIFIED** | schema **YES**, application **NO** |

Two migrations are applied to production (`20260812221912_crm_core`,
`20260812222626_crm_sales_ops_role`) creating six `crm_*` tables and the
`SALES_OPS` role. The application code is now in `main` at `307bacb` — **but
not pushed, so no build contains it.** Design is sound — API gated to
`GLOBAL_FOUNDER`/`SALES_OPS` in `athlytica_hq`, deliberately *not* served by
the all-or-nothing `/api/v1/workspace/dashboard`; money referenced via
`crm_opportunity.registration_id` and never restated; `collectedKes` computed
only from `payment_events_production`; `settledNotWon` a first-class output.
Grants are `service_role` + `postgres` only.

**D-30a — push it.** The 0.3K lesson one link earlier: a commit is not a push,
a push is not a deploy.

**⚠ D-32 — do not run `supabase migration repair`.** `307bacb`'s message
announces `supabase pull`. With 30 of 37 local migration versions mismatched
the CLI will recommend a repair, and repair **writes to the remote migration
history** — the only accurate record of what has been applied. Use
`supabase db dump` if a local baseline is wanted.

## CURRENT RLS STATE — D-01 OPEN

**Nothing was changed in 0.3L.** This is the clean baseline Phase 0.4 executes
against. Full analysis: `phase0/ATHLYTICA_FOUNDATION_0_3L_REPORT.md` §6.

| Surface | State |
|---|---|
| `athlytica_core` (4 tables) | RLS **off**, 0 policies — but **no client role holds `USAGE`**, so it is unreachable. Add RLS **without grants** (R17). |
| `public` (64 tables) | RLS **on** everywhere. **23 have zero policies** (deny-all). Only **2 of 64** have `FORCE RLS`. |
| `anon` | **no table grants at all** |
| `authenticated` | full DML on **44 tables + 3 views**, including `athlete`, `guardian_contact`, `registrations`, `users`, `workspace_roles`, `biometric_record`, `injury_record`, `custody_record` |

Defects found and **not fixed** (0.3L and 0.4 both changed nothing):

- **D-01a / D-34 — ✅ CONTAINED 2026-08-15.** Migration
  `20260814210328_m5_d01a_athletes_bridge_containment`. `authenticated` now
  holds **SELECT only** on `public.athletes`; `self_identity_policy` (FOR ALL)
  replaced by `athletes_self_read` (SELECT, `user_id = auth.uid()`). **The block
  is at the privilege layer (42501), before RLS and before the FK**, so it no
  longer depends on the `auth.users` / `public.users` disconnection. Verified
  live **with the bridge row present**: attacker INSERT and UPDATE both blocked,
  attacker reads 0 across `athlete`/`guardian_contact`/`biometric_record`/
  `injury_record`/`custody_record`; `service_role` still creates claims; the
  legitimate owner still sees their own athlete and guardian contact. Probe:
  `supabase/tests/d01a_containment_probe.sql`. **This is containment, not "RLS
  complete"** — no `UNIQUE` on `passport_athlete_id` (cardinality is a D-37
  decision) and no `FORCE RLS` (gated on D-35).
- **D-36 — `jwt_athlete_ids()` unions two incompatible key spaces.** Branch 1 is
  passport-plane, branch 2 is app-plane, measured overlap **zero**. Coach-scoped
  PII visibility is a functional gap, **not** a live exposure — correcting
  0.3L §6.5.
- **D-01b.** `tenant_isolation_policy` is a `FOR ALL` policy applied to
  **PUBLIC** on `registrations` (and 3 others), gated on a GUC no PostgREST
  client can set. Inert today; an all-command door on the money path the day
  anything sets it.
- **D-01c.** 62 of 64 `public` tables lack `FORCE RLS`, so the `postgres` owner
  bypasses every policy.

## CURRENT IDENTITY STATE

**The identity graph is severed** (0.4, VERIFIED). `auth.users` (4 rows) is what
the deployed application authorises on — `requireWorkspaceRole()` →
`auth.getUser()` → `workspace_roles`. `public.users` (8 rows) is legacy seed
data and is what `jwt_tenant_ids()`, `jwt_athlete_ids()` branch 2 and
`/api/v1/mcp` resolve through. **Zero id overlap, zero email overlap, no
trigger bridges them.** So `jwt_athlete_ids()` and `jwt_tenant_ids()` return ∅
for every possible authenticated caller, and every athlete-scoped policy denies
every row. **The database is safe by disconnection, not by policy** — and no
parent portal can work until the bridge exists. **D-37.**

| Layer | State |
|---|---|
| `athlete_uid` — canonical internal identity | `athlytica_core.athletes`, **empty** |
| `athlytica_id` — public human-readable ID | **does not exist**; scheme undecided (**D-33**, Option C recommended) |

**Two identifier planes exist, not one** (0.4, VERIFIED). `public.athlete.passport_id`
(`text`, UNIQUE, **0 issued**) is the *passport* plane, consumed by
`convexAdapter`. `nrhl_athlete.athlete_code` (`character(9)`, PK) and
`bigice_athlete.biif_code` (`text`, PK) are the *venture* plane, consumed by
`athleteCodeSchema` and the public verify endpoint. **R4 lives entirely on the
venture plane** — the sequence feeds it and `migrateLegacyCode()` pads into it.
Both earlier recommendations (B, B′) failed because they applied a passport
format to a venture column.
| legacy identifier ledger | **not built**; legacy codes live only in CSVs |
| organization membership | `athlete_tenant_links`, 6 rows, 1 tenant ✅ |

**Two of four layers do not exist.** Classification of what does exist:
`public.athlete` (13 rows) is the **de-facto primary and legacy-bearing** table
— the only one carrying provenance, `is_legacy`, `claim_token`, DOB.
`public.athletes` (6 rows) is a **misnamed link table**, not an athlete table.
`bigice_athlete` / `nrhl_athlete` are **empty venture projections**.

**R4 / D-33 — the collision, re-stated correctly in 0.4.** The sequence sits at
504. Legacy codes are **3-digit** (`ATH-500`–`ATH-638`); the issuers emit
**5-digit** `ATH-00505` and `BIIF-2026-0505`. Those strings do not collide —
**until `migrateLegacyCode()` (`lib/services/nrhl-etl.ts:178`) pads legacy codes
to exactly five digits, which is its purpose.** After migration the legacy block
is `ATH-00500`–`ATH-00638` and the next issue is `ATH-00505`. **Padding creates
the collision; it does not dissolve it** — so 0.3L §5.2 and `ATHLETE_ID_SPEC.md`
§3 are both wrong on this point. `migrateLegacyCode` has **no production
caller**: R4 is armed, not fired. **M1/D-20 does not solve it** — an atomic
issuer pointed at 504 issues a colliding identifier reliably. **Five
incompatible `ATH-*` namespaces exist**; the only one with live rows,
`account_reference` (`ATH-9YWQ`), is a *payment reference*, not an identity.
Options in [`phase0/IDENTITY_R4_ANALYSIS.md`](phase0/IDENTITY_R4_ANALYSIS.md);
recommended: **B**, `ATH-YYYY-XXXXXX` non-sequential, sequence retired.

---

## ACTIVE RISKS

Full text in `phase0/DECISION_REGISTER.md` and the phase reports.

| Open | |
|---|---|
| **R4** CRITICAL | ID sequence 504 collides with legacy `ATH-500`–`ATH-638` |
| **R15** CRITICAL | athlete code minted outside the insert transaction |
| **R3** HIGH | `onboard-paid-athlete` mints a colliding ID (PII half void per R2) |
| **R5** HIGH | `supabase db push` would replay 32 migrations |
| **R6** HIGH | migrating from a `SOURCE_CANDIDATE` file |
| **R7** HIGH | `bigice_academy_name_parity` applied with no local file |
| **R8** HIGH | certificates from a structurally flawed composite (DQ-050) |
| **R9** HIGH | 19 of 27 verified cognitive metrics unscorable — no DOB |
| **R10** HIGH | bare-name attribution (`eli` → Eli Das; Eli Araka exists) |
| **R11** MED | 3 derived formulas unreproducible |
| **R12** MED | phone-enumeration oracle via `link_guardian()` |
| **R18–R20** LOW | trigger fn callable by `anon`; RLS helpers callable by `authenticated`; leaked-password protection off |

| Resolved | |
|---|---|
| R1 | parent-portal ILIKE leak — **fixed** (`0441e0c`), unit-tested |
| R2 | `athlytica_core` "fully exposed" — **false**; no client role holds schema `USAGE` |
| R13 | `SGX7HQ2LM9` — **synthetic**, absent from the Safaricom statement |
| R14 | 5 synthetic payments — **classified TEST**; revenue reads KES 0 |
| R16 | `G-W6-PAY` live on synthetic evidence — **reset**, flips only on PRODUCTION |
| R17 | containment script would have **weakened** security — **rewritten** |

---

## CURRENT BLOCKERS

In order of what unblocks the most.

1. **D-30a — the CRM is committed but not pushed.** `main` is ahead of
   `origin/main` by 1; 5,197 lines exist on one machine. One `git push` fixes
   it. **The only blocker that can lose work.** (D-30, committing it, closed
   2026-08-13.) See also **D-32** — do not run `supabase migration repair`.
2. **D-04 — no authoritative source.** All 23 local CSVs are
   `SOURCE_CANDIDATE`; four workbook tabs are missing locally, including
   `Certificate Tracker`. **Nothing may be migrated until a fresh 16-tab export
   exists.** Gates Phase 0.5 and everything below it — but **not** 0.4.
3. **D-01a — live privilege-escalation path** into every PII table. Cheap now
   (all data synthetic), expensive after the first real payment.
4. **R4 — ID issuance would collide.** Contained only by not issuing.
5. **D-20 — ID issuance is not transactional.** M1 designed, not applied.
   Blocked behind R4.
6. **D-16 — migration ledger drift.** No reproducible schema baseline.
7. **D-11 — no DOB anywhere.** A product gap, not a data gap; no import fixes it.
8. **Docker not installed → no isolated environment** for the `FORCE RLS` vs
   `SECURITY DEFINER` question, R11, R12, migration dry run, rollback test.

**Migration gates: 1 of 20 complete, 1 partial, 18 open.**

## CURRENT OWNER DECISIONS

Each is a human choice, not engineering. The first three gate Phase 0.4.

| ID | Question |
|---|---|
| **D-33** (R4) | **B and B′ both withdrawn.** Recommendation is **Option C — keep `ATH-NNNNN`, issue at random from a reserved band `ATH-10000`–`ATH-99999`.** Zero schema/regex/endpoint/integration change; disjoint from legacy by a 15× margin; safe against the *unmodified* `migrateLegacyCode`; makes R15 impossible; removes M1's lock. Cost: a **90,000 hard ceiling** on NRHL codes forever. **Sign-off needed on the ceiling.** |
| **D-35** | `wsl --install` from an **elevated** prompt, reboot, start Docker Desktop, `npx supabase start`. Runbook + 17-case matrix in [`phase0/D35_ISOLATED_ENVIRONMENT_RUNBOOK.md`](phase0/D35_ISOLATED_ENVIRONMENT_RUNBOOK.md). **0.4 cannot complete without it.** |
| **D-38** | `npx vercel login` — the CLI token expired, so `pnpm verify:production` is blind. Chain verified healthy by direct probe instead. |
| **D-32** | ⚠ Hold `supabase migration repair` until D-16 is decided — it overwrites the accurate remote ledger |
| **D-37** | Retire or bridge `public.users`? Upstream of the parent portal; the bridge arms D-34 |
| **D-25** | Delete the five unused production `MPESA_*` credentials (+ `MS100N_HASH_KEY`)? |
| **D-04** | Which export is authoritative? — *ask for the 16-tab Google Sheet now; it is the longest pole in the project* |
| D-26a | Apply the seven-record TEST classification? (one command) |
| D-26b | Classify the 6 TTA demo athletes as DEMO? |
| D-27 | Disable the Google Apps Script trigger (outside this repository) |
| D-28a | Add `/api/v1/version` so the app can name its own build? |
| D-28b | Delete `origin/master` (still at `574e672`, wired to nothing)? |
| D-31 | Apply or delete `20260720095900_inventory_allocation_trigger.sql`? |
| D-02, D-03, D-06, D-07, D-08, D-09, D-10, D-11, D-13, D-14, D-17, D-18, D-19 | legacy-data and metric decisions — see the register |

**Approved: none.** No decision in the register has been marked approved.

---

## DO NOT REPEAT

Investigations already completed. Do not redo these without new evidence.

| Question | Answer | Where |
|---|---|---|
| Does `NRHL-PTS-v1` hold? | **Yes** — `3×assisted + 1×solo + 1×assists`, verified 3 independent ways (94/94 fixtures, 31/31 rollups, code constant) | audit §11 |
| Does `NRHL-COMP-v1` reproduce? | **Yes** — `attendance% + 20×grade + points`, residuals 0.000–0.010 | `DQ050_CERTIFICATE_IMPACT.md` |
| Is `technical_precision` a measurement? | **No** — `4 − 2×breaks`, 265/265 exact | audit §11 |
| Is `technical_rating` just sign-inverted? | **No** — confounded with exposure. Do not flip the sign. | `METRIC_REGISTRY_V2.md` §6 |
| Are the compliance-% columns empty? | **No** — 383 obs each, all 5 levels. The **rollup formula** is broken. | `METRIC_REGISTRY_V2.md` §4.4 |
| Was the assisted/solo split destroyed? | **No** — present in `Scrimmage Tracker`; only the extract collapsed it | audit §11 |
| Is DQ-050 caused by discipline? | **No — by exposure.** All 16 zero-point athletes have `games_played = 0`. | `DQ050_CERTIFICATE_IMPACT.md` §2 |
| Can DQ-050 tiers be recomputed? | **No** — `Certificate Tracker` absent locally; coach grade known for 5 of 18 | same, §5 |
| Why do migration versions differ? | `apply_migration` stamps `to_char(current_timestamp,'YYYYMMDDHH24MISS')` — confirmed verbatim in postgres logs | `MIGRATION_RECONCILIATION.md` §2 |
| Is the local settlement migration applied? | **Yes** — live function contains `stk_pushed_at desc nulls last` | same |
| Where do metric protocols live? | Riverside capture sheet + Performance ID PDFs + dossier §2.5/§2.8. **Not in the repo.** | `METRIC_REGISTRY_V2.md` §2 |
| What is the authoritative legacy source? | Google Sheet `Athlytica Data`, id `1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss`, 16 tabs | `AUTHORITATIVE_SOURCE_EXPORT_SPEC.md` |
| Does `gviz` fail on a bad tab name? | **No — it silently returns the first tab.** Must assert on a known column. | same, §3 |
| Can the msisdn be recovered from the hash? | **No** — HMAC-SHA256 with `MSISDN_HASH_KEY`. Do not attempt; it would de-anonymise a minor's guardian. | `utils/msisdn.ts` |
| Did `link_guardian` run 10× at runtime? | **No** — those log hits are migration DDL text, not invocations. `athlytica_core.parents` = 0. | Phase 0.2 §1 |
| Why did the sequence move 500→504? | `bigice-onboarding.ts:190` mints via RPC, `:200` inserts separately. No transaction. | Phase 0.2 §2 |
| Is GitHub's default branch also Vercel's production branch? | **No — they are independent settings.** It was `master` while every push went to `main`, for the life of the project. Read `productionBranch`; never infer it. | `phase0/DEPLOYMENT_CHAIN_AUDIT.md` |
| Can a `vercel --prod` deployment's commit SHA be trusted? | **No.** It uploads the working tree and stamps whatever commit git is sitting on. Two production deployments are labelled `6b19bbc` and built code that exists in no commit. | same, §4a |
| Is `record_classification` keyed on `payment_events.id`? | **No — on `mpesa_receipt_number`.** A join on the surrogate id returns NULLs and looks like nothing is classified. All five *are* TEST. | `phase0/ATHLYTICA_FOUNDATION_0_3L_REPORT.md` §3.1 |
| Is `public.athletes` an athlete table? | **No.** It is the deliberate **passport ⇄ app-plane bridge**: `athlete.athlete_id → athletes.passport_athlete_id → athletes.id → athlete_tenant_links`. Implemented correctly in `app/api/v1/mcp/route.ts`. That is exactly why client writes to it are dangerous (D-34). | `phase0/RLS_IDENTITY_THREAT_MODEL.md` §3 |
| Do `auth.users` and `public.users` overlap? | **No — zero ids, zero emails, no bridging trigger.** The app authorises on `auth.users`; every RLS helper resolves through `public.users`. Every athlete-scoped policy therefore denies every row. Safe by disconnection, not by policy. | same, §1 |
| Does padding athlete codes to 5 or 6 digits avoid the legacy collision? | **No — padding is what creates it.** `migrateLegacyCode()` pads legacy 3-digit codes to exactly the issuer's 5-digit width. `ATHLETE_ID_SPEC.md` §3 and 0.3L §5.2 are both wrong on this. | `phase0/IDENTITY_R4_ANALYSIS.md` §1 |
| Can an authenticated user claim another athlete via `public.athletes`? | **Not today** — blocked at SQLSTATE 23503 by `athletes_user_id_fkey`. **Yes the moment a `public.users` row exists for them.** Proven in a rolled-back transaction. | `phase0/RLS_IDENTITY_THREAT_MODEL.md` §3.3 |
| Is `athlytica_core` exposed to clients? | **No.** No client role holds schema `USAGE`. The advisor lint does not cover it, so its absence from the advisor output is not evidence either way. | same, §6.1 |

---

## NEXT PHASE

> **Immediately: `git push origin main` (D-30a), then `pnpm verify:production`.**
> The CRM was committed as `307bacb` during 0.3L but not pushed. The chain
> repaired in 0.3K will carry it to production in ~45 seconds without further
> instruction. **Do not run `supabase migration repair` on the way (D-32).**
>
> **Then: D-33 and D-35.** Phase 0.4 execution ran 2026-08-15. **D-34 is
> CLOSED** — the `public.athletes` bridge is contained in production (M5), so
> the "close it before bridging `auth.users` → `public.users`" ordering
> constraint is now **satisfied**, and D-37 is free to proceed.
>
> **D-33 stopped**: Option B is contradicted by evidence and withdrawn;
> **B′ `ATH-YYYY-NNNN` is the revised recommendation**. **D-35 is blocked on
> `wsl --install` from an elevated prompt.** **M1 stays unapplied** — it has no
> namespace to design around until D-33, and no way to test concurrency until
> D-35.
>
> **Then Phase 0.4 — Identity + RLS Foundation.** Do not start before R4,
> D-01a and D-25 are answered; each changes what 0.4 builds. 0.4 does **not**
> need D-04, and it is the last phase that can proceed without it.
>
> Phase 1.0 (commercial) is running several layers ahead of Phase 0.4. That is
> survivable only while every PII table holds synthetic data — which is true
> today and stops being true the moment one family completes a payment. **0.4
> is not the next phase; it is the phase that is already late.**

---

## PHASE HISTORY

| Phase | Outcome | Production changes |
|---|---|---|
| **0** | Read-only audit. 4 documents. Canonical architecture, ID spec, metric registry v2, RLS matrix, decision register. | **none** |
| **0.1** | Parallel-work reconciliation, migration reconciliation, DQ-050 counterfactual, scoring eligibility framework, authoritative-source spec, master status. | **none** |
| **0.2** | `SGX7HQ2LM9` investigation, ID-issuer root cause, guardian fix verification, test run (142/142), test-data classification design. | **none** |
| **0.2b** | R1–R12 executed read-only (12/12 pass). Advisor's "fully exposed" claim disproved; containment script rewritten to grant nothing. | **none** |
| **0.3** | D-20 call graph + atomicity proof; D-23 gate trace + case-C gap; D-22 classification design. M1/M2/M3 staged. §4 stopped (no Docker). | **none** |
| **0.3-M2** | `record_classification` applied (`20260812083829`); 5 synthetic payments classified TEST. | **1 migration** |
| **0.3B-M3** | Payment replay integrity applied (`20260812122254`). Tested 19/19 pre-apply. Gate reset to `live=false`. | **1 migration + 1 gate row** |
| **0.3C** | Financial consumers migrated to `payment_events_production`; 4 regression guards (146/146). | **source only** |
| **0.3D** | Payment-adjacent path audit: 18 paths traced, F-1…F-5 found, three CRITICAL. 3 guards (149/149). | **none** |
| **0.3E** | **M4 authorization boundary applied** (`20260812172530`). Venture-constrained matching. F-1…F-5 fixed. 29/29 pre-apply, 164/164 app. | **1 migration + 3 routes + 1 service** |
| **0.3F** | Build repaired (`performance/route.ts` reverted — D-25). Non-payment creation doors audited. 171/171. | **none** |
| **0.3G** | D-26 closed: Google Forms = UNPAID/ADMINISTRATIVE; the 7 records proved **synthetic**. 178/178. | **none** |
| **0.3H** | **Google Forms retired** → `410 CHANNEL_RETIRED`. 5 creation doors → 4. 178/178, 21/21 mutations. | **none** |
| **0.3I–0.3J** | Detected that `main` was pushed and production was not running it. Raised **D-28**. | **none** |
| **0.3K** | **Deployment chain repaired.** `productionBranch` `master` → `main`. First Git-driven production deployment in the project's history. `pnpm verify:production` added. D-28 CLOSED. | **1 Vercel setting** |
| **0.4-exec** | **D-33 stopped (Option B contradicted: `character(9)` PK, public verify endpoint, Convex numeric counter — B′ recommended). D-34 CONTAINED and verified in production (M5). D-35 blocked — Docker installed but WSL is not, session not elevated. M1 unapplied: no namespace, no isolation.** | **1 migration** |
| **0.4** | **Identity + RLS foundation — analysis complete, stopped at the decision boundary.** Identity graph proven **severed** (`auth.users` ∩ `public.users` = ∅). D-01a re-graded **LATENT** and proven both ways in a rolled-back transaction (23503 blocked / succeeds once bridged). R4 re-stated: `migrateLegacyCode()` creates the collision. `jwt_athlete_ids()` found to union two incompatible key spaces. M1 designed, **not applied**. FORCE RLS preserved as an explicit gate, not claimed. D-33/34/35/36/37 raised; four 0.3L claims corrected. | **none — read-only; all writes rolled back** |
| **0.3L** | **Foundation consolidated.** Live state re-read and reconciled against documentation. Master roadmap + dependency graph established. D-16 quantified (37/36/5/30/1/2), D-25 partially resolved, D-29 resolved, D-30 closed by the CRM author mid-phase (`307bacb`); D-30a, D-31, D-32 and D-01a/b/c raised. Identity representations classified; R4 strategy recommended. | **none — read-only** |
