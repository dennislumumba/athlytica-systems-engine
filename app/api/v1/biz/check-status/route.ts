// =====================================================================
// SETTLEMENT STATUS POLL — GET /api/v1/biz/check-status (G-W6-PAY)
//
// Polled every ~3s by the /register checkout UI while the registrant
// enters their M-Pesa PIN. Capability model: the registrationId is an
// unguessable UUID minted by stk-push/register — holding it IS the
// authorization. Response is deliberately minimal (status + receipt);
// no profile fields, no phone identity, ever.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const registrationId = request.nextUrl.searchParams.get("registrationId");
  const checkoutRequestId = request.nextUrl.searchParams.get("checkoutRequestId");

  if (!registrationId && !checkoutRequestId) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "registrationId or checkoutRequestId required." },
      { status: 400 },
    );
  }
  if (registrationId && !UUID_RE.test(registrationId)) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "registrationId must be a UUID." },
      { status: 400 },
    );
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let query = supabase
    .from("registrations")
    .select("id, payment_status, settled_receipt, settled_at, amount_expected_kes");
  query = registrationId
    ? query.eq("id", registrationId)
    : query.eq("checkout_request_id", checkoutRequestId!);

  const { data, error } = await query.maybeSingle<{
    id: string;
    payment_status: string;
    settled_receipt: string | null;
    settled_at: string | null;
    amount_expected_kes: number | string | null;
  }>();

  if (error) {
    return NextResponse.json(
      { status: "SERVER_ERROR", error: "Status lookup failed." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ status: "NOT_FOUND" }, { status: 404 });
  }

  const paid = data.payment_status === "PAYMENT_SETTLED";
  return NextResponse.json({
    status: paid ? "PAID" : "PENDING",
    registrationId: data.id,
    mpesaReceipt: paid ? data.settled_receipt : null,
    settledAt: paid ? data.settled_at : null,
  });
}
