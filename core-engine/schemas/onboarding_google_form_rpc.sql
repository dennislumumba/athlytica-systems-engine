-- =====================================================================
-- GOOGLE FORM ONBOARDING — ATOMIC RPC (PostgreSQL 15+ / Supabase)
-- Backs app/api/v1/onboarding/google-forms/route.ts (Next.js edge route).
--
-- Edge runtime cannot hold a raw TCP connection to Postgres, so there is
-- no client-side BEGIN/COMMIT available to the route handler. Instead,
-- this single plpgsql function performs the tier lookup + provenance +
-- athlete + cohort_session_registry inserts inside one implicit
-- transaction: any exception raised here rolls back every write the
-- function made. The edge route calls it once over HTTPS via
-- supabase.rpc(), using the service-role key.
--
-- Depends on: athlytica_passport_schema.sql (athlete, provenance,
-- sport_taxonomy) and core-engine/big-ice/{big_ice_commercial_override,
-- seed_commercial_tiers}.sql (commercial_price_tier, cohort_session_registry,
-- training_track_type_enum).
-- =====================================================================

-- Idempotency ledger: Google Apps Script / UrlFetch can redeliver the same
-- form response on retry. Without this, a retry would create a second
-- athlete + a second paid enrollment for one real submission.
CREATE TABLE IF NOT EXISTS google_form_submission_log (
  submission_id   TEXT PRIMARY KEY,
  athlete_id      UUID NOT NULL REFERENCES athlete(athlete_id),
  registry_id     UUID NOT NULL REFERENCES cohort_session_registry(registry_id),
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.onboard_athlete_from_google_form(
  p_form_response_id       TEXT,
  p_legal_name             TEXT,
  p_date_of_birth          DATE,
  p_sex_at_birth           TEXT,
  p_nationalities          CHAR(3)[],
  p_primary_sport_code     TEXT,
  p_tier_name              TEXT,
  p_track_type             TEXT,
  p_cohort_label           TEXT,
  p_session_slot           INTEGER,
  p_session_day_of_week    SMALLINT,
  p_window_start_time      TIME,
  p_window_end_time        TIME,
  p_capacity               INTEGER,
  p_season_start_date      DATE,
  p_season_end_date        DATE
)
RETURNS TABLE (
  athlete_id     UUID,
  registry_id    UUID,
  tier_id        UUID,
  price_amount   NUMERIC(12,2),
  currency       CHAR(3),
  was_duplicate  BOOLEAN
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing            google_form_submission_log%ROWTYPE;
  v_athlete_id          UUID := gen_random_uuid();
  v_provenance_id       UUID;
  v_tier_id             UUID;
  v_price_amount        NUMERIC(12,2);
  v_currency            CHAR(3);
  v_registry_id         UUID;
BEGIN
  IF p_form_response_id IS NULL OR length(trim(p_form_response_id)) = 0 THEN
    RAISE EXCEPTION 'MISSING_FORM_RESPONSE_ID' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotency: a redelivered webhook returns the original result instead
  -- of creating a second athlete/enrollment.
  SELECT * INTO v_existing FROM google_form_submission_log WHERE submission_id = p_form_response_id;
  IF FOUND THEN
    SELECT cpt.tier_id, cpt.price_amount, cpt.currency
      INTO v_tier_id, v_price_amount, v_currency
    FROM cohort_session_registry csr
    JOIN commercial_price_tier cpt ON cpt.tier_id = csr.price_tier_id
    WHERE csr.registry_id = v_existing.registry_id;

    RETURN QUERY SELECT v_existing.athlete_id, v_existing.registry_id, v_tier_id, v_price_amount, v_currency, true;
    RETURN;
  END IF;

  -- Row-lock the tier so a concurrent deactivation can't race this enrollment.
  SELECT cpt.tier_id, cpt.price_amount, cpt.currency
    INTO v_tier_id, v_price_amount, v_currency
  FROM commercial_price_tier cpt
  WHERE cpt.tier_name = p_tier_name AND cpt.is_active = true
  FOR UPDATE;

  IF v_tier_id IS NULL THEN
    RAISE EXCEPTION 'UNKNOWN_OR_INACTIVE_TIER: %', p_tier_name USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO provenance (
    data_source, entered_by_actor_id, entered_by_actor_role,
    verification_method, verification_status, source_document_hash
  ) VALUES (
    'self_reported', v_athlete_id, 'athlete',
    'none', 'unverified', encode(sha256(convert_to(p_form_response_id, 'UTF8')), 'hex')
  )
  RETURNING provenance_id INTO v_provenance_id;

  INSERT INTO athlete (
    athlete_id, legal_name, date_of_birth, sex_at_birth,
    nationalities, primary_sport_code, provenance_id
  ) VALUES (
    v_athlete_id, p_legal_name, p_date_of_birth, p_sex_at_birth,
    COALESCE(p_nationalities, '{}'), p_primary_sport_code, v_provenance_id
  );

  INSERT INTO cohort_session_registry (
    track_type, cohort_label, session_slot, session_day_of_week,
    window_start_time, window_end_time, capacity,
    season_start_date, season_end_date, student_athlete_id,
    price_tier_id, enrollment_status
  ) VALUES (
    p_track_type::training_track_type_enum, p_cohort_label, p_session_slot, p_session_day_of_week,
    p_window_start_time, p_window_end_time, p_capacity,
    p_season_start_date, p_season_end_date, v_athlete_id,
    v_tier_id, 'enrolled'
  )
  RETURNING cohort_session_registry.registry_id INTO v_registry_id;

  INSERT INTO google_form_submission_log (submission_id, athlete_id, registry_id)
  VALUES (p_form_response_id, v_athlete_id, v_registry_id);

  RETURN QUERY SELECT v_athlete_id, v_registry_id, v_tier_id, v_price_amount, v_currency, false;
END;
$$;

-- Only the server-side service role (used exclusively by the edge route,
-- never a browser-exposed anon/authenticated session) may invoke this —
-- it bypasses RLS by design to write core identity + billing rows.
--
-- Supabase applies default privileges in the public schema that grant
-- EXECUTE on newly created functions to anon/authenticated directly (not
-- via the PUBLIC pseudo-role), so PostgREST would otherwise expose this
-- as a callable RPC endpoint to any holder of the public anon key. Revoke
-- from those roles by name, not just PUBLIC.
REVOKE ALL ON FUNCTION public.onboard_athlete_from_google_form FROM PUBLIC;
REVOKE ALL ON FUNCTION public.onboard_athlete_from_google_form FROM anon;
REVOKE ALL ON FUNCTION public.onboard_athlete_from_google_form FROM authenticated;
GRANT EXECUTE ON FUNCTION public.onboard_athlete_from_google_form TO service_role;
