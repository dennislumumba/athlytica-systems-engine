-- =====================================================================
-- SEED: TTA Elite Prospect — Jabari "Jabs" Ochieng
-- Target: Athlytica HQ live demo (project qxfrypvevjsyzkquewxh)
-- Plane:  passport (athlete / sport_profile / metric_value / ...)
--
-- Re-runnable: fixed UUIDs + a DELETE guard on the athlete row (cascades
-- to profile, metrics, biometrics, performance). Run as service_role /
-- psql — every table below has RLS enabled.
--
-- ASSUMPTIONS (not supplied in the brief):
--   * date_of_birth 2008-03-11 — NOT NULL and required for U19 age-band
--     logic. Change here if the real DOB differs.
--   * Athlete is 18 at intake, so no guardian_contact / minor-consent row.
--   * Secondary position (CAM) is stored as a metric_value, since
--     sport_profile carries one role_position per discipline.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. TAXONOMY (football is not yet registered; only ice_hockey was)
-- ---------------------------------------------------------------------
INSERT INTO sport_taxonomy (sport_code, display_name) VALUES
  ('football', 'Football (Soccer)')
ON CONFLICT (sport_code) DO NOTHING;

INSERT INTO discipline_taxonomy (sport_code, discipline_code, display_name) VALUES
  ('football', 'eleven_a_side', '11-a-side')
ON CONFLICT (sport_code, discipline_code) DO NOTHING;

INSERT INTO metric_registry (metric_code, sport_code, discipline_code, display_name, unit, data_type) VALUES
  -- combine / S&C battery
  ('SPEED_10M_SPRINT_S',        'football', NULL, '10m Acceleration Sprint',        's',       'numeric'),
  ('SPEED_30M_SPRINT_S',        'football', NULL, '30m Max Velocity Sprint',        's',       'numeric'),
  ('POWER_CMJ_CM',              'football', NULL, 'Countermovement Jump',           'cm',      'numeric'),
  ('STAMINA_YYIR1_M',           'football', NULL, 'Yo-Yo IR1 Distance',             'm',       'numeric'),
  ('STAMINA_YYIR1_LEVEL',       'football', NULL, 'Yo-Yo IR1 Level',                'level',   'numeric'),
  ('STAMINA_MAS_MS',            'football', NULL, 'Max Aerobic Speed',              'm/s',     'numeric'),
  -- match telemetry
  ('PHY_MATCH_MINUTES',         'football', NULL, 'Minutes Played',                 'min',     'numeric'),
  ('PHY_GPS_SESSION_LOAD_AU',   'football', NULL, 'GPS Session Load',               'AU',      'numeric'),
  ('PHY_DISTANCE_TOTAL_M',      'football', NULL, 'Total Distance Covered',         'm',       'numeric'),
  ('PHY_HSR_DISTANCE_M',        'football', NULL, 'High-Speed Running Distance',    'm',       'numeric'),
  ('TAC_MATCH_RATING',          'football', NULL, 'Match Tactical Rating',          '/10',     'numeric'),
  ('TAC_POSITION_SECONDARY',    'football', NULL, 'Secondary Position',             'code',    'text'),
  ('VEO_CLIP_TAG',              'football', NULL, 'Veo Timestamp Tag',              'tag',     'text'),
  -- recruitment / academic (NCAA eligibility file)
  ('ACAD_NCAA_CORE_GPA',        'football', NULL, 'NCAA Core GPA Equivalent',       '/4.0',    'numeric'),
  ('ACAD_NCAA_ELIGIBILITY',     'football', NULL, 'NCAA Eligibility Center Status', 'status',  'text'),
  ('ACAD_IGCSE_SUBJECT_GRADE',  'football', NULL, 'Cambridge IGCSE Subject Grade',  'grade',   'text'),
  ('ACAD_SAT_ACT_STATUS',       'football', NULL, 'SAT/ACT Test Status',            'status',  'text')
ON CONFLICT (metric_code) DO NOTHING;

