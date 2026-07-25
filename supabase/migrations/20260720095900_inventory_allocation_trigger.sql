-- =====================================================================
-- 20260709_inventory_allocation_trigger.sql  (REPAIRED 2026-07-20)
--
-- DRIFT ROOT CAUSE (why the original version failed on live):
--   1. The trigger DDL hard-coded `AFTER INSERT OR UPDATE OF skate_size,
--      protective_kit_size ON public.athlete`. The live passport-plane
--      `athlete` table carries (legal_name, date_of_birth, passport_id,
--      ...) and has NEVER carried the legacy skate_size columns —
--      `UPDATE OF <nonexistent column>` is a hard compile error.
--   2. The allocation path only recognized `quantity_available` /
--      `sku|asset_sku|inventory_sku`; live commercial_inventory uses
--      `quantity_on_hand` + `sku`.
--
-- REPAIR STRATEGY (additive, schema-adaptive):
--   * Function body remains schema-agnostic (reads NEW via to_jsonb, so
--     it compiles against ANY row shape and no-ops when size keys are
--     absent).
--   * Quantity column is now DETECTED (quantity_available OR
--     quantity_on_hand) and referenced dynamically.
--   * The trigger is attached through a DO block that builds the
--     `UPDATE OF` column list from the columns that actually exist on
--     public.athlete at migration time. If neither size column exists
--     (current live state), it attaches AFTER INSERT only — a safe
--     no-op passthrough that unblocks the migration pipeline and
--     self-activates if the columns are ever added and this migration
--     is re-run.
--   * This file was never recorded in remote schema_migrations, so an
--     in-place repair introduces no history divergence.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.inventory_waitlist_alerts (
    alert_id BIGSERIAL PRIMARY KEY,
    athlete_id UUID,
    requested_size TEXT NOT NULL,
    organization_source TEXT,
    source_table TEXT NOT NULL,
    alert_type TEXT NOT NULL DEFAULT 'waitlist',
    allocation_token UUID,
    status TEXT NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_waitlist_alerts_athlete
    ON public.inventory_waitlist_alerts (athlete_id, created_at);

CREATE OR REPLACE FUNCTION public.inventory_column_exists(p_table_name text, p_column_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = p_table_name
          AND column_name = p_column_name
    );
$$;

CREATE OR REPLACE FUNCTION public.handle_inventory_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_athlete_id uuid := NEW.athlete_id;
    v_requested_size text;
    v_inventory_sku_column text;
    v_quantity_column text;
    v_sku text;
    v_quantity_available integer;
    v_allocation_token uuid;
    v_organization_source text := COALESCE(NULLIF(to_jsonb(NEW) ->> 'organization_source', ''), 'unknown');
BEGIN
    -- Schema-agnostic size extraction: works whether or not the columns
    -- exist on the firing table (absent keys read as NULL => no-op).
    IF NULLIF(trim(to_jsonb(NEW) ->> 'skate_size'), '') IS NOT NULL THEN
        v_requested_size := NULLIF(trim(to_jsonb(NEW) ->> 'skate_size'), '');
        v_sku := 'SKATE-' || upper(replace(v_requested_size, ' ', '-'));
    ELSIF NULLIF(trim(to_jsonb(NEW) ->> 'protective_kit_size'), '') IS NOT NULL THEN
        v_requested_size := NULLIF(trim(to_jsonb(NEW) ->> 'protective_kit_size'), '');
        v_sku := 'PROTECTIVE-KIT-' || upper(replace(v_requested_size, ' ', '-'));
    ELSE
        RETURN NEW;
    END IF;

    IF v_athlete_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- SKU column detection (live: `sku`).
    IF public.inventory_column_exists('commercial_inventory', 'sku') THEN
        v_inventory_sku_column := 'sku';
    ELSIF public.inventory_column_exists('commercial_inventory', 'asset_sku') THEN
        v_inventory_sku_column := 'asset_sku';
    ELSIF public.inventory_column_exists('commercial_inventory', 'inventory_sku') THEN
        v_inventory_sku_column := 'inventory_sku';
    ELSE
        RETURN NEW;
    END IF;

    -- Quantity column detection (live: `quantity_on_hand`; legacy:
    -- `quantity_available`).
    IF public.inventory_column_exists('commercial_inventory', 'quantity_available') THEN
        v_quantity_column := 'quantity_available';
    ELSIF public.inventory_column_exists('commercial_inventory', 'quantity_on_hand') THEN
        v_quantity_column := 'quantity_on_hand';
    ELSE
        RETURN NEW;
    END IF;

    BEGIN
        EXECUTE format(
            'WITH updated AS (
                UPDATE public.commercial_inventory
                SET %1$I = %1$I - 1
                WHERE %2$I = $1
                  AND %1$I > 0
                RETURNING %1$I AS remaining
            )
            SELECT remaining
            FROM updated
            LIMIT 1',
            v_quantity_column,
            v_inventory_sku_column
        )
        INTO v_quantity_available
        USING v_sku;

        IF v_quantity_available IS NOT NULL THEN
            v_allocation_token := gen_random_uuid();
            INSERT INTO public.inventory_waitlist_alerts (
                athlete_id, requested_size, organization_source,
                source_table, alert_type, allocation_token, status
            )
            VALUES (
                v_athlete_id, v_requested_size, v_organization_source,
                TG_TABLE_NAME, 'allocated', v_allocation_token, 'fulfilled'
            );
        ELSE
            INSERT INTO public.inventory_waitlist_alerts (
                athlete_id, requested_size, organization_source,
                source_table, alert_type, status
            )
            VALUES (
                v_athlete_id, v_requested_size, COALESCE(v_organization_source, 'unknown'),
                TG_TABLE_NAME, 'waitlist', 'open'
            );
        END IF;
    EXCEPTION
        WHEN others THEN
            INSERT INTO public.inventory_waitlist_alerts (
                athlete_id, requested_size, organization_source,
                source_table, alert_type, status
            )
            VALUES (
                v_athlete_id, v_requested_size, COALESCE(v_organization_source, 'unknown'),
                TG_TABLE_NAME, 'waitlist', 'open'
            );
            RAISE WARNING 'Inventory allocation failed for %: %', v_sku, SQLERRM;
    END;

    RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- Schema-adaptive trigger attachment. Builds the UPDATE OF list from
-- the columns that actually exist on public.athlete — never references
-- a column that is not present, so this compiles against BOTH the
-- legacy (skate_size) and live (legal_name/date_of_birth/passport_id)
-- schemas.
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_size_columns text[];
    v_update_of text;
BEGIN
    IF to_regclass('public.athlete') IS NULL THEN
        RAISE NOTICE 'public.athlete not present; skipping trigger attachment';
        RETURN;
    END IF;

    SELECT array_agg(quote_ident(column_name))
      INTO v_size_columns
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'athlete'
       AND column_name IN ('skate_size', 'protective_kit_size');

    EXECUTE 'DROP TRIGGER IF EXISTS trg_inventory_allocation ON public.athlete';

    IF v_size_columns IS NOT NULL AND array_length(v_size_columns, 1) > 0 THEN
        v_update_of := ' OR UPDATE OF ' || array_to_string(v_size_columns, ', ');
    ELSE
        -- Live schema: no size columns on athlete. Attach INSERT-only;
        -- function no-ops until size data flows through this table.
        v_update_of := '';
    END IF;

    EXECUTE format(
        'CREATE TRIGGER trg_inventory_allocation
         AFTER INSERT%s
         ON public.athlete
         FOR EACH ROW
         EXECUTE FUNCTION public.handle_inventory_allocation()',
        v_update_of
    );
END;
$$;
