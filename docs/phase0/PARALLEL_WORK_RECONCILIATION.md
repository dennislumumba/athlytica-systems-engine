# Parallel Work Reconciliation — Phase 0.1

**Status:** ANALYSIS. Nothing was modified, committed, reverted or deleted.
**Date:** 2026-08-12

Scope: uncommitted working-tree changes present when Phase 0.1 began. None of
this work is mine. All of it is preserved as found.

---

## 1. Classification summary

| File | Classification | Deploy state |
|---|---|---|
| `lib/auth/like-escape.ts` *(new)* | **SAFE — SECURITY FIX, DEPLOY URGENTLY** | uncommitted |
| `lib/auth/guardian.ts` | **SAFE — SECURITY FIX, DEPLOY URGENTLY** | uncommitted |
| `app/api/v1/biz/stk-push/route.ts` | **SAFE** — duplicate-prevention fix | uncommitted |
| `app/api/v1/biz/check-status/route.ts` | **REQUIRES_REVIEW** | uncommitted |
| `app/api/v1/public/packages/route.ts` | **SAFE** | uncommitted |
| `app/register/page.tsx` | **SAFE** | uncommitted |
| `app/register/academy/page.tsx` | **REQUIRES_REVIEW** — 704 lines changed, mostly deletions | uncommitted |
| `app/register/bigice/` *(new)* | **SAFE** — org separation, see §5 | uncommitted |
| `config/venture-links.ts` *(new)* | **SAFE** | uncommitted |
| `lib/services/bigice-pricing.ts` | **SAFE** | uncommitted |
| `supabase/migrations/20260812090000_*` | **DUPLICATE** of applied `20260811214027` | applied under another version |
| `supabase/migrations/20260812091000_*` | **DUPLICATE** of applied `20260811214054` | applied under another version |

---

## 2. `likeEscape` — a live cross-household authorization bypass

**This is the most important finding in Phase 0.1.**

`resolveGuardian()` matches the signed-in parent's email against
`bigice_athlete.guardian_email` using `.ilike()`. ILIKE makes the *matched
value a pattern*. `_` is a single-character wildcard in SQL LIKE and is legal
and common in an email local part.

Unescaped, a verified sign-in as `john_smith@gmail.com` matches every guardian
whose address has the shape `johnXsmith@gmail.com`. The new module's own
docstring records a measured result:

> the unescaped pattern returned three athletes across two unrelated families
> where the address itself named two

That is one household seeing another household's children — names, dates of
birth, disciplines, skating levels, portal state. It is precisely the failure
mode Phase 0 §19 exists to prevent, and it is an **authentication-bypass-class
defect**, not a cosmetic one.

The fix is correct: escape `\`, `%`, `_` and PostgREST's `*` by backslash-prefix,
which is Postgres LIKE's default escape character. Extracting it to its own
zero-import module so `node --test` can reach it is also right — a control that
cannot be tested is a control nobody keeps.

**Current exposure: zero.** `bigice_athlete` has 0 rows, so there are no
guardians and no children to leak. **Exposure becomes real on the first Big Ice
registration.**

**Recommendation: commit and deploy this ahead of everything else in this
document, including the RLS containment.** It is a small, self-contained,
test-covered fix to a live code path, and it costs nothing to ship. It does not
touch the athlete model, so it is not gated by any Phase 0 decision.

Note the deploy target: production deploys from `main` (per `CLAUDE.md`). An
uncommitted fix protects nobody.

---

## 3. Answers to the §B risk checklist

Assessed against every changed file and the routes they reach.

| Risk | Verdict | Evidence |
|---|---|---|
| Creates duplicate athletes | **NO — it fixes a duplication bug** | `stk-push` header documents a prior defect where a sibling's registration "overwrote athlete_name — the first registration was" lost. The fix keys open registrations by `sameAthlete(r.athlete_name, …)` so two siblings on one phone get two rows. |
| Creates organization-specific identities | **NO** | Registration writes `public.registrations` only, with `venture_context` as an attribute. No `bigice_athlete` or `nrhl_athlete` row is created on the payment path. |
| Assigns public Athlete IDs too early | **NO in the changed files** — but **YES elsewhere**, see §4 | No changed file calls an ID issuer. |
| Bypasses canonical athlete creation | **N/A** | The canonical table does not exist yet. Registration correctly stops at `registrations`. |
| Creates guardian records insecurely | **NO — it hardens them** | §2. |
| Assumes RLS is disabled | **REQUIRES_REVIEW** | All these routes use the service-role admin client, which bypasses RLS by design. They will keep working after containment. But that also means **none of them is a test of RLS**, so they give no assurance either way. |
| Stores documents publicly | **NO** | `bigice_document` stores `content_html` inline; no storage bucket, no public URL introduced. |
| Creates payments without immutable payment events | **NO** | Settlement still routes through `settle_payment_transaction`, which inserts into the append-only `payment_events` with `on conflict (mpesa_receipt_number) do nothing`. |
| Creates onboarding records before identity confirmation | **REQUIRES_REVIEW** | See §4 — the NRHL onboarding route does exactly this, though it is not a file changed by this parallel work. |
| Mixes Big Ice and NRHL registration data | **NO — it separates them** | See §5. |

---

## 4. What the parallel work did *not* touch, but which the same audit surfaced

Two live routes issue public athlete codes from the shared sequence and write
guardian PII into RLS-disabled tables. **They are pre-existing, not part of this
parallel work**, but they are the concrete path by which two Phase 0 findings
become real:

| Route | Calls | Consequence |
|---|---|---|
| `app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts:144` | `nrhl_next_athlete_code()` | Issues `ATH-00501`+ from `scalable_id_sequence` at 500 — **numerically collides with legacy `ATH-500`…`ATH-638`** |
| same, `:136` | `link_guardian()` | Writes a guardian phone number into `athlytica_core.parents` — **RLS disabled** |
| `app/api/v1/leagues/nrhl/ingest/route.ts:146` | `nrhl_next_athlete_code()` | Same collision risk on the ingest path |

So the sequence is:

```
payment settles → onboard-paid-athlete → link_guardian()  → athlytica_core.parents (world-readable)
                                       → nrhl_next_athlete_code() → colliding public ID
