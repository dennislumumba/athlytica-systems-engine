// =====================================================================
// TELEMETRY PROCESSOR — Supabase Edge Function (Deno)
// Consumes telemetry_ingest_queue jobs, executes the Universal Metric
// Taxonomy engine, and appends immutably to performance_logs.
//
// Deploy:  supabase functions deploy telemetry-processor
// Invoke:  POST { jobId } with service-role bearer (called by the ingest
//          API and by the stuck-job sweep).
//
// Contract guarantees:
//  - performance_logs write is INSERT-only (DB trigger blocks mutation)
//  - job transitions: queued -> processing -> done | failed
//  - duplicate processing is impossible: the claim UPDATE is atomic and
//    conditional on status = 'queued'
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  calculateTaxonomyVectors,
  ENGINE_VERSION,
  type StreamPayload,
  type StreamType,
} from "../_shared/analyticsEngine.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req: Request) => {
  // TENANT-EXEMPT: liveness probe — touches no data plane.
  if (req.method === "GET" && new URL(req.url).pathname.endsWith("/health")) {
    return Response.json(
      { status: "healthy", engine: "Athlytica OS", ts: new Date().toISOString() },
      { status: 200 },
    );
  }

  if (req.method !== "POST") {
    return Response.json({ error: "Method Not Allowed" }, { status: 405 });
  }

  let jobId: string | undefined;
  try {
    ({ jobId } = await req.json());
  } catch {
    return Response.json({ error: "Malformed body" }, { status: 400 });
  }
  if (!jobId) {
    return Response.json({ error: "jobId required" }, { status: 400 });
  }

  // Atomic claim: only one worker can move queued -> processing.
  const { data: job, error: claimErr } = await supabase
    .from("telemetry_ingest_queue")
    .update({ status: "processing" })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  if (claimErr) {
    return Response.json({ error: `Claim failed: ${claimErr.message}` }, { status: 500 });
  }
  if (!job) {
    // Already claimed, done, or nonexistent — idempotent exit.
    return Response.json({ status: "NOOP", jobId }, { status: 200 });
  }

  try {
    // 1. Execute the scoring engine
    const result = calculateTaxonomyVectors(
      job.stream_type as StreamType,
      job.payload as StreamPayload,
    );

    // 2. Immutable append into performance_logs
    const { data: log, error: insertErr } = await supabase
      .from("performance_logs")
      .insert({
        athlete_id: job.athlete_id,
        session_id: job.session_id,
        tenant_id: job.tenant_id,
        speed: result.vectors.speed,
        agility: result.vectors.agility,
        stamina: result.vectors.stamina,
        technical: result.vectors.technical,
        cognitive: result.vectors.cognitive,
        composite_score: result.composite,
        stream_type: job.stream_type,
        venue_verified: job.venue_verified,
        ingest_hash: job.ingest_hash,
        engine_version: ENGINE_VERSION,
        raw_payload: {
          payload: job.payload,
          confidence: result.confidence, // evidence weights ride with the raw record
        },
      })
      .select("id")
      .single();

    if (insertErr) {
      // 23505 on ingest_hash: log already exists (retry after partial success)
      if (insertErr.code === "23505") {
        await supabase
          .from("telemetry_ingest_queue")
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", jobId);
        return Response.json({ status: "ALREADY_LOGGED", jobId }, { status: 200 });
      }
      throw new Error(insertErr.message);
    }

    // 3. Close the job
    await supabase
      .from("telemetry_ingest_queue")
      .update({ status: "done", processed_at: new Date().toISOString() })
      .eq("id", jobId);

    return Response.json(
      {
        status: "PROCESSED",
        jobId,
        logId: log.id,
        composite: result.composite,
        vectors: result.vectors,
        engineVersion: ENGINE_VERSION,
      },
      { status: 201 },
    );
  } catch (err) {
    await supabase
      .from("telemetry_ingest_queue")
      .update({
        status: "failed",
        attempts: (job.attempts ?? 0) + 1,
        error: (err as Error).message?.slice(0, 1000) ?? "unknown",
        processed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return Response.json({ status: "FAILED", jobId, error: (err as Error).message }, { status: 500 });
  }
});
