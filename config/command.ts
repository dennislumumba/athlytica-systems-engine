// =====================================================================
// COMMAND CANVAS TAXONOMY — the shared vocabulary of the re-architected
// main dashboard (founder directive 2026-07-28).
//
// Two operating lenses over one platform:
//   founder → Pan-African scale, governance, scout funnel, money
//   coach   → the athletes in front of you today
//
// Geography, tier bands, anomaly thresholds and benchmark baselines all
// live here so the server (which computes) and the client (which labels)
// can never disagree. Nothing in this file queries anything.
// =====================================================================

import type { Perspective, WorkspaceId } from "./workspaces";

// ---------------------------------------------------------------------
// Modes. The founder's Executive/Coach lens already exists in the shell
// and is already persisted — the command canvas renames it rather than
// inventing a second toggle that could drift out of step with the first.
// ---------------------------------------------------------------------

export type CommandMode = "founder" | "coach";

export const MODE_LABEL: Record<CommandMode, string> = {
  founder: "Founder Command",
  coach: "Head Coach Hub",
};

export const MODE_BLURB: Record<CommandMode, string> = {
  founder: "Pan-African scale · governance · scout funnel · revenue",
  coach: "Tactical readiness · cohort progress · session compliance",
};

export const modeFromPerspective = (p: Perspective): CommandMode =>
  p === "coach" ? "coach" : "founder";

export const perspectiveFromMode = (m: CommandMode): Perspective =>
  m === "coach" ? "coach" : "executive";

// ---------------------------------------------------------------------
// Geography. Sub-filter is Global Africa → region → single hub, so a
// region has to be derivable from the one country field the passport
// schema actually carries (club.country_code / federation.country_code,
// ISO-3166 alpha-3).
// ---------------------------------------------------------------------

export type RegionId = "east" | "west" | "south" | "north" | "central" | "unassigned";

export const REGIONS: Record<RegionId, { label: string; short: string; countries: string[] }> = {
  east: {
    label: "East Africa",
    short: "East",
    countries: ["KEN", "UGA", "TZA", "RWA", "BDI", "ETH", "SSD", "SOM", "DJI", "ERI"],
  },
  west: {
    label: "West Africa",
    short: "West",
    countries: ["NGA", "GHA", "SEN", "CIV", "MLI", "BFA", "BEN", "TGO", "GIN", "SLE", "LBR", "GMB"],
  },
  south: {
    label: "Southern Africa",
    short: "South",
    countries: ["ZAF", "ZWE", "ZMB", "BWA", "NAM", "MOZ", "MWI", "LSO", "SWZ", "AGO", "MDG"],
  },
  north: {
    label: "North Africa",
    short: "North",
    countries: ["EGY", "MAR", "TUN", "DZA", "LBY", "SDN"],
  },
  central: {
    label: "Central Africa",
    short: "Central",
    countries: ["COD", "CMR", "GAB", "TCD", "CAF", "COG", "GNQ"],
  },
  unassigned: { label: "Unassigned", short: "Unassigned", countries: [] },
};

export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

/** ISO-3 → region, built from REGIONS so the two can never disagree. */
export const REGION_BY_COUNTRY: Record<string, RegionId> = Object.fromEntries(
  REGION_IDS.flatMap((id) => REGIONS[id].countries.map((c) => [c, id])),
);

export const regionOf = (countryCode: string | null | undefined): RegionId =>
  (countryCode && REGION_BY_COUNTRY[countryCode.toUpperCase()]) || "unassigned";

// ---------------------------------------------------------------------
// Development tiers. Composite score is the engine's 0–100 axis mean, so
// the tier bands are stated once here and used by both the velocity
// matrix and the leaderboard.
// ---------------------------------------------------------------------

export type TierId = "beginner" | "intermediate" | "advanced" | "pro";

