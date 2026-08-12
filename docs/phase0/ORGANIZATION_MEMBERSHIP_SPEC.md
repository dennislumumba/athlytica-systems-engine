# Organization & Membership Specification — Phase 0

**Status:** DESIGN. No membership row created.
**Date:** 2026-08-12

---

## 1. Why an organization table replaces the workspace enum

Today "organization" is expressed three incompatible ways:

| Mechanism | Where | Values | FK? |
|---|---|---|---|
| `tenants` table | `public.tenants` | 1 row (TTA) | yes |
| `workspace` text CHECK | `workspace_roles`, `user_profiles` | `nrhl, big_ice, athlytica_hq, tta` | **no** |
| `venture_context` text CHECK | `registrations` | `NRHL, BIG_ICE, ATHLYTICA` (**no TTA**) | **no** |

None references another. Adding an organization currently requires a migration
plus an edit to `config/workspaces.ts`.

The canonical model makes organizations **rows**.

---

## 2. Seed organizations

| `code` | `display_name` | `org_type` | Note |
|---|---|---|---|
| `BIG_ICE` | Big Ice Inline Fitness | `academy` | Required by objective |
| `NRHL` | Nairobi Regional Hockey League | `league` | Required by objective |
| `ATHLYTICA` | Athlytica HQ | `platform` | Founder / global scope |
| `TTA` | TTA International Football Academy | `academy` | Maps to existing `tenants` row `77000001-…` |

> **Naming conflict, unresolved.** `config/workspaces.ts` and
> `config/business-model.md` say *Nairobi **Regional** Hockey League*; the Phase 0
> objective and `brand-nrhl/league-prospectus.md` context say *Nairobi **Roller**
> Hockey League*. Both are in active use. Recorded as Decision **D-13**; the seed
> above uses the value currently in code. Not resolved unilaterally.

A fifth pseudo-organization is **not** created. Unassigned records use
`organization_id IS NULL` with `membership.status = 'UNASSIGNED'` — see §6.

---

## 3. Membership, not duplication

```
athlete (1) ──< athlete_organization_membership >── (1) organization
```

An athlete belongs to Big Ice only, NRHL only, both, or neither. **In every case
there is exactly one athlete row.**

This is not hypothetical. Measured over the canonical legacy set, **30 athlete
IDs carry sessions in both a BIIF discipline and an NRHL discipline**, including
`ATH-003`, `ATH-006`, `ATH-009`, `ATH-020`, `ATH-053`, `ATH-566`, `ATH-567`.
Roughly 14% of the roster is already multi-organization. Any model that keys the
athlete by organization is broken before it loads a row.

### Schema

```sql
create table athlytica_core.athlete_organization_membership (
  membership_id    uuid primary key default gen_random_uuid(),
  athlete_uid      uuid not null references athlytica_core.athlete,
  organization_id  uuid references athlytica_core.organization,   -- NULL = UNASSIGNED
  status           text not null default 'ACTIVE'
                   check (status in ('ACTIVE','ENDED','SUSPENDED','UNASSIGNED')),
  joined_at        date,
  ended_at         date,
  source           text not null
                   check (source in ('registration','legacy_import','manual','inferred')),
  source_confidence text not null default 'UNKNOWN'
                   check (source_confidence in ('VERIFIED','INFERRED','UNKNOWN')),
  verified_at      timestamptz,
  provenance_id    uuid references public.provenance,
  note             text,
  created_at       timestamptz not null default now(),
  constraint membership_dates check (ended_at is null or ended_at >= joined_at),
  constraint unassigned_has_no_org
    check ((status = 'UNASSIGNED') = (organization_id is null))
);
```

---

## 4. Organization must not be inferred from session data alone

§5 of the Phase 0 directive is explicit, and the data shows why.

A session row carries `Primary_Discipline`. Classifying `Inline / Roller Hockey`
→ NRHL and `Figure Skating` → BIG_ICE is an **inference about the organization
from an attribute of the activity**. It is frequently right and demonstrably not
always right:

- The 2026 NRHL scrimmage cohort was coached under a **Big Ice** curriculum
  (`Group sessions.csv` is a BIIF-authored 12-week plan delivered to the hockey
  group).
- `Ice Hockey` appears in 2025 and is absent in 2026 — the discipline was
  discontinued, so 2025 ice-hockey rows say nothing about 2026 membership.
- 77 `Outsourced.csv` bookings are BIIF sessions delivered *at third-party
  schools*. The school is an organization; the athletes are unattributed.

