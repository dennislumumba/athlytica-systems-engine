// =====================================================================
// PUBLIC PASSPORT VERIFICATION — GET /api/v1/public/nrhl/verify?code=ATH-00047
//
// The trust-layer lookup a parent or scout runs from nairobihockey.com.
// It answers exactly one question: is this athlete code real, and is it
// cleared for league play.
//
// WHAT IT DELIBERATELY DOES NOT RETURN: guardian name, phone, email,
// date of birth, conduct record, composite score, or any performance
// figure. A verification tool that leaks a minor's profile to anyone who
// can guess a five-digit number is not a trust layer, it is a directory.
// The athlete's name appears only where marketing consent was granted.
//
// Enumeration: a caller can walk the code space and learn which codes
// exist. That is acceptable because existence is the only fact exposed,
// and it is the fact the tool is for. Do not extend this response with
// anything that would make enumeration worth doing.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { adminClient, serviceRoleConfigured } from "@/lib/auth/workspace";
import { athleteCodeSchema } from "@/lib/validation/nrhl-schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get("code") ?? "").trim().toUpperCase();
  const parsed = athleteCodeSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, found: false, error: "Athlete codes look like ATH-00047." },
      { status: 400, headers: CORS },
    );
  }

  if (!serviceRoleConfigured()) {
    return NextResponse.json(
      { success: false, found: false, error: "Verification is temporarily unavailable." },
      { status: 503, headers: CORS },
    );
  }

  const db = adminClient();
  const { data, error } = await db
    .from("nrhl_athlete")
    .select(
      "athlete_code, display_name, consent_media, division, team, draft_locked_at, certificate_tier, certificate_issued_at, passport_issued_at",
    )
    .eq("athlete_code", parsed.data)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { success: false, found: false, error: "Verification is temporarily unavailable." },
      { status: 503, headers: CORS },
    );
  }
  if (!data) {
    return NextResponse.json(
      { success: true, found: false, code: parsed.data },
      { headers: CORS },
    );
  }

  return NextResponse.json(
    {
      success: true,
      found: true,
      code: String(data.athlete_code),
      // Consent gate, same rule as the public feed.
      name: data.consent_media === "GRANTS" ? String(data.display_name) : null,
      registered: true,
      passportIssued: Boolean(data.passport_issued_at),
      certified: Boolean(data.certificate_issued_at),
      certificateTier: data.certificate_issued_at ? data.certificate_tier : null,
      conference: data.division ?? null,
      squad: data.draft_locked_at ? data.team : null,
      draftEligible: Boolean(data.passport_issued_at),
      // Combine participation is mandatory for draft eligibility — say so
      // in the response so the widget does not have to hardcode policy.
      note: data.passport_issued_at
        ? "Passport issued. Cleared for the January 2027 draft."
        : "Registered. A Performance ID is required before draft seeding.",
    },
    { headers: CORS },
  );
}