export const TIERS: Record<TierId, { label: string; min: number; max: number }> = {
  beginner: { label: "Beginner", min: 0, max: 40 },
  intermediate: { label: "Intermediate", min: 40, max: 60 },
  advanced: { label: "Advanced", min: 60, max: 80 },
  pro: { label: "Pro / National Pipeline", min: 80, max: 101 },
};

export const TIER_IDS = Object.keys(TIERS) as TierId[];

export function tierOf(composite: number | null): TierId | null {
  if (composite === null || !Number.isFinite(composite)) return null;
  for (const id of TIER_IDS) {
    const band = TIERS[id];
    if (composite >= band.min && composite < band.max) return id;
  }
  return composite >= 100 ? "pro" : null;
}

// ---------------------------------------------------------------------
// Integrity thresholds. Every flag the Shadow Audit queue and the
// Passport Integrity Engine raise is one of these — the codes are the
// contract between server detection and client labelling.
// ---------------------------------------------------------------------

export type FlagSeverity = "critical" | "warn" | "info";

export type FlagCode =
  | "DUPLICATE_IDENTITY"
  | "DUPLICATE_NATIONAL_ID"
  | "DOB_IMPLAUSIBLE"
  | "DOB_ESTIMATED"
  | "DOB_MISSING"
  | "NO_ID_DOCUMENT"
  | "BIOMETRIC_OUT_OF_RANGE"
  | "SELF_REPORTED_ONLY"
  | "VENUE_UNVERIFIED"
  | "NO_GUARDIAN_CONSENT"
  | "STALE_ASSESSMENT";

export const FLAGS: Record<FlagCode, { label: string; severity: FlagSeverity }> = {
  DUPLICATE_IDENTITY: { label: "Duplicate identity", severity: "critical" },
  DUPLICATE_NATIONAL_ID: { label: "Duplicate ID hash", severity: "critical" },
  DOB_IMPLAUSIBLE: { label: "Birth date implausible", severity: "critical" },
  DOB_ESTIMATED: { label: "Birth date estimated", severity: "warn" },
  DOB_MISSING: { label: "Birth date missing", severity: "warn" },
  NO_ID_DOCUMENT: { label: "No identity document", severity: "warn" },
  BIOMETRIC_OUT_OF_RANGE: { label: "Biometric out of range", severity: "warn" },
  SELF_REPORTED_ONLY: { label: "Self-reported only", severity: "info" },
  VENUE_UNVERIFIED: { label: "Venue unverified", severity: "warn" },
  NO_GUARDIAN_CONSENT: { label: "No guardian consent", severity: "critical" },
  STALE_ASSESSMENT: { label: "Assessment stale (90d+)", severity: "info" },
};

/** Plausible ranges for a youth-development population. */
export const LIMITS = {
  ageMinYears: 5,
  ageMaxYears: 45,
  heightCm: [90, 220] as const,
  weightKg: [18, 150] as const,
  staleAssessmentDays: 90,
  /** Rolling window the velocity matrix and readiness index measure over. */
  windowDays: 90,
  readinessWindowDays: 30,
};

// ---------------------------------------------------------------------
// Cross-academy benchmark baselines.
//
// SOURCE OF TRUTH WARNING: these are internal working baselines, not
// federation-published norms. They are config, not measurements, and the
// UI labels them as such. Replace per-axis as real regional/national
// data lands (see the benchmark panel's provenance badge).
// ---------------------------------------------------------------------

export const BENCHMARK_AXES = ["speed", "agility", "stamina", "technical", "cognitive"] as const;
export type BenchmarkAxis = (typeof BENCHMARK_AXES)[number];

export type BenchmarkBand = "regional" | "national" | "international";

export const BENCHMARKS: Record<BenchmarkAxis, Record<BenchmarkBand, number>> = {
  speed: { regional: 55, national: 68, international: 82 },
  agility: { regional: 54, national: 66, international: 80 },
  stamina: { regional: 57, national: 70, international: 84 },
  technical: { regional: 52, national: 67, international: 85 },
  cognitive: { regional: 50, national: 64, international: 79 },
};

