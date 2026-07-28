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
  WORKSPACE_SLUGS,
  workspaceFromSlug,
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

// ---------------------------------------------------------------------
// ROUTE ALIASES — kebab URL slugs vs snake_case workspace ids.
// A slug that stops resolving silently 404s a whole venture.
// ---------------------------------------------------------------------

test("every workspace has a slug, and every slug round-trips", () => {
  for (const id of WORKSPACE_IDS) {
    const slug = WORKSPACE_SLUGS[id];
    assert.ok(slug, `${id} has no URL slug`);
    assert.equal(workspaceFromSlug(slug), id);
  }
});

test("the four documented tenant aliases resolve", () => {
  assert.equal(workspaceFromSlug("hq"), "athlytica_hq");
  assert.equal(workspaceFromSlug("nrhl"), "nrhl");
  assert.equal(workspaceFromSlug("big-ice"), "big_ice");
  assert.equal(workspaceFromSlug("tta"), "tta");
});

test("slugs are URL-safe kebab, never the snake_case id", () => {
  for (const id of WORKSPACE_IDS) {
    assert.match(WORKSPACE_SLUGS[id], /^[a-z0-9-]+$/, `${id} slug is not URL-safe`);
  }
  // big_ice would work as a path segment but splits the canonical URL in two.
  assert.equal(workspaceFromSlug("big_ice"), null);
});

test("slug lookup is case-insensitive but rejects junk", () => {
  assert.equal(workspaceFromSlug("BIG-ICE"), "big_ice");
  assert.equal(workspaceFromSlug("nope"), null);
  assert.equal(workspaceFromSlug(""), null);
  assert.equal(workspaceFromSlug(undefined), null);
});
