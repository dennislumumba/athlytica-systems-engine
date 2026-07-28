// Run: node --test tests/landing-route.test.mts
//
// Guards the post-authentication redirect table. If this breaks, sign-in
// drops people on the wrong dashboard — or, in the open-redirect case,
// on somebody else's domain.

import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCESS_PENDING_ROUTE,
  COMMAND_CANVAS_ROUTE,
  LEAGUE_COMMAND_ROUTE,
  PROFILE_SETUP_ROUTE,
  VENTURE_ROUTE,
  landingFor,
  safeRedirectTo,
} from "../lib/auth/landing.ts";

test("root founder lands on the league command centre", () => {
  assert.equal(landingFor({ isFounder: true, roles: {} }), LEAGUE_COMMAND_ROUTE);
});

test("a GLOBAL_FOUNDER grant is enough, without the root email", () => {
  assert.equal(
    landingFor({ isFounder: false, roles: { nrhl: "GLOBAL_FOUNDER" } }),
    LEAGUE_COMMAND_ROUTE,
  );
});

test("head coach lands on the command canvas", () => {
  assert.equal(
    landingFor({ isFounder: false, roles: { big_ice: "HEAD_COACH" } }),
    COMMAND_CANVAS_ROUTE,
  );
});

test("founder outranks a coach grant held in another workspace", () => {
  assert.equal(
    landingFor({ isFounder: false, roles: { big_ice: "HEAD_COACH", nrhl: "GLOBAL_FOUNDER" } }),
    LEAGUE_COMMAND_ROUTE,
  );
});

test("athlete lands on their venture dashboard", () => {
  assert.equal(landingFor({ isFounder: false, roles: { nrhl: "ATHLETE" } }), VENTURE_ROUTE);
});

test("a grantless account with no profile is sent to fill one in", () => {
  assert.equal(landingFor({ isFounder: false, roles: {} }), PROFILE_SETUP_ROUTE);
});

test("a grantless account that already filed a profile waits, not loops", () => {
  // Sending them back to the form they just submitted is the bug this
  // flag exists to prevent.
  assert.equal(
    landingFor({ isFounder: false, roles: {}, hasProfile: true }),
    ACCESS_PENDING_ROUTE,
  );
});

test("a grant always outranks the profile step", () => {
  // The founder onboarded out-of-band and must never see the form.
  assert.equal(landingFor({ isFounder: true, roles: {}, hasProfile: false }), LEAGUE_COMMAND_ROUTE);
  assert.equal(
    landingFor({ isFounder: false, roles: { nrhl: "ATHLETE" }, hasProfile: false }),
    VENTURE_ROUTE,
  );
});

test("no actor at all falls back to the login screen", () => {
  assert.equal(landingFor(null), "/login");
  assert.equal(landingFor(undefined), "/login");
});

test("every landing route is a dashboard path, so / cannot ping-pong", () => {
  for (const route of [
    LEAGUE_COMMAND_ROUTE,
    COMMAND_CANVAS_ROUTE,
    VENTURE_ROUTE,
    ACCESS_PENDING_ROUTE,
  ]) {
    assert.ok(route.startsWith("/dashboard"), `${route} is not behind the auth guard`);
  }
  // /onboarding is the one landing route outside the shell — it has to
  // be, because the shell refuses to render for an actor with no grant,
  // which is exactly who needs it. It runs its own session check.
  assert.equal(PROFILE_SETUP_ROUTE, "/onboarding");
});

test("safeRedirectTo rejects off-origin targets", () => {
  assert.equal(safeRedirectTo("//evil.com"), null);
  assert.equal(safeRedirectTo("https://evil.com"), null);
  assert.equal(safeRedirectTo("evil.com"), null);
  assert.equal(safeRedirectTo(""), null);
  assert.equal(safeRedirectTo(null), null);
});

test("safeRedirectTo keeps same-origin deep links intact", () => {
  assert.equal(
    safeRedirectTo("/dashboard/leagues/nrhl/drafting?round=2"),
    "/dashboard/leagues/nrhl/drafting?round=2",
  );
});
