-- =====================================================================
-- D-01a CONTAINMENT PROBE — re-runnable, zero-persistence
--
-- Proves that an authenticated caller cannot write public.athletes, and
-- therefore cannot put another athlete into their own authorization
-- context, EVEN WHEN the auth.users -> public.users bridge exists.
--
-- This is the mutation test for M5. The mutation is M5 itself:
--   * against the PRE-M5 schema, V1 returns "SUCCEEDED" (proven 0.4)
--   * against the POST-M5 schema, V1 returns "BLOCKED 42501"
-- A probe that cannot fail proves nothing, so run it against the
-- rollback before trusting it:
--     \i supabase/migrations/rollback/20260814210328_*_rollback.sql
--   then re-run this file inside a transaction and confirm V1 SUCCEEDS.
--
-- Every row this creates is created inside the transaction and rolled
-- back. It never targets a real athlete.
--
-- Usage: paste into the SQL editor, or psql -f. It ends in ROLLBACK.
-- =====================================================================

begin;

create temp table zz(step text, result text) on commit drop;
grant all on zz to authenticated, service_role;

-- Synthetic victim: an athlete with guardian PII attached.
insert into public.athlete (athlete_id, legal_name, date_of_birth,
                            primary_sport_code, provenance_id, current_status)
select '00000000-dead-4000-8000-000000000001', 'ZZ PROBE VICTIM', '2010-01-01',
       a.primary_sport_code, a.provenance_id, a.current_status
from public.athlete a limit 1;

insert into public.guardian_contact (athlete_id, legal_name, relationship,
                                     contact_info, consent_on_file)
values ('00000000-dead-4000-8000-000000000001', 'ZZ PROBE GUARDIAN', 'parent',
        'zz-probe@example.test', true);

-- The bridge that arms the exploit. Present here on purpose: the
-- containment must not depend on this row being absent.
insert into public.users (id, email, role, tenant_id)
select '00000000-beef-4000-8000-000000000002', 'zz-probe-attacker@example.test',
       'ATHLETE', t.id
from public.tenants t limit 1;

select set_config('request.jwt.claims',
  json_build_object('sub','00000000-beef-4000-8000-000000000002',
                    'email','zz-probe-attacker@example.test',
                    'role','authenticated')::text, true);

set local role authenticated;

do $$ begin
  insert into public.athletes (user_id, passport_athlete_id)
  values ('00000000-beef-4000-8000-000000000002','00000000-dead-4000-8000-000000000001');
  insert into zz values ('V1 attacker claims an athlete', 'SUCCEEDED — CONTAINMENT FAILED');
exception when others then
  insert into zz values ('V1 attacker claims an athlete', 'BLOCKED ' || SQLSTATE);
end $$;

do $$ begin
  update public.athletes set passport_athlete_id = '00000000-dead-4000-8000-000000000001';
  insert into zz values ('V2 attacker updates a claim', 'SUCCEEDED — CONTAINMENT FAILED');
exception when others then
  insert into zz values ('V2 attacker updates a claim', 'BLOCKED ' || SQLSTATE);
end $$;

insert into zz select 'V3 attacker reads the victim',
  'athlete=' || (select count(*) from public.athlete)
  || ' guardian_contact=' || (select count(*) from public.guardian_contact)
  || ' biometric=' || (select count(*) from public.biometric_record)
  || ' injury=' || (select count(*) from public.injury_record)
  || ' custody=' || (select count(*) from public.custody_record)
  || '   (all must be 0)';
reset role;

-- The legitimate server-side boundary must still work.
set local role service_role;
do $$ begin
  insert into public.athletes (user_id, passport_athlete_id)
  values ('00000000-beef-4000-8000-000000000002','00000000-dead-4000-8000-000000000001');
  insert into zz values ('V4 service_role creates the claim', 'SUCCEEDED — legitimate path intact');
exception when others then
  insert into zz values ('V4 service_role creates the claim', 'BROKEN ' || SQLSTATE || ' ' || SQLERRM);
end $$;
reset role;

-- And the guardian path must remain structurally possible.
set local role authenticated;
insert into zz select 'V5 legitimate owner sees own athlete',
  'own_bridge=' || (select count(*) from public.athletes)
  || ' own_athlete=' || (select count(*) from public.athlete)
  || ' own_guardian_contact=' || (select count(*) from public.guardian_contact)
  || '   (all must be 1)';
reset role;

select * from zz order by step;

rollback;

-- EXPECTED, post-M5:
--   V1  BLOCKED 42501
--   V2  BLOCKED 42501
--   V3  athlete=0 guardian_contact=0 biometric=0 injury=0 custody=0
--   V4  SUCCEEDED — legitimate path intact
--   V5  own_bridge=1 own_athlete=1 own_guardian_contact=1
