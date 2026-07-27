# 01 — PROJECT PLANNER: The Plan–Apply–Unify Execution Loop

**Status:** BINDING. Every model session that modifies `athlytica-systems-engine/` executes this loop in full. No phase may be skipped, merged, or reordered.
**Scope:** All code, schema, migration, and configuration changes in this repository.
**Authority chain:** This manual < observed repository state < the database DDL in `supabase/migrations/`. When this document and the repository disagree, the repository is truth — update this document, do not "fix" the repo to match stale rules.

---

## ✅ ROUTING ARCHITECTURE — RATIFIED (founder sign-off 2026-07-12)

**The App Router is the permanent runtime architecture of this repository. Pages-router assumptions are formally FROZEN and retired.** Original drafts of this OS referenced "Pages router implementations"; the founder has explicitly ratified the observed reality instead:

- All API surfaces are **App Router route handlers**: `app/api/v1/<domain>/route.ts` using `NextRequest`/`NextResponse` from `next/server`. Edge runtime (`export const runtime = "edge"`) where declared.
- There is no `pages/` directory and one must never be created. Next.js `^14.2.5`, React 18, TypeScript strict via `npm run typecheck`.

**Law:** introducing `pages/api/*` in any form forks the routing layer and is classified as a critical architectural failure. Any future UI surfaces also use the App Router (`app/<segment>/page.tsx`). This ruling is closed — downstream models do not relitigate it.

Tailwind CSS is **not currently installed** (no dependency, no config). The Tailwind conventions in Phase 2 apply the moment any UI surface is added; do not bolt Tailwind onto the project for API-only changes.

---

## Repository Topology (memorize before planning)

```
athlytica-systems-engine/
├── app/api/v1/                      # App Router API surfaces (route.ts handlers)
│   ├── telemetry/ingest/route.ts    # Canonical ingestion gateway (reference implementation)
│   ├── mcp/route.ts                 # JWT + app-layer tenant barrier (patched 2026-07-12)
│   ├── onboarding/google-forms/route.ts  # TENANT-EXEMPT (HMAC webhook, justification in header)
│   ├── dev/context-fetcher/route.ts # DEV-ONLY dependency indexer (403 in prod; added 2026-07-12, manual 05)
│   ├── biz/cash-watcher/route.ts    # Ops-token liquidity readout over payment_events (manual 05)
│   ├── biz/mpesa-callback/route.ts  # Polymorphic AUTHENTICATED settlement ingestion → settle_payment_transaction RPC (04 §5)
│   └── marketing/cro/route.ts       # Funnel beacon (POST tenant-exempt, justified) + ops-token readout (manual 05)
│   # NOTE: legacy performance/route.ts DELETED 2026-07-12 (no tenant contract, no persistence)
├── prisma/schema.prisma             # Application-plane models (@@map'ed to snake_case)
├── supabase/
│   ├── migrations/                  # ★ DDL SOURCE OF TRUTH for deployment
│   │   ├── 20260711120000_hercules_core_merge.sql   # CHECK(1..100), append-only trigger, passport FK bridge
│   │   ├── 20260712190000_payment_and_funnel_events.sql  # payment_events (G-W6-PAY ledger) + onboarding_funnel_events
│   │   └── 20260712210000_registrations_and_settlement_rpc.sql  # registrations, gate_states, append-only trigger, atomic settle RPC
│   └── functions/
│       ├── _shared/analyticsEngine.ts   # ★ CANONICAL MATH (Deno + Node shared)
│       └── telemetry-processor/index.ts # Async worker: computes vectors, appends performance_logs
├── core-engine/schemas/             # Passport-plane SQL (athlete passport, outside Prisma)
├── utils/analyticsEngine.ts         # Re-export shim of _shared engine — NEVER fork logic here
├── utils/usePerformanceFeed.ts
├── utils/opsGuard.ts                # Shared X-Ops-Token guard (fail-closed) — NEVER fork per-route copies
└── .agentic-os/                     # This rulebook (05_CORPORATE_SKILLS.md = Charlie OS skill registry)
```

Two data planes coexist in one Postgres database:

| Plane | Owner | Tables | Managed by |
|---|---|---|---|
| Application plane | Prisma (`prisma/schema.prisma`) | `tenants`, `users`, `athletes`, `athlete_tenant_links`, `venues`, `sessions`, `performance_logs` | Supabase SQL migrations (Prisma models mirror them) |
| Passport plane | `core-engine/schemas/*.sql` | `athlete` (passport identity) and related | Raw SQL only — **Prisma must never migrate these** |

The bridge is `athletes.passport_athlete_id` (nullable FK, constraint lives in SQL, not Prisma).

---

## PHASE 1 — PLAN (no file may be modified during this phase)

Before touching any text, the model produces a written plan containing all four artifacts below. If the session's context does not permit producing them, the session is not permitted to edit.

### 1.1 Explicit File Dependency Manifest

List every file that will be read, created, or modified, with its role:

```text
PLAN MANIFEST — <change title> — <date>
READ:
  prisma/schema.prisma                      (schema authority for models touched)
  supabase/migrations/20260711120000_*.sql  (DDL constraints on affected tables)
  supabase/functions/_shared/analyticsEngine.ts  (if math-adjacent)
  app/api/v1/telemetry/ingest/route.ts      (reference gate pattern, if adding a route)
MODIFY:
  <path> — <exact nature of change>
CREATE:
  <path> — <purpose>
FORBIDDEN THIS CHANGE:
  supabase/functions/_shared/analyticsEngine.ts math internals (unless the change IS an engine version bump — see 03)
  core-engine/schemas/*.sql (passport plane)
```

A change that discovers an unlisted dependency mid-edit returns to Phase 1 and re-issues the manifest. Silent scope creep is a protocol violation.

