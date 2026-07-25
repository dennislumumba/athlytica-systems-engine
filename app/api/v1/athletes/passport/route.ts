// =====================================================================
// GET /api/v1/athletes/passport?athlete_id=<uuid>
//
// Longitudinal scouting passport feed (multi-year metric history).
//
// Primary path: calls the Postgres RPC athlete_passport_longitudinal
// (migration 20260714090000) — the aggregation, grouping (year x sport)
// and 3-period rolling averages run inside Postgres via window
// functions, indexed on (athlete_id, metric_timestamp DESC).
//
// Fail-soft path: if the RPC has not been applied to the target project
// yet, the route falls back to an in-process aggregation over the raw
// log rows and returns the identical series shape, flagged with
// aggregation_engine: "route_fallback".
//
// Response shape (Recharts-ready, one datum per year x sport):
//   [{ year, sport, sample_count, physical_avg, tactical_avg,
//      physical_rolling_avg, tactical_rolling_avg }]
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  athlete_id: z.string().uuid(),
});

export interface PassportSeriesPoint {
  year: number;
  sport: string;
  sample_count: number;
  physical_avg: number | null;
  tactical_avg: number | null;
  physical_rolling_avg: number | null;
  tactical_rolling_avg: number | null;
}

type MetricDomain = "physical" | "tactical" | "other";

interface MetricLogRow {
  metric_code: string;
  metric_timestamp: string;
  metric_payload: Record<string, unknown> | null;
}

const PHYSICAL_PREFIXES = [
  "PHY",
  "SPEED",
  "AGILITY",
  "STAMINA",
  "STRENGTH",
  "POWER",
  "BIO",
  "SIZE",
  "SKATE_SIZE",
  "PROTECTIVE_KIT_SIZE",
];
const TACTICAL_PREFIXES = ["TAC", "COG", "GAME_IQ", "DECISION", "TECH", "IQ"];

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Deterministic domain classifier: explicit payload category first, metric_code prefix second. */
function classifyDomain(metricCode: string, payload: Record<string, unknown> | null): MetricDomain {
  const category = typeof payload?.category === "string" ? payload.category.toLowerCase() : "";
  if (category === "physical" || category === "tactical") return category;

  const code = metricCode.toUpperCase();
  if (PHYSICAL_PREFIXES.some((p) => code.startsWith(p))) return "physical";
  if (TACTICAL_PREFIXES.some((p) => code.startsWith(p))) return "tactical";
  return "other";
}

/** Pull a single representative numeric value out of an arbitrary metric payload. */
function extractNumericValue(payload: Record<string, unknown> | null): number | null {
  if (!payload) return null;
  if (typeof payload.value === "number" && Number.isFinite(payload.value)) return payload.value;

  const container =
    payload.metrics && typeof payload.metrics === "object"
      ? (payload.metrics as Record<string, unknown>)
      : payload;

  const numerics = Object.values(container).filter(
    (v): v is number => typeof v === "number" && Number.isFinite(v),
  );
  if (numerics.length === 0) return null;
  return numerics.reduce((acc, v) => acc + v, 0) / numerics.length;
}

function extractSport(payload: Record<string, unknown> | null): string {
  if (typeof payload?.sport === "string" && payload.sport.trim().length > 0) {
    return payload.sport.trim().toLowerCase();
  }
  const inner =
    payload?.metrics && typeof payload.metrics === "object"
      ? (payload.metrics as Record<string, unknown>)
      : null;
  if (typeof inner?.sport === "string" && inner.sport.trim().length > 0) {
    return inner.sport.trim().toLowerCase();
  }
  return "unclassified";
}

function round(value: number | null, dp = 2): number | null {
  if (value === null) return null;
  const f = 10 ** dp;
  return Math.round(value * f) / f;
}

