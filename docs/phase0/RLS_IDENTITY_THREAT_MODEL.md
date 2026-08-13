# RLS Identity Threat Model

**Phase:** 0.4 · **Date:** 2026-08-13
**Status:** analysis complete · no policy, grant or function was changed.

Every claim is **VERIFIED** (read live or proven in a rolled-back transaction),
**UNVERIFIED**, or **REQUIRES ISOLATED ENVIRONMENT**.

---

## 1. The central finding: the identity graph is severed

**VERIFIED.** There are two disconnected user tables, and nothing bridges them.

```
   auth.users (4 rows)                    public.users (8 rows)
   the real Supabase auth system          legacy / seed data
        │                                      │
        ├─ user_profiles.user_id ──┐           ├─ athletes.user_id
        ├─ workspace_roles.user_id ┘           ├─ jwt_tenant_ids()  (matches by id OR email)
        │                                      └─ /api/v1/mcp resolveCallerTenant() (by email)
        │
        └─ requireWorkspaceRole() → auth.getUser() → workspace_roles
           ← this is what the deployed application actually authorises on
```

| Check | Result |
|---|---|
| `public.users.id` values that are also `auth.users.id` | **0** |
| `public.users.email` values matching an `auth.users.email` | **0** |
| Triggers on `auth.users` (e.g. `handle_new_user`) | **NONE** |
| `athletes.user_id` values that are an `auth.users.id` | **0** |
| `user_profiles` rows | **0** |
| `workspace_roles` rows | **0** |

### Consequences, all VERIFIED

1. **`jwt_tenant_ids()` returns ∅ for every possible authenticated caller.** It
   matches `public.users` by `id = auth.uid()` or `email = jwt email`; neither
   can ever be true.
2. **`jwt_athlete_ids()` returns ∅ for every possible authenticated caller.**
   Branch 1 needs a `public.athletes` row with `user_id = auth.uid()`, which
   cannot exist (§3). Branch 2 needs `jwt_tenant_ids()`, which is ∅.
3. **Therefore every policy consuming those helpers denies every row** —
   `athlete`, `guardian_contact`, `biometric_record`, `injury_record`,
   `custody_record`, `cohort_session_registry`, `sessions`,
   `athlete_tenant_links`, `registrations`, `performance_logs`.
4. **`/api/v1/mcp` fails closed for every real user**, because
   `resolveCallerTenant()` joins `auth.users.email` → `public.users.email`.

**The database is currently safe by disconnection, not by policy.** That is a
real containment and it should be stated as such — but it is also a functional
dead end: no parent portal, no athlete self-service and no coach scoping can
work until something bridges the two planes. **The repair and the vulnerability
are the same edit** (§3.4).

## 2. `jwt_athlete_ids()` unions two incompatible key spaces

**VERIFIED.** The helper is type-confused:

```sql
select a.passport_athlete_id from public.athletes a          -- → athlete.athlete_id   (PASSPORT plane)
 where a.user_id = auth.uid() and a.passport_athlete_id is not null
union
select l.athlete_id from public.athlete_tenant_links l       -- → athletes.id          (APP plane)
 where l.tenant_id in (select public.jwt_tenant_ids())
```

Measured overlap:

| Set | Rows | In `athlete.athlete_id`? | In `athletes.id`? |
|---|---|---|---|
| `athletes.passport_athlete_id` | 6 | **6** ✅ | 0 |
| `athlete_tenant_links.athlete_id` | 6 | **0** ❌ | **6** ✅ |

Consumers, and which branch is even in the right namespace:

| Policy on | Column FK → | Branch 1 | Branch 2 |
|---|---|---|---|
| `athlete`, `guardian_contact`, `biometric_record`, `injury_record`, `custody_record` | `athlete.athlete_id` | ✅ correct | ❌ never matches |
| `cohort_session_registry.student_athlete_id` | `athlete.athlete_id` | ✅ correct | ❌ never matches |
| `sessions.athlete_id` | `athletes.id` | ❌ never matches | ✅ correct |

**Each consumer gets a correct answer from exactly one branch and silent
noise from the other.** Proven in §3.3: the exploit's `jwt_athlete_ids()`
returned **7** ids while only **1** produced a readable PII row.

