// =====================================================================
// PRE-PAYMENT REGISTRATION SESSION ENGINE — Workflow Inversion Pattern
// POST /api/v1/auth/register                        (G-W6-PAY, W-6 gate)
//
// TENANT-EXEMPT: pre-tenant identity creation (02 §3). This surface
// creates the registration session that PRECEDES any user/athlete/link
// row; there is no athlete-scoped read path. Standing conditions:
//   (a) writes are INSERT/idempotent-reuse on public.registrations only;
//   (b) the tenantId in the payload is validated to EXIST but confers
//       no read access to anything tenant-scoped;
//   (c) account construction happens exclusively inside the settlement
//       RPC after validated financial evidence — never here.
// Violating any condition voids the exemption.
//
// FLOW (financial execution loop starts only after state is durable):
//   1. Zod contract (strict; unknown keys rejected).
//   2. Fee derived SERVER-SIDE from config/registration-fees.ts —
//      amountExpected is never client-supplied (self-priced entry = the
//      underpayment guard guards nothing).
//   3. DPA barrier: MSISDN normalized + HMAC-hashed in-memory; the raw
//      number is persisted NOWHERE. Unique session-per-phone rides on
//      msisdn_hash; the settlement matching key is the canonical
//      hash-derived reference REG-#<hash16>.
//   4. Durable session row FIRST, then best-effort STK push (fail-soft:
//      Daraja downtime never kills the funnel — manual Paybill fallback
//      4325935 + REG-<phone> is returned regardless).
//   5. 202 Accepted with full payment instructions.
//
// IDEMPOTENCY: re-registration with the same phone returns the SAME
// open session + instructions (200), re-firing the STK push at most
// once per STK_REDISPATCH_WINDOW_MS (DB-backed throttle: stk_pushed_at).
// A settled phone returns 409 — no duplicate identity loops.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MPESA_PAYBILL } from "@/config/payment-rail";
import {
  VENTURE_CONTEXTS,
  getRegistrationFeeKes,
  feeEnvKey,
} from "@/config/registration-fees";
import {
  canonicalRegistrationReference,
  getMsisdnHashKey,
  hmacSha256Hex,
  normalizeKenyanMsisdn,
} from "@/utils/msisdn";
import { initiateStkPush } from "@/utils/mpesaDaraja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STK_REDISPATCH_WINDOW_MS = 2 * 60 * 1000;

const registrationPayloadSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    phoneNumber: z
      .string()
      .trim()
      .max(20)
      .refine((v) => normalizeKenyanMsisdn(v) !== null, {
        message: "expected a Kenyan mobile number, e.g. 07XXXXXXXX or 2547XXXXXXXX",
      }),
    ventureContext: z.enum(VENTURE_CONTEXTS),
    tenantId: z.string().uuid(),
  })
  .strict();

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type SessionRow = {
  id: string;
  payment_status: string;
  stk_pushed_at: string | null;
  amount_expected_kes: number | string | null;
};

