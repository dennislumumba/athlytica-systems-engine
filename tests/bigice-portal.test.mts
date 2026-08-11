// Run: node --test tests/bigice-portal.test.mts
//
// Guards the two portal derivations a parent acts on. A wrong "next
// session" sends a child to a closed rink, and invented progress is the
// one thing the portal brief forbids outright — neither failure throws,
// so neither is visible without these.

import assert from "node:assert/strict";
import test from "node:test";
import {
  nextOccurrence,
  nextSession,
  normaliseDayOfWeek,
  progressState,
  type CohortSlot,
} from "../lib/services/bigice-portal.ts";

/** The live cohort row shape: Wednesdays 16:00–17:00, Sep–Dec 2026. */
const WEDNESDAY: CohortSlot = {
  cohortLabel: "Test Cohort A",
  trackType: "basic_skating",
  sessionDayOfWeek: 3,
  windowStartTime: "16:00:00",
  windowEndTime: "17:00:00",
  seasonStartDate: "2026-09-01",
  seasonEndDate: "2026-12-01",
};

test("Sunday is accepted in both the ISO and Postgres spellings", () => {
  assert.equal(normaliseDayOfWeek(0), 0);
  assert.equal(normaliseDayOfWeek(7), 0);
  assert.equal(normaliseDayOfWeek(3), 3);
  assert.equal(normaliseDayOfWeek(8), null);
  assert.equal(normaliseDayOfWeek(null), null);
});

test("mid-week lookup returns the coming Wednesday at 16:00 EAT", () => {
  // Monday 2026-09-07, 09:00 EAT.
  const hit = nextOccurrence(WEDNESDAY, new Date("2026-09-07T06:00:00Z"));
  assert.equal(hit?.startsAtIso, "2026-09-09T13:00:00.000Z"); // 16:00 EAT
  assert.equal(hit?.startTimeEat, "16:00");
});

test("before the session on the day itself, it is still today's session", () => {
  const hit = nextOccurrence(WEDNESDAY, new Date("2026-09-09T12:00:00Z")); // 15:00 EAT
  assert.equal(hit?.startsAtIso, "2026-09-09T13:00:00.000Z");
});

test("once today's session has ended it rolls to next week", () => {
  const hit = nextOccurrence(WEDNESDAY, new Date("2026-09-09T14:30:00Z")); // 17:30 EAT
  assert.equal(hit?.startsAtIso, "2026-09-16T13:00:00.000Z");
});

test("the server's own timezone cannot shift the day", () => {
  // 21:30Z on Wednesday is already 00:30 THURSDAY in Nairobi. A UTC-based
  // reading would still call it Wednesday and offer a session that has
  // been over for eight hours.
  const hit = nextOccurrence(WEDNESDAY, new Date("2026-09-09T21:30:00Z"));
  assert.equal(hit?.startsAtIso, "2026-09-16T13:00:00.000Z");
});

test("a lookup before the season opens waits for the season", () => {
  // 2026-09-01 is a Tuesday, so the first session is Wednesday the 2nd.
  const hit = nextOccurrence(WEDNESDAY, new Date("2026-08-01T06:00:00Z"));
  assert.equal(hit?.startsAtIso, "2026-09-02T13:00:00.000Z");
});

test("a finished season has no next session rather than a stale one", () => {
  assert.equal(nextOccurrence(WEDNESDAY, new Date("2026-12-20T06:00:00Z")), null);
});

test("an unusable slot yields nothing instead of a guess", () => {
  assert.equal(nextOccurrence({ ...WEDNESDAY, sessionDayOfWeek: null }, new Date()), null);
  assert.equal(nextOccurrence({ ...WEDNESDAY, windowStartTime: null }, new Date()), null);
  assert.equal(nextOccurrence({ ...WEDNESDAY, seasonEndDate: "not-a-date" }, new Date()), null);
});

test("with several cohorts the soonest one wins", () => {
  const monday: CohortSlot = { ...WEDNESDAY, cohortLabel: "Monday Squad", sessionDayOfWeek: 1 };
  const hit = nextSession([WEDNESDAY, monday], new Date("2026-09-06T06:00:00Z")); // Sunday
  assert.equal(hit?.cohortLabel, "Monday Squad");
});

test("no slots is null, not an empty-looking session", () => {
  assert.equal(nextSession([], new Date()), null);
});

test("one assessment is a baseline, never progress", () => {
  assert.equal(progressState(0), "NO_BASELINE");
  assert.equal(progressState(1), "BASELINE_ESTABLISHED");
  assert.equal(progressState(2), "PROGRESSING");
});
