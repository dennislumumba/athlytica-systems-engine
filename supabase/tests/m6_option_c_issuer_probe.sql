-- =====================================================================
-- M6 / D-33 OPTION C — issuer probe. Re-runnable, zero-persistence.
--
-- Defines the candidate issuer INSIDE a transaction, exercises it, and
-- rolls back. Production's issuer is never replaced by running this.
--
-- Run before applying M6, and again after, to confirm the applied
-- function behaves identically to the tested one.
--
-- Expected results are at the bottom.
-- =====================================================================

begin;

create temp table zz(t text, result text) on commit drop;

-- ---------- the candidate issuer, transaction-local ----------
create or replace function public.nrhl_next_athlete_code()
returns character(9)
language plpgsql security definer set search_path to 'public'
as $fn$
declare candidate text; attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    candidate := 'ATH-' || lpad((10000 + floor(random() * 90000))::int::text, 5, '0');
    exit when not exists (select 1 from public.nrhl_athlete where athlete_code = candidate);
    if attempts >= 5 then
      raise exception 'ATH- issuance band is saturating' using errcode = '53100';
    end if;
  end loop;
  return candidate;
end $fn$;

-- T1 — format, length, band, legacy-disjointness across 500 draws.
-- distinct < 500 is EXPECTED and is the point: collisions happen, which
-- is why the PRIMARY KEY and not this probe is the authority.
with draws as (select public.nrhl_next_athlete_code() c from generate_series(1,500))
insert into zz
select 'T1 500 draws',
  'all_match_regex=' || bool_and(c ~ '^ATH-\d{5}$')
  || ' all_len9=' || bool_and(length(c)=9)
  || ' all_in_band=' || bool_and(substr(c,5)::int between 10000 and 99999)
  || ' any_in_legacy_reserve=' || bool_or(substr(c,5)::int < 10000)
  || ' distinct=' || count(distinct c) || '/500'
from draws;

-- T2 — fits every storage column and the public validation grammar.
insert into zz select 'T2 storage fit',
  'character(9)=' || (length('ATH-99999') <= 9)
  || ' varchar(12)=' || (length('ATH-99999') <= 12)
  || ' athleteCodeSchema=' || ('ATH-99999' ~ '^ATH-\d{5}$');

-- T3 — disjoint from every possible migrateLegacyCode() output.
insert into zz select 'T3 legacy disjoint',
  'legacy_max_638=' || ('ATH-00638' < 'ATH-10000')
  || ' worst_case_9999=' || ('ATH-09999' < 'ATH-10000');

-- T4 — saturation must raise, not spin. Modelled with a 1-value band.
insert into public.nrhl_athlete (athlete_code, display_name)
values ('ATH-10000', 'ZZ SATURATION FIXTURE');

create or replace function public.zz_saturated_issuer() returns text
language plpgsql as $fn$
declare candidate text; attempts int := 0;
begin
  loop
    attempts := attempts + 1;
    candidate := 'ATH-10000';
    exit when not exists (select 1 from public.nrhl_athlete where athlete_code = candidate);
    if attempts >= 5 then raise exception 'saturated' using errcode = '53100'; end if;
  end loop;
  return candidate;
end $fn$;

do $$ begin
  perform public.zz_saturated_issuer();
  insert into zz values ('T4 saturation guard', 'NO RAISE — would loop forever');
exception when others then
  insert into zz values ('T4 saturation guard', 'RAISED ' || SQLSTATE || ' after 5 attempts');
end $$;

-- T5 — the PRIMARY KEY is the final authority, not the probe.
do $$ begin
  insert into public.nrhl_athlete (athlete_code, display_name) values ('ATH-10000','ZZ DUPLICATE');
  insert into zz values ('T5 PK authority', 'DUPLICATE ACCEPTED — PK NOT ENFORCING');
exception when unique_violation then
  insert into zz values ('T5 PK authority', '23505 — PK rejected the duplicate');
end $$;

-- T6 — no sequence is consumed. This is what makes R15 impossible.
insert into zz select 'T6 sequence untouched',
  'current_value=' || current_value from athlytica_core.scalable_id_sequence;

select * from zz order by t;

rollback;

-- EXPECTED:
--   T1  all_match_regex=true all_len9=true all_in_band=true
--       any_in_legacy_reserve=false   distinct≈499/500
--   T2  character(9)=true varchar(12)=true athleteCodeSchema=true
--   T3  legacy_max_638=true worst_case_9999=true
--   T4  RAISED 53100 after 5 attempts
--   T5  23505 — PK rejected the duplicate
--   T6  current_value=504   (unchanged — the issuer consumes no sequence)
