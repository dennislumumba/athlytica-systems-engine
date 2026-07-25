-- =====================================================================
-- HERCULES CORE MERGE — Multi-tenant application plane (PostgreSQL 15+)
-- Source of truth for topology: Hercules schema/schema.prisma.txt
-- Strictly ADDITIVE: does not mutate athlete_metrics_log, metric_value,
-- or any existing passport-schema table.
--
-- Identity architecture:
--   public.athletes  = application-plane identity (auth, tenancy, dashboards)
--   public.athlete   = passport-plane identity (provenance, PII, scouting)
--   Bridge: athletes.passport_athlete_id -> athlete(athlete_id), nullable,
--   so app accounts exist before/without a verified passport record.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- USERS (Hercules: role in ADMIN | COACH | ATHLETE)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('ADMIN','COACH','ATHLETE')),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users (tenant_id);

-- ---------------------------------------------------------------------
-- ATHLETES (application plane) + passport bridge
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.athletes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL UNIQUE REFERENCES public.users(id),
  -- ADDITIVE BRIDGE to passport plane (core-engine/schemas/athlytica_passport_schema.sql)
  passport_athlete_id UUID REFERENCES public.athlete(athlete_id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_athletes_passport ON public.athletes (passport_athlete_id);

-- ---------------------------------------------------------------------
-- ATHLETE <-> TENANT authorization boundary
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.athlete_tenant_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_atl_tenant_athlete ON public.athlete_tenant_links (tenant_id, athlete_id);

-- ---------------------------------------------------------------------
-- VENUES (coordinates JSONB = geospatial bounding polygon for ingestion gate)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id),
  coordinates JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_venues_tenant ON public.venues (tenant_id);

-- ---------------------------------------------------------------------
-- SESSIONS
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES public.athletes(id),
  venue_id   UUID NOT NULL REFERENCES public.venues(id),
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time   TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sessions_athlete ON public.sessions (athlete_id, start_time DESC);

-- ---------------------------------------------------------------------
-- PERFORMANCE LOGS — immutable analytical fact table
-- Hercules columns preserved verbatim; analytical extensions are ADDITIVE.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.performance_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  UUID NOT NULL REFERENCES public.athletes(id),
  session_id  UUID NOT NULL REFERENCES public.sessions(id),

  -- Universal Metric Taxonomy vectors (normalized, hard-bounded 1..100)
  speed       DOUBLE PRECISION NOT NULL CHECK (speed     BETWEEN 1 AND 100),
  agility     DOUBLE PRECISION NOT NULL CHECK (agility   BETWEEN 1 AND 100),
  stamina     DOUBLE PRECISION NOT NULL CHECK (stamina   BETWEEN 1 AND 100),
  technical   DOUBLE PRECISION NOT NULL CHECK (technical BETWEEN 1 AND 100),
  cognitive   DOUBLE PRECISION NOT NULL CHECK (cognitive BETWEEN 1 AND 100),

  raw_payload JSONB NOT NULL,

  -- ADDITIVE analytical extensions
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id),           -- denormalized for RLS + query velocity
  stream_type     TEXT NOT NULL CHECK (stream_type IN
                    ('JSON_COORDINATES','CSV_SENSOR','IMU_PACKET','COACH_INTEL')),
  composite_score DOUBLE PRECISION NOT NULL CHECK (composite_score BETWEEN 1 AND 100),
  venue_verified  BOOLEAN NOT NULL DEFAULT false,                        -- geospatial boundary check passed
  ingest_hash     CHAR(64) NOT NULL UNIQUE,                              -- sha256(payload) => idempotent ingestion
  engine_version  TEXT NOT NULL DEFAULT '1.0.0',                         -- analyticsEngine.ts version stamp
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_perflogs_athlete_time ON public.performance_logs (athlete_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perflogs_session      ON public.performance_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_perflogs_tenant_athlete_time
  ON public.performance_logs (tenant_id, athlete_id, created_at DESC);

-- Immutable-append enforcement: UPDATE/DELETE structurally blocked.
CREATE OR REPLACE FUNCTION public.trg_performance_logs_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'performance_logs is append-only: % blocked', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS performance_logs_immutable ON public.performance_logs;
CREATE TRIGGER performance_logs_immutable
  BEFORE UPDATE OR DELETE ON public.performance_logs
  FOR EACH ROW EXECUTE FUNCTION public.trg_performance_logs_immutable();

-- ---------------------------------------------------------------------
-- updated_at maintenance for mutable tables
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_touch  ON public.tenants;
CREATE TRIGGER tenants_touch  BEFORE UPDATE ON public.tenants  FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();
DROP TRIGGER IF EXISTS users_touch    ON public.users;
CREATE TRIGGER users_touch    BEFORE UPDATE ON public.users    FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();
DROP TRIGGER IF EXISTS athletes_touch ON public.athletes;
CREATE TRIGGER athletes_touch BEFORE UPDATE ON public.athletes FOR EACH ROW EXECUTE FUNCTION public.trg_touch_updated_at();
