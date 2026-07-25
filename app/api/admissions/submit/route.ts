// =====================================================================
// CONCIERGE ADMISSIONS INTAKE — POST /api/admissions/submit
//
// Lead capture for the Big Ice conversion landing's intake wizard
// (components/onboarding/get-intake-dialog.tsx). Concierge tiers
// (200k–1M KES) sit outside the unified M-Pesa tier taxonomy: no
// payment expectation here — every submission is appended to
// public.admissions_intakes (service-role only, RLS sealed) for
// founder follow-up. Fail-closed: missing Supabase env returns 503
// rather than silently discarding a lead.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const intakeSchema = z
  .object({
    parentName: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    athleteName: z.string().trim().min(2).max(120),
    program: z.string().trim().min(2).max(120),
    athleteGoal: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .strict();

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Malformed JSON body." },
      { status: 400 },
    );
  }

  const parsed = intakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: "Please complete the parent, email, athlete, and program fields.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      {
        success: false,
        error: "Intake storage is not provisioned. Please try again later.",
      },
      { status: 503 },
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await supabase.from("admissions_intakes").insert({
    parent_name: input.parentName,
    email: input.email,
    athlete_name: input.athleteName,
    program: input.program,
    athlete_goal: input.athleteGoal || null,
  });

  if (error) {
    return NextResponse.json(
      { success: false, error: "Unable to save admissions submission. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    message: `Admissions intake captured for ${input.athleteName} via ${input.program}. We'll reach out promptly.`,
    receivedAt: new Date().toISOString(),
  });
}
