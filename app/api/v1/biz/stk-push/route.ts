// =====================================================================
// UNIFIED INTAKE STK PUSH — POST /api/v1/biz/stk-push (G-W6-PAY)
//
// Public checkout surface behind the cross-domain /register funnel
// (nrhl | bigice | athlytica sources). Same laws as the register route:
//   * fee derived SERVER-SIDE from config/registration-fees.ts tiers —
//     a client-supplied amount is verified, never trusted;
//   * DPA barrier: MSISDN hashed in-memory, raw number persisted NOWHERE;
//   * durable session row FIRST, then best-effort STK push (fail-soft —
//     Daraja downtime returns manual Paybill instructions, never a 500);
//   * settlement truth arrives only via /api/v1/biz/mpesa-callback + RPC.
//
// ACCOUNT REFERENCE: server-generated ATH-XXXX (unambiguous alphanumeric)
// stored as the session's account_reference. The settlement RPC matches
// on reference equality first (covers manual Paybill payments keyed to
// the ATH code) and msisdn_hash second (covers STK callbacks, which do
// not echo AccountReference).
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { MPESA_PAYBILL } from "@/config/payment-rail";
import { REGISTRATION_TIERS, REGISTRATION_TIER_IDS } from "@/config/registration-fees";
import { getMsisdnHashKey, hmacSha256Hex, normalizeKenyanMsisdn } from "@/utils/msisdn";
import { initiateStkPush } from "@/utils/mpesaDaraja";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STK_REDISPATCH_WINDOW_MS = 2 * 60 * 1000;

const payloadSchema = z
  .object({
    phoneNumber: z
      .string()
      .trim()
      .max(20)
      .refine((v) => normalizeKenyanMsisdn(v) !== null, {
        message: "expected a Kenyan mobile number, e.g. 07XXXXXXXX or 2547XXXXXXXX",
      }),
    tier: z.enum(REGISTRATION_TIER_IDS as [string, ...string[]]).optional(),
    // Big Ice academy packages price from public.commercial_price_tier
    // instead of the code-level tier table — same server-priced law.
    priceTierId: z.string().uuid().optional(),
    athleteName: z.string().trim().min(2).max(120),
    parentName: z.string().trim().min(2).max(120).optional(),
    parentEmail: z.string().trim().toLowerCase().email().max(254),
    athleteAge: z.number().int().min(4).max(60).optional(),
    preferredCampus: z.string().trim().max(120).optional(),
    source: z.enum(["nrhl", "bigice", "athlytica"]).optional(),
    // Display-only echo from the client; verified against the tier table.
    amount: z.number().positive().finite().optional(),
  })
  .strict()
  .refine((v) => (v.tier === undefined) !== (v.priceTierId === undefined), {
    message: "provide exactly one of tier or priceTierId",
    path: ["tier"],
  });

function adminClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ATH-XXXX from an unambiguous alphabet (no 0/O, 1/I/L confusion). */
function generateAthReference(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return `ATH-${code}`;
}

type SessionRow = {
  id: string;
  payment_status: string;
  stk_pushed_at: string | null;
  account_reference: string;
};

