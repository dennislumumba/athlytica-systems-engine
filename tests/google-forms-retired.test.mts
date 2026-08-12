// =====================================================================
// THE GOOGLE FORMS DOOR IS CLOSED (D-26c, Phase 0.3H)
//
// /api/v1/onboarding/google-forms used to create a passport athlete, a
// provenance row and a priced cohort enrollment from a webhook. It was
// retired because it never served a real customer: all seven records it
// ever produced were one synthetic athlete submitted seven times in a
// 68-minute window.
//
// This replaces tests/google-forms-enrollment-policy.test.mts, which
// guarded the live path's boundaries. Those guards are obsolete in the
// best way — the thing they constrained no longer exists — and keeping
// them would assert that a retired door still works.
//
// What matters now is that the retirement STAYS a retirement. A route
// file is an easy place to reintroduce a creation path: someone restores
// a git revision, or "fixes" the 410 by wiring it back up. These guards
// fail if any of that happens.
//
// The endpoint is deliberately inert rather than authenticated: there is
// nothing to guard because there are no side effects. So these tests
// assert ABSENCE of capability, which is the only correct assertion for
// a retired surface.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GFORMS = "app/api/v1/onboarding/google-forms/route.ts";
const CONVEX = "app/api/v1/sync/convex/route.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * Source with comments removed.
 *
 * These files explain themselves at length, and the retired route
 * deliberately NAMES the objects it no longer touches in order to record
 * why they were kept. A guard that greps raw text fails on that prose —
 * which it did, on the first run of this very file. Assert against code.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

test("the retired endpoint answers 410 and nothing else", () => {
  const src = read(GFORMS);

  assert.match(src, /status: 410/, "a retired channel must answer 410 Gone");
  assert.match(src, /CHANNEL_RETIRED/, "the response must name the retirement");

  // 404 would read as a deploy fault to the Apps Script trigger still
  // running in the owner's Google account; 200 would imply it worked.
  assert.ok(!/status: 20[0-9]/.test(src), "the retired endpoint must never answer 2xx");
});

test("the retired endpoint cannot create an athlete, enrollment or guardian", () => {
  const src = code(GFORMS);

  // No client, therefore no writes of any kind. This is stronger than
  // checking individual table names: without a Supabase client there is
  // no reachable write at all.
  assert.ok(
    !/createClient|adminClient/.test(src),
    "the retired endpoint must not build a database client",
  );
  assert.ok(!/\.rpc\(/.test(src), "the retired endpoint must call no RPC");
  assert.ok(!/\.from\(/.test(src), "the retired endpoint must query no table");

  for (const forbidden of [
    "onboard_athlete_from_google_form",
    "cohort_session_registry",
    "provenance",
    "link_guardian",
  ]) {
    assert.ok(!src.includes(forbidden), `the retired endpoint must not reference ${forbidden}`);
  }
});

test("the retired endpoint cannot mint an Athlete ID", () => {
  const src = code(GFORMS);
  assert.ok(
    !/next_athlete_code|scalable_id_sequence/.test(src),
    "a retired door must never draw from the identifier sequence",
  );
});

test("the retired endpoint cannot create payment records", () => {
  const src = code(GFORMS);
  for (const money of [
    "payment_events",
    "settle_payment_transaction",
    "payment_service_authorization",
    "record_classification",
    "registrations",
  ]) {
    assert.ok(!src.includes(money), `the retired endpoint must not touch ${money}`);
  }
});

test("the retired endpoint reads no request body", () => {
  const src = code(GFORMS);
  // Nothing is parsed, so nothing caller-supplied reaches any code path.
  assert.ok(
    !/req\.json\(\)|req\.text\(\)|request\.json\(\)|request\.text\(\)/.test(src),
    "an inert endpoint must not read the request body",
  );
});

test("no source file calls the orphaned Google Forms RPC", () => {
  // The RPC and its log table are KEPT — they are the only way to read and
  // explain the seven historical rows, and dropping them would delete
  // audit capability. They are service_role-only and now have no caller.
  // If a caller ever reappears, the door is effectively reopened in the
  // database even though the route is inert.
  const callers = [
    GFORMS,
    CONVEX,
    "app/api/v1/biz/mpesa-callback/route.ts",
    "app/api/v1/biz/retry-onboarding/route.ts",
    "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts",
    "app/api/v1/leagues/nrhl/ingest/route.ts",
    "lib/services/bigice-onboarding.ts",
  ];
  for (const f of callers) {
    assert.ok(
      !code(f).includes("onboard_athlete_from_google_form"),
      `${f} must not call the retired onboarding RPC`,
    );
  }
});

test("the Convex bridge keeps the shared secret the retirement did not remove", () => {
  // GOOGLE_FORMS_WEBHOOK_SECRET is named for the retired channel but is
  // SHARED: app/api/v1/sync/convex authenticates with it too. Removing it
  // as "dead Google Forms config" would have sealed a live surface. This
  // guard exists so the next person to tidy up finds out here rather than
  // in production.
  const convex = code(CONVEX);
  assert.match(
    convex,
    /process\.env\.GOOGLE_FORMS_WEBHOOK_SECRET/,
    "the Convex bridge still depends on this secret — do not remove it",
  );
  assert.ok(
    !code(GFORMS).includes("GOOGLE_FORMS_WEBHOOK_SECRET"),
    "the retired route must no longer consume the shared secret in code",
  );
});
