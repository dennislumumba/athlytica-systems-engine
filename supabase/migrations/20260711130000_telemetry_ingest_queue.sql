-- =====================================================================
-- TELEMETRY INGEST QUEUE — durable async spine for the Edge Function
-- Ingest API appends a job here (202), telemetry-processor consumes it.
-- Postgres is the queue: a crashed invocation never loses a payload,
-- and the sweep query below re-arms anything stuck.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.telemetry_ingest_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','processing','done','failed')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  tenant_id      UUID NOT NULL REFERENCES public.tenants(id),
  athlete_id     UUID NOT NULL REFERENCES public.athletes(id),
  session_id     UUID NOT NULL REFERENCES public.sessions(id),
  stream_type    TEXT NOT NULL CHECK (stream_type IN
                   ('JSON_COORDINATES','CSV_SENSOR','IMU_PACKET','COACH_INTEL')),
  payload        JSONB NOT NULL,
  ingest_hash    CHAR(64) NOT NULL UNIQUE,   -- idempotency: duplicate submissions collapse here
  venue_verified BOOLEAN NOT NULL DEFAULT false,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_tiq_status_created
  ON public.telemetry_ingest_queue (status, created_at);

-- Stuck-job sweep (schedule via pg_cron every 5 min, or run manually):
--   UPDATE public.telemetry_ingest_queue
--   SET status = 'queued', attempts = attempts + 1
--   WHERE status = 'processing'
--     AND processed_at IS NULL
--     AND created_at < now() - interval '5 minutes'
--     AND attempts < 5;

-- Realtime feed for dashboard hydration (performance_logs INSERTs push
-- straight to the athlete profile view via supabase-js channels).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = 'performance_logs'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_logs;
    END IF;
  END IF;
END $$;
