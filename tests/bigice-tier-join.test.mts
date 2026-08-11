// Run: node --test tests/bigice-tier-join.test.mts
//
// Guards the commercial_price_tier.tier_name -> bigice.co.ke cohort slug
// join, which is the one link in price reconciliation that fails
// SILENTLY. When it broke on 2026-08-11 (the tier rows were renamed to
// match the rebuilt site and the map was not), nothing threw: `charged`
// came out empty and findPriceDrift reported no drift, which reads
// identically to "every published price is correct".
//
// So these tests assert the join produces something, not merely that it
// does not crash.

import assert from "node:assert/strict";
import test from "node:test";
import {
  chargedBySlug,
  FALLBACK_TIERS,
  findPriceDrift,
} from "../lib/services/bigice-pricing.ts";

/** The live academy rows, as commercial_price_tier holds them. */
const ACADEMY_ROWS = [
  { tier_name: "Beginner Skating Programme", price_amount: "16500.00" },
  { tier_name: "3-Month Development", price_amount: "95000.00" },
  { tier_name: "6-Month Development", price_amount: "180000.00" },
  { tier_name: "12-Month Development", price_amount: "350000.00" },
];

test("every live academy tier maps to a cohort slug", () => {
  const { charged, unmapped } = chargedBySlug(ACADEMY_ROWS);
  assert.deepEqual(unmapped, [], "an unmapped tier is excluded from drift detection");
  assert.equal(charged.size, ACADEMY_ROWS.length);
});

test("the mapped slugs are ones the published sheet actually uses", () => {
  // A slug that matches nothing in the sheet reconciles against nothing,
  // which is the same silent no-op by a different route.
  const { charged } = chargedBySlug(ACADEMY_ROWS);
  const published = new Set(FALLBACK_TIERS.map((t) => t.id));
  for (const slug of charged.keys()) {
    assert.ok(published.has(slug), `slug "${slug}" is not published on the site`);
  }
});

test("prices matching the published sheet produce no drift", () => {
  const { charged } = chargedBySlug(ACADEMY_ROWS);
  assert.deepEqual(findPriceDrift(FALLBACK_TIERS, charged), []);
});

test("a real price mismatch is still detected through the join", () => {
  // The whole point of the chain. If this passes while the first test
  // fails, reconciliation is dead and looks alive.
  const { charged } = chargedBySlug([
    ...ACADEMY_ROWS.slice(0, 3),
    { tier_name: "12-Month Development", price_amount: "320000.00" },
  ]);
  assert.deepEqual(findPriceDrift(FALLBACK_TIERS, charged), [
    { label: "12-Month Development", publishedKes: 350_000, chargedKes: 320_000 },
  ]);
});

test("a renamed tier is reported, not silently dropped", () => {
  // Exactly the 2026-08-11 regression: the row exists and is sold, the
  // map has not caught up.
  const { charged, unmapped } = chargedBySlug([
    { tier_name: "Quarterly", price_amount: "95000.00" },
  ]);
  assert.deepEqual(unmapped, ["Quarterly"]);
  assert.equal(charged.size, 0);
});

test("a zero or unparseable price never enters the charged map", () => {
  const { charged } = chargedBySlug([
    { tier_name: "3-Month Development", price_amount: "0" },
    { tier_name: "6-Month Development", price_amount: "not-a-number" },
  ]);
  assert.equal(charged.size, 0);
});
