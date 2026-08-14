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

## 6. THE DECISION REQUIRED — revised

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
