# Identifier Namespace Design — D-33

**Phase:** 0.4 · **Date:** 2026-08-13
**Status:** **STOPPED AT THE DECISION BOUNDARY. Evidence contradicts Option B
as specified.** Nothing changed: no schema, no function, no sequence, no
identifier, no regex.

The brief instructed: *"If evidence contradicts Option B, stop and report rather
than forcing the decision."* It does. This document reports what it contradicts,
why, and what the evidence points to instead.

---

## 1. Complete consumer trace — VERIFIED

Every consumer of an athlete identifier in the repository and the live schema.

### Schema — the identifier is **not** text everywhere

| Column | Type | Role | Rows |
|---|---|---|---|
| `nrhl_athlete.athlete_code` | **`character(9)`** | **PRIMARY KEY** | 0 |
| `nrhl_metric.athlete_code` | **`character(9)`** | FK → above | 0 |
| `nrhl_stat_line.athlete_code` | **`character(9)`** | FK → above | 0 |
| `bigice_athlete.nrhl_athlete_code` | **`character(9)`** | FK → above | 0 |
| `athlytica_core.athletes.ath_code` | **`varchar(12)`** | trigger-written | 0 |
| `bigice_athlete.biif_code` | `text` | **PRIMARY KEY** | 0 |
| `bigice_document.biif_code`, `bigice_enrollment.biif_code` | `text` | FK → above | 0 |
| `nrhl_athlete.legacy_code`, `bigice_athlete.legacy_code` | `text`, nullable, **no unique constraint** | legacy ledger slot | 0 |

`character(9)` is exactly the width of `ATH-00505`. **The column was sized to the
current format.** `varchar(12)` likewise accommodates `ATH-00505` with room, and
nothing longer than 12.

### Code — four regexes, all requiring digits

| Location | Pattern | What it gates | Deployed? |
|---|---|---|---|
| `lib/validation/nrhl-schemas.ts:86` `athleteCodeSchema` | `/^ATH-\d{5}$/` | stat-line ingest, `update-athlete`, **and the public verify endpoint** | **YES** |
| `lib/converters/convexAdapter.ts:24` `PASSPORT_ID_PATTERN` | `/^ATH-(\d{4})-(\d{4})$/` | `/api/v1/sync/convex` | **YES** |
| `lib/converters/convexAdapter.ts:26` `LEGACY_COUNTER_PATTERN` | `/(\d{1,4})\s*$/` | rescues loose legacy shapes | **YES** |
| `lib/services/nrhl-etl.ts:179` `migrateLegacyCode` | `/^ATH-(\d{1,5})$/i` | legacy migration | tests only |
| `scripts/normalize-legacy-ids.js:39` `CANONICAL_RE` | `/^ATH-(\d{4})-(\d{4})$/` | offline normaliser (D-05: retire) | script |

### Integer assumptions — they exist, in a live integration

```ts
// lib/converters/convexAdapter.ts
export function parsePassportId(id: string): PassportIdParts | null {
  const m = PASSPORT_ID_PATTERN.exec(id);
  return m ? { year: Number(m[1]), counter: Number(m[2]) } : null;   // ← Number()
}
// :72
throw new Error(`convexAdapter: cannot serialize passport id from '${raw}' — no numeric counter present`);
```

**The Convex sync adapter requires a numeric counter and throws without one.**

### External / user-facing surfaces

| Surface | Exposure |
|---|---|
| **`GET /api/v1/public/nrhl/verify?code=ATH-00047`** | **Public, `Access-Control-Allow-Origin: *`, run from nairobihockey.com by parents and scouts.** Validates through `athleteCodeSchema`. Error copy: *"Athlete codes look like ATH-00047."* |
| `/api/v1/sync/convex` | Convex integration, via `PASSPORT_ID_PATTERN` |
| `lib/services/onboarding-delivery.ts:137-148` | Emails the athlete code to the guardian as `athleteId` |
| NRHL admin / drafting / reports / onboarding UI | String keys throughout; CSV export carries an `athlete_code` column header |

**No QR generator exists.** No URL embeds an athlete code as a path segment —
`verify` takes it as a query parameter.

## 2. Answers to the brief's questions