-- ---------------------------------------------------------------------
-- 1. PROVENANCE — every domain row below hangs off one of these four
-- ---------------------------------------------------------------------
INSERT INTO provenance (
  provenance_id, data_source, entered_by_actor_id, entered_by_actor_role,
  entered_at, verified_by_actor_id, verified_by_org, verified_at,
  verification_method, verification_status, confidence_score
) VALUES
  -- identity
  ('11111111-1111-4111-8111-111111111111', 'club_official',
   '0c0a0c00-1111-4111-8111-000000000001', 'club_admin', '2026-04-10T09:00:00Z',
   '0d1e0000-1111-4111-8111-000000000002', 'TTA Academy', '2026-04-12T09:00:00Z',
   'document_check', 'verified', 0.95),
  -- combine testing + biometrics (Coach Kimani / S&C Performance Lead)
  ('22222222-2222-4222-8222-222222222222', 'club_official',
   '0c0a0c00-1111-4111-8111-000000000001', 'club_admin', '2026-04-15T07:30:00Z',
   '0d1e0000-1111-4111-8111-000000000002', 'TTA Academy', '2026-07-21T09:00:00Z',
   'witness_corroboration', 'verified', 0.92),
  -- match + Veo footage (hash-anchored video evidence)
  ('33333333-3333-4333-8333-333333333333', 'video_verified',
   '0c0a0c00-1111-4111-8111-000000000001', 'club_admin', '2026-07-18T18:00:00Z',
   '0d1e0000-1111-4111-8111-000000000002', 'TTA Academy', '2026-07-19T10:00:00Z',
   'hash_anchor_confirmation', 'verified', 0.98),
  -- academic record (IGCSE / NCAA Eligibility Center)
  ('44444444-4444-4444-8444-444444444444', 'club_official',
   '0d1e0000-1111-4111-8111-000000000002', 'club_admin', '2026-07-22T09:00:00Z',
   '0d1e0000-1111-4111-8111-000000000002', 'Sunrise Virtual School / TTA Partnership', '2026-07-22T09:00:00Z',
   'document_check', 'verified', 0.90)
ON CONFLICT (provenance_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. ORG ENTITIES
-- ---------------------------------------------------------------------
INSERT INTO federation (federation_id, name, country_code, sport_code) VALUES
  ('99999999-1111-4111-8111-999999999999', 'Football Kenya Federation', 'KEN', 'football')
ON CONFLICT (federation_id) DO NOTHING;

INSERT INTO club (club_id, name, federation_id, country_code, is_training_club) VALUES
  ('ffffffff-1111-4111-8111-ffffffffffff', 'TTA Academy (Student Athlete Program)',
   '99999999-1111-4111-8111-999999999999', 'KEN', true)
ON CONFLICT (club_id) DO NOTHING;

INSERT INTO competition_event (competition_event_id, name, competition_level, sport_code, event_date, location_country_code) VALUES
  ('dddddddd-1111-4111-8111-dddddddddddd', 'TTA U19 vs FKF Nairobi Regional Select',
   'regional', 'football', '2026-07-18', 'KEN')
ON CONFLICT (competition_event_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 3. ATHLETE (delete guard makes the whole seed re-runnable)
-- ---------------------------------------------------------------------
DELETE FROM athlete WHERE athlete_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

INSERT INTO athlete (
  athlete_id, legal_name, preferred_name, date_of_birth, sex_at_birth,
  nationalities, current_status, primary_sport_code, provenance_id
) VALUES (
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Jabari Ochieng', 'Jabs',
  '2008-03-11', 'male', '{KEN}', 'active', 'football',
  '11111111-1111-4111-8111-111111111111'
);

INSERT INTO athlete_sports (athlete_id, sport_code, discipline_code) VALUES
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'football', 'eleven_a_side')
ON CONFLICT DO NOTHING;

INSERT INTO athlete_coaches (athlete_id, coach_id, role_label) VALUES
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'coach_kimani', 'S&C Performance Lead')
ON CONFLICT DO NOTHING;

