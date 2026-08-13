// Run: node --test tests/crm-metrics.test.mts
//
// Guards the CRM arithmetic. Every figure here is one a founder acts on,
// so a silent regression is a wrong decision downstream. The failure
// that matters most is the first block: BOOKED IS NOT COLLECTED.
//
// This database contains KES 658,000 of synthetic settlements classified
// TEST. If the collected figure ever stops filtering on the production
// receipt set, the dashboard reports money that does not exist.

import assert from "node:assert/strict";
import test from "node:test";
import {
  alertsFrom,
  buildCrmMetrics,
  collectedRegistrations,
  conversionFrom,
  duplicateContacts,
  kpiFrom,
  nairobiDay,
  pipelineFrom,
  revenueFrom,
  todayFrom,
} from "../lib/services/crm-metrics.ts";
import { BOARD_STAGES, STAGES, STAGE_PROBABILITY, listedPriceKes } from "../config/crm.ts";

const NOW = new Date("2026-08-13T09:00:00+03:00");
const NOW_MS = NOW.getTime();
const days = (n) => new Date(NOW_MS + n * 86_400_000).toISOString();
const day = (n) => days(n).slice(0, 10);

const opp = (over = {}) => ({
  opportunity_id: "o1",
  contact_id: "c1",
  organization_id: null,
  athlete_id: null,
  product: "nrhl_elite",
  source: "instagram",
  stage: "qualified",
  temperature: "warm",
  value_kes: 45_000,
  list_price_kes: 45_000,
  probability_pct: 40,
  expected_value_kes: 18_000,
  expected_close_date: null,
  assigned_to: null,
  registration_id: null,
  lost_reason: null,
  converted_at: null,
  created_at: days(-3),
  updated_at: days(-1),
  ...over,
});

const task = (over = {}) => ({
  task_id: "t1",
  contact_id: "c1",
  opportunity_id: "o1",
  title: "Follow up",
  description: null,
  due_date: day(0),
  priority: "medium",
  status: "pending",
  assigned_to: null,
  completed_at: null,
  created_at: days(-1),
  ...over,
});

const activity = (over = {}) => ({
  activity_id: "a1",
  contact_id: "c1",
  opportunity_id: "o1",
  activity_type: "call",
  subject: "Called",
  notes: null,
  outcome: null,
  occurred_at: days(-1),
  created_by: null,
  created_at: days(-1),
  ...over,
});

const input = (over = {}) => ({
  opportunities: [],
  tasks: [],
  activities: [],
  registrations: [],
  stageEvents: [],
  productionReceipts: new Set(),
  ...over,
});

// ---------------------------------------------------------------------
// Booked is not collected
// ---------------------------------------------------------------------

test("a settlement classified TEST is never counted as cash", () => {
  const data = input({
    opportunities: [opp({ stage: "won", converted_at: days(-1), registration_id: "r1" })],
    registrations: [
      {
        id: "r1",
        payment_status: "PAYMENT_SETTLED",
        amount_expected_kes: 45_000,
        settled_receipt: "AUDITTEST001",
        settled_at: days(-1),
        venture_context: "NRHL",
      },
    ],
    // AUDITTEST001 is deliberately absent from the production set.
    productionReceipts: new Set(["REALRECEIPT9"]),
  });

  const revenue = revenueFrom(data);
  assert.equal(revenue.wonKes, 45_000, "the deal is still booked as won");
  assert.equal(revenue.collectedKes, 0, "but a TEST receipt is not money");
  assert.equal(revenue.outstandingKes, 45_000);
});

test("the same settlement counts once the receipt is production-classified", () => {
  const data = input({
    opportunities: [opp({ stage: "won", converted_at: days(-1), registration_id: "r1" })],
    registrations: [
      {
        id: "r1",
        payment_status: "PAYMENT_SETTLED",
        amount_expected_kes: 45_000,
        settled_receipt: "SFG7HQ2LM9",
        settled_at: days(-1),
        venture_context: "NRHL",
      },
    ],
    productionReceipts: new Set(["SFG7HQ2LM9"]),
  });

  const revenue = revenueFrom(data);
  assert.equal(revenue.collectedKes, 45_000);
  assert.equal(revenue.outstandingKes, 0);
});

test("a pending registration is not cash however large the deal", () => {
  const collected = collectedRegistrations(
    [
      {
        id: "r1",
        payment_status: "PENDING_PAYMENT",
        amount_expected_kes: 350_000,
        settled_receipt: null,
        settled_at: null,
        venture_context: "BIG_ICE",
      },
    ],
    new Set(["ANY"]),
  );
  assert.equal(collected.size, 0);
});

test("money that landed against a deal still open is surfaced, not silently won", () => {
  const data = input({
    opportunities: [opp({ stage: "payment_pending", registration_id: "r1" })],
    registrations: [
      {
        id: "r1",
        payment_status: "PAYMENT_SETTLED",
        amount_expected_kes: 27_500,
        settled_receipt: "R1",
        settled_at: days(0),
        venture_context: "NRHL",
      },
    ],
    productionReceipts: new Set(["R1"]),
  });

  const revenue = revenueFrom(data);
  assert.equal(revenue.settledNotWon.length, 1);
  assert.equal(revenue.collectedKes, 27_500, "cash is cash even before the stage catches up");
  assert.equal(revenue.wonKes, 0);
});

