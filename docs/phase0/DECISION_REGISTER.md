# Decision Register — Phase 0

**Owner of every open decision: Dennis (founder).**
**Date:** 2026-08-12
**Status key:** `OPEN` · `APPROVED` · `REJECTED` · `SUPERSEDED`

**Status as of Phase 0.3C:** four decisions are closed — **D-21, D-22, D-23,
OPS-1** (see the post-Phase-0 section at the end). Every decision in the
numbered list below remains **OPEN**, and nothing has been implemented on the
assumption that any of them will go a particular way.

⚠ **D-01's premise below is now known to be wrong.** It was written from the
Supabase advisor's `rls_disabled` message. R1–R12 were executed on 2026-08-12
and found `anon`, `authenticated` **and** `service_role` are all denied at the
schema level on `athlytica_core` — the "fully exposed to the anon key" claim is
false for this project. The decision is retained verbatim for provenance; read
`RLS_TEST_RESULTS.md` before acting on it.

---

| ID | Decision | Status | Blocks |
|---|---|---|---|
| D-01 | Apply RLS containment to `athlytica_core` | **OPEN** | Phase 0.4, Phase 1 |
| D-02 | Resolve the `ATH-047` collision | **OPEN** | Phase 5 |
| D-03 | What `Foundational Skating` means | **OPEN** | Phase 7 (1,669 rows) |
| D-04 | Authoritative source files | **OPEN** | **everything** |
| D-05 | Retire `normalize-legacy-ids.js` | **OPEN** | Phase 6 |
| D-06 | Bare first-name attribution | **OPEN** | Phase 5 |
| D-07 | The 109 unassigned rows | **OPEN** | Phase 7 |
| D-08 | `Kids Group` as an entity | **OPEN** | Phase 5 |
| D-09 | Technical-compliance threshold | **OPEN** | Phase 9 |
| D-10 | `technical_rating` direction and normalisation | **OPEN** | Phase 9 |
| D-11 | Age-tier vocabulary and DOB capture | **OPEN** | Phase 7, 9 |
| D-12 | Unknown 2026 derivations | **OPEN** | Phase 9 |
| D-13 | NRHL name; conference/team conflict | **OPEN** | Phase 10 |
| D-14 | `Session_Load` formula | **OPEN** | Phase 9 |
| D-15 | Founder-identity hardcoding | **OPEN** | Phase 11 |

---

### D-01 · Apply RLS containment to `athlytica_core`

**Decision.** Enable RLS + founder-read policies on the four `athlytica_core`
tables, in production.

**Why it matters.** Supabase advisor `rls_disabled`, priority 1, critical:
these tables are readable and writable by anyone holding the anon key.
`parents` is designed to hold guardian phone numbers; `athletes` holds a
`birth_certificate_hash UNIQUE NOT NULL` for minors — and a UNIQUE index on a
hash is a membership oracle. `scalable_id_sequence` is anon-writable, so ID
issuance can be skewed or exhausted.

**Architectural consequence.** None to the model — this is pure containment.
The consequence of *not* doing it is that the first real registration writes
guardian PII into a world-readable table.

| Option | Consequence |
|---|---|
| **A. Apply now, on a branch first (recommended)** | Zero blast radius: all four tables are empty. Closes a critical finding before it can matter. |
| B. Defer until Phase 1 | Every day of registration traffic is a day of exposure. |
| C. Do not enable | Advisor stays critical; cannot onboard a second organization. |

**Recommended: A.** The scripts self-abort if the tables are no longer empty or
the sequence has moved, so applying is safe even if the situation has changed
since the audit.

**Risk if wrong:** low. `service_role` and the four `SECURITY DEFINER`
functions bypass RLS, so the write path is unaffected. Rollback is one script
and touches no data.

---

### D-02 · Resolve the `ATH-047` collision

**Decision.** `ATH-047` is bound to two children. Which one keeps it?

```
Sam Inoue       → ATH-041 (10 sessions), ATH-047 (1 session, 2026)
Shirley Makena  → ATH-047 (2025, Figure Skating), ATH-598
```