| # | Question | Answer |
|---|---|---|
| 1 | Every consumer traced? | Yes — §1. 14 distinct consumers. |
| 2 | Parsers/regex/FK/docs/certs/URLs/exports/search assuming `ATH-[digits]`? | **Five regexes, one PK, three FKs, one public endpoint, one live integration.** |
| 3 | Stored as text everywhere? Any numeric assumptions? | **No and yes.** `character(9)` fixed-width on the PK and 3 FKs, `varchar(12)` on core. `convexAdapter` does `Number()` on the counter and throws without one. |
| 4 | `migrateLegacyCode()` prevented from crossing namespaces? | **Not yet — it is the thing that creates the collision.** §5. |
| 5 | Do legacy identifiers remain immutable historical identifiers? | **Yes, and the schema already has the slot**: `nrhl_athlete.legacy_code` and `bigice_athlete.legacy_code`, both `text`, both nullable, **neither unique**. |
| 6 | Uniqueness — global or per venture? | **Per venture today.** `ATH-*` is NRHL's PK; `BIIF-*` is Big Ice's. Prefixes make them disjoint. **They are coupled only by sharing one `scalable_id_sequence` row** — which is the actual defect, not the formats. |
| 7 | Is the year semantic or entropy? | **Semantic** — issue year. `bigice_next_athlete_code` uses `to_char(now(),'YYYY')`; `buildPassportId` validates 1900–9999. |
| 8 | Existing identifiers altered? | **No.** |
| 9 | Sequence changed? | **No.** Still 504. |
| 10 | `account_reference` renamed? | **No**, as instructed. |

## 3. Why Option B as specified is contradicted

Option B proposed `ATH-YYYY-XXXXXX` — 15 characters, base32 entropy in the tail.

| Constraint | Option B | Verdict |
|---|---|---|
| `nrhl_athlete.athlete_code` is `character(9)` | 15 chars | ❌ does not fit — **PK type migration + 3 FK columns** |
| `athlytica_core.athletes.ath_code` is `varchar(12)` | 15 chars | ❌ does not fit |
| `athleteCodeSchema` `/^ATH-\d{5}$/` | `7K3QP9` is not `\d{5}` | ❌ **breaks the public verify endpoint** |
| `PASSPORT_ID_PATTERN` `/^ATH-(\d{4})-(\d{4})$/` | tail is not `\d{4}` | ❌ **breaks the Convex adapter** |
| `convexAdapter` `Number(counter)` | no numeric counter | ❌ throws by design |

My Phase 0.4 report claimed Option B *"costs two function edits today"*. **That
was wrong.** It costs a primary-key type migration across four columns, two
regex contract changes, a public API validation change, and a live integration
rewrite. The tables are empty so the *data* migration is free — but the
*contract* migration is not, and one of those contracts is a public endpoint
parents use to verify a child's certificate.

**Stopping here, as instructed.** The structural goal of Option B — an
identifier that no normaliser can collapse into the legacy numeric block —
remains right. The specified format is the wrong way to reach it.

## 4. What the evidence points to instead — Option B′

**`ATH-YYYY-NNNN`, with a non-sequential numeric counter.** Example:
`ATH-2026-4817`.

This is not a new invention. **It is the format the codebase already speaks**:
`PASSPORT_ID_PATTERN`, `parsePassportId`, `buildPassportId` and
`normalize-legacy-ids.js` all implement exactly this shape, and the Convex
adapter is already built around it.

### Collision proof — structural, not probabilistic

The legacy namespace is matched by `migrateLegacyCode`:

```
/^ATH-(\d{1,5})$/     matches  ATH-500, ATH-00500
                      cannot match  ATH-2026-4817
```

The regex is anchored (`^…$`) and permits **no second hyphen**. `ATH-2026-4817`
contains one. **No input in the legacy namespace can be normalised into the new
namespace, and no new identifier can be parsed as a legacy one.** The
namespaces are disjoint by grammar, not by range arithmetic — which is what
Option B was for.

Conversely `PASSPORT_ID_PATTERN` (`\d{4}-\d{4}`) cannot match `ATH-00500`.
The separation holds in both directions.

### Non-sequential without abandoning numbers

Draw the 4-digit counter **at random from the unused space for that year**,
with a `UNIQUE` constraint and retry-on-conflict:

- Not sequential → `ATH-2026-0003` never means "third registrant". The ordering
  leak that `ATHLETE_ID_SPEC.md` warns about is closed for *new* issuance, not
  only for the migration backfill.
- Still numeric → `convexAdapter` works unchanged.
- Collision is a `23505` and a retry, never a corruption.

### Capacity and year rollover — stated, not hand-waved

