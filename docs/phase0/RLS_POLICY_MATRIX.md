# RLS Policy Matrix — Phase 0

**Status:** DESIGN + one **proposed** containment script. **Not applied.**
**Date:** 2026-08-12

---

## 1. The finding

Supabase advisor `rls_disabled`, priority 1, level critical:

> 4 table(s) have Row Level Security (RLS) disabled: `athlytica_core.parents`,
> `athlytica_core.athletes`, `athlytica_core.performance_logs`,
> `athlytica_core.scalable_id_sequence`. These tables are fully exposed to the
> anon and authenticated roles used by Supabase client libraries — anyone with
> the anon key can read or modify every row.

**Mitigating fact:** all four tables are **empty** (verified 2026-08-12).
Nothing has leaked.

**Aggravating facts:**

- `athlytica_core.parents` holds `phone_number UNIQUE NOT NULL` — guardian PII.
- `athlytica_core.athletes` holds `birth_certificate_hash UNIQUE NOT NULL` — a
  minor's identity document, and a `UNIQUE` index on a hash is a **membership
  oracle**: an attacker who can insert can test whether a given birth
  certificate is already registered.
- `scalable_id_sequence` is **writable by anon** — ID issuance can be skewed or
  exhausted by an unauthenticated caller.
- `public.bigice_athlete` and `public.nrhl_athlete` FK into these tables, so
  they fill as soon as registration runs.

This is a race between fixing it and the first real registration.

---

## 2. Why enabling RLS alone is not the fix

Two traps:

1. **Enable-with-no-policy blocks everything.** Postgres denies by default once
   RLS is on. The registration path would start failing.
2. **`SECURITY DEFINER` functions bypass RLS entirely.** These already write to
   `athlytica_core`:

   | Function | Writes to | `SECURITY DEFINER` |
   |---|---|---|
   | `link_guardian(text)` | `athlytica_core.parents` | **yes** |
   | `bigice_next_athlete_code()` | `scalable_id_sequence` | **yes** |
   | `nrhl_next_athlete_code()` | `scalable_id_sequence` | **yes** |
   | `athlytica_core.generate_scalable_athlete_code()` | `scalable_id_sequence` | no |

   Enabling RLS will **not** stop these. That is by design and is the correct
   channel — but it means the policy set must be written knowing the write path
   already runs privileged.

**Therefore:** enable RLS, add deny-by-default read policies, and let the
existing `SECURITY DEFINER` functions remain the only write path. That
combination closes the anon hole without breaking registration.

---

## 3. Access model

Three independent axes. All three are evaluated server-side. **None** relies on
frontend filtering.

```
IS_FOUNDER        → global read
IS_PARENT_OF      → parent_athlete_link row exists
IS_ORG_MEMBER_OF  → staff workspace grant AND athlete_organization_membership
```

### Helper predicates

```sql
-- Parent identity: auth.uid() → parents row.
-- REQUIRES a new parents.auth_user_id column (nullable, added in Phase 1).
create or replace function athlytica_core.current_parent_id()
returns uuid language sql stable security definer
set search_path to 'athlytica_core','public','pg_temp' as $$
  select parent_id from athlytica_core.parents where auth_user_id = auth.uid()
$$;

-- Athletes this caller may see as a guardian.
create or replace function athlytica_core.my_athlete_uids()
returns setof uuid language sql stable security definer
set search_path to 'athlytica_core','public','pg_temp' as $$
  select l.athlete_uid
    from athlytica_core.parent_athlete_link l
   where l.parent_id = athlytica_core.current_parent_id()
$$;

-- Organizations this caller is staff for.
create or replace function athlytica_core.my_org_ids()
returns setof uuid language sql stable security definer
set search_path to 'athlytica_core','public','pg_temp' as $$
  select o.organization_id
    from public.workspace_roles wr
    join athlytica_core.organization o on o.code = upper(wr.workspace)
   where wr.user_id = auth.uid()
     and wr.role in ('GLOBAL_FOUNDER','HEAD_COACH')
$$;
```

> `public.is_global_founder()` already exists and hardcodes
> `dennis@bigice.co.ke`. It is **reused unchanged** in Phase 0. Note it is
> duplicated in `config/workspaces.ts` — both must change together whenever it
> changes. Logged as D-15; not changed here.

---

## 4. Policy matrix

`—` = no policy = denied (RLS on, deny by default).

| Table | anon | authenticated (parent) | authenticated (org staff) | founder | service_role |
|---|---|---|---|---|---|
| `athlytica_core.parents` | — | SELECT own row only | — | SELECT all | full (bypasses RLS) |
| `athlytica_core.athlete` | — | SELECT via `my_athlete_uids()` | SELECT via membership in `my_org_ids()` | SELECT all | full |
| `athlytica_core.parent_athlete_link` | — | SELECT own links | — | SELECT all | full |
| `athlytica_core.athlete_organization_membership` | — | SELECT for own athletes | SELECT for own orgs | SELECT all | full |
| `athlytica_core.enrollment` | — | SELECT for own athletes | SELECT for own orgs | SELECT all | full |
| `athlytica_core.observation` | — | SELECT for own athletes | SELECT **own-org rows only** | SELECT all | full |
| `athlytica_core.athlete_identifier` | — | — | — | SELECT all | full |
| `athlytica_core.scalable_id_sequence` | — | — | — | — | full |
| `athlytica_core.athletes` *(deprecated)* | — | — | — | — | full |
| `athlytica_core.performance_logs` *(deprecated)* | — | — | — | — | full |

