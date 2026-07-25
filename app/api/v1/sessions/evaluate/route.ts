// =====================================================================
// POST /api/v1/sessions/evaluate
//
// Deterministic coach-side metric commit rail (Hercules -> Supabase).
//
// Contract:
//   { athlete_id, cohort_session_id, evaluator_id, metrics, ... }
//
// Behaviour:
//   1. Verifies the caller's Supabase JWT (Authorization: Bearer) and
//      enforces evaluator_id === authenticated uid — a coach can only
//      commit evaluations under their own identity.
//   2. Inserts one immutable row into public.athlete_metrics_log
//      (single-statement, therefore atomic at the Postgres level).
//      cohort_session_id + evaluator_id are sealed inside metric_payload
//      since the log table is append-only and schema-frozen.
//   3. Sizing verification: if the metrics object carries a physical
//      size adjustment (skate_size / protective_kit_size), the matching
//      column on public.athlete is updated — which fires
//      trg_inventory_allocation and reserves physical stock
//      automatically. Any sizing-sync failure after the log commit is
//      surfaced explicitly (SIZING_SYNC_FAILED) with the committed
//      metric_log_id so ops can run a compensating update.
//
// Env (server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sizing columns on public.athlete watched by trg_inventory_allocation.
const SIZING_COLUMNS = ["skate_size", "protective_kit_size"] as const;
type SizingColumn = (typeof SIZING_COLUMNS)[number];

const evaluatePayloadSchema = z
  .object({
    athlete_id: z.string().uuid(),
    cohort_session_id: z.string().trim().min(1).max(128),
    evaluator_id: z.string().trim().min(1).max(128),
    // Free-form evaluation surface: pillar scores, notes, and optional
    // sizing adjustments all travel in this object.
    metrics: z
      .record(z.string(), z.unknown())
      .refine((o) => Object.keys(o).length > 0, {
        message: "metrics object must not be empty",
      }),
    // Optional overrides — deterministic defaults applied server-side.
    metric_code: z.string().trim().min(2).max(64).default("SESSION_EVALUATION"),
    metric_timestamp: z.string().datetime({ offset: true }).optional(),
    metric_version: z.number().int().positive().default(1),
  })
  .strict();

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Extract non-empty string sizing adjustments from the metrics object. */
function extractSizingPatch(
  metrics: Record<string, unknown>,
): Partial<Record<SizingColumn, string>> {
  const patch: Partial<Record<SizingColumn, string>> = {};
  for (const column of SIZING_COLUMNS) {
    const raw = metrics[column];
    if (typeof raw === "string" && raw.trim().length > 0) {
      patch[column] = raw.trim();
    }
  }
  return patch;
}

export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { status: "CONFIG_DEBT", error: "Supabase server credentials are not configured." },
      { status: 503 },
    );
  }

  // ---------------------------------------------------------------
  // 1. Authentication — Supabase JWT, evaluator identity enforced.
  // ---------------------------------------------------------------
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json(
      { status: "UNAUTHENTICATED", error: "Missing Authorization: Bearer <supabase_jwt>." },
      { status: 401 },
    );
  }

  const supabase = adminClient();
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user) {
    return NextResponse.json(
      { status: "UNAUTHENTICATED", error: "Invalid or expired session token." },
      { status: 401 },
    );
  }

  // ---------------------------------------------------------------
  // 2. Payload validation.
  // ---------------------------------------------------------------
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Request body is not valid JSON." },
      { status: 400 },
    );
  }

  const parsed = evaluatePayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "INPUT_REJECTED",
        error: "Payload violates the session evaluation contract.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const payload = parsed.data;

  if (payload.evaluator_id !== authData.user.id) {
    return NextResponse.json(
      {
        status: "FORBIDDEN",
        error: "evaluator_id must match the authenticated coach identity.",
      },
      { status: 403 },
    );
  }

  // ---------------------------------------------------------------
  // 3. Atomic metric-log insert.
  // ---------------------------------------------------------------
  const metricTimestamp = payload.metric_timestamp ?? new Date().toISOString();
  const { data: inserted, error: insertError } = await supabase
    .from("athlete_metrics_log")
    .insert({
      athlete_id: payload.athlete_id,
      metric_code: payload.metric_code,
      metric_timestamp: metricTimestamp,
      metric_version: payload.metric_version,
      metric_payload: {
        cohort_session_id: payload.cohort_session_id,
        evaluator_id: payload.evaluator_id,
        metrics: payload.metrics,
      },
    })
    .select("metric_log_id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      {
        status: "COMMIT_FAILED",
        error: "athlete_metrics_log insert rejected.",
        details: insertError?.message ?? "no row returned",
      },
      { status: 500 },
    );
  }

  // ---------------------------------------------------------------
  // 4. Sizing verification -> athlete profile sync -> stock trigger.
  // ---------------------------------------------------------------
  const sizingPatch = extractSizingPatch(payload.metrics);
  const sizingColumns = Object.keys(sizingPatch) as SizingColumn[];

  if (sizingColumns.length > 0) {
    const { error: sizingError } = await supabase
      .from("athlete")
      .update(sizingPatch)
      .eq("athlete_id", payload.athlete_id);

    if (sizingError) {
      // Log row is committed; sizing sync is the only outstanding leg.
      return NextResponse.json(
        {
          status: "SIZING_SYNC_FAILED",
          metric_log_id: inserted.metric_log_id,
          error: "Metric committed, but athlete sizing update failed — stock reservation trigger did not fire.",
          details: sizingError.message,
          pending_sizing_patch: sizingPatch,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    {
      status: "METRIC_COMMITTED",
      metric_log_id: inserted.metric_log_id,
      metric_code: payload.metric_code,
      metric_timestamp: metricTimestamp,
      sizing_sync: {
        applied: sizingColumns,
        stock_reservation_trigger_fired: sizingColumns.length > 0,
      },
    },
    { status: 201 },
  );
}