**Why it matters.** One session of Sam's performance data is currently filed
under another child's identity. Any longitudinal view of either child is wrong
until this is settled.

| Option | Consequence |
|---|---|
| **A. Refile Sam's session under `ATH-041`; `ATH-047` → Shirley only (recommended)** | Uses Sam's own existing ID. No new code minted. This is the dossier's position. |
| B. Keep the current `nrhl-etl.ts` behaviour (reissue Sam from the sequence) | Sam ends with three identifiers, and the new one is drawn from the 500-block that collides with legacy IDs. |
| C. Defer — load both as contested | Honest, but every per-athlete count stays wrong until resolved. |

**Recommended: A.** Sam already has `ATH-041`. Minting a third code for someone
who has two is strictly worse than using the one that is his.

Either way both claims stay in the ledger with `is_contested = true`.

**Risk if wrong:** medium — misattributed performance data for two children.
The same review should cover the other seven contested IDs, especially
`ATH-014` (Sofia Araka / Sofia Mulani), which is genuinely undecidable from
data.

---

### D-03 · What does `Foundational Skating` mean?

**Decision.** 1,669 rows — 54% of the BIIF corpus, the single largest
discipline value — do not state ice or inline.

**Why it matters.** Surface determines benchmark, dimension applicability and
composite. A wrong surface silently invalidates every comparison built on it.

| Option | Consequence |
|---|---|
| **A. `discipline = UNKNOWN`, `source_label` preserved, `surface = unknown` (recommended)** | Truthful. Reclassifiable later without re-reading CSVs. Benchmarks must tolerate a surface-agnostic discipline. |
| B. Infer from `Location` where possible; A for the residue | Best fidelity, most work. Produces `INFERRED` confidence, never `VERIFIED`. |
| C. Assign to inline (the dominant BIIF activity) | Fabricates a surface for 1,669 rows. **Violates the directive.** |

**Recommended: A now, B as a follow-up.** Never C.

**Risk if wrong:** high — it is the largest single block of BIIF history.

---

### D-04 · Which source files are authoritative?

**Decision.** How to resolve 23 local CSV copies, 8 pairs of which diverge.

**Why it matters.** `2021.csv` has 93 rows; `2021(1).csv` has 1,020 — an 11×
difference. Six 2026 variants differ. `Athlete Progress.csv` and `(1).csv` are
the same byte length with different MD5s. Four tabs are missing locally
entirely, including `Certificate Tracker`, which holds `NRHL-COMP-v1` and the
certificate tiers.

| Option | Consequence |
|---|---|
| **A. One fresh export of all 16 tabs from the live workbook (recommended)** | Resolves the whole class in one action. Every file gets one known timestamp. ~20 minutes. |
| B. Founder names the authoritative copy per year | Works, but 15 separate judgements and it does not recover the 4 missing tabs. |
| C. Take the largest copy per year | Assumes bigger = newer. `2026(5)` may be a stale wide export. |

**Recommended: A.** Workbook `Athlytica Data`, id
`1McbUOdX__Lm88nnMULWceQiCofX6884TC6Ffyr78Yss`.

⚠ The export must enumerate real tab names and assert on a known column per
response — `gviz` **silently returns the first tab** on a name mismatch, which
is how a pipeline ends up ingesting 2020 inline-skating data and reporting
success.

**Risk if wrong:** critical. Choosing `2021.csv` loses 927 session rows
permanently from the record. **This decision gates every other phase.**

---

### D-05 · Retire `scripts/normalize-legacy-ids.js`

**Decision.** The script mints `ATH-YYYY-NNNN`, which encodes the registration
year and violates the permanence rule. `lib/converters/convexAdapter.ts` throws
an error instructing operators to run it.

| Option | Consequence |
|---|---|
| **A. Freeze the script; correct the adapter message to point at the canonical spec (recommended)** | Removes the trap. Small, contained diff. |
| B. Delete both | Loses the collision-guard and dry-run logic, which are good and worth porting. |
| C. Leave as-is | An operator follows the error message and mints year-encoded IDs into production. |