**This corrects 0.3L §6.5**, which stated that a tenant member sees every
athlete in their tenant *and therefore* their guardian contacts, injuries and
biometrics. **That is false.** Branch 2 emits app-plane ids that cannot match
passport-plane tables, and the FK (`athlete_tenant_links.athlete_id →
athletes.id`) guarantees it never will. Coach-scoped PII access is not
implemented — it is a functional gap, not a live exposure.

The application implements the bridge **correctly**, in TypeScript
(`app/api/v1/mcp/route.ts`, `verifyAthleteTenantBoundary`):

```
public.athlete.athlete_id → athletes.passport_athlete_id → athletes.id
                          → athlete_tenant_links.athlete_id → tenant_id
```

The SQL helper is a partial, broken transcription of that same path. The
correct branch 2 is:

```sql
select a.passport_athlete_id
  from public.athletes a
  join public.athlete_tenant_links l on l.athlete_id = a.id
 where l.tenant_id in (select public.jwt_tenant_ids())
```

## 3. D-01a — `public.athletes.self_identity_policy`

### 3.1 The policy and its reach — VERIFIED

```
table   public.athletes  (id, user_id UNIQUE → public.users(id),
                          passport_athlete_id → athlete(athlete_id) ON DELETE SET NULL)
grants  authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
policy  self_identity_policy · FOR ALL · role authenticated · PERMISSIVE
        USING      (user_id = auth.uid())
        WITH CHECK (user_id = auth.uid())
```

**Who can reach the table:** any authenticated user. `anon` holds no grant.

**What the policy constrains:** `user_id`, and nothing else.
**What it does not constrain:** `passport_athlete_id` — the column that *is*
the identity bridge. There is no `UNIQUE` on it either, so two users may claim
the same athlete, and an attacker may claim one **before** the legitimate
parent.

**Which command creates the danger:** `INSERT` and `UPDATE`. `SELECT` and
`DELETE` are harmless — the row is the caller's own. The danger is writing
`passport_athlete_id`.

### 3.2 Does any legitimate flow depend on it? — VERIFIED: NO

`grep` across `app/`, `lib/`, `utils/`, `components/` finds exactly one
reference to the table:

```
app/api/v1/workspace/dashboard/route.ts:410
  db.from("athletes").select("id, passport_athlete_id").in("id", appAthleteIds)
```

A **read**, through `service_role`. **No application code has ever written
`public.athletes`.** The `FOR ALL` grant serves no product flow. It can be
narrowed to `SELECT` with zero functional loss.

### 3.3 Exploitability — PROVEN, in a rolled-back transaction

Synthetic victim and attacker created inside the transaction; no production row
was read as a target and nothing persisted (verified after: 13 / 6 / 3 / 8 rows
unchanged, sequence still 504, 0 synthetic rows remaining).

| Test | Setup | Result |
|---|---|---|
| **A** | attacker signed in, no `public.users` row | `athlete` visible **0**, `guardian_contact` **0**, `jwt_athlete_ids()` **0** |
| **B** | same, attempts to claim the victim | **BLOCKED — SQLSTATE 23503**, `athletes_user_id_fkey` |
| **C** | attacker given a `public.users` row (what a `handle_new_user()` trigger would create), then claims the victim | **INSERT SUCCEEDED.** Attacker reads `ZZ SYNTHETIC VICTIM dob=2010-01-01` and `ZZ SYNTHETIC GUARDIAN <zz-synthetic@example.test>`. `jwt_athlete_ids()` → 7 |

**Verdict: D-01a is LATENT, not live.**

- **The containment is the foreign key**, not the policy. `athletes.user_id`
  references `public.users`, which contains no `auth.users.id`, and nothing
  provisions one.
- **The RLS policy contributes nothing** to that containment. It checks the
  wrong column.
- **The exploit arms the instant `auth.users` → `public.users` is bridged** —
  which is precisely what onboarding, a parent portal, or the standard Supabase
  `handle_new_user()` trigger requires. The most natural next feature turns
  this on.

