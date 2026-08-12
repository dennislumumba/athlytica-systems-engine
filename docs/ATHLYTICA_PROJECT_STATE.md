# ATHLYTICA — PROJECT STATE

**This is the durable context file. Read it first. Update it after every phase.**

A future session should be able to continue from this document plus the
repository, without any prior conversation.

---

## LAST VERIFIED

| | |
|---|---|
| **Timestamp** | 2026-08-12 (Phase 0.2) |
| **Commit** | `0441e0c` — *feat(bigice): a Big Ice checkout that sells Big Ice, to one family at a time* |
| **Working tree** | clean except `next-env.d.ts` (generated) and untracked `docs/` |
| **Supabase project** | `qxfrypvevjsyzkquewxh` |
| **Applied migrations** | 31 |
| **Local migration files** | 32 |
| **Test suite** | `node --test "tests/**/*.test.mts"` → **142 pass / 0 fail** |

### Row counts (read-only verification)

| Table | Rows |
|---|---|
| `public.athlete` | 13 (7 `Test Athlete` duplicates + 6 TTA demo) |
| `public.athletes` | 6 |
| `athlytica_core.athletes` | **0** |
| `athlytica_core.parents` | **0** |
| `bigice_athlete` | **0** |
| `bigice_enrollment` | **0** |
| `bigice_document` | **0** |
| `nrhl_athlete` | **0** |
| `registrations` | 1 |
| `payment_events` | 5 |
| `gate_states` | 1 |
| `onboarding_funnel_events` | 0 |
| `athlytica_core.scalable_id_sequence.current_value` | **504** |

---

## CURRENT SYSTEM STATE

| Area | Status |
|---|---|
| **Production** | Live. Deploys from `main`. Vercel. |
| **Database** | Healthy. No corruption found. No canonical schema built yet. |
| **Canonical athlete** | **DOES NOT EXIST.** Designed only (`docs/phase0/CANONICAL_ATHLETE_ARCHITECTURE.md`). Five tables could still claim to be "the athlete". |
| **Athlete ID sequence** | `scalable_id_sequence = 504`. Moved 500 → 504 during Phase 0.1 with **zero athlete rows persisted** — 4 codes burned. Root cause found (see R15). New canonical `athlytica_id_seq` **not created**. |
| **RLS** | Still **disabled** on all 4 `athlytica_core` tables, and advisor `rls_disabled` still red — but **R1–R12 executed 2026-08-12 and the exposure it warns about does not exist**: every client role is denied at the schema level. 12 probes run, 12 pass. R4–R8 blocked because the canonical tables they test **do not exist yet** (Phase 1), not because of the environment. Containment script rewritten to add RLS without adding grants. See `phase0/RLS_TEST_RESULTS.md`. |
| **Payments** | 5 `payment_events`, all `SETTLED_UNMATCHED` — **none matches any registration**. 4 are synthetic (`AUDITTEST00n`); 1 (`SGX7HQ2LM9`) is **UNRESOLVED**. Table is append-only by trigger. |
| **Registration** | 1 row: `ATH-9YWQ`, NRHL, `combine_27500`, athlete "Adonis", still `PENDING_PAYMENT`, STK pushed 2026-08-11 19:10. |
| **Guardian** | `likeEscape` authorization fix **committed to `main`** (`0441e0c`). Unit-tested. **Not integration-tested against a database.** |
| **Onboarding** | Big Ice path live (`lib/services/bigice-onboarding.ts`). NRHL path live (`app/api/v1/workspaces/nrhl/onboard-paid-athlete`). **Both mint an athlete code outside the insert transaction** — see R15. |
| **Portal** | `resolveGuardian()` reads `bigice_athlete` by `guardian_email` ILIKE. 0 rows, so no exposure today. |
| **Migration state** | **Zero local versions match applied versions** (31 applied / 32 files). Cause: `apply_migration` stamps `to_char(current_timestamp,…)`. `supabase db push` **must not be run**. |
| **Legacy data** | **Nothing migrated.** ~3,096 session rows, 209 athlete IDs across 23 `SOURCE_CANDIDATE` CSVs. No file is authoritative. |
| **Metrics** | Registry v2: 27 VERIFIED / 2 INFERRED / 4 UNKNOWN / 1 DEPRECATED. **Not finalised** — 5 blockers. |
| **Certificates** | `NRHL-COMP-v1` reproduces exactly, but is **structurally unsafe** (DQ-050). `nrhl_athlete` is empty, so nothing is issued from the system. Freeze recommended. |