**Writes:** no INSERT/UPDATE/DELETE policy is granted to `anon` or
`authenticated` on any table in this matrix. All writes go through
`SECURITY DEFINER` functions or `service_role`. That is deliberate — it keeps
the write surface small and auditable.

### The cross-organization rule

`observation` staff read is scoped to `organization_id IN (my_org_ids())`.

A Big Ice coach reading a shared athlete gets **only Big Ice observations**.
NRHL observations for the same child are invisible without an explicit
`access_grant`. **30 athletes are already in both organizations**, so this is a
live requirement, not a future one.

`access_grant` (athlete-authorised sharing to orgs, scouts, agencies, insurers)
is specified in the Phase-audit architecture §16 and is **not implemented in
Phase 0**. Until it exists, cross-org read is simply denied — the safe default.

---

## 5. Guardian security requirements (§19)

| Requirement | Mechanism |
|---|---|
| Guardian records not queryable anonymously | RLS on `parents`, no `anon` policy |
| No parent can enumerate another parent's athletes | `my_athlete_uids()` is keyed on `auth.uid()`; there is no other path to `athlete` for a parent |
| No parent can modify another athlete | No UPDATE policy for `authenticated` at all |
| No public endpoint exposes phone/email/DOB/documents/coach notes/performance | RLS denies anon on every table holding them; coach notes live in `observation`-adjacent storage under the same policy |

**`phone_number UNIQUE` remains an enumeration oracle even with RLS on**, via
`link_guardian()` — a caller who can invoke it learns whether a phone is
already registered, because the `ON CONFLICT DO UPDATE` returns an existing
`parent_id`. Logged as **DQ-048**; the fix (rate-limiting, or returning an
opaque token instead of the id) is a Phase 1 change to the function, not a
policy change.

---

## 6. Document security (§20)

`public.bigice_document` currently stores `content_html` inline with a
`document_id uuid` PK and a `slug`. There is no storage bucket in use for
athlete documents yet.

Requirements for when documents move to storage:

- **No predictable paths.** `/documents/ATH-000123.pdf` is forbidden — the
  public athlete ID is printed on the document itself and quoted in emails, so
  it is not a secret. Use the document UUID, or a random object key.
- **Buckets private by default.** Serve through short-lived signed URLs issued
  after an authorization check, not by making the bucket public.
- **No directory listing.** Bucket policy must deny LIST to anon and
  authenticated.
- **Authorization before signing** — the check is "does this caller pass
  `IS_PARENT_OF` or `IS_ORG_MEMBER_OF` for the document's athlete", evaluated
  server-side, then sign.

`app/api/v1/portal/document/[id]/route.ts` already exists and is the correct
choke point. It is **not modified in Phase 0**; it is registered as the place
where this must be enforced.

---

## 7. Proposed containment script

**This is the only production-affecting change proposed in Phase 0.** It is
written, reviewed and held — **not applied**. It requires explicit approval
(Decision **D-01**).

Script: `docs/phase0/sql/0001_rls_containment.sql`
Rollback: `docs/phase0/sql/0001_rls_containment_rollback.sql`

Design of the containment step:

1. Enable RLS on all four `athlytica_core` tables.
2. Add **founder-read** policies only. No anon, no parent, no staff yet —
   those depend on tables that do not exist until Phase 1.
3. `service_role` bypasses RLS, so server-side routes continue to work.
4. The four `SECURITY DEFINER` functions continue to work unchanged.

Because all four tables are empty, the blast radius of enabling RLS is
**exactly zero rows**. The only risk is a code path that reads them with the
anon key — and there is none, because they are empty and unused.

### Pre-flight verification (run before applying)

```sql
-- Must all return 0. If any returns > 0, STOP and re-plan.
select count(*) from athlytica_core.parents;
select count(*) from athlytica_core.athletes;
select count(*) from athlytica_core.performance_logs;

-- Must return 500. If it has moved, an ID has been issued — STOP.
select current_value from athlytica_core.scalable_id_sequence;
```

### Post-apply verification

```sql
select relname, relrowsecurity
  from pg_class
 where relnamespace = 'athlytica_core'::regnamespace and relkind = 'r';
-- expect relrowsecurity = true for all four
```

Then re-run the advisor and confirm `rls_disabled` is cleared.

---

## 8. Test plan

To be added as `tests/rls-policy.test.mts`. Each runs against a **branch**, not
production, with three synthetic identities.

| # | Test | Expected |
|---|---|---|
| R1 | anon SELECT on `athlytica_core.parents` | 0 rows / permission denied |
| R2 | anon SELECT on `athlytica_core.athlete` | 0 rows |
| R3 | anon INSERT into `scalable_id_sequence` | denied |
| R4 | parent A SELECT `athlete` | only athletes linked to A |
| R5 | parent A SELECT parent B's athlete by uid | 0 rows |
| R6 | parent A UPDATE any athlete | denied |
| R7 | Big Ice coach SELECT `observation` for a dual-org athlete | only `organization_id = BIG_ICE` |
| R8 | Big Ice coach SELECT NRHL observations | **0 rows** |
| R9 | founder SELECT anything | all rows |
| R10 | `service_role` SELECT | all rows (RLS bypass confirmed) |
| R11 | `link_guardian()` as authenticated | succeeds (SECURITY DEFINER path intact) |
| R12 | document URL guessed from a known `athlytica_id` | 404/403, never 200 |

**R8 is the one that matters.** It is the test that proves organizations
contribute to, rather than own, the athlete record.