### 1.2 Schema Impact Analysis

For every table/model the change touches, answer in writing:

1. Which Prisma model and which `@@map`'ed physical table?
2. Which SQL migration carries constraints Prisma cannot express (CHECK bounds, triggers, FKs to the passport plane)? Quote the constraint.
3. Does the change require a new migration file in `supabase/migrations/` (timestamped `YYYYMMDDHHMMSS_description.sql`)? Prisma schema edits without a matching SQL migration are drift by definition.
4. Is the table append-only? (`performance_logs` is — UPDATE/DELETE blocked by DB trigger. Any plan that includes updating a performance log row is invalid at planning time.)

### 1.3 Contract Impact Analysis

If the change touches an API surface: state the Zod contract being modified, whether the change is additive (new optional field — allowed) or breaking (renamed/retyped/required field — requires explicit founder sign-off recorded in the plan), and which callers consume it.

### 1.4 Development Path

An ordered step list, each step small enough to typecheck independently, ending with the Phase 3 verification steps. A plan without a verification tail is incomplete.

---

## PHASE 2 — APPLY (implementation laws)

### 2.1 Route handler law

Every new API surface follows the canonical shape observed in `app/api/v1/telemetry/ingest/route.ts`:

```ts
// app/api/v1/<domain>/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const requestContract = z.object({
  tenantId: z.string().uuid(),
  athleteId: z.string().uuid(),
  // ... domain fields. NO z.any() at the envelope level.
});

export async function POST(request: NextRequest) {
  // 1. Parse JSON defensively → 400 INPUT_REJECTED on malformed body
  // 2. Zod contract validation (safeParse, never parse+throw for control flow in new code)
  // 3. MULTI-TENANT AUTHORIZATION BARRIER — mandatory, see .agentic-os/02_SECURITY_SWEEP.md
  // 4. Resource–tenant congruence checks (session/venue/etc. must belong to the same tenant)
  // 5. Business logic / durable enqueue
  // 6. Structured response: { status, ... } with correct HTTP code
}
```

Non-negotiables:

- **Type safety:** no `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error` without an inline justification comment. `catchall(z.any())` is tolerated only inside sport-extension leaf objects that already have typed anchor fields (existing pattern), never at envelope level.
- **Zod is the boundary.** Raw `request.json()` output is `unknown` until a contract parses it. No property access on unvalidated payloads.
- **Response vocabulary** is the existing status enum: `INPUT_REJECTED` (400), `FORBIDDEN` (403), `NOT_FOUND` (404), `GEO_REJECTED` (422), `DUPLICATE` (200, idempotent no-op), `ACCEPTED` (202), `SERVER_ERROR` (500). New statuses require a plan-level justification.
- **Compute nothing in the request path** that belongs to the async worker. Ingestion routes validate, gate, enqueue, dispatch best-effort, and return 202. The Edge Function owns the math (`supabase/functions/telemetry-processor`). This decoupling is architecture, not preference.
- **Idempotency:** any durable write triggered by an external payload carries a `sha256` `ingest_hash` over the canonical payload; unique-violation (`23505`) maps to the `DUPLICATE` response, never to an error.
- **Modularity:** shared logic lives in `utils/` (Node) or `supabase/functions/_shared/` (isomorphic Deno+Node). Route files stay under ~250 lines; extract when exceeded.

### 2.2 Styling law (dormant until UI exists)

When UI surfaces are introduced: Tailwind utility classes only — no CSS modules, no styled-components, no inline `style={}` except for genuinely dynamic computed values. Class strings ordered layout → spacing → typography → color → state variants. Extract repeated class clusters into components, not `@apply` soup. Install Tailwind via its own planned change, never as a side effect.

### 2.3 Migration law

- New DDL goes in a new timestamped file under `supabase/migrations/`. Never edit an already-applied migration.
- Prisma is a **mirror**, not a driver: after DDL changes, update `prisma/schema.prisma` to match (with `@@map`/`@map` to snake_case) — do NOT run `prisma migrate` against this database. The schema header says why: the passport plane and the append-only trigger are invisible to Prisma and would be destroyed by a generated migration.
- Additive columns on `performance_logs` must not weaken: the CHECK (1..100) bounds on the five vectors, the append-only trigger, the `ingest_hash` uniqueness.

---

## PHASE 3 — UNIFY (mandatory verification tail)

No change is complete until every applicable step passes. Report results explicitly; "should pass" is not a result.

1. **Typecheck:** `npm run typecheck` (`tsc --noEmit`) — zero errors. This is the regression gate against the Prisma/PostgreSQL type surface.
2. **Schema congruence:** re-read `prisma/schema.prisma` against any migration added this session. Every new column: present in both, names `@map`'ed correctly, nullability identical.
3. **Constraint preservation audit:** confirm in the migration text that no statement drops/replaces the append-only trigger, the 1..100 CHECK bounds, or the passport FK bridge. Grep is acceptable evidence: `grep -n "DROP TRIGGER\|DROP CONSTRAINT" supabase/migrations/<new file>` must return nothing unintentional.
4. **Security sweep:** run the audit procedure in `.agentic-os/02_SECURITY_SWEEP.md` §4 over every route touched or added.
5. **Engine integrity:** if anything under `supabase/functions/` or `utils/analyticsEngine.ts` changed, apply the invariants in `.agentic-os/03_TAXONOMY_ENGINE.md` §6 (including the `ENGINE_VERSION` bump rule).
6. **Diff review:** generate and read the full diff of the session before declaring completion. Unexplained hunks = return to Phase 1.

A session that cannot run the typecheck (no environment) must say so and mark the change UNVERIFIED in its final report. Never report verified status that was not executed.
