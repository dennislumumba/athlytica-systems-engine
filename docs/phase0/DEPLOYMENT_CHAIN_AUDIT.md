# Deployment Chain Audit — Phase 0.3K

**Date:** 2026-08-12
**Scope:** the Git → Vercel Preview → Vercel Production → HTTP chain, and
nothing else. No schema change, no migration, no feature work.

**The question this phase had to answer:** *what exact source commit is
Production running, and can we prove it?*

Before this phase the honest answer was "unknown". It is now
`06afdab28123a0bc5d0ecb693d2826f4e77477b2`, and there is a command that
re-derives it: `pnpm verify:production`.

Every claim below is labelled **VERIFIED** (read from the Vercel API or an
HTTP response captured in this phase), **NOT VERIFIED**, or **UNKNOWN**.

---

## 1. Previous architecture — what was actually happening

**VERIFIED.**

```
commit → push to main → Vercel Git integration → PREVIEW deployment → nothing
                                                                        ▲
                            production alias moved only when a human ran │
                            `vercel --prod` from a laptop ───────────────┘
```

The repository believed it was continuously deployed. It was not. Production
was advanced by hand, from a working tree, on no schedule, by one person on
one machine.

## 2. Verified root cause

**VERIFIED.** `productionBranch` on Vercel project
`prj_hxGqQ9ZQWdlLEXs5smjFQ7vrVY0w` was **`master`**. Every commit since
2026-08-11 was pushed to **`main`**.

GitHub's default branch (`origin/HEAD → main`) and Vercel's Production Branch
are independent settings. `CLAUDE.md` asserted that the first implied the
second — "*it is the repository default branch … and therefore the Vercel
project's production branch*". That inference was false, and false for the
entire life of the project.

Consequence: a push to `main` produced a Preview deployment aliased to
`athlytica-systems-engine-git-main-…vercel.app`, and the production alias was
never touched.

### 2a. The earlier `master` diagnosis was a misdiagnosis of the same fault

**VERIFIED.** `CLAUDE.md` blamed a stale checkout on commits "landing on
`master`" and not being deployed. The opposite was true: `master` *was* the
production branch, its deployments *were* production-targeted, and all twelve
of them **failed to build**. The last one (`574e672`, 2026-08-10T22:15Z) died
on:

```
Error: Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.
Export encountered an error on /(app)/dashboard/leagues/nrhl/admin/page
```

Those two variables were not created in Vercel until **2026-08-11T16:42Z**
(**VERIFIED** from the project env listing). So both branches failed to reach
production, for two unrelated reasons, and fast-forwarding `main` to `master`
(`574e672`) fixed neither. The env gap is now closed — all 20 variables are
scoped to both `preview` and `production`.

## 3. Current Vercel configuration

**VERIFIED**, read from `GET /v9/projects/{id}` after the change.

| Setting | Value |
|---|---|
| Project | `athlytica-systems-engine` · `prj_hxGqQ9ZQWdlLEXs5smjFQ7vrVY0w` |
| Team | `dennis-lumumba-projects` · `team_6YnismcC9QVrVEfiahABUnGY` |
| Git provider | GitHub, `dennislumumba/athlytica-systems-engine` (repoId `1294478671`) |
| Git integration | **enabled** (was enabled throughout; it was pointed at the wrong branch) |
| **Production Branch** | **`main`** (was `master`) |
| Automatic production deployments | **enabled** — confirmed by observation, §6 |
| Preview deployments | enabled, and were the *only* thing Git produced before this phase |
| Ignored build step | none (`commandForIgnoringBuildStep: null`) |
| Deploy hooks | **none** |
| Production protection / approval | none. `ssoProtection: all_except_custom_domains` is Vercel Authentication on deployment URLs; it does not gate promotion, and the production alias answers unauthenticated (§8) |
| Custom deployment mechanism | **none** — no `ignoreCommand`, no hooks, no CI workflow |
| Build | framework `nextjs`, `pnpm install` / `pnpm build` from `vercel.json`, Node 24.x, region `iad1` |

## 4. Historical deployment evidence

**VERIFIED.** All 81 deployments on record (oldest 2026-07-25T21:45Z), from
`GET /v6/deployments`, grouped by `target | source | branch`:

