-- =====================================================================
-- 20260728130000_nrhl_league_single_id_issuer.sql
-- CORRECTION to 20260728120000_nrhl_league.sql.
--
-- That migration created public.scalable_id_sequence on the belief that
-- the athlytica_core schema did not exist. It does — the belief came
-- from grepping the repo, which carries no DDL for it, rather than from
-- querying the database. The live schema carries:
--
--   athlytica_core.parents               (parent_id, phone_number, is_verified)
--   athlytica_core.athletes              (athlete_id, ath_code UNIQUE,
--                                         full_name, birth_certificate_hash
--                                         NOT NULL UNIQUE, parent_id)
--   athlytica_core.performance_logs      (taxonomy_node, metrics jsonb,
--                                         video_url, venue_trust_layer,
--                                         verification_status)
--   athlytica_core.scalable_id_sequence  (a counter TABLE, not a
--                                         sequence; current_value = 500)
--   athlytica_core.generate_scalable_athlete_code()
--                                        (trigger on athletes, stamps
--                                         ath_code from that counter)
--
-- All three tables were empty when this landed (2026-07-28).
--
-- Two issuers for one identifier space is precisely the failure that
-- bound ATH-047 to two different children. This collapses them: the
-- league plane draws from the SAME counter athlytica_core.athletes uses,
-- so a code can only ever be handed out once. First code issued after
-- this migration is ATH-00501.
--
-- WHY THE LEAGUE PLANE IS NOT MOVED INTO athlytica_core.athletes:
--   birth_certificate_hash is NOT NULL and UNIQUE there. The legacy
--   corpus has no birth certificates and no date of birth at all, so the
--   31 recovered athletes cannot be inserted without fabricating a hash
--   per child — a fabricated unique key on an identity table is worse
--   than a separate table. athlytica_core.performance_logs is likewise
--   video/verification shaped and drops the per-measurement unit, scale
--   and capture_confidence columns dossier §2.6A requires. So
--   public.nrhl_* stays the league plane and BRIDGES to athlytica_core
--   once an athlete has the documents that schema demands.
-- =====================================================================

-- 1. One issuer. Same atomic UPDATE ... RETURNING as the core trigger,
--    so concurrent callers cannot receive the same value.
create or replace function public.nrhl_next_athlete_code()
returns char(9)
language plpgsql
volatile
security definer
set search_path = athlytica_core, public
as $$
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
end;
$$;

revoke all on function public.nrhl_next_athlete_code() from public, anon, authenticated;
grant execute on function public.nrhl_next_athlete_code() to service_role;

-- 2. Remove the duplicate issuer this module should never have created.
drop sequence if exists public.scalable_id_sequence;

-- 3. Bridge to the core identity plane. Populated when an athlete has
--    the documents athlytica_core.athletes requires — not before.
alter table public.nrhl_athlete
  add column if not exists core_athlete_id uuid references athlytica_core.athletes(athlete_id) on delete set null,
  add column if not exists core_parent_id  uuid references athlytica_core.parents(parent_id)  on delete set null;

create index if not exists idx_nrhl_athlete_core_athlete on public.nrhl_athlete (core_athlete_id);
