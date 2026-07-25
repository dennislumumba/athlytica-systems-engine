-- =====================================================================
-- 20260714_sync_monitoring.sql
-- CONVEX BRIDGE — sync failure monitoring + passport serialization prep
--
-- 1. public.sync_dead_letter_queue — durable capture of Convex sync
--    jobs that exhausted the retry policy (3 attempts, exponential
--    backoff) in lib/sync/convexSyncQueue.ts. Raw payload + error code
--    are preserved so no data is ever lost to a transient outage.
--
-- 2. public.athlete.passport_id — canonical 'ATH-YYYY-NNNN' serial
--    consumed by the Convex bridge and normalized by
--    scripts/normalize-legacy-ids.js. Guarded ADD COLUMN: no-op if the
--    column already exists in a given environment.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Dead-letter queue
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.sync_dead_letter_queue (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    record_type  VARCHAR(64) NOT NULL,          -- e.g. 'athlete', 'metric'
    payload      JSONB NOT NULL,                -- full job: document + raw source row
    last_error   TEXT NOT NULL,                 -- '[CODE] message' from the final attempt
    failed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sync_dead_letter_queue IS
    'Convex bridge dead-letter queue: sync jobs that failed all retry attempts. Replay via ops tooling, then delete the row.';

CREATE INDEX IF NOT EXISTS idx_sync_dlq_failed_at
    ON public.sync_dead_letter_queue (failed_at DESC);

CREATE INDEX IF NOT EXISTS idx_sync_dlq_record_type
    ON public.sync_dead_letter_queue (record_type);

-- Service-role writes only. RLS enabled with NO policies = deny-all for
-- anon/authenticated roles (consistent with 20260713110000_sec001_rls_hardening).
ALTER TABLE public.sync_dead_letter_queue ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 2. Passport serial on athlete core (bridge dependency)
-- ---------------------------------------------------------------------

ALTER TABLE public.athlete
    ADD COLUMN IF NOT EXISTS passport_id TEXT;

-- Uniqueness is enforced only for non-null values; legacy rows are
-- backfilled/normalized by scripts/normalize-legacy-ids.js before any
-- NOT NULL constraint is considered.
CREATE UNIQUE INDEX IF NOT EXISTS uq_athlete_passport_id
    ON public.athlete (passport_id)
    WHERE passport_id IS NOT NULL;

COMMENT ON COLUMN public.athlete.passport_id IS
    'Canonical Convex-compatible serial ATH-YYYY-NNNN. Normalized by scripts/normalize-legacy-ids.js.';
