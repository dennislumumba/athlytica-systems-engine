# Athlytica — Master Roadmap

**Established:** Phase 0.3L, 2026-08-13.
**Authority:** this is the one roadmap. Where an older document implies a
different phase order, this supersedes it.

Live operational state is in [`ATHLYTICA_PROJECT_STATE.md`](ATHLYTICA_PROJECT_STATE.md).
Evidence for every status below is in
[`phase0/ATHLYTICA_FOUNDATION_0_3L_REPORT.md`](phase0/ATHLYTICA_FOUNDATION_0_3L_REPORT.md).
Ordering rationale is in [`ATHLYTICA_DEPENDENCY_GRAPH.md`](ATHLYTICA_DEPENDENCY_GRAPH.md).

## Status vocabulary

| | |
|---|---|
| **COMPLETE** | Objective met **and** verified against live state. Not "the code exists". |
| **IN PROGRESS** | Started, partially verified. |
| **READY** | Dependencies met; can start now. |
| **BLOCKED** | Cannot start — a named dependency or decision is missing. |
| **OWNER DECISION** | Waiting on a human choice, not on engineering. |
| **DEFERRED** | Deliberately not started; sequenced behind something else. |

> **The rule this vocabulary exists to enforce:** nothing is COMPLETE because
> code was written. Phase 0.3 spent four sub-phases proving that a verified
> repository and a running production system are different claims.

---

## At a glance

| Phase | Objective | Status |
|---|---|---|
| **0.1** | Architecture audit | **COMPLETE** |
| **0.2** | Data architecture | **COMPLETE** |
| **0.3** | Payment / security / deployment foundation | **COMPLETE** |
| **0.4** | Identity + RLS foundation | **IN PROGRESS** — D-34 contained ✅ · D-33 stopped (Option B contradicted) · D-35 blocked (no WSL) · M1 unapplied |
| **0.5** | Source-of-truth migration readiness | **BLOCKED** — D-04 |
| **0.6** | Staging migration | **DEFERRED** — behind 0.5 |
| **0.7** | Derived analytics | **BLOCKED** — D-09/10/11/12/14 |
| **0.8** | Athlete Passport | **DEFERRED** — behind 0.6 + 0.7 |
| **1.0** | Commercial / operational platform | **IN PROGRESS** — and running ahead of its foundation |

---

## PHASE 0.1 — Architecture audit

**Objective.** Establish what actually exists: schemas, tables, routes,
identity representations, and every place a record can be created.

**Status: COMPLETE.**

**Dependencies.** None.

**Blocking decisions.** None outstanding.

**Production risk.** None — read-only.

**Acceptance criteria — all met.**
- Every athlete-creation door enumerated (`BUILD_AND_CREATION_BOUNDARY_AUDIT.md`).
- Every payment-adjacent path enumerated (`PAYMENT_ADJACENT_PATH_AUDIT.md`).
- The five competing athlete representations named and their row counts read.

**Next action.** None. Findings feed 0.4.

> **Cost recorded:** this phase burned 4 permanent athlete identifiers
> (`scalable_id_sequence` 500 → 504) with zero athlete rows persisted, because
> the mint and the insert are separate round-trips (R15/D-20). The audit that
> found the fault also triggered it.

---

## PHASE 0.2 — Data architecture

**Objective.** Design the canonical athlete record, the identity layers, the
metric registry and the migration runbook — without building any of them.

**Status: COMPLETE** (as a design phase).

**Dependencies.** 0.1.

**Blocking decisions.** None to *complete* the design. D-04 blocks acting on it.

**Production risk.** None — documents only.

**Acceptance criteria — all met.**
- `CANONICAL_ATHLETE_ARCHITECTURE.md`, `ATHLETE_ID_SPEC.md`,
  `LEGACY_IDENTIFIER_MAPPING.md`, `ORGANIZATION_MEMBERSHIP_SPEC.md`,
  `DATA_LINEAGE_SPEC.md`, `METRIC_REGISTRY_V2.md`, `MIGRATION_RUNBOOK.md`,
  `RLS_POLICY_MATRIX.md`, `ROLLBACK_PLAN.md` all exist.
