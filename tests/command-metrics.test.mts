// Run: node --test tests/command-metrics.test.mts
//
// Guards the command canvas arithmetic. Every one of these is a figure a
// founder or a head coach would act on, so a silent regression here is a
// wrong decision downstream:
//
//   · verification ratio       — what the platform claims is verified
//   · anomaly detection        — which records must NOT auto-promote
//   · approval gating          — critical flags block one-click approval
//   · readiness / compliance   — the coach's two headline numbers
//   · hub geography            — a hub landing in the wrong region
//
// The fixture is deliberately dirty (duplicate identity, reused ID
// document, impossible biometric, buffered edge queue).

import assert from "node:assert/strict";
import test from "node:test";
import { COMMAND_FIXTURE, FIXTURE_NOW } from "../lib/services/command-fixture.ts";
import { buildCommand, emptyCommand, nextWindow } from "../lib/services/command-metrics.ts";
import { regionOf, tierOf } from "../config/command.ts";

const payload = buildCommand(COMMAND_FIXTURE, FIXTURE_NOW);

test("verification ratio counts verified provenance over registered passports", () => {
  assert.equal(payload.passports.total, 9);
  assert.equal(payload.passports.verified, 3);
  assert.equal(payload.passports.pending, 2);
  assert.equal(payload.passports.disputed, 1);
  assert.equal(payload.passports.unverified, 3);
  assert.equal(payload.passports.ratioPct, 33); // 3/9
  assert.equal(payload.passports.estimatedDob, 1);
});

test("hubs resolve to African regions from the country code", () => {
  assert.equal(regionOf("KEN"), "east");
  assert.equal(regionOf("ZAF"), "south");
  assert.equal(regionOf("NGA"), "west");
  assert.equal(regionOf(null), "unassigned");

  const uganda = payload.hubs.find((h) => h.name === "Kampala Inline Collective");
  assert.equal(uganda?.region, "east");
  const capeTown = payload.hubs.find((h) => h.name === "Cape Town Ice Guild");
  assert.equal(capeTown?.region, "south");
  // A tenant with no country of its own inherits its twin club's.
  const tta = payload.hubs.find((h) => h.hubId.startsWith("tenant:") && h.name.includes("TTA"));
  assert.equal(tta?.region, "east");
});

test("hub status distinguishes live, onboarding and dormant", () => {
  const academy = payload.hubs.find((h) => h.name === "TTA International Football Academy" && h.kind === "club");
  assert.equal(academy?.status, "live"); // sessions inside the 90-day window
  assert.equal(academy?.athletes, 4);
  assert.equal(academy?.verified, 3); // Grace is staged, not yet verified

  const capeTown = payload.hubs.find((h) => h.name === "Cape Town Ice Guild");
  assert.equal(capeTown?.status, "onboarding"); // roster, no telemetry
  const fed = payload.hubs.find((h) => h.kind === "federation");
  assert.equal(fed?.status, "dormant"); // nothing registered against it
});

test("integrity engine finds duplicates, bad birth dates and consent gaps", () => {
  const codes = payload.integrity.cases.map((c) => c.code);
  assert.ok(codes.includes("DUPLICATE_IDENTITY"), "two Samuel Kiprop passports must collide");
  assert.ok(codes.includes("DUPLICATE_NATIONAL_ID"), "one ID document across two athletes");
  assert.ok(codes.includes("DOB_IMPLAUSIBLE"), "a 1968 birth date is not a youth athlete");
  assert.ok(codes.includes("DOB_ESTIMATED"));
  assert.ok(codes.includes("BIOMETRIC_OUT_OF_RANGE"), "241cm / 12kg is impossible");
  assert.ok(codes.includes("NO_GUARDIAN_CONSENT"), "minor without consent on file");
  assert.ok(payload.integrity.counts.critical >= 4);
});

