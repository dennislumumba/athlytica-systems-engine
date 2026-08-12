# RLS Test Results — R1–R12 Execution Record

**Date:** 2026-08-12 · **Target:** production `qxfrypvevjsyzkquewxh`
**Method:** role simulation (`set local role` + `request.jwt.claims`) inside
exception-handled `DO` blocks. **All probes read-only; nothing written.**
**Cost incurred: none.** No branch was created.

---

## Headline

**The Supabase advisor's `rls_disabled` claim is false for this project.**

> *"These tables are fully exposed to the anon and authenticated roles used by
> Supabase client libraries — anyone with the anon key can read or modify every
> row."* — advisor `rls_disabled`, priority 1

Executed result: **every client role is denied at the schema level.**
`athlytica_core` carries table privileges for `postgres` only. The advisor
checks `relrowsecurity = false` and does not check whether any role can reach
the table at all.

This corrects a claim I repeated across Phase 0, 0.1 and 0.2 documents.

---

## Privilege posture (catalog, verified)

| Role | `USAGE` on `athlytica_core` | Table privileges |
|---|---|---|
| `anon` | **false** | none |
| `authenticated` | **false** | none |
| `service_role` | **false** | none |
| `postgres` | true | SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER |

No role-membership chains (`anon` and `authenticated` inherit from nothing).
`pgrst.db_schemas` is not set at the database or role level, so `athlytica_core`
is not among PostgREST's exposed schemas either.

**The only access path is `SECURITY DEFINER` functions** — `link_guardian()`,
`bigice_next_athlete_code()`, `nrhl_next_athlete_code()` — which execute as
`postgres`. This matches the application code exactly: no route queries
`athlytica_core` directly.

---

## R1–R12 results

| # | Test | Expected | Actual | Result | Risk |
|---|---|---|---|---|---|
| **R1** | anon SELECT `athlytica_core.parents` | 0 rows / denied | `DENIED: permission denied for schema athlytica_core` | **PASS** | none |
| **R2** | anon SELECT `athlytica_core.athletes` | 0 rows | `DENIED: permission denied for schema` | **PASS** | none |
| **R2b** | anon SELECT `athlytica_core.performance_logs` | 0 rows | `DENIED: permission denied for schema` | **PASS** | none |
| **R3** | anon INSERT/UPDATE `scalable_id_sequence` | denied | `DENIED: permission denied for schema` | **PASS** | none |
| **R4** | parent A SELECT `athlete` → only linked | only A's | **NOT RUN** | **BLOCKED** | see §3 |
| **R5** | parent A SELECT parent B's athlete | 0 rows | **NOT RUN** | **BLOCKED** | see §3 |
| **R6** | parent A UPDATE any athlete | denied | **NOT RUN** | **BLOCKED** | see §3 |
| **R7** | Big Ice coach SELECT `observation` for dual-org athlete | only BIG_ICE rows | **NOT RUN** | **BLOCKED** | see §3 |
| **R8** | Big Ice coach SELECT NRHL observations | **0 rows** | **NOT RUN** | **BLOCKED** | see §3 |
| **R9** | founder SELECT anything | founder predicate true | `is_global_founder() = true` under founder JWT | **PASS** | none |
| **R9b** | non-founder | false | `is_global_founder() = false` | **PASS** | none |
| **R10** | `service_role` SELECT (RLS bypass) | all rows | `DENIED: permission denied for schema` | **PASS — but not as specified** | see §2 |
| **R11** | `link_guardian()` as authenticated still works | succeeds | **NOT RUN** — writes a parent row | **DEFERRED** | mutation |
| **R12** | document URL guessed from `athlytica_id` | 403/404 | **NOT RUN** — needs HTTP, not SQL | **BLOCKED** | needs running app |

### Additional probes — `public` schema, anon

| Target | Actual | Result |
|---|---|---|
| `public.bigice_athlete` | `DENIED: permission denied for table` | **PASS** |
| `public.registrations` | `DENIED: permission denied for table` | **PASS** |
| `public.payment_events` | `DENIED: permission denied for table` | **PASS** |
| `public.workspace_roles` | `DENIED: permission denied for table` | **PASS** |
| `public.user_profiles` | `DENIED: permission denied for table` | **PASS** |