- Four identity layers specified: `athlete_uid` → `athlytica_id` → legacy
  ledger → organization membership.

**Next action.** None. 0.4 implements layers 1 and 2; 0.5 builds layer 3.

> **Two of the four layers do not exist in the database.** `athlytica_core.athletes`
> is empty, and no legacy identifier ledger has been built. Design ≠ schema.

---

## PHASE 0.3 — Payment / security / deployment foundation

**Objective.** Make money truthful, close the unauthorized creation doors, and
make "deployed" a verifiable claim.

**Status: COMPLETE.** Nine sub-phases, 0.3A–0.3L.

**Dependencies.** 0.1.

**Blocking decisions.** D-25 partially open (credentials, not code); D-26a,
D-26b, D-27, D-28a, D-28b open but non-blocking.

**Production risk.** **Realised and contained.** This phase found that
production had been running pre-0.3H code for a month and that no successful
production deployment had ever come from Git.

**Acceptance criteria — all met and verified live.**

| Sub-phase | Delivered | Verification |
|---|---|---|
| 0.3A–0.3B | Containment; RLS probes | 12/12 probes; `athlytica_core` unreachable by every client role |
| **0.3C** | Revenue reads production-classified receipts only | 3 consumers read `payment_events_production`; revenue = KES 0.00 |
| 0.3D | Payment-adjacent path audit | every path enumerated |
| **0.3E / M4** | Authorization boundary | applied `20260812172530`; 29/29 pre-apply |
| **0.3F** | Creation boundary | 5 doors → 4 |
| 0.3G | Google Forms enrolments proven synthetic | 7 records, all `test-` prefixed |
| **0.3H** | Google Forms retired | `410 CHANNEL_RETIRED` |
| 0.3I–0.3J | Deployment failure detected and raised as D-28 | 405 ≠ 410 discriminator |
| **0.3K** | Deployment chain repaired | `productionBranch` `master` → `main`; first Git-driven production deployment in project history |
| **0.3L** | Foundation consolidated | this roadmap |
| **M2** | Test/production classification | 5 events classified TEST |
| **M3** | Replay integrity | applied `20260812122254`; 19/19 |

**Next action.** None. Three residual owner decisions carry into 0.4 (see below).

> **What 0.3 did *not* do:** it did not make a real payment possible to
> verify. The M-Pesa rail is live — Safaricom accepted an STK push on
> 2026-08-12 19:28 UTC — but **production has never processed a real
> payment**, so M3's and M4's exception paths are unit-verified and
> production-unexercised.

---

## PHASE 0.4 — Identity + RLS foundation

**Objective.** Two things, in one phase because they are the same problem:
give the system one canonical athlete identity, and make the database deny by
default to everyone who is not entitled to a row.

**Status: IN PROGRESS.** Analysis complete 2026-08-13; stopped at the decision
boundary with **no production mutation**. Deliverables:
[`phase0/IDENTITY_R4_ANALYSIS.md`](phase0/IDENTITY_R4_ANALYSIS.md),
[`phase0/RLS_IDENTITY_THREAT_MODEL.md`](phase0/RLS_IDENTITY_THREAT_MODEL.md),
[`phase0/M1_DESIGN.md`](phase0/M1_DESIGN.md),
[`phase0/PHASE_0_4_IDENTITY_RLS_REPORT.md`](phase0/PHASE_0_4_IDENTITY_RLS_REPORT.md).

**What the analysis changed.** The identity graph is **severed**: `auth.users`
(4 rows, what the app authorises on) and `public.users` (8 rows, what every RLS
helper resolves through) have **zero overlap** and nothing bridges them, so
`jwt_athlete_ids()` and `jwt_tenant_ids()` return ∅ for every possible caller.
The database is safe by disconnection, not by policy — and **the repair and the
D-01a vulnerability are the same edit**. R4 was also mis-stated: the collision
is created by `migrateLegacyCode()` padding legacy codes to exactly the
issuer's width, not dissolved by padding.

