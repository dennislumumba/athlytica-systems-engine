-- RLS policies for cohort_telemetry and scouting_metric_log
-- SEC-001: enforce row-level access control for aggregated cohort telemetry and athlete-specific scouting metrics.

BEGIN;

-- Cohort telemetry is aggregated analytics data; authenticated users may read it through RLS-aware requests.
ALTER TABLE IF EXISTS public.cohort_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS allow_authenticated_select_on_cohort_telemetry
  ON public.cohort_telemetry
  FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.uid() IS NOT NULL);

-- Scouting metric logs are athlete-specific and must be constrained to the authenticated athlete.
ALTER TABLE IF EXISTS public.scouting_metric_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS allow_owner_insert_on_scouting_metric_log
  ON public.scouting_metric_log
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = athlete_id::text
  );

CREATE POLICY IF NOT EXISTS allow_owner_select_on_scouting_metric_log
  ON public.scouting_metric_log
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = athlete_id::text
  );

CREATE POLICY IF NOT EXISTS allow_owner_update_on_scouting_metric_log
  ON public.scouting_metric_log
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = athlete_id::text
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND auth.uid() = athlete_id::text
  );

CREATE POLICY IF NOT EXISTS allow_owner_delete_on_scouting_metric_log
  ON public.scouting_metric_log
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND auth.uid() = athlete_id::text
  );

COMMIT;
