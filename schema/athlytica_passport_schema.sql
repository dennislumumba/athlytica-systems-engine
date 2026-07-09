-- =====================================================================
-- ATHLYTICA SCOUTING PASSPORT — RELATIONAL BACKING (PostgreSQL 15+)
-- Backs Academy / Federation / Insurer / League enterprise tiers.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid(); required before any table/trigger below

-- ENUM TYPES
CREATE TYPE verification_status AS ENUM ('unverified','pending','verified','disputed','revoked');
CREATE TYPE data_source_type AS ENUM (
  'self_reported','club_official','federation_official','independent_clinic',
  'agent_submission','witness_attestation','video_verified',
  'insurer_medical_exam','government_id_registry'
);
CREATE TYPE verification_method_type AS ENUM (
  'document_check','biometric_lab_cross_reference','witness_corroboration',
  'federation_registry_match','hash_anchor_confirmation','government_id_check','none'
);
CREATE TYPE actor_role_type AS ENUM (
  'club_admin','federation_admin','agent','clinician','athlete',
  'guardian','athlytica_ops','insurer_underwriter'
);
CREATE TYPE registration_type_enum AS ENUM (
  'first_registration','amateur','professional','loan','transfer_permanent','transfer_temporary'
);
CREATE TYPE age_band_enum AS ENUM ('under_12_ineligible','12_15','16_23','over_23_ineligible');
CREATE TYPE injury_severity_enum AS ENUM ('minor','moderate','severe','career_threatening');
CREATE TYPE claim_type_enum AS ENUM ('first_contact','representation_agreement','negotiation_mandate','termination');
CREATE TYPE dispute_status_enum AS ENUM ('none','contested','resolved_upheld','resolved_overturned');
CREATE TYPE bone_age_method_enum AS ENUM ('greulich_pyle','tw3','tw2','other');

