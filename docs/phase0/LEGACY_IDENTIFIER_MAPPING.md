# Legacy Identifier Mapping — Phase 0

**Status:** DESIGN + evidence. **No athlete merged, split or renumbered.**
**Date:** 2026-08-12

---

## 1. The ledger

```sql
create table athlytica_core.athlete_identifier (
  identifier_id   uuid primary key default gen_random_uuid(),
  athlete_uid     uuid not null references athlytica_core.athlete(athlete_uid),
  scheme          text not null check (scheme in
                    ('legacy_ath','legacy_atl','legacy_biif','legacy_nrhl',
                     'passport_uuid','claim_token','external')),
  value           text not null,
  is_contested    boolean not null default false,
  source          text not null,            -- file or system the value came from
  source_row      integer,
  confidence      text not null default 'UNKNOWN'
                  check (confidence in ('VERIFIED','INFERRED','UNKNOWN')),
  verified_at     timestamptz,
  verified_by     text,
  valid_from      date,
  valid_to        date,
  notes           text,
  created_at      timestamptz not null default now(),

  unique (scheme, value, athlete_uid)
);

create index on athlytica_core.athlete_identifier (scheme, value);
create index on athlytica_core.athlete_identifier (athlete_uid);
```

### The key design decision

The unique constraint is **`(scheme, value, athlete_uid)`** — deliberately
**not** `(scheme, value)`.

A `(scheme, value)` unique constraint would make it *impossible to record the
truth*, because the truth is that `ATH-047` legitimately refers to two
different children in the source data. The ledger must be able to say so:

```
scheme = legacy_ath   value = ATH-047   athlete_uid = <Sam Inoue>       is_contested = true
scheme = legacy_ath   value = ATH-047   athlete_uid = <Shirley Makena>  is_contested = true
```

A lookup of `ATH-047` returns **two rows and an unresolved flag**. It does not
silently pick one.

The same applies across schemes — a `legacy_biif` `ATH-500` and a `legacy_nrhl`
`ATH-500` may be different people, and the scheme column carries that
distinction without either row being wrong.

**Rule: identifier collision is never, by itself, grounds for a merge.**

---

## 2. Collision resolution states

| State | Meaning | Auto-applicable |
|---|---|---|
| `CONFIRMED_SAME` | Same human, verified by a named reviewer | yes, after review |
| `PROBABLE_SAME` | Strong evidence, not confirmed | **no** |
| `POSSIBLE_SAME` | Weak evidence | **no** |
| `CONFIRMED_DIFFERENT` | Different humans sharing a code | yes, as a split |
| `UNRESOLVED` | Insufficient evidence | **no** — default |

Nothing but `CONFIRMED_SAME` and `CONFIRMED_DIFFERENT` may be automated, and
both require a dated reviewer entry.

---

## 3. Class 1 — one ID, two humans (CONTESTED)

All eight are recorded as **two ledger rows with `is_contested = true`.**
No merge, no split, no winner chosen in Phase 0.

| Legacy ID | Name A | Name B | Assessment | Evidence |
|---|---|---|---|---|
| `ATH-047` | Sam Inoue | Shirley Makena | `CONFIRMED_DIFFERENT` | 2025 tab: Shirley Makena (Figure Skating). 2026 tab: Sam Inoue (1 session). Sam's own ID is `ATH-041` (10 sessions); Shirley also holds `ATH-598`. |
| `ATH-546` | Jasmine Kariuki | Liam Pashani | `CONFIRMED_DIFFERENT` | Unrelated names; Jasmine also holds `ATH-048`. |
| `ATH-013` | Nathan Mulani | Scooter Araka | `CONFIRMED_DIFFERENT` | Unrelated names, different families. |
| `ATH-540` | Jabir | Mugeshi Mwangi | `PROBABLE_DIFFERENT` | One-word vs full name; no overlap. |
| `ATH-541` | Amina | Zuri | `PROBABLE_DIFFERENT` | Two one-word names. |
| `ATH-542` | Iman | Shannon | `PROBABLE_DIFFERENT` | Two one-word names. |
| `ATH-620` | Johari Keige | Tyler | `UNRESOLVED` | Johari also holds `ATH-597`. |
| `ATH-014` | Sofia Araka | Sofia Mulani | `UNRESOLVED` | **Hardest case.** Same given name, different surname. `ATH-013` also pairs a *Mulani* with an *Araka*, suggesting a systematic Mulani↔Araka confusion in one intake batch — so this may be one girl with a corrected surname, or two cousins. |

**`ATH-047` is the worst knot:** one code, two people, and each of them also
holds a second code.

```
Sam Inoue        → ATH-041, ATH-047
Shirley Makena   → ATH-047, ATH-598
```

