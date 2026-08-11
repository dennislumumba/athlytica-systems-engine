// Run: node --test tests/callback-secret.test.mts
//
// The comparison behind BOTH settlement entry points: the header one
// (bank rails, ops tooling) and the URL one Safaricom uses, because it
// cannot send a custom header. A settled payment authorises a place in a
// programme, so a secret that compares loosely here is a free enrolment.

import assert from "node:assert/strict";
import test from "node:test";
import { secretMatches } from "../utils/opsGuard.ts";

const ENV = "MPESA_CALLBACK_SECRET";
const GOOD = "s3ttl3ment-secret-long-enough";
const realValue = process.env[ENV];

function withSecret(v: string | undefined) {
  if (v === undefined) delete process.env[ENV];
  else process.env[ENV] = v;
}

function restore() {
  withSecret(realValue);
}

test("the exact secret authorises", async (t) => {
  withSecret(GOOD);
  t.after(restore);
  assert.equal(await secretMatches(GOOD, ENV), true);
});

test("anything other than the exact secret is refused", async (t) => {
  withSecret(GOOD);
  t.after(restore);
  for (const presented of [
    GOOD.slice(0, -1), // one character short
    GOOD + "x", // one character long
    GOOD.toUpperCase(), // case must matter
    ` ${GOOD}`, // a stray space from a pasted URL
    `${GOOD}/`, // a trailing slash off the callback path
    "",
    null,
    undefined,
  ]) {
    assert.equal(
      await secretMatches(presented, ENV),
      false,
      `accepted ${JSON.stringify(presented)}`,
    );
  }
});

test("an unset secret seals the surface rather than opening it", async (t) => {
  withSecret(undefined);
  t.after(restore);
  // The dangerous bug would be undefined === undefined passing.
  assert.equal(await secretMatches(undefined, ENV), false);
  assert.equal(await secretMatches("", ENV), false);
  assert.equal(await secretMatches("anything", ENV), false);
});

test("a trivially short secret is treated as unset", async (t) => {
  withSecret("tooshort");
  t.after(restore);
  // Presenting the correct-but-weak value must still fail: the bar is on
  // the configured secret, not on the caller's luck.
  assert.equal(await secretMatches("tooshort", ENV), false);
});

test("comparison does not short-circuit on a shared prefix", async (t) => {
  withSecret(GOOD);
  t.after(restore);
  // Digest comparison means a caller cannot learn the secret one
  // character at a time from response timing. This asserts the property
  // that makes that true: a long shared prefix is no closer to accepted
  // than a completely different string.
  assert.equal(await secretMatches(GOOD.slice(0, GOOD.length - 1) + "!", ENV), false);
  assert.equal(await secretMatches("completely-different-value-here", ENV), false);
});
