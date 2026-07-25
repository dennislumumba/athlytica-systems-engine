// =====================================================================
// TENANT-EXEMPT: pre-tenant identity creation endpoint.
// (.agentic-os/02_SECURITY_SWEEP.md §3 — exemption justification wrapper,
//  ratified 2026-07-12)
//
// WHY THE athlete_tenant_links BARRIER DOES NOT APPLY HERE:
//   1. This route CREATES passport-plane athlete identities from a
//      Google Forms webhook. At execution time the athlete has no
//      app-plane row and therefore no athlete_tenant_links edge to
//      verify — the boundary table is populated DOWNSTREAM of this
//      route, never consulted by it.
//   2. There is no tenant-scoped READ path: the request carries no
//      tenantId/athleteId selectors, returns only the identifiers it
//      just created, and leaks no cross-tenant state.
//   3. Authentication is machine-to-machine, not user-session:
//      HMAC-SHA256 over the raw body (timing-safe comparison) with
//      GOOGLE_FORMS_WEBHOOK_SECRET, verified BEFORE any parsing or
//      database work. An unauthenticated caller cannot reach the RPC.
//   4. All writes flow through the single hardened RPC
//      `onboard_athlete_from_google_form` (see
//      core-engine/schemas/onboarding_google_form_rpc.sql), which is
//      idempotent by form_response_id and bypasses RLS by design for
//      identity + billing bootstrap.
//
// STANDING CONDITIONS ON THIS EXEMPTION (violating any voids it):
//   a. No tenant-scoped read may ever be added to this route without
//      installing the full §2 barrier first.
//   b. The HMAC check must remain the first operation on the request.
//   c. Secrets remain server-side env only.
// =====================================================================
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "edge";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

const AthleteSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  dateOfBirth: z.string().regex(DATE_RE, "expected YYYY-MM-DD"),
  sexAtBirth: z.enum(["male", "female", "intersex", "undisclosed"]).optional(),
  nationalities: z.array(z.string().length(3)).max(5).optional(),
  primarySportCode: z.string().trim().min(1).max(64).default("ice_hockey"),
});

const EnrollmentSchema = z.object({
  selectedTierName: z.string().trim().min(1).max(200),
  trackType: z.enum(["basic_skating", "figure_skating_precision"]),
  cohortLabel: z.string().trim().min(1).max(200),
  sessionSlot: z.number().int().positive(),
  sessionDayOfWeek: z.number().int().min(0).max(6),
  windowStartTime: z.string().regex(TIME_RE, "expected HH:MM or HH:MM:SS"),
  windowEndTime: z.string().regex(TIME_RE, "expected HH:MM or HH:MM:SS"),
  capacity: z.number().int().positive(),
  seasonStartDate: z.string().regex(DATE_RE, "expected YYYY-MM-DD"),
  seasonEndDate: z.string().regex(DATE_RE, "expected YYYY-MM-DD"),
});

const GoogleFormWebhookSchema = z
  .object({
    formResponseId: z.string().trim().min(1).max(200),
    athlete: AthleteSchema,
    enrollment: EnrollmentSchema,
  })
  .strict();

type OnboardResult = {
  athlete_id: string;
  registry_id: string;
  tier_id: string;
  price_amount: number;
  currency: string;
  was_duplicate: boolean;
};

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Fixed-length hex digests, so a length check can't leak secret-dependent
// timing; the loop below never short-circuits on content.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(mac);
}

function log(level: "info" | "warn" | "error", requestId: string, msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({ requestId, level, msg, ...extra });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const secret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!secret || !supabaseUrl || !serviceRoleKey) {
      log("error", requestId, "missing_server_config");
      return NextResponse.json({ error: "Server misconfigured", requestId }, { status: 500 });
    }

    // Verify the HMAC signature over the raw body before touching the JSON,
    // so an unauthenticated caller can't reach parsing/validation/DB work.
    const rawBody = await req.text();
    const signatureHeader = req.headers.get("x-signature");
    const expectedHex = await computeHmacSha256Hex(secret, rawBody);

    if (!signatureHeader || !timingSafeEqualHex(signatureHeader.toLowerCase().trim(), expectedHex)) {
      log("warn", requestId, "signature_verification_failed");
      return NextResponse.json({ error: "Unauthorized", requestId }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body", requestId }, { status: 400 });
    }

    const parsed = GoogleFormWebhookSchema.safeParse(json);
    if (!parsed.success) {
      log("warn", requestId, "validation_failed", { issues: parsed.error.issues });
      return NextResponse.json(
        { error: "Invalid payload", issues: parsed.error.issues, requestId },
        { status: 400 }
      );
    }

    const { formResponseId, athlete, enrollment } = parsed.data;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabase.rpc("onboard_athlete_from_google_form", {
      p_form_response_id: formResponseId,
      p_legal_name: athlete.legalName,
      p_date_of_birth: athlete.dateOfBirth,
      p_sex_at_birth: athlete.sexAtBirth ?? null,
      p_nationalities: athlete.nationalities ?? [],
      p_primary_sport_code: athlete.primarySportCode,
      p_tier_name: enrollment.selectedTierName,
      p_track_type: enrollment.trackType,
      p_cohort_label: enrollment.cohortLabel,
      p_session_slot: enrollment.sessionSlot,
      p_session_day_of_week: enrollment.sessionDayOfWeek,
      p_window_start_time: enrollment.windowStartTime,
      p_window_end_time: enrollment.windowEndTime,
      p_capacity: enrollment.capacity,
      p_season_start_date: enrollment.seasonStartDate,
      p_season_end_date: enrollment.seasonEndDate,
    });

    if (error) {
      if (error.message?.includes("UNKNOWN_OR_INACTIVE_TIER")) {
        log("warn", requestId, "unknown_or_inactive_tier", { formResponseId });
        return NextResponse.json(
          { error: "Unknown or inactive commercial tier", requestId },
          { status: 422 }
        );
      }
      // Postgres error details (constraint names, values) stay server-side —
      // the caller only gets a generic message plus the requestId to correlate.
      log("error", requestId, "rpc_failed", { formResponseId, dbError: error.message, dbCode: error.code });
      return NextResponse.json({ error: "Onboarding failed", requestId }, { status: 500 });
    }

    const result = (data as OnboardResult[] | null)?.[0];
    if (!result) {
      log("error", requestId, "rpc_returned_no_row", { formResponseId });
      return NextResponse.json({ error: "Onboarding failed", requestId }, { status: 500 });
    }

    log("info", requestId, "onboarding_succeeded", {
      formResponseId,
      athleteId: result.athlete_id,
      registryId: result.registry_id,
      wasDuplicate: result.was_duplicate,
    });

    return NextResponse.json(
      {
        athleteId: result.athlete_id,
        registryId: result.registry_id,
        tier: { id: result.tier_id, priceAmount: result.price_amount, currency: result.currency },
        duplicate: result.was_duplicate,
        requestId,
      },
      { status: result.was_duplicate ? 200 : 201 }
    );
  } catch (err) {
    log("error", requestId, "unhandled_exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Internal server error", requestId }, { status: 500 });
  }
}
