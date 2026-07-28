// =====================================================================
// SELF-SERVICE PROFILE — GET/POST /api/v1/onboarding/profile
//
//   GET  → { profile: Profile | null }   the caller's own row
//   POST → { profile: Profile }          create or update it
//
// A PROFILE IS A CLAIM, NOT A GRANT (see the migration header). This
// route can never widen access: it writes user_profiles and nothing
// else, and every write is pinned to the token's own user id — the
// payload's user_id, if any, is ignored rather than trusted.
//
// requested_workspace / requested_role are what the person SAYS they
// are. Turning that into access stays a founder action in the HQ
// permission matrix, because the workspace endpoint hands a venture's
// full payload to any role holding a grant.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { WORKSPACE_IDS } from "@/config/workspaces";
import { adminClient, resolveActor, serviceRoleConfigured } from "@/lib/auth/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUESTED_ROLES = ["ATHLETE", "PARENT", "COACH", "SCOUT"] as const;

// Mirrors the CHECK constraints in
// supabase/migrations/20260728150000_user_profiles.sql. Both or neither.
const ProfileInput = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(20).optional().or(z.literal("")),
    requestedWorkspace: z.enum(WORKSPACE_IDS as [string, ...string[]]),
    requestedRole: z.enum(REQUESTED_ROLES),
    note: z.string().trim().max(500).optional().or(z.literal("")),
  })
  .strict();

const COLUMNS = "user_id, full_name, phone, requested_workspace, requested_role, note, created_at, updated_at";

const CONFIG_DEBT = {
  success: false,
  status: "CONFIG_DEBT",
  error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not provisioned.",
};

export async function GET(request: NextRequest) {
  if (!serviceRoleConfigured()) return NextResponse.json(CONFIG_DEBT, { status: 503 });
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  const { data, error } = await adminClient()
    .from("user_profiles")
    .select(COLUMNS)
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, profile: data ?? null });
}

export async function POST(request: NextRequest) {
  if (!serviceRoleConfigured()) return NextResponse.json(CONFIG_DEBT, { status: 503 });
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = ProfileInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        status: "INPUT_REJECTED",
        error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      },
      { status: 422 },
    );
  }
  const input = parsed.data;

  const { data, error } = await adminClient()
    .from("user_profiles")
    .upsert(
      {
        // Pinned to the verified token, never to anything in the body.
        user_id: actor.userId,
        full_name: input.fullName,
        phone: input.phone || null,
        requested_workspace: input.requestedWorkspace,
        requested_role: input.requestedRole,
        note: input.note || null,
      },
      { onConflict: "user_id" },
    )
    .select(COLUMNS)
    .single();

  if (error) {
    // 42P01 = table absent: the migration has not been applied here.
    if (error.code === "42P01") {
      return NextResponse.json(
        {
          success: false,
          status: "SCHEMA_DEBT",
          error: "public.user_profiles is missing — apply 20260728150000_user_profiles.sql.",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, profile: data });
}