**0.3L overstated the current severity** ("contained today only because uuids
are not enumerable") and **understated the trigger condition**. The uuid
argument is irrelevant; the FK is what holds, and one ordinary migration
removes it.

### 3.4 Recommended containment — DESIGNED, NOT APPLIED

Smallest change that makes the acceptance criterion true — *an authenticated
user cannot cause their authorization context to include another athlete*:

```sql
-- 1. The client never writes the identity bridge.
revoke insert, update, delete, truncate on public.athletes from authenticated;
drop policy self_identity_policy on public.athletes;
create policy athletes_self_read on public.athletes
  for select to authenticated using (user_id = (select auth.uid()));

-- 2. One claimant per athlete, enforced by the database.
create unique index athletes_passport_athlete_id_key
  on public.athletes (passport_athlete_id) where passport_athlete_id is not null;

-- 3. Branch 2 of the helper reads the plane it was always meant to read.
create or replace function public.jwt_athlete_ids() returns setof uuid
  language sql stable security definer set search_path to 'public' as $$
  select a.passport_athlete_id from public.athletes a
   where a.user_id = auth.uid() and a.passport_athlete_id is not null
  union
  select a.passport_athlete_id from public.athletes a
    join public.athlete_tenant_links l on l.athlete_id = a.id
   where l.tenant_id in (select public.jwt_tenant_ids())
     and a.passport_athlete_id is not null
$$;
```

Bridging a user to an athlete becomes a **service-role operation behind an
authorization check** — the same posture as every other identity-creating path
since 0.3F.

**Note on step 3:** it fixes a type confusion *and* switches on coach-scoped
PII visibility that has never actually worked. **That is a behavioural change,
not a pure fix**, and it must not be bundled with an emergency containment. Ship
steps 1–2 first; step 3 belongs with the deliberate tenant-scope decision.

**Is emergency containment warranted now? NO.** §3.3 test B proves the path is
blocked today. Steps 1–2 should ship as ordinary, tested Phase 0.4 work — but
they **must** ship before anything bridges `auth.users` → `public.users`. That
ordering is the whole point.

## 4. RLS classification of identity-relevant surfaces

**VERIFIED.** `anon` holds **no table grants anywhere**. Every row below
concerns `authenticated`.

| Surface | Grants to `authenticated` | Policy | Classification | Correct? |
|---|---|---|---|---|
| `public.athlete` | full DML | SELECT only, `athlete_id ∈ jwt_athlete_ids()` | owner/guardian scoped | ⚠ writes ungoverned by policy → denied by absence of a write policy, but the grant is wrong |
| `public.athletes` | full DML | `FOR ALL`, `user_id = auth.uid()` | **AMBIGUOUS — the bridge** | ❌ **D-01a** |
| `guardian_contact` | full DML | SELECT only, athlete-scoped | owner/guardian scoped | ⚠ grant too wide |
| `biometric_record` | full DML | SELECT only, athlete-scoped | owner/guardian scoped | ⚠ grant too wide |
| `injury_record` | full DML | SELECT only, athlete-scoped | owner/guardian scoped | ⚠ grant too wide |
| `custody_record` | full DML | SELECT only, athlete-scoped | owner/guardian scoped | ⚠ grant too wide |
| `cohort_session_registry` | full DML | SELECT only, athlete-scoped | owner/guardian scoped | ⚠ grant too wide |
| `athlete_tenant_links` | full DML | SELECT only, tenant-scoped | membership | ⚠ grant too wide |
| `registrations` | full DML | SELECT tenant-scoped **+ `tenant_isolation_policy` FOR ALL to PUBLIC** | service-role only | ❌ **D-01b** |
| `performance_logs` | full DML | same shape | service-role only | ❌ **D-01b** |
| `sessions` | full DML | SELECT, `athlete_id ∈ jwt_athlete_ids()` | owner scoped | ⚠ wrong branch (§2) |
| `public.users` | full DML | SELECT, `email = jwt email` | legacy — **should be retired or bridged** | ❌ ambiguous |
| `user_profiles` | full DML | read own / insert own / update own **+ founder read** | authenticated-only | ✅ correct |
| `workspace_roles` | full DML | read own or founder; **write founder-only** | administrative | ✅ correct |
| `bigice_athlete`, `nrhl_athlete`, `bigice_document`, `bigice_enrollment` | **none** | RLS on, 0 policies | service-role only | ✅ correct |
| `crm_*` (6 tables) | **none** | RLS on, 0 policies | service-role only | ✅ correct (no `FORCE`) |
| `payment_events`, `payment_events_production`, `record_classification`, `payment_reconciliation_exception` | **none** | RLS on, 0 policies / view not `security_invoker` | service-role only | ✅ correct |
| `athlytica_core.*` (4 tables) | **no schema `USAGE`** | RLS off, 0 policies | service-role only | ✅ unreachable; RLS is defence-in-depth |
| `actuarial_injury_exposure_summary`, `bone_age_dispute_evidence`, `solidarity_claim_input` (views) | SELECT | `security_invoker = true` | inherit underlying RLS | ✅ correct |
| `commercial_price_tier`, `sport_taxonomy`, `discipline_taxonomy`, `tenants`, `venues`, `club`, `federation`, `division` | full DML | SELECT policies | intentionally public reference data | ⚠ grant too wide |

### Minimum containment set for Phase 0.4

Not the whole database. Six items, ordered:

| # | Change | Why it is in the minimum set |
|---|---|---|
| 1 | `revoke insert, update, delete, truncate on public.athletes from authenticated`; replace the `FOR ALL` policy with `SELECT` | D-01a. Closes the only client-writable identity bridge. |
| 2 | `unique index` on `athletes.passport_athlete_id` | D-01a. Makes "one claimant per athlete" a database fact. |
| 3 | Drop `tenant_isolation_policy` from `registrations` and `performance_logs` | D-01b. A `FOR ALL` policy applied to PUBLIC on the table M4 matches payments against. Inert only because no client can set the GUC. |
| 4 | `revoke insert, update, delete, truncate` on the seven athlete-scoped PII tables | Their policies are SELECT-only, so writes are already denied — but the grant is the thing an added policy would silently re-open. |
| 5 | `FORCE ROW LEVEL SECURITY` on `athlete`, `athletes`, `guardian_contact`, `biometric_record`, `injury_record`, `custody_record`, `registrations`, `crm_*` | D-01c. **Gated on §5 — cannot be verified here.** |
| 6 | `alter function public.generate_legacy_claim_token() set search_path = 'public','pg_temp'` | Hygiene. Not client-reachable (§5), so not urgent. |

**Deliberately excluded:** `athlytica_core` RLS containment (unreachable, and
R17 warns the obvious script weakens security); every non-identity table;
anything touching payments.

## 5. SECURITY DEFINER inventory — identity and RLS-sensitive

**VERIFIED.**

| Function | DEFINER | `search_path` | EXECUTE | Client-reachable |
|---|---|---|---|---|
| `bigice_next_athlete_code()` | ✅ | pinned | postgres, service_role | no |
| `nrhl_next_athlete_code()` | ✅ | pinned | postgres, service_role | no |
| `link_guardian(text)` | ✅ | pinned | postgres, service_role | no |
| `athlete_passport_longitudinal(uuid)` | ✅ | pinned | postgres, service_role | no |
| `settle_payment_transaction`, `payment_service_authorization`, `_payment_replay_verdict` | ✅ | pinned | postgres, service_role | no |
| `generate_legacy_claim_token()` | ✅ | **NONE** ⚠ | postgres, service_role | **no** |
| `jwt_athlete_ids()` | ✅ | pinned | **authenticated** | **yes** |
| `jwt_tenant_ids()` | ✅ | pinned | **authenticated** | **yes** |
| `touch_user_profiles_updated_at()` | ✅ | pinned (`""`) | **anon**, authenticated | **yes** (R18) |
| `athlytica_core.generate_scalable_athlete_code()` | ❌ invoker | **NONE** | PUBLIC (default) | table unreachable |
| `onboard_athlete_from_google_form(...)` | ❌ invoker | **NONE** | postgres, service_role | no |

**Correction to 0.3L §6.6.** I called `generate_legacy_claim_token` "the real
item" among the mutable-`search_path` functions. It **is** `SECURITY DEFINER`
with no pinned `search_path`, but EXECUTE is restricted to `postgres` and
`service_role` — **it is not client-reachable, so it is not an escalation
primitive.** It is hygiene (item 6 above), not a vulnerability. The three
genuinely client-callable definers are `jwt_athlete_ids`, `jwt_tenant_ids`
(R19, own-scope only) and `touch_user_profiles_updated_at` (R18, errors outside
a trigger context).

Note: `generate_legacy_claim_token()` is a **column default** on
`public.athlete.claim_token` — observed emitting `PLAY-ZZ-2700`-shaped values
during the §3.3 transaction. A claim token that is a column default, generated
by a function with an unpinned `search_path`, on the table that anchors every
PII relationship, deserves its own review in Phase 0.5. It is not in the 0.4
minimum set.

## 6. FORCE RLS — REQUIRES ISOLATED ENVIRONMENT

**Docker is unavailable. No FORCE RLS behaviour is claimed as verified.**

### Provable statically — VERIFIED

- Only `cohort_telemetry` and `scouting_metric_log` have `FORCE RLS` today; 62
  of 64 `public` tables do not.
- Without `FORCE`, the `postgres` table owner bypasses every policy. All
  `SECURITY DEFINER` functions here are owned by `postgres`, so **they
  currently bypass RLS entirely** on `public` tables.
- Therefore enabling `FORCE` **changes the behaviour of every definer function
  that touches a forced table**, whether or not the policies themselves change.

### Not provable without an isolated Postgres — REQUIRES ISOLATED ENVIRONMENT

1. **`jwt_athlete_ids()` under `FORCE` on `public.athletes`.** The function is
   `SECURITY DEFINER` (runs as `postgres`) and reads `athletes`. Under `FORCE`,
   `postgres` becomes subject to `self_identity_policy`. `auth.uid()` reads a
   request GUC and does not depend on the database role, so the policy *should*
   still evaluate to the caller's own row — which is what the function selects
   anyway. **Should is not verified.** If it evaluates to ∅, every athlete-scoped
   policy silently denies everything and the parent portal returns empty pages
   with no error.
2. **Policy → definer → forced-table recursion.** `athlete`'s policy calls
   `jwt_athlete_ids()`, which reads `athletes`. If `athletes` is forced and its
   policy ever calls a helper that reads `athlete`, the evaluation recurses.
   Today it does not. Any future policy edit could introduce it, and Postgres
   reports this as a runtime error under load, not at migration time.
3. **`settle_payment_transaction` under `FORCE` on `registrations`.** The
   settlement RPC writes `registrations`. Under `FORCE` it becomes subject to
   `tenant_isolation_policy` (`tenant_id = app_tenant_id()`), and
   `app_tenant_id()` is `NULL` in a service-role connection. **This would very
   plausibly break settlement**, which is why minimum-set item 3 (drop that
   policy) must land **before** item 5 (`FORCE`), not with it.
4. Whether `service_role` is `BYPASSRLS` on this project, or is merely
   ungoverned because it is not the owner. This determines whether `FORCE`
   touches the service paths at all.

### ACCEPTANCE GATE — FORCE RLS

> `FORCE ROW LEVEL SECURITY` **must not** be applied to any table on which a
> `SECURITY DEFINER` function or a `service_role` write path depends, until all
> four questions above have been answered in an isolated Postgres instance with:
>
> - settlement exercised end to end (`settle_payment_transaction`,
>   `payment_service_authorization`) under `FORCE`,
> - `jwt_athlete_ids()` / `jwt_tenant_ids()` returning correct sets under `FORCE`,
> - a parent-portal read path returning the caller's own athlete and nobody else's,
> - a deliberate recursion probe.
>
> **Static analysis cannot discharge this gate**, and no test written from
> static analysis may be presented as discharging it. It is blocked on Docker
> or an equivalent isolated environment — an infrastructure task, not an
> engineering one.

## 7. Summary of corrections to earlier reporting

| Claim | Where | Correct statement |
|---|---|---|
| "A signed-in user can claim any athlete uuid and read that child's PII" | 0.3L §6.3 | **Latent, not live.** Blocked by `athletes_user_id_fkey` → `public.users`, which holds no `auth.users.id`. Proven: SQLSTATE 23503. |
| "Contained today only because uuids are not enumerable" | 0.3L §6.3 | The uuid argument is irrelevant. The FK is the containment, and one ordinary migration removes it. |
| "A tenant member sees every athlete in their tenant and therefore their guardian contacts, injuries, biometrics" | 0.3L §6.5 | **False.** Branch 2 emits app-plane ids that cannot match passport-plane tables. Coach-scoped PII access is not implemented. |
| "`generate_legacy_claim_token` is the real item" | 0.3L §6.6 | It is not client-reachable. Hygiene, not an escalation primitive. |
| "`public.athletes` is a misnamed link table" | 0.3L §5.1 | It is the **deliberate passport ⇄ app-plane bridge**, implemented correctly in `app/api/v1/mcp/route.ts`. That is exactly why client writes to it are dangerous. |