test("critical anomalies block one-click promotion, clean records allow it", () => {
  const queue = payload.audit.queue;
  assert.equal(queue.length, payload.audit.counts.total);

  const duplicate = queue.find((i) => i.subject.startsWith("Sam") && i.recordKind === "passport");
  assert.ok(duplicate, "the duplicate identity must be staged, not silently dropped");
  assert.equal(duplicate?.approvable, false);
  assert.match(String(duplicate?.blockedReason), /Duplicate identity/);

  // The impossible biometric is a warning, not a hard block — but it is
  // never presented as clean.
  const biometric = queue.find((i) => i.recordKind === "biometric");
  assert.ok(biometric);
  assert.ok(biometric.flags.some((f) => f.code === "BIOMETRIC_OUT_OF_RANGE"));

  // A documented, consented, flag-free intake is the one thing a single
  // click may promote.
  const clean = queue.find((i) => i.subject.startsWith("Grace"));
  assert.equal(clean?.approvable, true);
  assert.equal(clean?.blockedReason, null);
  assert.equal(payload.audit.counts.approvable, 1);

  // Telemetry has no provenance row, so it is never one-click approvable.
  const telemetry = queue.filter((i) => i.recordKind === "telemetry");
  assert.ok(telemetry.length > 0);
  assert.ok(telemetry.every((i) => i.approvable === false && i.provenanceId === null));

  // Provenance rows carry the origin hub and submitter for every item.
  for (const item of queue) {
    assert.equal(typeof item.hubName, "string");
    assert.equal(typeof item.submittedBy, "string");
    assert.equal(typeof item.dataSource, "string");
  }
  assert.equal(payload.audit.counts.approvable + payload.audit.counts.blocked, queue.length);
});

test("telemetry still buffered on the edge is staged and counted", () => {
  assert.equal(payload.edge.bufferedRecords, 2); // one processed row excluded
  assert.equal(payload.edge.failedRecords, 1);
  assert.equal(payload.edge.deadLetters, 1);
  assert.equal(payload.edge.unverifiedVenueLogs, 1);
  assert.equal(payload.edge.online, null); // only the browser knows
  assert.ok(payload.audit.queue.some((i) => i.recordKind === "telemetry"));
});

test("readiness index averages composites in the rolling window", () => {
  // Per athlete first, then across athletes — so A1's two readings inside
  // the window average to 63.8 rather than counting twice. A3's last
  // reading is 45 days old, so it falls back to its most recent value.
  assert.equal(payload.coach.readiness.sampleSize, 4);
  assert.equal(payload.coach.readiness.index, 55); // (63.8+42.6+32.3+80.2)/4 = 54.7
  assert.equal(payload.coach.readiness.windowDays, 30);
});

test("compliance counts only drills carrying all five axes", () => {
  // Six sessions, five inside 90 days; s5's log has a null technical axis
  // and s6 is outside the window.
  assert.equal(payload.coach.compliance.sessions, 5);
  assert.equal(payload.coach.compliance.complete, 4);
  assert.equal(payload.coach.compliance.pct, 80);
});

test("velocity matrix bands athletes and tracks 90-day movement", () => {
  assert.equal(tierOf(39.9), "beginner");
  assert.equal(tierOf(40), "intermediate");
  assert.equal(tierOf(80), "pro");
  assert.equal(tierOf(null), null);

  const byTier = new Map(payload.coach.velocity.map((v) => [v.tier, v]));
  assert.equal(byTier.get("advanced")?.count, 1); // A1 at 67.8
  assert.equal(byTier.get("pro")?.count, 1); // A3 at 80.2
  // A1 moved intermediate (51.8, 120d ago) → advanced (67.8).
  assert.equal(byTier.get("advanced")?.movedIn, 1);
  assert.equal(byTier.get("intermediate")?.movedOut, 1);
});

test("roster keeps athletes that have never been assessed", () => {
  const never = payload.coach.athletes.filter((a) => a.lastAssessedAt === null);
  assert.ok(never.length > 0, "an unmeasured athlete must not vanish from the roster");
  assert.ok(never.every((a) => a.tier === null && a.composite === null));
  assert.equal(payload.coach.athletes.length, 9);
});

