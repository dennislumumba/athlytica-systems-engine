// =====================================================================
// NRHL LEGACY ETL — pure functions, no I/O.
//
// Everything here is derived from NRHL_CONTEXT_DOSSIER.md v2.0. Three
// recovered artifacts are encoded verbatim and must not drift:
//
//   NRHL-PTS-v1   Points    = 3*assisted + 1*solo + 1*assists   (§2A.3)
//   NRHL-COMP-v1  Composite = attendance% + 20*coachGrade + pts (§2A.4)
//   Certificate tier by percentile rank over the certified cohort
//
// The point formula reconciles 94/94 legacy records and is the machine
// encoding of Global Constraint S4 (a goal built through a teammate is
// worth three times a solo goal). Changing either constant changes the
// league's competitive philosophy, not just a number.
//
// Self-check: node --test tests/nrhl-etl.test.mts
// =====================================================================

// Relative with an explicit extension, not "@/…": tests/nrhl-etl.test.mts
// runs this module under bare `node --test`, which resolves neither
// tsconfig path aliases nor extensionless specifiers. Types are imported
// separately so type-stripping can erase them.
import { athleteStatRowSchema, legacyScrimmageRowSchema } from "../validation/nrhl-schemas.ts";
import type {
  AthleteStatRow,
  Division,
  LegacyScrimmageRow,
  Pillar,
} from "../validation/nrhl-schemas.ts";

// ---------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------

/**
 * RFC4180-enough parser: quoted fields, embedded commas, doubled quotes,
 * CRLF. The legacy venue column is `"-1.224532,36.808400"` — a naive
 * split on comma shifts every column after it, so quote handling is not
 * optional here.
 */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((cells) =>
    Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? "").trim()])),
  );
}

// ---------------------------------------------------------------------
// Dates
//
// The source carries three formats in one column plus a future-dated
// typo (2056). Confidence is recorded rather than guessed away:
//   2 = unambiguous   1 = ambiguous DD/MM vs MM/DD   0 = absent/rejected
// ---------------------------------------------------------------------

export interface ParsedDate {
  iso: string | null;
  confidence: 0 | 1 | 2;
}

const MAX_PLAUSIBLE_YEAR = new Date().getFullYear() + 2;

export function normaliseDate(raw: string | null | undefined): ParsedDate {
  const value = raw?.trim();
  if (!value) return { iso: null, confidence: 0 };

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (iso) return finalise(+iso[1]!, +iso[2]!, +iso[3]!, 2);

  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (slash) {
    const a = +slash[1]!;
    const b = +slash[2]!;
    // >12 in either position disambiguates; otherwise it genuinely could
    // be either and the row is flagged, not silently assumed DD/MM.
    if (a > 12) return finalise(+slash[3]!, b, a, 2);
    if (b > 12) return finalise(+slash[3]!, a, b, 2);
    return finalise(+slash[3]!, b, a, 1); // DD/MM is the sheet's majority
  }
  return { iso: null, confidence: 0 };
}

function finalise(year: number, month: number, day: number, confidence: 0 | 1 | 2): ParsedDate {
  if (year > MAX_PLAUSIBLE_YEAR || year < 2015) return { iso: null, confidence: 0 };
  if (month < 1 || month > 12 || day < 1 || day > 31) return { iso: null, confidence: 0 };
  const pad = (n: number) => String(n).padStart(2, "0");
  return { iso: `${year}-${pad(month)}-${pad(day)}`, confidence };
}

// ---------------------------------------------------------------------
// Identity resolution
// ---------------------------------------------------------------------

/** Name variants the match log records first-name-only (dossier §2A.2). */
const NAME_ALIASES: Record<string, string> = {
  mbatia: "Benson Mbatia",
  sky: "Skylar Weening",
  shaya: "Shaya Das",
  raimi: "Raimi Skudi",
  asher: "Asher Weening",
  eli: "Eli Das",
  dakota: "Dakota Weening",
  sam: "Sam Inoue",
  kyler: "Kyler Okeyo",
  leon: "Leon Sila",
  noel: "Noel Inoue",
  "jayson jabali": "Jason Jabali",
};

/** Present in the performance log but not athletes — coach and a parent sub. */
const NON_ATHLETES = new Set(["dennis", "dennis(me)", "dennis (me)", "tobu (parent)", "tobu"]);