**Recommended: A.** Not done in Phase 0 — it is a code change, and Phase 0 is
architecture only.

**Risk if wrong:** medium, and it is a *latent* risk: nothing happens until
someone follows the instruction.

---

### D-06 · Bare first-name attribution

**Decision.** How to handle performance records identified only by a first name.

**Why it matters.** `NAME_ALIASES` maps `"eli" → Eli Das`, but **`Eli Araka`
(`ATH-016`) is on the same roster** as `Eli Das` (`ATH-009`). `Leon Sila`
(`ATH-020`) sits alongside sibling `Leroy Sila` (`ATH-051`).
`Scrimmage Tracker.csv` degrades to bare first names from ~row 30.

| Option | Consequence |
|---|---|
| **A. `matching_status = AMBIGUOUS`, load unattributed (recommended)** | Directive §13. Some fixture participations carry no athlete until resolved. |
| B. Resolve by co-occurrence with fixture rosters | Recovers more data. The dossier did this and graded it *"fragile"*. Produces `INFERRED` at best. |
| C. Keep the current alias table | Silently attributes Eli Araka's play to Eli Das. |

**Recommended: A**, with B as a reviewed enrichment pass that can only promote
to `CONFIRMED_SAME` with a named reviewer.

**Risk if wrong:** critical. Misattributing a goal to the wrong child is the
most damaging error a scouting product can make.

---

### D-07 · The 109 unassigned rows

**Decision.** 109 rows in `RAW DATA INPUT 2026(5).csv` carry an athlete ID but
no discipline and no date.

| Option | Consequence |
|---|---|
| **A. `organization_assignment = UNASSIGNED`, `organization_id = NULL`, preserve provenance (recommended)** | Directive §17. Queryable, traceable, excluded from every org aggregate. |
| B. Investigate first — they may be a blank template block | Worth doing during the re-export; may reduce the count to zero. |
| C. Assign by athlete's other sessions | Inference dressed as fact. |

**Recommended: A**, and check during the D-04 re-export whether they are an
artefact of the export rather than real rows.

**Risk if wrong:** low volume, but they carry athlete IDs, so they are not
obviously discardable.

---

### D-08 · `Kids Group` as an entity

**Decision.** `" Kids Group"` (leading space) is registered as an *athlete*
under two IDs (`ATH-030`, `ATH-055`) with sessions attributed to it.

| Option | Consequence |
|---|---|
| **A. Not a person: no `athlytica_id`; its sessions become group sessions with unattributed participation (recommended)** | Correct entity typing. Session evidence survives. |
| B. Migrate as an athlete flagged non-person | Keeps the anomaly inside the athlete table forever. |
| C. Discard the rows | Loses real session evidence. |

**Recommended: A.**

**Risk if wrong:** low, but it would put a non-person in the athlete passport
population.

---

### D-09 · Technical-compliance threshold

**Decision.** What ordinal level counts as "compliant" for `Low COG %`,
`Full Extension %` and `Perfect Recovery %`?

**Why it matters.** The published rollups read **0% for every athlete**, while
the underlying ordinals are abundant and well distributed (383 observations
each; Low COG = 21/86/173/90/13 across levels 1–5). Level 5 is attested 13
times, so **no threshold produces 0% for everyone** — the source formula is
broken, not the data.

*(This corrects the Phase-audit report, which concluded the data was absent.)*

| Option | Consequence |
|---|---|
| **A. Compliant = level ≥ 4 ("Strong/Good" or better) (recommended)** | Matches the rubric's own language — levels 1–3 are Poor/Developing/Average. Yields meaningful spread. |
| B. Compliant = level ≥ 3 | Most athletes pass; low discriminating power. |
| C. Compliant = level 5 only | Very few pass; close to the broken 0% behaviour. |
| D. Abandon the rate; publish the ordinal distribution | Arguably better — a distribution is more informative than a rate. |

**Recommended: A**, and consider D for the passport, where a 1–5 distribution
communicates more to a parent than a single percentage.

**Risk if wrong:** medium. It is a derived value, fully recomputable, so a
wrong choice is cheap to change — provided it is versioned.

