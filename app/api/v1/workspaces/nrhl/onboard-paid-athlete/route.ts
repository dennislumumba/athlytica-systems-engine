// =====================================================================
// PAID-ATHLETE ONBOARDING WEBHOOK
// POST /api/v1/workspaces/nrhl/onboard-paid-athlete
//
// The endpoint nairobihockey.com calls once a package payment verifies.
// It mints the athlete's ATH-00xxx code and files the guardian record.
//
// AUTHENTICATION: HMAC-SHA256 over the raw body, keyed with
// NRHL_WEBHOOK_SECRET, sent as `X-Athlytica-Signature: sha256=<hex>`.
// Compared in constant time. An unset secret SEALS the route (503) — it
// never falls open, because an open version of this endpoint lets any
// caller conjure a paid registration.
//
// IDEMPOTENCY: keyed on the athlete's canonical name, so a webhook
// retry (which every gateway does) updates the existing record and
// returns the same code instead of minting a second identity for one
// child. That is the exact failure that produced the ATH-047 collision
// in the legacy data.
//
// WHERE THE PARENT RECORD GOES: both places, because they hold
// different things. athlytica_core.parents is the core identity row and
// carries only (phone_number, is_verified) — it is written through
// public.link_guardian(), a definer RPC, because athlytica_core is
// not exposed to PostgREST. The resulting parent_id is stored on
// nrhl_athlete.core_parent_id. Guardian name, email and the media
// consent election have no column in athlytica_core.parents, so they
// stay on nrhl_athlete, which is what the Roster tab's Parent Identity
// Sync reads.
//
// THIS IS NOT THE SETTLEMENT AUTHORITY. Money truth arrives only via
// /api/v1/biz/mpesa-callback and settle_payment_transaction(). This
// route records who was onboarded; it never flips a payment gate.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { adminClient, serviceRoleConfigured } from "@/lib/auth/workspace";
import { divisionSchema, kenyanPhoneSchema } from "@/lib/validation/nrhl-schemas";
import { REGISTRATION_TIERS } from "@/config/registration-fees";
import { canonicalName } from "@/lib/services/nrhl-etl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const payloadSchema = z
  .object({
    athleteName: z.string().trim().min(2).max(120),
    athleteAge: z.number().int().min(4).max(60).nullish(),
    guardianName: z.string().trim().min(2).max(120),
    guardianEmail: z.string().trim().toLowerCase().email().max(254),
    guardianPhone: kenyanPhoneSchema,
    tier: z.enum(["combine_27500", "acceleration_45000", "baseline_7500", "enterprise_150k"]),
    amountKes: z.number().positive().finite(),
    mpesaReceipt: z.string().trim().min(4).max(64),
    preferredConference: divisionSchema.nullish(),
    consentMedia: z.enum(["GRANTS", "DENIES"]).nullish(),
  })
  .strict();

/** Constant-time compare that cannot throw on a length mismatch. */
function signatureMatches(expected: string, provided: string | null): boolean {
  if (!provided) return false;
  const clean = provided.startsWith("sha256=") ? provided.slice(7) : provided;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(clean, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.NRHL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        status: "CONFIG_DEBT",
        error: "NRHL_WEBHOOK_SECRET is not provisioned; the onboarding webhook is sealed.",
      },
      { status: 503 },
    );
  }
  if (!serviceRoleConfigured()) {
    return NextResponse.json(
      { success: false, status: "CONFIG_DEBT", error: "Database credentials are not provisioned." },
      { status: 503 },
    );
  }

  // Signature is computed over the EXACT bytes received — re-serialising
  // parsed JSON would change key order and break every valid signature.
  const rawBody = await request.text();
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!signatureMatches(expected, request.headers.get("x-athlytica-signature"))) {
    return NextResponse.json({ success: false, error: "Invalid signature." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid payload.", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // The advertised price is server-side truth; a webhook claiming a
  // 27,500 package was paid for 500 is a mismatch worth surfacing, not
  // silently accepting.
  const expectedKes = REGISTRATION_TIERS[input.tier].amountKes;
  const amountMismatch = input.amountKes !== expectedKes;

  const name = canonicalName(input.athleteName) ?? input.athleteName.trim();
  const db = adminClient();

  const { data: existing, error: lookupError } = await db
    .from("nrhl_athlete")
    .select("athlete_code")
    .eq("display_name", name)
    .maybeSingle();
  if (lookupError) {
    return NextResponse.json({ success: false, error: lookupError.message }, { status: 500 });
  }

  // Core identity row for the household. Idempotent on phone number, so
  // a retry or a sibling registration resolves to the same parent.
  // A failure here must not lose the registration — the guardian fields
  // on nrhl_athlete are written either way and the link can be repaired.
  let coreParentId: string | null = null;
  const { data: parentId, error: parentError } = await db.rpc("link_guardian", {
    p_phone_e164: input.guardianPhone,
  });
  if (!parentError && typeof parentId === "string") coreParentId = parentId;

  let athleteCode = existing?.athlete_code ? String(existing.athlete_code) : null;
  let minted = false;
  if (!athleteCode) {
    const { data: next, error: seqError } = await db.rpc("nrhl_next_athlete_code");
    if (seqError || typeof next !== "string") {
      return NextResponse.json(
        { success: false, error: seqError?.message ?? "Athlete code sequence unavailable." },
        { status: 500 },
      );
    }
    athleteCode = next.trim();
    minted = true;
  }

  const { error: upsertError } = await db.from("nrhl_athlete").upsert(
    {
      athlete_code: athleteCode,
      display_name: name,
      division: input.preferredConference ?? null,
      guardian_name: input.guardianName,
      guardian_email: input.guardianEmail,
      guardian_phone_e164: input.guardianPhone,
      core_parent_id: coreParentId,
      consent_media: input.consentMedia ?? null,
      consent_recorded_at: input.consentMedia ? new Date().toISOString() : null,
      identity_note: `Onboarded from a paid ${input.tier} registration (receipt ${input.mpesaReceipt}).`,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "display_name" },
  );
  if (upsertError) {
    return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    athleteCode,
    minted,
    guardianLinked: coreParentId !== null,
    coreParentId,
    // Self-selection contradicts the territorial seeding model, so the
    // preference is recorded and flagged rather than treated as final.
    conferencePending: Boolean(input.preferredConference),
    amountMismatch: amountMismatch
      ? { received: input.amountKes, expected: expectedKes }
      : null,
    next: "Baseline assessment session required before a Performance ID is issued.",
  });
}