| target | source | branch | count | outcome |
|---|---|---|---|---|
| preview | git | main | 27 | all READY |
| production | git | **master** | 12 | **all ERROR** |
| production | cli | main | 13 | mostly READY |
| production | cli | master | 2 | READY |
| production | redeploy | main | 25 | mostly READY |
| preview | redeploy | main | 2 | READY |

Two facts follow, and both are load-bearing:

1. **No successful production deployment has ever come from Git.** Not one.
   Every production URL this business has served came from a CLI upload or a
   dashboard redeploy of one.
2. **Every Git-sourced production deployment failed.** All twelve, all from
   `master`, all on the missing-env-var build error in §2a.

Recent production deployments in detail:

| deployment | created (UTC) | target | source | branch | sha | state |
|---|---|---|---|---|---|---|
| `dpl_AZdYh344snMvashHUT3ws8P4m9S8` | 2026-08-12 23:48 | production | **git** | main | `06afdab` | READY ← this phase |
| `dpl_2CMHoLjziafAef7VUJVdgPmpxopt` | 2026-08-12 19:06 | production | cli | main | `f7f451a` | READY ← previous production |
| `dpl_4dxDUZ7dbv9j2P5dDA5xtjgKDeTA` | 2026-08-12 18:51 | production | cli | main | `f7f451a` | READY |
| `dpl_A7qsdZLonThesRN9AszGSM6FUPQy` | 2026-08-12 18:12 | production | cli | main | `6b19bbc` | ERROR |
| `dpl_BT9LPGTSkHiMRCFcoFnsoZwoQoit` | 2026-08-12 18:06 | production | cli | main | `6b19bbc` | ERROR |
| `dpl_5n3JDHNbp797RnHCHeLmbno2GDHy` | 2026-08-12 22:31 | **preview** | git | main | `14d53d0` | READY |
| `dpl_3TuXYz3W7yHxcUZX9yzEtU3psjqW` | 2026-08-12 22:12 | **preview** | git | main | `4cf7787` | READY |

The last two rows are Phase 0.3I's unexplained non-deployment, explained: the
Google Forms retirement built successfully and was published to a Preview URL.

### 4a. `vercel --prod` deployment metadata cannot be trusted

**VERIFIED, and it matters more than it looks.** The two ERROR rows above are
CLI production deployments stamped `sha: 6b19bbc`. They did not build
`6b19bbc`. They failed on:

```
Parsing ecmascript source code failed
at ./app/api/v1/performance/route.ts:43:10
  > 43 |   export function normalizeKenyanPhone(phone: string): string {
```

— a half-finished edit that existed only in the working tree. `vercel --prod`
uploads **the working directory**, then labels the deployment with whatever
commit `git` happens to be sitting on. The SHA on a CLI production deployment
is therefore decoration: it does not describe the bytes that were built. For
21 of the last 24 hours, "which commit is in production?" had no truthful
answer available, only a plausible one.

A `source: git` deployment has no such gap — Vercel fetches the commit itself,
and `gitSource.sha` is what it built.

## 5. Change made

**VERIFIED.** Exactly one setting changed, in Vercel, not in this repository:

```
PATCH https://api.vercel.com/v1/projects/prj_hxGqQ9ZQWdlLEXs5smjFQ7vrVY0w/branch
  {"branch": "main"}
→ 200, link.productionBranch: "master" → "main"
```

Confirmed by re-reading `GET /v9/projects/{id}` afterwards.

The documented `PATCH /v9/projects/{id}` endpoint rejects both
`productionBranch` and `link` as unknown properties; `/v1/projects/{id}/branch`
is the endpoint that owns this setting. Recorded here because it is not
obvious and the next person will need it.

**No application code was changed to solve this.** No new branch, no new
deployment architecture, no deploy hook, no manual upload as a permanent
mechanism.

## 6. First Git-managed production deployment

**VERIFIED.** `git push origin main` at 2026-08-12T23:48:16Z, and Vercel
produced a **production** deployment 1.1 seconds later without any further
instruction. Automatic production deployment from Git is therefore live.

