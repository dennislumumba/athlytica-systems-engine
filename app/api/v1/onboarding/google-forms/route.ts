// =====================================================================
// RETIRED — GOOGLE FORMS INTAKE (D-26c, Phase 0.3H)
//
// This endpoint used to create a passport-plane athlete, a provenance
// row and a cohort_session_registry enrollment from a Google Forms
// webhook. It no longer creates anything.
//
// WHY IT WAS RETIRED. It never processed a real submission. All seven
// records it ever produced were synthetic — one athlete name, every
// submission id prefixed "test-", cohort "Test Cohort A", inside a
// 68-minute window on 2026-07-09 (see
// docs/phase0/GOOGLE_FORMS_ENROLLMENT_POLICY.md §0). Intake now runs
// through /register → stk-push → mpesa-callback, where the payment
// authorization boundary (M4) decides what a payment entitles someone
// to. A second intake door that could mint identity and write a priced
// enrollment with no payment was a liability with no users, so the owner
// retired it rather than fixing it.
//
// WHY THE FILE STILL EXISTS. The Google Apps Script trigger lives in the
// owner's Google account, outside this repository, and will keep POSTing
// until it is disabled there. Deleting this route would answer those
// requests with Next's generic 404, which reads like a deploy fault. A
// deterministic 410 says the channel is gone and names its replacement.
//
// WHAT IT MUST NEVER DO AGAIN — the whole point of the retirement:
//   * no athlete identity            * no Athlete ID from the sequence
//   * no enrollment                  * no guardian PII
//   * no payment record              * no portal entitlement
//
// It therefore builds no database client and reads no request body.
// There is nothing here to authenticate because there is nothing here to
// guard: the endpoint has no side effects at all.
//
// NOT REMOVED, DELIBERATELY:
//   * GOOGLE_FORMS_WEBHOOK_SECRET — despite the name, it is SHARED with
//     app/api/v1/sync/convex/route.ts, which is not retired. Removing it
//     would seal the Convex bridge.
//   * public.onboard_athlete_from_google_form and
//     public.google_form_submission_log — historical evidence for the
//     seven records. Orphaned by this change, service_role-only, and kept
//     so those rows stay readable and explainable.
// =====================================================================

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETIRED_ON = "2026-08-12";

const RETIRED_BODY = {
  status: "CHANNEL_RETIRED",
  error:
    "The Google Forms onboarding channel has been retired and no longer creates athletes or enrollments.",
  retiredOn: RETIRED_ON,
  decision: "D-26c",
  registerAt: "/register",
} as const;

/**
 * 410 Gone, not 404: the resource existed and has been intentionally
 * removed. A caller — including the Apps Script trigger still running in
 * the owner's Google account — gets an unambiguous answer rather than
 * something it could mistake for a deploy fault or a transient outage,
 * and retrying will never begin to work.
 */
function retired() {
  return NextResponse.json(RETIRED_BODY, { status: 410 });
}

export async function POST() {
  return retired();
}

export async function GET() {
  return retired();
}