/**
 * ATH-047 is bound to two humans: Shirley Makena (2025, Figure Skating)
 * and Sam Inoue (2026, one session). The 2025 holder keeps the code; the
 * 2026 claimant is reissued from the sequence.
 *
 * The dossier notes Sam Inoue's own id is ATH-041 and argues the honest
 * fix is to refile that session under ATH-00041. The brief asks for a
 * fresh sequential id instead, so that is what runs — `reissue` names
 * the alternative so the decision stays visible in the ingest report.
 */
export const LEGACY_ID_COLLISIONS = [
  {
    legacyCode: "ATH-047",
    keep: "Shirley Makena",
    reissue: "Sam Inoue",
    keepCode: "ATH-00047",
    note:
      "ATH-047 bound to two humans (dossier §2A.2). Shirley Makena retains the migrated code; " +
      "Sam Inoue reissued from scalable_id_sequence. Dossier's alternative: refile under ATH-00041.",
  },
] as const;

export function canonicalName(raw: string): string | null {
  const trimmed = raw.trim();
  const key = trimmed.toLowerCase();
  if (!trimmed || NON_ATHLETES.has(key)) return null;
  return NAME_ALIASES[key] ?? trimmed;
}

/** ATH-047 -> ATH-00047. Legacy ids are 3-digit, the target is 5. */
export function migrateLegacyCode(legacy: string): string | null {
  const m = /^ATH-(\d{1,5})$/i.exec(legacy.trim());
  return m ? `ATH-${m[1]!.padStart(5, "0")}` : null;
}

// ---------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------

export const NRHL_POINT_FORMULA = { assisted: 3, solo: 1, assist: 1 } as const;
export const POINT_FORMULA_VERSION = "NRHL-PTS-v1";
export const COMPOSITE_FORMULA_VERSION = "NRHL-COMP-v1";

export function nrhlPoints(input: {
  assistedGoals: number;
  soloGoals: number;
  assists: number;
}): number {
  return (
    input.assistedGoals * NRHL_POINT_FORMULA.assisted +
    input.soloGoals * NRHL_POINT_FORMULA.solo +
    input.assists * NRHL_POINT_FORMULA.assist
  );
}

/**
 * The athlete stats CSV carries totals (goals, assists, points) but not
 * the assisted/solo split. Recovering it: points = 3a + s + assists and
 * a + s = goals, so a = (points - assists - goals) / 2.
 * Returns null when the arithmetic does not land on whole numbers —
 * that means the row disagrees with the formula and needs a human.
 */
export function splitGoals(row: {
  goals: number | null;
  assists: number | null;
  total_points: number | null;
}): { assistedGoals: number; soloGoals: number } | null {
  const { goals, assists, total_points: points } = row;
  if (goals === null || assists === null || points === null) return null;
  const assisted = (points - assists - goals) / 2;
  const solo = goals - assisted;
  if (!Number.isInteger(assisted) || assisted < 0 || solo < 0) return null;
  return { assistedGoals: assisted, soloGoals: solo };
}

/** NRHL-COMP-v1. Null coach grade yields null — never a fabricated zero. */
export function compositeScore(input: {
  attendanceRatePct: number | null;
  coachGradeAvg: number | null;
  points: number | null;
}): number | null {
  const { attendanceRatePct, coachGradeAvg, points } = input;
  if (attendanceRatePct === null || coachGradeAvg === null || points === null) return null;
  return Math.round((attendanceRatePct + 20 * coachGradeAvg + points) * 1000) / 1000;
}

/**
 * Certificate tier by percentile rank over the scored cohort.
 *
 * The dossier flags that ranking across disciplines is indefensible —
 * inline-skating athletes score a structural 0 on the points term — so
 * the cohort is segmented by discipline before ranking.
 */
export function certificateTiers(
  cohort: { name: string; discipline: string | null; composite: number | null }[],
): Map<string, "Elite All-Rounder" | "Advanced All-Rounder" | "Core All-Rounder"> {
  const out = new Map<string, "Elite All-Rounder" | "Advanced All-Rounder" | "Core All-Rounder">();
  const byDiscipline = new Map<string, typeof cohort>();
  for (const a of cohort) {
    if (a.composite === null) continue;
    const key = a.discipline ?? "unspecified";
    (byDiscipline.get(key) ?? byDiscipline.set(key, []).get(key)!).push(a);
  }
  for (const group of byDiscipline.values()) {
    const sorted = [...group].sort((x, y) => x.composite! - y.composite!);
    const n = sorted.length;
    sorted.forEach((a, i) => {
      const percentile = n <= 1 ? 1 : i / (n - 1);
      out.set(
        a.name,
        percentile >= 0.9
          ? "Elite All-Rounder"
          : percentile >= 0.7
            ? "Advanced All-Rounder"
            : "Core All-Rounder",
      );
    });
  }
  return out;
}

