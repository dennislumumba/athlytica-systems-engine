// =====================================================================
// CONVEX BRIDGE — STANDARDIZED DATA MAPPING UTILITY
//
// Translates Athlytica Postgres row schemas (core-engine/schemas/
// athlytica_passport_schema.sql) into Convex-compatible Document
// objects consumed by the Hercules frontend.
//
// Contract guarantees:
//   1. Athlete IDs are serialized to the canonical 'ATH-YYYY-NNNN'
//      passport format used by the Convex deployment.
//   2. Postgres sport_taxonomy sport_code values are normalized to the
//      lowercase snake_case names Convex expects ('inline_hockey', ...).
//   3. skate_size / protective_kit_size are emitted as structured JSON
//      strings matching the Convex sizing schema.
//
// This module is pure (no I/O) so it is safe in edge, node, and worker
// runtimes, and is unit-testable without a database.
// =====================================================================

// ---------------------------------------------------------------------
// Passport ID serialization — 'ATH-YYYY-NNNN'
// ---------------------------------------------------------------------

export const PASSPORT_ID_PATTERN = /^ATH-(\d{4})-(\d{4})$/;

/** Loose legacy shapes we can rescue: 'ATH-020', 'ath 20', '0020', 'ATH-2025-20' */
const LEGACY_COUNTER_PATTERN = /(\d{1,4})\s*$/;

export interface PassportIdParts {
  year: number;
  counter: number;
}

export function isCanonicalPassportId(id: string): boolean {
  return PASSPORT_ID_PATTERN.test(id);
}

export function parsePassportId(id: string): PassportIdParts | null {
  const m = PASSPORT_ID_PATTERN.exec(id);
  if (!m) return null;
  return { year: Number(m[1]), counter: Number(m[2]) };
}

export function buildPassportId(year: number, counter: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) {
    throw new RangeError(`convexAdapter: invalid passport year '${year}'`);
  }
  if (!Number.isInteger(counter) || counter < 0 || counter > 9999) {
    throw new RangeError(`convexAdapter: invalid passport counter '${counter}'`);
  }
  return `ATH-${year}-${String(counter).padStart(4, "0")}`;
}

/**
 * Normalize any local identifier into the Convex 'ATH-YYYY-NNNN' format.
 * - Canonical IDs pass through untouched.
 * - Legacy IDs ('ATH-020') have their counter extracted and re-padded.
 * - Year is derived from `createdAt`; when absent, defaults to 2025
 *   (mirrors scripts/normalize-legacy-ids.js policy).
 */
export function serializePassportId(
  rawId: string | null | undefined,
  createdAt?: string | Date | null,
  fallbackYear = 2025
): string {
  const raw = (rawId ?? "").trim();
  if (isCanonicalPassportId(raw)) return raw;

  const counterMatch = LEGACY_COUNTER_PATTERN.exec(raw);
  if (!counterMatch || counterMatch[1] === undefined) {
    throw new Error(
      `convexAdapter: cannot serialize passport id from '${raw}' — no numeric counter present`
    );
  }

  let year = fallbackYear;
  if (createdAt) {
    const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
    if (!Number.isNaN(d.getTime())) year = d.getUTCFullYear();
  }

  return buildPassportId(year, Number(counterMatch[1]));
}

// ---------------------------------------------------------------------
// Sport taxonomy mapping — Postgres sport_taxonomy → Convex sport names
// ---------------------------------------------------------------------

/**
 * Explicit alias map for every known local taxonomy value / historical
 * variant. Convex expects normalized lowercase snake_case strings.
 * Unknown-but-well-formed codes fall through `normalizeSportCode`.
 */
const SPORT_ALIAS_MAP: Readonly<Record<string, string>> = {
  ice_hockey: "ice_hockey",
  "ice hockey": "ice_hockey",
  icehockey: "ice_hockey",
  hockey_ice: "ice_hockey",
  inline_hockey: "inline_hockey",
  "inline hockey": "inline_hockey",
  roller_hockey: "inline_hockey",
  "roller hockey": "inline_hockey",
  nrhl_inline: "inline_hockey",
  inline_skating: "inline_skating",
  "inline skating": "inline_skating",
  speed_skating: "speed_skating",
  figure_skating: "figure_skating",
  figure_skating_precision: "figure_skating",
  basic_skating: "basic_skating",
};

/** Lowercase, trim, collapse whitespace/hyphens to single underscores. */
export function normalizeSportCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function mapSportToConvex(sportCode: string | null | undefined): string {
  const raw = (sportCode ?? "").trim();
  if (!raw) {
    throw new Error("convexAdapter: sport code is empty — refusing to emit unmapped document");
  }
  const direct = SPORT_ALIAS_MAP[raw.toLowerCase()];
  if (direct) return direct;
  const normalized = normalizeSportCode(raw);
  return SPORT_ALIAS_MAP[normalized] ?? normalized;
}

