// Run: node --test tests/workspace-rbac.test.mts
//
// Guards the RBAC gate that decides which dashboard panels a role sees.
// If this breaks, an ATHLETE or HEAD_COACH can be shown the Paybill
// stream or the permission matrix — the one failure here that matters.

import assert from "node:assert/strict";
import test from "node:test";
import {
  GLOBAL_FOUNDER_EMAIL,
  NAV,
  WORKSPACE_IDS,
  canSee,
  visibleNav,
} from "../config/workspaces.ts";

const ids = (workspace, role, perspective) =>
  visibleNav(workspace, role, perspective).map((n) => n.id);

test("founder sees every panel in executive view", () => {
  for (const workspace of WORKSPACE_IDS) {
    assert.deepEqual(
      ids(workspace, "GLOBAL_FOUNDER", "executive"),
      NAV[workspace].map((n) => n.id),
    );
  }
});

test("coach view hides financial and admin panels from the founder", () => {
  assert.deepEqual(ids("nrhl", "GLOBAL_FOUNDER", "coach"), ["roster", "league-ops"]);
  assert.deepEqual(ids("athlytica_hq", "GLOBAL_FOUNDER", "coach"), []);
});

test("head coach never sees money or the permission matrix", () => {
  for (const workspace of WORKSPACE_IDS) {
    for (const id of ids(workspace, "HEAD_COACH", "executive")) {
      const item = NAV[workspace].find((n) => n.id === id);
      assert.notEqual(item.group, "financial", `${id} leaked to HEAD_COACH`);
      assert.notEqual(item.group, "admin", `${id} leaked to HEAD_COACH`);
    }
  }
  assert.equal(canSee("HEAD_COACH", "financial"), false);
  assert.equal(canSee("HEAD_COACH", "admin"), false);
});

test("athlete sees only self-scoped panels", () => {
  for (const workspace of WORKSPACE_IDS) {
    assert.deepEqual(ids(workspace, "ATHLETE", "executive"), []);
  }
  assert.equal(canSee("ATHLETE", "self"), true);
  assert.equal(canSee("ATHLETE", "tactical"), false);
});

test("root founder identity is the hardcoded lowercase address", () => {
  assert.equal(GLOBAL_FOUNDER_EMAIL, "dennis@bigice.co.ke");
  assert.equal(GLOBAL_FOUNDER_EMAIL, GLOBAL_FOUNDER_EMAIL.toLowerCase());
});
