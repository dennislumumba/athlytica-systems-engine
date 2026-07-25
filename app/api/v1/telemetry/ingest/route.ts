// =====================================================================
// UNIFIED TELEMETRY INGESTION GATEWAY
// POST /api/v1/telemetry/ingest
//
// Pipeline: contract validation (Zod discriminated union)
//   -> athlete/tenant authorization barrier (athlete_tenant_links)
//   -> session + venue context resolution
//   -> geospatial boundary gate (coordinate streams, >= 95% in-bounds)
//   -> idempotent durable enqueue (telemetry_ingest_queue)
//   -> best-effort dispatch to telemetry-processor Edge Function
//   -> 202 Accepted { jobId }
//
// Calculation is decoupled: the Edge Function owns the math and the
// immutable performance_logs append. If dispatch times out, the queue
// row survives and the stuck-job sweep re-arms it. Never compute here.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { insideRatio, type VenuePolygon } from "@/utils/analyticsEngine";

const GEO_ACCEPTANCE_THRESHOLD = 0.95;
const DISPATCH_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------
// Data contract — one discriminated union, four ingestion streams
// ---------------------------------------------------------------------
const coordinatePoint = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  t: z.number().finite().nonnegative(),
});

const envelopeBase = {
  tenantId: z.string().uuid(),
  athleteId: z.string().uuid(),
  sessionId: z.string().uuid(),
};

const ingestEnvelope = z.discriminatedUnion("streamType", [
  z.object({
    ...envelopeBase,
    streamType: z.literal("JSON_COORDINATES"),
    payload: z.object({
      points: z.array(coordinatePoint).min(3).max(50_000),
    }),
  }),
  z.object({
    ...envelopeBase,
    streamType: z.literal("CSV_SENSOR"),
    payload: z.object({
      columns: z.object({
        tSec: z.array(z.number().finite()).min(5).max(100_000),
        hr: z.array(z.number().finite()).optional(),
        speedMs: z.array(z.number().finite()).optional(),
      }),
      hrRest: z.number().min(30).max(120).optional(),
      hrMax: z.number().min(120).max(230).optional(),
    }),
  }),
  z.object({
    ...envelopeBase,
    streamType: z.literal("IMU_PACKET"),
    payload: z.object({
      samples: z
        .array(
          z.object({
            t: z.number().finite().nonnegative(),
            ax: z.number().finite(),
            ay: z.number().finite(),
            az: z.number().finite(),
          }),
        )
        .min(10)
        .max(200_000),
      hr: z.array(z.number().finite()).optional(),
      tSecHr: z.array(z.number().finite()).optional(),
      hrRest: z.number().min(30).max(120).optional(),
      hrMax: z.number().min(120).max(230).optional(),
    }),
  }),
  z.object({
    ...envelopeBase,
    streamType: z.literal("COACH_INTEL"),
    payload: z
      .object({
        executionAccuracyPct: z.number().min(0).max(100).optional(),
        toolHandlingProficiency: z.number().min(0).max(100).optional(),
        gameIqScore: z.number().min(0).max(100).optional(),
        positionalAwarenessScore: z.number().min(0).max(100).optional(),
        sportSpecificTechnical: z.record(z.number().min(0).max(100)).optional(),
      })
      .refine(
        (p) =>
          [p.executionAccuracyPct, p.toolHandlingProficiency, p.gameIqScore, p.positionalAwarenessScore].some(
            (v) => typeof v === "number",
          ) || Object.keys(p.sportSpecificTechnical ?? {}).length > 0,
        { message: "COACH_INTEL requires at least one scored field." },
      ),
  }),
]);

// ---------------------------------------------------------------------
// Server-only Supabase client (service role bypasses RLS; this route
// must never be exposed without upstream auth — see README ops notes)
// ---------------------------------------------------------------------
function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "INPUT_REJECTED", error: "Malformed JSON body." }, { status: 400 });
  }

  // 1. Contract validation
  const parsed = ingestEnvelope.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Payload violates ingestion contract.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { tenantId, athleteId, sessionId, streamType, payload } = parsed.data;
  const supabase = adminClient();

  // 2. Multi-tenant authorization barrier
  const { data: link, error: linkErr } = await supabase
    .from("athlete_tenant_links")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (linkErr) {
    return NextResponse.json({ status: "SERVER_ERROR", error: "Authorization lookup failed." }, { status: 500 });
  }
  if (!link) {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "Athlete-tenant boundary mismatch." },
      { status: 403 },
    );
  }

  // 3. Session + venue context resolution
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select("id, athlete_id, venues ( id, tenant_id, coordinates )")
    .eq("id", sessionId)
    .eq("athlete_id", athleteId)
    .maybeSingle();
  if (sessErr) {
    return NextResponse.json({ status: "SERVER_ERROR", error: "Session lookup failed." }, { status: 500 });
  }
  if (!session || !session.venues) {
    return NextResponse.json(
      { status: "NOT_FOUND", error: "Tracking session context not found for this athlete." },
      { status: 404 },
    );
  }
  const venue = Array.isArray(session.venues) ? session.venues[0] : session.venues;
  if (!venue) {
    // Fail closed: a session without resolvable venue context is unusable.
    return NextResponse.json(
      { status: "NOT_FOUND", error: "Tracking session context not found for this athlete." },
      { status: 404 },
    );
  }
  if (venue.tenant_id !== tenantId) {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "Session venue belongs to a different tenant." },
      { status: 403 },
    );
  }

  // 4. Geospatial boundary gate (coordinate streams only)
  let venueVerified = false;
  if (streamType === "JSON_COORDINATES") {
    const polygon = venue.coordinates as VenuePolygon;
    const ratio = insideRatio((payload as { points: Array<{ x: number; y: number; t: number }> }).points, polygon);
    if (ratio < GEO_ACCEPTANCE_THRESHOLD) {
      return NextResponse.json(
        {
          status: "GEO_REJECTED",
          error: `Coordinate stream fails venue boundary anchoring: ${(ratio * 100).toFixed(1)}% in-bounds (requires >= ${GEO_ACCEPTANCE_THRESHOLD * 100}%).`,
        },
        { status: 422 },
      );
    }
    venueVerified = true;
  }

  // 5. Idempotent durable enqueue
  const ingestHash = await sha256Hex(
    JSON.stringify({ tenantId, athleteId, sessionId, streamType, payload }),
  );
  const { data: job, error: insertErr } = await supabase
    .from("telemetry_ingest_queue")
    .insert({
      tenant_id: tenantId,
      athlete_id: athleteId,
      session_id: sessionId,
      stream_type: streamType,
      payload,
      ingest_hash: ingestHash,
      venue_verified: venueVerified,
    })
    .select("id")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      // Unique violation on ingest_hash — duplicate submission, idempotent no-op
      return NextResponse.json(
        { status: "DUPLICATE", message: "Identical payload already ingested.", ingestHash },
        { status: 200 },
      );
    }
    return NextResponse.json({ status: "SERVER_ERROR", error: "Queue append failed." }, { status: 500 });
  }

  // 6. Best-effort dispatch to the Edge Function. Timeout is non-fatal:
  //    the queue row persists and the sweep re-arms stuck jobs.
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DISPATCH_TIMEOUT_MS);
    await fetch(`${process.env.SUPABASE_URL}/functions/v1/telemetry-processor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ jobId: job.id }),
      signal: controller.signal,
    });
    clearTimeout(timer);
  } catch {
    // swallowed by design — durability lives in the queue, not the dispatch
  }

  return NextResponse.json(
    { status: "ACCEPTED", jobId: job.id, ingestHash, venueVerified },
    { status: 202 },
  );
}