---

### D-10 · `technical_rating` direction and normalisation

**Decision.** `technical_rating` = mean of `4 − 2×technical_breaks`. The
formula is correctly higher-is-better, but observed values invert against
performance:

| Athlete | rating | attendance | speed |
|---|---|---|---|
| Noel Inoue (124 pts, top scorer) | **−1.667** | 100% | 8.17 |
| Dakota Weening | **−2.0** | 100% | 5.2 |
| Leroy Sila | **+2.4** | 40% | 1.6 |

**Root cause:** break count is confounded with exposure. Higher performers
attempt harder work and accumulate more breaks. Averaging a raw count and
naming it a "rating" hides the confound.

| Option | Consequence |
|---|---|
| **A. Deprecate v1; define `technical_rating_v2` normalised by session count and drill difficulty (recommended)** | Fixes the confound. Requires a drill-difficulty scale that does not yet exist. |
| B. Normalise by session count only | Simple, partial — does not address difficulty. |
| C. Publish `EE_TECHNICAL_BREAKS` raw with `lower_is_better`, no rating | Honest and immediately correct. Loses a headline number. |
| D. Invert the sign | **Wrong** — it would treat the confound as the signal. |

**Recommended: A**, with C shipping in the interim so nothing parent-facing
depends on v1.

Historical v1 values are **not overwritten, recomputed or deleted** in any
option.

**Risk if wrong:** high — this drives a parent-facing rating.

---

### D-11 · Age-tier vocabulary and DOB capture

**Decision.** Three incompatible age vocabularies exist, and DOB is not
collected anywhere.

| Where | Bands |
|---|---|
| `public.division` | `U9_COED`, `U13_COED` |
| `nrhl_athlete.age_tier` CHECK | `U8`, `U12`, `U15` |
| Legacy corpus | `U8`, `U12`, `U16` (+ `U16 (13+ years)`, unbounded) |

Worse: **age group is unstable per athlete** — Shaya Das appears as both U8 and
U12 within 2026.

**Why it matters.** All 15 tier-specific cognitive metrics and the four Nairobi
Deficit codes are tier-gated. Without a stable tier they cannot be scored, and
without DOB the tier cannot be derived or audited.

| Option | Consequence |
|---|---|
| **A. Add DOB to registration; derive tier from DOB + season date; one vocabulary (recommended)** | The only auditable answer. Requires a registration change — **out of scope for this phase** (§25). |
| B. Keep recorded age group as a per-session attribute; do not derive | Works for history; tier-gated metrics stay unscorable. |
| C. Pick one vocabulary and remap | Does not fix instability or the missing DOB. |

**Recommended: A**, scheduled as its own change after Phase 0, with B as the
interim treatment of legacy rows.

**Risk if wrong:** high. It blocks 19 of the 27 VERIFIED cognitive/tactical
metrics.

---

### D-12 · Unknown 2026 derivations

**Decision.** Three items whose definition cannot be established from data:

- `Speed score` — labelled bands, **populated in rows where the timed dash is
  the free text "Didn't manage to take the speed"**, so it is not a function of
  the dash. Inputs unknown.
- `Power Score` — full float precision (4.333333333), the signature of a
  spreadsheet formula. Inputs unknown.
- `SK_FWD_BWD_TRANSITION` — on the capture sheet with **no unit, no scale and
  no checkbox**, unlike every other row in its block.

Also here: the two published rollups disagree on rounding (Raimi Skudi is
`−0.3` in `Athlete Progress`, `−0.387` in `athlete_individual_stats`; `−0.387`
rounds to `−0.4`), so the aggregation windows differ. UNKNOWN which is correct.

| Option | Consequence |
|---|---|
| **A. Recover the formulas from the live sheet during the D-04 re-export (recommended)** | The formulas exist in the workbook. This is the cheapest possible answer and it rides along with a decision already being made. |
| B. Leave `UNKNOWN`; do not migrate | Safe. Loses 2026 speed/power history. |
| C. Reverse-engineer | Already attempted; `Speed score` is provably not a function of the dash. |

