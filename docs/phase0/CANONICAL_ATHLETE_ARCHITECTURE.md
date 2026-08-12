# Canonical Athlete Architecture — Phase 0

**Status:** DESIGN. Not applied to production.
**Date:** 2026-08-12
**Rule:** ONE PERSON = ONE CANONICAL ATHLETE.

---

## 1. Table designation register

Every athlete-bearing table gets exactly one designation. No ambiguity.

| Table | Designation | Rows | Disposition |
|---|---|---|---|
| **`athlytica_core.athlete`** *(new)* | **CANONICAL** | 0 | The single authoritative athlete identity. Created in Phase 1. |
| `athlytica_core.athlete_identifier` *(new)* | **CANONICAL** | 0 | Legacy identifier ledger. |
| `athlytica_core.organization` *(new)* | **CANONICAL** | 0 | BIG_ICE, NRHL, ATHLYTICA, TTA. |
| `athlytica_core.athlete_organization_membership` *(new)* | **CANONICAL** | 0 | Athlete ↔ organization. |
| `athlytica_core.enrollment` *(new)* | **CANONICAL** | 0 | Program enrollment, time-bounded. |
| `athlytica_core.observation` *(new)* | **CANONICAL** | 0 | Immutable raw observations. |
| `athlytica_core.parent` *(existing, renamed role)* | **CANONICAL** | 0 | Guardian identity. RLS pending. |
| `public.athlete` | **LEGACY** | 13 | Passport/provenance model. Read-only after cutover. Its `provenance` design is carried forward; its identity layer is not. |
| `public.athletes` | **MIRROR** | 6 | `auth.users` ↔ athlete join for the TTA telemetry path. Retained until the canonical membership model replaces it. |
| `athlytica_core.athletes` | **DEPRECATED** | 0 | Superseded by `athlytica_core.athlete`. Never populated. Drop in Phase 9. |
| `athlytica_core.performance_logs` | **DEPRECATED** | 0 | Superseded by `observation`. Never populated. |
| `public.nrhl_athlete` | **PROJECTION** | 0 | Becomes a view over canonical + NRHL membership. |
| `public.bigice_athlete` | **PROJECTION** | 0 | Becomes a view over canonical + BIG_ICE membership. |
| `public.performance_logs` | **LEGACY** | 24 | Append-only telemetry scores. Frozen; superseded by `observation` + derived layer. |
| `public.metric_value` | **LEGACY** | 44 | Superseded by `observation`. |
| `public.athlete_metrics_log` | **LEGACY** | 62 | Superseded by `observation`. |
| `public.scouting_metric_log` | **DEPRECATED** | 0 | Never populated. |
| `public.provenance` | **CANONICAL** | 12 | Kept as-is. Good design. Extended, not replaced. |
| `public.registrations`, `payment_events`, `commercial_price_tier` | **CANONICAL** | — | Commerce. Out of scope for this phase. **Unchanged.** |

**Nothing in the LEGACY, MIRROR or DEPRECATED rows is dropped in Phase 0.**
Designation is a label, not an action.

---

## 2. Why `athlytica_core` and not `public.athlete`

`public.athlete` is the better-designed of the three existing models — its
`provenance` FK pattern is the thing worth keeping. It is still not the right
canonical root, for three reasons:

1. It has no `observed_at` on any measurement path, and no place to put one
   without changing the meaning of existing columns.
2. It carries `passport_id`, `claim_token`, `parent_email` and `is_legacy`
   directly on the identity row — presentation and lifecycle state mixed into
   identity.
3. Its 13 rows include 7 test artefacts (§8), so "migrate in place" means
   migrating known-bad rows.

Building the canonical table fresh in `athlytica_core` costs one extra table
and buys a clean `observed_at`/`created_at` split from row one. `public.athlete`
is then read-only history, reachable through the identifier ledger.

**`athlytica_core` currently has RLS disabled.** That is fixed in this phase
(see `RLS_POLICY_MATRIX.md`) **before** any table there holds a row.

---

## 3. The layer model

```
ATHLETE                     identity only — no org, no program, no scores
   ↓
ORGANIZATION MEMBERSHIP     which orgs this person belongs to, and when
   ↓
ENROLLMENT                  which program, which term, which price tier
   ↓
OBSERVATION                 immutable raw facts, observed_at ≠ created_at
   ↓
DERIVED PERFORMANCE         recomputable scores, versioned rules
   ↓
PASSPORT PROJECTION         a view. never a store.
```

Each arrow is one-directional. Nothing below writes back to anything above.

### Layer boundaries — the rules that make this real