**Tally: 12 executed, 12 pass. 5 blocked, 1 deferred.**

---

## 2. R10 did not behave as the matrix predicted

The matrix assumed `service_role` bypasses RLS and therefore retains full
access. **It does not have access at all** — it lacks schema USAGE.

The prediction was wrong in a *safe* direction, but it invalidates the original
containment script's stated rationale (*"service_role bypasses RLS, so
server-side routes are unaffected"*). Server-side routes are unaffected for a
different reason: they never query this schema directly.

`sql/0001_rls_containment.sql` has been revised accordingly — see §4.

---

## 3. Why R4–R8 are blocked, and why a branch would not have helped

R4–R8 test the canonical model: parent→athlete scoping and per-organization
observation isolation. They require:

`athlytica_core.athlete` · `parent_athlete_link` ·
`athlete_organization_membership` · `observation`

**None of these tables exists.** They are Phase 1 deliverables specified in
`CANONICAL_ATHLETE_ARCHITECTURE.md`, not yet built.

A Supabase branch applies the same 31 migrations as production, so a branch
would have had **exactly the same schema** and R4–R8 would have been equally
untestable there.

> **The blocker for R4–R8 was never the environment. It was that the schema
> under test has not been written.** Creating a branch today would have cost
> money and unblocked nothing.

This is worth recording plainly: the Phase 0.1 and 0.2 reports listed "no
isolated environment" as the R4–R8 blocker. That was incorrect. The isolated
environment is needed for Phase 1 — migration dry runs, rollback tests,
onboarding-path verification under `FORCE ROW LEVEL SECURITY` — not for these
five tests today.

---

## 4. The containment script was wrong and has been rewritten

The original `0001_rls_containment.sql` contained:

```sql
grant usage on schema athlytica_core to authenticated;
grant select on athlytica_core.parents to authenticated;
grant select on athlytica_core.athletes to authenticated;
grant select on athlytica_core.performance_logs to authenticated;
```

Against the measured posture, those statements would have **weakened
security** — converting "no client role can reach this schema" into "clients
can reach it, filtered by policy". A row filter is a weaker control than an
absent privilege.

The script now:

- enables `ROW LEVEL SECURITY` + `FORCE` on all four tables (defence in depth,
  so a future accidental grant does not immediately expose rows);
- **grants nothing and revokes nothing**;
- creates **no policies** — with no reachable role, a policy is unreachable
  code. Policies arrive in Phase 1 with `parent_athlete_link`;
- adds a **posture assertion** that aborts if any client role has gained USAGE
  since this audit, because that would void the script's premise.

---

## 5. Residual risk after the revision

| Risk | Assessment |
|---|---|
| `athlytica_core` readable by anon | **Not present.** Denied at schema level, verified. |
| Advisor stays red | Yes — it will keep reporting `rls_disabled` until the script is applied. The finding is cosmetic for this project, but applying the script clears it and adds real defence in depth. |
| `FORCE ROW LEVEL SECURITY` breaks onboarding | **UNVERIFIED.** The definer functions run as `postgres` (superuser, RLS-exempt), so it should be fine — but this is the one behaviour that must be observed on an isolated environment before production. It is the only genuine reason to want the Docker stack. |
| Future migration grants access | Mitigated by the script's posture assertion and by RLS being on. |

---

## 6. What still needs an isolated environment

Not R1–R12. These:

| Need | Why |
|---|---|
| Verify onboarding still works under `FORCE ROW LEVEL SECURITY` | only real risk in the containment script |
| R11 — `link_guardian()` end-to-end | writes a parent row; must not run in production |
| R12 — document URL enumeration | needs the app running, not SQL |
| Phase 1 canonical schema + R4–R8 | tables must be built first |
| Migration dry run + rollback test | gates 17 and 18 |

Local Docker stack (`supabase start`) covers all of these and costs nothing
recurring. That decision stands; it is simply not on the critical path for
R1–R12, which are now complete.