// ---------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------

test("pipeline totals count open deals only", () => {
  const p = pipelineFrom([
    opp({ opportunity_id: "a", stage: "qualified", value_kes: 10_000, expected_value_kes: 4_000 }),
    opp({ opportunity_id: "b", stage: "won", value_kes: 90_000, expected_value_kes: 90_000, converted_at: days(-1) }),
    opp({ opportunity_id: "c", stage: "lost", value_kes: 50_000, expected_value_kes: 0, lost_reason: "price" }),
    opp({ opportunity_id: "d", stage: "nurture", value_kes: 30_000, expected_value_kes: 1_500 }),
  ]);

  assert.equal(p.openCount, 1);
  assert.equal(p.totalValueKes, 10_000, "won, lost and nurture are not pipeline");
  assert.equal(p.weightedValueKes, 4_000);
  // Every stage present still gets a bucket, in board order.
  assert.deepEqual(p.byStage.map((b) => b.stage), ["qualified", "won", "lost", "nurture"]);
});

test("the board shows the eight stages the brief specifies, nurture excluded", () => {
  assert.deepEqual(BOARD_STAGES, [
    "new",
    "contacted",
    "qualified",
    "meeting",
    "proposal",
    "payment_pending",
    "won",
    "lost",
  ]);
  assert.equal(STAGES.nurture.state, "parked");
});

test("stage probabilities rise monotonically to payment pending", () => {
  const order = ["new", "contacted", "qualified", "meeting", "proposal", "payment_pending", "won"];
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(
      STAGE_PROBABILITY[order[i]] > STAGE_PROBABILITY[order[i - 1]],
      `${order[i]} must be likelier than ${order[i - 1]}`,
    );
  }
  assert.equal(STAGE_PROBABILITY.lost, 0);
});

// ---------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------

test("overdue is measured against the Nairobi calendar day", () => {
  assert.equal(nairobiDay(Date.parse("2026-08-13T22:30:00Z")), "2026-08-14", "UTC+3 rolls over first");

  const t = todayFrom(
    input({
      tasks: [
        task({ task_id: "late", due_date: day(-2) }),
        task({ task_id: "now", due_date: day(0) }),
        task({ task_id: "soon", due_date: day(3) }),
        task({ task_id: "done", due_date: day(-9), status: "completed", completed_at: days(-8) }),
      ],
    }),
    NOW_MS,
  );

  assert.deepEqual(t.overdue.map((x) => x.task_id), ["late"]);
  assert.deepEqual(t.dueToday.map((x) => x.task_id), ["now"]);
  assert.equal(t.overdue.length + t.dueToday.length, 2, "a completed task is never overdue");
});

test("hot leads exclude closed deals", () => {
  const t = todayFrom(
    input({
      opportunities: [
        opp({ opportunity_id: "hot-open", temperature: "hot" }),
        opp({ opportunity_id: "hot-won", temperature: "hot", stage: "won", converted_at: days(-1) }),
      ],
    }),
    NOW_MS,
  );
  assert.deepEqual(t.hotLeads.map((o) => o.opportunity_id), ["hot-open"]);
});

// ---------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------

test("a lost deal still counts as having reached the stages it passed through", () => {
  const c = conversionFrom(
    input({
      opportunities: [opp({ opportunity_id: "o1", stage: "lost", lost_reason: "price" })],
      stageEvents: [
        { opportunity_id: "o1", field: "stage", new_value: "contacted", changed_at: days(-5) },
        { opportunity_id: "o1", field: "stage", new_value: "qualified", changed_at: days(-4) },
        { opportunity_id: "o1", field: "stage", new_value: "meeting", changed_at: days(-3) },
        { opportunity_id: "o1", field: "stage", new_value: "lost", changed_at: days(-2) },
      ],
    }),
  );

  assert.equal(c.reached.qualified, 1);
  assert.equal(c.reached.meeting, 1);
  assert.equal(c.reached.proposal, 0);
  assert.equal(c.reached.won, 0);
  assert.equal(c.steps[0].ratePct, 100); // 1 of 1 leads reached qualified
  assert.equal(c.steps[3].ratePct, null, "nothing reached proposal, so the rate is unknown, not 0%");
});

test("non-stage audit rows never move the funnel", () => {
  const c = conversionFrom(
    input({
      opportunities: [opp({ stage: "new" })],
      stageEvents: [{ opportunity_id: "o1", field: "value_kes", new_value: "won", changed_at: days(-1) }],
    }),
  );
  assert.equal(c.reached.won, 0);
});

// ---------------------------------------------------------------------
// KPI and alerts
// ---------------------------------------------------------------------

