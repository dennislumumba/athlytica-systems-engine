# Scoring Eligibility Framework — Phase 0.1

**Status:** DESIGN. **Not implemented. Not approved.**
**Date:** 2026-08-12

Derived from the DQ-050 finding: a composite whose largest term is reachable by
only part of the population is not one score, it is two scores sharing a column.

---

## 1. Four orthogonal quantities

The core error in `NRHL-COMP-v1` is that these are collapsed into one number.

| Quantity | Answers | Range | Never used as |
|---|---|---|---|
| **PERFORMANCE** | How well did they do? | 0–100 | evidence of how much we know |
| **CONFIDENCE** | How much do we know? | 0–1 | a penalty on performance |
| **EXPOSURE** | How much opportunity did they have? | count | a performance signal |
| **COMPARISON POPULATION** | Against whom is this meaningful? | set | implicit or global |

**A low-exposure athlete may have a high performance score and low confidence.**
That is a correct and useful state. The framework must be able to express it;
`NRHL-COMP-v1` cannot, because zero exposure silently becomes zero performance.

---

## 2. The rule that would have prevented DQ-050

> **A score may only be compared within a population where every member was
> eligible to generate every component of that score.**

Under this rule, Jaydan Morara (0 scrimmage appearances) and Luke Rashed (1
appearance) are **not in the same comparison population** for a composite
containing a scrimmage-points term. Ranking them against each other is not a
close call — it is undefined.

---

## 3. Eligibility model

```sql
create table athlytica_core.scoring_rule (
  rule_id            text primary key,          -- 'NRHL-COMP-v2'
  supersedes         text references athlytica_core.scoring_rule,
  discipline_scope   text[] not null,
  population_key     text[] not null,           -- what defines "comparable"
  components         jsonb not null,            -- metric_id -> weight + eligibility
  min_exposure       jsonb not null,            -- per component
  min_sample         integer not null,
  confidence_method  text not null,
  effective_from     date not null,
  status             text not null check (status in ('DRAFT','ACTIVE','SUPERSEDED')),
  created_at         timestamptz not null default now()
);

create table athlytica_core.score_result (
  score_id           uuid primary key default gen_random_uuid(),
  athlete_uid        uuid not null references athlytica_core.athlete,
  rule_id            text not null references athlytica_core.scoring_rule,
  performance        numeric,                   -- NULL if not computable
  confidence         numeric check (confidence between 0 and 1),
  exposure           jsonb not null,            -- observed counts per component
  qualification      text not null check (qualification in
                       ('PROVISIONAL','EMERGING','QUALIFIED','NOT_ELIGIBLE')),
  population_id      text not null,             -- the cohort this was ranked in
  percentile         numeric,                   -- NULL unless QUALIFIED
  component_detail   jsonb not null,            -- every input, weight, contribution
  computed_at        timestamptz not null default now(),
  benchmark_version  text,
  unique (athlete_uid, rule_id, population_id, computed_at)
);
```

`performance` is **nullable**. A component the athlete was never eligible for
produces `NULL`, never `0`. This single choice is what fixes DQ-050.

---

## 4. Qualification statuses

| Status | Meaning | Percentile? | Parent-facing? |
|---|---|---|---|
| `NOT_ELIGIBLE` | Never eligible for a required component (e.g. no scrimmage exists for their programme) | **no** | shown as "not applicable", never as a low score |
| `PROVISIONAL` | Eligible, below minimum sample | **no** | performance shown with an explicit confidence band |
| `EMERGING` | Meets minimum sample, below full sample | **within the emerging cohort only** | yes, labelled |
| `QUALIFIED` | Meets full sample on every component | **yes** | yes |

**Nobody is ranked against a population they could not compete in.** An
`EMERGING` athlete is ranked among `EMERGING` athletes, not against `QUALIFIED`
ones — and not excluded from feedback entirely.

### Exact thresholds (proposed — D-18)

| Component | NOT_ELIGIBLE | PROVISIONAL | EMERGING | QUALIFIED |
|---|---|---|---|---|
| Scrimmage points | no fixture available to them | 1–2 appearances | 3–5 | ≥ 6 |
| Attendance rate | no scheduled sessions | 1–4 sessions | 5–9 | ≥ 10 |
| Coach grade | never graded | 1–2 grades | 3–5 | ≥ 6 |
| Technical compliance ordinals | never observed | 1–4 obs | 5–9 | ≥ 10 |
| Timed baseline (10m/20m) | never attempted | 1 trial | 2 trials | ≥ 3 trials |

Anchored on observed data: the certified cohort's `games_played` runs 0–12, and
the modal non-zero value is small — so a ≥6 bar for QUALIFIED separates the top
scorers from one-off appearances without excluding most participants.

---