| Boundary | Rule |
|---|---|
| ATHLETE → MEMBERSHIP | An athlete row contains **no** organization column. Org is always a membership row. |
| MEMBERSHIP → ENROLLMENT | Membership says *belongs to*; enrollment says *is paying for and attending*. An athlete can be a member with zero enrollments. |
| ENROLLMENT → OBSERVATION | An observation references the organization directly, not through enrollment — observations survive an enrollment ending. |
| OBSERVATION → DERIVED | `observation` is INSERT-only, enforced by trigger. Derived tables are `TRUNCATE`-able by design. |
| DERIVED → PASSPORT | The passport is a `VIEW`. If it needs a table, it is a materialized view with a documented refresh. |

---

## 4. Canonical DDL (design — applied to a branch, not production)

```sql
-- ── IDENTITY ────────────────────────────────────────────────────────────
create table athlytica_core.athlete (
  athlete_uid      uuid primary key default gen_random_uuid(),   -- DB identity
  athlytica_id     text unique not null,                         -- ATH-000001, public
  legal_name       text not null,
  preferred_name   text,
  date_of_birth    date,                    -- nullable: not collected at source
  dob_confidence   text not null default 'UNKNOWN'
                   check (dob_confidence in ('VERIFIED','INFERRED','UNKNOWN')),
  sex_at_birth     text check (sex_at_birth in
                     ('male','female','intersex','undisclosed')),
  identity_status  text not null default 'PROVISIONAL'
                   check (identity_status in
                     ('PROVISIONAL','CONFIRMED','CONTESTED','MERGED','TEST')),
  merged_into_uid  uuid references athlytica_core.athlete(athlete_uid),
  record_class     text not null default 'PRODUCTION'
                   check (record_class in ('PRODUCTION','LEGACY','DEMO','TEST')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint merged_rows_point_somewhere
    check (identity_status <> 'MERGED' or merged_into_uid is not null)
);

-- ── PUBLIC ID ISSUANCE ──────────────────────────────────────────────────
create sequence athlytica_core.athlytica_id_seq start 1;   -- NOT the legacy 500

-- ── ORGANIZATION ────────────────────────────────────────────────────────
create table athlytica_core.organization (
  organization_id  uuid primary key default gen_random_uuid(),
  code             text unique not null,     -- BIG_ICE | NRHL | ATHLYTICA | TTA
  display_name     text not null,
  org_type         text not null check (org_type in
                     ('club','league','academy','school','private_coach',
                      'agency','federation','platform')),
  country_code     char(2),
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ── MEMBERSHIP ──────────────────────────────────────────────────────────
create table athlytica_core.athlete_organization_membership (
  membership_id    uuid primary key default gen_random_uuid(),
  athlete_uid      uuid not null references athlytica_core.athlete,
  organization_id  uuid not null references athlytica_core.organization,
  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','ENDED','SUSPENDED','UNASSIGNED')),
  joined_at        date,
  ended_at         date,
  source           text not null,        -- 'registration' | 'legacy_import' | 'manual'
  verified_at      timestamptz,
  provenance_id    uuid references public.provenance,
  created_at       timestamptz not null default now(),
  constraint membership_dates check (ended_at is null or ended_at >= joined_at),
  unique (athlete_uid, organization_id, joined_at)
);

-- ── ENROLLMENT ──────────────────────────────────────────────────────────
create table athlytica_core.enrollment (
  enrollment_id    uuid primary key default gen_random_uuid(),
  athlete_uid      uuid not null references athlytica_core.athlete,
  organization_id  uuid not null references athlytica_core.organization,
  program_label    text not null,
  discipline_code  text,                    -- nullable: UNKNOWN is legitimate
  price_tier_id    uuid references public.commercial_price_tier(tier_id),
  starts_on        date,
  ends_on          date,
  status           text not null default 'PENDING'
                   check (status in ('PENDING','ACTIVE','COMPLETED','CANCELLED')),
  source           text not null,
  provenance_id    uuid references public.provenance,
  created_at       timestamptz not null default now(),
  constraint enrollment_dates check (ends_on is null or ends_on >= starts_on)
);

-- ── OBSERVATION (immutable) ─────────────────────────────────────────────
create table athlytica_core.observation (
  observation_id       uuid primary key default gen_random_uuid(),
  athlete_uid          uuid not null references athlytica_core.athlete,
  organization_id      uuid references athlytica_core.organization,  -- null = UNASSIGNED
  metric_id            text not null,
  observation_type     text not null check (observation_type in
                         ('MEASUREMENT','COACH_ASSESSMENT','COUNT',
                          'OUTCOME','PARTICIPATION','COMPETITION')),

  raw_value            text not null,        -- verbatim from source, always
  value_numeric        numeric,              -- parsed, null if unparseable
  value_boolean        boolean,
  unit                 text not null,

  observed_at          timestamptz,          -- when it HAPPENED. null if unknown.
  observed_at_raw      text,                 -- the source date string, verbatim
  date_confidence      text not null default 'UNKNOWN'
                       check (date_confidence in
                         ('VERIFIED','AMBIGUOUS','UNKNOWN','SOURCE_ERROR')),
  date_resolution_note text,
  created_at           timestamptz not null default now(),  -- when it was TYPED

  quality_status       text not null default 'OK'
                       check (quality_status in
                         ('OK','SOURCE_ERROR','UNPARSEABLE','NOT_RECORDED','QUARANTINED')),
  not_recorded_reason  text,

  session_ref          text,
  fixture_ref          text,
  discipline_code      text,
  coach_id             text,                 -- null: not captured at source
  protocol_version     text,
  confidence           numeric check (confidence between 0 and 1),
  provenance_id        uuid not null references public.provenance,

  source_file          text not null,
  source_row           integer,
  source_sheet         text,
  import_batch_id      uuid not null,

  constraint value_or_reason check (
    value_numeric is not null or value_boolean is not null
    or quality_status <> 'OK' or not_recorded_reason is not null
  )
);

create or replace function athlytica_core.trg_observation_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'athlytica_core.observation is append-only: % blocked', TG_OP;
end $$;

create trigger observation_immutable
  before update or delete on athlytica_core.observation
  for each row execute function athlytica_core.trg_observation_immutable();
```

