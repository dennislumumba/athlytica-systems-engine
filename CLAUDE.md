# Athlytica Systems Engine — working notes

Next.js App Router + Supabase. One sign-on, four workspaces (`tta`,
`nrhl`, `big_ice`, `athlytica_hq`). Inline styles throughout; there is no
CSS framework and no component library — match the surrounding file.

Commands: `pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test`.

---

## DEPLOYMENT — A PUSH IS NOT A DEPLOY

**GitHub's default branch and Vercel's Production Branch are independent
settings.** One does not imply the other, and neither can be inferred
from the other. Production deployment status is a fact about Vercel
deployment metadata — read it, never derive it.

This file used to say the opposite ("`main` is the repository default
branch **and therefore** the Vercel project's production branch"). That
inference was false for the entire life of the project. Verified
2026-08-12 (Phase 0.3K) against the Vercel API: `productionBranch` was
`master` while every commit since 2026-08-11 was pushed to `main`, so
**every push to `main` built a Preview and nothing else**. In all 81
deployments on record, not one successful production deployment came
from Git — the 12 that Git did produce were all from `master` and all
failed, and every production URL the business ever served came from a
manual `vercel --prod` upload. It was fixed by setting
`productionBranch` to `main`; see `docs/phase0/DEPLOYMENT_CHAIN_AUDIT.md`.

The earlier `master` story in this file was a misdiagnosis of the same
fault. `master` was not "the branch that does not publish" — it was the
production branch, and its builds were failing on missing
`NEXT_PUBLIC_SUPABASE_*` production env vars (provisioned later, on
2026-08-11). Both branches failed to reach production, for two different
reasons, and fast-forwarding `main` to `master` (574e672) fixed neither.

### The deployment chain

```
commit → push to main → Vercel Git integration → Production deployment
       → production alias → HTTP probe → known commit
```

Every arrow is a separate claim. **A commit is not "deployed" until all
four of these hold:**

1. Vercel reports a deployment with `target: production`,
2. that deployment has `source: git` and `meta.githubCommitSha` equal to
   the expected commit,
3. the production alias points at that deployment,
4. a route the change actually touches returns the new behaviour.

`pnpm verify:production` checks 1–3 and prints the alias's live answer
for the current canary route. It exits non-zero on any mismatch.

### Rules

- Commit and push to **`main`**. Do not commit to `master`; it is stale
  and no longer wired to anything.
- **Never use `vercel --prod` as the deployment mechanism.** It uploads
  the *working tree*, not a commit — on 2026-08-12 that shipped a
  half-finished edit to `app/api/v1/performance/route.ts` straight at
  production and failed the build there. A CLI production deployment
  also stamps a commit SHA it did not build from, so its metadata lies.
  Use it only to recover when Git deployment is itself broken, and say
  so in the commit record when you do.
- Verify against a route the change actually touches. A 200 on
  `/register` proves nothing — that page has existed for months. Pick a
  discriminator whose *old* answer differs from its *new* one:
  `GET /api/v1/onboarding/google-forms` returns **405** on any build
  before 4cf7787 and **410** on any build after it.
- If a push has not produced a Production deployment within ~3 minutes,
  read `productionBranch` before debugging anything else.

The static sites are separate projects on their own repos and deploy
from **their** `main` (`NRHL-Site`, `big-ice-site`). `nairobihockey.com`
proxies `/register`, `/api/v1/*` and `/_next/*` here via `vercel.json`
rewrites, so a stale engine deploy surfaces as a stale checkout on a
site that itself deployed correctly.

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
  (`tier_group = 'academy'`), not the code-level tier table. `/register`
  offers them via `GET /api/v1/public/packages` and submits
  `priceTierId`; every other programme submits `tier`. The STK route
  takes **exactly one** of the two and re-derives the charge from it.
- `/register` deep links: `?tier=` names a code-table tier, `?package=`
  names a `commercial_price_tier.tier_id`. Both outrank `?source=`.
  `?package=` is resolved in the `selected` derivation rather than in
  `pickedKey`'s initial state, because the academy list arrives over the
  network after first render. Without it an academy CTA fell through to
  `choices[0]` — the list is priced descending, so every Big Ice link
  landed on the 350,000 cohort.
- `commercial_price_tier.tier_name` is what a parent reads immediately
  before entering their M-Pesa PIN. It must match the name on
  bigice.co.ke. They drifted once ("Quarterly" vs "3-Month
  Development"); `20260811090000_bigice_beginner_package.sql` realigned
  them. Rename on the site → rename the row.

**bigice.co.ke's programme `<select>` is a parsed contract.**
`lib/services/bigice-pricing.ts` regexes the enquiry form's "Preferred
programme" options out of the raw HTML — no JS is executed, so anything
JS-rendered is invisible to it. The `value` slugs are frozen, the
`Label — KSh 0,000` text shape is load-bearing, and fewer than seven
priced options makes the whole scrape count as partial and fall back.
`FALLBACK_TIERS` must equal what that markup parses to; the test asserts
it. The site's `data.js` duplicates those prices and its `main.js`
console-errors on drift at load.
