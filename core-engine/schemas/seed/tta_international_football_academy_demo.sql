-- =====================================================================
-- SEED: TTA International Football Academy — live demo (Kimathi Kaumbutho)
-- Target: Supabase project qxfrypvevjsyzkquewxh
-- Planes: app (tenants/users/athletes/sessions/performance_logs)
--       + passport (athlete/sport_profile/metric_value/performance_record)
--
-- Run as service_role / psql. Every table below has RLS enabled.
--
-- RE-RUNNABLE. Fixed UUIDs throughout. Child rows are deleted and
-- rewritten; performance_logs is append-only (trigger blocks DELETE), so
-- it is guarded by ON CONFLICT (ingest_hash) instead. The passport
-- athlete row is UPDATEd, never deleted, because athletes.passport_
-- athlete_id is ON DELETE SET NULL and a delete would silently unlink
-- the app-plane account.
--
-- FOOTBALL ONLY: registers sport_code 'football' and football metric
-- codes. Touches no ice_hockey / inline_hockey row.
--
-- ASSUMPTIONS (not supplied in the brief):
--   * Brian Otieno DOB 2013-02-14 — NOT NULL, and drives the U13 age
--     band. Change here if the real DOB differs.
--   * Brian is a minor: guardian_contact + consent_on_file are seeded.
--   * "TTA-001" is an external org code; public.tenants has no code
--     column, so it is carried in the tenant UUID
--     (77000001-0000-4000-8000-000000000001) and in every scout payload.
--   * TTA programme names live in athlete_metrics_log.PROGRAM_ENROLMENT
--     payloads. cohort_session_registry is NOT used: its track_type enum
--     is ('basic_skating','figure_skating_precision') — a Big Ice rink
--     taxonomy. Widening it for football would be exactly the
--     cross-sport leakage this seed exists to remove.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. TAXONOMY — football only
-- ---------------------------------------------------------------------
INSERT INTO sport_taxonomy (sport_code, display_name) VALUES
  ('football', 'Football / Soccer')
ON CONFLICT (sport_code) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO discipline_taxonomy (sport_code, discipline_code, display_name) VALUES
  ('football', 'eleven_a_side', 'Football / Soccer — 11-a-side')
ON CONFLICT (sport_code, discipline_code) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO metric_registry (metric_code, sport_code, discipline_code, display_name, unit, data_type) VALUES
  -- combine / S&C battery
  ('SPEED_10M_SPRINT_S',        'football', NULL, '10m Acceleration Sprint',        's',      'numeric'),
  ('SPEED_30M_SPRINT_S',        'football', NULL, '30m Sprint (split)',             's',      'numeric'),
  ('POWER_CMJ_CM',              'football', NULL, 'Countermovement Jump',           'cm',     'numeric'),
  ('STAMINA_YYIR1_M',           'football', NULL, 'Yo-Yo IR1 Distance',             'm',      'numeric'),
  -- session telemetry
  ('PHY_MATCH_MINUTES',         'football', NULL, 'Minutes Played',                 'min',    'numeric'),
  ('PHY_GPS_SESSION_LOAD_AU',   'football', NULL, 'GPS Session Load',               'AU',     'numeric'),
  ('PHY_DISTANCE_TOTAL_M',      'football', NULL, 'Total Distance Covered',         'm',      'numeric'),
  ('PHY_HSR_DISTANCE_M',        'football', NULL, 'High-Speed Running Distance',    'm',      'numeric'),
  ('TAC_MATCH_RATING',          'football', NULL, 'Match Tactical Rating',          '/10',    'numeric'),
  ('TAC_POSITION_SECONDARY',    'football', NULL, 'Secondary Position',             'code',   'text'),
  ('VEO_CLIP_TAG',              'football', NULL, 'Verified Video Tag',             'tag',    'text'),
  -- academic file (Cambridge IGCSE / recruitment)
  ('ACAD_IGCSE_SUBJECT_GRADE',  'football', NULL, 'Cambridge IGCSE Subject Grade',  'grade',  'text'),
  ('ACAD_IGCSE_TERM_AVERAGE',   'football', NULL, 'IGCSE Term Average',             '%',      'numeric'),
  ('ACAD_ELIGIBILITY_STATUS',   'football', NULL, 'Recruitment Eligibility Status', 'status', 'text')