test("coaching tracker reports per-coach silence in days", () => {
  const njoroge = payload.coach.coachLogs.find((c) => c.coachId === "coach_njoroge");
  assert.equal(njoroge?.athletes, 3);
  assert.equal(njoroge?.staleDays, 2);
  assert.equal(njoroge?.loggedToday, false);
});

test("revenue separates audited settlements from the raw rail", () => {
  assert.equal(payload.revenue.settledKes, 267_500);
  assert.equal(payload.revenue.railKes, 117_500); // the 1032 failure is excluded
  assert.equal(payload.revenue.last30Kes, 90_000);
  assert.equal(payload.revenue.arrRunRateKes, 1_080_000);
  assert.equal(payload.revenue.paidRegistrations, 4);
});

test("scout engagement is bounded and the ledger is classified", () => {
  assert.ok(payload.scout.engagementScore > 0 && payload.scout.engagementScore <= 100);
  assert.equal(payload.scout.exportsWindow, 2); // export + view event inside 90d
  const kinds = new Set(payload.ledger.map((l) => l.kind));
  assert.ok(kinds.has("export"));
  assert.ok(kinds.has("verification"));
  assert.ok(kinds.has("transfer"));
  assert.equal(payload.ledger[0]?.hashPrefix?.length, 12);
});

test("tenant health flags consent and sync problems", () => {
  const rink = payload.tenancy.find((t) => t.name === "Panari Sky Centre Rink");
  assert.equal(rink?.status, "blocked"); // sync failures + zero consent
  assert.ok(rink?.flags.some((f) => f.includes("sync failures")));
  const tta = payload.tenancy.find((t) => t.workspace === "tta");
  assert.equal(tta?.verifiedRatio, 100);
});

test("benchmark exposes the cohort mean beside the configured marks", () => {
  const speed = payload.benchmark.axes.find((a) => a.axis === "speed");
  assert.equal(speed?.regional, 55);
  assert.ok(speed?.cohort !== null && speed.cohort > 0);
  assert.ok(payload.benchmark.athletes.length > 0);
  assert.match(payload.benchmark.source, /not federation-published/);
});

test("next cohort window lands on the right weekday inside the season", () => {
  const saturday = nextWindow(
    {
      registry_id: "r",
      cohort_label: "x",
      track_type: null,
      session_day_of_week: 6,
      window_start_time: "09:00",
      window_end_time: "10:30",
      capacity: 10,
      season_start_date: "2026-07-01",
      season_end_date: "2026-12-01",
      student_athlete_id: null,
      enrollment_status: "enrolled",
    },
    FIXTURE_NOW.getTime(),
  );
  assert.ok(saturday);
  const at = new Date(saturday);
  assert.equal(at.getUTCDay(), 6);
  assert.ok(at.getTime() > FIXTURE_NOW.getTime());

  // A slot whose season has closed produces no window at all.
  const expired = nextWindow(
    {
      registry_id: "r",
      cohort_label: "x",
      track_type: null,
      session_day_of_week: 1,
      window_start_time: "09:00",
      window_end_time: "10:30",
      capacity: 10,
      season_start_date: "2025-01-01",
      season_end_date: "2025-03-01",
      student_athlete_id: null,
      enrollment_status: "enrolled",
    },
    FIXTURE_NOW.getTime(),
  );
  assert.equal(expired, null);
});

test("an empty platform renders zeros, never NaN or a throw", () => {
  const empty = emptyCommand(FIXTURE_NOW);
  assert.equal(empty.passports.ratioPct, 0);
  assert.equal(empty.coach.compliance.pct, 0);
  assert.equal(empty.coach.readiness.index, null);
  assert.equal(empty.hubs.length, 0);
  assert.equal(empty.audit.counts.total, 0);
  assert.equal(empty.revenue.arrRunRateKes, 0);
  assert.ok(empty.benchmark.axes.every((a) => a.cohort === null));
});