- **10,000 identifiers per year.** At current volume (0 athletes created in
  production, ever; 3 open registrations) this is decades of headroom.
- Random draw against a `UNIQUE` index degrades as the year fills: expected
  retries stay under 1 up to ~1,000 issued per year, and become impractical
  above ~5,000. **If a single year ever approaches 5,000 athletes, widen to 5
  digits — a new year is a new namespace, so the change is forward-only and
  affects no existing identifier.**
- **Year rollover risk: none for uniqueness** — the year is part of the key, so
  `ATH-2026-4817` and `ATH-2027-4817` are different identifiers.
- **One real rollover hazard:** an identifier issued at 23:59:59 on 31 December
  carries the old year while the athlete's first session is in the new one. The
  year is *issue* year, not season year, and must be documented as such —
  otherwise someone will later infer cohort from it and be wrong for everyone
  issued in the last hours of December.

### Cost

| Change | Scope |
|---|---|
| `athlete_code` `character(9)` → `varchar(16)`, + 3 FK columns | 4 columns, **all tables empty** — instant |
| `ath_code` `varchar(12)` → `varchar(16)` | 1 column, empty |
| `athleteCodeSchema` → accept `ATH-\d{4}-\d{4}` | 1 regex; **also updates the public verify error copy** |
| New issuer function, per-venture, random counter + retry | 2 functions |
| `migrateLegacyCode` → write to `legacy_code`, never to `athlete_code` | §5 |
| Retire `scalable_id_sequence` and the 3 legacy issuers | revoke, do not drop |
| `convexAdapter` | **no change** |
| Big Ice `BIIF-YYYY-NNNN` | already this shape — only the counter source changes |

### Backward compatibility

- **Legacy identifiers are never re-issued and never mutated.** They live in
  `legacy_code`, which already exists on both venture tables. A `UNIQUE` index
  should be added there — it currently has none, so the ledger has no
  discipline.
- The public verify endpoint keeps working for both shapes if
  `athleteCodeSchema` accepts `ATH-\d{5}` **or** `ATH-\d{4}-\d{4}`. Old
  certificates (none issued — `nrhl_athlete` is empty) would still verify.
- **Identifiers are never reused.** Not on delete, not on merge, not on
  rollback. A burned identifier stays burned; the 4 already burned stay burned.

## 5. `migrateLegacyCode()` — the containment

**Current behaviour is the defect.** It takes `ATH-500` and returns `ATH-00500`,
which is inside the issuer's output space. Under any option, this function must
stop producing values in the *issuing* namespace.

Required change, whichever option is chosen:

```ts
/**
 * Legacy codes are historical claims, not identifiers. This normalises the
 * SHAPE for the legacy ledger; it must never produce a value that the issuer
 * could also produce. Writes to legacy_code, never to athlete_code.
 */
export function normaliseLegacyClaim(legacy: string): string | null {
  const m = /^ATH-(\d{1,5})$/i.exec(legacy.trim());
  return m ? `LEG-${m[1]!.padStart(5, "0")}` : null;   // LEG-, not ATH-
}
```

Prefixing the legacy ledger `LEG-` makes the disjointness total and visible: no
regex anywhere matches both, and a human reading a row can tell a historical
claim from a live identifier. **This is the single highest-value line in the
whole R4 problem** and it is independent of which issuing format is chosen.

## 6. THE DECISION REQUIRED — revised *(SUPERSEDED — see §7–§16)*

> ⚠ The recommendation in this section (B′ on the venture code) was made
> before establishing that **two independent identifier planes exist**. §7
> corrects it. B′ is right for the *passport* plane and wrong for the
> *venture* plane, and R4 is a venture-plane problem. **Option C in §15 is the
> recommendation.**

> **Option B as written is not viable. Choose:**
>
> - **B′ — `ATH-YYYY-NNNN`, non-sequential counter *(recommended)*.** Uses the
>   format the codebase already parses; keeps Convex working; disjoint from
>   legacy by grammar; needs 5 column widenings on empty tables and one regex
>   widening on a public endpoint.
> - **A — continue the sequence from 639.** Cheapest; still bets on 638 being
>   the true maximum, which D-04 has not confirmed; leaves a numeric identifier
>   a future normaliser can collapse.
> - **C — six-digit padded `ATH-NNNNNN`.** Fits nothing better than B′ (10 chars
>   still exceeds `character(9)`), still sequential, still requires fixing
>   `migrateLegacyCode`.
> - **Revisit B with a shorter format** — e.g. `ATH-YY-XXXX` (11 chars). Fits
>   `varchar(12)`, but still breaks `PASSPORT_ID_PATTERN` and `Number(counter)`.
>
> **Independent of the above, and recommended regardless: adopt §5.** Repoint
> `migrateLegacyCode` at a `LEG-` ledger namespace. It removes the collision
> mechanism without choosing an issuing format.

