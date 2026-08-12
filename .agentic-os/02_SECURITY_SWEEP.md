# 02 — SECURITY SWEEP: Multi-Tenant Authorization Gates

**Status:** BINDING. These are access-boundary laws, not guidelines.
**Threat model:** Athlytica is multi-tenant sports data infrastructure. A tenant (club, league, academy) must never read or write another tenant's athlete data. The blast radius of a missed gate is cross-tenant athlete data exposure — scouting passports, biometrics, minors' performance data. Treat every gap as a data-breach precursor, not a code smell.

---

## 1. The Authorization Model

Physical tables (see `prisma/schema.prisma`, `@@map`'ed names):

```
tenants ──< users
tenants ──< venues ──< sessions >── athletes
tenants ──< athlete_tenant_links >── athletes        ★ THE BOUNDARY TABLE
tenants ──< performance_logs >── athletes, sessions
```

`AthleteTenantLink` (`athlete_tenant_links`) is the **only** legitimate proof that a tenant may operate on an athlete:

```prisma
model AthleteTenantLink {
  id        String   @id @default(uuid())
  athleteId String   @map("athlete_id")
  tenantId  String   @map("tenant_id")
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([athleteId, tenantId])
  @@index([tenantId, athleteId])
  @@map("athlete_tenant_links")
}
```

An athlete may be linked to multiple tenants (club + league + national program). Membership in one tenant NEVER implies membership in another. The unique constraint makes `(athleteId, tenantId)` a single-row existence check — the cheapest possible gate. There is no excuse to skip it.

---

## 2. The Canonical Barrier (exact required logic)

Reference implementation lives in `app/api/v1/telemetry/ingest/route.ts`. Every route that receives `(tenantId, athleteId)` in any form reproduces this gate **before any business logic, lookup, or write**:

```ts
// STEP A — Contract first. tenantId/athleteId are validated UUIDs before the gate runs.
const { tenantId, athleteId } = parsed.data; // from zod safeParse — never from raw body

// STEP B — Boundary existence check against athlete_tenant_links.
const { data: link, error: linkErr } = await supabase
  .from("athlete_tenant_links")
  .select("id")
  .eq("athlete_id", athleteId)
  .eq("tenant_id", tenantId)
  .maybeSingle();

// STEP C — Fail closed, and distinguish infrastructure failure from denial.
if (linkErr) {
  return NextResponse.json(
    { status: "SERVER_ERROR", error: "Authorization lookup failed." },
    { status: 500 },
  );
}
if (!link) {
  return NextResponse.json(
    { status: "FORBIDDEN", error: "Athlete-tenant boundary mismatch." },
    { status: 403 },
  );
}
```

Laws embedded in this block:

1. **Fail closed.** A lookup *error* is 500, a lookup *miss* is 403. Never treat an error as authorization. Never default-allow.
2. **`maybeSingle()`**, not `single()` — a miss is an expected control-flow outcome, not an exception.
3. **The gate consumes only contract-validated UUIDs.** Running the gate on unvalidated strings reintroduces injection/enumeration surface.
4. **No information leakage:** the 403 body never reveals whether the athlete exists, which tenants they belong to, or row counts. `"Athlete-tenant boundary mismatch."` is the complete permissible disclosure.
5. **Gate placement is fixed:** contract validation → tenant barrier → everything else. Any lookup performed before the barrier is a violation even if the barrier appears later.

## 2.1 Second-Order Congruence Checks (mandatory, commonly forgotten)

Passing the barrier proves the athlete↔tenant edge. Every **other** resource in the request must independently prove it belongs to the same tenant. Reference pattern (session→venue→tenant, from the ingest route):

```ts
const { data: session } = await supabase
  .from("sessions")
  .select("id, athlete_id, venues ( id, tenant_id, coordinates )")
  .eq("id", sessionId)
  .eq("athlete_id", athleteId)   // session must belong to THIS athlete
  .maybeSingle();

if (!session || !session.venues) return NOT_FOUND;
const venue = Array.isArray(session.venues) ? session.venues[0] : session.venues;
if (venue.tenant_id !== tenantId) {
  return NextResponse.json(
    { status: "FORBIDDEN", error: "Session venue belongs to a different tenant." },
    { status: 403 },
  );
}
```

Rule: **every foreign key that arrives in a payload gets a congruence check.** sessionId, venueId, userId, logId — each one is an attack vector for confused-deputy access if accepted on faith.

## 2.2 Service-Role Client Hazard

Server routes use the Supabase **service-role key**, which BYPASSES Row-Level Security entirely:

```ts
function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Consequences that are law:

- With RLS bypassed, **the application-layer barrier in §2 is the only wall.** There is no database safety net behind these routes.
- The service-role key never appears in client-side code, edge-rendered props, logs, or error bodies.
- Any route using `adminClient()` without the §2 barrier is not "missing a check" — it is an **open cross-tenant door**.

---

## 3. The Flagging Law

> **Any backend route under `app/api/` that reads or writes tenant-scoped data without an explicit `athlete_tenant_links` barrier (or a documented equivalent tenant-scope proof) is automatically classified as a CRITICAL ARCHITECTURAL FAILURE.**

There is no severity negotiation. A downstream model that discovers such a route must, in the same session: (a) report it in its final response under the heading `CRITICAL: TENANT BARRIER MISSING`, (b) refuse to extend the route with new functionality until the barrier is added, and (c) either retrofit the gate or record the founder's explicit deferral.

Routes handling genuinely tenant-less data (health checks, public marketing endpoints) must carry a comment header `// TENANT-EXEMPT: <reason>` to pass the sweep. Absence of both barrier and exemption header = failure.

---

## 4. Audit Procedure (run during Phase 3 of every change)

```bash
# 1. Enumerate all route surfaces
find app/api -name "route.ts"

# 2. For each, confirm barrier or exemption
grep -L "athlete_tenant_links\|TENANT-EXEMPT" $(find app/api -name "route.ts")
# Any file listed by grep -L is in violation.

# 3. Confirm no route trusts unvalidated tenant identifiers
grep -n "tenantId" app/api -r | grep -v "z.string().uuid\|parsed.data\|safeParse"  # inspect hits manually

# 4. Confirm the service-role key never leaks past the server boundary
grep -rn "SUPABASE_SERVICE_ROLE_KEY" app utils --include="*.ts" | grep -v "route.ts\|adminClient"
```

## 4.1 Current Audit Ledger (updated 2026-07-12, enforcement pass — re-verify every session, do not trust this table blindly)

| Route | Barrier | Status |
|---|---|---|
| `app/api/v1/telemetry/ingest/route.ts` | ✅ Full §2 + §2.1 gates | COMPLIANT — canonical reference |
| `app/api/v1/mcp/route.ts` | ✅ App-layer barrier injected 2026-07-12: caller JWT → `users` → tenant resolution (fail closed 403), `athlete_tenant_links` bridge check on `get_athlete_passport` + `log_scouting_metric`, tenant filter/stamp on `cohort_telemetry` reads and `scouting_metric_log` writes | COMPLIANT. **`SEC-001` CLOSED at repository level 2026-07-13** — see §4.2. Defense is now two-layer: app barrier + database RLS. |
| ~~`app/api/v1/onboarding/google-forms/route.ts`~~ | — | **RETIRED 2026-08-12 (D-26c, Phase 0.3H).** Was `TENANT-EXEMPT` as pre-tenant identity creation. The exemption is now moot: the route creates nothing, builds no database client and reads no request body — it answers `410 CHANNEL_RETIRED`. It never processed a real submission; all seven records it produced were synthetic. Intake runs through `/register` → `stk-push` → `mpesa-callback` under the M4 payment authorization boundary. **Do not resurrect** — a second identity-creating intake door is exactly what 0.3E/0.3F closed. Guarded by `tests/google-forms-retired.test.mts`. |
| `app/api/v1/auth/register/route.ts` | ✅ `TENANT-EXEMPT` justification in file header (2026-07-13) | EXEMPT — pre-tenant identity creation (Workflow Inversion Pattern, W-6). Standing conditions: INSERT/idempotent-reuse on `registrations` only; payload `tenantId` validated to exist but confers zero scoped reads; account construction happens exclusively inside `settle_payment_transaction` after validated financial evidence. Fee is server-derived (`config/registration-fees.ts`) — client-supplied amounts are a pricing-integrity violation. DPA: raw MSISDN hashed in-memory, never persisted. |
| `app/api/v1/biz/mpesa-callback/route.ts` | ✅ Machine/ops auth walls; no tenant-scoped reads; single-RPC write path | COMPLIANT — resolution router (2026-07-13) canonicalizes phone-bearing account references to hash-derived `REG-#<hash16>` before persistence; atomic account construction moved fully inside the RPC. |
| ~~`app/api/v1/performance/route.ts`~~ | — | **DELETED 2026-07-12.** Legacy scaffold: no tenant contract, no persistence, superseded by `telemetry/ingest`. Do not resurrect; new ingestion features extend the canonical gateway. |

Open flags: none at repository level. `SEC-001` closure carries a **deployment verification checklist** (§4.2) that must be executed against the live database — repo-level closure is not runtime proof.

## 4.2 SEC-001 Closure Record (2026-07-13) + RLS Law

**Migration:** `supabase/migrations/20260713110000_sec001_rls_hardening.sql` (additive-only). Placed in `supabase/migrations/` — NOT `prisma/migrations/` — because deployment DDL source of truth is Supabase (schema.prisma header law; one migration directory, zero drift).

Delivered:

1. Versioned DDL for `cohort_telemetry` and `scouting_metric_log` (`tenant_id uuid NOT NULL REFERENCES tenants`, composite indexes led by `tenant_id` per §5).
2. `ENABLE` + `FORCE ROW LEVEL SECURITY` on both tables.
3. `tenant_isolation_policy` — session-GUC path, fail-closed by construction: `tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid` for both `USING` and `WITH CHECK`. Unset context ⇒ NULL predicate ⇒ zero rows.
4. `tenant_member_policy` (`TO authenticated`) — JWT path mirroring `resolveCallerTenant()` (auth email → `users` → `tenant_id`), so the MCP gateway keeps functioning the moment RLS flips on. RLS without this policy would have silently zeroed every MCP read: a broken wall, not a safe one.
5. `REVOKE ALL ... FROM anon` on both telemetry tables.
6. **SEC-002 (adjacent hole, fixed in the same migration):** `users` was readable by ANY authenticated JWT via PostgREST (the anon-key+JWT client used by `resolveCallerTenant` implied it). Now `ENABLE ROW LEVEL SECURITY` + `users_self_read` (own row only) + `REVOKE FROM anon`. Deliberately NOT `FORCE`: `settle_payment_transaction` is SECURITY DEFINER (owner-run) and must keep constructing accounts — Supabase's `postgres` owner does not carry BYPASSRLS.

**Tenant-context law for any direct-SQL/ORM connection (Prisma or otherwise):**

```ts
// ONLY sanctioned form — parameterized, transaction-local:
await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
```

> **PROHIBITED:** `` prisma.$executeRawUnsafe(`SET LOCAL app.current_tenant_id = '${tenantId}';`) `` — string interpolation inside the tenant-isolation control is an SQL-injection vector *inside the security boundary itself*. Any PR containing `$executeRawUnsafe` with interpolated identity is an automatic CRITICAL. Note: `@prisma/client` is not currently a runtime dependency of this repo (data plane is supabase-js + SECURITY DEFINER RPCs); this law binds the day any direct-SQL client is introduced.

**Deployment verification checklist (execute on the live database; repo cannot prove these):**

- [ ] Apply `20260713100000_registration_sessions_v2.sql` and `20260713110000_sec001_rls_hardening.sql`.
- [ ] `SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname IN ('cohort_telemetry','scouting_metric_log','users');` — expect `t/t`, `t/t`, `t/f`.
- [ ] Confirm every non-Supabase connection string uses a dedicated **non-superuser, non-BYPASSRLS** role: `SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` from each consumer.
- [ ] Negative test: as `authenticated` with a tenant-A JWT, read a tenant-B `cohort_telemetry` row — expect zero rows.
- [ ] Standing fact: Supabase `service_role` carries BYPASSRLS **by design** — every `adminClient()` route bypasses these policies. The §2 application barrier remains the primary wall on service-role routes; RLS is the database net behind it, not a replacement.

---

## 5. Extension Rules

- New tenant-scoped tables MUST carry `tenant_id` with an FK to `tenants` and a composite index led by `tenant_id` (pattern: `@@index([tenantId, athleteId, createdAt])` on `performance_logs`).
- New queue/worker tables (pattern: `telemetry_ingest_queue`) carry `tenant_id` end-to-end; the worker re-verifies nothing but inherits a payload that already passed the gate — therefore the gate must run **before** enqueue, never after dequeue only.
- If athlete-level RLS policies are ever added for client-facing (anon-key) access, they complement — never replace — the §2 application barrier on service-role routes.