/** Route-level fallback aggregation — mirrors the RPC's SQL exactly. */
function aggregateSeries(rows: MetricLogRow[]): PassportSeriesPoint[] {
  interface Bucket {
    physical: number[];
    tactical: number[];
    count: number;
  }
  const buckets = new Map<string, Bucket>();

  for (const row of rows) {
    const year = new Date(row.metric_timestamp).getUTCFullYear();
    if (!Number.isFinite(year)) continue;
    const sport = extractSport(row.metric_payload);
    const key = `${sport}::${year}`;
    const bucket = buckets.get(key) ?? { physical: [], tactical: [], count: 0 };
    bucket.count += 1;

    const domain = classifyDomain(row.metric_code, row.metric_payload);
    const value = extractNumericValue(row.metric_payload);
    if (value !== null && domain === "physical") bucket.physical.push(value);
    if (value !== null && domain === "tactical") bucket.tactical.push(value);

    buckets.set(key, bucket);
  }

  const mean = (xs: number[]): number | null =>
    xs.length === 0 ? null : xs.reduce((a, b) => a + b, 0) / xs.length;

  const flat = Array.from(buckets.entries())
    .map(([key, bucket]) => {
      const [sport = "unclassified", yearStr = "0"] = key.split("::");
      return {
        year: Number(yearStr),
        sport,
        sample_count: bucket.count,
        physical_avg: mean(bucket.physical),
        tactical_avg: mean(bucket.tactical),
      };
    })
    .sort((a, b) => (a.sport === b.sport ? a.year - b.year : a.sport.localeCompare(b.sport)));

  // 3-period trailing rolling average per sport (matches the RPC window frame).
  const WINDOW = 3;
  const series: PassportSeriesPoint[] = [];
  for (const point of flat) {
    const trailing = series
      .filter((p) => p.sport === point.sport)
      .slice(-(WINDOW - 1))
      .concat([]);

    const rolling = (selector: (p: { physical_avg: number | null; tactical_avg: number | null }) => number | null): number | null => {
      const window = [...trailing.map(selector), selector(point)].filter(
        (v): v is number => v !== null,
      );
      return mean(window);
    };

    series.push({
      year: point.year,
      sport: point.sport,
      sample_count: point.sample_count,
      physical_avg: round(point.physical_avg),
      tactical_avg: round(point.tactical_avg),
      physical_rolling_avg: round(rolling((p) => p.physical_avg)),
      tactical_rolling_avg: round(rolling((p) => p.tactical_avg)),
    });
  }
  return series;
}

export async function GET(request: NextRequest) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { status: "CONFIG_DEBT", error: "Supabase server credentials are not configured." },
      { status: 503 },
    );
  }

  // Authentication — any valid Supabase session (coach, parent, athlete).
  // Row-level scoping of WHO may view WHICH passport belongs in RLS /
  // a dedicated authorization layer, not silently in this route.
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

  const parsed = querySchema.safeParse({
    athlete_id: request.nextUrl.searchParams.get("athlete_id"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "INPUT_REJECTED",
        error: "athlete_id must be a valid UUID.",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const { athlete_id } = parsed.data;

  // -----------------------------------------------------------------
  // Primary path: Postgres-side aggregation (window functions).
  // -----------------------------------------------------------------
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "athlete_passport_longitudinal",
    { p_athlete_id: athlete_id },
  );

  if (!rpcError && Array.isArray(rpcData)) {
    return NextResponse.json({
      status: "OK",
      athlete_id,
      aggregation_engine: "postgres_rpc",
      series: rpcData as PassportSeriesPoint[],
    });
  }

  // -----------------------------------------------------------------
  // Fallback: raw rows -> in-route aggregation (identical shape).
  // -----------------------------------------------------------------
  const { data: rows, error: rowsError } = await supabase
    .from("athlete_metrics_log")
    .select("metric_code, metric_timestamp, metric_payload")
    .eq("athlete_id", athlete_id)
    .order("metric_timestamp", { ascending: true })
    .limit(10000);

  if (rowsError) {
    return NextResponse.json(
      {
        status: "QUERY_FAILED",
        error: "Unable to read athlete_metrics_log.",
        details: rowsError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: "OK",
    athlete_id,
    aggregation_engine: "route_fallback",
    series: aggregateSeries((rows ?? []) as MetricLogRow[]),
  });
}