**Recommended: A.** When exporting, capture the **formula view** of the 2026
tab, not just values.

**Risk if wrong:** medium, and cheap to get right — the formulas are one
keystroke away in the sheet.

---

### D-13 · NRHL name; conference / team conflict

**Decision.** Two naming conflicts.

1. **Regional vs Roller.** `config/workspaces.ts` and `business-model.md` say
   *Nairobi **Regional** Hockey League*; the brief and prospectus context say
   *Nairobi **Roller** Hockey League*. Both are in active use.
2. **A shipped athlete document contradicts itself.**
   `Benson_Mbatia_Performance_ID_FINAL.pdf` headers *THE SUMMIT CONFERENCE*,
   then Section E reads *THE RIDGE — VANGUARD*, then *THE SUMMIT Conference |
   Gigiri/Muthaiga Corridor* — on one page. `Vanguard` belongs to Rosslyn in
   The Summit per the league team list, so The Ridge and Vanguard cannot both
   be right.

**Why it matters.** The name appears on parent-facing PDFs and the public site.
The conference/team structure is being seeded as reference data.

| Option | Consequence |
|---|---|
| **A. Founder states the legal name; seed conferences and the 12 teams as forward-looking reference with `effective_from` (recommended)** | Ends the drift. Keeps 2026 captain-named teams as history, which is what the data actually shows. |
| B. Back-apply the 12 teams to 2026 scrimmages | Manufactures history. Legacy scrimmages have empty `division` and literal `"Team A"`/`"Team B"`. |

**Recommended: A**, and recover the real captain names from
`Scrimmage Tracker.csv` — `legacy_scrimmages.csv` replaced them with
placeholders, but the source still has them.

**Risk if wrong:** medium; reputational rather than structural.

---

### D-14 · `Session_Load` formula

**Decision.** `Session_Load` is `#REF!` for 100% of 2022 (984 occurrences
corpus-wide). It appears to be `RPE × duration` (2020: `300 = 5×60`,
`420 = 7×60`) but this is inferred from two rows and attested by no protocol
document.

| Option | Consequence |
|---|---|
| **A. Confirm the formula; recompute in the derived layer only (recommended)** | Recovers 2022 load from surviving RPE and duration. `#REF!` preserved as `SOURCE_ERROR` in the observation. |
| B. Leave 2022 load absent | Safe; a year-shaped hole in training-load history. |
| C. Import the stored value | Imports `#REF!` as data. |

**Recommended: A.** Confirm against the sheet's formula view during the D-04
re-export.

**Risk if wrong:** low — derived, versioned, recomputable.

---

### D-15 · Founder-identity hardcoding

**Decision.** `dennis@bigice.co.ke` is hardcoded in two places:
`public.is_global_founder()` (SQL) and `config/workspaces.ts` (TypeScript).
They must change together or the two layers disagree about who the founder is.

| Option | Consequence |
|---|---|
| **A. Keep for now; replace with a `GLOBAL_FOUNDER` grant in `workspace_roles` at Phase 11 (recommended)** | Phase 0 depends on `is_global_founder()` for the containment policies. Changing it now adds risk for no gain. |
| B. Replace now | Touches auth during a security containment. Bad sequencing. |

**Recommended: A.** Registered so it is not forgotten.

**Risk if wrong:** low today; grows once staff accounts exist.

---

## Approval checklist (directive §28)

Migration may not begin until all eleven are approved:

- [ ] Canonical athlete architecture — `CANONICAL_ATHLETE_ARCHITECTURE.md`
- [ ] Athlete ID model — `ATHLETE_ID_SPEC.md` (D-05)
- [ ] Organization model — `ORGANIZATION_MEMBERSHIP_SPEC.md`
- [ ] RLS — `RLS_POLICY_MATRIX.md` (**D-01**)
- [ ] Metric registry — `METRIC_REGISTRY_V2.md` (D-09, D-10, D-11, D-12, D-14)
- [ ] Legacy identifier strategy — `LEGACY_IDENTIFIER_MAPPING.md` (D-02, D-06, D-08)
- [ ] Authoritative source files — **D-04**
- [ ] Date handling — `DATA_QUALITY_REMEDIATION_PLAN.md` §2
- [ ] `Foundational Skating` treatment — **D-03**
- [ ] NRHL scoring formula — `NRHL-PTS-v1` and `NRHL-COMP-v1` (D-13, DQ-050)
- [ ] Duplicate / test-data handling — test rows, `Kids Group`, Class 3 duplicates (D-08)

