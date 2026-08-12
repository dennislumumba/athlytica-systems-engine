# DQ-050 — NRHL-COMP-v1 Certificate Impact Analysis

**Status:** ANALYSIS. **No certificate altered, reissued or invalidated.**
**Date:** 2026-08-12

---

## 1. The formula is sound and reproducible

`NRHL-COMP-v1` = `attendance% + (20 × avg_coach_grade) + points`

Re-derived independently against the five dossier-attested athletes:

| Athlete | attendance | coach grade | points | computed | recorded | residual |
|---|---|---|---|---|---|---|
| Noel Inoue | 100.000 | 4.000 | 124 | **304.00** | 304.00 | 0.000 |
| Sam Inoue | 100.000 | 3.900 | 87 | **265.00** | 265.00 | 0.000 |
| Asher Weening | 100.000 | 3.857 | 82 | **259.14** | 259.14 | 0.000 |
| Benson Mbatia | 88.889 | 3.000 | 51 | **199.89** | 199.89 | 0.001 |
| Leon Sila | 100.000 | 3.194 | 5 | **168.88** | 168.87 | 0.010 |

**Rankings are reproducible.** Residuals are rounding artefacts (the sheet
displays attendance to 1 dp while computing on the full fraction). The problem
is not arithmetic error.

---

## 2. The problem is structural — and it is exposure, not discipline

The dossier attributes the distortion to *discipline* (five certified athletes
"all Inline Skating discipline" scoring a structural zero). **Measured against
`athlete_individual_stats.csv`, that is not the driver.**

| Fact | Value |
|---|---|
| Athletes with `points > 0` | 15 |
| Athletes with `points = 0` | **16** |
| Of those 16, how many have `games_played = 0` | **16 — all of them** |
| Discipline label of every zero-point athlete | `Inline / Roller Hockey` (28 of 31 rows carry this label) |

Every athlete scoring zero on the points term has **zero scrimmage
appearances**. Not one of them played and failed to score. The discipline label
is nearly constant across the file and therefore cannot be the discriminator.

**Corrected diagnosis: the points term is gated by *exposure* (did you appear in
a scrimmage), not by *discipline*.** This matters, because segmenting the
percentile by discipline — the dossier's recommendation — would **not fix it**.
The zero-point athletes share the same discipline label as the scorers.

The distortion set, 13 athletes with real attendance and zero exposure:

| Athlete | Attendance | Games | Points |
|---|---|---|---|
| Bridgit Aridi, Eli Araka, Jaydan Morara, Leila Nyokabi, Maya Aridi, Nahayan Masawi, Nile Masawi, Nyla Masawi, Scooter Araka | 100.0% | 0 | 0 |
| Amari Skudi | 92.3% | 0 | 0 |
| Gabi Helena | 88.2% | 0 | 0 |
| Louis | 50.0% | 0 | 0 |
| Leroy Sila | 40.0% | 0 | 0 |

Nine athletes with **perfect attendance** are structurally incapable of scoring
on a term worth up to 124 points.

---

## 3. Term dominance

| Term | Range | Reachable by |
|---|---|---|
| attendance% | 0–100 | everyone |
| 20 × coach grade | 0–100 | everyone |
| points | **0–124** | **only scrimmage participants** |

The single term with the **largest range** is the only one not universally
reachable. A composite built this way does not measure the same construct for
two athletes drawn from the same pool.

---

## 4. The reported inversion — confirmed arithmetically

Jaydan Morara: 19 sessions, 100% attendance, 0 points *(dossier-attested; he is
absent from the 31-row stats extract, which lists him at 0 games)*.
Luke Rashed: 1 session, 4 points, 100% attendance.

| Counterfactual | Jaydan | Luke | Result |
|---|---|---|---|
| **A** — attendance term only | 100.00 | 100.00 | tie |
| **B** — full `NRHL-COMP-v1`, coach grade held equal at 3.0 | **160.00** | **164.00** | **Luke ranks above Jaydan** |

The gap is exactly 4.00 — Luke's points term. **One scrimmage appearance
outweighs eighteen additional training sessions.** The inversion is real and
reproducible.

Coach grade for both is unknown, so B holds it constant to isolate the points
term. If Jaydan's grade exceeded Luke's by ≥0.2 the ordering would flip back —
which is itself the point: the ranking is decided by a term one athlete could
not contest.