---

## ACTIVE RISKS

| ID | Description | Sev | Evidence | Mitigation now | Decision | Status |
|---|---|---|---|---|---|---|
| **R1** | Parent-portal cross-household leak via ILIKE wildcard | CRITICAL | `audit-parent-_@example.test` returned 3 athletes across 2 families | **FIXED** in `0441e0c`, unit-tested | — | **MITIGATED (unit only)** |
| ~~R2~~ | ~~`athlytica_core` fully exposed to anon~~ | **DOWNGRADED to LOW** | **R1–R12 executed 2026-08-12: every client role DENIED at schema level.** `anon`/`authenticated`/`service_role` all lack USAGE on `athlytica_core`; only `postgres` holds privileges. The advisor checks `relrowsecurity` and not reachability — **its "fully exposed" claim is false for this project.** | deny-by-absence of grants (stronger than RLS) | D-01 (now defence-in-depth only) | **RESOLVED — was never exposed** |
| **R3** | `onboard-paid-athlete` mints a colliding ID; writes guardian PII via definer RPC | **HIGH** (was CRITICAL) | route calls `link_guardian` + `nrhl_next_athlete_code`. PII exposure component is void (R2), the **ID collision component stands** | none — route ungated | D-06/D-20 | **OPEN** |
| **R17** | Containment script would have **weakened** security | — | original `0001_rls_containment.sql` granted `usage`+`select` to `authenticated`, converting "no access" into "policy-filtered access" | **script rewritten 2026-08-12**: enables RLS+FORCE, grants nothing, adds a posture assertion | — | **FIXED** |
| **R4** | ID sequence at 504 collides with legacy `ATH-500`–`ATH-638` | CRITICAL | corpus max 638; issuer pads to 5 digits | contained only by not issuing | D-06 | **OPEN** |
| **R15** | **Athlete code minted outside the insert transaction** | CRITICAL | `bigice-onboarding.ts:190` RPC then `:200` insert, two round-trips, no transaction. Seq +4, rows 0. | none | D-20 | **OPEN** |
| ~~R13~~ | ~~`SGX7HQ2LM9` real-or-test undetermined~~ | — | **Owner checked the Safaricom statement 2026-08-12: receipt is ABSENT. It was the founder's own test.** | — | D-21 **CLOSED** | **RESOLVED — no customer impact** |
| **R14** | **All 5** payment events are synthetic and permanent in an append-only table | HIGH | `AUDITTEST001-004` + `SGX7HQ2LM9`; 658,000 KES of fake settlements; DELETE blocked by trigger | none | D-22 | **OPEN — scope widened** |
| **R16** | **`G-W6-PAY` gate is live on synthetic evidence** | **HIGH** | `gate_states`: `live=true`, `evidence='AUDITTEST001'`. It is the **root of the NRHL critical path** (`dependsOn: null`); `G-W5-REG` depends on it and `assertDraftEngineUnblocked()` hard-blocks on it. Its KPI — *"First validated M-Pesa settlement event"* — is recorded as met and has never occurred. `settle_payment_transaction` uses `on conflict (gate_id) do nothing`, so a **real** settlement will never overwrite the test evidence. | none | D-23 | **OPEN** |
| **R5** | `supabase db push` would replay 32 migrations, halt on the 6th | HIGH | 0/32 version matches | standing prohibition | D-16 | **OPEN** |
| **R6** | Migrating from a `SOURCE_CANDIDATE` file | HIGH | `2021.csv` 93 rows vs `2021(1).csv` 1,020 | migration blocked | D-04 | **OPEN** |
| **R7** | `bigice_academy_name_parity` applied with no local file | HIGH | applied `20260811012454`, no source | none | D-16 | **OPEN** |
| **R8** | Certificates from a structurally flawed composite | HIGH | DQ-050 | freeze recommended | D-17/18/19 | **OPEN** |
| **R9** | 19 of 27 verified cognitive metrics unscorable — no DOB | HIGH | DOB collected nowhere | none | D-11 | **OPEN** |
| **R10** | Bare-name attribution (`eli` → Eli Das; Eli Araka exists) | HIGH | `nrhl-etl.ts` NAME_ALIASES | not run on production data | D-06 | **OPEN** |
| **R11** | 3 derived formulas unreproducible | MEDIUM | compliance %, Speed/Power score, Session_Load | blocks Phase 9 | D-09/12/14 | **OPEN** |
| **R12** | Phone-enumeration oracle via `link_guardian()` | MEDIUM | `ON CONFLICT … RETURNING parent_id` | none | DQ-048 | **OPEN** |