---

# Decisions added after Phase 0 (0.1 → 0.3C)

D-01…D-15 above were raised during the Phase 0 audit. The following were raised
in later phases and are recorded here so the register stays the single index.
Live status is always in [`docs/ATHLYTICA_PROJECT_STATE.md`](../ATHLYTICA_PROJECT_STATE.md).

| ID | Decision | Status |
|---|---|---|
| D-16 | Migration version drift remediation (0 of 32 local versions matched applied) | **OPEN.** Two files now align deliberately — `20260812083829_record_classification`, `20260812122254_m3_payment_replay_integrity`. Pattern proven; the other 32 remain. `supabase db push` must not be run. |
| D-17 | Is exposure qualification retroactive for `NRHL-COMP-v2`? | OPEN |
| D-18 | Minimum exposure thresholds for scoring eligibility | OPEN |
| D-19 | Non-participant treatment in composites | OPEN |
| D-20 | Transactional athlete creation + ID issuance | **OPEN — M1 designed, not applied.** Mint and insert are separate round-trips (`bigice-onboarding.ts:190` → `:200`); a failed insert burns a permanent identifier. Proven: sequence 500→504, zero athlete rows. Needs an isolated environment to verify. |
| D-21 | Is `SGX7HQ2LM9` a real customer payment? | **CLOSED 2026-08-12 — NO.** Owner checked the Safaricom statement; the receipt is absent. All five `payment_events` are synthetic; production has never processed a real payment. |
| D-22 | Test / production record classification | **CLOSED 2026-08-12.** `record_classification` applied (`20260812083829`), 5 rows classified TEST. Database consumer `payment_events_production` added by M3. **Application consumers migrated in Phase 0.3C** — `dashboard` `railTotalKes` and `cash-watcher` now read the view. Guarded by `tests/payment-revenue-source.test.mts`. |
| D-23 | Payment replay integrity + `G-W6-PAY` evidence | **CLOSED 2026-08-12.** M3 applied (`20260812122254`), tested 19/19 pre-apply including the critical regression. Duplicate ≠ conflicting replay: identical immutable attributes → idempotent `DUPLICATE`; any difference → `RECONCILIATION_REQUIRED` with evidence preserved and nothing settled. Gate reset to `live=false`. |
| D-24 | Payment authorization boundary (F-1…F-5) | **CLOSED 2026-08-12 (Phase 0.3E).** M4 applied (`20260812172530`), tested 29/29 pre-apply. See below. |
| D-25 | A second M-Pesa integration is being written outside the `DARAJA_*` rail | **OPEN — raised Phase 0.3F.** A complete STK client (`sendStkPush`, `getMpesaToken`, `normalizeKenyanPhone`) was found pasted into `app/api/v1/performance/route.ts`, where it broke the build. It uses six `MPESA_*` env vars that **do not exist** in this project, duplicates `utils/mpesaDaraja.ts` and `utils/msisdn.ts`, and pushes a **client-supplied amount** — violating "Money is never client-priced". Reverted, not adopted; preserved as a patch. **Two STK clients with two env namespaces against one Paybill is how a payment stops arriving.** Reconcile before any of it lands. |
| D-26 | Is the Google Forms channel a **paid** or **unpaid** intake? | **CLOSED 2026-08-12 (Phase 0.3G) — UNPAID / ADMINISTRATIVE.** Owner-decided. The seven records turned out to be **synthetic**, not unpaid customers: one athlete name, all seven `submission_id`s prefixed `test-`, cohort "Test Cohort A", 68-minute window on 2026-07-09, zero guardians. **The path has never taken a real submission**, so no counter-evidence exists and the stated default stands. F-7 downgraded MEDIUM → **LOW** (architecture defect, not a data defect). Classification moves G → **A, trusted administrative creation**. Disposition and the verified-not-applied classification SQL are in `GOOGLE_FORMS_ENROLLMENT_POLICY.md`. |
| D-26a | Apply the seven-record TEST classification? | **OPEN — one command.** Additive, reversible, verified in a rolled-back transaction (7 + 7 rows, 0 over-reach, nothing mutated). Not applied: the brief forbade changing the seven records automatically. |
| D-26b | Classify the 6 TTA demo athletes as DEMO? | **OPEN.** Different seeding path (`tta_international_football_academy_demo.sql`), deliberately not swept into D-26a. |
| D-26c | **Is the Google Forms channel still in use at all?** | **CLOSED 2026-08-12 (Phase 0.3H) — NO. Retired in `main`; ⚠ NOT YET LIVE IN PRODUCTION (see D-28).** Owner confirmed the channel is no longer used. `/api/v1/onboarding/google-forms` now answers `410 CHANNEL_RETIRED`: no database client, no request body read, no athlete, no enrollment, no guardian, no Athlete ID, no payment record. **Application-only retirement — no migration.** The RPC and `google_form_submission_log` are deliberately kept (service_role-only, now caller-less) because they are the only way to read and explain the seven historical rows; dropping them would delete audit capability. `GOOGLE_FORMS_WEBHOOK_SECRET` deliberately kept — despite its name it is **shared with `sync/convex`**, and removing it would have sealed a live surface. See `GOOGLE_FORMS_ENROLLMENT_POLICY.md` §13. |
| D-28 | **`main` is not deploying to Vercel** | **CLOSED 2026-08-12 (Phase 0.3K) — Vercel's Production Branch was `master`.** Root cause read from the Vercel API, not inferred: `productionBranch: "master"` while every commit since 2026-08-11 went to `main`, so **every push to `main` built a Preview**. Of 81 deployments on record, all 27 Git deployments of `main` are Preview, all 12 Git deployments of `master` are **ERROR** (missing `NEXT_PUBLIC_SUPABASE_*` production env vars, not provisioned until 2026-08-11T16:42Z), and **every** successful production deployment in the project's history came from `vercel --prod` or a redeploy. Fixed with `PATCH /v1/projects/{id}/branch {"branch":"main"}` — a Vercel setting, no application change. First Git-managed production deployment: `dpl_AZdYh344snMvashHUT3ws8P4m9S8`, `source: git`, `gitSource.ref: main`, `gitSource.sha: 06afdab…`, READY in 44s, holding `athlytica-systems-engine.vercel.app`. `GET /api/v1/onboarding/google-forms` now returns **410** on both hosts. **0.3I's inference was wrong on one point:** M4's application code (`67b2cef`) is an ancestor of `f7f451a`, so the deployed build *was* calling it — the only application file production lacked was the Google Forms route. Full evidence, including why `vercel --prod` deployment SHAs are fiction, in [`DEPLOYMENT_CHAIN_AUDIT.md`](DEPLOYMENT_CHAIN_AUDIT.md). Guardrail: `pnpm verify:production`. |
| D-28a | **Should the application expose its own build identity?** | **OPEN — recommended, not implemented (0.3K).** Production's commit is provable today only from Vercel deployment metadata plus a hand-picked behavioural probe (405 vs 410 on the retired Google Forms route). Nothing in the codebase reads `VERCEL_GIT_COMMIT_SHA` — grepped, zero hits. A `GET /api/v1/version` returning `VERCEL_GIT_COMMIT_SHA` + `VERCEL_DEPLOYMENT_ID` (both already public in deployment metadata, neither sensitive) would make the check one unauthenticated request and free `verify:production` from re-choosing a canary each deploy. Deliberately not added in 0.3K: the brief forbade code changes not required by the deployment problem. |
| D-28b | **Delete the `master` branch?** | **OPEN — owner action, one command.** `origin/master` still exists at `574e672` and is now wired to nothing. It was the Vercel production branch until 0.3K; leaving it in place preserves exactly the ambiguity that caused D-28. Not deleted here because branch deletion on a remote is not this phase's to take. |
| D-29 | **A CRM is being built concurrently** | **OPEN — informational, raised 0.3I.** `20260812221912_crm_core` was **applied to production 2026-08-12 22:19 UTC** by another actor while this phase ran, creating `crm_activity`, `crm_contact`, `crm_opportunity`, `crm_opportunity_event`, `crm_organization`, `crm_task`. Local files (`config/crm.ts`, `lib/validation/crm-schemas.ts`, the migration + rollback) are **untracked and deliberately not committed here**. No overlap with the Google Forms retirement, so no conflict. Flagged because it applied a production migration outside the M2/M3/M4 test-before-apply discipline, and because a CRM holding contacts is a PII surface that will need the RLS work (D-01). |
| D-27 | **Disable the Google Apps Script trigger** | **OPEN — owner action, outside this repository.** The trigger still runs in the owner's Google account and will keep POSTing to the retired endpoint. It now receives `410` and creates nothing, so this is hygiene rather than risk — but it should be turned off at source. `apps-script/onboarding_google_form_webhook.gs` is kept in the repo as the record of what is deployed there. |

