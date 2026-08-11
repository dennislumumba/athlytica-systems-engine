// =====================================================================
// POLYMORPHIC SETTLEMENT INGESTION — G-W6-PAY payment pipeline root
// POST /api/v1/biz/mpesa-callback
//
// Rail: M-Pesa Paybill 4325935 (Athlytica Technologies Limited) (config/payment-rail.ts).
// Accepts settlement evidence from THREE origins (launch-week reality):
//   * DARAJA_CALLBACK — Safaricom STK settlement, normalized
//   * BANK_RAIL       — NCBA banking-protocol notification, normalized
//   * MANUAL_RECON    — founder/ops manual reconciliation entry
//
// SECURITY MODEL — polymorphic input does NOT mean anonymous input.
// nrhl-gates.ts law: gates flip on validated settlement evidence, never
// assertion. An unauthenticated settlement endpoint would let any caller
// forge a receipt string, flip PAYMENT_SETTLED, and authorize a draft
// profile for free. Therefore every source carries an auth wall:
//   * Machine rails (DARAJA_CALLBACK, BANK_RAIL): X-Callback-Secret
//     header vs MPESA_CALLBACK_SECRET env (configure the secret in the
//     Daraja/NCBA notification URL headers).
//   * MANUAL_RECON: X-Ops-Token vs OPS_CONSOLE_TOKEN (utils/opsGuard.ts)
//     — a human reconciliation is an ops action, full stop.
// Fail-closed: unset secrets seal the surface (403), never open it.
//
// DPA COMPLIANCE: raw MSISDN is validated in-memory for schema purposes
// and HMAC-SHA256-hashed (MSISDN_HASH_KEY env) before ANY persistence.
// The raw number is never stored, logged, or echoed.
//
// IDEMPOTENT BARRIER: duplicate mpesaReceiptNumber is rejected ATOMICALLY
// by the ledger's UNIQUE constraint inside settle_payment_transaction()
// (no read-then-write TOCTOU window). Duplicates return 200 DUPLICATE
// with ZERO state changes — silent fail-closed loop, no double allocation.
//
// SINGLE TRANSACTION PATH: ledger append + registration resolution +
// atomic account construction (users/athletes/athlete_tenant_links) +
// gate evidence all execute inside the settle_payment_transaction RPC
// (v2: supabase/migrations/20260713100000_registration_sessions_v2.sql).
// This route performs no direct table writes on the SETTLEMENT path.
//
// POST-SETTLEMENT SIDE EFFECTS run after that transaction commits and
// deliberately outside it: the draft-authorization webhook, the NRHL
// onboarding pack, and Big Ice athlete/enrollment creation. Each is
// best-effort and none may fail a settled payment (§55) — money truth is
// already durable by the time they run, so their failure mode is a log
// line for an administrator, never a non-200 to the gateway.
//
// RESOLUTION ROUTER (Workflow Inversion Pattern, W-6):
// Incoming account references are polymorphic. Before dispatching to the
// RPC this route canonicalizes phone-bearing references — "REG-<phone>"
// fallback strings and bare MSISDN refs — into the hash-derived form
// REG-#<hash16> (utils/msisdn.ts), so the RAW PHONE NEVER PERSISTS in
// payment_events.account_reference. The RPC then matches sessions by:
//   1. account_reference equality (canonical + legacy opaque refs), then
//   2. msisdn_hash of the transaction MSISDN (covers STK callbacks,
//      which do not echo AccountReference, and mistyped manual refs).
// On a clean match with full profile data, the RPC constructs the User,
// Athlete, and AthleteTenantLink rows atomically with the ledger append
// and flips the session to PAYMENT_SETTLED (retained for audit + the
// G-W5-REG paid-registrations KPI — settled sessions are never deleted).
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { verifyOpsToken, verifySecretHeader } from "@/utils/opsGuard";
import { settlePaymentGate } from "@/config/nrhl-gates";
import { MPESA_PAYBILL } from "@/config/payment-rail";
import { deliverOnboardingPack } from "@/lib/services/onboarding-delivery";
import { onboardBigIceAthlete } from "@/lib/services/bigice-onboarding";
import { deliverBigIcePack } from "@/lib/services/bigice-delivery";
import {
  canonicalRegistrationReference,
  extractMsisdnFromReference,
  getMsisdnHashKey,
  hmacSha256Hex,
} from "@/utils/msisdn";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEBHOOK_TIMEOUT_MS = 3000;

// ---------------------------------------------------------------------
// Polymorphic settlement contract — one discriminated union, three
// origins, identical financial core. Closed enums, zero free-text
// (MANUAL_RECON note is length-capped and the only prose field).
// ---------------------------------------------------------------------
const financialCore = {
  mpesaReceiptNumber: z.string().trim().min(8).max(20),
  amountKes: z.number().positive().finite(),
  phoneNumber: z.string().regex(/^254(1|7)\d{8}$/, "expected Kenyan MSISDN, e.g. 2547XXXXXXXX"),
  accountReference: z.string().trim().min(1).max(64),
  transactionTimestamp: z.string().datetime(),
};

const settlementPayloadSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("DARAJA_CALLBACK"),
    resultCode: z.number().int(), // non-zero acked but never settled
    ...financialCore,
  }),
  z.object({
    source: z.literal("BANK_RAIL"),
    paybill: z.string().trim().optional(), // if present, must match the live rail
    bankTransactionId: z.string().trim().max(64).optional(),
    ...financialCore,
  }),
  z.object({
    source: z.literal("MANUAL_RECON"),
    reconciledBy: z.string().email(), // accountability: who keyed it in
    note: z.string().trim().max(280).optional(),
    ...financialCore,
  }),
]);

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Daraja expects a 200 + ResultCode ack; other rails get plain JSON. */
function respond(
  source: "DARAJA_CALLBACK" | "BANK_RAIL" | "MANUAL_RECON",
  body: Record<string, unknown>,
  httpStatus: number,
) {
  const payload =
    source === "DARAJA_CALLBACK" ? { ...body, ResultCode: 0, ResultDesc: "Accepted" } : body;
  return NextResponse.json(payload, { status: httpStatus });
}

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

  // 1. Contract validation (no state has been touched yet)
  const parsed = settlementPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "INPUT_REJECTED",
        error: "Payload violates settlement contract.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const event = parsed.data;

  // 2. Source-appropriate auth wall — fail closed
  const [machineAuthorized, opsAuthorized] = await Promise.all([
    verifySecretHeader(request, "x-callback-secret", "MPESA_CALLBACK_SECRET"),
    verifyOpsToken(request),
  ]);
  const authorized =
    event.source === "MANUAL_RECON" ? opsAuthorized : machineAuthorized || opsAuthorized;
  if (!authorized) {
    return NextResponse.json(
      { status: "FORBIDDEN", error: "Settlement origin failed authentication." },
      { status: 403 },
    );
  }

  // 3. Origin-specific gates
  if (event.source === "DARAJA_CALLBACK" && event.resultCode !== 0) {
    // Failed transaction: acknowledge the callback, settle nothing.
    return respond(event.source, { status: "IGNORED_NON_SUCCESS", resultCode: event.resultCode }, 200);
  }
  if (event.source === "BANK_RAIL" && event.paybill !== undefined && event.paybill !== MPESA_PAYBILL) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: `Paybill mismatch: expected ${MPESA_PAYBILL}.` },
      { status: 422 },
    );
  }

  // 4. Gate-law validation: settlePaymentGate is the ONLY sanctioned
  //    evidence validator (config/nrhl-gates.ts). It parses the raw
  //    MSISDN in-memory; the raw value is never persisted.
  let gateState;
  try {
    gateState = settlePaymentGate({
      gateId: "G-W6-PAY",
      mpesaReceiptNumber: event.mpesaReceiptNumber,
      amountKes: event.amountKes,
      msisdn: event.phoneNumber,
      transactionTimestamp: event.transactionTimestamp,
      resultCode: 0,
      accountReference: event.accountReference,
    });
  } catch {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Payload is not valid settlement evidence (gate law)." },
      { status: 422 },
    );
  }

  // 5. DPA hashing barrier — fail closed if the hash key is missing
  const hashKey = getMsisdnHashKey();
  if (!hashKey) {
    return NextResponse.json(
      {
        status: "CONFIG_DEBT",
        error: "MSISDN_HASH_KEY is not provisioned; refusing to persist unhashed PII.",
      },
      { status: 503 },
    );
  }
  const msisdnHash = await hmacSha256Hex(hashKey, event.phoneNumber);

  // 5b. RESOLUTION ROUTER — canonicalize phone-bearing references so the
  //     raw MSISDN never persists inside account_reference. Opaque/legacy
  //     references pass through untouched (equality matching preserved).
  const referenceMsisdn = extractMsisdnFromReference(event.accountReference);
  const accountReference = referenceMsisdn
    ? canonicalRegistrationReference(await hmacSha256Hex(hashKey, referenceMsisdn))
    : event.accountReference;

  // 6. Atomic settlement + account construction (idempotent barrier and
  //    session matching precedence live inside the RPC)
  const supabase = adminClient();
  const { data, error } = await supabase.rpc("settle_payment_transaction", {
    p_receipt: event.mpesaReceiptNumber,
    p_amount_kes: event.amountKes,
    p_msisdn_hash: msisdnHash,
    p_account_reference: accountReference,
    p_result_code: 0,
    p_tx_ts: event.transactionTimestamp,
  });

  if (error) {
    if (error.code === "42883" || error.code === "42P01") {
      return NextResponse.json(
        {
          status: "SCHEMA_DEBT",
          error:
            "settle_payment_transaction missing/stale in deployed database. Apply migrations " +
            "20260712210000_registrations_and_settlement_rpc.sql and " +
            "20260713100000_registration_sessions_v2.sql.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { status: "SERVER_ERROR", error: "Settlement transaction failed; nothing was committed." },
      { status: 500 },
    );
  }

  const result = data as {
    outcome: "DUPLICATE" | "SETTLED" | "SETTLED_UNMATCHED" | "SETTLED_UNDERPAID";
    receipt: string;
    ledger_id?: string;
    registration_id?: string | null;
    user_id?: string | null;
    athlete_id?: string | null;
    amount_expected_kes?: number;
    amount_received_kes?: number;
  };

  // 7. Silent idempotent no-op — zero balance-allocation changes
  if (result.outcome === "DUPLICATE") {
    return respond(event.source, { status: "DUPLICATE", receipt: result.receipt }, 200);
  }

  // 8. Best-effort draft-authorization webhook (telemetry-route pattern:
  //    durability lives in the DB state, not the dispatch). Fires only
  //    for a matched registration on first settlement.
  if (result.outcome === "SETTLED" && result.registration_id && process.env.DRAFT_AUTH_WEBHOOK_URL) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
      await fetch(process.env.DRAFT_AUTH_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "REGISTRATION_PAYMENT_SETTLED",
          registrationId: result.registration_id,
          athleteId: result.athlete_id ?? null,
          accountReference, // canonical hash-derived form — no raw phone leaves this route
          receipt: result.receipt,
          settledAt: event.transactionTimestamp,
          gate: gateState, // { gateId, live, liveAt, evidence } — no PII
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);
    } catch {
      // swallowed by design — registration state is already durable
    }
  }

  // 9. Best-effort onboarding pack. Same law as the webhook above: the
  //    registration is already durable, so a mail failure is a log line
  //    for an administrator, never an error on a settled payment. It
  //    cannot throw and it cannot hang (5s abort inside the mailer).
  let onboardingDelivered = false;
  if (result.outcome === "SETTLED" && result.registration_id) {
    const delivery = await deliverOnboardingPack(
      supabase,
      result.registration_id,
      result.receipt,
    );
    onboardingDelivered = delivery.delivered;
    if (delivery.delivered) {
      console.info(
        `[onboarding] pack sent to ${delivery.to} — ${delivery.documents.join(", ")} ` +
          `(${delivery.returning ? "returning" : "new"} athlete ${delivery.athleteId})`,
      );
    } else {
      // The parent is registered and paid. Someone has to send this by
      // hand, so it has to be visible.
      console.error(
        `[onboarding] PACK NOT SENT for registration ${result.registration_id} ` +
          `(receipt ${result.receipt}): ${delivery.reason}`,
      );
    }
  }

  // 10. Big Ice athlete identity + enrollment. Same ordering law as the
  //     two steps above: settlement is already durable, so this can fail
  //     without costing the family anything, and it self-selects on
  //     venture_context — NRHL and Athlytica registrations pass straight
  //     through. It cannot throw (§55).
  let bigIceAthleteCode: string | null = null;
  let bigIceReviewRequired = false;
  let bigIcePackDelivered = false;
  if (result.outcome === "SETTLED" && result.registration_id) {
    const onboarding = await onboardBigIceAthlete(supabase, result.registration_id, result.receipt);
    if (onboarding.onboarded) {
      bigIceAthleteCode = onboarding.biifCode;
      console.info(
        `[bigice] ${onboarding.minted ? "minted" : "matched"} ${onboarding.biifCode} ` +
          `for registration ${result.registration_id} (receipt ${result.receipt})`,
      );

      // Pack generation is recorded even when the send fails, so this
      // reports what a family actually received rather than what we
      // meant to send.
      const pack = await deliverBigIcePack(supabase, {
        biifCode: onboarding.biifCode,
        registrationId: result.registration_id,
        receipt: result.receipt,
        returning: onboarding.returning,
      });
      bigIcePackDelivered = pack.delivered;
      if (pack.delivered) {
        console.info(
          `[bigice] pack sent to ${pack.to} — ${pack.documents.join(", ")} (${onboarding.biifCode})`,
        );
      } else {
        console.error(
          `[bigice] PACK NOT SENT for ${onboarding.biifCode} (receipt ${result.receipt}): ` +
            `${pack.reason}${pack.documents.length ? ` — generated: ${pack.documents.join(", ")}` : ""}`,
        );
      }
    } else if (onboarding.reviewRequired) {
      // Paid, but no athlete record. A person has to resolve this, so it
      // has to be visible — and the receipt is here to resolve it with.
      bigIceReviewRequired = true;
      console.error(
        `[bigice] ONBOARDING PENDING for registration ${result.registration_id} ` +
          `(receipt ${result.receipt}): ${onboarding.reason}`,
      );
    }
  }

  return respond(
    event.source,
    {
      status: result.outcome, // SETTLED | SETTLED_UNMATCHED | SETTLED_UNDERPAID
      receipt: result.receipt,
      onboardingDelivered,
      bigIceAthleteCode,
      bigIceReviewRequired,
      bigIcePackDelivered,
      registrationId: result.registration_id ?? null,
      accountsProvisioned: result.outcome === "SETTLED" && Boolean(result.athlete_id),
      reconciliationRequired:
        result.outcome === "SETTLED_UNMATCHED" || result.outcome === "SETTLED_UNDERPAID",
    },
    result.outcome === "SETTLED" ? 200 : 202,
  );
}