-- PROVENANCE (shared, referenced by FK from every domain table)
CREATE TABLE provenance (
  provenance_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source             data_source_type NOT NULL,
  entered_by_actor_id     UUID NOT NULL,
  entered_by_actor_role   actor_role_type NOT NULL,
  entered_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by_actor_id    UUID,
  verified_by_org         TEXT,
  verified_at             TIMESTAMPTZ,
  verification_method     verification_method_type NOT NULL DEFAULT 'none',
  verification_status     verification_status NOT NULL DEFAULT 'unverified',
  confidence_score        NUMERIC(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  source_document_hash    CHAR(64),
  witness_ids             UUID[] DEFAULT '{}'
);
CREATE INDEX idx_provenance_status ON provenance (verification_status);

-- TAXONOMY / EXTENSIBILITY BACKBONE
-- Adding a new sport (e.g. NRHL inline hockey) = INSERT rows here. No DDL change, no JSON Schema version bump.
CREATE TABLE sport_taxonomy (
  sport_code       TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discipline_taxonomy (
  discipline_code  TEXT NOT NULL,
  sport_code       TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  display_name     TEXT NOT NULL,
  PRIMARY KEY (sport_code, discipline_code)
);

CREATE TABLE metric_registry (
  metric_code      TEXT PRIMARY KEY,
  sport_code       TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  discipline_code  TEXT,
  display_name     TEXT NOT NULL,
  unit             TEXT NOT NULL,
  data_type        TEXT NOT NULL DEFAULT 'numeric' CHECK (data_type IN ('numeric','integer','boolean','text')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_discipline FOREIGN KEY (sport_code, discipline_code)
    REFERENCES discipline_taxonomy(sport_code, discipline_code) DEFERRABLE INITIALLY DEFERRED
);
-- metric_code values are validated against this registry at ingestion time, not against a hard JSON Schema enum.

-- ORG ENTITIES
CREATE TABLE federation (
  federation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  country_code     CHAR(3),
  sport_code       TEXT REFERENCES sport_taxonomy(sport_code)
);

CREATE TABLE club (
  club_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  federation_id    UUID REFERENCES federation(federation_id),
  country_code     CHAR(3),
  is_training_club BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE agency (
  agency_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  fifa_licence_ref TEXT
);

CREATE TABLE agent (
  agent_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID REFERENCES agency(agency_id),
  legal_name       TEXT NOT NULL,
  fifa_licence_ref TEXT
);

-- ATHLETE CORE (PII-dense — see Section 5 compliance flags)
CREATE TABLE athlete (
  athlete_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name             TEXT NOT NULL,
  preferred_name         TEXT,
  date_of_birth          DATE NOT NULL,
  sex_at_birth           TEXT CHECK (sex_at_birth IN ('male','female','intersex','undisclosed')),
  nationalities          CHAR(3)[] DEFAULT '{}',
  national_id_hash       CHAR(64),
  current_status         TEXT NOT NULL DEFAULT 'active'
                            CHECK (current_status IN ('active','inactive','retired','suspended','deceased')),
  primary_sport_code     TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  provenance_id          UUID NOT NULL REFERENCES provenance(provenance_id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_athlete_dob ON athlete (date_of_birth);
CREATE INDEX idx_athlete_sport ON athlete (primary_sport_code);

CREATE TABLE guardian_contact (
  guardian_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  legal_name       TEXT NOT NULL,
  relationship     TEXT NOT NULL CHECK (relationship IN ('parent','legal_guardian','club_appointed_guardian')),
  contact_info     TEXT,
  consent_on_file  BOOLEAN NOT NULL DEFAULT false,
  consent_date     DATE
  -- NOTE: expand per Section 5 consent architecture (consent_scope, consent_method, tanner_stage-specific
  -- consent, cross_border_transfer_consent, withdrawal tracking) before any real minor's data is stored.
);

-- SPORT PROFILE + METRIC VALUES (EAV pattern, driven by metric_registry)
CREATE TABLE sport_profile (
  sport_profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  sport_code       TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  discipline_code  TEXT,
  role_position    TEXT,
  dominant_side    TEXT CHECK (dominant_side IN ('left','right','ambidextrous')),
  provenance_id    UUID NOT NULL REFERENCES provenance(provenance_id),
  UNIQUE (athlete_id, sport_code, discipline_code)
);

CREATE TABLE metric_value (
  metric_value_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_profile_id UUID REFERENCES sport_profile(sport_profile_id) ON DELETE CASCADE,
  performance_record_id UUID,
  metric_code      TEXT NOT NULL REFERENCES metric_registry(metric_code),
  value_numeric    NUMERIC,
  value_text       TEXT,
  value_boolean    BOOLEAN,
  measured_at      TIMESTAMPTZ NOT NULL,
  context          TEXT CHECK (context IN ('in_competition','combine_test','training_session','medical_exam')),
  provenance_id    UUID NOT NULL REFERENCES provenance(provenance_id),
  CHECK (sport_profile_id IS NOT NULL OR performance_record_id IS NOT NULL)
);
CREATE INDEX idx_metric_value_code ON metric_value (metric_code, measured_at);

-- BIOMETRIC RECORDS (growth curve / bone-age dispute defense)
CREATE TABLE biometric_record (
  record_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id                UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  measured_at                DATE NOT NULL,
  age_at_measurement_years   NUMERIC(4,2) NOT NULL,
  height_cm                  NUMERIC(5,2),
  weight_kg                  NUMERIC(5,2),
  bone_age_estimate_years    NUMERIC(4,2),
  bone_age_method            bone_age_method_enum,
  chronological_bone_age_delta NUMERIC(4,2)
    GENERATED ALWAYS AS (age_at_measurement_years - bone_age_estimate_years) STORED,
  tanner_stage                SMALLINT CHECK (tanner_stage BETWEEN 1 AND 5),  -- SENSITIVE: field-level access control required, not just table-level RLS
  measurement_method          TEXT NOT NULL CHECK (measurement_method IN
    ('self_reported','club_medical_staff','independent_clinic','federation_medical_panel')),
  examiner_id                 UUID,
  provenance_id                UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_biometric_athlete_date ON biometric_record (athlete_id, measured_at);

CREATE VIEW bone_age_dispute_evidence AS
SELECT b.athlete_id, a.legal_name, a.date_of_birth, b.measured_at, b.age_at_measurement_years,
       b.bone_age_estimate_years, b.bone_age_method, b.chronological_bone_age_delta,
       p.verification_status, p.verification_method
FROM biometric_record b
JOIN athlete a ON a.athlete_id = b.athlete_id
JOIN provenance p ON p.provenance_id = b.provenance_id
WHERE p.verification_status = 'verified'
ORDER BY b.athlete_id, b.measured_at;

-- CUSTODY / REGISTRATION HISTORY (FIFA Article 21 / Annex 5 solidarity)
CREATE TABLE transfer_event (
  transfer_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id           UUID NOT NULL REFERENCES athlete(athlete_id),
  transfer_date         DATE NOT NULL,
  transfer_fee_amount   NUMERIC(14,2),
  transfer_fee_currency CHAR(3) DEFAULT 'USD',
  transferring_club_id  UUID REFERENCES club(club_id),
  receiving_club_id     UUID REFERENCES club(club_id),
  provenance_id          UUID NOT NULL REFERENCES provenance(provenance_id)
);

CREATE TABLE custody_record (
  custody_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id            UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  club_id                UUID NOT NULL REFERENCES club(club_id),
  federation_id           UUID REFERENCES federation(federation_id),
  registration_type       registration_type_enum NOT NULL,
  start_date               DATE NOT NULL,
  end_date                 DATE,
  age_at_start_years       NUMERIC(4,2),
  age_band                 age_band_enum,
  is_training_club_flag    BOOLEAN NOT NULL DEFAULT false,
  transfer_id               UUID REFERENCES transfer_event(transfer_id),
  provenance_id              UUID NOT NULL REFERENCES provenance(provenance_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_custody_athlete ON custody_record (athlete_id, start_date);

CREATE OR REPLACE FUNCTION trg_custody_age_band() RETURNS TRIGGER AS $$
DECLARE
  dob DATE;
  age_years NUMERIC;
BEGIN
  SELECT date_of_birth INTO dob FROM athlete WHERE athlete_id = NEW.athlete_id;
  age_years := EXTRACT(YEAR FROM AGE(NEW.start_date, dob))
             + EXTRACT(MONTH FROM AGE(NEW.start_date, dob)) / 12.0;
  NEW.age_at_start_years := ROUND(age_years, 2);
  NEW.age_band := CASE
    WHEN age_years < 12 THEN 'under_12_ineligible'
    WHEN age_years >= 12 AND age_years < 16 THEN '12_15'
    WHEN age_years >= 16 AND age_years <= 23 THEN '16_23'
    ELSE 'over_23_ineligible'
  END::age_band_enum;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custody_age_band_trigger
  BEFORE INSERT OR UPDATE ON custody_record
  FOR EACH ROW EXECUTE FUNCTION trg_custody_age_band();

-- Rate: 0.25%/yr in age_band '12_15', 0.5%/yr in age_band '16_23'.
CREATE VIEW solidarity_claim_input AS
SELECT c.athlete_id, c.club_id, cl.name AS club_name, cl.is_training_club, c.age_band,
       c.start_date, c.end_date,
       GREATEST(0, LEAST(COALESCE(c.end_date, CURRENT_DATE), t.transfer_date) - c.start_date) / 365.25 AS years_in_band,
       CASE c.age_band WHEN '12_15' THEN 0.0025 WHEN '16_23' THEN 0.0050 ELSE 0 END AS annual_rate,
       t.transfer_id, t.transfer_fee_amount, t.transfer_fee_currency, p.verification_status
FROM custody_record c
JOIN club cl ON cl.club_id = c.club_id
JOIN transfer_event t ON t.transfer_id = c.transfer_id
JOIN provenance p ON p.provenance_id = c.provenance_id
WHERE c.is_training_club_flag = true AND c.age_band IN ('12_15','16_23');

-- PERFORMANCE / RESULTS (queryable meet data)
CREATE TABLE competition_event (
  competition_event_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  competition_level       TEXT CHECK (competition_level IN ('club','regional','national','continental','international')),
  sport_code               TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  event_date                DATE NOT NULL,
  location_country_code     CHAR(3)
);

CREATE TABLE performance_record (
  performance_record_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  competition_event_id     UUID REFERENCES competition_event(competition_event_id),
  sport_code                TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  discipline_code            TEXT,
  placement                  INTEGER,
  video_evidence_hash         CHAR(64),
  provenance_id                 UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_perf_athlete ON performance_record (athlete_id);

ALTER TABLE metric_value
  ADD CONSTRAINT fk_metric_value_perf
  FOREIGN KEY (performance_record_id) REFERENCES performance_record(performance_record_id) ON DELETE CASCADE;

-- INJURY / MEDICAL HISTORY (insurer actuarial baseline)
CREATE TABLE injury_record (
  injury_record_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id             UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  injury_date              DATE NOT NULL,
  injury_type                TEXT,
  icd10_code                  TEXT,
  body_region                  TEXT,
  severity                      injury_severity_enum NOT NULL,
  mechanism                      TEXT,
  days_lost                       INTEGER,
  return_to_play_date              DATE,
  recurrence_flag                   BOOLEAN NOT NULL DEFAULT false,
  treating_clinician_id               UUID,
  training_hours_last_4wk              NUMERIC(5,2),
  match_count_last_90d                  INTEGER,
  provenance_id                          UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_injury_athlete ON injury_record (athlete_id, injury_date);

CREATE VIEW actuarial_injury_exposure_summary AS
SELECT a.athlete_id, a.primary_sport_code, a.date_of_birth,
       COUNT(i.injury_record_id) AS total_injuries,
       SUM(CASE WHEN i.severity IN ('severe','career_threatening') THEN 1 ELSE 0 END) AS severe_or_worse_count,
       SUM(i.days_lost) AS total_days_lost,
       AVG(i.training_hours_last_4wk) AS avg_recent_training_load,
       MAX(i.injury_date) AS most_recent_injury_date
FROM athlete a
LEFT JOIN injury_record i ON i.athlete_id = a.athlete_id
GROUP BY a.athlete_id, a.primary_sport_code, a.date_of_birth;

-- REPRESENTATION / AGENT CLAIMS
CREATE TABLE representation_claim (
  claim_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  agent_id                   UUID NOT NULL REFERENCES agent(agent_id),
  agency_id                    UUID REFERENCES agency(agency_id),
  claim_type                     claim_type_enum NOT NULL,
  claimed_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_from                     DATE,
  effective_to                        DATE,
  contract_reference_hash              CHAR(64),
  dispute_status                        dispute_status_enum NOT NULL DEFAULT 'none',
  provenance_id                          UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_representation_athlete_time ON representation_claim (athlete_id, claimed_at);

-- AUDIT LOG (append-only, hash-chained — tamper-evidence backbone; must be created LAST, after all
-- tables it can reference via record_type/record_id)
CREATE TABLE audit_log (
  event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type            TEXT NOT NULL CHECK (event_type IN
    ('record_created','record_updated','record_verified','record_disputed','record_revoked')),
  actor_id                UUID NOT NULL,
  occurred_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_type                 TEXT NOT NULL,
  record_id                     UUID NOT NULL,
  prev_event_hash                 CHAR(64),
  event_hash                        CHAR(64) NOT NULL,
  payload_snapshot                    JSONB
);
CREATE INDEX idx_audit_record ON audit_log (record_type, record_id, occurred_at);
-- No UPDATE/DELETE grants issued on this table in production roles; INSERT-only (must be enforced via
-- REVOKE or a blocking trigger — see Section 9 structural readiness note).
-- event_hash = sha256(prev_event_hash || canonical_json(payload_snapshot)) computed at application layer.