> **D-26's original framing (0.3F) was wrong in one respect worth recording.**
> It described the seven rows as *"unpaid entitlement"* and asked whether the
> channel was paid. Investigating the rows first — as 0.3G's brief required
> before any change — showed they were synthetic, so the premise that there
> were seven unpaid *customers* was false. The architectural defect it named
> is real; the data defect it implied was not. Corrected in
> `GOOGLE_FORMS_ENROLLMENT_POLICY.md` §0, along with a narrower reading of
> the price tier: Google Forms used `tier_group='intake_funnel'`, never the
> `academy` group Big Ice sells from.
| OPS-1 | Billable Supabase branch for RLS testing | **CLOSED — not needed.** Org is on the free plan; R1–R12 ran read-only at zero cost, and a branch would not have unblocked R4–R8 (canonical tables don't exist). Owner chose local Docker; not yet installed. |

---

### D-24 · Payment authorization boundary

**Decision.** What must be true before a payment may create customer value?

**Answer, as implemented.** Service authorization requires **positive
server-derived evidence** and defaults to `NOT_AUTHORIZED` — the opposite
default from revenue classification (D-22), which is `PRODUCTION` by
absence. Both fail safe; they fail safe in opposite directions because the
cost of being wrong points the opposite way. A forgotten classification
should over-count revenue; it must never mint a permanent Athlete ID.

This is what makes F-1 solvable at all. "Has someone marked this receipt as
a test?" is unanswerable on first arrival, because the receipt is minted by
Safaricom and first seen in the callback. "Did this payment match a
registration created by the production intake funnel, on the production
rail, un-classified and un-disputed?" is answerable immediately.

**Authoritative rule:** `public.payment_service_authorization`, reached only
via `lib/services/payment-authorization.ts`. Consumers: `mpesa-callback`,
`retry-onboarding`, `onboard-paid-athlete`. Nothing re-implements it.

**Evidence it is sound:** all five synthetic `payment_events` match zero
registrations and are denied **without any classification row** (test 25).
The rule would have blocked all five on first arrival, before M2 existed.

**Venture:** a payment's venture is the `venture_context` of the
registration it matched — never inferred from amount, phone, receipt shape
or price. Cross-venture households reconcile rather than guess.

**Risk if wrong:** low and bounded. The boundary only ever *denies*; a
false denial is a support ticket, a false grant is a permanent identity.
Three non-payment issuance paths (`nrhl/ingest`, `google-forms`, the unused
`athlytica_core` trigger) are deliberately out of scope — see
`PAYMENT_AUTHORIZATION_BOUNDARY.md` §16.

---

## Decisions closed to date

**D-21, D-22, D-23, D-24, OPS-1.** Everything else in this register remains open.

**Nothing in the migration approval checklist above has been ticked.** The
closed decisions are containment work on the *live* system; none of them
unblocks legacy migration, which is still gated on D-04.