INSERT INTO sport_profile (
  sport_profile_id, athlete_id, sport_code, discipline_code,
  role_position, dominant_side, provenance_id
) VALUES (
  'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'football', 'eleven_a_side', 'RW/RWB', 'right',
  '11111111-1111-4111-8111-111111111111'
);

-- Custody row: TTA is a training club, so the FIFA solidarity view has input.
INSERT INTO custody_record (
  athlete_id, club_id, federation_id, registration_type,
  start_date, is_training_club_flag, provenance_id
) VALUES (
  'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'ffffffff-1111-4111-8111-ffffffffffff',
  '99999999-1111-4111-8111-999999999999', 'amateur',
  '2026-04-15', true, '11111111-1111-4111-8111-111111111111'
);

-- ---------------------------------------------------------------------
-- 4. BIOMETRICS (178 cm / 71 kg at the July benchmark)
-- ---------------------------------------------------------------------
INSERT INTO biometric_record (
  record_id, athlete_id, measured_at, age_at_measurement_years,
  height_cm, weight_kg, measurement_method, examiner_id, provenance_id
) VALUES (
  'cccccccc-1111-4111-8111-cccccccccccc', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  '2026-07-20', 18.36, 178.00, 71.00, 'club_medical_staff',
  '0c0a0c00-1111-4111-8111-000000000001', '22222222-2222-4222-8222-222222222222'
);

-- ---------------------------------------------------------------------
-- 5. LONGITUDINAL COMBINE TELEMETRY — 3 windows, the "slope"
-- ---------------------------------------------------------------------
INSERT INTO metric_value (sport_profile_id, metric_code, value_numeric, measured_at, context, provenance_id)
SELECT 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', code, val, ts, 'combine_test',
       '22222222-2222-4222-8222-222222222222'
FROM (VALUES
  -- Window 1: 2026-04-15 baseline (post-Easter intake)
  ('SPEED_10M_SPRINT_S',  1.76,  TIMESTAMPTZ '2026-04-15T07:30:00Z'),
  ('SPEED_30M_SPRINT_S',  4.12,  TIMESTAMPTZ '2026-04-15T07:30:00Z'),
  ('POWER_CMJ_CM',       56.50,  TIMESTAMPTZ '2026-04-15T07:30:00Z'),
  ('STAMINA_YYIR1_M',  1840.00,  TIMESTAMPTZ '2026-04-15T07:30:00Z'),
  ('STAMINA_YYIR1_LEVEL', 18.3,  TIMESTAMPTZ '2026-04-15T07:30:00Z'),
  ('STAMINA_MAS_MS',      4.20,  TIMESTAMPTZ '2026-04-15T07:30:00Z'),
  -- Window 2: 2026-06-02 mid-term S&C evaluation
  ('SPEED_10M_SPRINT_S',  1.71,  TIMESTAMPTZ '2026-06-02T07:30:00Z'),
  ('SPEED_30M_SPRINT_S',  4.02,  TIMESTAMPTZ '2026-06-02T07:30:00Z'),
  ('POWER_CMJ_CM',       59.20,  TIMESTAMPTZ '2026-06-02T07:30:00Z'),
  ('STAMINA_YYIR1_M',  2080.00,  TIMESTAMPTZ '2026-06-02T07:30:00Z'),
  ('STAMINA_YYIR1_LEVEL', 19.1,  TIMESTAMPTZ '2026-06-02T07:30:00Z'),
  ('STAMINA_MAS_MS',      4.40,  TIMESTAMPTZ '2026-06-02T07:30:00Z'),
  -- Window 3: 2026-07-20 pre-September showcase benchmark (YYIR1 at D1 line)
  ('SPEED_10M_SPRINT_S',  1.66,  TIMESTAMPTZ '2026-07-20T07:30:00Z'),
  ('SPEED_30M_SPRINT_S',  3.94,  TIMESTAMPTZ '2026-07-20T07:30:00Z'),
  ('POWER_CMJ_CM',       62.80,  TIMESTAMPTZ '2026-07-20T07:30:00Z'),
  ('STAMINA_YYIR1_M',  2280.00,  TIMESTAMPTZ '2026-07-20T07:30:00Z'),
  ('STAMINA_YYIR1_LEVEL', 19.6,  TIMESTAMPTZ '2026-07-20T07:30:00Z'),
  ('STAMINA_MAS_MS',      4.60,  TIMESTAMPTZ '2026-07-20T07:30:00Z')
) AS t(code, val, ts);

