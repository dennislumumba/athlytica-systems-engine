// =====================================================================
// METRIC INGEST — Supabase Edge Function (Deno)
// User-facing ingestion surface for scouting_metric_log (Football/Hockey
// multi-sport taxonomy). Deliberately SEPARATE from telemetry-processor:
// that function is the service-role queue worker for performance_logs
// (03_TAXONOMY_ENGINE.md) and must not carry a public write surface.
//
// Auth model: anon key + caller JWT passthrough => `authenticated` role.
// RLS does the enforcement (SEC-001 hardening migration):
//   * users_self_read      -> tenant resolution from the caller's own row
//   * tenant_member_policy -> WITH CHECK pins every insert to that tenant
// No service_role key anywhere in this function.
//
// Deploy:  supabase functions deploy metric-ingest   (verify_jwt = true)
// Routes:  GET  /health  — liveness probe (bearer: anon key suffices)
//          POST /ingest  — { athlete_id, session_id?, sport?, metrics }
// =====================================================================

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Route 1: Liveness probe — TENANT-EXEMPT: touches no data plane.
  if (req.method === "GET" && url.pathname.endsWith("/health")) {
    return json({
      status: "healthy",
      engine: "Athlytica OS",
      ts: new Date().toISOString(),
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization bearer" }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );

    // Route 2: Telemetry session ingestion.
    if (req.method === "POST" && url.pathname.endsWith("/ingest")) {
      const { athlete_id, session_id, sport, metrics } = await req.json();

      if (!athlete_id || !metrics || typeof metrics !== "object") {
        return json({ error: "Missing required tracking parameters" }, 400);
      }

      // Tenant resolution: users_self_read RLS guarantees this returns
      // only the caller's own row — no client-supplied filter is trusted.
      const { data: userRow, error: userErr } = await supabaseClient
        .from("users")
        .select("tenant_id")
        .limit(1)
        .maybeSingle();

      if (userErr) throw userErr;
      if (!userRow?.tenant_id) {
        return json({ error: "Caller has no tenant mapping" }, 403);
      }

      // Fan the metrics object out into per-metric rows to match the
      // scouting_metric_log DDL (metric_code / value / context).
      // Non-numeric entries are reported back, never silently dropped.
      const context = [sport ?? "training_session", session_id]
        .filter(Boolean)
        .join(":");

      const rows: Record<string, unknown>[] = [];
      const skipped: string[] = [];

      for (const [code, raw] of Object.entries(metrics)) {
        const value = typeof raw === "boolean" ? Number(raw) : Number(raw);
        if (Number.isFinite(value)) {
          rows.push({
            tenant_id: userRow.tenant_id,
            athlete_id,
            metric_code: code,
            value,
            context,
            logged_at: new Date().toISOString(),
          });
        } else {
          skipped.push(code);
        }
      }

      if (rows.length === 0) {
        return json({ error: "No numeric metrics in payload", skipped }, 400);
      }

      const { data, error } = await supabaseClient
        .from("scouting_metric_log")
        .insert(rows)
        .select();

      if (error) throw error;

      return json({
        success: true,
        inserted: data?.length ?? 0,
        skipped_non_numeric: skipped,
        records: data,
      });
    }

    return json({ error: "Endpoint not found" }, 404);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
