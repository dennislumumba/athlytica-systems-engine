// Run: node --test tests/nrhl-etl.test.mts
//
// Guards the three recovered artifacts the NRHL module is built on. If
// any of these break, the league's scoreboard stops expressing its own
// doctrine and every standing, certificate and draft balance downstream
// is quietly wrong:
//
//   NRHL-PTS-v1   Points = 3*assisted + solo + assists
//   NRHL-COMP-v1  Composite = attendance% + 20*coachGrade + points
//   Standings only count matches that actually have a score
//
// The point-formula cases are the verified reconciliations from
// NRHL_CONTEXT_DOSSIER.md §2A.3 and the real top-10 rows from
// core-engine/schemas/seed/nrhl_legacy/athlete_individual_stats.csv.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildStandings,
  canonicalName,
  certificateTiers,
  compositeIndex,
  compositeScore,
  conductCaseCount,
  migrateLegacyCode,
  normaliseDate,
  nrhlPoints,
  parseCsv,
  splitGoals,
} from "../lib/services/nrhl-etl.ts";
import { toE164 } from "../lib/validation/nrhl-schemas.ts";

test("point formula reconciles the dossier's worked examples", () => {
  const cases = [
    { assistedGoals: 5, soloGoals: 0, assists: 1, expected: 16 }, // Noel Inoue 03/01
    { assistedGoals: 2, soloGoals: 5, assists: 1, expected: 12 }, // Asher Weening 04/04
    { assistedGoals: 4, soloGoals: 4, assists: 1, expected: 17 }, // Sam Inoue 04/04
    { assistedGoals: 3, soloGoals: 1, assists: 2, expected: 12 }, // Lavrin Dickens 20/03
    { assistedGoals: 0, soloGoals: 0, assists: 1, expected: 1 }, // Leon Sila 03/01
  ];
  for (const c of cases) assert.equal(nrhlPoints(c), c.expected);
});

test("a shared goal is worth four times a solo finish", () => {
  const shared = nrhlPoints({ assistedGoals: 1, soloGoals: 0, assists: 1 });
  const solo = nrhlPoints({ assistedGoals: 0, soloGoals: 1, assists: 0 });
  assert.equal(shared, 4);
  assert.equal(solo, 1);
});

test("goal split recovers assisted/solo from the season rollup", () => {
  // Real rows from the emitted legacy CSV.
  const rows = [
    { name: "Noel Inoue", goals: 35, assists: 23, total_points: 124 },
    { name: "Sam Inoue", goals: 30, assists: 11, total_points: 87 },
    { name: "Asher Weening", goals: 28, assists: 14, total_points: 82 },
    { name: "Eli Das", goals: 17, assists: 6, total_points: 55 },
  ];
  for (const row of rows) {
    const split = splitGoals(row);
    assert.ok(split, `${row.name} must reconcile under NRHL-PTS-v1`);
    assert.equal(split.assistedGoals + split.soloGoals, row.goals);
    assert.equal(nrhlPoints({ ...split, assists: row.assists }), row.total_points);
  }
});

test("goal split refuses to guess when the row does not reconcile", () => {
  assert.equal(splitGoals({ goals: 10, assists: 2, total_points: 999 }), null);
  assert.equal(splitGoals({ goals: 10, assists: 2, total_points: null }), null);
});

test("composite formula matches the certificate tracker", () => {
  assert.equal(compositeScore({ attendanceRatePct: 100, coachGradeAvg: 4, points: 124 }), 304);
  assert.equal(compositeScore({ attendanceRatePct: 100, coachGradeAvg: 3.9, points: 87 }), 265);
  assert.equal(
    compositeScore({ attendanceRatePct: 83.333, coachGradeAvg: 2.5, points: 0 }),
    133.333,
  );
});

test("composite is null when a term is unmeasured, never zero", () => {
  assert.equal(compositeScore({ attendanceRatePct: 100, coachGradeAvg: null, points: 40 }), null);
});

test("standings ignore matches with no recorded score", () => {
  const table = buildStandings([
    { division: null, teamA: "Team A", teamB: "Team B", scoreA: 11, scoreB: 10, decidedInOvertime: false },
    { division: null, teamA: "Team A", teamB: "Team B", scoreA: null, scoreB: null, decidedInOvertime: false },
  ]);
  const a = table.find((r) => r.team === "Team A")!;
  assert.equal(a.gp, 1, "the unscored match must not become a 0-0");
  assert.equal(a.w, 1);
  assert.equal(a.gd, 1);
  assert.equal(a.pts, 3);
});