**Nothing is applied. The sequence is 504. No identifier exists.**

---

# PART II — Rigorous design analysis (2026-08-15)

**The premise of Part I was incomplete.** It treated "the athlete identifier"
as one thing. It is two. They live in different columns with different types
and different consumers, and **R4 concerns only one of them.**

## 7. The two identifier planes — VERIFIED

| | **Passport plane** | **Venture plane (NRHL)** | **Venture plane (Big Ice)** |
|---|---|---|---|
| Column | `public.athlete.passport_id` | `nrhl_athlete.athlete_code` | `bigice_athlete.biif_code` |
| Type | **`text`** | **`character(9)`** | `text` |
| Constraint | **UNIQUE** (two indexes — §16) | **PRIMARY KEY** | **PRIMARY KEY** |
| Format | `ATH-YYYY-NNNN` (13) | `ATH-NNNNN` (9) | `BIIF-YYYY-NNNN` (14) |
| Validated by | `PASSPORT_ID_PATTERN` | `athleteCodeSchema` `/^ATH-\d{5}$/` | — |
| Consumed by | `convexAdapter`, `normalize-legacy-ids.js` | **public verify endpoint**, NRHL UI, ingest | Big Ice docs / enrolments |
| Rows issued | **0** | **0** | **0** |
| Fed by `scalable_id_sequence`? | **No** | **Yes** | **Yes** |

**VERIFIED:** `convexAdapter` reads `row.passport_id` and `row.athlete_id` only
(lines 170, 187, 226–232, 248–254). It never touches
`nrhl_athlete.athlete_code`. The planes are independent.

**R4 is a venture-plane problem.** The sequence at 504 feeds
`nrhl_next_athlete_code()` → `ATH-NNNNN` → `character(9)`, and
`migrateLegacyCode()` pads legacy codes into that same 5-digit space. The
passport plane is not involved: `passport_id` is `text`, `UNIQUE`, never issued.

**Consequence for B′:** `ATH-YYYY-NNNN` is the *passport* format. Putting it in
the venture column is what forces the `character(9)` migration. On its own
plane it needs no schema change at all.

## 8. Exact format and storage fit

| Candidate | Length | `character(9)` ×4 | `varchar(12)` | `text` |
|---|---|---|---|---|
| `ATH-00505` (current venture) | 9 | ✅ | ✅ | ✅ |
| **`ATH-10000` (Option C)** | **9** | **✅** | **✅** | **✅** |
| `ATH-2026-4817` (B′) | 13 | ❌ | ❌ | ✅ |
| `ATH-2026-7K3QP9` (B) | 15 | ❌ | ❌ | ✅ |

The four `character(9)` columns: `nrhl_athlete.athlete_code` (PK),
`nrhl_metric.athlete_code`, `nrhl_stat_line.athlete_code`,
`bigice_athlete.nrhl_athlete_code`. The `varchar(12)`:
`athlytica_core.athletes.ath_code`.

**Requirement 9 (FORMAT PRESERVATION) disqualifies B′ on the venture plane.**
It cannot fit without altering a PRIMARY KEY type and three referencing
columns. The brief: *"If B′ cannot fit all existing columns without changing
schema, STOP."* It cannot. **Stopping on B′.**

## 9. Option C — the format that fits every existing contract

**Keep `ATH-NNNNN`. Change only which numbers are issued.**

```
Legacy reserve   ATH-00001 … ATH-09999     10,000 values, never issued by the system
Issuance band    ATH-10000 … ATH-99999     90,000 values, drawn at random
```

Verified in-database: `ATH-10000` is 9 characters, matches `^ATH-\d{5}$`, and
`'ATH-00638' < 'ATH-10000'` orders correctly as text.

- **Zero schema change** — fits `character(9)`, `varchar(12)`, `text`.
- **Zero regex change** — `athleteCodeSchema` accepts it unchanged.
- **Zero endpoint change** — the public verify contract and its error copy
  (*"Athlete codes look like ATH-00047"*) stay literally true.