**Rule:** discipline-derived membership is written with
`source = 'inferred'` and `source_confidence = 'INFERRED'`, never `VERIFIED`.
Only a registration record, a payment, or a founder confirmation produces
`VERIFIED`.

Membership derived from a discipline is a **hypothesis pending confirmation**,
and the schema says so on every row.

---

## 5. Enrollment is separate from membership

Membership answers *does this person belong to this organization*.
Enrollment answers *what are they currently paying for and attending*.

An athlete may be a member with zero active enrollments (off-season, lapsed),
and may hold several enrollments over time:

```
ATH-000123
├─ membership   BIG_ICE   ACTIVE   joined 2026-01
│   ├─ enrollment  Performance Program   2027-01 → 2027-03   COMPLETED
│   └─ enrollment  Elite Program         2027-04 → 2027-06   ACTIVE
└─ membership   NRHL      ACTIVE   joined 2027-01
    └─ enrollment  Competitive Inline Hockey  2027 season    ACTIVE
```

Three enrollment rows, two membership rows, **one athlete row**.

`enrollment.price_tier_id` FKs to the existing
`public.commercial_price_tier(tier_id)` so the commerce model is reused, not
duplicated. **No pricing behaviour changes in this phase.**

The existing `public.bigice_enrollment` table already implements this shape for
Big Ice (`biif_code`, `programme_label`, `discipline`, `price_tier_id`,
`starts_on`, `ends_on`, `status`) and is empty. It becomes a **PROJECTION** over
the canonical enrollment table rather than a second store.

---

## 6. The UNASSIGNED state

109 legacy session rows carry an athlete ID but neither a discipline nor a date.
§17 requires they not be forced into Big Ice or NRHL.

```
membership.status          = 'UNASSIGNED'
membership.organization_id = NULL
membership.source          = 'legacy_import'
membership.source_confidence = 'UNKNOWN'
membership.note            = 'RAW DATA INPUT 2026(5).csv rows N..M: no discipline, no date'
```

The `unassigned_has_no_org` CHECK makes it impossible to write `UNASSIGNED`
with an organization attached, or an organization with `UNASSIGNED` status.

Observations from those rows are written with `organization_id IS NULL`. They
remain queryable, attributable to a source row, and excluded from every
per-organization aggregate until reclassified.

---

## 7. Relationship to existing access control

`workspace_roles` (currently 0 rows) governs **staff** access to a workspace.
`athlete_organization_membership` governs **which athlete's data belongs to
which organization**. They are different axes and must not be conflated:

| Question | Answered by |
|---|---|
| Can this coach open the NRHL dashboard? | `workspace_roles` |
| Is this child an NRHL athlete? | `athlete_organization_membership` |
| Can this coach see this child's Big Ice observations? | **both**, plus consent |

The third row is the one that matters and is currently unenforced server-side.
See `RLS_POLICY_MATRIX.md`.

`workspace_roles` is **not modified in Phase 0.** Its `workspace` CHECK gains an
`organization.code` FK in a later phase, once the organization table exists and
is populated.

---

## 8. Parent / guardian linkage

Guardians attach to athletes, not to organizations:

```sql
create table athlytica_core.parent_athlete_link (
  link_id       uuid primary key default gen_random_uuid(),
  parent_id     uuid not null references athlytica_core.parents(parent_id),
  athlete_uid   uuid not null references athlytica_core.athlete,
  relationship  text not null
                check (relationship in ('parent','legal_guardian','club_appointed_guardian')),
  is_primary    boolean not null default false,
  consent_on_file boolean not null default false,
  consent_date  date,
  verified_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (parent_id, athlete_uid)
);
```

This table is the sole basis for parent RLS. A parent sees an athlete if and
only if a row exists here. There is no other path — see `RLS_POLICY_MATRIX.md` §3.

`athlytica_core.parents` already exists with `phone_number UNIQUE NOT NULL` and
`is_verified`. It is **CANONICAL** and retained. Its RLS is enabled in this
phase.

---

## 9. Test fixtures required

| Fixture | Asserts |
|---|---|
| One athlete, memberships in BIG_ICE and NRHL | exactly one `athlete` row; two membership rows; no duplication |
| Athlete with membership, zero enrollments | valid state, no constraint fires |
| Athlete with three enrollments across two orgs | all three coexist; none overwrites another |
| `status='UNASSIGNED'` with an `organization_id` | **check violation** |
| `status='ACTIVE'` with `organization_id IS NULL` | **check violation** |
| Membership with `ended_at < joined_at` | **check violation** |
| Discipline-inferred membership | `source_confidence = 'INFERRED'`, never `VERIFIED` |
