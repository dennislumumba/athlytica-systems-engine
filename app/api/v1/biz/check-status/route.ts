// =====================================================================
// SETTLEMENT STATUS POLL — GET /api/v1/biz/check-status (G-W6-PAY)
//
// Polled every ~3s by the /register checkout UI while the registrant
// enters their M-Pesa PIN. Capability model: the registrationId is an
// unguessable UUID minted by stk-push/register — holding it IS the
// authorization.
//
// WHAT IT RETURNS, AND WHY IT GREW. It used to answer status + receipt
// and nothing else, which meant the confirmation screen could only
// re-display what the client already had in state: no Athlete ID, no
// server-confirmed programme, no way to tell "paid, onboarded" from
// "paid, onboarding still running". A parent was told their registration
// was complete with no evidence on screen that anything had been
// created. It now also answers the settled facts a family needs on that
// screen — Athlete ID, programme, amount, onboarding state.
//
// STILL NARROW. Everything here is the holder's OWN registration, and
// the projection is hand-listed: no phone identity, no email, no other
// family's row is reachable, and nothing is returned at all until the
// payment has actually settled.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const registrationId = params.get("registrationId") ?? params.get("registration_id");
  const checkoutRequestId =
    params.get("checkoutRequestId") ?? params.get("checkout_request_id");

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
    .select(
      "id, payment_status, settled_receipt, settled_at, amount_expected_kes, " +
        "account_reference, athlete_name, venture_context",
    );
  query = registrationId
    ? query.eq("id", registrationId)
    : query.eq("checkout_request_id", checkoutRequestId!);

  const { data, error } = await query.maybeSingle<{
    id: string;
    payment_status: string;
    settled_receipt: string | null;
    settled_at: string | null;
    amount_expected_kes: number | string | null;
    account_reference: string;
    athlete_name: string | null;
    venture_context: string | null;
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
  if (!paid) {
    return NextResponse.json({
      status: "PENDING",
      registrationId: data.id,
      accountReference: data.account_reference,
      mpesaReceipt: null,
      settledAt: null,
    });
  }

  // Settled. The enrollment is the authority on what was bought — it is
  // what the settlement pipeline wrote, rather than what a client once
  // claimed — and it carries the Athlete ID the family needs on screen.
  //
  // Its ABSENCE is meaningful too, and is reported rather than hidden:
  // onboarding runs after settlement and can legitimately be a second
  // behind, or can have failed. A confirmation screen that silently
  // shows nothing where the Athlete ID belongs is how a paid parent ends
  // up messaging support. `onboarding: "PENDING"` lets it say so.
  let athleteId: string | null = null;
  let programmeLabel: string | null = null;
  let location: string | null = null;
  if (data.settled_receipt) {
    const { data: enrolment } = await supabase
      .from("bigice_enrollment")
      .select("biif_code, programme_label, location")
      .eq("mpesa_receipt", data.settled_receipt)
      .maybeSingle<{
        biif_code: string | null;
        programme_label: string | null;
        location: string | null;
      }>();
    athleteId = enrolment?.biif_code ?? null;
    programmeLabel = enrolment?.programme_label ?? null;
    location = enrolment?.location ?? null;
  }

  // DID THE PACK ACTUALLY GO OUT? Generation and delivery are separate
  // steps and they fail separately: bigice-delivery.ts renders and
  // stores the documents FIRST, then attempts the email, precisely so an
  // unsent pack is still a complete record. Without asking, the
  // confirmation screen told every parent "your welcome pack has been
  // sent" — including the ones whose mail bounced, and every one issued
  // while RESEND_API_KEY was unprovisioned. A parent who is told to
  // check an inbox that will never receive anything is a support ticket
  // the system created for itself.
  let documentsSent = false;
  let documentCount = 0;
  if (athleteId && data.settled_receipt) {
    const { data: docs } = await supabase
      .from("bigice_document")
      .select("delivery_status")
      .eq("biif_code", athleteId)
      .eq("mpesa_receipt", data.settled_receipt)
      .returns<{ delivery_status: string }[]>();
    documentCount = docs?.length ?? 0;
    documentsSent = documentCount > 0 && (docs ?? []).every((d) => d.delivery_status === "SENT");
  }

  const amount = Number(data.amount_expected_kes);

  return NextResponse.json({
    status: "PAID",
    registrationId: data.id,
    accountReference: data.account_reference,
    mpesaReceipt: data.settled_receipt,
    settledAt: data.settled_at,
    amountKes: Number.isFinite(amount) && amount > 0 ? amount : null,
    athleteName: data.athlete_name,
    venture: data.venture_context,
    athleteId,
    programmeLabel,
    location,
    documentCount,
    documentsSent,
    // BIG_ICE is the only venture that mints an Athlete ID on this path.
    // Reporting COMPLETE for NRHL would be a claim about a pipeline that
    // was never asked to run.
    onboarding:
      data.venture_context !== "BIG_ICE"
        ? "NOT_APPLICABLE"
        : athleteId
          ? "COMPLETE"
          : "PENDING",
  });
}