- **Zero integration change** — `convexAdapter` is on the other plane.
- **Non-sequential**, so no ordering leak.

## 10. Collision model — arithmetic, not adjectives

Randomness is **not** collision-proof. The band holds **90,000** values. With
`n` issued, a fresh uniform draw collides with probability `n/90000`; expected
redraws per issuance are `n / (90000 − n)`:

| Issued `n` | P(collision per draw) | Expected redraws |
|---|---|---|
| 100 | 0.11% | 0.001 |
| 1,000 | 1.1% | 0.011 |
| 5,000 | 5.6% | 0.059 |
| 10,000 | 11.1% | 0.125 |
| 30,000 | 33.3% | 0.50 |
| 45,000 | 50% | 1.0 |
| 80,000 | 88.9% | 8.0 |

**Practical ceiling ≈ 30,000 athletes.** **Hard ceiling 90,000** — and it is
real, because `character(9)` and `/^ATH-\d{5}$/` leave no room for a sixth
digit. Current NRHL athlete count: **0**. Legacy corpus: **209 codes**.

First collision is expected near `sqrt(π/2 × 90000)` ≈ **376 issued**. That is
fine — a collision is a retry, not a failure. The operationally meaningful
number is the redraw column, not the first-collision point.

## 11. Database guarantee — the constraint is the authority

`nrhl_athlete.athlete_code` is already the **PRIMARY KEY**. That does not move.

> **The random draw only picks a probably-free value. The PRIMARY KEY is what
> makes it unique.** Where the two disagree, the constraint wins and the
> transaction fails. No code path may catch `23505` and proceed without a fresh
> identifier.

```
draw candidate → INSERT → 23505 → redraw → INSERT → …
  bounded at 5 attempts → RAISE. Never fall back to a sequence.
```

Five consecutive failures have probability `(n/90000)^5` — 1 in 243 at
n = 30,000; 1 in 6×10⁹ at n = 1,000. Exhausting the loop means the band is
saturating: a capacity alarm, and it should be loud.

## 12. Concurrency — no global lock

Two simultaneous issuances draw independently, both INSERT, at most one wins
per value, the loser sees `23505` and redraws. **Nothing serialises.**

This **obsoletes M1's central trade-off**. `M1_DESIGN.md` §3 records that
wrapping mint-and-insert in one transaction holds a row lock on
`scalable_id_sequence` id=1 for the whole insert, serialising creation across
both ventures. Option C removes the shared row, so there is nothing to lock.

| | Sequence (current) | Option C |
|---|---|---|
| Shared mutable row | `scalable_id_sequence` id=1 | **none** |
| Lock held during insert | yes | **no** |
| Cross-venture serialisation | yes | **no** |
| Identifier burned on failure | **yes (R15)** | **no** |

The last row matters most: **Option C makes R15 structurally impossible.**
There is no counter to advance, so a failed create leaves no trace.

## 13. Retries — the five cases

| Case | Behaviour under Option C |
|---|---|
| **Candidate collides** | `23505`, redraw, bounded at 5. Nothing consumed. |
| **Athlete insert fails** (FK, check, unique `display_name`) | Transaction rolls back. **No identifier consumed** — no counter exists. Contrast R15, where the code was already burned. |
| **Transaction rolls back** | Same. Nothing consumed. |
| **Request retried** | ⚠ **A retry draws a NEW identifier and would create a SECOND athlete.** Option C does not fix this and must not be claimed to. |
| **Client times out after successful commit** | Same exposure: the athlete exists, the caller does not know, a retry mints another. |

**The last two are the real risk, and they are not identifier problems.** The
Big Ice path already guards them with a household matcher (`match.verdict ===
"MATCH"` reuses `biifCode` instead of minting) plus a unique index on the
athlete name. **M1 must make that guard explicit and mandatory: resolve by
business key first, mint only on a proven miss, inside one transaction.** That
belongs to M1, gated on D-35, and is recorded here so it survives D-33 closing.

## 14. Legacy separation — proof

Legacy occupies `1 … 638` (corpus maximum 638, 209 codes). `migrateLegacyCode()`
pads to five digits, so every output for a legacy value `v` is
`ATH-` + `lpad(v,5,'0')`. For any `v < 10000` that is strictly below
`ATH-10000` in both numeric and lexicographic order (verified in-database).

