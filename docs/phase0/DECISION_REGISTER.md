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
| D-01 | Apply RLS containment to `athlytica_core` | **OPEN — baseline documented 0.3L; see D-01a/b/c below for the `public` surface, which is the larger half** | Phase 0.4, Phase 1 |
| D-02 | Resolve the `ATH-047` collision | **OPEN** | Phase 5 |
| D-03 | What `Foundational Skating` means | **OPEN** | Phase 7 (1,669 rows) |
| D-04 | Authoritative source files | **OPEN — the longest pole, and not an engineering task** | **everything from Phase 0.5 down.** 0.3L confirmed it does *not* gate 0.4, which is the last phase that can proceed without it |
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
| D-16 | Migration version drift remediation | **OPEN — now quantified (Phase 0.3L).** Measured live by matching applied migration *names* against local filenames: **37 local / 36 applied · 5 MATCHING · 30 RENAMED · 1 APPLIED-WITH-NO-LOCAL-FILE · 2 LOCAL-NEVER-APPLIED · 0 duplicates · all 37 UNSAFE TO REPLAY.** The 5 that match were all aligned deliberately by renaming the local file to the version Postgres stamped (M2, M3, M4, `crm_core`, `crm_sales_ops_role`) — the discipline works, five for five. Two gaps are real and distinct: `20260811012454_bigice_academy_name_parity` is applied with **no source** (R7), and `20260720095900_inventory_allocation_trigger.sql` has **never been applied** — `commercial_inventory` has no triggers at all (raised as D-31). By contrast `20260713_cohort_telemetry_scouting_metric_log_rls.sql` is a ledger gap only: both tables carry `FORCE RLS` + both policies, so its effects are present under another entry. Root cause unchanged: `apply_migration` stamps `to_char(current_timestamp,…)` instead of honouring the filename. **Recommended strategy (0.3L §7, not yet executed):** freeze the applied ledger as authoritative in `supabase/migrations/APPLIED_LEDGER.md`, keep the apply-then-rename discipline going forward, and close the two real gaps individually. Do **not** rewrite history; do **not** run `supabase db push` (R5). |
| D-17 | Is exposure qualification retroactive for `NRHL-COMP-v2`? | OPEN |
| D-18 | Minimum exposure thresholds for scoring eligibility | OPEN |
| D-19 | Non-participant treatment in composites | OPEN |
| D-20 | Transactional athlete creation + ID issuance | **OPEN — M1 designed, not applied. RE-SCOPED 0.3L.** Mint and insert are separate round-trips (`bigice-onboarding.ts:190` → `:200`); a failed insert burns a permanent identifier. Proven: sequence 500→504, zero athlete rows. Needs an isolated environment to verify. **M1 is necessary and not sufficient: it makes issuance atomic without changing *which number* is issued.** `scalable_id_sequence` is verified at **504**, inside the legacy `ATH-500`–`ATH-638` block, so an atomic issuer pointed at it would atomically issue an identifier already held by a real child — M1 alone makes the bug reliable. **R4 must be decided first.** See 0.3L §5.2. |
| D-21 | Is `SGX7HQ2LM9` a real customer payment? | **CLOSED 2026-08-12 — NO.** Owner checked the Safaricom statement; the receipt is absent. All five `payment_events` are synthetic; production has never processed a real payment. |
| D-22 | Test / production record classification | **CLOSED 2026-08-12.** `record_classification` applied (`20260812083829`), 5 rows classified TEST. Database consumer `payment_events_production` added by M3. **Application consumers migrated in Phase 0.3C** — `dashboard` `railTotalKes` and `cash-watcher` now read the view. Guarded by `tests/payment-revenue-source.test.mts`. |
| D-23 | Payment replay integrity + `G-W6-PAY` evidence | **CLOSED 2026-08-12.** M3 applied (`20260812122254`), tested 19/19 pre-apply including the critical regression. Duplicate ≠ conflicting replay: identical immutable attributes → idempotent `DUPLICATE`; any difference → `RECONCILIATION_REQUIRED` with evidence preserved and nothing settled. Gate reset to `live=false`. |
| D-24 | Payment authorization boundary (F-1…F-5) | **CLOSED 2026-08-12 (Phase 0.3E).** M4 applied (`20260812172530`), tested 29/29 pre-apply. See below. |
| D-25 | A second M-Pesa integration is being written outside the `DARAJA_*` rail | **OPEN — raised Phase 0.3F.** A complete STK client (`sendStkPush`, `getMpesaToken`, `normalizeKenyanPhone`) was found pasted into `app/api/v1/performance/route.ts`, where it broke the build. It uses six `MPESA_*` env vars that **do not exist** in this project, duplicates `utils/mpesaDaraja.ts` and `utils/msisdn.ts`, and pushes a **client-supplied amount** — violating "Money is never client-priced". Reverted, not adopted; preserved as a patch. **Two STK clients with two env namespaces against one Paybill is how a payment stops arriving.** Reconcile before any of it lands. — **PARTIALLY RESOLVED 2026-08-13 (Phase 0.3L). The code is gone; the credentials are not.** `app/api/v1/performance/route.ts` is now 83 lines and contains no STK client; no source file anywhere reads `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE` or `MPESA_CALLBACK_URL`. But the original claim that those variables "do not exist in this project" is **no longer true**: all five are provisioned in the Vercel **production** environment, created 2026-08-12 13:51–18:11 UTC — the same window in which the pasted client existed. Only `MPESA_CALLBACK_SECRET` is genuinely used (`mpesa-callback/route.ts:183`). `MS100N_HASH_KEY` is also present and is a typo'd duplicate of the used `MSISDN_HASH_KEY`. **OWNER DECISION: delete the five unused `MPESA_*` variables and `MS100N_HASH_KEY`, or state what they are for.** Live M-Pesa credentials with no consumer are a standing liability. The live rail is unaffected — `DARAJA_*` is provisioned and working; Safaricom accepted an STK push at 2026-08-12 19:28 UTC. |
| D-26 | Is the Google Forms channel a **paid** or **unpaid** intake? | **CLOSED 2026-08-12 (Phase 0.3G) — UNPAID / ADMINISTRATIVE.** Owner-decided. The seven records turned out to be **synthetic**, not unpaid customers: one athlete name, all seven `submission_id`s prefixed `test-`, cohort "Test Cohort A", 68-minute window on 2026-07-09, zero guardians. **The path has never taken a real submission**, so no counter-evidence exists and the stated default stands. F-7 downgraded MEDIUM → **LOW** (architecture defect, not a data defect). Classification moves G → **A, trusted administrative creation**. Disposition and the verified-not-applied classification SQL are in `GOOGLE_FORMS_ENROLLMENT_POLICY.md`. |
| D-26a | Apply the seven-record TEST classification? | **OPEN — one command.** Additive, reversible, verified in a rolled-back transaction (7 + 7 rows, 0 over-reach, nothing mutated). Not applied: the brief forbade changing the seven records automatically. |
| D-26b | Classify the 6 TTA demo athletes as DEMO? | **OPEN.** Different seeding path (`tta_international_football_academy_demo.sql`), deliberately not swept into D-26a. |
| D-26c | **Is the Google Forms channel still in use at all?** | **CLOSED 2026-08-12 (Phase 0.3H) — NO. Retired in `main`; ⚠ NOT YET LIVE IN PRODUCTION (see D-28).** Owner confirmed the channel is no longer used. `/api/v1/onboarding/google-forms` now answers `410 CHANNEL_RETIRED`: no database client, no request body read, no athlete, no enrollment, no guardian, no Athlete ID, no payment record. **Application-only retirement — no migration.** The RPC and `google_form_submission_log` are deliberately kept (service_role-only, now caller-less) because they are the only way to read and explain the seven historical rows; dropping them would delete audit capability. `GOOGLE_FORMS_WEBHOOK_SECRET` deliberately kept — despite its name it is **shared with `sync/convex`**, and removing it would have sealed a live surface. See `GOOGLE_FORMS_ENROLLMENT_POLICY.md` §13. |
| D-28 | **`main` is not deploying to Vercel** | **CLOSED 2026-08-12 (Phase 0.3K) — Vercel's Production Branch was `master`.** Root cause read from the Vercel API, not inferred: `productionBranch: "master"` while every commit since 2026-08-11 went to `main`, so **every push to `main` built a Preview**. Of 81 deployments on record, all 27 Git deployments of `main` are Preview, all 12 Git deployments of `master` are **ERROR** (missing `NEXT_PUBLIC_SUPABASE_*` production env vars, not provisioned until 2026-08-11T16:42Z), and **every** successful production deployment in the project's history came from `vercel --prod` or a redeploy. Fixed with `PATCH /v1/projects/{id}/branch {"branch":"main"}` — a Vercel setting, no application change. First Git-managed production deployment: `dpl_AZdYh344snMvashHUT3ws8P4m9S8`, `source: git`, `gitSource.ref: main`, `gitSource.sha: 06afdab…`, READY in 44s, holding `athlytica-systems-engine.vercel.app`. `GET /api/v1/onboarding/google-forms` now returns **410** on both hosts. **0.3I's inference was wrong on one point:** M4's application code (`67b2cef`) is an ancestor of `f7f451a`, so the deployed build *was* calling it — the only application file production lacked was the Google Forms route. Full evidence, including why `vercel --prod` deployment SHAs are fiction, in [`DEPLOYMENT_CHAIN_AUDIT.md`](DEPLOYMENT_CHAIN_AUDIT.md). Guardrail: `pnpm verify:production`. |
| D-28a | **Should the application expose its own build identity?** | **OPEN — recommended, not implemented (0.3K).** Production's commit is provable today only from Vercel deployment metadata plus a hand-picked behavioural probe (405 vs 410 on the retired Google Forms route). Nothing in the codebase reads `VERCEL_GIT_COMMIT_SHA` — grepped, zero hits. A `GET /api/v1/version` returning `VERCEL_GIT_COMMIT_SHA` + `VERCEL_DEPLOYMENT_ID` (both already public in deployment metadata, neither sensitive) would make the check one unauthenticated request and free `verify:production` from re-choosing a canary each deploy. Deliberately not added in 0.3K: the brief forbade code changes not required by the deployment problem. |
| D-28b | **Delete the `master` branch?** | **OPEN — owner action, one command.** `origin/master` still exists at `574e672` and is now wired to nothing. It was the Vercel production branch until 0.3K; leaving it in place preserves exactly the ambiguity that caused D-28. Not deleted here because branch deletion on a remote is not this phase's to take. |
| D-29 | **A CRM is being built concurrently** | **OPEN — informational, raised 0.3I.** `20260812221912_crm_core` was **applied to production 2026-08-12 22:19 UTC** by another actor while this phase ran, creating `crm_activity`, `crm_contact`, `crm_opportunity`, `crm_opportunity_event`, `crm_organization`, `crm_task`. Local files (`config/crm.ts`, `lib/validation/crm-schemas.ts`, the migration + rollback) are **untracked and deliberately not committed here**. No overlap with the Google Forms retirement, so no conflict. Flagged because it applied a production migration outside the M2/M3/M4 test-before-apply discipline, and because a CRM holding contacts is a PII surface that will need the RLS work (D-01). — **ESCALATED 2026-08-13 (Phase 0.3L): no longer informational.** Verified live: **two** migrations are applied to production (`crm_core` + `crm_sales_ops_role`), the schema is real, and **~4,800 lines of application code that read it are committed nowhere** — 11 untracked paths plus 6 modified tracked files, in one working tree. It is verified in source, **not deployed**, and **not production-verified**. This is the same shape as D-28: a truth that exists in one place and is believed to exist in another. D-28 cost a month of undeployed security work to discover; this one costs one commit to fix and everything to lose. See D-30. |
| D-30 | **Commit the CRM** | **CLOSED 2026-08-13 (during Phase 0.3L) — the CRM author committed it as `307bacb` "chore(migrations): snapshot before supabase pull": 23 files, 5,197 insertions, including both migrations, the rollback, both test files and the `docs/ATHLYTICA_PROJECT_STATE.md` edits.** Superseded by **D-30a** (it is committed, not pushed). Original text follows. ~4,800 lines of CRM application code (`app/api/v1/crm/route.ts`, six pages under `app/(app)/dashboard/crm/`, `lib/services/crm-metrics.ts`, `components/workspace/crm.tsx`, `config/crm.ts`, `lib/validation/crm-schemas.ts`, two test files, two migrations + rollback) exist only as untracked files against a schema that is already applied to production. Six tracked files are also modified. `pnpm typecheck` is clean and `pnpm test` is 210/0 **with** this work present, so nothing is blocking the commit except the commit. **It is the only item in this register that can be lost rather than merely delayed.** Must be staged by someone who knows which changes are theirs — 0.3K and 0.3L both refused to stage it. `docs/ATHLYTICA_PROJECT_STATE.md` carries both their edits and 0.3L's rewrite, uncommitted; whoever commits the CRM carries it. |
| D-30a | **Push the CRM** | **OPEN — one command, raised 0.3L.** `307bacb` is committed and **not pushed**: `main` is ahead of `origin/main` by 1. 5,197 lines of application code for a schema that is already applied to production exist on exactly one machine. **This is the 0.3K lesson one link earlier — a commit is not a push, a push is not a deploy.** `git push origin main`, wait ~45s for the Git production deployment, then `pnpm verify:production`. The chain repaired in 0.3K will carry it without further instruction. |
| D-32 | **⚠ `supabase pull` / `supabase migration repair`** | **OPEN — caution, raised 0.3L.** `307bacb`'s message announces an intent to run `supabase pull`. The snapshot was the right instinct; the pull is the hazard. `supabase db pull` compares the remote `supabase_migrations.schema_migrations` table against local filenames — and **30 of 37 local files carry a different version string than the migration that applied them** (D-16). The CLI will report a history mismatch and direct you to `supabase migration repair --status applied <version>`. **`migration repair` writes to the remote migration history table**, which is currently the only accurate record of what has been applied and which D-16's recommended strategy freezes as authoritative. Repairing it would overwrite the accurate record with the inaccurate one. `db pull` alone does not alter the remote *schema*, and `db push` remains prohibited (R5). **Do not run `migration repair` until D-16 is decided.** If a local baseline is wanted now, use `supabase db dump --schema public,athlytica_core` — it reads, and writes nothing on the remote. |
| D-33 | **R4 — which identifier scheme does Athlytica issue?** | **✅ APPROVED 2026-08-15 — OPTION C. Designed, tested, NOT APPLIED.** Owner-approved: keep `ATH-NNNNN`; reserve `ATH-00001`–`ATH-09999` for legacy; allocate at random from `ATH-10000`–`ATH-99999`. All `character(9)` / regex / public-verification / Convex contracts preserved; passport plane untouched. Migration and rollback written to **`supabase/migrations/pending/`** — deliberately *not* in the applied path, because **D-40 must be reconciled first**: adding a row to a ledger that describes the repository rather than the database buys nothing. **Verified in rolled-back transactions (6 tests + 4 rollback tests, zero persistence):** 500 draws all match `^ATH-\d{5}$`, all length 9, all within band, **none in the legacy reserve**; fits `character(9)`, `varchar(12)` and `athleteCodeSchema`; disjoint from every `migrateLegacyCode()` output even at a worst-case legacy value of 9,999; saturation guard **raises `53100` after 5 attempts** rather than spinning; the **PRIMARY KEY rejected a duplicate with `23505`**, confirming the probe is advisory and the constraint is the authority; **the sequence stayed at 504** — the issuer consumes no counter, which is what makes **R15 structurally impossible**. Rollback verified to restore the old behaviour exactly (it returned `ATH-00505`, the colliding value — proof the rollback is real). Empirical note: 500 draws yielded **499 distinct** values, i.e. one collision against a predicted ~1.4 — the collision model holds, and that single collision is precisely why the caller must retry on `23505`. Re-runnable probe: `supabase/tests/m6_option_c_issuer_probe.sql`. **Left alone deliberately:** `bigice_next_athlete_code()` still uses the sequence (different `BIIF-` namespace, out of approved scope — **but R15 stays alive on the Big Ice path, which is the path that actually burned the 4 codes**), and `athlytica_core.generate_scalable_athlete_code()` still emits into the legacy reserve on an empty, client-unreachable table whose canonical design is still open. Previous (2nd-pass) text follows. — **B′ ALSO WITHDRAWN. Recommendation is now OPTION C — keep `ATH-NNNNN`, issue at random from a reserved band `ATH-10000`–`ATH-99999`.** The rigorous pass found the premise of both earlier recommendations was wrong: **there are two identifier planes, not one.** `public.athlete.passport_id` is `text`/`UNIQUE`/0 issued and is the *passport* plane that `convexAdapter` consumes; `nrhl_athlete.athlete_code` is `character(9)`/PK and is the *venture* plane that `athleteCodeSchema` and the public verify endpoint consume. **R4 is a venture-plane problem** — the sequence feeds it and `migrateLegacyCode()` pads into it. B′ (`ATH-YYYY-NNNN`, 13 chars) is the *passport* format; forcing it onto the venture column is what required the PK type migration, so **requirement 9 (FORMAT PRESERVATION) disqualifies it**. **Option C fits every existing column with zero schema change, zero regex change, zero endpoint change and zero integration change**, is disjoint from legacy by range with a **15× margin** (corpus max 638 vs band floor 10000) — and is safe against the **unmodified** `migrateLegacyCode`, which neither A nor B′ is. It also **makes R15 structurally impossible** (no counter to burn) and **removes M1's cross-venture row lock**. Its one real cost: a **90,000 hard ceiling** on NRHL codes forever, imposed by `character(9)` and `/^ATH-\d{5}$/`; collision arithmetic is tabulated (practical ceiling ≈30,000, expected redraws `n/(90000−n)`, PK remains the final authority, bounded 5-attempt retry). **Conclusively superior on engineering evidence; the ceiling is a business judgement, so it stops for owner sign-off.** B′ stays correct for the passport plane if that is ever activated — a separate decision. Full matrix: [`IDENTIFIER_NAMESPACE_DESIGN.md`](IDENTIFIER_NAMESPACE_DESIGN.md) Part II. Previous (1st-pass) text follows. — **Option B is CONTRADICTED BY EVIDENCE and withdrawn. Revised recommendation: B′ `ATH-YYYY-NNNN` with a non-sequential counter.** The consumer trace (in [`IDENTIFIER_NAMESPACE_DESIGN.md`](IDENTIFIER_NAMESPACE_DESIGN.md)) found the identifier is **not text everywhere and numeric assumptions exist**: `nrhl_athlete.athlete_code` is **`character(9)`** — a PRIMARY KEY sized exactly to `ATH-00505` — and so are its three FK columns (`nrhl_metric`, `nrhl_stat_line`, `bigice_athlete.nrhl_athlete_code`); `athlytica_core.athletes.ath_code` is `varchar(12)`. Option B's `ATH-YYYY-XXXXXX` is **15 characters** and fits neither. It also fails `athleteCodeSchema` (`/^ATH-\d{5}$/`), which validates the **public, CORS-open `GET /api/v1/public/nrhl/verify`** that parents and scouts run from nairobihockey.com; and it fails `PASSPORT_ID_PATTERN` (`/^ATH-(\d{4})-(\d{4})$/`) in `lib/converters/convexAdapter.ts`, whose `parsePassportId` does `Number(counter)` and **throws by design without a numeric counter**. My 0.4 claim that B "costs two function edits" was wrong — it costs a PK type migration across 4 columns, two regex contract changes, a public API validation change and an integration rewrite. **B′ instead:** `ATH-2026-4817` is the shape the codebase *already* parses, keeps Convex working, and is disjoint from legacy **by grammar** — `migrateLegacyCode`'s anchored `/^ATH-(\d{1,5})$/` admits no second hyphen, so no legacy code can normalise into it and no new code can be read as legacy. Draw the 4-digit counter at random within the year (UNIQUE + retry) to kill the ordering leak; 10,000/year, widen to 5 digits if a year ever nears 5,000. **Independent of the choice and recommended regardless: repoint `migrateLegacyCode` at a `LEG-` ledger namespace** — one line, removes the collision mechanism without picking a format. Original 0.4 text follows. — **OPEN — OWNER DECISION, raised 0.4. Recommended: option B.** R4 was mis-stated twice, including by 0.3L. The legacy block is 3-digit (`ATH-500`–`ATH-638`); the issuers emit 5-digit (`ATH-00505`) and `BIIF-2026-0505`. As strings those do not collide — **until `migrateLegacyCode()` (`lib/services/nrhl-etl.ts:178`) pads legacy codes to exactly five digits, which is the function's whole purpose.** After migration the legacy block is `ATH-00500`–`ATH-00638` and the next issue is `ATH-00505`. **Padding is what creates the collision, not what dissolves it** — so `ATHLETE_ID_SPEC.md` §3's six-digit proposal only helps if `migrateLegacyCode` is fixed in the same change. VERIFIED: `migrateLegacyCode` has no production caller (tests only), `nrhl_athlete` and `bigice_athlete` are **empty** and their code columns are PRIMARY KEYs, no external reference depends on a sequential code, and nothing assumes numeric continuity. Also VERIFIED: **five incompatible `ATH-*` namespaces exist**, and the only one with live rows — `account_reference` (`ATH-9YWQ`) — is a *payment reference*, not an identity. Options and blast radius in [`IDENTITY_R4_ANALYSIS.md`](IDENTITY_R4_ANALYSIS.md): **A** continue from 639 (one UPDATE, but bets on 638 being the true maximum, which D-04 has not confirmed) · **B** `ATH-YYYY-XXXXXX` non-sequential, sequence retired (**recommended** — both tables empty so it costs two function edits now and a full FK migration later; structurally uncollidable; also removes M1's row lock) · **C** six-digit padded, requires fixing `migrateLegacyCode` too · **D** defer, and athlete onboarding stays blocked. **Secondary: rename `account_reference` `ATH-` → `PAY-`? (recommended: yes).** |
| D-34 | **D-01a containment timing** | **CLOSED 2026-08-15 — contained, applied, verified.** Migration **`20260814210328_m5_d01a_athletes_bridge_containment`** (local filename renamed to the stamped version per D-16). `authenticated` now holds **SELECT only** on `public.athletes` — `INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER` revoked — and `self_identity_policy` (FOR ALL) is replaced by `athletes_self_read` (SELECT, `user_id = auth.uid()`). **The block is at the privilege layer (42501), before RLS and before the FK, so it does not depend on the `public.users`/`auth.users` disconnection remaining true.** Verified against live production in a rolled-back transaction **with the bridge row present**: attacker INSERT **BLOCKED 42501**, attacker UPDATE **BLOCKED 42501**, attacker reads `athlete=0 guardian_contact=0 biometric=0 injury=0 custody=0`; `service_role` still creates claims (**legitimate path intact**); legitimate owner still sees `own_bridge=1 own_athlete=1 own_guardian_contact=1` (**guardian path structurally possible**). `anon` holds no grant. Data unchanged (6/13/3/8, sequence 504). Rollback written and stored alongside. Re-runnable mutation probe: `supabase/tests/d01a_containment_probe.sql` — V1 returns SUCCEEDED against the pre-M5 schema and BLOCKED against the current one. **Deliberately NOT done:** no `UNIQUE` on `passport_athlete_id` (cardinality is a D-37 identity-model decision, and the live F-5 two-guardian household suggests 1:1 would be wrong), and no `FORCE RLS` (gated on D-35). **This is D-01a containment, not "RLS complete".** Original 0.4 text follows. — **OPEN — OWNER DECISION, raised 0.4. Recommended: now, as ordinary work.** D-01a is **LATENT, not live** — proven in a rolled-back transaction: an authenticated user with no `public.users` row is **BLOCKED at SQLSTATE 23503** (`athletes_user_id_fkey`); the same user given a `public.users` row **succeeds** and reads the victim's name, DOB, guardian name and contact. **The containment is the foreign key, not the RLS policy** — 0.3L's "contained only because uuids are not enumerable" was wrong. `auth.users` and `public.users` have **zero overlap** and no trigger bridges them, so the exploit is inert — **and it arms the instant onboarding, a parent portal, or a standard `handle_new_user()` trigger builds that bridge. The repair and the vulnerability are the same edit.** VERIFIED: **no application code has ever written `public.athletes`** (one read, service-role, `dashboard/route.ts:410`), so revoking write grants costs nothing functionally. No emergency migration is warranted today; items 1–2 of the minimum containment set must nonetheless land **before** any bridge. See [`RLS_IDENTITY_THREAT_MODEL.md`](RLS_IDENTITY_THREAT_MODEL.md) §3. |
| D-42 | **`/api/v1/sessions/evaluate` documents a stock-reservation workflow that cannot work** | **OPEN — application defect, found 2026-08-15 while investigating D-31.** The route is **deployed and fail-closed** (GET → 405, POST → 401 without a JWT). Its header states: *"if the metrics object carries a physical size adjustment (skate_size / protective_kit_size), the matching column on public.athlete is updated — which fires trg_inventory_allocation and reserves physical stock automatically."* **Every link in that sentence is false in production.** `public.athlete` has neither column, so the `UPDATE public.athlete SET skate_size = …` at `route.ts:182` fails; `trg_inventory_allocation` does not exist; `inventory_waitlist_alerts` does not exist; and `commercial_inventory` holds 0 rows. **The route fails honestly** — it commits the metric log first, then returns `500 SIZING_SYNC_FAILED` with the committed `metric_log_id` and the pending patch, so no data is lost and ops can compensate. It has also never been exercised: no `SESSION_EVALUATION` row exists in `athlete_metrics_log`. **Applying D-31's migration would NOT fix this** — it deliberately does not add the size columns, and detects their absence to attach an inert INSERT-only trigger. So the choice is a product one: either build the sizing/stock feature properly (columns + inventory rows + trigger), or delete the sizing branch from the route and the misleading comment. **Recommendation: delete the branch.** `commercial_inventory` has never held a row, so this is documentation of an intention, not a regression. |
| D-41 | **`20260713_cohort_telemetry_scouting_metric_log_rls.sql` is not valid SQL** | **CLOSED 2026-08-15 — superseded, owner-approved.** Moved to `supabase/migrations/superseded/`, **byte-identical** (git records a 100% rename); the CLI reads only `*.sql` directly in `migrations/`, so it is out of the replay path without being edited or deleted. Rationale in `superseded/README.md`, covering all four required points: Postgres rejects `CREATE POLICY IF NOT EXISTS`; the policies it names are absent from production; the live policies on `cohort_telemetry`/`scouting_metric_log` are `sec001`'s `tenant_isolation_policy`/`tenant_member_policy`; therefore it cannot be treated as an executable historical migration. **No `migration repair` was run — production's ledger row is untouched**, and a live check confirmed **no policy named `allow_%` exists anywhere in production**, which is independent proof the file never ran. Its intent is already satisfied by `sec001`, so nothing is lost; if that ever changes the fix is a new forward migration. Original text follows. — **raised 2026-08-15 by the local replay.** The file contains **five** `CREATE POLICY IF NOT EXISTS` statements. **PostgreSQL has never supported `IF NOT EXISTS` on `CREATE POLICY`, in any version** — the file has never been executable as written, and the local chain stops there with `42601 syntax error at or near "NOT"`. Its policy names (`allow_authenticated_select_on_cohort_telemetry`, `allow_owner_insert_on_scouting_metric_log`, `allow_owner_select_on_scouting_metric_log`) **do not exist in production**; the policies `cohort_telemetry` and `scouting_metric_log` actually carry are `tenant_isolation_policy` / `tenant_member_policy` from `20260720100000_sec001_full_surface_rls_lockdown.sql`. **This is a second, independently proven instance of the `inventory_allocation_trigger` pattern (D-31): recorded in the ledger, objects absent, and in this case demonstrably incapable of having produced them.** Not modified — the brief forbids silently rewriting history, and the file is evidence. Options: **(a) mark superseded and exclude from replay (recommended — keeps the evidence, unblocks the chain)**, (b) correct the five statements to `drop policy if exists` + `create policy` (a history rewrite, needs explicit approval), (c) delete as never-applied. **Blocks completing the local replay, which in turn blocks moving M6 out of `pending/`.** |
| D-40 | **⚠ The migration directory cannot rebuild the database — and the ledger was rewritten** | **RECONSTRUCTION PATH WORKING 2026-08-15. The chain replays end to end from an empty database.** With D-41 superseded, all 38 files in the replay path apply — baseline + 37 historical — and `npx supabase start` completes. **The reconstruction was then verified against production and differs by exactly four objects, all from `20260720095900_inventory_allocation_trigger.sql`** (`inventory_waitlist_alerts`, `inventory_column_exists()`, `handle_inventory_allocation()`, `athlete.trg_inventory_allocation`). Everything else matches: 16 enum types, 48 policies, **2 FORCE-RLS tables**, 4 views, and 67 vs 68 tables / 643 vs 652 columns / 313 vs 314 constraints / 23 vs 25 functions / 17 vs 18 triggers — every delta accounted for by those four objects. **That settles D-31**: the migration is executable, so its absence from production is non-execution, not impossibility. A third defect surfaced during the replay and it was in the *baseline*, not history: `public.link_guardian` looks like an orphan but the chain creates it as `nrhl_link_guardian` and renames it (`20260811120000`), so defining it in the baseline broke that rename with `42723`. **Detecting orphans by current name misses every renamed object** — removed; baseline function count 5 → 4. **Still unresolved: the ledger rewrite itself.** The baseline fixes reconstruction; it does not restore the deleted `bigice_academy_name_parity` row or explain who rewrote the table. Earlier status follows. — **BASELINE BUILT AND VERIFIED 2026-08-15 (owner-approved).** `supabase/migrations/00000000000000_baseline_pre_migrations.sql` (59 KB) generated by reading `pg_catalog`/`information_schema` — production read-only throughout, no repair/push/pull, no ledger write, no historical migration reordered or rewritten. **Verified object-for-object against production: 31 tables / 273 columns (all 31 matching individually) / 16 enum types / 120 constraints (31 PK, 11 UNIQUE, 27 CHECK, 51 FK) / 23 indexes / 5 functions / 3 triggers / 3 views / 27 RLS-enabled / 0 `anon` grants / 0 policies (migrations own those).** **Docker became available**, so the replay ran for real: the baseline applies and the chain now reaches **ten files deep** — `public.athlete` resolves and the original blocker is gone — stopping at a *pre-existing* defect, now **D-41**. Two defects in the generated baseline were caught and fixed, and both are the argument for replaying rather than trusting a dump: **(a)** re-adding a PRIMARY KEY raises `42P16 invalid_table_definition`, not `duplicate_object`, so the idempotency guard was incomplete; **(b)** `biometric_record.chronological_bone_age_delta` is `GENERATED ALWAYS AS (…) STORED`, but `pg_attrdef` stores generated expressions and defaults alike, so it was emitted as a `DEFAULT` and failed with `0A000` — **every count and catalog comparison matched; only the replay caught it.** Original text follows. — **RECONCILED 2026-08-15, full report in [`D40_MIGRATION_HISTORY_RECONCILIATION.md`](D40_MIGRATION_HISTORY_RECONCILIATION.md). Read-only; nothing changed.** Two findings. **(1) The `supabase/migrations` directory has never been this database's origin.** 38 files create 37 tables; production has **67**, so **31 (46%) have no creating migration** — including `public.athlete`, `provenance`, `guardian_contact`, `biometric_record`, `injury_record`, `custody_record`, `metric_value`, the commercial catalogue and **the entire `athlytica_core` schema**. Five FK targets are referenced but never created: `public.athlete` (5 files), `athlytica_core.athletes`, `athlytica_core.parents`, `public.club`, and `auth.users` (legitimately external). **This is exactly why `npx supabase start` failed at `20260709_multi_sport_junctions.sql`** — it is the *first* file in replay order and its *third line* is `REFERENCES public.athlete(athlete_id)`; `IF NOT EXISTS` guards the table being created, not the one being referenced. **The failure is correct behaviour by a consistent tool against an inconsistent history — not a migration to repair.** Also corrects R5: `db push` would halt on the **1st** file, not the 6th. **(2) The production ledger was rewritten between 2026-08-13 and 2026-08-15.** Same tool, same project, different data: 0.3L saw 36 rows with wall-clock versions including `bigice_academy_name_parity`; today shows 38 rows whose versions match the local filenames exactly, with that row **gone** — while its effect survives (`commercial_price_tier` still carries "3-Month Development" etc.). `created_by` splits cleanly: **32 rows null** (CLI family) + **6 rows `dennislumush@gmail.com`** (MCP `apply_migration`) = the 38 local files. Most probable cause: a **`supabase db pull` / link-and-reconcile flow**, which is what `307bacb`'s own message announced. **Recorded as probable, not proven** — there is no audit trail. **The ledger now describes the repository, not the database.** Both the 0.3L numbers and today's are therefore withdrawn; object existence is the only witness that cannot be back-dated. **Recommended (not executed): generate a `00000000000000_baseline_pre_migrations.sql` from `supabase db dump` (a read) so a clean database can replay — this also unblocks D-35 locally.** **D-32 is reinforced: `migration repair` writes exactly this table.** Original text follows. — **raised 2026-08-15, and it supersedes the arithmetic in D-16, R5, R7 and D-31.** Reading `supabase_migrations.schema_migrations` **directly** gives a different answer from the MCP `list_migrations` tool that 0.3L relied on. Direct table: **38 rows, whose versions match all 38 local filenames exactly** — including `20260709`, `20260713`, `20260714` and `20260720095900`, the three short-form versions and the file 0.3L called "never applied". `list_migrations`: **36 rows**, wall-clock versions (`20260719215746` etc.), and it includes `bigice_academy_name_parity`, which **does not exist in the table at all**. So 0.3L's "5 match / 30 renamed / 1 applied-with-no-source / 2 never-applied" is measured against a source that does not agree with the database's own ledger, and **R7 (`bigice_academy_name_parity` applied with no local file) is not reproducible from the table.** Worse, the table is **not reliable either**: `20260720095900 inventory_allocation_trigger` is recorded as applied, and **none of its objects exist** — no `public.inventory_waitlist_alerts`, no `handle_inventory_allocation()`, no `inventory_column_exists()`. `created_by` is mixed `(null)` / `dennislumush@gmail.com`, so at least two mechanisms have written to it. **Nothing was changed.** Do not recompute D-16 from either source alone; reconcile against the *schema* (object existence), which is the only witness that cannot be back-dated. **This strengthens D-32 considerably**: `supabase migration repair` rewrites exactly this table, and we now know it disagrees with reality in at least one place. |
| D-38 | **`pnpm verify:production` is blind — Vercel CLI token expired** | **OPEN — raised 2026-08-15.** The script exits `Vercel API 403: {"code":"forbidden","invalidToken":true}` before reaching its HTTP probes, so the deployment-chain guardrail built in 0.3K cannot currently answer "is production running this commit?". **The chain itself is intact** — 8 direct HTTP probes on `athlytica-systems-engine.vercel.app` plus the proxied `www.nairobihockey.com/register` all returned the expected codes on 2026-08-15, including `410` on the retired Google Forms route and `200` on `/api/v1/public/nrhl/verify?code=ATH-00047`. **Owner action: `npx vercel login`.** Credentials were deliberately not refreshed or replaced from this session. Until it is fixed, "deployed" claims must be backed by direct probes and cannot be backed by the guard — which is exactly the ambiguity D-28 existed to remove, so this should not be left long. |
| D-39 | **Duplicate unique index on `public.athlete.passport_id`** | **OPEN — cosmetic, raised 2026-08-15.** Two unique indexes cover the same column: `athlete_passport_id_key` (plain UNIQUE) and `uq_athlete_passport_id` (`UNIQUE ... WHERE passport_id IS NOT NULL`). The partial one is redundant — a plain UNIQUE already permits multiple NULLs — so every row pays an extra index write. Drop `uq_athlete_passport_id`. Not done: zero rows today, zero benefit to doing it now, and it is unrelated to any open decision. |
| D-35 | **Provide an isolated Postgres environment** | **STILL BLOCKED — 2026-08-15, runbook written.** Operator checklist and the full 17-case FORCE RLS test matrix are now in [`D35_ISOLATED_ENVIRONMENT_RUNBOOK.md`](D35_ISOLATED_ENVIRONMENT_RUNBOOK.md), including exit criteria. Highest-risk case is #9: `settle_payment_transaction` writes `registrations`, whose `tenant_isolation_policy` reads `app_tenant_id()`, which is **NULL in a service-role connection** — under FORCE this plausibly denies the write and **breaks checkout**, so **D-01b must be resolved before FORCE reaches that table**. Cases 15–17 (concurrent creation) are the ones this environment structurally cannot run, which is the whole reason D-35 exists. Diagnosis unchanged, below. — **root cause identified.** Docker CLI **is** installed (v29.7.2) and Docker Desktop **is** installed at `C:\Program Files\Docker\Docker\Docker Desktop.exe`. It was launched as part of this check and the engine **failed to start**: `failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`, then `Docker Desktop is unable to start`. **Root cause: WSL is not installed** (`wsl --status` → "The Windows Subsystem for Linux is not installed"), and `com.docker.service` is `Stopped`/`Manual`. The session is **not elevated**, so neither `wsl --install` nor starting the service is possible from here. Docker Desktop was stopped again afterwards; the machine is as it was found. **Exact owner action:** run `wsl --install` from an **elevated** PowerShell, reboot, start Docker Desktop, then `npx supabase start` (the `supabase` CLI is not installed either, but `npx` works — `npx vercel` already does). Until then **no FORCE RLS behaviour may be claimed and M1 cannot be accepted**, and per the phase brief static analysis must not be substituted for runtime proof. Alternative: a paid Supabase branch (org is on free; branching needs Pro). Original 0.4 text follows. — **OPEN — OWNER DECISION, raised 0.4. Blocks completion of 0.4.** Open in substance since Phase 0.3 §4 was stopped for the same reason. Two acceptance gates cannot be discharged without it and **must not be discharged by static analysis**: (1) **FORCE RLS** — whether `jwt_athlete_ids()` still resolves when `public.athletes` is forced, whether policy→definer→forced-table recursion is reachable, whether `settle_payment_transaction` survives `FORCE` on `registrations` (it plausibly does not — `app_tenant_id()` is NULL in a service-role connection, which is why `tenant_isolation_policy` must be dropped first), and whether `service_role` is `BYPASSRLS` here; (2) **M1 cases 6 and 9** — concurrent creates and interleaved callers, which the Supabase MCP connector cannot run because it holds one session. Options: install Docker locally, or a paid Supabase branch (org is on free; branching needs Pro — this was OPS-1, closed as "not needed" in 0.2 and is now needed). |
| D-36 | **`jwt_athlete_ids()` unions two incompatible key spaces** | **OPEN — correctness defect, raised 0.4.** Branch 1 emits passport-plane ids (`athletes.passport_athlete_id → athlete.athlete_id`); branch 2 emits app-plane ids (`athlete_tenant_links.athlete_id → athletes.id`). **Measured overlap between the two sets: zero.** Each consuming policy gets a correct answer from one branch and silent noise from the other — `athlete`/`guardian_contact`/`biometric_record`/`injury_record`/`custody_record`/`cohort_session_registry` are passport-plane (branch 1 correct), `sessions` is app-plane (branch 2 correct). In the D-34 exploit proof the helper returned **7** ids while exactly **1** produced a readable row. **This corrects 0.3L §6.5:** coach-scoped PII visibility is *not* live — it is a functional gap, not an exposure, and the FK guarantees branch 2 can never match a passport-plane table. The application implements the same bridge **correctly** in TypeScript (`app/api/v1/mcp/route.ts`, `verifyAthleteTenantBoundary`); the SQL helper is a partial transcription of it. Fix and corrected SQL in [`RLS_IDENTITY_THREAT_MODEL.md`](RLS_IDENTITY_THREAT_MODEL.md) §2 — **but it switches on visibility that has never worked, so it is a behavioural change and must not be bundled with containment.** |
| D-37 | **`public.users` — retire or bridge?** | **OPEN — raised 0.4, upstream of the parent portal.** Two disconnected user tables: `auth.users` (4 rows) is what the deployed app authorises on (`requireWorkspaceRole` → `auth.getUser()` → `workspace_roles`, both FK'd to `auth.users`); `public.users` (8 rows) is legacy seed data and is what `jwt_tenant_ids()`, `jwt_athlete_ids()` branch 2 and `/api/v1/mcp` `resolveCallerTenant()` all resolve through. **Zero id overlap, zero email overlap, no trigger on `auth.users`.** Consequence: every athlete-scoped and tenant-scoped policy denies every row for every possible caller, and `/api/v1/mcp` fails closed for every real user. The database is **safe by disconnection, not by policy**. Deciding this is the first task of 0.4 execution — and it is the edit that arms D-34. |
| D-20 / M1 | **Transactional athlete creation — status after 0.4 execution** | **BLOCKED on two counts, 2026-08-15. Not redesigned, deliberately.** The brief directs M1 to be redesigned "around the new identifier namespace" — but D-33 stopped at the decision boundary, so **there is no new namespace to design around**, and the previous `scalable_id_sequence` design may or may not survive it (B′ keeps a counter; a random-draw counter changes the concurrency model from "row lock" to "insert, catch 23505, retry"). Designing now would mean choosing D-33 by implication, which the brief forbids. Second blocker: the ten acceptance tests — concurrent Big Ice creates, concurrent NRHL creates, failed create, duplicate identity, retry, rollback, cross-venture, uniqueness, legacy coexistence, unauthorized direct invocation — need two concurrent sessions, and the Supabase MCP connector holds one. That is **D-35**. **M1 remains as designed in [`M1_DESIGN.md`](M1_DESIGN.md), unapplied.** The four properties the brief separates — identifier generation atomicity, row creation atomicity, uniqueness, concurrency — must be tested independently, and none of the four can be tested from here. |
| D-31 | **`inventory_allocation_trigger` — ledger says applied, objects do not exist** | **VERDICT 2026-08-15: SUPERSEDED / UNUSED. Recommendation: formally supersede. No production change required.** Investigated read-only against production plus a behavioural test in the isolated reconstruction. **(1) Production has none of the four objects**, and no `%inventory%` object exists beyond `commercial_inventory` and its own indexes. **(2) Repository references outside the migration: exactly two.** `20260720100000_sec001_full_surface_rls_lockdown.sql:269` lists `inventory_waitlist_alerts` but guards it with `if to_regclass('public.'||t) is null then continue` — it runs *after* this migration and correctly skips the absent table, so nothing breaks. `app/api/v1/sessions/evaluate/route.ts` names the trigger in comments and defines `SIZING_COLUMNS = ['skate_size','protective_kit_size']`. **(3) No live workflow depends on them.** `commercial_inventory` holds **0 rows** — there is no stock to allocate; `organization_source`, which the function reads, **exists on no table in the database**; and `public.athlete` has **no `skate_size` or `protective_kit_size` column**, which is the input the whole mechanism keys on. **(4) The route has never fired.** `athlete_metrics_log` holds 62 rows and **none** carries the route's default `SESSION_EVALUATION` code, so its sizing path has never executed in production. **(5) Behavioural proof, run in the isolated reconstruction where all four objects DO exist:** the trigger is `AFTER INSERT ON public.athlete FOR EACH ROW`; inserting an athlete **succeeded and wrote 0 rows to `inventory_waitlist_alerts`**, touching nothing. `handle_inventory_allocation()` returns `NEW` immediately because `to_jsonb(NEW)->>'skate_size'` is NULL on a table without that column. **Applying this migration to production would be a functional no-op that adds a trigger to the athlete-creation path — the path M1 is about — and would still not make the route work, because the migration does not add the missing columns.** **(6) Whether it ever existed in production: UNKNOWN, and no evidence exists either way.** `schema_migrations` has no timestamp column, `audit_log` is empty (0 rows) and is a domain log rather than a DDL trail, no index or comment residue remains, and no `pg_depend` trace survives. The only indicator — not proof — is that `sec001`, written to run immediately after it, guards the table with `to_regclass`, which suggests its author already expected it to be absent. Its ledger row carries 6 recorded statements and `created_by` null, i.e. the CLI-family writer (D-40 §2). Earlier text follows. — **REFINED again 2026-08-15 by the local replay: the file is VALID SQL and applies cleanly.** It ran without error as the 11th file of the clean reconstruction, so — unlike D-41 — it is *executable*. That narrows the cause: its objects are absent from production not because the migration could not run, but because **it was recorded as applied without being executed there** (or was executed and later dropped). The two cases are now cleanly separated: **D-41 could never have run; D-31 could have and apparently did not.** Both produce the same false ledger row, which is the D-40 finding. Earlier text follows. — **RESTATED 2026-08-15, sharper and worse than first recorded. See D-40.** 0.3L said "never applied", inferred from `list_migrations` and from finding no triggers on `commercial_inventory`. Both were wrong: the migration is **present in `supabase_migrations.schema_migrations`** as `20260720095900`, and it never targeted `commercial_inventory` at all — it targets `public.athlete`, and deliberately skips attaching its trigger when the `skate_size`/`protective_kit_size` columns are absent (which they are). But the decisive check is object existence, and **none of its objects exist**: no `public.inventory_waitlist_alerts` table, no `handle_inventory_allocation()`, no `inventory_column_exists()`. **So the ledger records an application that did not happen.** That is a stronger finding than an unapplied file: it means the migration history contains at least one entry that does not describe the database. Apply it or delete it — but reconcile D-40 first, because the same question applies to every other row. Original 0.3L text follows. — **OPEN — owner/engineering, raised 0.3L.** `supabase/migrations/20260720095900_inventory_allocation_trigger.sql` exists locally, is absent from the applied ledger, and `public.commercial_inventory` has **no triggers at all** — verified live. It is the only file in the repository claiming a database object that does not exist. Apply it or delete it; leaving it is a third source of truth about what the schema is. |
| D-01a | **`public.athletes` privilege escalation** | **OPEN — re-graded 0.4: LATENT, not live. See D-34 for the decision and the proof.** The 0.3L text below overstated current severity and misidentified the containment: the block is `athletes_user_id_fkey` → `public.users` (SQLSTATE 23503), **not** uuid unguessability, and the exploit arms the moment `auth.users` → `public.users` is bridged. Original 0.3L text follows. — **OPEN — HIGH, raised 0.3L. Must close before the first real athlete row is written.** Policy `self_identity_policy` is `FOR ALL` for `authenticated` with `USING`/`WITH CHECK` on `user_id = auth.uid()` only; `authenticated` holds `INSERT`/`UPDATE` grants; **`passport_athlete_id` is unconstrained and carries no UNIQUE constraint** (only `FK → athlete(athlete_id)`). That column is the first branch of `jwt_athlete_ids()`, which is the `USING` clause of the SELECT policy on `athlete`, `guardian_contact`, `biometric_record`, `injury_record`, `custody_record` and `cohort_session_registry`. **A signed-in user can point their own row at any athlete uuid that exists and read that child's name, DOB, national-ID hash, guardian contacts, injuries, biometrics and custody record.** Contained today only because uuids are not enumerable and all 13 `athlete` rows plus 3 `guardian_contact` rows are synthetic. The missing UNIQUE also means an attacker who learns a uuid can claim it *before* the legitimate parent. See 0.3L §6.3. |
| D-01b | **Dormant `FOR ALL` policy on the money path** | **OPEN — raised 0.3L.** `tenant_isolation_policy` is a `FOR ALL` policy applied to **PUBLIC** on `registrations`, `performance_logs`, `cohort_telemetry` and `scouting_metric_log`, gated on `app_tenant_id() = nullif(current_setting('app.current_tenant_id', true),'')::uuid`. A PostgREST client cannot set that GUC, so it evaluates NULL and the policy grants nothing — **inert, verified.** But permissive policies OR together: the day anything sets that GUC (a PostgREST `pre-request` hook, a pooled-connection initialiser, any server path), it becomes an **all-command** door on `registrations`, the table M4 matches payments against. Delete or restrict it. See 0.3L §6.4. |
| D-01c | **`FORCE ROW LEVEL SECURITY` is almost entirely absent** | **OPEN — raised 0.3L.** Only **2 of 64** `public` tables have `FORCE RLS`: `cohort_telemetry` and `scouting_metric_log`. On the other 62 the `postgres` table owner bypasses every policy, so migrations, admin tooling and any `postgres`-connected job see everything regardless of RLS. The six `crm_*` tables are in this set. For tables holding PII or money, `FORCE` should be the default. See 0.3L §6.2. |
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