export const BENCHMARK_SOURCE = "Athlytica internal baseline v1 · not federation-published";

// ---------------------------------------------------------------------
// Tier-1 quick actions. Every entry resolves to a real destination —
// either a route that exists or an anchor to a panel on this canvas.
// A tile that does nothing is worse than no tile.
// ---------------------------------------------------------------------

export interface QuickAction {
  id: string;
  label: string;
  hint: string;
  href: string;
}

export const QUICK_ACTIONS: Record<CommandMode, QuickAction[]> = {
  founder: [
    {
      id: "onboard-hub",
      label: "Onboard New Hub / Tenant",
      hint: "Intake documents & guardian consent",
      href: "/dashboard/leagues/nrhl/onboarding",
    },
    {
      id: "publish-dossier",
      label: "Publish Scout Dossier",
      hint: "Passport export & share link",
      href: "/dashboard/venture#passport",
    },
    {
      id: "audit-ledger",
      label: "Review Audit Ledger",
      hint: "Hash-chained export & verification trail",
      href: "#export-ledger",
    },
    {
      id: "platform-analytics",
      label: "Platform Analytics",
      hint: "League reports & roadmap",
      href: "/dashboard/leagues/nrhl/reports",
    },
  ],
  coach: [
    {
      id: "log-combine",
      label: "Log Combine / Assessment",
      hint: "Stats & standings entry",
      href: "/dashboard/leagues/nrhl/stats",
    },
    {
      id: "schedule-tryout",
      label: "Schedule Tryout",
      hint: "Drafting & selection board",
      href: "/dashboard/leagues/nrhl/drafting",
    },
    {
      id: "export-roster",
      label: "Export Team Roster",
      hint: "Roster & admin exports",
      href: "/dashboard/leagues/nrhl/admin",
    },
    {
      id: "league-schedule",
      label: "Manage League Schedule",
      hint: "Fixtures & match windows",
      href: "/dashboard/leagues/nrhl/overview",
    },
  ],
};

// ---------------------------------------------------------------------
// Panel index per mode — drives the canvas anchor rail and the shell
// sidebar, so nav and panels share ids exactly as the venture
// dashboards already do.
// ---------------------------------------------------------------------

export interface CommandPanel {
  id: string;
  label: string;
  modes: CommandMode[];
}

export const COMMAND_PANELS: CommandPanel[] = [
  { id: "shadow-audit", label: "Shadow Audit 2.0", modes: ["founder", "coach"] },
  { id: "hub-health", label: "Regional Expansion & Hub Health", modes: ["founder"] },
  { id: "scout-pipeline", label: "Scout & Institutional Pipeline", modes: ["founder"] },
  { id: "tenancy", label: "Tenant Compliance & Billing", modes: ["founder"] },
  { id: "velocity", label: "Talent Development Velocity", modes: ["coach"] },
  { id: "readiness", label: "Roster Readiness & Combine", modes: ["coach"] },
  { id: "coach-logs", label: "Coaching Assessment Tracker", modes: ["coach"] },
  { id: "edge-buffer", label: "Offline Sync & Edge Buffer", modes: ["founder", "coach"] },
  { id: "integrity", label: "Passport Integrity Engine", modes: ["founder", "coach"] },
  { id: "benchmark", label: "Cross-Academy Benchmark", modes: ["founder", "coach"] },
  { id: "export-ledger", label: "Talent Export Ledger", modes: ["founder", "coach"] },
  { id: "quick-actions", label: "Quick Actions", modes: ["founder", "coach"] },
];

export const panelsFor = (mode: CommandMode): CommandPanel[] =>
  COMMAND_PANELS.filter((p) => p.modes.includes(mode));

/** Venture workspace that owns a tenant id, when one does. */
export const WORKSPACE_BY_TENANT: Record<string, WorkspaceId> = {
  "77000001-0000-4000-8000-000000000001": "tta",
};