/** The 202/200 instruction payload — identical for fresh and reused sessions. */
function instructionPayload(args: {
  registrationId: string;
  amountKes: number;
  msisdn: string;
  stk: { dispatched: boolean; reason?: string };
  reused: boolean;
}) {
  return {
    status: args.reused ? "REGISTRATION_SESSION_REUSED" : "REGISTRATION_SESSION_OPEN",
    registrationId: args.registrationId,
    paymentStatus: "PENDING_PAYMENT",
    amountKes: args.amountKes,
    payment: {
      railName: "M-Pesa Paybill (Athlytica Technologies Limited)",
      paybill: MPESA_PAYBILL,
      // Hard fallback for STK timeout edge cases. Echoing the number the
      // registrant just submitted back to them is not persistence.
      accountNumber: `REG-${args.msisdn}`,
      instruction:
        `An M-Pesa payment prompt ${args.stk.dispatched ? "has been sent to" : "could not be sent to"} your phone. ` +
        `If it does not appear, pay manually: Lipa na M-Pesa → Paybill → Business No. ${MPESA_PAYBILL} → ` +
        `Account No. REG-${args.msisdn} → Amount KES ${args.amountKes}.`,
    },
    stkPush: args.stk.dispatched
      ? { dispatched: true }
      : { dispatched: false, fallback: "MANUAL_PAYBILL", reason: args.stk.reason ?? "unknown" },
  };
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

  // 1. Contract validation — no state touched yet.
  const parsed = registrationPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        status: "INPUT_REJECTED",
        error: "Payload violates registration contract.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // 2. Server-derived fee — fail closed on unprovisioned ventures.
  const amountKes = getRegistrationFeeKes(input.ventureContext);
  if (amountKes === null) {
    return NextResponse.json(
      {
        status: "CONFIG_DEBT",
        error: `Registration fee for ${input.ventureContext} is not provisioned (${feeEnvKey(input.ventureContext)}).`,
      },
      { status: 503 },
    );
  }

  // 3. DPA hashing barrier — fail closed if the hash key is missing.
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
  const msisdn = normalizeKenyanMsisdn(input.phoneNumber)!; // refined above
  const msisdnHash = await hmacSha256Hex(hashKey, msisdn);
  const accountReference = canonicalRegistrationReference(msisdnHash);

  const supabase = adminClient();

  // 4. Tenant existence check (writes only; confers no scoped reads).
  const { data: tenant, error: tenantErr } = await supabase
    .from("tenants")
    .select("id")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (tenantErr) {
    return NextResponse.json(
      { status: "SERVER_ERROR", error: "Tenant lookup failed." },
      { status: 500 },
    );
  }
  if (!tenant) {
    return NextResponse.json(
      { status: "INPUT_REJECTED", error: "Unknown tenantId." },
      { status: 422 },
    );
  }

  // 5. Idempotent session resolution on the phone-identity index.
  const { data: existing, error: existingErr } = await supabase
    .from("registrations")
    .select("id, payment_status, stk_pushed_at, amount_expected_kes")
    .eq("msisdn_hash", msisdnHash)
    .maybeSingle<SessionRow>();
  if (existingErr) {
    return NextResponse.json(
      { status: "SERVER_ERROR", error: "Session lookup failed." },
      { status: 500 },
    );
  }

  if (existing && existing.payment_status === "PAYMENT_SETTLED") {
    return NextResponse.json(
      {
        status: "ALREADY_SETTLED",
        error: "This phone number has a settled registration. No new session opened.",
        registrationId: existing.id,
      },
      { status: 409 },
    );
  }

  let sessionId: string;
  let reused = false;

  if (existing) {
    // Open session for this phone: reuse it verbatim (immutable identity
    // row) rather than forking a second payment expectation.
    sessionId = existing.id;
    reused = true;
  } else {
    const { data: created, error: insertErr } = await supabase
      .from("registrations")
      .insert({
        account_reference: accountReference,
        msisdn_hash: msisdnHash,
        full_name: input.fullName,
        email: input.email,
        venture_context: input.ventureContext,
        tenant_id: input.tenantId,
        amount_expected_kes: amountKes,
      })
      .select("id")
      .single();

    if (insertErr || !created) {
      // 23505 = unique race on msisdn_hash (double-submit): recover by reuse.
      if (insertErr?.code === "23505") {
        const { data: raced } = await supabase
          .from("registrations")
          .select("id, payment_status, stk_pushed_at, amount_expected_kes")
          .eq("msisdn_hash", msisdnHash)
          .maybeSingle<SessionRow>();
        if (raced && raced.payment_status !== "PAYMENT_SETTLED") {
          sessionId = raced.id;
          reused = true;
        } else {
          return NextResponse.json(
            { status: "SERVER_ERROR", error: "Session creation race could not be resolved." },
            { status: 500 },
          );
        }
      } else if (
        insertErr?.code === "42703" ||
        insertErr?.code === "42P01" ||
        insertErr?.code === "42501"
      ) {
        return NextResponse.json(
          {
            status: "SCHEMA_DEBT",
            error:
              "registrations v2 columns missing in deployed database. Apply migration " +
              "supabase/migrations/20260713100000_registration_sessions_v2.sql.",
          },
          { status: 503 },
        );
      } else {
        return NextResponse.json(
          { status: "SERVER_ERROR", error: "Session creation failed; nothing was committed." },
          { status: 500 },
        );
      }
    } else {
      sessionId = created.id;
    }
  }

  // 6. Best-effort STK push AFTER durable state (fail-soft; DB-backed
  //    re-dispatch throttle prevents prompt-spam on reused sessions).
  const lastPush = existing?.stk_pushed_at ? Date.parse(existing.stk_pushed_at) : null;
  const throttled = lastPush !== null && Date.now() - lastPush < STK_REDISPATCH_WINDOW_MS;

  let stk: { dispatched: boolean; reason?: string };
  if (throttled) {
    stk = { dispatched: false, reason: "STK re-dispatch throttled; manual Paybill fallback applies." };
  } else {
    const result = await initiateStkPush({
      amountKes,
      msisdn,
      accountReference,
      description: `${input.ventureContext} reg`,
    });
    stk = result.dispatched ? { dispatched: true } : { dispatched: false, reason: result.reason };
    if (result.dispatched) {
      await supabase
        .from("registrations")
        .update({ stk_pushed_at: new Date().toISOString() })
        .eq("id", sessionId);
    }
  }

  return NextResponse.json(
    instructionPayload({ registrationId: sessionId, amountKes, msisdn, stk, reused }),
    { status: reused ? 200 : 202 },
  );
}
