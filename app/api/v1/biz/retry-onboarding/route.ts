// =====================================================================
// ONBOARDING RECOVERY — POST /api/v1/biz/retry-onboarding  (§35, §51)
//
// The settlement path runs identity, enrollment and document delivery
// AFTER the money transaction commits and outside it. That ordering is
// deliberate and correct: a failure there must never un-settle a
// payment or cause a family to be charged twice. The price of it is that
// the steps can end up disagreeing — payment confirmed, no Athlete ID;
// or Athlete ID minted, welcome pack never sent — and until now the only
// record of that was a console.error in a serverless log.
//
// This is the other half of that design: the button that finishes the
// job. It re-runs exactly the same two functions the callback runs, on a
// registration that has ALREADY SETTLED.
//
// WHY THIS IS SAFE TO PRESS TWICE. It touches no money and cannot
// create any. It never calls the settlement RPC, never writes
// payment_events, and never marks anything paid — it reads a settled
// registration and re-drives onboarding. Both functions are idempotent
// by construction:
//   * matchAthlete() resolves the household to the existing athlete, so
//     a re-run reuses the BIIF code rather than minting a second one;
//   * bigice_enrollment.mpesa_receipt is UNIQUE, so the enrollment
//     upsert collapses onto the existing row;
//   * bigice_document upserts on (biif_code, slug, mpesa_receipt), so a
//     retry re-renders onto the same rows rather than stacking a second
//     welcome letter.
//
// OPS-TOKEN GUARDED. Re-driving onboarding for an arbitrary registration
// id resends a family's documents to the address on that registration.
// That is an administrator's action, not a public one, and it uses the
// same X-Ops-Token wall as manual reconciliation (utils/opsGuard.ts).
// Fail closed: an unset OPS_CONSOLE_TOKEN seals the surface.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { verifyOpsToken } from "@/utils/opsGuard";
import { onboardBigIceAthlete } from "@/lib/services/bigice-onboarding";
import { deliverBigIcePack } from "@/lib/services/bigice-delivery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z
  .object({ registrationId: z.string().uuid() })
  .strict();

export async function POST(request: NextRequest) {
  if (!(await verifyOpsToken(request))) {
    return NextResponse.json(
      { success: false, status: "FORBIDDEN", error: "Ops authorization required." },
      { status: 403 },
    );
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      {
        success: false,
        status: "CONFIG_DEBT",
        error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not provisioned.",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, status: "INPUT_REJECTED", error: "Malformed JSON body." },
      { status: 400 },
    );
  }
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, status: "INPUT_REJECTED", error: "registrationId (uuid) required." },
      { status: 400 },
    );
  }

  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db
    .from("registrations")
    .select("id, payment_status, settled_receipt, venture_context")
    .eq("id", parsed.data.registrationId)
    .maybeSingle<{
      id: string;
      payment_status: string;
      settled_receipt: string | null;
      venture_context: string | null;
    }>();

  if (error) {
    return NextResponse.json(
      { success: false, status: "SERVER_ERROR", error: "Registration lookup failed." },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json(
      { success: false, status: "NOT_FOUND", error: "No such registration." },
      { status: 404 },
    );
  }

  // THE GUARD THAT MATTERS. Onboarding is what a settled payment earns.
  // Driving it from an unsettled registration would hand out an Athlete
  // ID, an enrollment and a welcome pack for money that never arrived —
  // which is the one thing this endpoint must not be able to do.
  if (data.payment_status !== "PAYMENT_SETTLED" || !data.settled_receipt) {
    return NextResponse.json(
      {
        success: false,
        status: "NOT_SETTLED",
        error: "Onboarding can only be re-driven for a settled payment.",
        paymentStatus: data.payment_status,
      },
      { status: 409 },
    );
  }
  if (data.venture_context !== "BIG_ICE") {
    return NextResponse.json(
      {
        success: false,
        status: "WRONG_VENTURE",
        error: `This route recovers Big Ice onboarding; the registration is ${data.venture_context ?? "unassigned"}.`,
      },
      { status: 422 },
    );
  }

  const onboarding = await onboardBigIceAthlete(db, data.id, data.settled_receipt);
  if (!onboarding.onboarded) {
    return NextResponse.json(
      {
        success: false,
        status: onboarding.reviewRequired ? "REVIEW_REQUIRED" : "RETRY_FAILED",
        // Ops-only surface behind a token — the operator needs the real
        // reason, which is the whole point of pressing the button.
        error: onboarding.reason,
        athleteId: null,
      },
      { status: onboarding.reviewRequired ? 409 : 500 },
    );
  }

  const pack = await deliverBigIcePack(db, {
    biifCode: onboarding.biifCode,
    registrationId: data.id,
    receipt: data.settled_receipt,
    returning: onboarding.returning,
  });

  return NextResponse.json({
    success: true,
    athleteId: onboarding.biifCode,
    minted: onboarding.minted,
    // Documents generate and send separately, so they are reported
    // separately — "generated but not sent" is a real and common state
    // (unprovisioned mail, a bounced address) and it needs a different
    // next action from "not generated".
    documents: pack.documents,
    delivered: pack.delivered,
    deliveryReason: pack.delivered ? null : pack.reason,
  });
}
