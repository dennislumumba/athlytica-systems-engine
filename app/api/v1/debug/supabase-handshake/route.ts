import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "edge";

export async function GET() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      {
        status: "CONFIG_ERROR",
        error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server environment.",
      },
      { status: 500 },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const selectResult = await supabase
    .from("scouting_metric_log")
    .select("id, athlete_id, metric_code, value, context, logged_at")
    .limit(1)
    .maybeSingle();

  const functionUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/telemetry-processor`;
  let functionResult;

  try {
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ jobId: "00000000-0000-0000-0000-000000000000" }),
    });

    const text = await response.text();
    functionResult = {
      status: response.status,
      statusText: response.statusText,
      body: text,
    };
  } catch (err) {
    functionResult = {
      error: (err as Error).message,
    };
  }

  return NextResponse.json({
    status: "HANDSHAKE_CHECK",
    tableQuery: {
      data: selectResult.data ?? null,
      error: selectResult.error ? selectResult.error.message : null,
      status: selectResult.error ? "FAILED" : "SUCCESS",
    },
    functionInvocation: functionResult,
  });
}
