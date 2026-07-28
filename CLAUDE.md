# Athlytica Systems Engine — working notes

Next.js App Router + Supabase. One sign-on, four workspaces (`tta`,
`nrhl`, `big_ice`, `athlytica_hq`). Inline styles throughout; there is no
CSS framework and no component library — match the surrounding file.

Commands: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`.

---

## ROUTING & AUTHENTICATION CONVENTIONS

### Entry points

| Route | Purpose |
|---|---|
| `/` | Public marketing landing page. Server-rendered, signed-out. |
| `/login` | Auth gateway. Magic link (default) + password. |
| `/auth/callback` | Single return address for magic link **and** OAuth/PKCE. |
| `/onboarding` | Profile setup. The one authed route outside the `(app)` shell. |
| `/register` | M-Pesa intake funnel (tier + programme picker). |
| `/dashboard/**` | Everything behind auth, inside the `(app)` route group. |

### Post-auth redirection matrix

Resolved in **one place**: `landingFor()` in `lib/auth/landing.ts`.
Roles come from `/api/v1/workspace/dashboard`, which derives them
server-side — never from a client claim.

| Actor | Lands on |
|---|---|
| Founder (`dennis@bigice.co.ke`) or any `GLOBAL_FOUNDER` grant | `/dashboard/leagues/nrhl/overview` |
| Any `HEAD_COACH` grant | `/dashboard` (command canvas, coach lens) |
| Any `ATHLETE` grant | `/dashboard/venture` |
| No grant, no profile | `/onboarding` |
| No grant, profile filed | `/dashboard` → shell's "access pending" screen |

A grant always outranks the profile step, so an already-onboarded account
never sees the form. Covered by `tests/landing-route.test.mts`.

### Tenant route aliases

Routes are **kebab-case**; workspace ids are **snake_case** (they match a
SQL `CHECK` constraint). `WORKSPACE_SLUGS` / `workspaceFromSlug()` in
`config/workspaces.ts` is the only mapping between them.

| URL | Workspace id |
|---|---|
| `/dashboard/w/nrhl` | `nrhl` (redirects to the six-tab league command centre) |
| `/dashboard/w/big-ice` | `big_ice` |
| `/dashboard/w/tta` | `tta` |
| `/dashboard/w/hq` | `athlytica_hq` |

`/dashboards/*` (plural) redirects to `/dashboard/*` via `next.config.mjs`.
The alias sets the active workspace and renders — **it grants nothing**.

> Naming note: earlier specs referred to `/dashboards/league/hq/overview`,
> `/dashboards/[tenantSlug]/overview` and `/get-profiled`. Those paths do
> not exist. The table above is what is implemented and tested; the
> plural prefix is served as a redirect for anything still linking to it.

### Auth guard mechanism — and why there is no middleware

The Supabase session lives in **localStorage**, not a cookie
(`utils/supabaseClient.ts`). Next middleware and server components cannot
see it, so the guard is necessarily client-side:

- `components/workspace/WorkspaceProvider.tsx` bounces a session-less
  visitor to `/login?redirectTo=<path>`.
- `components/auth/redirect-if-authed.tsx` does the reverse on public
  pages, and owns the "Authenticating…" veil.

The graph is acyclic by construction — the two predicates are disjoint,
and `landingFor()` never returns a public route.

**Do not add `middleware.ts` for auth** without first migrating to
cookie-backed sessions (`@supabase/ssr`). A middleware guard against a
localStorage session either passes everyone or locks everyone out.

`?redirectTo=` is sanitised by `safeRedirectTo()` — same-origin absolute
paths only. A login screen is exactly where an open redirect gets planted.

### Fallback strategy for external data

The landing page reads live Big Ice prices from `bigice.co.ke`
(`lib/services/bigice-pricing.ts`). Three laws, because this is a
third-party call on a render path:

1. **It cannot hang** — `AbortController`, 1.5s, no exceptions.
2. **It cannot throw** — every failure returns `FALLBACK_TIERS`.
3. **It cannot set a price** — the M-Pesa charge is always re-derived
   server-side from the tier table in `/api/v1/biz/stk-push`.

A *partial* scrape is rejected too: showing three of seven cohorts looks
authoritative and is wrong. `tests/bigice-pricing.test.mts` exercises all
five failure modes against the timeout budget.

The tenant list needs no fetch at all — `FALLBACK_TENANTS` in
`app/page.tsx` is derived from `config/workspaces.ts`, so the marketing
page and the shell cannot disagree about which ventures exist.

---

## SECURITY INVARIANTS

**A workspace grant is all-or-nothing.**
`/api/v1/workspace/dashboard?workspace=<id>` returns a venture's *entire*
payload — `payment_events`, `registrations`, revenue, the permission
matrix — to any role holding a grant. Role filtering (`canSee`,
`visibleNav`) happens **client-side at render**.

Consequences, and they are not optional:

- **Never auto-grant a `workspace_roles` row from a self-service flow.**
  An `ATHLETE` grant is not low-privilege; it returns the same JSON the
  founder gets, drawn with fewer panels.
- `user_profiles.requested_workspace` / `requested_role` are a **claim**,
  not authorisation. The founder converts a claim into a grant in the HQ
  permission matrix.
- If per-role payload trimming ever lands server-side, revisit both.

**Money is never client-priced.** `/api/v1/biz/stk-push` derives the
charge from `config/registration-fees.ts` or `commercial_price_tier`, and
rejects a mismatched client `amount`. The `/register` programme picker
filters the tier list so `source` and the server-derived
`venture_context` cannot disagree.

**Fail closed on config.** Unprovisioned env → `503 CONFIG_DEBT`, never a
made-up default. Missing table → `503 SCHEMA_DEBT`. A half-provisioned
database must still render, so dashboard panels degrade independently
(`safeRows`) rather than 500 the page.

---

## DATA NOTES

- Supabase project ref `qxfrypvevjsyzkquewxh`.
- Root founder `dennis@bigice.co.ke` bypasses grant lookup in both
  `lib/auth/workspace.ts` and `public.is_global_founder()`. Change both.
- Workspace/role taxonomy is mirrored in `config/workspaces.ts` and the
  SQL `CHECK` constraints. Widen both or neither.
- Big Ice academy packages price from `commercial_price_tier`
  (`tier_group = 'academy'`), not the code-level tier table. They are not
  yet purchasable from `/register` — that needs a public price endpoint.
