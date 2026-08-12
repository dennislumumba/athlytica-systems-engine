// =====================================================================
// THE PAYMENT AUTHORIZATION BOUNDARY — one rule, one place
//
// Phase 0.3E. Every path that can create production customer value —
// an Athlete ID, an enrollment, an onboarding document, portal access —
// asks this module first. Nothing re-implements the rule, and nothing
// substitutes a cheaper check for it.
//
// WHAT WAS WRONG BEFORE. Four different paths each had their own idea of
// what a payment entitled someone to:
//
//   mpesa-callback         result.outcome === "SETTLED"
//   retry-onboarding       registrations.payment_status === "PAYMENT_SETTLED"
//   onboard-paid-athlete   a receipt-shaped string, 4..64 chars
//   Big Ice onboarding     nothing at all — it trusted its caller
//
// None of them consulted record_classification, so a settlement that the
// business had formally declared synthetic still minted a permanent
// identity. And none of them checked which VENTURE the money was for.
//
// THE RULE, restated. These are separate states and one does not imply
// the next:
//
//   PAYMENT RECEIVED → SETTLED → ENROLLMENT AUTHORIZED → ATHLETE CREATED
//
// Authorization requires POSITIVE server-derived evidence. That is the
// opposite default from revenue classification (M2), which treats
// absence as PRODUCTION so that a forgotten classification over-counts
// money rather than hiding a real payment. Here, absence denies.
//
// The rule itself lives in public.payment_service_authorization (M4),
// because every fact it needs — the ledger row, the classification, open
// reconciliation exceptions, the settled registration and its venture —
// is in the database and must be read consistently. This module supplies
// the one fact that is NOT in the database: which M-Pesa rail the
// deployment is pointed at.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** The ventures that can own an enrollment. Mirrors the registrations CHECK. */
export type Venture = "NRHL" | "BIG_ICE" | "ATHLYTICA";

export type ServiceAuthorization =
  | {
      status: "AUTHORIZED";
      receipt: string;
      reason: string;
      registrationId: string;
      ventureContext: Venture;
    }
  | { status: "NOT_AUTHORIZED"; receipt: string; reason: string }
  | { status: "RECONCILIATION_REQUIRED"; receipt: string; reason: string };

/**
 * Is this deployment pointed at the real M-Pesa rail?
 *
 * Mirrors utils/mpesaDaraja.ts exactly, including its strictness: the
 * value must be the string "production", so "Production" selects the
 * sandbox. That is deliberate there and inherited here — the two must
 * never disagree about which rail is live, because a deployment pushing
 * STK to the sandbox while authorizing service as production is the
 * worst possible split.
 *
 * Sandbox Daraja accepts every well-formed request and calls back, so a
 * settlement arriving on it is a test harness firing, not money moving.
 *
 * Read from process.env only. It is never taken from a request body, and
 * there is no override — a caller cannot promote its own payment.
 */
export function railIsProduction(): boolean {
  return process.env.DARAJA_ENV === "production";
}

/**
 * May this payment create production customer value for this venture?
 *
 * Fails closed on every error path. A database that cannot answer is not
 * a database that said yes — an unreachable RPC, a stale schema and a
 * malformed response all deny, because the alternative is minting a
 * permanent identity on a failed lookup.
 */
export async function authorizePaymentForService(
  db: SupabaseClient,
  receipt: string | null | undefined,
  venture: Venture,
): Promise<ServiceAuthorization> {
  const trimmed = (receipt ?? "").trim();
  if (!trimmed) {
    return { status: "NOT_AUTHORIZED", receipt: "", reason: "RECEIPT_ABSENT" };
  }

  const { data, error } = await db.rpc("payment_service_authorization", {
    p_receipt: trimmed,
    p_venture: venture,
    p_rail_is_production: railIsProduction(),
  });

  if (error) {
    // 42883 = the function is missing from the deployed database, i.e. M4
    // has not been applied there. Distinguished so an operator sees the
    // real cause instead of a generic denial, but it still denies.
    const code = (error as { code?: string }).code;
    return {
      status: "NOT_AUTHORIZED",
      receipt: trimmed,
      reason:
        code === "42883"
          ? "SCHEMA_DEBT: payment_service_authorization missing; apply 20260812172530_m4_payment_authorization_boundary.sql"
          : `AUTHORIZATION_LOOKUP_FAILED: ${error.message}`,
    };
  }

  const result = data as {
    status?: string;
    reason?: string;
    registration_id?: string | null;
    venture_context?: string | null;
  } | null;

  if (result?.status === "AUTHORIZED" && result.registration_id && result.venture_context) {
    return {
      status: "AUTHORIZED",
      receipt: trimmed,
      reason: result.reason ?? "MATCHED_PRODUCTION_REGISTRATION",
      registrationId: result.registration_id,
      ventureContext: result.venture_context as Venture,
    };
  }
  if (result?.status === "RECONCILIATION_REQUIRED") {
    return {
      status: "RECONCILIATION_REQUIRED",
      receipt: trimmed,
      reason: result.reason ?? "RECONCILIATION_REQUIRED",
    };
  }

  // Anything else — including a well-formed NOT_AUTHORIZED, an AUTHORIZED
  // missing its registration id, and a null response — denies.
  return {
    status: "NOT_AUTHORIZED",
    receipt: trimmed,
    reason: result?.reason ?? "AUTHORIZATION_UNAVAILABLE",
  };
}

/**
 * The single predicate downstream code should branch on. Written as a
 * function rather than repeated `=== "AUTHORIZED"` comparisons so that
 * "may this create customer value?" has exactly one spelling.
 */
export function mayCreateCustomerValue(auth: ServiceAuthorization): boolean {
  return auth.status === "AUTHORIZED";
}