> **Option C is disjoint from legacy for any legacy value below 10,000.**
> The corpus maximum is 638 — a **15× margin**. Option A's safety depends on
> 638 being *exactly* right. Option C's depends only on legacy never having
> exceeded 9,999 records.

**This holds without changing `migrateLegacyCode()` at all.** Option C is safe
against the *current, unmodified* normaliser — a strictly stronger property
than B′, which required the normaliser to be fixed first.

The `LEG-` change (§17) is still worth doing — it makes the separation visible
to a human reading a row rather than merely true — but under Option C it is
hygiene, not a dependency.

## 15. Decision matrix

| | **A** continue sequence | **B′** `ATH-YYYY-NNNN` | **C** `ATH-NNNNN` banded | **D** defer |
|---|---|---|---|---|
| Fits `character(9)` ×4 | ✅ | ❌ **13 > 9** | ✅ | n/a |
| Fits `varchar(12)` | ✅ | ❌ | ✅ | n/a |
| `athleteCodeSchema` | ✅ unchanged | ❌ regex change | ✅ **unchanged** | ✅ |
| Public verify endpoint | ✅ unchanged | ❌ contract + copy | ✅ **unchanged** | ✅ |
| Convex `parsePassportId` | ✅ other plane | ✅ other plane | ✅ other plane | ✅ |
| Collision risk | ⚠ depends on 638 exact | 10,000/yr | ⚠ **90,000 ceiling, quantified** | n/a |
| Concurrency | ❌ global row lock | ✅ no lock | ✅ **no lock** | n/a |
| Burns IDs on failure (R15) | ❌ yes | ✅ no | ✅ **structurally impossible** | ✅ |
| Ordering leak | ❌ sequential | ✅ random | ✅ **random** | ✅ |
| Legacy separation | ⚠ margin = 1 | ✅ grammar | ✅ **range, 15× margin** | ✅ |
| Needs `migrateLegacyCode` fixed to be safe | ⚠ yes | ⚠ yes | ✅ **no** | ✅ |
| Schema migration | none | **PK type + 4 cols** | **none** | none |
| Implementation | 1 UPDATE | 2 fns + 5 cols + 2 regexes + endpoint | **2 fns** | 0 |
| Unblocks M1 | partially | yes | ✅ **yes, and removes M1's lock** | ❌ |

### Recommendation: **Option C**

Superior to B′ on every axis where they differ; superior to A on collision
margin, concurrency, ID burning and ordering leak, at identical migration cost.
It is the only candidate that fits every existing column with **no schema
change**, breaks **no** regex/endpoint/integration, is safe against the
**unmodified** normaliser, makes **R15 structurally impossible**, and removes
M1's cross-venture serialisation.

Its one real cost is a **90,000 hard ceiling** on NRHL athlete codes, forever,
imposed by `character(9)` and the public verify grammar.

**B′ remains correct for the passport plane** (`passport_id`, `text`, `UNIQUE`,
0 issued) if passport identifiers are ever issued — it is the format
`convexAdapter` already parses. **That is a separate decision from R4** and is
not made here.

**Conclusively superior on the engineering evidence — but the 90,000 ceiling is
a business judgement, so this STOPS for owner sign-off.**

## 16. Year semantics — Option C has none, deliberately

**Option C contains no year, and should not.** Uniqueness comes from the PK;
legacy separation comes from the band. A year would embed *when this was
issued* into an identifier printed on certificates and typed into a public
verification form — exactly the future migration problem the brief warns
against. **Answer: no year, no business meaning, none needed.**

Where a year does appear today it is **issuance year**, not season or cohort:
`bigice_next_athlete_code()` uses `to_char(now(),'YYYY')`; `buildPassportId`
validates 1900–9999. Anyone inferring a cohort from it is wrong for every
athlete registered in late December. If the passport plane is ever activated,
that is a liability of `ATH-YYYY-NNNN` worth pricing then.

### Incidental finding — duplicate index

`public.athlete.passport_id` carries **two** unique indexes:
`athlete_passport_id_key` (plain) and `uq_athlete_passport_id`
(`WHERE passport_id IS NOT NULL`). The partial one is redundant — a plain
UNIQUE already permits multiple NULLs — so every row pays for an extra index
write. Cosmetic. Recorded, not fixed, not in scope.

## 17. `migrateLegacyCode` → `LEG-` — smallest safe design, NOT APPLIED

**Independently safe, and it alters no historical identifier.**