-- Secondary position (sport_profile.role_position holds the primary only)
INSERT INTO metric_value (sport_profile_id, metric_code, value_text, measured_at, provenance_id) VALUES
  ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'TAC_POSITION_SECONDARY', 'CAM',
   '2026-04-15T07:30:00Z', '11111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------
-- 6. MATCH PERFORMANCE + VEO CLIPS
-- ---------------------------------------------------------------------
INSERT INTO performance_record (
  performance_record_id, athlete_id, competition_event_id, sport_code,
  discipline_code, video_evidence_hash, provenance_id
) VALUES (
  'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
  'dddddddd-1111-4111-8111-dddddddddddd', 'football', 'eleven_a_side',
  encode(sha256('veo://TTA-U19-vs-FKF-NAIROBI-REGIONAL-SELECT-2026-07-18'::bytea), 'hex'),
  '33333333-3333-4333-8333-333333333333'
);

INSERT INTO metric_value (performance_record_id, metric_code, value_numeric, measured_at, context, provenance_id)
SELECT 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', code, val,
       TIMESTAMPTZ '2026-07-18T17:00:00Z', 'in_competition',
       '33333333-3333-4333-8333-333333333333'
FROM (VALUES
  ('PHY_MATCH_MINUTES',        85.0),
  ('PHY_GPS_SESSION_LOAD_AU', 785.0),
  ('PHY_DISTANCE_TOTAL_M',  10400.0),
  ('PHY_HSR_DISTANCE_M',     1120.0),
  ('TAC_MATCH_RATING',          8.5)
) AS t(code, val);

INSERT INTO metric_value (performance_record_id, metric_code, value_text, measured_at, context, provenance_id)
SELECT 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee', 'VEO_CLIP_TAG', tag,
       TIMESTAMPTZ '2026-07-18T17:00:00Z', 'in_competition',
       '33333333-3333-4333-8333-333333333333'
FROM (VALUES
  ('[14:22] Explosive transition & overlapping run (high-speed recovery)'),
  ('[38:10] 1v1 defensive interception & 40-yard line-breaking counter pass'),
  ('[67:45] Goal contribution: cutback assist under pressure (weak-foot execution)')
) AS t(tag);

-- ---------------------------------------------------------------------
-- 7. ACADEMIC / NCAA ELIGIBILITY FILE
--    context is NULL — none of the four allowed contexts describe academics.
-- ---------------------------------------------------------------------
INSERT INTO metric_value (sport_profile_id, metric_code, value_numeric, measured_at, provenance_id) VALUES
  ('bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', 'ACAD_NCAA_CORE_GPA', 3.65,
   '2026-07-22T09:00:00Z', '44444444-4444-4444-8444-444444444444');

INSERT INTO metric_value (sport_profile_id, metric_code, value_text, measured_at, provenance_id)
SELECT 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', code, txt,
       TIMESTAMPTZ '2026-07-22T09:00:00Z', '44444444-4444-4444-8444-444444444444'