**Note on `observed_at` nullability.** It is nullable *on purpose*. §14 requires
that undecidable dates are not guessed. A NOT NULL column would force a guess.
`observed_at IS NULL AND date_confidence = 'UNKNOWN'` is the honest encoding.

**Note on `raw_value text NOT NULL`.** Every observation keeps the source string
verbatim regardless of how well it parsed. `"#REF!"` and
`"Didn't manage to take the speed"` both survive.

---

## 5. Derived-layer rebuildability contract

> **A derived value that cannot be recreated from immutable observations plus a
> versioned rule is not modelled — it is stored folklore.**

The test, to be automated as `tests/derived-rebuild.test.mts`:

```
1.  snapshot  := checksum(all derived tables)
2.  TRUNCATE  derived tables
3.  recompute from athlytica_core.observation + rule_version registry
4.  assert    checksum(all derived tables) == snapshot
```

If step 4 fails, the derived layer has an input that is not an observation.

Every derived row carries `rule_version`, `benchmark_version` and `computed_at`.
Derived tables are the **only** tables in the canonical schema that may be
truncated.

**Known applications of this contract:**

| Derived value | Rule | Rebuildable today? |
|---|---|---|
| `NRHL points` | `NRHL-PTS-v1` | **Yes** — inputs are assisted/solo/assists, present in `Scrimmage Tracker` |
| `NRHL composite` | `NRHL-COMP-v1` | **Yes** — attendance% + 20×coach_grade + points |
| `technical_precision` | `4 − 2×breaks` | **Yes** — input is `TECHNICAL_BREAKS_COUNT` |
| `Low COG % / Full Extension % / Perfect Recovery %` | UNKNOWN | **No** — see §6 |
| `Speed score` (2026) | UNKNOWN | **No** — inputs unidentified |
| `Power Score` (2026) | UNKNOWN | **No** — inputs unidentified |

The three "No" rows are why migration cannot start yet.

---

## 6. Correction to the Phase-audit finding on technical-compliance rates

The audit reported that `Low COG %`, `Full Extension %` and
`Perfect Recovery %` are `0%` for every athlete and concluded the underlying
data was absent. **That conclusion was wrong.**

Measured against `RAW DATA INPUT 2026(5).csv`, the underlying ordinals are
richly populated:

| Ordinal level | Perfect Recovery | Full Extension | Low COG |
|---|---|---|---|
| 1 — Poor | 12 | 17 | 21 |
| 2 — Developing | 62 | 73 | 86 |
| 3 — Average | 153 | 180 | 173 |
| 4 — Strong | 150 | 101 | 90 |
| 5 — Elite | 6 | 12 | 13 |
| **total** | **383** | **383** | **383** |

Level 5 is attested 6/12/13 times, so even a `= 5` threshold would yield a
non-zero rate for someone. **The raw data is sound; the rollup formula in the
`Athlete Progress` tab is broken.**

The dossier independently characterises these as *compliance rates*
(`sessions compliant / sessions observed`) and warns that modelling them as
continuous performance metrics is a category error. Both statements are
consistent: the metric is a **rate over an ordinal threshold**, and the
threshold is undefined.

**Consequence:** these are recomputable once the threshold is decided (Decision
D-09). They must not be imported from `Athlete Progress`, and they must not be
recorded as "no data".

---

## 7. What is explicitly NOT changed in Phase 0

- No table in `public` is altered, renamed or dropped.
- No athlete record is created, modified, merged or deleted.
- No `athlytica_id` is issued. The new sequence is created but never called.
- No legacy data is migrated.
- Registration, pricing, M-Pesa, onboarding and portal flows are untouched.
- `analyticsEngine.ts`, `NRHL_POINT_FORMULA` and `DEFAULT_BANDS` are untouched.

The only production-affecting change proposed in this phase is the RLS
containment in `RLS_POLICY_MATRIX.md`, and it is proposed as a reviewed script,
not applied.