Decision **D-02** resolves it. `lib/services/nrhl-etl.ts` currently encodes one
answer (`keepCode: "ATH-00047"` → Shirley, reissue Sam) while its own comment
records the dossier's counter-proposal (refile Sam under `ATH-041`). **That code
is not executed in Phase 0** and the decision is not treated as made.

---

## 4. Class 2 — one ID, spelling variants of one human

`PROBABLE_SAME`. Recorded, **not merged**.

| Legacy ID | Variants | Basis |
|---|---|---|
| `ATH-053` | Jaydan Morara / Jayden Morara | one-character difference |
| `ATH-500` | Jason Jabali / Jayson Jabali | dossier records this merge as already applied in its own extraction |
| `ATH-513` | Ethan Gichohi / Ethan Gichohu | terminal vowel |
| `ATH-554` | Ethan Verspech / Ethan Verspecht | terminal consonant |
| `ATH-556` | Lisa Verspech / Lisa Verspecht | same, sibling of `ATH-554` |

Because these share an ID *and* a near-identical name, the merge is low-risk —
but it is still a merge and still requires sign-off.

---

## 5. Class 3 — one human, two IDs (duplicate athlete records)

`PROBABLE_SAME`. Recorded as two ledger rows against **separate provisional
athletes** until adjudicated. Merging is Phase 5, not Phase 0.

| Name | IDs | Note |
|---|---|---|
| Shaya Das | `ATH-006`, `ATH-566` | |
| Eli Das | `ATH-009`, `ATH-567` | |
| Keila Naitore | `ATH-025`, `ATH-568` | |
| Lavrin Dickens | `ATH-064`, `ATH-569` | |
| Ruby Atsango | `ATH-029`, `ATH-544` | |
| Jasmine Kariuki | `ATH-048`, `ATH-546` | also Class 1 |
| Maya Aridi | `ATH-049`, `ATH-557` | |
| Sam Inoue | `ATH-041`, `ATH-047` | also Class 1 |
| Shirley Makena | `ATH-047`, `ATH-598` | also Class 1 |
| Johari Keige | `ATH-597`, `ATH-620` | also Class 1 |
| Fiona | `ATH-019`, `ATH-622` | one-word name |
| Tum Tum | `ATH-036`, `ATH-623` | |
| Leon Sila | `ATH-020`, `ATL-020` | prefix typo — see §6 |
| Moyo | `ATH-509`, `ATL-509` | prefix typo — see §6 |
| ` Kids Group` | `ATH-030`, `ATH-055` | **not a person** — see §7 |

### The re-registration signature

`ATH-566`, `ATH-567`, `ATH-568`, `ATH-569` are **consecutive** and map to
`ATH-006`, `ATH-009`, `ATH-025`, `ATH-064`.

That is not coincidence. It is the fingerprint of a **bulk re-registration
event** in which an existing cohort was issued new IDs without the old ones
being retired. `INFERENCE`, strongly evidenced by the consecutive run.

**Consequence for migration:** these pairs should be adjudicated as a *batch
with a shared rationale*, not one at a time — and if the batch hypothesis is
confirmed, the re-registration date becomes the `valid_from` / `valid_to`
boundary on the ledger rows, which is better provenance than a bare merge.

---

## 6. `ATL-` prefix typo

Two of 209 IDs use `ATL-` instead of `ATH-`:

| Typo | Canonical | Name | Assessment |
|---|---|---|---|
| `ATL-020` | `ATH-020` | Leon Sila | `PROBABLE_SAME` |
| `ATL-509` | `ATH-509` | Moyo | `PROBABLE_SAME` |

Same numeric part **and** same name in both cases. This is the safest merge in
the corpus.

**It is still not applied in Phase 0.** The typo value is preserved under
`scheme = 'legacy_atl'` so the ledger records that the source really did say
`ATL-020`. Rewriting it to `ATH-020` would destroy the evidence that the typo
existed — which is exactly what §3 of the directive forbids.

---

## 7. Entity-type violation

`" Kids Group"` — note the **leading space** — is registered as an *athlete*
under two IDs (`ATH-030`, `ATH-055`) and has sessions attributed to it.

A group is not a person. It must not receive an `athlytica_id`.

**Handling:** `athlete.record_class = 'LEGACY'`,
`identity_status = 'CONTESTED'`, flagged `NOT_A_PERSON` in notes; its sessions
load as group sessions with **unattributed participation**. Decision **D-08**.

---

## 8. First-name ambiguity — the live defect

`lib/services/nrhl-etl.ts` `NAME_ALIASES` maps bare first names to full names:

```ts
eli: "Eli Das",  sam: "Sam Inoue",  sky: "Skylar Weening",
mbatia: "Benson Mbatia", shaya: "Shaya Das", raimi: "Raimi Skudi",
asher: "Asher Weening", dakota: "Dakota Weening", kyler: "Kyler Okeyo",
leon: "Leon Sila", noel: "Noel Inoue",
```

Verified against the corpus:

| Alias | Maps to | Competing athlete in the same roster | Safe? |
|---|---|---|---|
| `eli` | Eli Das `ATH-009` | **Eli Araka `ATH-016`** | **NO** |
| `leon` | Leon Sila `ATH-020` | **Leroy Sila `ATH-051`** (sibling) | **NO** — `Leon`/`Leroy` are distinct, but the surname token `Sila` is shared |
| `sam` | Sam Inoue `ATH-041` | none | probable |
| `mbatia` | Benson Mbatia `ATH-043` | none | probable |
| `noel` | Noel Inoue `ATH-042` | none | probable |
| others | — | none found | probable |

`Scrimmage Tracker.csv` degrades to bare first names from roughly row 30 onward
(`Sam`, `Mbatia`, `Noel`, `Shaya`, `Kyler`, `Raimi`, `Asher`, `Eli`), so this is
a real attribution path, not a theoretical one.

**The dossier contradicts itself here** and that is worth recording: its
canonicalisation table lists `Eli` under *"unique first-name match"*, while its
own defect table two sections later states `Eli Das` vs `Eli Araka` are
*"distinct IDs, both active… ambiguous… resolved to Eli Das by co-occurrence,
but this is fragile."* Both cannot be true. The defect table is correct.

### Required handling (§13)

```
matching_status = 'AMBIGUOUS'
athlete_uid     = NULL
resolution_note = 'bare first name "Eli"; candidates ATH-009 (Eli Das), ATH-016 (Eli Araka)'
```

A performance observation with an ambiguous subject is loaded **unattributed**,
not attributed to the more likely candidate. Co-occurrence evidence may later
promote it to `CONFIRMED_SAME` — with a reviewer and a date.

**No edit is made to `NAME_ALIASES` in Phase 0.** The file is untouched; the
defect is registered (DQ-002) and the correction is scheduled for Phase 5.

---

## 9. Non-athlete participants

Correctly excluded by the existing `NON_ATHLETES` set and confirmed against the
source:

| Token | Who | Evidence |
|---|---|---|
| `Dennis`, `Dennis(Me)`, `Dennis (Me)` | the coach / League Director | appears as a team member in the 10/01 scrimmage |
| `Tobu (Parent)`, `Tobu` | a parent substitute | 17/01 notes: *"Shaya/Malakai left early, Tobu (parent) stepped in"* |

These must never receive an `athlytica_id`. They are `fixture_participation`
rows with a non-athlete participant type, or excluded entirely.

---

## 10. Cross-validation against a shipped artifact

`Benson_Mbatia_Performance_ID_FINAL.pdf` prints **`Athlytica ID: ATH-043`**.
The CSV corpus independently yields `benson mbatia → ATH-043`.

**They agree.** This is the only end-to-end confirmation in the corpus that a
legacy ID as printed on a parent-facing document matches the ledger, and it
raises confidence that the `ATH-NNN` scheme was applied consistently for the
2026 hockey cohort.

The same PDF is also internally contradictory on conference (see §11), so it is
`VERIFIED` for identity and `CONFLICTED` for placement.

---

## 11. Identifiers that are not athlete identifiers

Recorded here so they are not mistaken for identity:

| Value | What it actually is |
|---|---|
| `ATHL-1482` | **Session** ID. Not unique per row — a group session correctly produces one row per athlete. |
| `NRHL-SCR-2026-001` | **Fixture** ID. Clean and generated. |
| `PLAY-BRIAN-8E61` | Claim token. A credential-adjacent value, not an identifier. Embeds the athlete's first name (DQ-046). |
| `BIIF-2026-0001` | Big Ice code format from `bigice_next_athlete_code()`. **Never issued** — the table is empty. |
| `77000005-…` UUIDs | TTA demo seed athletes in `public.athlete`. |
| `THE RIDGE — VANGUARD` / `THE SUMMIT CONFERENCE` | Placement, not identity — and **mutually contradictory within one shipped PDF**: `Vanguard` belongs to Rosslyn in The Summit per the league team list, while the same page assigns Benson to The Ridge and the header says The Summit. Recorded as a conflict; not resolved here. |

---

## 12. What Phase 0 produces

A **populated ledger design and a fully-evidenced candidate list** — not a
single applied change.

| Produced | Count |
|---|---|
| Legacy IDs catalogued | 209 |
| Contested IDs (one ID, two humans) | 8 |
| Spelling-variant IDs | 5 |
| Duplicate-athlete name pairs | 15 |
| Prefix typos | 2 |
| Non-person entities | 1 |
| Non-athlete participants | 2 |
| Ambiguous first-name aliases | 2 confirmed unsafe |

| **NOT** produced | |
|---|---|
| Merges applied | **0** |
| Splits applied | **0** |
| IDs renumbered | **0** |
| `athlytica_id` issued | **0** |
| Rows written to any table | **0** |