FROM (VALUES
  ('ACAD_IGCSE_SUBJECT_GRADE', 'English Language: A'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Mathematics: B'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Physics: B'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Physical Education: A*'),
  ('ACAD_IGCSE_SUBJECT_GRADE', 'Business Studies: A'),
  ('ACAD_NCAA_ELIGIBILITY',    'Provisional Eligibility Verified (academic criteria met)'),
  ('ACAD_SAT_ACT_STATUS',      'Scheduled — October 2026 test window')
) AS t(code, txt);

-- ---------------------------------------------------------------------
-- 8. DASHBOARD FEED — athlete_metrics_log
--    Drives athlete_passport_longitudinal() + the realtime parent portal.
--    Values are normalized 1..100 composites (mixing raw seconds with raw
--    metres would make the RPC's domain averages meaningless).
-- ---------------------------------------------------------------------
INSERT INTO athlete_metrics_log (athlete_id, metric_code, metric_timestamp, metric_payload) VALUES
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'PHY_COMPOSITE', '2026-04-15T07:30:00Z',
   '{"sport":"football","category":"physical","value":71.5,"window":"baseline",
     "raw":{"sprint_10m_s":1.76,"sprint_30m_s":4.12,"cmj_cm":56.5,"yyir1_m":1840,"mas_ms":4.2}}'::jsonb),
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'PHY_COMPOSITE', '2026-06-02T07:30:00Z',
   '{"sport":"football","category":"physical","value":78.2,"window":"mid_term",
     "raw":{"sprint_10m_s":1.71,"sprint_30m_s":4.02,"cmj_cm":59.2,"yyir1_m":2080,"mas_ms":4.4}}'::jsonb),
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'PHY_COMPOSITE', '2026-07-20T07:30:00Z',
   '{"sport":"football","category":"physical","value":85.4,"window":"showcase_benchmark",
     "raw":{"sprint_10m_s":1.66,"sprint_30m_s":3.94,"cmj_cm":62.8,"yyir1_m":2280,"mas_ms":4.6}}'::jsonb),
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'TAC_COMPOSITE', '2026-07-18T17:00:00Z',
   '{"sport":"football","category":"tactical","value":85.0,
     "raw":{"match_rating":8.5,"minutes":85,"gps_load_au":785,"distance_m":10400,"hsr_m":1120},
     "opponent":"FKF Nairobi Regional Select","coach":"Coach Kimani"}'::jsonb),

  -- Scout export configuration. No dedicated table exists; this row is the
  -- record of the share grant (no numeric value => excluded from averages).
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'SCOUT_EXPORT_CONFIG', '2026-07-27T00:00:00Z',
   '{"sport":"football","category":"other",
     "export_profile_name":"TTA-PROSPECT-JABARI-OCHIENG-2026",
     "target_program":"TTA Student Athlete Program — September 2026 Intake (U19 Pro-Dev)",
     "recruitment_pathway":"SRUSA / NCAA Division I & NAIA",
     "permissions":{"telemetry":true,"academic_record":true,"veo_clips":true},
     "verification_badge":{"active":true,"attributed_to":"TTA Academy Director",
                           "verified_by_actor_id":"0d1e0000-1111-4111-8111-000000000002"},
     "issued_at":"2026-07-27T00:00:00Z","expires_at":"2026-10-25T00:00:00Z","ttl_days":90}'::jsonb);

-- ---------------------------------------------------------------------
-- CHECK — fails the transaction if any slice did not land.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  aid CONSTANT uuid := 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
  n_combine int; n_match int; n_acad int; n_log int; n_bio int;
BEGIN
  SELECT count(*) INTO n_combine FROM metric_value
    WHERE sport_profile_id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb' AND context = 'combine_test';
  SELECT count(*) INTO n_match FROM metric_value
    WHERE performance_record_id = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
  SELECT count(*) INTO n_acad FROM metric_value
    WHERE sport_profile_id = 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb' AND metric_code LIKE 'ACAD/_%' ESCAPE '/';
  SELECT count(*) INTO n_log FROM athlete_metrics_log WHERE athlete_id = aid;
  SELECT count(*) INTO n_bio FROM biometric_record WHERE athlete_id = aid;

  IF (n_combine, n_match, n_acad, n_log, n_bio) IS DISTINCT FROM (18, 8, 8, 5, 1) THEN
    RAISE EXCEPTION 'seed check failed: combine=% match=% acad=% log=% bio=% (expected 18/8/8/5/1)',
      n_combine, n_match, n_acad, n_log, n_bio;
  END IF;
END $$;

COMMIT;

-- Demo handles:
--   athlete_id = aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa
--   GET /api/v1/athletes/passport?athlete_id=aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa
--   SELECT * FROM athlete_passport_longitudinal('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa');