export async function POST(request: NextRequest) {
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
      {
        success: false,
        status: "INPUT_REJECTED",
        error: "Payload violates checkout contract.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const supabase = adminClient();

  // Server-priced tier. Two price sources, one law: the charge is
  // derived here, never taken from the payload.
  let tier: { amountKes: number; venture: string; label: string };
  let tierId: string;

  if (input.priceTierId) {
    const { data: priceRow, error: priceErr } = await supabase
      .from("commercial_price_tier")
      .select("tier_id, tier_name, price_amount, tier_group, is_active")
      .eq("tier_id", input.priceTierId)
      .eq("tier_group", "academy")
      .eq("is_active", true)
      .maybeSingle<{ tier_id: string; tier_name: string; price_amount: number | string }>();
    if (priceErr) {
      return NextResponse.json(
        { success: false, status: "SERVER_ERROR", error: "Package lookup failed." },
        { status: 500 },
      );
    }
    const priceKes = Number(priceRow?.price_amount ?? NaN);
    if (!priceRow || !Number.isFinite(priceKes) || priceKes <= 0) {
      return NextResponse.json(
        {
          success: false,
          status: "INPUT_REJECTED",
          error: "Unknown or inactive academy package.",
        },
        { status: 422 },
      );
    }
    tier = { amountKes: priceKes, venture: "BIG_ICE", label: priceRow.tier_name };
    tierId = `academy_${priceRow.tier_id}`;
  } else {
    const table = REGISTRATION_TIERS[input.tier as keyof typeof REGISTRATION_TIERS];
    tier = { amountKes: table.amountKes, venture: table.venture, label: table.label };
    tierId = input.tier!;
  }

  if (input.amount !== undefined && input.amount !== tier.amountKes) {
    return NextResponse.json(
      {
        success: false,
        status: "INPUT_REJECTED",
        error: `Amount mismatch: ${tier.label} is KES ${tier.amountKes}.`,
      },
      { status: 422 },
    );
  }
  const amountKes = tier.amountKes;

  // DPA hashing barrier — fail closed if the hash key is missing.
  const hashKey = getMsisdnHashKey();
  if (!hashKey) {
    return NextResponse.json(
      {
        success: false,
        status: "CONFIG_DEBT",
        error: "MSISDN_HASH_KEY is not provisioned; refusing to persist unhashed PII.",
      },
      { status: 503 },
    );
  }
  const msisdn = normalizeKenyanMsisdn(input.phoneNumber)!; // refined above
  const msisdnHash = await hmacSha256Hex(hashKey, msisdn);

  // Idempotent session resolution on the phone-identity index.
  const { data: existing, error: existingErr } = await supabase
    .from("registrations")
    .select("id, payment_status, stk_pushed_at, account_reference")
    .eq("msisdn_hash", msisdnHash)
    .maybeSingle<SessionRow>();
  if (existingErr) {
    return NextResponse.json(
      { success: false, status: "SERVER_ERROR", error: "Session lookup failed." },
      { status: 500 },
    );
  }
  if (existing && existing.payment_status === "PAYMENT_SETTLED") {
    return NextResponse.json(
      {
        success: false,
        status: "ALREADY_SETTLED",
        error: "This phone number has a settled registration.",
        registrationId: existing.id,
      },
      { status: 409 },
    );
  }

  let sessionId: string;
  let accountReference: string;

  if (existing) {
    sessionId = existing.id;
    accountReference = existing.account_reference;
    // Keep profile fields fresh on reuse (tier upgrades, typo fixes).
    await supabase
      .from("registrations")
      .update({
        full_name: input.parentName ?? input.athleteName,
        email: input.parentEmail,
        athlete_name: input.athleteName,
        tier: tierId,
        preferred_campus: input.preferredCampus ?? null,
        venture_context: tier.venture,
        amount_expected_kes: amountKes,
      })
      .eq("id", sessionId);
  } else {
    // ponytail: 3-try collision loop on the 4-char ATH code; ~1e6 space vs
    // hundreds of rows/season — switch to longer codes if volume 100x's.
    let created: { id: string } | null = null;
    let lastErr: { code?: string } | null = null;
    for (let attempt = 0; attempt < 3 && !created; attempt++) {
      accountReference = generateAthReference();
      const { data, error } = await supabase
        .from("registrations")
        .insert({
          account_reference: accountReference,
          msisdn_hash: msisdnHash,
          full_name: input.parentName ?? input.athleteName,
          email: input.parentEmail,
          athlete_name: input.athleteName,
          tier: tierId,
          preferred_campus: input.preferredCampus ?? null,
          venture_context: tier.venture,
          amount_expected_kes: amountKes,
        })
        .select("id")
        .single();
      created = data;
      lastErr = error;
      if (error && error.code !== "23505") break;
    }
    if (!created) {
      if (lastErr?.code === "42703" || lastErr?.code === "42P01" || lastErr?.code === "42501") {
        return NextResponse.json(
          {
            success: false,
            status: "SCHEMA_DEBT",
            error:
              "registrations checkout columns missing in deployed database. Apply migration " +
              "supabase/migrations/20260725120000_unified_intake_checkout.sql.",
          },
          { status: 503 },
        );
      }
      // 23505 exhausted: unique race on msisdn_hash (double-submit) — reuse.
      const { data: raced } = await supabase
        .from("registrations")
        .select("id, payment_status, stk_pushed_at, account_reference")
        .eq("msisdn_hash", msisdnHash)
        .maybeSingle<SessionRow>();
      if (raced && raced.payment_status !== "PAYMENT_SETTLED") {
        sessionId = raced.id;
        accountReference = raced.account_reference;
      } else {
        return NextResponse.json(
          { success: false, status: "SERVER_ERROR", error: "Session creation failed." },
          { status: 500 },
        );
      }
    } else {
      sessionId = created.id;
    }
  }

  // Best-effort STK push AFTER durable state (fail-soft, throttled).
  const lastPush = existing?.stk_pushed_at ? Date.parse(existing.stk_pushed_at) : null;
  const throttled = lastPush !== null && Date.now() - lastPush < STK_REDISPATCH_WINDOW_MS;

  let stk: { dispatched: boolean; reason?: string };
  let checkoutRequestId: string | null = null;
  if (throttled) {
    stk = { dispatched: false, reason: "STK re-dispatch throttled; manual Paybill fallback applies." };
  } else {
    const result = await initiateStkPush({
      amountKes,
      msisdn,
      accountReference: accountReference!,
      description: `${tier.venture} ${tier.label}`.slice(0, 60),
    });
    if (result.dispatched) {
      stk = { dispatched: true };
      checkoutRequestId = result.checkoutRequestId;
      await supabase
        .from("registrations")
        .update({
          stk_pushed_at: new Date().toISOString(),
          checkout_request_id: result.checkoutRequestId,
        })
        .eq("id", sessionId!);
    } else {
      stk = { dispatched: false, reason: result.reason };
    }
  }

  return NextResponse.json(
    {
      success: true,
      registrationId: sessionId!,
      checkoutRequestId,
      accountReference: accountReference!,
      amountKes,
      tier: tierId,
      stkPush: stk.dispatched
        ? { dispatched: true }
        : { dispatched: false, fallback: "MANUAL_PAYBILL", reason: stk.reason ?? "unknown" },
      payment: {
        railName: "M-Pesa Paybill (Athlytica Technologies Limited)",
        paybill: MPESA_PAYBILL,
        accountNumber: accountReference!,
        instruction:
          `An M-Pesa payment prompt ${stk.dispatched ? "has been sent to" : "could not be sent to"} your phone. ` +
          `If it does not appear, pay manually: Lipa na M-Pesa → Paybill → Business No. ${MPESA_PAYBILL} → ` +
          `Account No. ${accountReference!} → Amount KES ${amountKes}.`,
      },
    },
    { status: existing ? 200 : 202 },
  );
}