**Execution run 2026-08-15.**
[`phase0/IDENTIFIER_NAMESPACE_DESIGN.md`](phase0/IDENTIFIER_NAMESPACE_DESIGN.md)
added. One migration applied: `20260814210328_m5_d01a_athletes_bridge_containment`.

| Decision | Status |
|---|---|
| **D-34** — D-01a containment | ✅ **CLOSED.** Applied and verified live: `authenticated` holds SELECT only on `public.athletes`, attacker blocked at **42501** *with the bridge present*, service-role and guardian paths intact. Containment, **not** "RLS complete". |
| **D-33** — identifier scheme | ✅ **APPROVED (Option C) · designed · tested · NOT APPLIED.** `ATH-NNNNN`, random from `ATH-10000`–`ATH-99999`, legacy reserve below. All contracts preserved. 10 rolled-back tests pass, including the saturation guard (`53100`) and PK authority (`23505`); sequence stays 504, so **R15 is structurally impossible**. Held in `supabase/migrations/pending/` — **gated on D-40**. |
| **D-40** — migration history | ✅ **RECONSTRUCTION PATH WORKING.** Baseline + 37 migrations replay from an empty database; `npx supabase start` completes. Verified against production — differs by **exactly the four `inventory_allocation_trigger` objects** and nothing else. Ledger rewrite itself still unresolved. |
| **D-41** — invalid historical migration | ✅ **CLOSED — superseded.** Moved to `migrations/superseded/` byte-identical, with a README giving the four reasons. `CREATE POLICY IF NOT EXISTS` ×5 is invalid in every PostgreSQL version; its named policies exist nowhere in production; the live ones are `sec001`'s. No `migration repair`; production's ledger row untouched. |
| **D-35** — isolated Postgres | ✅ **ENVIRONMENT NOW AVAILABLE.** Docker 29.7.2 is running and `npx supabase start` executes. The FORCE RLS matrix becomes runnable once the replay completes (D-41). |
| **D-35** — isolated Postgres | ⛔ **BLOCKED.** Docker Desktop installed; **cannot start because WSL is not installed** and this session is not elevated. Operator checklist and the 17-case FORCE RLS matrix: [`phase0/D35_ISOLATED_ENVIRONMENT_RUNBOOK.md`](phase0/D35_ISOLATED_ENVIRONMENT_RUNBOOK.md). Highest risk is case 9 — FORCE on `registrations` plausibly breaks settlement, so **D-01b must be resolved first**. |
| **D-38** — Vercel guard | ⛔ **BLIND.** CLI token expired; `pnpm verify:production` exits 403 before probing. Chain verified healthy by direct HTTP instead. Owner: `npx vercel login`. |
| **M1** | ⛔ **UNAPPLIED, not redesigned.** No namespace to design around until D-33; no second session to test concurrency until D-35. |

**Dependencies.**
- 0.1 (creation doors known) — met.
- 0.2 (identity design) — met.
- 0.3K (a deploy that reaches production) — met, and load-bearing: an RLS
  change that ships to Preview only is worse than no change, because it looks
  applied.
- **Not** dependent on D-04. This is the last phase that can proceed without it.

**Blocking decisions — all three are OWNER DECISION.**