test("this week's KPI ignores work older than seven days", () => {
  const k = kpiFrom(
    input({
      opportunities: [opp({ opportunity_id: "new", created_at: days(-2) }), opp({ opportunity_id: "old", created_at: days(-30) })],
      activities: [activity({ occurred_at: days(-2) }), activity({ activity_id: "a2", occurred_at: days(-20) })],
      tasks: [task({ status: "completed", completed_at: days(-1) }), task({ task_id: "t2", status: "completed", completed_at: days(-40) })],
    }),
    NOW_MS,
  );

  assert.equal(k.newLeads, 1);
  assert.equal(k.salesCalls, 1);
  assert.equal(k.followUpsCompleted, 1);
  assert.equal(k.cashCollectedKes, 0);
  assert.equal(k.kesPerActivity, 0, "activity with no cash is zero, not a divide-by-zero");
});

test("kesPerActivity is unknown rather than zero when nothing was logged", () => {
  assert.equal(kpiFrom(input(), NOW_MS).kesPerActivity, null);
});

test("an open deal with no pending task is flagged, a closed one is not", () => {
  const a = alertsFrom(
    input({
      opportunities: [
        opp({ opportunity_id: "bare" }),
        opp({ opportunity_id: "covered" }),
        opp({ opportunity_id: "closed", stage: "won", converted_at: days(-1) }),
      ],
      tasks: [task({ opportunity_id: "covered" })],
    }),
    NOW_MS,
  );
  assert.deepEqual(a.withoutNextAction.map((o) => o.opportunity_id), ["bare"]);
});

test("stale means untouched past the configured window, and only while open", () => {
  const a = alertsFrom(
    input({
      opportunities: [
        opp({ opportunity_id: "stale", updated_at: days(-20) }),
        opp({ opportunity_id: "fresh", updated_at: days(-2) }),
        opp({ opportunity_id: "old-but-won", stage: "won", converted_at: days(-30), updated_at: days(-30) }),
      ],
    }),
    NOW_MS,
  );
  assert.deepEqual(a.stale.map((o) => o.opportunity_id), ["stale"]);
});

// ---------------------------------------------------------------------
// Data quality
// ---------------------------------------------------------------------

test("duplicate detection groups by phone, email and name", () => {
  const dupes = duplicateContacts([
    { contact_id: "1", full_name: "Grace Wanjiru", phone: "254712345678", email: "g@example.test" },
    { contact_id: "2", full_name: "grace  wanjiru", phone: null, email: null },
    { contact_id: "3", full_name: "Other Parent", phone: "254712345678", email: null },
    { contact_id: "4", full_name: "Unique Person", phone: "254700000000", email: null },
  ]);

  const phone = dupes.find((d) => d.reason === "phone");
  assert.deepEqual(phone?.contactIds, ["1", "3"]);
  const name = dupes.find((d) => d.reason === "name");
  assert.deepEqual(name?.contactIds, ["1", "2"], "whitespace and case are not a different person");
  assert.equal(dupes.some((d) => d.contactIds.includes("4")), false);
});

test("a contact with no phone or email never pairs with another on a null", () => {
  const dupes = duplicateContacts([
    { contact_id: "1", full_name: "A Person", phone: null, email: null },
    { contact_id: "2", full_name: "B Person", phone: null, email: null },
  ]);
  assert.deepEqual(dupes, []);
});

// ---------------------------------------------------------------------
// Products and prices
// ---------------------------------------------------------------------

test("listed prices come from the intake tier table, never a second copy", () => {
  assert.equal(listedPriceKes("nrhl_standard"), 27_500);
  assert.equal(listedPriceKes("nrhl_elite"), 45_000);
  assert.equal(listedPriceKes("athlytica_individual"), 7_500);
  assert.equal(listedPriceKes("athlytica_organization"), 150_000);
  // Big Ice cohorts price from commercial_price_tier, read live.
  assert.equal(listedPriceKes("bigice_annual"), null);
  assert.equal(listedPriceKes("other"), null);
});

// ---------------------------------------------------------------------
// Whole-payload sanity: an empty CRM must not throw or invent numbers.
// ---------------------------------------------------------------------

test("an empty pipeline produces zeros and nulls, never NaN", () => {
  const m = buildCrmMetrics(input(), NOW);
  assert.equal(m.pipeline.totalValueKes, 0);
  assert.equal(m.pipeline.weightedValueKes, 0);
  assert.equal(m.revenue.wonKes, 0);
  assert.equal(m.revenue.collectedKes, 0);
  assert.equal(m.kpi.kesPerActivity, null);
  for (const step of m.conversion.steps) assert.equal(step.ratePct, null);
  assert.deepEqual(m.today.overdue, []);
});

test("one contact can carry several deals across ventures at once", () => {
  const m = buildCrmMetrics(
    input({
      opportunities: [
        opp({ opportunity_id: "nrhl", product: "nrhl_standard", value_kes: 27_500, expected_value_kes: 11_000 }),
        opp({ opportunity_id: "bigice", product: "bigice_annual", value_kes: 350_000, expected_value_kes: 140_000 }),
      ],
    }),
    NOW,
  );
  assert.equal(m.pipeline.openCount, 2);
  assert.equal(m.pipeline.totalValueKes, 377_500);
  assert.equal(m.pipeline.weightedValueKes, 151_000);
});
