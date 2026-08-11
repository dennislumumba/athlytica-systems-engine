// =====================================================================
// PUBLIC PACKAGE LIST — GET /api/v1/public/packages
//
// The Big Ice academy cohorts, so /register can offer them. They live in
// public.commercial_price_tier (tier_group='academy') rather than the
// code-level tier table, which is why the intake form could not sell
// them until now.
//
// PUBLIC BUT NARROW. It runs under the service-role key, so it returns a
// hand-listed projection — id, name, price, currency — and never the
// row. Nothing here is a secret (the same prices are published on
// bigice.co.ke), but "it went through the service-role client" is
// exactly how a `select *` leaks a column somebody adds next year.
//
// It cannot set a price either: /api/v1/biz/stk-push re-derives the
// charge from tier_id server-side and ignores any client amount. This
// endpoint decides what is OFFERED, never what is CHARGED.
// =====================================================================

import { NextResponse } from "next/server";
import { adminClient, serviceRoleConfigured } from "@/lib/auth/workspace";

export const runtime = "nodejs";
export const revalidate = 300;

export async function GET() {
  if (!serviceRoleConfigured()) {
    return NextResponse.json(
      {
        success: false,
        status: "CONFIG_DEBT",
        error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not provisioned.",
      },
      { status: 503 },
    );
  }

  const { data, error } = await adminClient()
    .from("commercial_price_tier")
    .select("tier_id, tier_name, price_amount, currency")
    .eq("tier_group", "academy")
    .eq("is_active", true)
    .order("price_amount", { ascending: false });

  if (error) {
    // The generic client message stays — a public endpoint does not
    // narrate the database. But the real reason has to reach the server
    // log, or the next person debugging this gets "Package lookup
    // failed" and nothing to act on. That cost a full diagnostic pass:
    // the same query with the same credentials succeeded locally, which
    // is what finally identified the deployed key as the difference.
    console.error(
      `[packages] commercial_price_tier lookup failed: ${error.code ?? "?"} ${error.message}` +
        (error.hint ? ` — ${error.hint}` : ""),
    );
    return NextResponse.json(
      { success: false, status: "SCHEMA_DEBT", error: "Package lookup failed." },
      { status: 503 },
    );
  }

  const packages = (data ?? [])
    .map((row) => ({
      priceTierId: String(row.tier_id),
      label: typeof row.tier_name === "string" ? row.tier_name : "Academy package",
      amountKes: Number(row.price_amount),
      currency: typeof row.currency === "string" ? row.currency : "KES",
    }))
    // A zero or unparseable price is a data fault, not a free cohort —
    // offering it would let someone check out at nothing.
    .filter((p) => Number.isFinite(p.amountKes) && p.amountKes > 0);

  return NextResponse.json({ success: true, packages });
}