test("overtime results split points 2/1 and draws split 1/1", () => {
  const ot = buildStandings([
    { division: "The Summit", teamA: "X", teamB: "Y", scoreA: 3, scoreB: 2, decidedInOvertime: true },
  ]);
  assert.equal(ot.find((r) => r.team === "X")!.otW, 1);
  assert.equal(ot.find((r) => r.team === "X")!.pts, 2);
  assert.equal(ot.find((r) => r.team === "Y")!.otL, 1);
  assert.equal(ot.find((r) => r.team === "Y")!.pts, 1);

  const drawn = buildStandings([
    { division: null, teamA: "X", teamB: "Y", scoreA: 4, scoreB: 4, decidedInOvertime: false },
  ]);
  assert.equal(drawn.find((r) => r.team === "X")!.d, 1);
  assert.equal(drawn.find((r) => r.team === "X")!.pts, 1);
});

test("date parsing records confidence and rejects the 2056 typo", () => {
  assert.deepEqual(normaliseDate("2026-01-03"), { iso: "2026-01-03", confidence: 2 });
  assert.deepEqual(normaliseDate("24/01/2026"), { iso: "2026-01-24", confidence: 2 });
  assert.deepEqual(normaliseDate("03/01/2026"), { iso: "2026-01-03", confidence: 1 });
  assert.deepEqual(normaliseDate("2056-6-4"), { iso: null, confidence: 0 });
  assert.deepEqual(normaliseDate(""), { iso: null, confidence: 0 });
});

test("csv parser keeps quoted coordinates in one field", () => {
  const rows = parseCsv('id,venue,n\nNRHL-1,"-1.224532,36.808400",10\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.venue, "-1.224532,36.808400");
  assert.equal(rows[0]!.n, "10");
});

test("identity resolution collapses aliases and drops non-athletes", () => {
  assert.equal(canonicalName("Mbatia"), "Benson Mbatia");
  assert.equal(canonicalName("Sky"), "Skylar Weening");
  assert.equal(canonicalName("Dennis"), null);
  assert.equal(canonicalName("Tobu (Parent)"), null);
  assert.equal(canonicalName("Raimi Skudi"), "Raimi Skudi");
});

test("legacy codes migrate 3-digit to 5-digit", () => {
  assert.equal(migrateLegacyCode("ATH-047"), "ATH-00047");
  assert.equal(migrateLegacyCode("ATH-3"), "ATH-00003");
  assert.equal(migrateLegacyCode("not-an-id"), null);
});

test("conduct cases parse as a count, not minutes", () => {
  assert.equal(conductCaseCount("0 cases"), 0);
  assert.equal(conductCaseCount("2nd Case"), 2);
  assert.equal(conductCaseCount(null), 0);
});

test("certificate tiers rank within a discipline, not across them", () => {
  // An inline-skating athlete with a structural 0 points term must not be
  // ranked against hockey athletes who can score.
  const tiers = certificateTiers([
    { name: "Hockey Top", discipline: "Inline / Roller Hockey", composite: 304 },
    { name: "Hockey Mid", discipline: "Inline / Roller Hockey", composite: 200 },
    { name: "Hockey Low", discipline: "Inline / Roller Hockey", composite: 150 },
    { name: "Skater Only", discipline: "Inline Skating", composite: 133 },
  ]);
  assert.equal(tiers.get("Hockey Top"), "Elite All-Rounder");
  assert.equal(tiers.get("Hockey Low"), "Core All-Rounder");
  // Alone in their discipline, the skater tops their own pool rather than
  // landing at the bottom of a pool they cannot compete in.
  assert.equal(tiers.get("Skater Only"), "Elite All-Rounder");
});

test("composite index rescales the signed technical delta correctly", () => {
  const scores = compositeIndex([
    { athleteCode: "ATH-00001", gamesPlayed: 10, legacyPoints: 100, speedRating: 10, technicalRating: 4, attendanceRatePct: 100 },
    { athleteCode: "ATH-00002", gamesPlayed: 10, legacyPoints: 100, speedRating: 10, technicalRating: -2, attendanceRatePct: 100 },
    { athleteCode: "ATH-00003", gamesPlayed: null, legacyPoints: null, speedRating: null, technicalRating: null, attendanceRatePct: null },
  ]);
  assert.equal(scores.get("ATH-00001"), 100);
  assert.ok(scores.get("ATH-00002")! < 100, "a -2 delta must score below a +4 delta");
  assert.equal(scores.get("ATH-00003"), null, "no measurement means unrated, not zero");
});

test("kenyan mobile numbers normalise to E.164 and reject the rest", () => {
  assert.equal(toE164("0724324529"), "+254724324529");
  assert.equal(toE164("+254 724 324 529"), "+254724324529");
  assert.equal(toE164("254724324529"), "+254724324529");
  assert.equal(toE164("0110123456"), "+254110123456");
  assert.equal(toE164("+2540724324529"), null, "+254 followed by 0 is not valid");
  assert.equal(toE164("072432452"), null, "too short");
  assert.equal(toE164("0324324529"), null, "not a mobile prefix");
});
