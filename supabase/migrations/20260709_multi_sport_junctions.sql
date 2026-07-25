CREATE TABLE IF NOT EXISTS public.athlete_sports (
    athlete_sport_id BIGSERIAL PRIMARY KEY,
    athlete_id UUID NOT NULL REFERENCES public.athlete(athlete_id) ON DELETE CASCADE,
    sport_code TEXT NOT NULL,
    discipline_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (athlete_id, sport_code, discipline_code)
);

CREATE INDEX IF NOT EXISTS idx_athlete_sports_athlete_id
    ON public.athlete_sports (athlete_id);

CREATE INDEX IF NOT EXISTS idx_athlete_sports_sport_code
    ON public.athlete_sports (sport_code);

CREATE TABLE IF NOT EXISTS public.athlete_coaches (
    athlete_coach_id BIGSERIAL PRIMARY KEY,
    athlete_id UUID NOT NULL REFERENCES public.athlete(athlete_id) ON DELETE CASCADE,
    coach_id TEXT NOT NULL,
    role_label TEXT DEFAULT 'coach',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (athlete_id, coach_id)
);

CREATE INDEX IF NOT EXISTS idx_athlete_coaches_athlete_id
    ON public.athlete_coaches (athlete_id);

CREATE INDEX IF NOT EXISTS idx_athlete_coaches_coach_id
    ON public.athlete_coaches (coach_id);

CREATE TABLE IF NOT EXISTS public.athlete_metrics_log (
    metric_log_id BIGSERIAL PRIMARY KEY,
    athlete_id UUID NOT NULL REFERENCES public.athlete(athlete_id) ON DELETE CASCADE,
    metric_code TEXT NOT NULL,
    metric_timestamp TIMESTAMPTZ NOT NULL,
    metric_payload JSONB NOT NULL,
    metric_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_athlete_metrics_log_athlete_time_desc
    ON public.athlete_metrics_log (athlete_id, metric_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_athlete_metrics_log_metric_code
    ON public.athlete_metrics_log (metric_code);
