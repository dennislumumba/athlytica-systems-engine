// Run: node --test tests/bigice-onboarding-pack.test.mts
//
// Guards the documents a paying family actually receives. Every failure
// here is silent and reaches a customer: a document that carries league
// language onto a Big Ice parent's welcome pack, an unversioned artifact
// that cannot be told apart from a later revision, or a dead portal link
// typed on a first evening.

import assert from "node:assert/strict";
import test from "node:test";
import {
  bigIceOnboardingEmail,
  bigIceOnboardingPack,
  PACK_VERSION,
  type BigIceVars,
} from "../lib/services/bigice-onboarding-pack.ts";

const VARS: BigIceVars = {
  athleteName: "Amara Wanjiku",
  athleteId: "BIIF-2026-0501",
  parentName: "Grace Wanjiku",
  parentEmail: "grace@example.com",
  programmeName: "Beginner Skating Programme",
  amountKes: 16_500,
  location: "Spring Valley",
  registrationReference: "REG-#abc123",
  paymentReference: "SJ12AB34CD",
  portalUrl: "https://portal.example.com/portal",
};

test("a new family gets the welcome pack, a returning one does not", () => {
  const fresh = bigIceOnboardingPack(VARS).map((d) => d.slug);
  assert.deepEqual(fresh, ["receipt", "welcome", "portal-instructions"]);

  // §19: re-sending "here is what an Athlete ID is" to a family on their
  // third programme reads as though we have forgotten them.
  const returning = bigIceOnboardingPack(VARS, { returning: true }).map((d) => d.slug);
  assert.deepEqual(returning, ["receipt", "programme-confirmation", "portal-instructions"]);
});

test("every document is stamped with the pack version", () => {
  for (const doc of bigIceOnboardingPack(VARS)) {
    assert.equal(doc.version, PACK_VERSION, `${doc.slug} carries no version`);
    assert.ok(doc.html.includes(PACK_VERSION), `${doc.slug} does not print its version`);
  }
});

test("no portal host means no portal document, rather than a dead link", () => {
  const { portalUrl: _omitted, ...noPortal } = VARS;
  const slugs = bigIceOnboardingPack(noPortal as BigIceVars).map((d) => d.slug);
  assert.deepEqual(slugs, ["receipt", "welcome"]);
});

test("Big Ice documents carry no NRHL identity", () => {
  // §60 — the two brands must not blur. A parent who bought skating
  // lessons should never read league, draft or division language.
  const forbidden = [/NRHL/i, /\bdraft\b/i, /\bdivision\b/i, /Nairobi Regional/i];
  for (const doc of [...bigIceOnboardingPack(VARS), ...bigIceOnboardingPack(VARS, { returning: true })]) {
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(doc.html), `${doc.slug} contains ${pattern}`);
    }
  }
});

test("the Athlete ID is never presented as a credential", () => {
  const welcome = bigIceOnboardingPack(VARS).find((d) => d.slug === "welcome")!;
  // §14/§68 — the pack has to say this out loud, because an ID printed
  // beside a portal address invites a parent to try signing in with it.
  assert.match(welcome.html, /identifier, not a password/i);
});

test("registration values are escaped into the document", () => {
  const hostile = { ...VARS, athleteName: '<script>alert("x")</script>' };
  for (const doc of bigIceOnboardingPack(hostile)) {
    assert.ok(!doc.html.includes("<script>"), `${doc.slug} interpolated raw markup`);
  }
});

test("the receipt states what was actually charged", () => {
  const receipt = bigIceOnboardingPack(VARS).find((d) => d.slug === "receipt")!;
  assert.ok(receipt.html.includes("16,500"));
  assert.ok(receipt.html.includes("SJ12AB34CD"));
  assert.ok(receipt.html.includes("4325935")); // the live paybill
});

test("a missing amount prints as unknown rather than zero", () => {
  // "KES 0" on a receipt for a paid programme is a support call.
  const receipt = bigIceOnboardingPack({ ...VARS, amountKes: null }).find(
    (d) => d.slug === "receipt",
  )!;
  assert.ok(!/KES 0\b/.test(receipt.html));
});

test("the covering email names the athlete and the ID", () => {
  const { subject, html } = bigIceOnboardingEmail(VARS);
  assert.match(subject, /Welcome to Big Ice/);
  assert.ok(html.includes("BIIF-2026-0501"));
  assert.ok(html.includes("Amara Wanjiku"));

  const back = bigIceOnboardingEmail(VARS, { returning: true });
  assert.match(back.subject, /programme confirmed/i);
});
