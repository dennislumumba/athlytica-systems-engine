-- =====================================================================
-- ROLLBACK for M6 — D-33 Option C
--
-- Restores nrhl_next_athlete_code() to the pre-M6 sequence-based issuer,
-- byte-for-byte as read from production on 2026-08-15.
--
-- ⚠ RUNNING THIS RE-OPENS R4 AND R15:
--   * R4 — the sequence is at 504, so the next issue is ATH-00505, which
--     sits inside the legacy block ATH-00500..ATH-00638 once
--     migrateLegacyCode() pads those codes to five digits. On
--     nrhl_athlete.athlete_code that is a PRIMARY KEY violation, i.e. an
--     onboarding failure for a family that has already paid.
--   * R15 — mint and insert are separate statements again, so a failed
--     insert permanently burns an identifier.
--
-- Safe to run only while nrhl_athlete is empty AND no legacy codes have
-- been migrated. Check both before running:
--   select count(*) from public.nrhl_athlete;                  -- expect 0
--   select count(*) from public.nrhl_athlete where legacy_code is not null;
-- =====================================================================

create or replace function public.nrhl_next_athlete_code()
returns character
language plpgsql
security definer
set search_path to 'athlytica_core', 'public'
as $fn$
declare
  next_sequence int;
begin
  update athlytica_core.scalable_id_sequence
     set current_value = current_value + 1
   where id = 1
  returning current_value into next_sequence;

  if next_sequence is null then
    raise exception 'athlytica_core.scalable_id_sequence row id=1 is missing; athlete codes cannot be issued';
  end if;

  return 'ATH-' || lpad(next_sequence::text, 5, '0');
end
$fn$;

comment on function public.nrhl_next_athlete_code() is null;


-- Big Ice restored to the pre-M6 sequence-based issuer, byte-for-byte as
-- read from production on 2026-08-15. Same warning applies: this re-opens
-- R15 on the path that actually burned the four codes.

create or replace function public.bigice_next_athlete_code()
returns text
language plpgsql
security definer
set search_path to 'athlytica_core', 'public'
as $fn$
declare
  next_sequence int;
begin
  update athlytica_core.scalable_id_sequence
     set current_value = current_value + 1
   where id = 1
  returning current_value into next_sequence;

  if next_sequence is null then
    raise exception 'athlytica_core.scalable_id_sequence row id=1 is missing; athlete codes cannot be issued';
  end if;

  return 'BIIF-' || to_char(now(), 'YYYY') || '-' || lpad(next_sequence::text, 4, '0');
end
$fn$;

comment on function public.bigice_next_athlete_code() is null;

-- Both issuers revert together. Reverting only one would recreate exactly
-- the mixed allocator state M6 exists to avoid.