---

## CURRENT DECISIONS

**Approved: none.** No decision in the register has been marked approved.

| ID | Decision | Status |
|---|---|---|
| D-01 | Apply RLS containment | OPEN |
| D-02 | Resolve `ATH-047` collision | OPEN |
| D-03 | `Foundational Skating` treatment | OPEN |
| D-04 | Authoritative source export | OPEN — **gates everything** |
| D-05 | Retire `normalize-legacy-ids.js` | OPEN |
| D-06 | Bare first-name attribution | OPEN |
| D-07 | 109 unassigned rows | OPEN |
| D-08 | `Kids Group` entity | OPEN |
| D-09 | Compliance threshold | OPEN |
| D-10 | `technical_rating` normalisation | OPEN |
| D-11 | Age tiers + DOB capture | OPEN |
| D-12 | Unknown 2026 derivations | OPEN |
| D-13 | NRHL name; conference/team conflict | OPEN |
| D-14 | `Session_Load` formula | OPEN |
| D-15 | Founder-identity hardcoding | OPEN |
| D-16 | Migration version drift | OPEN |
| D-17 | Exposure qualification retroactive? | OPEN |
| D-18 | Minimum exposure thresholds | OPEN |
| D-19 | Non-participant treatment | OPEN |
| **D-20** | **Transactional athlete creation + ID issuance** (new, Phase 0.2) | OPEN |
| **D-21** | ~~Is `SGX7HQ2LM9` a real customer payment?~~ | **CLOSED 2026-08-12 — NO. Absent from the Safaricom statement; founder's own test. All 5 payment events are synthetic.** |
| **D-22** | **Test/production data classification mechanism** (new, Phase 0.2) | OPEN — now covers all 5 events |
| **D-23** | **Correct `G-W6-PAY`, which is live on synthetic evidence** (new) | OPEN |
| **OPS-1** | Approve billable Supabase branch for RLS testing | OPEN — **now the top blocker** |

---

## CURRENT BLOCKERS

What prevents Phase 1, in order of what unblocks the most:

1. **D-04 — no authoritative source.** All 23 local CSVs are `SOURCE_CANDIDATE`. Four workbook tabs are missing locally, including `Certificate Tracker`. **Nothing may be migrated until a fresh 16-tab export exists.**
2. **OPS-1 / D-01 — RLS untested.** No isolated environment exists. `list_branches` returns empty. Creating one is billable and **has not been done**. 0 of 12 RLS tests have run.
3. **D-20 — ID issuance is not transactional.** Demonstrated: 4 codes burned, 0 athletes. Building canonical athletes on this pattern would produce orphans permanently.
4. **D-21 — an unreconciled payment.** Cannot be resolved from the database; needs the M-Pesa statement.
5. **D-16 — migration ledger drift.** No reproducible schema baseline.
6. **D-11 — no DOB.** 19 verified metrics unscorable.