| ID | Question | Why it changes the work |
|---|---|---|
| **D-33** (R4) | Which identifier scheme? **A** continue from 639 · **B** `ATH-YYYY-XXXXXX` non-sequential *(recommended)* · **C** six-digit padded · **D** defer | Determines the issuer contract, which is M1's contract. B also removes M1's row lock. Both target tables are empty, so this is the cheapest it will ever be. |
| **D-34** (D-01a) | Close the `public.athletes` bridge now as ordinary work *(recommended)*, as an emergency, or after identity resolution? | Zero application flow writes that table (verified). It **must** land before anything bridges `auth.users` → `public.users`, because that bridge is what arms the exploit. |
| **D-35** | Provide an isolated Postgres (Docker, or a paid Supabase branch)? | `FORCE RLS` and M1 concurrency/rollback are both blocked on it. **0.4 cannot complete without it.** Open since Phase 0.3 §4 was stopped for the same reason. |
| **D-25** | Delete the five unused production `MPESA_*` credentials? | Live M-Pesa credentials with no consumer. Not part of 0.4 proper, but the last cheap moment to close it. |

**Production risk: HIGH — the highest of any phase in this plan.**

- RLS applied wrongly locks out `service_role` paths and takes down checkout.
- RLS applied *permissively* (granting `USAGE`/`SELECT` to reach "policy-filtered
  access") **weakens** current security. R17 records exactly this: the original
  containment script would have converted "no access" into "filtered access".
- The mitigating fact: **the CRM tables are empty and no real athlete or
  guardian row exists.** Every PII table in scope holds synthetic or demo data.
  This is the cheapest this phase will ever be. It gets more expensive on the
  day the first family pays.

**Acceptance criteria.**

1. `athlytica_core` has RLS + `FORCE RLS` and **no new grants**. A posture
   assertion in the migration proves grants did not widen.
2. `public.athletes.self_identity_policy` no longer permits a client to set
   `passport_athlete_id` to an athlete they cannot already see (D-01a). A
   negative test proves the old attack fails.
3. `tenant_isolation_policy` on `registrations`, `performance_logs`,
   `cohort_telemetry`, `scouting_metric_log` is removed or restricted — no
   `FOR ALL` policy applied to PUBLIC survives on the money path (D-01b).
4. `FORCE RLS` on every table holding PII or money (D-01c) — **gated: the
   FORCE RLS acceptance gate in the threat model §6 must be discharged in an
   isolated Postgres first, and `tenant_isolation_policy` (item 3) must be
   dropped before `FORCE` reaches `registrations`, or settlement breaks.**
5. `crm_*` tables carry explicit policies **before** they hold a contact.
6. `generate_legacy_claim_token` gets a pinned `search_path`.
7. Canonical identity: `athlytica_core.athletes` gains `athlete_uid` and
   `athlytica_id`; the new issuer is atomic (M1/D-20) **and** collision-free
   (R4). Both, or neither — an atomic issuer pointed at 504 atomically issues a
   colliding identifier.
8. The three legacy issuers are revoked, not merely unused.
9. Every change is applied with a tested rollback, verified in a rolled-back
   transaction first — the M2/M3/M4 discipline.
10. `pnpm verify:production` passes after the deploy, and checkout still works:
    a live STK push is accepted.

11. `jwt_athlete_ids()` resolves one key space, not two. Branch 2 currently
    emits app-plane ids into passport-plane policies and matches nothing.

**Next action.** **Answer D-33, D-34, D-35.** Then, in order: the R4 migration
(new issuer, legacy issuers revoked), the D-01a containment (items 1–4 of the
minimum set, one small migration, mutation-tested per item), install the
isolated environment, discharge the FORCE RLS gate, and only then apply M1.

---

## PHASE 0.5 — Source-of-truth migration readiness

**Objective.** Turn 23 `SOURCE_CANDIDATE` CSVs into one authoritative,
resolved, provenance-carrying dataset that is *ready* to import — without
importing it.

**Status: BLOCKED.**

**Dependencies.** 0.4 (identity layers must exist before records can be
resolved onto them). And **D-04**, which is not engineering.

**Blocking decisions.**

| ID | Needed |
|---|---|
| **D-04** | **The authoritative 16-tab export.** Gates everything below it. |
| D-02 | `ATH-047` collision |
| D-03 | What `Foundational Skating` means (1,669 rows) |
| D-06 | Bare first-name attribution (`eli` → Eli Das, but Eli Araka exists) |
| D-07 | The 109 unassigned rows |
| D-08 | `Kids Group` as an entity |
| D-11 | Age tiers **and DOB capture** — DOB is collected nowhere |
| D-13 | NRHL name; conference/team conflict |

**Production risk: LOW while blocked** — nothing is written. The risk is
*starting anyway*: resolving identities against a non-authoritative file
produces a canonical dataset that is confidently wrong, and §5.2's ordering
constraint means IDs issued against it become permanent.

**Acceptance criteria.**
1. **One** file per domain declared authoritative, by the owner, in writing.
   The `2021.csv` (93 rows) vs `2021(1).csv` (1,020 rows) contradiction is
   resolved (R6).
2. Every one of the ~209 athlete IDs resolves to exactly one person, or is
   explicitly parked.
3. Every contested identity (D-02, D-06, `ATH-620` Johari Keige / Tyler) has a
   recorded ruling and its evidence.
4. The legacy identifier ledger exists as a schema, scheme-qualified: a
   `legacy_biif` `ATH-500` and a `legacy_nrhl` `ATH-500` may be different people.
5. Every row carries provenance back to a named source file and tab.
6. A dry run reports counts and conflicts and **writes nothing**.

**Next action.** **Ask the owner for the 16-tab export.** Nothing else in this
phase can start, and no amount of engineering substitutes for it.

---

## PHASE 0.6 — Staging migration

**Objective.** Load the resolved dataset into a staging environment, issue
`athlytica_id`s, and prove the result before production sees it.

**Status: DEFERRED** — behind 0.5.

**Dependencies.** 0.4 (identity + RLS), 0.5 (resolved dataset).

**Blocking decisions.** D-05 (retire `normalize-legacy-ids.js`), plus every
0.5 decision carried forward.

**Production risk: MEDIUM.** The migration itself is staging-only. The risk is
the **ordering constraint**: IDs are issued only after resolution completes.
Issuing early gives a duplicated person two permanent identifiers and makes the
duplication canonical. Assignment must be in **randomised order** — legacy-ordered
assignment makes `ATH-000003` leak that its holder is an early registrant.

**Acceptance criteria.**
1. Staging holds every resolved athlete with an `athlytica_id`, assigned in
   randomised order.
2. Row counts reconcile to 0.5's dry run exactly.
3. No legacy code is a primary key anywhere; all live in the ledger as claims.
4. RLS holds in staging under adversarial probes — including the D-01a attack.
5. The rollback has been executed in staging, not merely written.

**Next action.** Blocked. Do not start.

---

## PHASE 0.7 — Derived analytics

**Objective.** Make every derived metric reproducible from stored inputs.

**Status: BLOCKED** — on decisions, not on data.

**Dependencies.** 0.6 for real data; the *definitions* can be settled in
parallel and should be (see the dependency graph).

**Blocking decisions.** D-09 (compliance threshold), D-10 (`technical_rating`
direction and normalisation), D-11 (**DOB**), D-12 (unknown 2026 derivations),
D-14 (`Session_Load` formula).

**Production risk: LOW** — nothing here is customer-facing yet.

**Acceptance criteria.**
1. Registry v2 reaches **0 UNKNOWN**. Today: 27 VERIFIED / 2 INFERRED / 4
   UNKNOWN / 1 DEPRECATED.
2. The three unreproducible formulas — compliance %, Speed/Power score,
   `Session_Load` — reproduce from stored inputs or are formally deprecated (R11).
3. `observed_at` is trustworthy on every metric row. A metric without a
   trustworthy timestamp cannot be trended, and trending is the product.
4. Every derived value is recomputable from raw inputs; none is stored as the
   only copy of its own truth.

> **DOB is the hard dependency.** 19 of 27 verified cognitive metrics are
> unscorable without it, and DOB is collected nowhere in the system (R9). This
> is a *product* gap, not a data gap — no import fixes it.

**Next action.** Blocked on data; **the five metric decisions can be settled
now** and should be, because they need the owner rather than the dataset.

---

## PHASE 0.8 — Athlete Passport

**Objective.** The longitudinal athlete record — the thing the whole system
exists to produce.

**Status: DEFERRED.**

**Dependencies.** 0.6 (real athletes), 0.7 (trustworthy metrics), 0.4 (RLS —
the passport is the single most PII-dense surface in the product).

**Blocking decisions.** D-17, D-18, D-19 (exposure qualification, minimum
thresholds, non-participant treatment in composites).

**Production risk: HIGH when it ships.** `NRHL-COMP-v1` reproduces exactly and
is **structurally unsafe** (DQ-050). `nrhl_athlete` is empty so nothing is
issued today, and a freeze is recommended until D-17/18/19 are settled. A
certificate is a claim about a child that a family keeps.

**Acceptance criteria.**
1. `NRHL-COMP-v1` is either fixed or formally retired — not silently reissued.
2. Every passport figure traces to a metric with known provenance and a
   trustworthy `observed_at`.
3. A guardian sees their own child and no one else's — proven by adversarial
   probe, not by policy inspection.
4. Nothing is issued to an athlete whose identity is unresolved.

**Next action.** Blocked. Keep the certificate freeze.

---

## PHASE 1.0 — Commercial / operational platform

**Objective.** Sell, enrol, collect, and run the ventures: `/register`,
checkout, the CRM, the workspace dashboards, the parent portal.

**Status: IN PROGRESS — and this is the one genuine sequencing problem in the plan.**

**Dependencies (in theory).** All of Phase 0.
**Dependencies (in practice).** It shipped first. `/register` is live, the
M-Pesa rail works, three families hold open registrations, and a CRM schema is
applied to production.

**Blocking decisions.** **D-30a — push the CRM.** (D-30, committing it, closed
during Phase 0.3L: the author committed all 23 files as `307bacb`.)

**Production risk: LIVE, TODAY.**
- The CRM is committed but **not pushed** — `main` is ahead of `origin/main`
  by 1. 5,197 lines of application code for an already-applied production
  schema exist on one machine. One `git push` closes it.
- **D-32:** `307bacb`'s message announces `supabase pull`. With 30 of 37 local
  migration versions mismatched, the CLI will recommend
  `supabase migration repair`, which **writes to the remote migration history**
  — the only accurate record of what has been applied. Do not run it until
  D-16 is decided.
- The CRM will hold parent and prospect PII. Its tables have RLS enabled, **zero
  policies**, and no `FORCE RLS`. They are safe today only because they are
  empty and ungranted.
- `/api/v1/workspace/dashboard` remains **all-or-nothing** to any grant holder.
  The CRM deliberately does not ride on it — that is correct, and it must stay
  that way.

**Acceptance criteria for calling 1.0 stable.**
1. Every line of shipped commercial code is committed, deployed, and verified by
   `pnpm verify:production`.
2. Every table holding customer PII has explicit RLS policies and `FORCE RLS`.
3. One real payment has settled end-to-end and been classified PRODUCTION —
   this has **never happened**.
4. Booked ≠ collected is enforced in the data, not only in a comment: `wonKes`
   from `crm_opportunity.stage`, `collectedKes` from `payment_events_production`
   only.
5. No self-service flow can auto-grant a `workspace_roles` row.

**Next action.** **Push `307bacb` and verify it reached production.** Then hold
new commercial features until 0.4 lands, because everything 1.0 adds from here
increases the amount of PII sitting behind an RLS posture that has not been
closed.

---

## The one rule this roadmap encodes

> **Phase 1.0 is running ahead of Phase 0.4.** Commercial surface is being
> built on an identity layer that does not exist and an RLS posture with a
> known escalation path. That is survivable *only* while every PII table holds
> synthetic data — which is true today and stops being true the moment the
> first family completes a payment.
>
> Phase 0.4 is not the phase after this one. It is the phase that is already
> late.