---

## 5. What cannot be determined here

**Tier recomputation is not possible with the available data.** Stated plainly:

- Certificate tiers are `PERCENTRANK` over the **n=18 certified pool**.
- That pool lives in the **`Certificate Tracker`** tab.
- **`Certificate Tracker` is absent from the local corpus** — it is one of four
  tabs present in the 16-tab workbook but never exported locally.
- The 31-row `athlete_individual_stats.csv` is a *different population* and is
  not a substitute.
- `avg_coach_grade` is available for only 5 of 18 athletes.

Therefore the following are **UNKNOWN** and must not be estimated:

| Question | Status |
|---|---|
| Number of athletes affected | UNKNOWN — 13 with zero exposure in a 31-row proxy; the certified pool is n=18 |
| Number of certificates affected | UNKNOWN |
| Dates affected | UNKNOWN — `certificate_issued_at` column exists; `nrhl_athlete` has **0 rows**, so no issuance is recorded in the database |
| Whether any tier would change | **UNKNOWN — cannot be computed** |

**Note:** `nrhl_athlete` is empty, so no certificate is recorded in production.
Whatever was issued was issued from the spreadsheet, outside the system.

---

## 6. Tier-change sensitivity (bounded, not computed)

What can be said without the pool:

- Tier boundaries are at the **90th** and **70th** percentile of n=18 → the
  Elite/Advanced cut sits between ranks 2 and 3, Advanced/Core between ranks 5
  and 6. Both are decided by ~1–2 positions.
- The points term spans 0–124 while the two universal terms span 0–100 each.
  A shift of 4 points moved one documented pair. **Boundaries decided by 1–2
  positions, perturbed by a term with the widest range, is a configuration
  where tier changes are likely rather than unlikely.**
- Nine athletes hold 100% attendance and 0 exposure. If they cluster near a
  boundary, an exposure-qualified recomputation moves several at once.

This is a sensitivity argument, not a result. It justifies investigation; it
does not establish that any specific certificate is wrong.

---

## 7. Recommendation

**MANUAL REVIEW** — for the cohort, not per-athlete, and not yet actionable.

| Option | Assessment |
|---|---|
| NO ACTION | Rejected. The inversion is confirmed and the mechanism is understood. |
| MONITOR | Insufficient — the flaw is structural, so it recurs on every issuance. |
| REISSUE | **Premature and prohibited.** The pool cannot be reconstructed, so a reissue would replace one unverifiable ranking with another. |
| **MANUAL REVIEW** | **Recommended.** |

Sequenced:

1. **Recover `Certificate Tracker`** in the authoritative export (§G). Nothing
   further is possible without it.
2. Recompute `NRHL-COMP-v1` for the true n=18 and confirm it reproduces the
   issued tiers. *If it does not reproduce them, the problem is larger than
   DQ-050 and this analysis is superseded.*
3. Recompute under `NRHL-COMP-v2` with exposure qualification
   (`SCORING_ELIGIBILITY_FRAMEWORK.md`).
4. Produce the three-column comparison — CURRENT / DISCIPLINE-APPROPRIATE /
   MINIMUM-EXPOSURE-QUALIFIED — per athlete.
5. Only then decide per athlete: tier unchanged / tier potentially changed.

**Freeze on new issuance.** No further certificate should be generated under
`NRHL-COMP-v1` until step 4 completes. That is a forward control and costs
nothing — `nrhl_athlete` is empty, so no automated issuance path is live.

**Historical certificates are not altered.** Any correction is additive: a v2
score recorded alongside v1, with both formula versions retained. A child who
was told they were an Elite All-Rounder is not un-told it by a spreadsheet fix.

---

## 8. Open decisions

| ID | Question | Blocks |
|---|---|---|
| **D-17** | Does exposure qualification apply retroactively, or only from v2 forward? | step 5 |
| **D-18** | Minimum exposure for the points term to count — 1 appearance? 3? | v2 definition |
| **D-19** | Should non-participants be excluded from the pool, or scored on a reduced composite with lower confidence? | v2 definition |
| D-04 | Authoritative export must include `Certificate Tracker` | **all of the above** |