| | |
|---|---|
| **Commit SHA** | `06afdab28123a0bc5d0ecb693d2826f4e77477b2` |
| **Commit** | `fix(deploy): point Vercel at the branch we actually push to` |
| **Deployment ID** | `dpl_AZdYh344snMvashHUT3ws8P4m9S8` |
| **Source** | `git` · `gitSource.type: github` · `gitSource.ref: main` |
| **Target** | `production` |
| **Build result** | **READY** — building 23:48:17Z → ready 23:49:01Z (44s) |
| **Production alias** | `athlytica-systems-engine.vercel.app` |
| Also aliased | `athlytica-systems-engine-dennis-lumumba-projects.vercel.app`, `athlytica-systems-engine-git-main-dennis-lumumba-projects.vercel.app` |
| Inspector | `https://vercel.com/dennis-lumumba-projects/athlytica-systems-engine/AZdYh344snMvashHUT3ws8P4m9S8` |

`vercel --prod` was **not** used at any point in this phase.

## 7. Production HTTP results

**VERIFIED**, `https://athlytica-systems-engine.vercel.app`, after the deploy.

| route | expected | got | meaning |
|---|---|---|---|
| `/api/v1/public/nrhl` | 200 | **200** | |
| `/api/v1/public/packages` | 200 | **200** | |
| `/register` | 200 | **200** | |
| `/api/v1/onboarding/google-forms` | **410** | **410** | retirement is live — see §8 |
| `/api/v1/biz/check-status` | 400 | **400** | fail-closed, no input |
| `/api/v1/biz/cash-watcher` | 403 | **403** | fail-closed, no authorization |
| `/api/v1/workspace/dashboard` | 401 | **401** | fail-closed, no session |
| `/api/v1/biz/mpesa-callback` | 405 | **405** | POST-only |
| `/api/v1/biz/retry-onboarding` | 405 | **405** | POST-only |
| `/api/v1/biz/stk-push` | 405 | **405** | POST-only |
| `/api/v1/workspaces/nrhl/onboard-paid-athlete` | 405 | **405** | POST-only |
| `/api/v1/leagues/nrhl/ingest` | 405 | **405** | POST-only |
| `/api/v1/onboarding/profile` | 401 | **401** | fail-closed |

Same seven probes against the proxying custom domain
`https://www.nairobihockey.com` return **200 / 200 / 200 / 410 / 400 / 403 /
401** — identical. The `vercel.json` rewrite on the NRHL site is serving the
new engine build.

No security behaviour was weakened to make a probe return 200. Every
fail-closed route still fails closed; they are recorded as passes *because*
they refuse.

## 8. Google Forms retirement verification

**VERIFIED, and this is the strongest application-level proof in the phase.**

`GET /api/v1/onboarding/google-forms`:

| build | answer |
|---|---|
| pre-`4cf7787` (route exports only `POST`) | **405** |
| post-`4cf7787` (route exports `GET`, returns `CHANNEL_RETIRED`) | **410** |

- Before this phase (production = `f7f451a`): **405** on both hosts.
- After this phase (production = `06afdab`): **410** on both hosts.

The discriminator is exact, and it is inert: `GET` carries no body, no HMAC,
and cannot create anything on either version. Nothing was POSTed to the
endpoint at any point.

**The fifth athlete-creation door is now closed in production.** Four live
creation doors remain, matching git: three payment-authorized (Big Ice
callback, retry, NRHL webhook) and one grant-gated import (`nrhl/ingest`).

## 9. Establishing that Production == the expected commit

**VERIFIED, with a stated limit.**

The evidence is two independent kinds:

1. **Deployment metadata.** `gitSource.sha` on `dpl_AZdYh344snMvashHUT3ws8P4m9S8`
   is `06afdab28123a0bc5d0ecb693d2826f4e77477b2`, and the production alias
   resolves to that deployment. For a `source: git` deployment this is
   authoritative: Vercel fetched that commit and built it. (For a `source: cli`
   deployment it would not be — see §4a.)
2. **Application behaviour.** `410` on the Google Forms route is only
   reachable from a build containing `4cf7787`, which `06afdab` contains and
   `f7f451a` does not.

