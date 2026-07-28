// =====================================================================
// NRHL VALIDATION CONTRACT — the trust boundary for every league write.
//
// Two rules the rest of the module depends on:
//   1. Phone numbers are normalised to E.164 HERE and nowhere else. The
//      DB CHECK on nrhl_athlete.guardian_phone_e164 is the backstop, not
//      the parser (dossier §3.2 — the live funnel has no pattern at all,
//      which is why STK pushes fail silently).
//   2. Weighted points are never accepted from a client. The caller
//      sends component counts; the formula lives in the ETL and in a
//      GENERATED column. See NRHL_POINT_FORMULA in lib/services/nrhl-etl.
// =====================================================================

import { z } from "zod";

// ---------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------

/** Geographic conferences. Canonical map = live site + Charter v2 (dossier §1.2). */
export const DIVISIONS = ["The Summit", "The Ridge", "The Plateau", "The Savannah"] as const;
export type Division = (typeof DIVISIONS)[number];
export const divisionSchema = z.enum(DIVISIONS);

/** The 5 pillars of the Universal Taxonomy. */
export const PILLARS = [
  "Speed",
  "Agility",
  "Stamina",
  "Technical Skill",
  "Cognitive/Tactical",
] as const;
export type Pillar = (typeof PILLARS)[number];

/** Developmental tiers. Orthogonal to level — never collapse into one column. */
export const AGE_TIERS = ["U8", "U12", "U15"] as const;
export const STUDENT_LEVELS = ["Beginner", "Novice", "Intermediate", "Advanced"] as const;

/**
 * Line slots. The Coach's Manual default shape is the Possession
 * Triangle — carrier plus two angled wings plus a defensive anchor — so
 * a "line" here is a forward unit (F1-F3), a defensive pair (D1-D2), or
 * the net.
 */
export const LINE_SLOTS = ["F1", "F2", "F3", "D1", "D2", "G"] as const;

export const CERTIFICATE_TIERS = [
  "Elite All-Rounder",
  "Advanced All-Rounder",
  "Core All-Rounder",
] as const;
export type CertificateTier = (typeof CERTIFICATE_TIERS)[number];

// ---------------------------------------------------------------------
// Kenyan mobile numbers
// ---------------------------------------------------------------------

/** Accepts 07…, 01…, 2547…, +2541… — everything else is rejected. */
export const KENYAN_MOBILE_RE = /^(?:\+?254|0)([17]\d{8})$/;

/**
 * Returns +254XXXXXXXXX, or null when the input is not a Kenyan mobile.
 * Spaces, hyphens and brackets are stripped first because parents type
 * numbers the way they read them.
 */
export function toE164(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const match = KENYAN_MOBILE_RE.exec(input.replace(/[\s\-()]/g, ""));
  return match ? `+254${match[1]}` : null;
}

/** M-Pesa STK push wants 2547XXXXXXXX with no leading '+'. */
export function toMpesaMsisdn(e164: string): string {
  return e164.replace(/^\+/, "");
}

export const kenyanPhoneSchema = z
  .string()
  .transform((v) => toE164(v))
  .refine((v): v is string => v !== null, {
    message: "Expected a Kenyan mobile number (07…, 01…, or +2547…).",
  });

export const athleteCodeSchema = z
  .string()
  .regex(/^ATH-\d{5}$/, "Athlete codes are ATH- followed by 5 digits.");

// ---------------------------------------------------------------------
// Legacy CSV rows
//
// Empty strings are coerced to null, never to 0 — Rubric EV-08 rule 3
// (missing data is NULL, never estimated). penalty_minutes is the one
// documented exception: the brief requires it to default to 0.
// ---------------------------------------------------------------------

const blankToNull = z
  .string()
  .optional()
  .transform((v) => {
    const t = v?.trim();
    return t === undefined || t === "" || t.toLowerCase() === "null" ? null : t;
  });

const numOrNull = blankToNull.transform((v) => {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
});

