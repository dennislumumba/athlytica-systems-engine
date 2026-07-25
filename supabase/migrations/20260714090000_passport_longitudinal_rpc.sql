-- =====================================================================
-- 20260714090000_passport_longitudinal_rpc.sql
--
-- 1. athlete_passport_longitudinal(p_athlete_id uuid)
--    Postgres-side aggregation backing GET /api/v1/athletes/passport.
--    Groups athlete_metrics_log by year x sport, splits metric domains
--    (physical vs tactical) via payload category / metric_code prefix,
--    and computes 3-period trailing rolling averages with window
--    functions. Rides idx_athlete_metrics_log_athlete_time_desc.
--
-- 2. Adds athlete_metrics_log to the supabase_realtime publication so
--    hooks/useParentDashboard.ts receives INSERT events live.
--
-- Strictly additive. Route falls back to in-process aggregation until
-- this migration is applied.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.athlete_passport_longitudinal(p_athlete_id uuid)
RETURNS TABLE (
    year integer,
    sport text,
    sample_count bigint,
    physical_avg numeric,
    tactical_avg numeric,
    physical_rolling_avg numeric,
    tactical_rolling_avg numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH classified AS (
        SELECT
            EXTRACT(YEAR FROM aml.metric_timestamp)::int AS metric_year,
            lower(COALESCE(
                NULLIF(trim(aml.metric_payload ->> 'sport'), ''),
                NULLIF(trim(aml.metric_payload -> 'metrics' ->> 'sport'), ''),
                'unclassified'
            )) AS metric_sport,
            CASE
                WHEN lower(aml.metric_payload ->> 'category') IN ('physical', 'tactical')
                    THEN lower(aml.metric_payload ->> 'category')
                WHEN upper(aml.metric_code) ~ '^(PHY|SPEED|AGILITY|STAMINA|STRENGTH|POWER|BIO|SIZE|SKATE_SIZE|PROTECTIVE_KIT_SIZE)'
                    THEN 'physical'
                WHEN upper(aml.metric_code) ~ '^(TAC|COG|GAME_IQ|DECISION|TECH|IQ)'
                    THEN 'tactical'
                ELSE 'other'
            END AS metric_domain,
            CASE
                WHEN jsonb_typeof(aml.metric_payload -> 'value') = 'number'
                    THEN (aml.metric_payload ->> 'value')::numeric
                ELSE (
                    SELECT avg(v.value::numeric)
                    FROM jsonb_each(
                        CASE
                            WHEN jsonb_typeof(aml.metric_payload -> 'metrics') = 'object'
                                THEN aml.metric_payload -> 'metrics'
                            ELSE aml.metric_payload
                        END
                    ) AS v(key, value)
                    WHERE jsonb_typeof(v.value) = 'number'
                )
            END AS metric_value
        FROM public.athlete_metrics_log aml
        WHERE aml.athlete_id = p_athlete_id
    ),
    yearly AS (
        SELECT
            metric_year,
            metric_sport,
            count(*) AS sample_count,
            round(avg(metric_value) FILTER (
                WHERE metric_domain = 'physical' AND metric_value IS NOT NULL), 2) AS physical_avg,
            round(avg(metric_value) FILTER (
                WHERE metric_domain = 'tactical' AND metric_value IS NOT NULL), 2) AS tactical_avg
        FROM classified
        GROUP BY metric_year, metric_sport
    )
    SELECT
        metric_year AS year,
        metric_sport AS sport,
        sample_count,
        physical_avg,
        tactical_avg,
        round(avg(physical_avg) OVER (
            PARTITION BY metric_sport ORDER BY metric_year
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS physical_rolling_avg,
        round(avg(tactical_avg) OVER (
            PARTITION BY metric_sport ORDER BY metric_year
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS tactical_rolling_avg
    FROM yearly
    ORDER BY metric_sport, metric_year;
$$;

REVOKE ALL ON FUNCTION public.athlete_passport_longitudinal(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.athlete_passport_longitudinal(uuid) TO authenticated, service_role;

-- Realtime feed for the Parent Portal (useParentDashboard.ts).
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.athlete_metrics_log;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END
$$;