```

Both tables are empty today, so nothing has happened. **This is the single
route that turns two "empty table, zero blast radius" findings into live data
loss the first time an NRHL athlete pays.**

Classification: **REQUIRES_REVIEW — blocking for NRHL paid onboarding.**
Recommended containment: gate this route until D-01 (RLS) and the canonical ID
sequence are in place. Not changed here.

---

## 5. Big Ice / NRHL separation (§N)

The parallel work **improves** organization separation:

- `app/register/bigice/` is a new dedicated Big Ice funnel — own `layout.tsx`,
  own page, own shield asset.
- `config/venture-links.ts` is a new central venture-link map.
- `app/register/academy/page.tsx` shrank by ~640 net lines, consistent with
  logic moving into the dedicated funnel.
- `stk-push` sets `venture_context` per tier (`BIG_ICE` vs the code-table
  venture), so a registration is stamped with its venture at creation.

This matches §N: one athlete, separate customer-facing funnels. Nothing observed
mixes the two organizations' packages or registration identity.

`app/register/academy/page.tsx` is marked REQUIRES_REVIEW purely on change
volume — 704 lines touched is too large to certify by inspection here, and it is
a customer-facing payment funnel. It needs its own review before deploy.

---

## 6. Migration duplicates

| Local file | Applied as | Verdict |
|---|---|---|
| `20260812090000_bigice_catalog_and_sibling_registrations.sql` | `20260811214027_bigice_catalog_and_sibling_registrations` | **DUPLICATE — already applied** |
| `20260812091000_settlement_deterministic_session_match.sql` | `20260811214054_settlement_deterministic_session_match` | **DUPLICATE — already applied** |

Verified against the live database, not inferred from filenames:

```sql
select pg_get_functiondef(oid) ~* 'stk_pushed_at desc nulls last'
  from pg_proc where proname='settle_payment_transaction';
-- true
```

The live `settle_payment_transaction` **contains the deterministic tiebreak**
that the local file introduces. The migration is applied; only its recorded
version differs. See `MIGRATION_RECONCILIATION.md`.

**Do not delete these files.** They are the source of record for DDL that is
live. Deleting them would leave applied schema with no local definition.

---

## 7. Recommended disposition

| # | Action | Urgency |
|---|---|---|
| 1 | Commit + deploy `like-escape.ts` and `guardian.ts` | **immediate** — independent of every gate |
| 2 | Review `app/register/academy/page.tsx` (704 lines, payment funnel) | before next deploy |
| 3 | Review `check-status` changes | before next deploy |
| 4 | Gate `onboard-paid-athlete` until D-01 + canonical ID land | before NRHL paid onboarding |
| 5 | Resolve migration version drift | before any `supabase db push` |
| 6 | Keep all files; delete nothing | standing |

**Nothing in this document has been executed.**