## 5. Confidence, computed not asserted

```
confidence = min over components of ( observed_n / qualified_n ), capped at 1.0
             × observation_quality_factor
             × recency_factor
```

| Factor | Basis |
|---|---|
| `observation_quality_factor` | 1.0 verified instrument · 0.8 single-observer rubric-anchored · 0.6 single-observer unanchored · 0.4 derived-from-derived |
| `recency_factor` | 1.0 within the season · 0.8 previous season · 0.6 older |

Confidence **never** reduces `performance`. It is reported beside it. The
existing `analyticsEngine.ts` already gets this right — its contract states
*"downstream consumers MUST weight by confidence, never treat 50 as measured"* —
and this framework extends the same discipline to composites.

---

## 6. Comparison population

```
population_id = hash(discipline, age_band, season, qualification_status, rule_id)
```

Two athletes are comparable only when all five match. `population_key` is
declared on the rule, so it is auditable rather than implicit.

`percentile` is `NULL` unless `qualification = 'QUALIFIED'` **and** the
population has `n ≥ min_sample`. A percentile over n=18 with a 90th-percentile
tier boundary decides Elite membership between ranks 2 and 3 — too thin to
publish without a stated minimum.

---

## 7. `NRHL-COMP-v2` — proposed

```jsonc
{
  "rule_id": "NRHL-COMP-v2",
  "supersedes": "NRHL-COMP-v1",
  "population_key": ["discipline", "age_band", "season", "qualification"],
  "min_sample": 8,
  "components": {
    "attendance_rate":  { "weight": 0.35, "eligibility": "has_scheduled_sessions" },
    "coach_grade_mean": { "weight": 0.35, "eligibility": "has_grades" },
    "nrhl_points_per_appearance": {
        "weight": 0.30,
        "eligibility": "has_scrimmage_appearance",
        "null_if_not_eligible": true
    }
  },
  "renormalise_on_ineligible": true
}
```

Four changes from v1, each traceable to a measured defect:

1. **Weights, not raw addition.** v1 added a 0–124 term to two 0–100 terms, so
   the widest-range term dominated by construction.
2. **Points per appearance, not total points.** Total points rewards being
   picked; per-appearance rewards performance.
3. **`null_if_not_eligible`** with renormalisation. A non-participant is scored
   on the two components they *could* generate, at proportionally higher weight
   — not handed a zero on the third.
4. **Population includes qualification status**, so `EMERGING` and `QUALIFIED`
   are never co-ranked.

**v1 is not deleted.** It stays `SUPERSEDED` with `effective_from`/`effective_to`,
and every historical `score_result` keeps the `rule_id` under which it was
generated. A v1 score and a v2 score for the same athlete coexist.

---

## 8. Worked example — the DQ-050 pair

Coach grades unknown; held equal at 3.0 to isolate the mechanism.

| | Jaydan Morara | Luke Rashed |
|---|---|---|
| Sessions | 19 | 1 |
| Attendance | 100% | 100% |
| Appearances | 0 | 1 |
| Points | 0 | 4 |
| **v1 composite** | **160.00** | **164.00** → *Luke ranks higher* |
| v2 exposure | attendance QUALIFIED, points NOT_ELIGIBLE | attendance PROVISIONAL, points PROVISIONAL |
| v2 qualification | **PROVISIONAL** (points not eligible) | **PROVISIONAL** (below min sample everywhere) |
| v2 performance | attendance + grade, renormalised | attendance + grade + 4.0/appearance |
| v2 confidence | high on what was measured | **low** — 1 session |
| **v2 comparison** | **not ranked against each other on a points-bearing composite** | |

v2 does not declare Jaydan the winner. It declines to stage the contest — and
reports Luke's single session as low confidence rather than as evidence.

---

## 9. Explicit non-goals

- **Not a participation trophy.** A genuinely weaker athlete with full exposure
  still scores lower. Only the *ineligible* are protected, not the *unsuccessful*.
- **Not a way to hide small samples.** `PROVISIONAL` is visible and labelled.
- **Not retroactive by default.** Whether v2 re-ranks history is **D-17**.
- **Not a replacement for `NRHL-PTS-v1`.** The points formula is verified
  (94/94, 31/31, and the code constant) and unchanged. Only its *use inside a
  cross-athlete composite* is at issue.

---

## 10. Approval gates

| Gate | Requirement |
|---|---|
| G-E1 | D-18 — exposure thresholds approved |
| G-E2 | D-19 — non-participant treatment approved |
| G-E3 | D-17 — retroactivity approved |
| G-E4 | `Certificate Tracker` recovered so v1 is reproducible before v2 replaces it |
| G-E5 | v2 validated against the true n=18: every tier change explained by a named mechanism |

**No score is computed under v2 until all five pass.**
