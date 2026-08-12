// =====================================================================
// GUARDIAN SCOPE — the parent portal's cross-account boundary.
//
// resolveGuardian() decides which children a signed-in address may see.
// It matches guardian_email with ILIKE, which makes the matched value a
// PATTERN, and an email local part may legally contain `_` — a
// single-character wildcard. `likeEscape` is what stops one family's
// sign-in from reaching another's record.
//
// Measured against the live test corpus before the fix: the pattern
// `audit-parent-_@example.test` returned three athletes across two
// unrelated families, where the literal address named two.
// =====================================================================

import { test } from "node:test";
import assert from "node:assert/strict";

import { likeEscape } from "../lib/auth/like-escape.ts";

/** What Postgres ILIKE would do with the pattern, for the cases we care about. */
function likeMatches(pattern: string, value: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]!;
    if (c === "\\") {
      // Escaped: the next character is a literal.
      const next = pattern[++i];
      if (next !== undefined) re += next.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      continue;
    }
    if (c === "%") re += ".*";
    else if (c === "_") re += ".";
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`, "i").test(value);
}

test("an underscore in an email is a wildcard until it is escaped", () => {
  const signedInAs = "john_smith@gmail.com";
  const someoneElse = "johnXsmith@gmail.com";

  // The defect: the raw address reaches another household's record.
  assert.ok(likeMatches(signedInAs, someoneElse));

  // The fix: it reaches exactly itself.
  assert.ok(!likeMatches(likeEscape(signedInAs), someoneElse));
  assert.ok(likeMatches(likeEscape(signedInAs), signedInAs));
});

test("a percent in an email cannot widen the match either", () => {
  // Rarer than `_`, and far worse: one address would return every
  // athlete in the table.
  const greedy = "a%@example.com";
  assert.ok(likeMatches(greedy, "anybody@example.com"));
  assert.ok(!likeMatches(likeEscape(greedy), "anybody@example.com"));
  assert.ok(likeMatches(likeEscape(greedy), "a%@example.com"));
});

test("ordinary addresses are unchanged", () => {
  // The escape must not alter the overwhelmingly common case — a
  // guardian whose row stopped matching is a parent locked out of their
  // own child's portal, which is the same failure wearing a hat.
  for (const email of [
    "dennis@bigice.co.ke",
    "parent.name@example.co.ke",
    "first+tag@gmail.com",
    "PARENT@EXAMPLE.COM",
  ]) {
    assert.equal(likeEscape(email), email);
    assert.ok(likeMatches(likeEscape(email), email));
  }
});

test("the escape character itself is escaped", () => {
  // A trailing lone backslash would otherwise escape the closing quote
  // of the pattern rather than a character in it.
  assert.equal(likeEscape("a\\b@x.com"), "a\\\\b@x.com");
  assert.ok(likeMatches(likeEscape("a\\b@x.com"), "a\\b@x.com"));
});