**NOT VERIFIED / limitation:** the application exposes **no version or build
identifier of its own**. There is no `/api/v1/version`, nothing reads
`VERCEL_GIT_COMMIT_SHA` anywhere in the codebase (grepped — zero hits). So
production's identity is established from Vercel's metadata plus a
commit-specific behavioural probe, not from anything the running application
says about itself. That is sufficient today and it will not always be: the
behavioural probe has to be re-chosen for every deploy, and it only ever
proves that *one* commit is present, never that a *later* one is not.

**Recommendation, deliberately not implemented in this phase** (the brief
forbids it unless necessary and low-risk, and it is not necessary today): add
a `GET /api/v1/version` returning `process.env.VERCEL_GIT_COMMIT_SHA` and
`VERCEL_DEPLOYMENT_ID` only. Both are non-sensitive and already public in the
deployment metadata. It would collapse §9 to a single unauthenticated request
and make `verify:production` independent of a hand-picked canary. Raised as a
future-phase item, not done here.

## 10. Main vs Production comparison

`git diff f7f451a..14d53d0` — everything Production was missing before this
phase — touched exactly **one** application file:
`app/api/v1/onboarding/google-forms/route.ts`. The rest was docs, tests and a
deleted script.

This corrects a claim in `ATHLYTICA_PROJECT_STATE.md` (0.3I): *"The database
has M4 and the deployed application does not call it."* That was wrong. M4's
application code is `67b2cef`, which is an **ancestor of `f7f451a`**, so it
was in production the whole time.

| Change | Where | Status |
|---|---|---|
| **Google Forms retirement** (`4cf7787`, 0.3H) | app | **VERIFIED IN PRODUCTION** — 410 on both hosts |
| **M4 payment authorization boundary** — app side (`67b2cef`) | app | **VERIFIED IN PRODUCTION** — ancestor of `f7f451a` (previous prod) and of `06afdab` (current) |
| **M4** — database side (`20260812172530`) | Supabase | **VERIFIED** applied independently of any deploy; `settle_payment_transaction` is where the venture-constrained matcher lives |
| **M3 payment replay integrity** — database side (`20260812122254`) | Supabase | **VERIFIED** applied; enforcement is in the RPC, not the app |
| **M3** — app side | app | **VERIFIED IN PRODUCTION** — no app change was required by M3 beyond what shipped before `f7f451a` |
| **0.3C production revenue consumers** (`6b19bbc`) | app | **VERIFIED IN PRODUCTION** — ancestor of `f7f451a`; `tests/*revenue*` assert every reducer reads `payment_events_production` |
| **0.3D–0.3G** | docs/tests only | **VERIFIED IN MAIN ONLY** — no production surface; nothing to deploy |
| Deployment chain fix (`06afdab`, this phase) | config + docs + script | **VERIFIED IN PRODUCTION** |
| **CRM module (Phase C1)** | app + db | **VERIFIED IN MAIN ONLY — in fact not even in main.** Applied to the Supabase database, but the application code is **uncommitted and untracked** in the working tree, so no build contains it. See §12. |

**UNKNOWN:** whether the *bytes* running in production before 2026-08-12T23:48
matched `f7f451a` exactly. Every production deployment before this one was a
working-tree upload (§4a), so the pre-0.3K record cannot be reconstructed from
commit SHAs. It cannot be recovered retroactively and is now moot — from
`06afdab` forward, every production deployment is a fetched commit.

## 11. Remaining uncertainty

- **No application-level version endpoint** (§9). The chain is verifiable from
  Vercel metadata; it is not verifiable from the application alone.
- **`master` still exists** at `574e672` on the remote and is now wired to
  nothing. It is a loaded foot-gun with a new label. Deleting it is a one-line
  owner action and was not taken in this phase — it is out of scope and
  irreversible-ish enough to deserve its own decision.
- **`GOOGLE_FORMS_WEBHOOK_SECRET` is not set in Vercel at all** (all 20
  project env vars listed; it is absent). D-26c records it as deliberately
  kept because it is shared with `sync/convex`. Whatever reads it in
  production is therefore reading `undefined` and, per the fail-closed
  convention, should be answering `503 CONFIG_DEBT`. **NOT VERIFIED** — not
  probed in this phase, and not in scope. Worth one look next phase.