// ---------------------------------------------------------------------
// Standings
// ---------------------------------------------------------------------

/**
 * ponytail: W=3 / OTW=2 / OTL=1 / L=0 is an ASSUMPTION. The dossier
 * grades team-level point calculation `[Ø] VOID` — it exists in no
 * source document and is an open TODO in the league's own task list.
 * These are the IIHF three-point weights. Change them here once the
 * League Director rules; nothing else hardcodes them.
 */
export const STANDINGS_POINTS = { win: 3, otWin: 2, otLoss: 1, loss: 0, draw: 1 } as const;

export interface StandingRow {
  division: Division | "Unassigned";
  team: string;
  gp: number;
  w: number;
  otW: number;
  l: number;
  otL: number;
  d: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface ScrimmageResult {
  division: string | null;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  decidedInOvertime: boolean;
}

/**
 * Only scrimmages with BOTH scores recorded contribute. 7 of the 10
 * legacy matches were logged without a score; counting them as 0-0
 * would invent seven draws.
 */
export function buildStandings(matches: ScrimmageResult[]): StandingRow[] {
  const table = new Map<string, StandingRow>();
  const bucket = (division: string | null, team: string): StandingRow => {
    const div = (division ?? "Unassigned") as StandingRow["division"];
    const key = `${div}::${team}`;
    let row = table.get(key);
    if (!row) {
      row = { division: div, team, gp: 0, w: 0, otW: 0, l: 0, otL: 0, d: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      table.set(key, row);
    }
    return row;
  };

  for (const m of matches) {
    if (m.scoreA === null || m.scoreB === null) continue;
    const a = bucket(m.division, m.teamA);
    const b = bucket(m.division, m.teamB);
    a.gp += 1;
    b.gp += 1;
    a.gf += m.scoreA;
    a.ga += m.scoreB;
    b.gf += m.scoreB;
    b.ga += m.scoreA;

    if (m.scoreA === m.scoreB) {
      a.d += 1;
      b.d += 1;
      a.pts += STANDINGS_POINTS.draw;
      b.pts += STANDINGS_POINTS.draw;
      continue;
    }
    const [winner, loser] = m.scoreA > m.scoreB ? [a, b] : [b, a];
    if (m.decidedInOvertime) {
      winner.otW += 1;
      loser.otL += 1;
      winner.pts += STANDINGS_POINTS.otWin;
      loser.pts += STANDINGS_POINTS.otLoss;
    } else {
      winner.w += 1;
      loser.l += 1;
      winner.pts += STANDINGS_POINTS.win;
      loser.pts += STANDINGS_POINTS.loss;
    }
  }

  for (const row of table.values()) row.gd = row.gf - row.ga;
  return [...table.values()].sort(
    (x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team),
  );
}

// ---------------------------------------------------------------------
// Universal Taxonomy backfill
// ---------------------------------------------------------------------

export interface MetricRow {
  metricCode: string;
  pillar: Pillar;
  value: number | null;
  unit: string;
  scaleMin: number | null;
  scaleMax: number | null;
  formulaVersion: string | null;
}

/** "2nd Case" -> 2, "0 cases" -> 0. An escalating conduct counter, not minutes. */
export function conductCaseCount(raw: string | null): number {
  if (!raw) return 0;
  const m = /(\d+)/.exec(raw);
  return m ? Number(m[1]) : 0;
}

/**
 * Maps one athlete rollup row onto the 5 pillars (dossier §2.6A).
 *
 * Deliberately absent: `games_played` is a dimension, not a metric, and
 * `penalty_minutes` does not exist upstream — emitting it as a metric
 * would fabricate a unit. It survives on the stat line, defaulted to 0
 * as the brief requires, and nowhere else.
 */
export function mapToPillars(row: AthleteStatRow): MetricRow[] {
  const rows: MetricRow[] = [
    { metricCode: "SCRIM_GOALS", pillar: "Technical Skill", value: row.goals, unit: "count", scaleMin: 0, scaleMax: null, formulaVersion: null },
    { metricCode: "SCRIM_ASSISTS", pillar: "Cognitive/Tactical", value: row.assists, unit: "count", scaleMin: 0, scaleMax: null, formulaVersion: null },
    { metricCode: "SCRIM_PTS_W", pillar: "Cognitive/Tactical", value: row.total_points, unit: "points", scaleMin: 0, scaleMax: null, formulaVersion: POINT_FORMULA_VERSION },
    { metricCode: "ATT_RATE", pillar: "Stamina", value: row.attendance_rate_pct, unit: "pct", scaleMin: 0, scaleMax: 100, formulaVersion: null },
    { metricCode: "SPEED_BAND", pillar: "Speed", value: row.speed_rating, unit: "ordinal_0_10", scaleMin: 0, scaleMax: 10, formulaVersion: null },
    { metricCode: "TECH_PRECISION", pillar: "Technical Skill", value: row.technical_rating, unit: "signed_delta", scaleMin: -2, scaleMax: 4, formulaVersion: null },
    { metricCode: "CONDUCT_CASES", pillar: "Cognitive/Tactical", value: conductCaseCount(row.attitude_discipline), unit: "count", scaleMin: 0, scaleMax: null, formulaVersion: null },
  ];
  if (row.coach_grade !== null) {
    rows.push({ metricCode: "COACH_GRADE", pillar: "Cognitive/Tactical", value: row.coach_grade, unit: "ordinal_1_5", scaleMin: 1, scaleMax: 5, formulaVersion: null });
  }
  // A metric with no measurement is not a metric — dropping it is what
  // keeps "unmeasured" distinguishable from "measured zero".
  return rows.filter((m) => m.value !== null);
}

/** Which pillars actually have data, for the coverage banner. */
export function pillarCoverage(metrics: { pillar: Pillar; metricCode: string }[]) {
  const byPillar = new Map<Pillar, Set<string>>();
  for (const m of metrics) {
    (byPillar.get(m.pillar) ?? byPillar.set(m.pillar, new Set()).get(m.pillar)!).add(m.metricCode);
  }
  return byPillar;
}

// ---------------------------------------------------------------------
// Athlytica Composite Index — draft balancing only
// ---------------------------------------------------------------------

/**
 * ponytail: a cohort-relative 0-100 heuristic for balancing draft
 * squads. It is NOT the certificate composite (NRHL-COMP-v1), which
 * requires a coach grade the legacy CSV does not carry. Weights are
 * exposed because they are a judgement call, not a measurement — retune
 * here when the KPI layer (SR/BPR/SGP/SVC/WSUR) is instrumented.
 */
export const COMPOSITE_INDEX_WEIGHTS = {
  pointsPerGame: 0.35,
  speed: 0.2,
  technical: 0.2,
  attendance: 0.25,
} as const;

export interface IndexInput {
  athleteCode: string;
  gamesPlayed: number | null;
  legacyPoints: number | null;
  speedRating: number | null;
  technicalRating: number | null;
  attendanceRatePct: number | null;
}

export function compositeIndex(cohort: IndexInput[]): Map<string, number | null> {
  const ppg = (a: IndexInput) =>
    a.legacyPoints !== null && a.gamesPlayed ? a.legacyPoints / a.gamesPlayed : null;
  const maxPpg = Math.max(1e-9, ...cohort.map((a) => ppg(a) ?? 0));

  const out = new Map<string, number | null>();
  for (const a of cohort) {
    const parts: [number, number][] = []; // [weight, 0..100]
    const rate = ppg(a);
    if (rate !== null) parts.push([COMPOSITE_INDEX_WEIGHTS.pointsPerGame, (rate / maxPpg) * 100]);
    if (a.speedRating !== null) parts.push([COMPOSITE_INDEX_WEIGHTS.speed, clamp(a.speedRating * 10)]);
    // Technical precision is a SIGNED delta on -2..+4; naive 0-100
    // mapping inverts it, so rescale explicitly.
    if (a.technicalRating !== null)
      parts.push([COMPOSITE_INDEX_WEIGHTS.technical, clamp(((a.technicalRating + 2) / 6) * 100)]);
    if (a.attendanceRatePct !== null)
      parts.push([COMPOSITE_INDEX_WEIGHTS.attendance, clamp(a.attendanceRatePct)]);

    if (parts.length === 0) {
      out.set(a.athleteCode, null);
      continue;
    }
    // Re-normalise over present terms so a missing measurement dilutes
    // confidence rather than silently scoring the athlete down.
    const weight = parts.reduce((s, [w]) => s + w, 0);
    const score = parts.reduce((s, [w, v]) => s + w * v, 0) / weight;
    out.set(a.athleteCode, Math.round(score * 10) / 10);
  }
  return out;
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** Mean index of a drafted squad, for the balance calculator. */
export function squadBalance(indices: (number | null)[]): { mean: number | null; rated: number } {
  const rated = indices.filter((v): v is number => v !== null);
  if (rated.length === 0) return { mean: null, rated: 0 };
  return {
    mean: Math.round((rated.reduce((s, v) => s + v, 0) / rated.length) * 10) / 10,
    rated: rated.length,
  };
}

// ---------------------------------------------------------------------
// Top-level reconciliation
// ---------------------------------------------------------------------

export interface IngestReport {
  scrimmages: (LegacyScrimmageRow & { isoDate: string | null; dateConfidence: 0 | 1 | 2 })[];
  athletes: {
    row: AthleteStatRow;
    canonicalName: string;
    assignedCode: string | null; // null => allocate from the sequence
    legacyCode: string | null;
    identityNote: string | null;
    recomputedPoints: number | null;
    split: { assistedGoals: number; soloGoals: number } | null;
    metrics: MetricRow[];
  }[];
  standings: StandingRow[];
  warnings: string[];
  excluded: string[];
}

/**
 * Parses both legacy CSVs, applies identity resolution and the recovered
 * formulas, and reports every discrepancy rather than smoothing it.
 * Writes nothing — the route decides what to persist.
 */
export function buildIngestReport(scrimmagesCsv: string, athleteStatsCsv: string): IngestReport {
  const warnings: string[] = [];
  const excluded: string[] = [];

  const scrimmages = parseCsv(scrimmagesCsv).map((raw) => {
    const row = legacyScrimmageRowSchema.parse(raw);
    const { iso, confidence } = normaliseDate(row.date);
    if (confidence === 0 && row.date) {
      warnings.push(`${row.scrimmage_id}: unparseable date "${row.date}" — stored as NULL.`);
    }
    if (confidence === 1) {
      warnings.push(`${row.scrimmage_id}: ambiguous date "${row.date}" read as DD/MM.`);
    }
    if (row.score_team_a === null || row.score_team_b === null) {
      warnings.push(`${row.scrimmage_id}: no score recorded — excluded from standings.`);
    }
    return { ...row, isoDate: iso, dateConfidence: confidence };
  });

  const claimedCodes = new Map<string, { code: string; legacy: string; note: string }>();
  const reissue = new Map<string, string>();
  for (const c of LEGACY_ID_COLLISIONS) {
    claimedCodes.set(c.keep, { code: c.keepCode, legacy: c.legacyCode, note: c.note });
    reissue.set(c.reissue, c.note);
  }

  const athletes: IngestReport["athletes"] = [];
  for (const raw of parseCsv(athleteStatsCsv)) {
    const row = athleteStatRowSchema.parse(raw);
    const name = canonicalName(row.athlete_name);
    if (!name) {
      excluded.push(`${row.athlete_name} — not an athlete (coach or parent substitute).`);
      continue;
    }
    const claim = claimedCodes.get(name);
    const split = splitGoals(row);
    if (!split && row.total_points !== null) {
      warnings.push(
        `${name}: goals/assists/points do not reconcile under ${POINT_FORMULA_VERSION} — assisted/solo split left unknown.`,
      );
    }
    athletes.push({
      row,
      canonicalName: name,
      assignedCode: claim?.code ?? null,
      legacyCode: claim?.legacy ?? null,
      identityNote: claim?.note ?? reissue.get(name) ?? null,
      recomputedPoints: split ? nrhlPoints({ ...split, assists: row.assists ?? 0 }) : row.total_points,
      split,
      metrics: mapToPillars(row),
    });
  }

  const standings = buildStandings(
    scrimmages.map((s) => ({
      division: s.division,
      teamA: s.team_a,
      teamB: s.team_b,
      scoreA: s.score_team_a,
      scoreB: s.score_team_b,
      decidedInOvertime: false,
    })),
  );

  if (scrimmages.every((s) => !s.division)) {
    warnings.push(
      "No division dimension exists in the legacy source (dossier §1.4 [Ø]) — standings are grouped as Unassigned until the January 2027 draft binds athletes to conference teams.",
    );
  }

  return { scrimmages, athletes, standings, warnings, excluded };
}