ON CONFLICT (metric_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. PROVENANCE
-- ---------------------------------------------------------------------
INSERT INTO provenance (
  provenance_id, data_source, entered_by_actor_id, entered_by_actor_role,
  entered_at, verified_by_actor_id, verified_by_org, verified_at,
  verification_method, verification_status, confidence_score
) VALUES
  -- identity / registration
  ('77000007-0000-4000-8000-000000000001', 'club_official',
   '77000003-0000-4000-8000-000000000001', 'club_admin', '2025-07-10T09:00:00Z',
   '77000003-0000-4000-8000-000000000001', 'TTA International Football Academy', '2025-07-12T09:00:00Z',
   'document_check', 'verified', 0.95),
  -- session telemetry / combine testing (Coach Njoroge)
  ('77000007-0000-4000-8000-000000000002', 'club_official',
   '77000003-0000-4000-8000-000000000002', 'club_admin', '2025-07-15T15:30:00Z',
   '77000003-0000-4000-8000-000000000001', 'TTA International Football Academy', '2026-07-14T18:00:00Z',
   'witness_corroboration', 'verified', 0.92),
  -- match footage (hash-anchored video evidence)
  ('77000007-0000-4000-8000-000000000003', 'video_verified',
   '77000003-0000-4000-8000-000000000002', 'club_admin', '2026-06-20T18:00:00Z',
   '77000003-0000-4000-8000-000000000001', 'TTA International Football Academy', '2026-06-21T10:00:00Z',
   'hash_anchor_confirmation', 'verified', 0.98),
  -- academic record (Cambridge IGCSE, Student Athlete Program)
  ('77000007-0000-4000-8000-000000000004', 'club_official',
   '77000003-0000-4000-8000-000000000001', 'club_admin', '2026-07-10T09:00:00Z',
   '77000003-0000-4000-8000-000000000001', 'TTA Student Athlete Program (Cambridge IGCSE)', '2026-07-10T09:00:00Z',
   'document_check', 'verified', 0.90)
ON CONFLICT (provenance_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. ORG ENTITIES (passport plane)
-- ---------------------------------------------------------------------
INSERT INTO federation (federation_id, name, country_code, sport_code) VALUES
  ('7700000a-0000-4000-8000-000000000001', 'Football Kenya Federation', 'KEN', 'football')
ON CONFLICT (federation_id) DO NOTHING;

INSERT INTO club (club_id, name, federation_id, country_code, is_training_club) VALUES
  ('7700000b-0000-4000-8000-000000000001', 'TTA International Football Academy',
   '7700000a-0000-4000-8000-000000000001', 'KEN', true)
ON CONFLICT (club_id) DO NOTHING;

INSERT INTO competition_event (competition_event_id, name, competition_level, sport_code, event_date, location_country_code) VALUES
  ('7700000c-0000-4000-8000-000000000001', 'TTA U13 vs FKF Youth League Select',
   'regional', 'football', '2026-06-20', 'KEN')
ON CONFLICT (competition_event_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. APP PLANE — workspace TTA-001, staff, venue
-- ---------------------------------------------------------------------
INSERT INTO public.tenants (id, name) VALUES
  ('77000001-0000-4000-8000-000000000001', 'TTA International Football Academy')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO public.users (id, email, role, tenant_id) VALUES
  ('77000003-0000-4000-8000-000000000001', 'director@ttafootball.demo',      'ADMIN',   '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000002', 'coach.njoroge@ttafootball.demo', 'COACH',   '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000011', 'brian.otieno@ttafootball.demo',  'ATHLETE', '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000012', 'amani.wanjiru@ttafootball.demo', 'ATHLETE', '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000013', 'neema.achieng@ttafootball.demo', 'ATHLETE', '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000014', 'kevin.mutiso@ttafootball.demo',  'ATHLETE', '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000015', 'faith.nyambura@ttafootball.demo','ATHLETE', '77000001-0000-4000-8000-000000000001'),
  ('77000003-0000-4000-8000-000000000016', 'samuel.kiprop@ttafootball.demo', 'ATHLETE', '77000001-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Bounding polygon gates telemetry ingestion (app/api/v1/telemetry/ingest).
INSERT INTO public.venues (id, name, tenant_id, coordinates) VALUES
  ('77000002-0000-4000-8000-000000000001', 'TTA Main Pitch — Nairobi',
   '77000001-0000-4000-8000-000000000001',
   '{"type":"polygon","points":[
       {"lat":-1.30250,"lng":36.79100},
       {"lat":-1.30250,"lng":36.79320},
       {"lat":-1.30410,"lng":36.79320},
       {"lat":-1.30410,"lng":36.79100}]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 4. PASSPORT ATHLETES — Brian Otieno (ATH-001) + TTA roster
--    UPDATE-in-place: deleting would NULL athletes.passport_athlete_id.
-- ---------------------------------------------------------------------
INSERT INTO athlete (
  athlete_id, legal_name, preferred_name, date_of_birth, sex_at_birth,
  nationalities, current_status, primary_sport_code, provenance_id, parent_email
) VALUES
  ('77000005-0000-4000-8000-000000000001', 'Brian Otieno',   'Brian',  '2013-02-14', 'male',
   '{KEN}', 'active', 'football', '77000007-0000-4000-8000-000000000001', 'otieno.family@ttafootball.demo'),
  ('77000005-0000-4000-8000-000000000002', 'Amani Wanjiru',  'Amani',  '2015-05-02', 'female',
   '{KEN}', 'active', 'football', '77000007-0000-4000-8000-000000000001', 'wanjiru.family@ttafootball.demo'),
  ('77000005-0000-4000-8000-000000000003', 'Neema Achieng',  'Neema',  '2006-09-19', 'female',
   '{KEN}', 'active', 'football', '77000007-0000-4000-8000-000000000001', NULL),
  ('77000005-0000-4000-8000-000000000004', 'Kevin Mutiso',   'Kevin',  '2007-01-28', 'male',
   '{KEN}', 'active', 'football', '77000007-0000-4000-8000-000000000001', NULL),
  ('77000005-0000-4000-8000-000000000005', 'Faith Nyambura', 'Faith',  '2005-11-07', 'female',
   '{KEN}', 'active', 'football', '77000007-0000-4000-8000-000000000001', NULL),
  ('77000005-0000-4000-8000-000000000006', 'Samuel Kiprop',  'Samuel', '2014-08-23', 'male',
   '{KEN}', 'active', 'football', '77000007-0000-4000-8000-000000000001', 'kiprop.family@ttafootball.demo')
ON CONFLICT (athlete_id) DO UPDATE SET
  legal_name         = EXCLUDED.legal_name,
  preferred_name     = EXCLUDED.preferred_name,
  date_of_birth      = EXCLUDED.date_of_birth,
  sex_at_birth       = EXCLUDED.sex_at_birth,
  current_status     = EXCLUDED.current_status,
  primary_sport_code = EXCLUDED.primary_sport_code,
  parent_email       = EXCLUDED.parent_email;

INSERT INTO athlete_sports (athlete_id, sport_code, discipline_code)
SELECT athlete_id, 'football', 'eleven_a_side'
FROM athlete WHERE athlete_id::text LIKE '77000005-%'
ON CONFLICT DO NOTHING;

INSERT INTO athlete_coaches (athlete_id, coach_id, role_label)
SELECT athlete_id, 'coach_njoroge', 'Head of Football Performance'
FROM athlete WHERE athlete_id::text LIKE '77000005-%'
ON CONFLICT DO NOTHING;

INSERT INTO sport_profile (
  sport_profile_id, athlete_id, sport_code, discipline_code,
  role_position, dominant_side, provenance_id
) VALUES
  ('77000006-0000-4000-8000-000000000001', '77000005-0000-4000-8000-000000000001',
   'football', 'eleven_a_side', 'Forward (ST/RW)',      'right', '77000007-0000-4000-8000-000000000001'),
  ('77000006-0000-4000-8000-000000000002', '77000005-0000-4000-8000-000000000002',
   'football', 'eleven_a_side', 'Midfielder (CM)',      'right', '77000007-0000-4000-8000-000000000001'),
  ('77000006-0000-4000-8000-000000000003', '77000005-0000-4000-8000-000000000003',
   'football', 'eleven_a_side', 'Forward (LW)',         'left',  '77000007-0000-4000-8000-000000000001'),
  ('77000006-0000-4000-8000-000000000004', '77000005-0000-4000-8000-000000000004',
   'football', 'eleven_a_side', 'Defender (CB)',        'right', '77000007-0000-4000-8000-000000000001'),
  ('77000006-0000-4000-8000-000000000005', '77000005-0000-4000-8000-000000000005',
   'football', 'eleven_a_side', 'Goalkeeper',           'right', '77000007-0000-4000-8000-000000000001'),
  ('77000006-0000-4000-8000-000000000006', '77000005-0000-4000-8000-000000000006',
   'football', 'eleven_a_side', 'Midfielder (CAM)',     'left',  '77000007-0000-4000-8000-000000000001')
ON CONFLICT (sport_profile_id) DO UPDATE SET
  role_position = EXCLUDED.role_position,
  dominant_side = EXCLUDED.dominant_side;

-- Minor consent: Brian (13), Amani (11) and Samuel (11) are under 18.
DELETE FROM guardian_contact WHERE athlete_id::text LIKE '77000005-%';
INSERT INTO guardian_contact (athlete_id, legal_name, relationship, contact_info, consent_on_file, consent_date) VALUES
  ('77000005-0000-4000-8000-000000000001', 'Millicent Otieno',  'parent', 'otieno.family@ttafootball.demo', true, '2025-07-10'),
  ('77000005-0000-4000-8000-000000000002', 'Joseph Wanjiru',    'parent', 'wanjiru.family@ttafootball.demo', true, '2025-08-04'),
  ('77000005-0000-4000-8000-000000000006', 'Esther Kiprop',     'parent', 'kiprop.family@ttafootball.demo',  true, '2025-09-01');

-- Training-club custody (FIFA Art. 21 solidarity input).
DELETE FROM custody_record WHERE athlete_id::text LIKE '77000005-%';
INSERT INTO custody_record (
  athlete_id, club_id, federation_id, registration_type,
  start_date, is_training_club_flag, provenance_id
)
SELECT athlete_id, '7700000b-0000-4000-8000-000000000001',
       '7700000a-0000-4000-8000-000000000001', 'amateur',
       DATE '2025-07-15', true, '77000007-0000-4000-8000-000000000001'
FROM athlete WHERE athlete_id::text LIKE '77000005-%';

-- ---------------------------------------------------------------------
-- 5. APP PLANE ATHLETE ACCOUNTS + tenant authorization boundary
-- ---------------------------------------------------------------------
INSERT INTO public.athletes (id, user_id, passport_athlete_id) VALUES
  ('77000004-0000-4000-8000-000000000001', '77000003-0000-4000-8000-000000000011', '77000005-0000-4000-8000-000000000001'),
  ('77000004-0000-4000-8000-000000000002', '77000003-0000-4000-8000-000000000012', '77000005-0000-4000-8000-000000000002'),
  ('77000004-0000-4000-8000-000000000003', '77000003-0000-4000-8000-000000000013', '77000005-0000-4000-8000-000000000003'),
  ('77000004-0000-4000-8000-000000000004', '77000003-0000-4000-8000-000000000014', '77000005-0000-4000-8000-000000000004'),
  ('77000004-0000-4000-8000-000000000005', '77000003-0000-4000-8000-000000000015', '77000005-0000-4000-8000-000000000005'),
  ('77000004-0000-4000-8000-000000000006', '77000003-0000-4000-8000-000000000016', '77000005-0000-4000-8000-000000000006')
ON CONFLICT (id) DO UPDATE SET passport_athlete_id = EXCLUDED.passport_athlete_id;

INSERT INTO public.athlete_tenant_links (athlete_id, tenant_id)
SELECT id, '77000001-0000-4000-8000-000000000001' FROM public.athletes
WHERE id::text LIKE '77000004-%'
ON CONFLICT (athlete_id, tenant_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 6. BIOMETRICS — Brian at intake and at the July 2026 benchmark
-- ---------------------------------------------------------------------
DELETE FROM biometric_record WHERE athlete_id::text LIKE '77000005-%';
INSERT INTO biometric_record (
  record_id, athlete_id, measured_at, age_at_measurement_years,
  height_cm, weight_kg, measurement_method, examiner_id, provenance_id
) VALUES
  ('7700000e-0000-4000-8000-000000000001', '77000005-0000-4000-8000-000000000001',
   '2025-07-15', 12.42, 148.00, 38.50, 'club_medical_staff',
   '77000003-0000-4000-8000-000000000002', '77000007-0000-4000-8000-000000000002'),
  ('7700000e-0000-4000-8000-000000000002', '77000005-0000-4000-8000-000000000001',
   '2026-07-14', 13.41, 157.50, 45.20, 'club_medical_staff',
   '77000003-0000-4000-8000-000000000002', '77000007-0000-4000-8000-000000000002');

-- =====================================================================
-- 7. THE 12-MONTH SESSION LEDGER — 24 bi-weekly entries, Jul 2025→Jul 2026
--
-- Trajectory invariants (asserted at the foot of this file):
--   composite    28.5 -> 74.2, strictly non-decreasing, never < 10
--   sprint 30m   4.80s -> 4.20s (+12.5%), never regresses
--   radar        speed 78 / agility 72 / stamina 68 / technical 75 /
--                cognitive 64 at the final session
--   90-day trend +15.4% (2026-04-07 = 64.3 -> 2026-07-14 = 74.2)
-- Cadence is 14 days with three 28-day academy breaks (Sep, Dec, Apr).
-- =====================================================================
CREATE TEMP TABLE tta_ledger (
  n         int PRIMARY KEY,
  ts        timestamptz NOT NULL,
  speed     double precision NOT NULL,
  agility   double precision NOT NULL,
  stamina   double precision NOT NULL,
  technical double precision NOT NULL,
  cognitive double precision NOT NULL,
  composite double precision NOT NULL,
  sprint30  numeric NOT NULL
) ON COMMIT DROP;

INSERT INTO tta_ledger VALUES
  ( 1, TIMESTAMPTZ '2025-07-15T15:30:00Z', 32, 29, 27, 30, 25, 28.5, 4.8),
  ( 2, TIMESTAMPTZ '2025-07-29T15:30:00Z', 33.9, 30.7, 28.7, 31.8, 26.6, 30.4, 4.78),
  ( 3, TIMESTAMPTZ '2025-08-12T15:30:00Z', 36.2, 33, 30.8, 34.2, 28.6, 32.7, 4.74),
  ( 4, TIMESTAMPTZ '2025-08-26T15:30:00Z', 37.9, 34.5, 32.3, 35.8, 30, 34.4, 4.72),
  ( 5, TIMESTAMPTZ '2025-09-23T15:30:00Z', 40.5, 36.9, 34.6, 38.3, 32.2, 36.9, 4.69),
  ( 6, TIMESTAMPTZ '2025-10-07T15:30:00Z', 42.7, 39, 36.5, 40.4, 34, 39.1, 4.66),
  ( 7, TIMESTAMPTZ '2025-10-21T15:30:00Z', 44.1, 40.3, 37.8, 41.9, 35.3, 40.5, 4.64),
  ( 8, TIMESTAMPTZ '2025-11-04T15:30:00Z', 46.8, 42.8, 40.2, 44.5, 37.6, 43.2, 4.61),
  ( 9, TIMESTAMPTZ '2025-11-18T15:30:00Z', 49.1, 45, 42.2, 46.7, 39.5, 45.5, 4.58),
  (10, TIMESTAMPTZ '2025-12-02T15:30:00Z', 50.8, 46.6, 43.8, 48.4, 41, 47.2, 4.55),
  (11, TIMESTAMPTZ '2025-12-16T15:30:00Z', 53.3, 48.9, 46, 50.9, 43.1, 49.7, 4.52),
  (12, TIMESTAMPTZ '2025-12-30T15:30:00Z', 55.4, 50.9, 47.9, 52.9, 44.8, 51.7, 4.49),
  (13, TIMESTAMPTZ '2026-01-27T15:30:00Z', 57, 52.3, 49.2, 54.4, 46.2, 53.3, 4.47),
  (14, TIMESTAMPTZ '2026-02-10T15:30:00Z', 59.8, 54.9, 51.7, 57.1, 48.5, 56.1, 4.44),
  (15, TIMESTAMPTZ '2026-02-24T15:30:00Z', 61.9, 57, 53.7, 59.3, 50.4, 58.2, 4.41),
  (16, TIMESTAMPTZ '2026-03-10T15:30:00Z', 63.8, 58.7, 55.3, 61.1, 52, 60.1, 4.39),
  (17, TIMESTAMPTZ '2026-03-24T15:30:00Z', 66.4, 61.1, 57.6, 63.6, 54.1, 62.7, 4.35),
  (18, TIMESTAMPTZ '2026-04-07T15:30:00Z', 68, 62.7, 59.1, 65.3, 55.6, 64.3, 4.33),
  (19, TIMESTAMPTZ '2026-04-21T15:30:00Z', 69.8, 64.3, 60.7, 67, 57, 66, 4.31),
  (20, TIMESTAMPTZ '2026-05-19T15:30:00Z', 71.5, 65.9, 62.2, 68.6, 58.5, 67.7, 4.29),
  (21, TIMESTAMPTZ '2026-06-02T15:30:00Z', 72.9, 67.2, 63.5, 70, 59.7, 69.1, 4.27),
  (22, TIMESTAMPTZ '2026-06-16T15:30:00Z', 74.9, 69.1, 65.2, 71.9, 61.4, 71.1, 4.24),
  (23, TIMESTAMPTZ '2026-06-30T15:30:00Z', 76.2, 70.3, 66.4, 73.2, 62.5, 72.4, 4.22),
  (24, TIMESTAMPTZ '2026-07-14T15:30:00Z', 78, 72, 68, 75, 64, 74.2, 4.2);

-- 7a. Session rows (one per ledger entry)
INSERT INTO public.sessions (id, athlete_id, venue_id, start_time, end_time)
SELECT ('77000008-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '77000004-0000-4000-8000-000000000001',
       '77000002-0000-4000-8000-000000000001',
       ts, ts + INTERVAL '95 minutes'
FROM tta_ledger
ON CONFLICT (id) DO NOTHING;

-- 7b. Radar + composite feed. Append-only table: guarded by ingest_hash.
INSERT INTO public.performance_logs (
  id, athlete_id, session_id, speed, agility, stamina, technical, cognitive,
  raw_payload, tenant_id, stream_type, composite_score, venue_verified,
  ingest_hash, engine_version, created_at
)
SELECT
  ('77000009-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  '77000004-0000-4000-8000-000000000001',
  ('77000008-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
  speed, agility, stamina, technical, cognitive,
  jsonb_build_object(
    'sport', 'football',
    'discipline', 'eleven_a_side',
    'session_no', n,
    'session_label', 'TTA Session ' || lpad(n::text, 2, '0') || ' — U13 Intermediate',
    'programme', 'Student Athlete Program',
    'cohort', 'U13 Intermediate',
    'position', 'Forward',
    'coach', 'Coach Njoroge',
    'venue', 'TTA Main Pitch — Nairobi',
    'sprint_30m_s', sprint30,
    'gps_load_au', round((420 + composite * 4.6)::numeric, 1),
    'distance_total_m', round((4200 + composite * 42)::numeric, 0),
    'hsr_distance_m', round((280 + composite * 7.4)::numeric, 0)
  ),
  '77000001-0000-4000-8000-000000000001',
  'IMU_PACKET',
  composite, true,
  encode(sha256(('TTA-001|ATH-001|SESSION-' || lpad(n::text, 2, '0'))::bytea), 'hex'),
  '1.0.0', ts
FROM tta_ledger
ON CONFLICT (ingest_hash) DO NOTHING;

-- 7c. Passport-plane sprint split, one row per session (the +12.5% line).
DELETE FROM metric_value WHERE sport_profile_id::text LIKE '77000006-%';
INSERT INTO metric_value (sport_profile_id, metric_code, value_numeric, measured_at, context, provenance_id)
SELECT '77000006-0000-4000-8000-000000000001', 'SPEED_30M_SPRINT_S', sprint30, ts,
       'training_session', '77000007-0000-4000-8000-000000000002'
FROM tta_ledger;

-- 7d. Latest combine battery + secondary position.
INSERT INTO metric_value (sport_profile_id, metric_code, value_numeric, measured_at, context, provenance_id)
SELECT '77000006-0000-4000-8000-000000000001', code, val,
       TIMESTAMPTZ '2026-07-14T15:30:00Z', 'combine_test', '77000007-0000-4000-8000-000000000002'
FROM (VALUES
  ('SPEED_10M_SPRINT_S',  1.82),
  ('POWER_CMJ_CM',       41.50),
  ('STAMINA_YYIR1_M',  1480.00)
) AS t(code, val);

INSERT INTO metric_value (sport_profile_id, metric_code, value_text, measured_at, provenance_id) VALUES
  ('77000006-0000-4000-8000-000000000001', 'TAC_POSITION_SECONDARY', 'RW',
   '2026-07-14T15:30:00Z', '77000007-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------
-- 8. MATCH RECORD + VERIFIED VIDEO TAGS (scout passport evidence)
-- ---------------------------------------------------------------------
DELETE FROM performance_record WHERE athlete_id::text LIKE '77000005-%';
INSERT INTO performance_record (
  performance_record_id, athlete_id, competition_event_id, sport_code,
  discipline_code, video_evidence_hash, provenance_id
) VALUES (
  '7700000d-0000-4000-8000-000000000001', '77000005-0000-4000-8000-000000000001',
  '7700000c-0000-4000-8000-000000000001', 'football', 'eleven_a_side',
  encode(sha256('video://TTA-U13-VS-FKF-YOUTH-LEAGUE-2026-06-20'::bytea), 'hex'),
  '77000007-0000-4000-8000-000000000003'
);

INSERT INTO metric_value (performance_record_id, metric_code, value_numeric, measured_at, context, provenance_id)
SELECT '7700000d-0000-4000-8000-000000000001', code, val,
       TIMESTAMPTZ '2026-06-20T13:00:00Z', 'in_competition',
       '77000007-0000-4000-8000-000000000003'
FROM (VALUES
  ('PHY_MATCH_MINUTES',        70.0),
  ('PHY_GPS_SESSION_LOAD_AU', 612.0),
  ('PHY_DISTANCE_TOTAL_M',   7300.0),
  ('PHY_HSR_DISTANCE_M',      760.0),
  ('TAC_MATCH_RATING',          8.2)
) AS t(code, val);

INSERT INTO metric_value (performance_record_id, metric_code, value_text, measured_at, context, provenance_id)
SELECT '7700000d-0000-4000-8000-000000000001', 'VEO_CLIP_TAG', tag,
       TIMESTAMPTZ '2026-06-20T13:00:00Z', 'in_competition',
       '77000007-0000-4000-8000-000000000003'
FROM (VALUES
  ('VS FKF Youth League - Timestamp 14:22 - 1v1 Isolation & Finishing'),
  ('VS FKF Youth League - Timestamp 31:07 - Off-ball run & first-time strike'),
  ('VS FKF Youth League - Timestamp 58:44 - High press trigger & recovery sprint')
) AS t(tag);

-- ---------------------------------------------------------------------
-- 9. CAMBRIDGE IGCSE ACADEMIC FILE (Student Athlete Program)
--    context is NULL — no allowed context value describes academics.
-- ---------------------------------------------------------------------
INSERT INTO metric_value (sport_profile_id, metric_code, value_numeric, measured_at, provenance_id) VALUES
  ('77000006-0000-4000-8000-000000000001', 'ACAD_IGCSE_TERM_AVERAGE', 78.40,
   '2026-07-10T09:00:00Z', '77000007-0000-4000-8000-000000000004');

INSERT INTO metric_value (sport_profile_id, metric_code, value_text, measured_at, provenance_id)
SELECT '77000006-0000-4000-8000-000000000001', code, txt,
       TIMESTAMPTZ '2026-07-10T09:00:00Z', '77000007-0000-4000-8000-000000000004'
FROM (VALUES
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Mathematics: B'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'English Literature: A*'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'English Language: A'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Combined Science: B'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Physical Education: A*'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Business Studies: A'),
  ('ACAD_ELIGIBILITY_STATUS',  'On track — Cambridge IGCSE core criteria met (Year 9 checkpoint)')
) AS t(code, txt);

-- =====================================================================
-- 10. DASHBOARD / PASSPORT FEED — athlete_metrics_log
--     Drives athlete_passport_longitudinal() and the realtime parent
--     portal. Values are normalized 1..100 composites.
-- =====================================================================
DELETE FROM athlete_metrics_log WHERE athlete_id::text LIKE '77000005-%';

-- 10a. Programme / cohort mapping for the whole roster.
--      No programmes table exists; this payload is the mapping surface.
INSERT INTO athlete_metrics_log (athlete_id, metric_code, metric_timestamp, metric_payload)
SELECT athlete_id, 'PROGRAM_ENROLMENT', TIMESTAMPTZ '2025-07-15T09:00:00Z',
       jsonb_build_object(
         'sport', 'football',
         'category', 'other',
         'organization', 'TTA International Football Academy',
         'organization_code', 'TTA-001',
         'program', program,
         'cohort', cohort,
         'role', role_label,
         'enrolled_on', '2025-07-15'
       )
FROM (VALUES
  ('77000005-0000-4000-8000-000000000001'::uuid, 'Student Athlete Program', 'IGCSE + High Performance — U13 Intermediate', 'Forward'),
  ('77000005-0000-4000-8000-000000000002'::uuid, 'TTA Junior Academy',      'U7–U15 — U11 Development',                   'Midfielder'),
  ('77000005-0000-4000-8000-000000000003'::uuid, 'TTA Queens',              'U21 Girls Incubator',                        'Forward'),
  ('77000005-0000-4000-8000-000000000004'::uuid, 'Pro Development Program', 'PDP 17–21',                                  'Defender'),
  ('77000005-0000-4000-8000-000000000005'::uuid, 'TTA Queens',              'U21 Girls Incubator',                        'Goalkeeper'),
  ('77000005-0000-4000-8000-000000000006'::uuid, 'TTA Junior Academy',      'U7–U15 — U13 Foundation',                    'Midfielder')
) AS t(athlete_id, program, cohort, role_label);

-- 10b. Brian's 24-point "Road to Mastery" line (physical domain).
INSERT INTO athlete_metrics_log (athlete_id, metric_code, metric_timestamp, metric_payload)
SELECT '77000005-0000-4000-8000-000000000001', 'PHY_COMPOSITE', ts,
       jsonb_build_object(
         'sport', 'football',
         'category', 'physical',
         'value', composite,
         'session_no', n,
         'program', 'Student Athlete Program',
         'cohort', 'U13 Intermediate',
         'raw', jsonb_build_object(
           'speed', speed, 'agility', agility, 'stamina', stamina,
           'sprint_30m_s', sprint30)
       )
FROM tta_ledger;

-- 10c. Tactical domain — technical/cognitive half of the radar.
INSERT INTO athlete_metrics_log (athlete_id, metric_code, metric_timestamp, metric_payload)
SELECT '77000005-0000-4000-8000-000000000001', 'TAC_COMPOSITE', ts,
       jsonb_build_object(
         'sport', 'football',
         'category', 'tactical',
         'value', round(((technical + cognitive) / 2)::numeric, 1),
         'session_no', n,
         'raw', jsonb_build_object('technical', technical, 'cognitive', cognitive)
       )
FROM tta_ledger;

-- 10d. Radar snapshot + trend indicator (the two headline widgets).
INSERT INTO athlete_metrics_log (athlete_id, metric_code, metric_timestamp, metric_payload) VALUES
  ('77000005-0000-4000-8000-000000000001', 'RADAR_SNAPSHOT', '2026-07-14T15:30:00Z',
   '{"sport":"football","category":"other",
     "taxonomy":{"speed":78,"agility":72,"stamina":68,"technical":75,"cognitive":64},
     "composite":74.2,"as_of":"2026-07-14"}'::jsonb),
  ('77000005-0000-4000-8000-000000000001', 'TREND_INDICATOR', '2026-07-14T15:30:00Z',
   '{"sport":"football","category":"other","direction":"positive",
     "rolling_window_days":90,"change_pct":15.4,
     "baseline":{"as_of":"2026-04-07","composite":64.3},
     "current":{"as_of":"2026-07-14","composite":74.2},
     "sprint_30m":{"from_s":4.80,"to_s":4.20,"improvement_pct":12.5}}'::jsonb),

  -- 10e. Scout link. No dedicated table exists; this row IS the share
  -- grant of record. Active and pre-permissioned — no approval step in
  -- the demo path.
  ('77000005-0000-4000-8000-000000000001', 'SCOUT_EXPORT_CONFIG', '2026-07-27T00:00:00Z',
   '{"sport":"football","category":"other",
     "export_profile_name":"TTA-PROSPECT-BRIAN-OTIENO-2026",
     "organization":"TTA International Football Academy","organization_code":"TTA-001",
     "program":"Student Athlete Program (IGCSE + High Performance)",
     "cohort":"U13 Intermediate — Forward",
     "recruitment_pathway":"SRUSA / European Recruiter View",
     "audience":"SRUSA / European Recruiter View",
     "status":"active","requires_approval":false,
     "share_url":"https://app.athlyticahq.com/passport/s/tta-001-brian-otieno-2026",
     "permissions":{"telemetry":true,"radar":true,"video_tags":true,
                    "academic_record":true,"biometrics":true,"contact_details":false},
     "verification_badge":{"active":true,"attributed_to":"TTA Academy Director",
                           "verified_by_actor_id":"77000003-0000-4000-8000-000000000001"},
     "issued_at":"2026-07-27T00:00:00Z","expires_at":"2026-10-25T00:00:00Z","ttl_days":90}'::jsonb);

-- 10f. One current reading per supporting roster athlete, so the roster
--      panel renders values instead of dashes.
INSERT INTO athlete_metrics_log (athlete_id, metric_code, metric_timestamp, metric_payload)
SELECT athlete_id, 'PHY_COMPOSITE', TIMESTAMPTZ '2026-07-14T15:30:00Z',
       jsonb_build_object('sport', 'football', 'category', 'physical', 'value', val)
FROM (VALUES
  ('77000005-0000-4000-8000-000000000002'::uuid, 61.4),
  ('77000005-0000-4000-8000-000000000003'::uuid, 79.6),
  ('77000005-0000-4000-8000-000000000004'::uuid, 71.8),
  ('77000005-0000-4000-8000-000000000005'::uuid, 76.3),
  ('77000005-0000-4000-8000-000000000006'::uuid, 58.9)
) AS t(athlete_id, val);

-- =====================================================================
-- CHECK — fails the transaction if the pitch narrative does not hold.
-- =====================================================================
DO $$
DECLARE
  app_ath CONSTANT uuid := '77000004-0000-4000-8000-000000000001';
  n_sessions int; n_logs int; n_sprint int; n_veo int; n_igcse int;
  n_program int; n_roster int; bad int;
  first_c double precision; last_c double precision;
  r record;
BEGIN
  SELECT count(*) INTO n_sessions FROM public.sessions WHERE athlete_id = app_ath;
  SELECT count(*) INTO n_logs     FROM public.performance_logs WHERE athlete_id = app_ath;
  SELECT count(*) INTO n_sprint   FROM metric_value
    WHERE sport_profile_id = '77000006-0000-4000-8000-000000000001' AND metric_code = 'SPEED_30M_SPRINT_S';
  SELECT count(*) INTO n_veo      FROM metric_value
    WHERE performance_record_id = '7700000d-0000-4000-8000-000000000001' AND metric_code = 'VEO_CLIP_TAG';
  SELECT count(*) INTO n_igcse    FROM metric_value
    WHERE sport_profile_id = '77000006-0000-4000-8000-000000000001' AND metric_code = 'ACAD_IGCSE_SUBJECT_GRADE';
  SELECT count(*) INTO n_program  FROM athlete_metrics_log WHERE metric_code = 'PROGRAM_ENROLMENT';
  SELECT count(*) INTO n_roster   FROM athlete WHERE athlete_id::text LIKE '77000005-%';

  IF (n_sessions, n_logs, n_sprint, n_veo, n_igcse, n_program, n_roster)
     IS DISTINCT FROM (24, 24, 24, 3, 6, 6, 6) THEN
    RAISE EXCEPTION 'seed check: sessions=% logs=% sprint=% veo=% igcse=% program=% roster=% (expected 24/24/24/3/6/6/6)',
      n_sessions, n_logs, n_sprint, n_veo, n_igcse, n_program, n_roster;
  END IF;

  -- No downward drop, no single-digit crash, on any radar axis or the composite.
  SELECT count(*) INTO bad FROM (
    SELECT composite_score, speed, agility, stamina, technical, cognitive,
           lag(composite_score) OVER w AS p_c, lag(speed) OVER w AS p_sp,
           lag(agility) OVER w AS p_ag, lag(stamina) OVER w AS p_st,
           lag(technical) OVER w AS p_te, lag(cognitive) OVER w AS p_co
    FROM public.performance_logs WHERE athlete_id = app_ath
    WINDOW w AS (ORDER BY created_at)
  ) s
  WHERE composite_score < 10
     OR composite_score < p_c OR speed < p_sp OR agility < p_ag
     OR stamina < p_st OR technical < p_te OR cognitive < p_co;
  IF bad > 0 THEN
    RAISE EXCEPTION 'seed check: % session(s) regress or crash on the Road to Mastery curve', bad;
  END IF;

  -- Sprint never regresses.
  SELECT count(*) INTO bad FROM (
    SELECT value_numeric, lag(value_numeric) OVER (ORDER BY measured_at) AS prev
    FROM metric_value
    WHERE sport_profile_id = '77000006-0000-4000-8000-000000000001'
      AND metric_code = 'SPEED_30M_SPRINT_S'
  ) s WHERE value_numeric > prev;
  IF bad > 0 THEN
    RAISE EXCEPTION 'seed check: % sprint reading(s) got slower', bad;
  END IF;

  -- Endpoints match the pitch script.
  SELECT min(composite_score) FILTER (WHERE created_at = (SELECT min(created_at) FROM public.performance_logs WHERE athlete_id = app_ath)),
         max(composite_score) FILTER (WHERE created_at = (SELECT max(created_at) FROM public.performance_logs WHERE athlete_id = app_ath))
    INTO first_c, last_c
  FROM public.performance_logs WHERE athlete_id = app_ath;
  IF (first_c, last_c) IS DISTINCT FROM (28.5, 74.2) THEN
    RAISE EXCEPTION 'seed check: composite runs %..%, expected 28.5..74.2', first_c, last_c;
  END IF;

  SELECT speed, agility, stamina, technical, cognitive INTO r
  FROM public.performance_logs WHERE athlete_id = app_ath ORDER BY created_at DESC LIMIT 1;
  IF (r.speed, r.agility, r.stamina, r.technical, r.cognitive)
     IS DISTINCT FROM (78::double precision, 72::double precision, 68::double precision,
                       75::double precision, 64::double precision) THEN
    RAISE EXCEPTION 'seed check: final radar is %/%/%/%/%, expected 78/72/68/75/64',
      r.speed, r.agility, r.stamina, r.technical, r.cognitive;
  END IF;

  -- Zero cross-sport leakage inside the TTA tenant.
  SELECT count(*) INTO bad FROM public.performance_logs
  WHERE tenant_id = '77000001-0000-4000-8000-000000000001'
    AND raw_payload ->> 'sport' IS DISTINCT FROM 'football';
  IF bad > 0 THEN
    RAISE EXCEPTION 'seed check: % non-football telemetry row(s) inside tenant TTA-001', bad;
  END IF;

  SELECT count(*) INTO bad FROM athlete
  WHERE athlete_id::text LIKE '77000005-%' AND primary_sport_code <> 'football';
  IF bad > 0 THEN
    RAISE EXCEPTION 'seed check: % TTA roster athlete(s) not on football', bad;
  END IF;
END $$;

COMMIT;

-- =====================================================================
-- DEMO HANDLES
--   tenant   (TTA-001) = 77000001-0000-4000-8000-000000000001
--   Brian, app plane   = 77000004-0000-4000-8000-000000000001
--   Brian, passport    = 77000005-0000-4000-8000-000000000001  (ATH-001)
--
--   SELECT * FROM athlete_passport_longitudinal('77000005-0000-4000-8000-000000000001');
--   GET /api/v1/athletes/passport?athlete_id=77000005-0000-4000-8000-000000000001
--   POST /api/v1/telemetry/ingest  { tenantId: <tenant>, athleteId: <app plane>,
--                                    sessionId: <any 770000 08 session>, ... }
-- =====================================================================
