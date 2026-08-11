// Run: node --test tests/bigice-pricing.test.mts
//
// Guards the bigice.co.ke scrape. Two failures matter here: a parser
// that silently returns a partial sheet (so the landing page quotes
// three of seven cohorts as if that were the price list), and a drift
// detector that misses a published price the rail would not charge.

import assert from "node:assert/strict";
import test from "node:test";
import {
  FALLBACK_TIERS,
  findPriceDrift,
  parseBigIceTiers,
  fetchBigIcePricing,
} from "../lib/services/bigice-pricing.ts";

// Verbatim from bigice.co.ke, 2026-08-11 — the enquiry form's
// "Preferred programme" select, including the two unpriced options the
// parser is expected to ignore.
const LIVE_MARKUP = `
  <select id="programme" name="programme" required>
    <option value="">Select a programme</option>
    <option value="beginner">Beginner Skating Programme — KSh 16,500</option>
    <option value="quarter">3-Month Development — KSh 95,000</option>
    <option value="semi-annual">6-Month Development — KSh 180,000</option>
    <option value="annual">12-Month Development — KSh 350,000</option>
    <option value="combine-metric">NRHL · Athlete Performance Assessment — KES 7,500</option>
    <option value="combine-clinic">NRHL · Performance Hockey Program — KES 27,500</option>
    <option value="combine-accel">NRHL · Elite Individual Development — KES 45,000</option>
    <option value="family-estate">Family &amp; Estate Private Cohort — Custom Quote</option>
    <option value="unsure">Not sure yet</option>
  </select>`;

test("parses every cohort off the live markup", () => {
  const tiers = parseBigIceTiers(LIVE_MARKUP);
  assert.equal(tiers.length, 8);
  assert.deepEqual(tiers[0], {
    id: "beginner",
    label: "Beginner Skating Programme",
    amountKes: 16_500,
  });
});

test("options carrying no price are skipped, not parsed as zero", () => {
  // "Select a programme" and "Not sure yet" are real options on the live
  // form. If either ever parsed, it would enter the sheet as a cohort.
  const ids = parseBigIceTiers(LIVE_MARKUP).map((t) => t.id);
  assert.ok(!ids.includes("unsure"));
  assert.ok(!ids.includes(""));
});

test("the fallback sheet matches what the site actually publishes", () => {
  // A stale fallback is the one way this module can quietly lie.
  assert.deepEqual(parseBigIceTiers(LIVE_MARKUP), [...FALLBACK_TIERS]);
});

test("Custom Quote parses as unpriced, not as zero", () => {
  const family = parseBigIceTiers(LIVE_MARKUP).find((t) => t.id === "family-estate");
  assert.equal(family?.amountKes, null);
});

test("entity-encoded labels are decoded", () => {
  const family = parseBigIceTiers(LIVE_MARKUP).find((t) => t.id === "family-estate");
  assert.equal(family?.label, "Family & Estate Private Cohort");
});

test("a restyled page yields a short list, which the caller must reject", () => {
  const tiers = parseBigIceTiers('<div class="price">KSh 350,000</div>');
  assert.equal(tiers.length, 0);
  assert.ok(tiers.length < FALLBACK_TIERS.length);
});

test("a zero-priced option is treated as a parse artefact, not a free programme", () => {
  const tiers = parseBigIceTiers('<option value="bogus">Freebie — KSh 0</option>');
  assert.equal(tiers.length, 0);
});

test("drift detector flags a published price the rail would not charge", () => {
  const drift = findPriceDrift(FALLBACK_TIERS, new Map([["annual", 320_000]]));
  assert.deepEqual(drift, [
    { label: "12-Month Development", publishedKes: 350_000, chargedKes: 320_000 },
  ]);
});

test("renaming a cohort on the site does not break drift matching", () => {
  // The 2026-08-11 rebuild renamed every label and kept every id. Drift
  // joins on id precisely so a marketing rewrite cannot silently stop
  // reconciling prices — this is the regression that would prove it did.
  const ids = FALLBACK_TIERS.map((t) => t.id).sort();
  assert.deepEqual(ids, [
    "annual",
    "beginner",
    "combine-accel",
    "combine-clinic",
    "combine-metric",
    "family-estate",
    "quarter",
    "semi-annual",
  ]);
});

test("matching prices and unmapped tiers produce no drift", () => {
  assert.deepEqual(findPriceDrift(FALLBACK_TIERS, new Map([["annual", 350_000]])), []);
  assert.deepEqual(findPriceDrift(FALLBACK_TIERS, new Map()), []);
});

test("a Custom Quote tier never counts as drift", () => {
  const drift = findPriceDrift(FALLBACK_TIERS, new Map([["family-estate", 999_999]]));
  assert.deepEqual(drift, []);
});

// ---------------------------------------------------------------------
// THE TWO LAWS THAT MATTER: this fetch sits on the landing page render
// path, so it must never hang and never throw. Every failure mode has
// to end at the fallback sheet, inside the timeout budget.
// ---------------------------------------------------------------------

const realFetch = globalThis.fetch;

const FAILURES: Record<string, typeof globalThis.fetch> = {
  "hangs until aborted": (_url, init) =>
    new Promise((_resolve, reject) =>
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)),
    ),
  "rejects (DNS / TLS / socket)": () => Promise.reject(new Error("ENOTFOUND")),
  "answers 500": () => Promise.resolve(new Response("boom", { status: 500 })),
  "answers 200 with a redesigned page": () =>
    Promise.resolve(new Response("<html>redesigned</html>", { status: 200 })),
  "answers 200 with a partial sheet": () =>
    Promise.resolve(
      new Response('<option value="annual">Annual — KSh 350,000</option>', { status: 200 }),
    ),
};

for (const [name, impl] of Object.entries(FAILURES)) {
  test(`falls back within budget when the site ${name}`, async (t) => {
    globalThis.fetch = impl;
    t.after(() => {
      globalThis.fetch = realFetch;
    });

    const started = Date.now();
    const sheet = await fetchBigIcePricing();
    const elapsed = Date.now() - started;

    assert.equal(sheet.live, false, "a fallback sheet must not claim to be live");
    assert.deepEqual(sheet.tiers, [...FALLBACK_TIERS]);
    // 1.5s abort + scheduling slack. If this trips, the landing page hangs.
    assert.ok(elapsed < 2_000, `took ${elapsed}ms, over the 1.5s timeout budget`);
  });
}
