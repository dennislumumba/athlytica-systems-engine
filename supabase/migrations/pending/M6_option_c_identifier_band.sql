-- =====================================================================
-- M6 — D-33 Option C: banded, non-sequential ATH- issuance
--
-- ⚠ NOT APPLIED. Held in supabase/migrations/pending/ deliberately.
--    It must NOT be applied until D-40 is reconciled: the migration
--    ledger currently describes the repository rather than the database
--    (31 of 67 production tables have no creating migration), and adding
--    another row to a ledger nobody trusts buys nothing.
--    On apply: move to supabase/migrations/ and rename to the version
--    Postgres stamps, per the D-16 discipline.
--
-- DECISION: D-33 Option C, owner-approved 2026-08-15.
--
--   Legacy reserve   ATH-00001 … ATH-09999   never issued by the system
--   Issuance band    ATH-10000 … ATH-99999   drawn at random
--
-- WHY THIS AND NOT A NEW FORMAT. The identifier is stored in
-- character(9) on a PRIMARY KEY (nrhl_athlete.athlete_code) and three
-- FK columns, and validated by athleteCodeSchema (/^ATH-\d{5}$/), which
-- also guards the public CORS-open verify endpoint parents run from
-- nairobihockey.com. Any longer format needs a PK type migration and a
-- public contract change. Banding needs neither: ATH-10000 is nine
-- characters and matches the existing regex.
--
-- WHY RANDOM AND NOT SEQUENTIAL:
--   * ATH-000003 must not mean "third registrant". A sequential public
--     identifier leaks cohort position onto a certificate.
--   * There is no shared counter, so nothing serialises across ventures
--     and — the part that matters — a failed insert burns nothing.
--     R15 (sequence advanced 500→504 with zero athlete rows persisted)
--     becomes structurally impossible: there is no counter to advance.
--
-- THE PRIMARY KEY IS THE AUTHORITY. The `not exists` probe below is an
-- optimisation that picks a probably-free value. It is NOT a uniqueness
-- guarantee — two concurrent sessions can both pass it. Uniqueness comes
-- from nrhl_athlete_pkey, and the CALLER MUST RETRY ON 23505. A 500-draw
-- test produced 499 distinct values (one collision, against a predicted
-- ~1.4), which is exactly why this is written down.
--
-- CAPACITY: 90,000 identifiers. Expected redraws per issuance are
-- n/(90000-n): 1.1% at n=1,000, 12.5% at n=10,000, 50% at n=30,000.
-- Practical ceiling ~30,000 athletes; hard ceiling 90,000, because
-- character(9) and the five-digit grammar leave no room for a sixth
-- digit. Current nrhl_athlete row count: 0.
--
-- NOT CHANGED, deliberately:
--   * bigice_next_athlete_code() still draws from scalable_id_sequence.
--     It emits BIIF-YYYY-NNNN, a different namespace that cannot collide
--     with ATH-. Converting it is out of the approved scope — but note
--     that the four codes R15 burned were BIIF codes, so R15 stays alive
--     on the Big Ice path until it is converted too. Raised, not done.
--   * athlytica_core.generate_scalable_athlete_code() still emits
--     ATH-NNNNN from the sequence into athlytica_core.athletes.ath_code
--     — i.e. INTO THE LEGACY RESERVE. That table is empty and no client
--     role holds USAGE on the schema, so nothing can reach it. It is left
--     alone because that table is the canonical-identity target whose
--     design is still open; converting its issuer now would presume a
--     decision not yet made. It must be revoked as part of that work.
--   * scalable_id_sequence is NOT reset and NOT dropped. It stays at 504
--     as evidence of R15.
--   * migrateLegacyCode() is NOT touched. Option C is safe against it
--     unmodified: every output for a legacy value below 10,000 is
--     strictly below ATH-10000. The LEG- change remains recommended
--     hygiene, not a dependency.
-- =====================================================================

create or replace function public.nrhl_next_athlete_code()
returns character(9)
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  candidate text;
  attempts  int := 0;
begin
  loop
    attempts := attempts + 1;

    -- 10000 + floor(random() * 90000)  =>  10000 .. 99999
    candidate := 'ATH-' || lpad((10000 + floor(random() * 90000))::int::text, 5, '0');

    -- Advisory probe only. nrhl_athlete_pkey is the authority; the caller
    -- must still handle 23505.
    exit when not exists (
      select 1 from public.nrhl_athlete where athlete_code = candidate
    );

    if attempts >= 5 then
      raise exception
        'ATH- issuance band is saturating: 5 consecutive candidates collided in ATH-10000..ATH-99999. Widen the band or the format before issuing further.'
        using errcode = '53100';
    end if;
  end loop;

  return candidate;
end
$fn$;

comment on function public.nrhl_next_athlete_code() is
  'D-33 Option C. Draws a random identifier from ATH-10000..ATH-99999, '
  'leaving ATH-00001..ATH-09999 reserved for legacy codes. Consumes no '
  'sequence, so a failed create burns nothing. The probe is advisory — '
  'nrhl_athlete_pkey is the uniqueness authority and callers must retry '
  'on 23505. See docs/phase0/IDENTIFIER_NAMESPACE_DESIGN.md Part II.';