// ---------------------------------------------------------------------
// Sizing metrics — structured JSON strings per the Convex schema
// ---------------------------------------------------------------------

export interface SizingInput {
  skate_size?: string | number | null;
  protective_kit_size?: string | null;
}

interface ConvexSizingShape {
  skate: { size: string; system: "eu" } | null;
  protectiveKit: { size: string } | null;
}

/**
 * Emit the sizing block as a JSON *string* (Convex schema stores sizing
 * as a serialized structured payload, not a nested object).
 */
export function formatSizingMetrics(input: SizingInput): string {
  const skateRaw = input.skate_size == null ? "" : String(input.skate_size).trim();
  const kitRaw = input.protective_kit_size == null ? "" : String(input.protective_kit_size).trim();

  const shape: ConvexSizingShape = {
    skate: skateRaw ? { size: skateRaw, system: "eu" } : null,
    protectiveKit: kitRaw ? { size: kitRaw.toLowerCase() } : null,
  };

  return JSON.stringify(shape);
}

// ---------------------------------------------------------------------
// Row → Document adapters
// ---------------------------------------------------------------------

/** Postgres row shape (public.athlete + registration sizing fields). */
export interface AthleteRow {
  athlete_id: string;
  passport_id?: string | null;
  legal_name: string;
  preferred_name?: string | null;
  date_of_birth: string;
  sex_at_birth?: string | null;
  nationalities?: string[] | null;
  current_status?: string | null;
  primary_sport_code: string;
  created_at?: string | null;
  skate_size?: string | number | null;
  protective_kit_size?: string | null;
}

/** Postgres row shape (public.athlete_metrics_log). */
export interface MetricRow {
  id?: string | number | null;
  athlete_id: string;
  passport_id?: string | null;
  sport_code?: string | null;
  metric_code: string;
  metric_value: string | number | boolean;
  metric_timestamp?: string | null;
  created_at?: string | null;
}

export interface ConvexAthleteDocument {
  passportId: string;
  sourceRowId: string;
  legalName: string;
  preferredName: string | null;
  dateOfBirth: string;
  sexAtBirth: string | null;
  nationalities: string[];
  status: string;
  sport: string;
  sizing: string; // structured JSON string
  syncedFrom: "athlytica-postgres";
  sourceUpdatedAt: string;
}

export interface ConvexMetricDocument {
  passportId: string;
  sourceRowId: string;
  sport: string | null;
  metricCode: string;
  metricValue: string | number | boolean;
  recordedAt: string;
  syncedFrom: "athlytica-postgres";
  sourceUpdatedAt: string;
}

export type ConvexRecordType = "athlete" | "metric";

export type ConvexDocument = ConvexAthleteDocument | ConvexMetricDocument;

export function toConvexAthleteDocument(row: AthleteRow): ConvexAthleteDocument {
  if (!row.passport_id) {
    throw new Error(
      `convexAdapter: athlete row '${row.athlete_id}' carries no passport_id — run scripts/normalize-legacy-ids.js first`
    );
  }
  return {
    passportId: serializePassportId(row.passport_id, row.created_at),
    sourceRowId: row.athlete_id,
    legalName: row.legal_name,
    preferredName: row.preferred_name ?? null,
    dateOfBirth: row.date_of_birth,
    sexAtBirth: row.sex_at_birth ?? null,
    nationalities: row.nationalities ?? [],
    status: row.current_status ?? "active",
    sport: mapSportToConvex(row.primary_sport_code),
    sizing: formatSizingMetrics(row),
    syncedFrom: "athlytica-postgres",
    sourceUpdatedAt: new Date().toISOString(),
  };
}

export function toConvexMetricDocument(row: MetricRow): ConvexMetricDocument {
  if (!row.passport_id) {
    throw new Error(
      `convexAdapter: metric row for athlete '${row.athlete_id}' carries no passport_id — run scripts/normalize-legacy-ids.js first`
    );
  }
  return {
    passportId: serializePassportId(row.passport_id, row.created_at),
    sourceRowId: String(row.id ?? row.athlete_id),
    sport: row.sport_code ? mapSportToConvex(row.sport_code) : null,
    metricCode: row.metric_code,
    metricValue: row.metric_value,
    recordedAt: row.metric_timestamp ?? row.created_at ?? new Date().toISOString(),
    syncedFrom: "athlytica-postgres",
    sourceUpdatedAt: new Date().toISOString(),
  };
}

/** Single dispatch surface used by the gateway controller. */
export function adaptRecordForConvex(
  recordType: ConvexRecordType,
  payload: unknown
): ConvexDocument {
  switch (recordType) {
    case "athlete":
      return toConvexAthleteDocument(payload as AthleteRow);
    case "metric":
      return toConvexMetricDocument(payload as MetricRow);
    default: {
      const never: never = recordType;
      throw new Error(`convexAdapter: unsupported record type '${String(never)}'`);
    }
  }
}
