// =====================================================================
// CASH FLOW SNAPSHOT — Charlie OS skill 6.01 (Dept 6: Small Business)
// GET /api/v1/biz/cash-watcher
//
// PURPOSE: standardized operational liquidity payload aggregated from
// the public.payment_events settlement ledger (M-Pesa / G-W6-PAY).
//
// GUARD: X-Ops-Token vs OPS_CONSOLE_TOKEN (utils/opsGuard.ts). This is
// a founder/ops treasury readout — NOT athlete data, so the tenant
// barrier does not apply; the ops guard does, unconditionally.
//
// FAIL-CLOSED CONTRACT:
//   * Missing/invalid token, or unset OPS_CONSOLE_TOKEN -> 403.
//   * payment_events table absent (Postgres 42P01) -> 503 SCHEMA_DEBT
//     naming the migration. The migration is the fix — never soften
//     the query to hide the gap (mcp/route.ts precedent).
//   * Aggregation is computed in-handler over a hard ROW_CAP; if the
//     cap is hit the payload says so (`truncated: true`) instead of
//     silently reporting a wrong number.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyOpsToken } from "@/utils/opsGuard";
import { NRHL_GATE_LEDGER } from "@/config/nrhl-gates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HORIZON_DAYS = 30;
const RUN_RATE_BASIS_DAYS = 7;
const ROW_CAP = 10_000;

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface WindowAggregate {
  windowDays: number;
  grossCollectedKes: number;
  txCount: number;
  avgTicketKes: number | null;
}

function aggregate(rows: Array<{ amount_kes: number }>, windowDays: number): WindowAggregate {
  const gross = rows.reduce((sum, r) => sum + Number(r.amount_kes), 0);
  return {
    windowDays,
    grossCollectedKes: Number(gross.toFixed(2)),
    txCount: rows.length,
    avgTicketKes: rows.length > 0 ? Number((gross / rows.length).toFixed(2)) : null,
  };
}

export async function GET(request: NextRequest) {
  if (!(await verifyOpsToken(request))) {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "Valid X-Ops-Token required." },
      { status: 403 },
    );
  }

  const supabase = adminClient();
  const now = new Date();
  const horizonStart = new Date(now.getTime() - HORIZON_DAYS * 86_400_000).toISOString();
  const runRateStart = new Date(now.getTime() - RUN_RATE_BASIS_DAYS * 86_400_000);

  // payment_events_production, not payment_events: every figure this route
  // emits is money (gross collected, run rate, average ticket), so a
  // settlement classified TEST/AUDIT/DEMO in record_classification must not
  // reach it (D-22/D-23). The view is `select pe.*` over the same table —
  // identical columns, identical filters, only the excluded rows differ.
  const { data, error } = await supabase
    .from("payment_events_production")
    .select("amount_kes, transaction_timestamp")
    .gte("transaction_timestamp", horizonStart)
    .order("transaction_timestamp", { ascending: false })
    .limit(ROW_CAP);

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json(
        {
          status: "SCHEMA_DEBT",
          error:
            "payment_events_production does not exist in the deployed database. Apply migration " +
            "supabase/migrations/20260812122254_m3_payment_replay_integrity.sql — do not patch around it " +
            "by reading payment_events directly, which would put TEST/AUDIT/DEMO settlements back into revenue.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { status: "SERVER_ERROR", error: "Ledger aggregation query failed." },
      { status: 500 },
    );
  }

  const rows = data ?? [];
  const truncated = rows.length >= ROW_CAP;
  const last7d = rows.filter((r) => new Date(r.transaction_timestamp) >= runRateStart);

  const agg30 = aggregate(rows, HORIZON_DAYS);
  const agg7 = aggregate(last7d, RUN_RATE_BASIS_DAYS);

  const latestSettlementAt = rows.length > 0 ? rows[0]!.transaction_timestamp : null;
  const gate = NRHL_GATE_LEDGER["G-W6-PAY"];

  return NextResponse.json(
    {
      status: "OK",
      generatedAt: now.toISOString(),
      currency: "KES",
      horizon: agg30,
      runRate: {
        basisDays: RUN_RATE_BASIS_DAYS,
        window: agg7,
        dailyRunRateKes: Number((agg7.grossCollectedKes / RUN_RATE_BASIS_DAYS).toFixed(2)),
      },
      latestSettlementAt,
      gate: {
        id: gate.id,
        dueDate: gate.dueDate,
        settlementEvidenceLogged: rows.length > 0,
      },
      truncated,
    },
    { status: 200 },
  );
}