- **The pre-0.3K production history** is unreconstructable (§10, UNKNOWN).

## 12. Concurrent work — untouched

The CRM module (Phase C1) was in the working tree throughout this phase: 6
modified tracked files and 11 untracked paths, plus two migrations already
applied to the production database.

**Nothing of it was staged, committed, reverted, or edited.** The commit for
this phase staged exactly three paths by name — `CLAUDE.md`,
`package.json`, `scripts/verify-production.mjs`. No `git add .`, no `git add
-A`, no `git checkout .`, no `git reset --hard`.

It did not break anything: `pnpm typecheck` is clean and `pnpm test` is
**210 pass / 0 fail** with the CRM work present (178 previously + 32 from
`crm-metrics` and `crm-permissions`).

One consequence to flag: **`docs/ATHLYTICA_PROJECT_STATE.md` has uncommitted
CRM edits in it.** Its `Deployment` and `Commit` rows were corrected on disk
so the file is not lying, but the file was **not staged** — staging it would
have swept another actor's uncommitted work into this phase's commit. Whoever
commits the CRM work will carry those corrections with it.

## 13. Rollback procedure

The change is one Vercel setting and one commit. Both revert independently.

**To undo the configuration change** (restores Preview-only behaviour on
`main`; there is no reason to do this):

```bash
curl -X PATCH "https://api.vercel.com/v1/projects/prj_hxGqQ9ZQWdlLEXs5smjFQ7vrVY0w/branch?teamId=team_6YnismcC9QVrVEfiahABUnGY" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"branch":"master"}'
```

**To roll production back to a previous build** — this is the one that
matters in an incident. Promote a known-good deployment; do not re-upload:

```bash
vercel promote dpl_2CMHoLjziafAef7VUJVdgPmpxopt   # = f7f451a, the last pre-0.3K production build
```

**To roll back the code**, revert the commit and push — the chain now carries
it to production on its own:

```bash
git revert 06afdab && git push origin main && pnpm verify:production
```

**No database rollback is involved.** This phase applied no migration and
touched no schema. The M2/M3/M4 migrations are already applied and are
independent of the application deployment; do not re-run them because the
deployment changed.

## 14. Permanent deployment workflow

```
commit → push to main → Vercel Git integration → Production deployment
       → production alias → HTTP probe → known commit
```

1. Commit to **`main`**. Never `master`.
2. `git push origin main`.
3. Wait for the Vercel Git deployment (~45s build, observed).
4. `pnpm verify:production` — exits non-zero unless all of:
   - `productionBranch` is `main`,
   - a production deployment exists and is `READY`,
   - its `source` is `git` and its `gitSource.ref` is `main`,
   - its `gitSource.sha` equals local `HEAD`,
   - the production alias points at it,
   - every route probe returns its expected status.
5. Only then may the commit be described as **deployed**.

**Never `vercel --prod`** as the mechanism (§4a). It is a recovery tool for
when Git deployment is itself broken; if it is used, say so in the commit
record, because the deployment's commit metadata will be fiction.

**When a deploy does not appear:** read `productionBranch` first. The failure
mode this phase fixed was silent — builds succeeded, tests passed, the push
went through, and nothing reached production for a month.

## 15. D-28 status

**D-28 — Production deployment chain: CLOSED (2026-08-12, Phase 0.3K).**

Every link has evidence in this document:

| Link | Evidence |
|---|---|
| `main` is the production branch | §3, §5 — `productionBranch: "main"`, read back after the PATCH |
| Git-linked production deployment | §6 — `dpl_AZdYh344snMvashHUT3ws8P4m9S8`, `source: git`, `target: production` |
| at the expected commit | §6, §9 — `gitSource.sha` == `HEAD` == `06afdab` |
| production alias points at it | §6 — `athlytica-systems-engine.vercel.app` |
| HTTP verification | §7, §8 — 13 probes on the alias, 7 on the custom domain, all as expected |

The dashboard setting **was** changeable from this environment, so no owner
action is required to close it.

**Not closed by this phase, and deliberately so:** the absence of an
application-level version endpoint (§9), and the still-present `master`
branch (§11).
