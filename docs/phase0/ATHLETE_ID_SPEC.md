# Athlete ID Specification — Phase 0

**Status:** DESIGN. No ID has been issued.
**Date:** 2026-08-12

---

## 1. Two identifiers, two jobs

| | Internal | Public |
|---|---|---|
| Name | `athlete_uid` | `athlytica_id` |
| Type | `uuid` | `text` |
| Format | `gen_random_uuid()` | `ATH-` + 6 digits → `ATH-000001` |
| Primary key | **yes** | no — `UNIQUE NOT NULL` only |
| Appears in FKs | **yes, always** | **never** |
| Shown to humans | never | yes — passport, PDF, portal, support |
| Auth credential | **no** | **no** |

**Every foreign key in the canonical schema references `athlete_uid`.** If
`athlytica_id` ever needed to change — it must not, but if a court order or a
data-protection request forced it — no FK would break.

---

## 2. `athlytica_id` rules

The public ID **must not encode**: year · organization · program · discipline ·
team · age tier · sex · registration order · anything else.

It **must**: be globally unique · be permanent · never be reused, including
after a merge or a deletion.

### Format

```
ATH-000001
└─┘ └────┘
 │     └── 6 digits, zero-padded, from athlytica_core.athlytica_id_seq
 └──────── fixed literal prefix
```

Capacity 999,999. At the observed scale (209 legacy athletes over six years)
that is not a constraint worth designing around. If it ever is, widen to 7
digits — `ATH-0000001` sorts and parses identically.

### Why 6 digits specifically

Legacy IDs are `ATH-NNN` (3-digit, range 1–638) and one in-repo function
produces `ATH-NNNNN` (5-digit). A 6-digit canonical ID is **visually and
programmatically distinct from both**:

```
ATH-047        legacy, 3-digit           → athlete_identifier ledger
ATH-00047      nrhl-etl.ts migrateLegacyCode, 5-digit  → never issued
ATH-000047     canonical, 6-digit                       → the real thing
```

A regex of `^ATH-\d{6}$` accepts only the canonical form.

---

## 3. Issuance

```sql
create sequence athlytica_core.athlytica_id_seq start 1;

create or replace function athlytica_core.next_athlytica_id()
returns text
language sql
volatile
security definer
set search_path to 'athlytica_core', 'pg_temp'
as $$
  select 'ATH-' || lpad(nextval('athlytica_core.athlytica_id_seq')::text, 6, '0')
$$;
```

### Critical: this is a NEW sequence

`athlytica_core.scalable_id_sequence.current_value = 500` **must not be used.**
Legacy athlete IDs occupy the numeric range 1–638. Continuing that sequence
would issue numbers already held by real, distinct children:

| Sequence would issue | Already held by |
|---|---|
| `501` | `ATH-500` is Jason Jabali; 501+ are in the legacy block |
| `537` | `ATH-537` — Elaine |
| `566` | `ATH-566` — Shaya Das |
| `598` | `ATH-598` — Shirley Makena |
| `620` | `ATH-620` — contested (Johari Keige / Tyler) |

Three existing SQL functions (`nrhl_next_athlete_code`,
`bigice_next_athlete_code`, `athlytica_core.generate_scalable_athlete_code`) all
increment that one row. **None of them is called in Phase 0**, and none should be
called again once the canonical sequence exists. They are marked DEPRECATED in
`CANONICAL_ATHLETE_ARCHITECTURE.md` §1.

### Assignment order

Assign in **randomised order**, not by legacy ID, alphabet or seniority:

```sql
-- Phase 6 only. Not run in Phase 0.
update athlytica_core.athlete a
   set athlytica_id = athlytica_core.next_athlytica_id()
  from (select athlete_uid from athlytica_core.athlete
         where athlytica_id is null order by random()) o
 where a.athlete_uid = o.athlete_uid;
```

If IDs were assigned in legacy order, `ATH-000003` would reveal that the holder
is one of the earliest registrants — the ID would leak exactly the kind of
information it is designed not to encode.

### Ordering constraint

**IDs are issued only after identity resolution completes** (Migration Runbook
Phase 5 → 6). Issuing before resolution gives a duplicated person two permanent
IDs and makes the duplication canonical.

---

## 4. Not an authentication credential

`athlytica_id` is **public by design** — it is printed on the Performance ID
PDF, quoted in parent emails, and used in support conversations.

Therefore:

- It must never be accepted as proof of identity.
- It must never appear in a URL that returns data without an authorization check.
- It must never be a document filename (see `RLS_POLICY_MATRIX.md` §6).

The existing `public.athlete.claim_token` (`PLAY-<FIRSTNAME>-<4hex>`) is the
claim mechanism and is a **separate** value with different handling. Note it
embeds the athlete's first name, which is a mild disclosure in a shareable
token — logged as issue DQ-046, not fixed in this phase.

---

## 5. Merges and tombstones

A merge never deletes and never frees an ID.

```
athlete A  athlytica_id = ATH-000012  identity_status = MERGED
                                      merged_into_uid = <B>
athlete B  athlytica_id = ATH-000048  identity_status = CONFIRMED
```

- `ATH-000012` remains resolvable forever and continues to point at A.
- A's identifiers stay in the ledger.
- A lookup of `ATH-000012` returns B, **with a note that it resolved through a
  merge**. It does not silently return B as if it had always been B.
- The merge is reversible: clear `merged_into_uid`, set status back.

`athlytica_id` is never reused, including after a merge, a `TEST` record
cleanup, or a data-protection deletion.

---

## 6. Legacy ID handling

No legacy ID is rewritten, reformatted or renumbered. Every one is preserved in
`athlytica_core.athlete_identifier` — see `LEGACY_IDENTIFIER_MAPPING.md`.

**`scripts/normalize-legacy-ids.js` is frozen.** It mints `ATH-YYYY-NNNN`, which
encodes the registration year and violates §2 of this spec. `lib/converters/convexAdapter.ts`
currently throws an error instructing operators to run it; that message is
logged as issue DQ-047 and must be corrected before the adapter is next used.
Neither file is edited in Phase 0.

---

## 7. Test vectors

For `tests/athlete-id.test.mts`:

| Input | Expected |
|---|---|
| `next_athlytica_id()` first call on a fresh sequence | `ATH-000001` |
| 999,999th call | `ATH-999999` |
| Format regex `^ATH-\d{6}$` vs `ATH-047` | **reject** |
| Format regex vs `ATH-00047` | **reject** |
| Format regex vs `ATH-000047` | accept |
| Any `athlytica_id` numeric part vs any legacy identifier numeric part | collision check must run and pass |
| Insert two athletes with the same `athlytica_id` | unique violation |
| `identity_status='MERGED'` with `merged_into_uid IS NULL` | check violation |
| Lookup of a merged ID | returns target **plus** merge indicator, never bare |