const intOrZero = blankToNull.transform((v) => {
  if (v === null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
});

export const legacyScrimmageRowSchema = z.object({
  scrimmage_id: z.string().min(1),
  date: blankToNull,
  discipline: blankToNull,
  division: blankToNull,
  team_a: z.string().min(1).default("Team A"),
  team_b: z.string().min(1).default("Team B"),
  score_team_a: numOrNull,
  score_team_b: numOrNull,
  venue: blankToNull,
  attendance_count: numOrNull,
});
export type LegacyScrimmageRow = z.infer<typeof legacyScrimmageRowSchema>;

export const athleteStatRowSchema = z.object({
  athlete_name: z.string().min(1),
  primary_discipline: blankToNull,
  games_played: numOrNull,
  goals: numOrNull,
  assists: numOrNull,
  total_points: numOrNull,
  penalty_minutes: intOrZero, // [Ø] absent upstream; brief mandates 0
  attendance_rate_pct: numOrNull,
  speed_rating: numOrNull,
  technical_rating: numOrNull, // SIGNED delta -2..+4, not a 0-100 rating
  attitude_discipline: blankToNull, // "0 cases" | "1st Case" | "2nd Case"
  coach_grade: numOrNull,
});
export type AthleteStatRow = z.infer<typeof athleteStatRowSchema>;

// ---------------------------------------------------------------------
// Ingest request
// ---------------------------------------------------------------------

export const ingestRequestSchema = z.object({
  /** Raw CSV text. Omit to ingest the checked-in legacy extract. */
  scrimmagesCsv: z.string().optional(),
  athleteStatsCsv: z.string().optional(),
  /** Parse, reconcile and report — write nothing. */
  dryRun: z.boolean().default(false),
});
export type IngestRequest = z.infer<typeof ingestRequestSchema>;

// ---------------------------------------------------------------------
// Command surface — one discriminated union, one POST handler
// ---------------------------------------------------------------------

const statLineSchema = z.object({
  athleteCode: athleteCodeSchema,
  side: z.enum(["A", "B"]).nullish(),
  assistedGoals: z.number().int().min(0).default(0),
  soloGoals: z.number().int().min(0).default(0),
  assists: z.number().int().min(0).default(0),
  penaltyMinutes: z.number().int().min(0).default(0),
  shotVelocityKmh: z.number().positive().max(200).nullish(),
  saves: z.number().int().min(0).nullish(),
  shotsFaced: z.number().int().min(0).nullish(),
  conductNote: z.string().max(500).nullish(),
});

export const leagueActionSchema = z.discriminatedUnion("action", [
  /** Matchday sheet: upsert a scrimmage and its whole stat sheet at once. */
  z.object({
    action: z.literal("log-match"),
    scrimmageId: z.string().min(3).max(40),
    playedOn: z.string().date().nullish(),
    division: divisionSchema.nullish(),
    teamA: z.string().min(1).default("Team A"),
    teamB: z.string().min(1).default("Team B"),
    scoreA: z.number().int().min(0).nullish(),
    scoreB: z.number().int().min(0).nullish(),
    decidedInOvertime: z.boolean().default(false),
    venue: z.string().max(200).nullish(),
    notes: z.string().max(2000).nullish(),
    statLines: z.array(statLineSchema).max(60).default([]),
  }),

  /** Roster editor + head-coach overrides. */
  z.object({
    action: z.literal("update-athlete"),
    athleteCode: athleteCodeSchema,
    patch: z.object({
      displayName: z.string().min(1).max(120).optional(),
      division: divisionSchema.nullish(),
      team: z.string().max(60).nullish(),
      lineAssignment: z.enum(LINE_SLOTS).nullish(),
      ageTier: z.enum(AGE_TIERS).nullish(),
      studentLevel: z.enum(STUDENT_LEVELS).nullish(),
      guardianName: z.string().max(120).nullish(),
      guardianEmail: z.string().email().nullish(),
      guardianPhone: kenyanPhoneSchema.nullish(),
      consentMedia: z.enum(["GRANTS", "DENIES"]).nullish(),
      identityNote: z.string().max(500).nullish(),
    }),
  }),

  /** Draft finaliser — writes team assignments and stamps the lock. */
  z.object({
    action: z.literal("commit-draft"),
    assignments: z
      .array(z.object({ athleteCode: athleteCodeSchema, team: z.string().min(1).max(60) }))
      .min(1)
      .max(200),
    lock: z.boolean().default(false),
  }),

  /** Batch certificate / passport issuing. */
  z.object({
    action: z.literal("issue-documents"),
    athleteCodes: z.array(athleteCodeSchema).min(1).max(200),
    document: z.enum(["certificate", "passport"]),
  }),

  /** Guardian phone verification flag (set after the parent confirms). */
  z.object({
    action: z.literal("verify-guardian"),
    athleteCode: athleteCodeSchema,
    verified: z.boolean(),
  }),
]);

export type LeagueAction = z.infer<typeof leagueActionSchema>;
