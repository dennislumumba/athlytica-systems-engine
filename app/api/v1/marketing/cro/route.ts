// =====================================================================
// CRO CONVERSION TRACKER — Charlie OS skill 3.03 (Dept 3: Marketing)
// POST /api/v1/marketing/cro   — record an onboarding funnel event
// GET  /api/v1/marketing/cro   — drop-off readout (ops-token guarded)
//
// PURPOSE: monitor onboarding drop-off vectors feeding the G-W6-PAY
// M-Pesa milestone (due 2026-07-19, config/nrhl-gates.ts).
//
// TENANT-EXEMPTION JUSTIFICATION (required by 02_SECURITY_SWEEP.md):
// POST is a public pre-auth tracking beacon — callers are anonymous
// visitors who have no tenant identity yet, so the athlete_tenant_links
// barrier cannot apply. Compensating controls:
//   * Closed contract: UUID anonymous id + closed stage enum. ZERO
//     free-text fields — nothing attacker-controlled is stored verbatim.
//   * Idempotent upsert on (anonymous_id, stage): replaying the beacon
//     cannot inflate counts or grow the table unboundedly per visitor.
//   * Write-only: POST never reads anything back to the caller.
// GET (the aggregate readout) is guarded by utils/opsGuard.ts.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { verifyOpsToken } from "@/utils/opsGuard";
import { NRHL_GATE_LEDGER } from "@/config/nrhl-gates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Ordered funnel — index order IS the conversion order.
const FUNNEL_STAGES = [
  "LANDING",
  "REGISTRATION_STARTED",
  "DETAILS_SUBMITTED",
  "PAYMENT_INITIATED",
  "PAYMENT_SETTLED",
] as const;

const funnelEventSchema = z.object({
  anonymousId: z.string().uuid(),
  stage: z.enum(FUNNEL_STAGES),
  occurredAt: z.string().datetime().optional(),
});

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function schemaDebtResponse() {
  return NextResponse.json(
    {
      status: "SCHEMA_DEBT",
      error:
        "onboarding_funnel_events does not exist in the deployed database. Apply migration " +
        "supabase/migrations/20260712190000_payment_and_funnel_events.sql — do not patch around it.",
    },
    { status: 503 },
  );
}

// ---------------------------------------------------------------------
// POST — public beacon (tenant-exempt, see header)
// ---------------------------------------------------------------------
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Malformed JSON body." },
      { status: 400 },
    );
  }

  const parsed = funnelEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Payload violates funnel contract.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { anonymousId, stage, occurredAt } = parsed.data;
  const supabase = adminClient();

  const { error } = await supabase
    .from("onboarding_funnel_events")
    .upsert(
      {
        anonymous_id: anonymousId,
        stage,
        occurred_at: occurredAt ?? new Date().toISOString(),
      },
      { onConflict: "anonymous_id,stage", ignoreDuplicates: true },
    );

  if (error) {
    if (error.code === "42P01") return schemaDebtResponse();
    return NextResponse.json(
      { status: "SERVER_ERROR", error: "Funnel event append failed." },
      { status: 500 },
    );
  }

  // 202: recorded (or idempotent duplicate — indistinguishable by design).
  return NextResponse.json({ status: "RECORDED", stage }, { status: 202 });
}

// ---------------------------------------------------------------------
// GET — drop-off readout (ops-token guarded)
// ---------------------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!(await verifyOpsToken(request))) {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "Valid X-Ops-Token required." },
      { status: 403 },
    );
  }

  const supabase = adminClient();

  const counts: number[] = [];
  for (const stage of FUNNEL_STAGES) {
    const { count, error } = await supabase
      .from("onboarding_funnel_events")
      .select("*", { count: "exact", head: true })
      .eq("stage", stage);
    if (error) {
      if (error.code === "42P01") return schemaDebtResponse();
      return NextResponse.json(
        { status: "SERVER_ERROR", error: `Count query failed for stage ${stage}.` },
        { status: 500 },
      );
    }
    counts.push(count ?? 0);
  }

  const stages = FUNNEL_STAGES.map((stage, i) => {
    const current = counts[i] ?? 0;
    const upstream = i === 0 ? null : counts[i - 1] ?? 0;
    const conversionFromPrevPct =
      upstream === null ? null : upstream === 0 ? null : Number(((current / upstream) * 100).toFixed(1));
    return {
      stage,
      visitors: current,
      conversionFromPrevPct,
      dropOffFromPrevPct: conversionFromPrevPct === null ? null : Number((100 - conversionFromPrevPct).toFixed(1)),
    };
  });

  const landed = counts[0] ?? 0;
  const settled = counts[counts.length - 1] ?? 0;
  const gate = NRHL_GATE_LEDGER["G-W6-PAY"];

  return NextResponse.json(
    {
      status: "OK",
      generatedAt: new Date().toISOString(),
      funnel: stages,
      overall: {
        landingToSettledPct: landed > 0 ? Number(((settled / landed) * 100).toFixed(1)) : null,
        settledCount: settled,
      },
      milestone: {
        gateId: gate.id,
        dueDate: gate.dueDate,
        kpi: gate.primaryKpi,
      },
    },
    { status: 200 },
  );
}