**Migration gates: 1 of 20 complete, 1 partial, 18 open.**

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
| Is DQ-050 caused by discipline? | **No — by exposure.** All 16 zero-point athletes have `games_played = 0`. Segmenting by discipline would not fix it. | `DQ050_CERTIFICATE_IMPACT.md` §2 |
| Can DQ-050 tiers be recomputed? | **No** — `Certificate Tracker` absent locally; coach grade known for 5 of 18 | same, §5 |
| Why do migration versions differ? | `apply_migration` stamps `to_char(current_timestamp,'YYYYMMDDHH24MISS')` — confirmed verbatim in postgres logs | `MIGRATION_RECONCILIATION.md` §2 |
| Is the local settlement migration applied? | **Yes** — live function contains `stk_pushed_at desc nulls last` | same |
| Where do metric protocols live? | Riverside capture sheet + Performance ID PDFs + dossier §2.5/§2.8. **Not in the repo.** | `METRIC_REGISTRY_V2.md` §2 |
| What is the authoritative legacy source? | Google Sheet `Athlytica Data`, id `1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss`, 16 tabs | `AUTHORITATIVE_SOURCE_EXPORT_SPEC.md` |
| Does `gviz` fail on a bad tab name? | **No — it silently returns the first tab.** Must assert on a known column. | same, §3 |
| Can the msisdn be recovered from the hash? | **No** — HMAC-SHA256 with `MSISDN_HASH_KEY`. Do not attempt; it would de-anonymise a minor's guardian. | `utils/msisdn.ts` |
| Did `link_guardian` run 10× at runtime? | **No** — those log hits are migration DDL text, not invocations. `athlytica_core.parents` = 0. | Phase 0.2 §1 |
| Why did the sequence move 500→504? | `bigice-onboarding.ts:190` mints via RPC, `:200` inserts separately. No transaction. | Phase 0.2 §2 |

---

## NEXT ACTION

> **Install Docker Desktop, then `npx supabase start` — to verify the one
> genuinely unverified behaviour: does `FORCE ROW LEVEL SECURITY` break the
> `SECURITY DEFINER` onboarding path?**
>
> ```
> winget install -e --id Docker.DockerDesktop
> ```

R1–R12 are **done** — executed 2026-08-12 against production, read-only, 12/12
pass, zero cost, no branch created. OPS-1 was resolved without spending anything:
the org is on the **free** plan (branching needs Pro, ~$25/mo + $0.01344/hr), and
the owner chose the local Docker route.

Critically, **a branch would not have unblocked R4–R8 anyway** — those test
`parent_athlete_link`, `observation` and the canonical `athlete` table, none of
which exists. A branch applies the same 31 migrations as production, so it would
have had the same schema. The blocker was never the environment.

The local stack is still wanted, for Phase 1: migration dry runs (gate 18),
rollback tests (gate 17), R11 (`link_guardian` writes a row), R12 (needs HTTP),
and the `FORCE ROW LEVEL SECURITY` check above.

D-21 closed on 2026-08-12: the owner checked the Safaricom statement and
`SGX7HQ2LM9` is **not on it**. It was the founder's own test. No customer is
owed anything, and there is no outstanding operational incident.

That resolution has a wider consequence: **all five `payment_events` are
synthetic, so production has never processed a real payment.** Combined with
zero athlete rows, zero guardian rows and zero enrollments, **the system has
never held real customer data.** Every "empty table, zero blast radius"
statement in these documents is now fully confirmed across the payment plane
too — and the containment window is entirely open.

RLS is therefore the correct next move: it is the last critical finding that can
be closed *before* any real data exists, and it is blocked only on an
environment decision.

---

## PHASE HISTORY

| Phase | Outcome | Production changes |
|---|---|---|
| **0** | Read-only audit. 4 documents. Canonical architecture, ID spec, metric registry v2, RLS matrix, decision register. | **none** |
| **0.1** | Parallel-work reconciliation, migration reconciliation, DQ-050 counterfactual, scoring eligibility framework, authoritative-source spec, master status. | **none** |
| **0.2** | `SGX7HQ2LM9` investigation, ID-issuer root cause, guardian fix verification, test run (142/142), test-data classification design. | **none** |