```ts
// lib/services/nrhl-etl.ts — replaces migrateLegacyCode
/**
 * A legacy code is a historical CLAIM, not an identifier. This normalises its
 * shape for the legacy ledger and must never produce a value the issuer could
 * also produce. Writes to legacy_code, never to athlete_code.
 */
export function normaliseLegacyClaim(legacy: string): string | null {
  const m = /^ATH-(\d{1,5})$/i.exec(legacy.trim());
  return m ? `LEG-${m[1]!.padStart(5, "0")}` : null;
}
```

**Why it is safe to apply independently of D-33:**

| Check | Evidence |
|---|---|
| Alters no stored identifier | `migrateLegacyCode` has **no production caller** — tests only. `nrhl_athlete` and `bigice_athlete` are empty. |
| Writes nowhere | It is a pure string function. |
| Breaks no contract | `LEG-` values go to `legacy_code` (`text`, nullable, no unique constraint on `nrhl_athlete`), never to a PK. |
| Reversible | Rename the function back; no data to undo. |
| Makes any option safer | Under A it removes the collision mechanism outright; under C it turns a numeric-range guarantee into a grammatical one as well. |

**Deliberately not applied in this phase.** It is a source change to a function
whose name and call sites the legacy-migration work (Phase 0.5) will touch, and
`tests/nrhl-etl.test.mts:137-139` asserts the old behaviour. Applying it means
editing those assertions, which is Phase 0.5's job. **Recommended as the first
commit of whichever option wins**, and it should carry a `UNIQUE` index on
`nrhl_athlete.legacy_code` with it — that column currently has none, so the
ledger has no discipline (`bigice_athlete` has `idx_bigice_athlete_legacy`,
non-unique).

## 17a. Big Ice transitions with NRHL — both issuers or neither

**Owner constraint, 2026-08-15: the system must not be left in a mixed
allocator state.** An earlier draft of M6 converted `nrhl_next_athlete_code()`
only, leaving `bigice_next_athlete_code()` on `scalable_id_sequence`. That is
now corrected — M6 converts both.

It is also the worse half to have left behind: **the four identifiers R15
burned (500 → 504) were BIIF codes**, so Big Ice is the path that has actually
demonstrated the failure.

| | NRHL | Big Ice |
|---|---|---|
| Format | `ATH-NNNNN` (unchanged) | `BIIF-YYYY-NNNN` (unchanged) |
| Storage | `character(9)`, PK | `text`, PK |
| Issuance band | `10000 … 99999` | `1000 … 9999`, per year |
| Reserve | `00001 … 09999` — legacy block | `0001 … 0999` — covers the four burned `BIIF-2026-0501..0504` |
| Capacity | **90,000 total** | **9,000 per year** |
| Authority | `nrhl_athlete_pkey` | `bigice_athlete_pkey` |

Big Ice keeps its year because every code the format has ever produced carries
one, and `biif_code` is `text`, so nothing constrains the width. Reserving
`0001..0999` means the four burned codes can never be re-issued to a different
child.

**Verified in a rolled-back transaction, 500 draws:** all match
`^BIIF-YYYY-\d{4}$`, all within band, **none in the reserved range**, **none
colliding with the burned 0501–0504**, no shared prefix with `ATH-`, sequence
still 504, and the PK rejected a duplicate with `23505`.

**One number worth carrying forward: 490 distinct in 500 draws**, versus 499
for NRHL. Ten collisions instead of one, because the band is ten times smaller
— predicted ≈13.9, observed 10. The model holds at both scales, and it means
**retry-on-23505 is roughly ten times more load-bearing on the Big Ice path
than on the NRHL one.** It is not optional there.

**Remaining consumer of `scalable_id_sequence` after M6:**
`athlytica_core.generate_scalable_athlete_code()`, which mints `ATH-NNNNN`
**into the legacy reserve** on `athlytica_core.athletes`. Deliberately not
converted: that table is the canonical identity target whose design is still
open, and choosing its issuer now would decide that design by implication. It
is empty, and no client role holds `USAGE` on the schema, so it is a **dormant**
mixed path rather than a live one — but it must be resolved (converted, or the
trigger dropped) **before anything writes that table**.

## 18. What is NOT applied

The sequence is **504**. No identifier exists. No schema changed. No regex
changed. `migrateLegacyCode` is untouched. `nrhl_athlete`, `bigice_athlete`,
`athlytica_core.athletes` remain empty. **D-33 stops here for owner sign-off.**
