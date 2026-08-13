// Run: node --test tests/crm-permissions.test.mts
//
// Guards the CRM's access boundary. Two failures matter here and both
// are silent:
//
//   1. A coach reaching commercial data. The CRM holds parents' phone
//      numbers, what they were quoted, and what they refused to pay.
//      A HEAD_COACH grant must not open it.
//   2. A SALES_OPS grant reaching a venture dashboard. That payload is
//      all-or-nothing — payment_events, the registration ledger and the
//      permission matrix — because role filtering happens client-side at
//      render. If the workspace route stops checking, granting sales
//      access silently hands over the whole ledger.
//
// Test 2 is asserted against the ROUTE SOURCE, not just the predicate,
// because a correct predicate nobody calls protects nothing.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  CRM_ROLES,
  VENTURE_DASHBOARD_ROLES,
  WORKSPACE_ROLES,
  canOpenCrm,
  canOpenVentureDashboard,
  canSee,
} from "../config/workspaces.ts";
import { CRM_ROUTE, landingFor } from "../lib/auth/landing.ts";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const WORKSPACE_ROUTE = "app/api/v1/workspace/dashboard/route.ts";
const CRM_API_ROUTE = "app/api/v1/crm/route.ts";

// ---------------------------------------------------------------------
// Who may open the CRM
// ---------------------------------------------------------------------

test("only the founder and sales operations open the CRM", () => {
  assert.deepEqual([...CRM_ROLES], ["GLOBAL_FOUNDER", "SALES_OPS"]);
  assert.equal(canOpenCrm("GLOBAL_FOUNDER"), true);
  assert.equal(canOpenCrm("SALES_OPS"), true);
  assert.equal(canOpenCrm("HEAD_COACH"), false, "a coach has no commercial business");
  assert.equal(canOpenCrm("ATHLETE"), false);
});

test("every declared role is decided one way or the other", () => {
  for (const role of WORKSPACE_ROLES) {
    assert.equal(typeof canOpenCrm(role), "boolean", `${role} must have a CRM answer`);
    assert.equal(typeof canOpenVentureDashboard(role), "boolean");
  }
});

// ---------------------------------------------------------------------
// A sales grant must not become a venture grant
// ---------------------------------------------------------------------

test("SALES_OPS cannot open a venture dashboard payload", () => {
  assert.equal(VENTURE_DASHBOARD_ROLES.includes("SALES_OPS"), false);
  assert.equal(canOpenVentureDashboard("SALES_OPS"), false);
  assert.equal(canOpenVentureDashboard("GLOBAL_FOUNDER"), true);
  assert.equal(canOpenVentureDashboard("HEAD_COACH"), true);
  assert.equal(canOpenVentureDashboard("ATHLETE"), true);
});

test("the workspace route actually calls the guard", () => {
  const source = read(WORKSPACE_ROUTE);
  assert.ok(
    source.includes("canOpenVentureDashboard(role)"),
    `${WORKSPACE_ROUTE} must gate on canOpenVentureDashboard — a grant alone is not a key to that payload`,
  );
  // The guard has to sit before the data is assembled, not after.
  assert.ok(
    source.indexOf("canOpenVentureDashboard(role)") < source.indexOf("await hqData(db)"),
    "the guard must run before any venture payload is built",
  );
});

test("SALES_OPS sees no venture panels even if a dashboard were reached", () => {
  for (const group of ["financial", "tactical", "admin"]) {
    assert.equal(canSee("SALES_OPS", group), false, `SALES_OPS must not see ${group} panels`);
  }
  assert.equal(canSee("SALES_OPS", "self"), true);
});

// ---------------------------------------------------------------------
// The CRM route's own gate
// ---------------------------------------------------------------------

test("both CRM handlers gate on athlytica_hq and CRM_ROLES", () => {
  const source = read(CRM_API_ROUTE);
  const gates = source.match(/requireWorkspaceRole\(request, "athlytica_hq", CRM_ROLES\)/g) ?? [];
  assert.equal(gates.length, 2, "GET and POST must each be gated");

  for (const handler of ["export async function GET", "export async function POST"]) {
    const start = source.indexOf(handler);
    assert.ok(start > -1, `${handler} must exist`);
    const body = source.slice(start, start + 400);
    assert.ok(
      body.includes("requireWorkspaceRole"),
      `${handler} must gate before doing anything else`,
    );
  }
});

test("the CRM route never trusts a client-supplied actor", () => {
  const source = read(CRM_API_ROUTE);
  assert.ok(source.includes("gate.actor.userId"), "the acting user comes from the verified token");
  assert.ok(
    !/last_actor:\s*command\./.test(source),
    "last_actor must never be read from the request body — it is the audit trail's author",
  );
});

// ---------------------------------------------------------------------
// The CRM must not leak through the all-or-nothing workspace payload
// ---------------------------------------------------------------------

test("no crm_ table is read by the workspace dashboard route", () => {
  const source = read(WORKSPACE_ROUTE);
  const leaks = [...source.matchAll(/from\("(crm_[a-z_]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(
    leaks,
    [],
    `the workspace payload is all-or-nothing; it must not carry CRM rows (found: ${leaks.join(", ")})`,
  );
});

test("cash collected is derived from the production view, never the raw ledger", () => {
  const source = read(CRM_API_ROUTE);
  assert.ok(
    source.includes('from("payment_events_production")'),
    "the CRM must read the classification-filtered view",
  );
  assert.ok(
    !/from\("payment_events"\)/.test(source),
    "the CRM must never read payment_events directly — that ledger includes TEST receipts",
  );
});

// ---------------------------------------------------------------------
// Landing
// ---------------------------------------------------------------------

test("a sales account lands on the pipeline, not on an access-denied screen", () => {
  assert.equal(landingFor({ isFounder: false, roles: { athlytica_hq: "SALES_OPS" } }), CRM_ROUTE);
});

test("the CRM landing never outranks the founder or a coach", () => {
  assert.equal(
    landingFor({ isFounder: true, roles: { athlytica_hq: "SALES_OPS" } }),
    "/dashboard/leagues/nrhl/overview",
  );
  assert.equal(
    landingFor({ isFounder: false, roles: { nrhl: "HEAD_COACH", athlytica_hq: "SALES_OPS" } }),
    "/dashboard",
  );
});

test("an athlete who also sells lands on the pipeline they signed in for", () => {
  assert.equal(
    landingFor({ isFounder: false, roles: { big_ice: "ATHLETE", athlytica_hq: "SALES_OPS" } }),
    CRM_ROUTE,
  );
});
