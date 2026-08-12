// =====================================================================
// REVENUE READS MUST NOT USE THE RAW PAYMENT LEDGER
//
// public.payment_events is the immutable record of everything that
// arrived, including settlements classified TEST/AUDIT/DEMO in
// record_classification (D-22). Production holds five such rows totalling
// KES 658,000 — a figure that was, until M3, reported as revenue by both
// the HQ dashboard and the cash-watcher run-rate.
//
// public.payment_events_production is the same table minus anything
// explicitly classified as not-production. Every figure that represents
// MONEY must read the view. Listing reads may keep the raw ledger — an
// operator inspecting the rail should see everything that arrived.
//
// This is a source assertion rather than a query test because both
// consumers are Next route handlers that need a live Supabase client and
// a service-role key; there is no fixture layer to run them against. It
// still catches the regression that matters: someone changing a revenue
// read back to the raw table.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DASHBOARD = "app/api/v1/workspace/dashboard/route.ts";
const CASH_WATCHER = "app/api/v1/biz/cash-watcher/route.ts";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** Every `.from("…")` target in a file, in source order. */
function fromTargets(src: string): string[] {
  return [...src.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]!);
}

test("cash-watcher reads the production view, never the raw ledger", () => {
  const targets = fromTargets(read(CASH_WATCHER));

  // Every figure this route emits — grossCollectedKes, avgTicketKes, the
  // run rate — is money. There is no legitimate raw read here at all.
  assert.ok(
    targets.includes("payment_events_production"),
    "cash-watcher must read payment_events_production",
  );
  assert.ok(
    !targets.includes("payment_events"),
    "cash-watcher must NOT read payment_events: every number it emits is revenue",
  );
});

test("the dashboard's railTotalKes feed reads the production view", () => {
  const src = read(DASHBOARD);

  // The feed that railTotalKes reduces over is the one selecting
  // result_code alongside amount_kes. Pin the pairing rather than a line
  // number, which drifts.
  const revenueFeed =
    /\.from\("payment_events_production"\)\s*\.select\("[^"]*amount_kes[^"]*result_code[^"]*"\)/;
  assert.match(
    src,
    revenueFeed,
    "the railTotalKes feed must select from payment_events_production",
  );

  assert.ok(
    src.includes("railTotalKes"),
    "guard is anchored on railTotalKes; if that identifier is renamed, update this test",
  );
});

test("listing reads deliberately keep the raw ledger", () => {
  const targets = fromTargets(read(DASHBOARD));

  // Two non-financial reads remain on payment_events by design: the NRHL
  // recent-payments list and the Big Ice metrics feed. If these ever drop
  // to zero the raw ledger has become unreachable from the dashboard,
  // which hides real settlement activity from operators.
  const raw = targets.filter((t) => t === "payment_events").length;
  assert.equal(
    raw,
    2,
    `expected exactly 2 raw payment_events reads (NRHL list + Big Ice feed), found ${raw}. ` +
      "Adding one may mean a revenue path regressed to the raw ledger; removing one may " +
      "mean operators lost visibility of test settlements.",
  );
});

test("no revenue reducer sums over a raw payment_events feed", () => {
  const src = read(DASHBOARD);

  // railTotalKes is the only place payment rows are summed into money.
  // Assert the reducer exists and that the variable it consumes is derived
  // from the production feed, not a raw one.
  assert.match(
    src,
    /const railTotalKes = settledPayments\.reduce\(/,
    "railTotalKes reducer shape changed; re-verify which feed it consumes",
  );
  assert.match(
    src,
    /const settledPayments = payments\.filter\(/,
    "settledPayments derivation changed; re-verify its source feed",
  );
});
