// =====================================================================
// COMMAND CANVAS DERIVATIONS — every number the re-architected dashboard
// shows is computed here, from rows the caller has already fetched.
//
// Pure by design: no Supabase client, no fetch, no Date.now(). The route
// hands in rows plus `now`, gets back the whole payload, and does nothing
// else. That is what makes the anomaly detection and the readiness
// arithmetic testable (tests/command-metrics.test.mts).
//
// Every figure that is a *policy* rather than a measurement (tier bands,
// plausible ranges, benchmark baselines) comes from config/command.ts,
// never from a literal in this file.
// =====================================================================

import {
  BENCHMARKS,
  BENCHMARK_AXES,
  BENCHMARK_SOURCE,
  FLAGS,
  LIMITS,
  TIER_IDS,
  TIERS,
  WORKSPACE_BY_TENANT,
  regionOf,
  tierOf,
  type BenchmarkAxis,
  type FlagCode,
  type FlagSeverity,
  type RegionId,
  type TierId,
} from "../../config/command.ts";

// ---------------------------------------------------------------------
// Row shapes — the subset of each table the canvas actually reads.
// ---------------------------------------------------------------------

export interface AthleteRow {
  athlete_id: string;
  legal_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  is_dob_estimated: boolean | null;
  is_legacy: boolean | null;
  national_id_hash: string | null;
  current_status: string | null;
  primary_sport_code: string | null;
  provenance_id: string | null;
  created_at: string | null;
}

export interface ProvenanceRow {
  provenance_id: string;
  data_source: string | null;
  entered_by_actor_id: string | null;
  entered_by_actor_role: string | null;
  entered_at: string | null;
  verified_at: string | null;
  verification_status: string | null;
  verification_method: string | null;
  confidence_score: number | string | null;
}

export interface ClubRow {
  club_id: string;
  name: string | null;
  country_code: string | null;
  federation_id: string | null;
  is_training_club: boolean | null;
}

export interface FederationRow {
  federation_id: string;
  name: string | null;
  country_code: string | null;
  sport_code: string | null;
}

export interface TenantRow {
  id: string;
  name: string | null;
  created_at: string | null;
}

export interface VenueRow {
  id: string;
  name: string | null;
  tenant_id: string | null;
}

export interface CustodyRow {
  custody_id: string;
  athlete_id: string | null;
  club_id: string | null;
  federation_id: string | null;
  start_date: string | null;
  end_date: string | null;
}

export interface LinkRow {
  athlete_id: string | null;
  tenant_id: string | null;
}

export interface SessionRow {
  id: string;
  athlete_id: string | null;
  venue_id: string | null;
  start_time: string | null;
}

export interface PerfRow {
  id: string;
  athlete_id: string | null;
  session_id: string | null;
  speed: number | null;
  agility: number | null;
  stamina: number | null;
  technical: number | null;
  cognitive: number | null;
  composite_score: number | null;
  tenant_id: string | null;
  venue_verified: boolean | null;
  created_at: string | null;
}

export interface BiometricRow {
  record_id: string;
  athlete_id: string | null;
  measured_at: string | null;
  height_cm: number | string | null;
  weight_kg: number | string | null;
  age_at_measurement_years: number | string | null;
  provenance_id: string | null;
}

export interface GuardianRow {
  guardian_id: string;
  athlete_id: string | null;
  consent_on_file: boolean | null;
}

export interface QueueRow {
  id: string;
  status: string | null;
  attempts: number | null;
  tenant_id: string | null;
  athlete_id: string | null;
  error: string | null;
  venue_verified: boolean | null;
  created_at: string | null;
  processed_at: string | null;
}

export interface DeadLetterRow {
  id: string;
  record_type: string | null;
  last_error: string | null;
  failed_at: string | null;
}

export interface AuditRow {
  event_id: string;
  event_type: string | null;
  actor_id: string | null;
  occurred_at: string | null;
  record_type: string | null;
  record_id: string | null;
  event_hash: string | null;
}

export interface RegistrationRow {
  venture_context: string | null;
  tier: string | null;
  payment_status: string | null;
  amount_expected_kes: number | string | null;
  settled_at: string | null;
}

export interface PaymentRow {
  amount_kes: number | string | null;
  result_code: number | string | null;
  created_at: string | null;
}

export interface ScoutLogRow {
  id: string;
  athlete_id: string | null;
  metric_code: string | null;
  context: string | null;
  logged_at: string | null;
}

export interface CoachLinkRow {
  athlete_id: string | null;
  coach_id: string | null;
  role_label: string | null;
}

export interface CohortRow {
  registry_id: string;
  cohort_label: string | null;
  track_type: string | null;
  session_day_of_week: number | null;
  window_start_time: string | null;
  window_end_time: string | null;
  capacity: number | null;
  season_start_date: string | null;
  season_end_date: string | null;
  student_athlete_id: string | null;
  enrollment_status: string | null;
}

export interface LeagueAthleteRow {
  athlete_code: string;
  display_name: string | null;
  team: string | null;
  division: string | null;
  age_tier: string | null;
  games_played: number | null;
  attendance_rate_pct: number | string | null;
  coach_grade_avg: number | string | null;
  composite_score: number | string | null;
  legacy_points: number | null;
  conduct_cases: number | null;
}

export interface CommandInput {
  athletes: AthleteRow[];
  provenance: ProvenanceRow[];
  clubs: ClubRow[];
  federations: FederationRow[];
  tenants: TenantRow[];
  venues: VenueRow[];
  custody: CustodyRow[];
  links: LinkRow[];
  sessions: SessionRow[];
  performance: PerfRow[];
  biometrics: BiometricRow[];
  guardians: GuardianRow[];
  queue: QueueRow[];
  deadLetters: DeadLetterRow[];
  audit: AuditRow[];
  registrations: RegistrationRow[];
  payments: PaymentRow[];
  scoutLogs: ScoutLogRow[];
  coachLinks: CoachLinkRow[];
  cohorts: CohortRow[];
  league: LeagueAthleteRow[];
}

// ---------------------------------------------------------------------
// Payload shapes — the JSON contract the client renders.
// ---------------------------------------------------------------------

export interface Flag {
  code: FlagCode;
  label: string;
  severity: FlagSeverity;
  detail: string;
}

export interface Hub {
  hubId: string;
  name: string;
  kind: "club" | "federation" | "tenant";
  countryCode: string | null;
  region: RegionId;
  workspace: string | null;
  status: "live" | "onboarding" | "dormant";
  athletes: number;
  verified: number;
  sessions: number;
  venues: number;
  lastActivityAt: string | null;
}

export interface TenantHealth {
  tenantId: string;
  name: string;
  workspace: string | null;
  athletes: number;
  venues: number;
  telemetry: number;
  consentCoverage: number;
  verifiedRatio: number;
  syncFailures: number;
  status: "healthy" | "attention" | "blocked";
  flags: string[];
  createdAt: string | null;
}

export interface AuditItem {
  id: string;
  provenanceId: string | null;
  recordKind: "passport" | "biometric" | "telemetry";
  subject: string;
  athleteId: string | null;
  hubId: string | null;
  hubName: string;
  region: RegionId;
  submittedBy: string;
  submittedAt: string | null;
  dataSource: string;
  verificationStatus: string;
  confidence: number | null;
  flags: Flag[];
  approvable: boolean;
  blockedReason: string | null;
}

export interface IntegrityCase {
  code: FlagCode;
  label: string;
  severity: FlagSeverity;
  detail: string;
  athleteIds: string[];
  subjects: string[];
  hubName: string;
  region: RegionId;
}

export interface LedgerEntry {
  eventId: string;
  kind: "export" | "verification" | "transfer" | "other";
  eventType: string;
  recordType: string | null;
  recordId: string | null;
  actorId: string | null;
  occurredAt: string | null;
  hashPrefix: string | null;
}

export interface CoachAthlete {
  athleteId: string;
  name: string;
  hubId: string | null;
  hubName: string;
  region: RegionId;
  position: string | null;
  composite: number | null;
  tier: TierId | null;
  delta90d: number | null;
  lastAssessedAt: string | null;
  staleDays: number | null;
  status: string;
  flagCount: number;
}

export interface CommandPayload {
  generatedAt: string;
  hubs: Hub[];
  tenancy: TenantHealth[];
  passports: {
    total: number;
    verified: number;
    pending: number;
    unverified: number;
    disputed: number;
    revoked: number;
    ratioPct: number;
    estimatedDob: number;
    legacy: number;
  };
  revenue: {
    settledKes: number;
    railKes: number;
    last30Kes: number;
    trailing12Kes: number;
    arrRunRateKes: number;
    paidRegistrations: number;
    byVenture: Array<{ venture: string; settledKes: number; paid: number }>;
  };
  scout: {
    engagementScore: number;
    formula: string;
    exportsWindow: number;
    viewsWindow: number;
    activeScouts: number;
    ticker: Array<{
      when: string | null;
      actor: string;
      action: string;
      subject: string;
      hubName: string;
    }>;
  };
  audit: {
    queue: AuditItem[];
    counts: { total: number; blocked: number; approvable: number; critical: number };
  };
  integrity: {
    cases: IntegrityCase[];
    counts: { critical: number; warn: number; info: number };
  };
  edge: {
    online: boolean | null;
    bufferedRecords: number;
    failedRecords: number;
    deadLetters: number;
    oldestBufferedAt: string | null;
    lastIngestAt: string | null;
    unverifiedVenueLogs: number;
    deadLetterRows: DeadLetterRow[];
  };
  ledger: LedgerEntry[];
  coach: {
    athletes: CoachAthlete[];
    readiness: { index: number | null; sampleSize: number; windowDays: number; basis: string };
    compliance: {
      sessions: number;
      complete: number;
      pct: number;
      windowDays: number;
    };
    velocity: Array<{ tier: TierId; label: string; count: number; movedIn: number; movedOut: number }>;
    leaderboard: Array<{
      athleteId: string;
      name: string;
      composite: number;
      best: BenchmarkAxis | null;
      bestValue: number | null;
      percentile: number;
      tier: TierId | null;
    }>;
    coachLogs: Array<{
      coachId: string;
      roleLabel: string | null;
      athletes: number;
      lastLogAt: string | null;
      loggedToday: boolean;
      staleDays: number | null;
    }>;
    windows: Array<{
      registryId: string;
      cohort: string;
      track: string | null;
      nextAt: string | null;
      capacity: number | null;
      enrolled: number;
    }>;
    standings: Array<{
      team: string;
      division: string | null;
      players: number;
      points: number;
      attendancePct: number | null;
      compositeAvg: number | null;
      conductCases: number;
    }>;
  };
  benchmark: {
    source: string;
    axes: Array<{
      axis: BenchmarkAxis;
      cohort: number | null;
      regional: number;
      national: number;
      international: number;
    }>;
    athletes: Array<{ athleteId: string; name: string; values: Record<BenchmarkAxis, number | null> }>;
  };
}

// ---------------------------------------------------------------------
// Small shared helpers.
// ---------------------------------------------------------------------

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const ms = (v: unknown): number | null => {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
};

const days = (from: number, to: number) => Math.floor((to - from) / 86_400_000);

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length;

const nameOf = (a: AthleteRow) => a.preferred_name ?? a.legal_name ?? a.athlete_id;

const flag = (code: FlagCode, detail: string): Flag => ({
  code,
  label: FLAGS[code].label,
  severity: FLAGS[code].severity,
  detail,
});

const ageYears = (dob: string | null, nowMs: number): number | null => {
  const born = ms(dob);
  return born === null ? null : (nowMs - born) / (365.25 * 86_400_000);
};

// ---------------------------------------------------------------------
// Hub resolution — the geography every other panel filters by.
// ---------------------------------------------------------------------

export interface HubIndex {
  hubs: Hub[];
  /** athlete_id → hubId (primary custody, else tenant link). */
  hubOfAthlete: Map<string, string>;
  byId: Map<string, Hub>;
}

export function buildHubs(input: CommandInput, nowMs: number): HubIndex {
  const hubs = new Map<string, Hub>();

  const put = (hub: Hub) => hubs.set(hub.hubId, hub);

  for (const c of input.clubs) {
    put({
      hubId: `club:${c.club_id}`,
      name: c.name ?? "Unnamed club",
      kind: "club",
      countryCode: c.country_code ?? null,
      region: regionOf(c.country_code),
      workspace: null,
      status: "dormant",
      athletes: 0,
      verified: 0,
      sessions: 0,
      venues: 0,
      lastActivityAt: null,
    });
  }
  for (const f of input.federations) {
    put({
      hubId: `fed:${f.federation_id}`,
      name: f.name ?? "Unnamed federation",
      kind: "federation",
      countryCode: f.country_code ?? null,
      region: regionOf(f.country_code),
      workspace: null,
      status: "dormant",
      athletes: 0,
      verified: 0,
      sessions: 0,
      venues: 0,
      lastActivityAt: null,
    });
  }
  for (const t of input.tenants) {
    put({
      hubId: `tenant:${t.id}`,
      name: t.name ?? "Unnamed tenant",
      kind: "tenant",
      countryCode: null,
      region: "unassigned",
      workspace: WORKSPACE_BY_TENANT[t.id] ?? null,
      status: "onboarding",
      athletes: 0,
      verified: 0,
      sessions: 0,
      venues: 0,
      lastActivityAt: null,
    });
  }

  // A tenant that shares a name with a club inherits its geography —
  // TTA is both a billing tenant and a registered club.
  const clubByName = new Map(
    input.clubs.map((c) => [(c.name ?? "").trim().toLowerCase(), c]),
  );
  for (const hub of hubs.values()) {
    if (hub.kind !== "tenant") continue;
    const twin = clubByName.get(hub.name.trim().toLowerCase());
    if (twin?.country_code) {
      hub.countryCode = twin.country_code;
      hub.region = regionOf(twin.country_code);
    }
  }

  // Athlete → hub: open custody first, then most recent, then tenancy.
  const hubOfAthlete = new Map<string, string>();
  const ranked = [...input.custody].sort((a, b) => (ms(b.start_date) ?? 0) - (ms(a.start_date) ?? 0));
  for (const row of ranked) {
    if (!row.athlete_id) continue;
    const hubId = row.club_id
      ? `club:${row.club_id}`
      : row.federation_id
        ? `fed:${row.federation_id}`
        : null;
    if (!hubId || !hubs.has(hubId)) continue;
    const existing = hubOfAthlete.get(row.athlete_id);
    if (existing && row.end_date) continue; // keep the open registration
    hubOfAthlete.set(row.athlete_id, hubId);
  }
  for (const link of input.links) {
    if (!link.athlete_id || !link.tenant_id) continue;
    if (hubOfAthlete.has(link.athlete_id)) continue;
    const hubId = `tenant:${link.tenant_id}`;
    if (hubs.has(hubId)) hubOfAthlete.set(link.athlete_id, hubId);
  }

  // Counts.
  const verifiedProv = new Set(
    input.provenance.filter((p) => p.verification_status === "verified").map((p) => p.provenance_id),
  );
  for (const a of input.athletes) {
    const hub = hubs.get(hubOfAthlete.get(a.athlete_id) ?? "");
    if (!hub) continue;
    hub.athletes += 1;
    if (a.provenance_id && verifiedProv.has(a.provenance_id)) hub.verified += 1;
  }
  for (const v of input.venues) {
    const hub = v.tenant_id ? hubs.get(`tenant:${v.tenant_id}`) : undefined;
    if (hub) hub.venues += 1;
  }
  for (const s of input.sessions) {
    const hub = s.athlete_id ? hubs.get(hubOfAthlete.get(s.athlete_id) ?? "") : undefined;
    if (!hub) continue;
    hub.sessions += 1;
    const at = ms(s.start_time);
    if (at !== null && (hub.lastActivityAt === null || at > (ms(hub.lastActivityAt) ?? 0))) {
      hub.lastActivityAt = s.start_time;
    }
  }

  // Status: activity inside the rolling window is "live"; roster without
  // telemetry is still onboarding; nothing at all is dormant.
  for (const hub of hubs.values()) {
    const last = ms(hub.lastActivityAt);
    if (last !== null && days(last, nowMs) <= LIMITS.windowDays) hub.status = "live";
    else if (hub.athletes > 0) hub.status = "onboarding";
    else hub.status = "dormant";
  }

  return { hubs: [...hubs.values()], hubOfAthlete, byId: hubs };
}

// ---------------------------------------------------------------------
// Passport integrity — duplicates, birth dates, documents, consent.
// ---------------------------------------------------------------------

export function integrityFlags(
  input: CommandInput,
  nowMs: number,
): { byAthlete: Map<string, Flag[]>; cases: IntegrityCase[]; index: HubIndex } {
  const index = buildHubs(input, nowMs);
  const byAthlete = new Map<string, Flag[]>();
  const cases: IntegrityCase[] = [];
  const provById = new Map(input.provenance.map((p) => [p.provenance_id, p]));
  const consentByAthlete = new Map<string, boolean>();
  for (const g of input.guardians) {
    if (!g.athlete_id) continue;
    consentByAthlete.set(g.athlete_id, (consentByAthlete.get(g.athlete_id) ?? false) || Boolean(g.consent_on_file));
  }

  const add = (athleteId: string, f: Flag) => {
    const list = byAthlete.get(athleteId) ?? [];
    list.push(f);
    byAthlete.set(athleteId, list);
  };

  const hubName = (athleteId: string) =>
    index.byId.get(index.hubOfAthlete.get(athleteId) ?? "")?.name ?? "Unassigned hub";
  const hubRegion = (athleteId: string): RegionId =>
    index.byId.get(index.hubOfAthlete.get(athleteId) ?? "")?.region ?? "unassigned";

  // --- duplicate identity across hubs (name + birth date collision).
  const byIdentity = new Map<string, AthleteRow[]>();
  const byIdHash = new Map<string, AthleteRow[]>();
  for (const a of input.athletes) {
    const key = `${(a.legal_name ?? "").trim().toLowerCase()}|${a.date_of_birth ?? ""}`;
    if (key !== "|") {
      const list = byIdentity.get(key) ?? [];
      list.push(a);
      byIdentity.set(key, list);
    }
    if (a.national_id_hash) {
      const list = byIdHash.get(a.national_id_hash) ?? [];
      list.push(a);
      byIdHash.set(a.national_id_hash, list);
    }
  }

  for (const [, group] of byIdentity) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    const hubs = new Set(group.map((a) => hubName(a.athlete_id)));
    for (const a of group) {
      add(a.athlete_id, flag("DUPLICATE_IDENTITY", `${group.length} passports share this name and birth date`));
    }
    cases.push({
      ...FLAGS.DUPLICATE_IDENTITY,
      code: "DUPLICATE_IDENTITY",
      detail: `${group.length} passports for "${first.legal_name ?? "unnamed"}" (${first.date_of_birth ?? "no dob"}) across ${hubs.size} hub(s)`,
      athleteIds: group.map((a) => a.athlete_id),
      subjects: group.map(nameOf),
      hubName: [...hubs].join(", "),
      region: hubRegion(first.athlete_id),
    });
  }

  for (const [, group] of byIdHash) {
    if (group.length < 2) continue;
    const first = group[0];
    if (!first) continue;
    for (const a of group) {
      add(a.athlete_id, flag("DUPLICATE_NATIONAL_ID", "Identity document hash reused"));
    }
    cases.push({
      ...FLAGS.DUPLICATE_NATIONAL_ID,
      code: "DUPLICATE_NATIONAL_ID",
      detail: `${group.length} passports registered against one identity document`,
      athleteIds: group.map((a) => a.athlete_id),
      subjects: group.map(nameOf),
      hubName: hubName(first.athlete_id),
      region: hubRegion(first.athlete_id),
    });
  }

  // --- per-athlete checks.
  for (const a of input.athletes) {
    const age = ageYears(a.date_of_birth, nowMs);
    const prov = a.provenance_id ? provById.get(a.provenance_id) : undefined;
    const push = (code: FlagCode, detail: string) => {
      add(a.athlete_id, flag(code, detail));
      cases.push({
        ...FLAGS[code],
        code,
        detail: `${nameOf(a)} — ${detail}`,
        athleteIds: [a.athlete_id],
        subjects: [nameOf(a)],
        hubName: hubName(a.athlete_id),
        region: hubRegion(a.athlete_id),
      });
    };

    if (!a.date_of_birth) push("DOB_MISSING", "no birth date on the passport");
    else if (age !== null && (age < LIMITS.ageMinYears || age > LIMITS.ageMaxYears)) {
      push("DOB_IMPLAUSIBLE", `derived age ${age.toFixed(1)}y outside ${LIMITS.ageMinYears}–${LIMITS.ageMaxYears}y`);
    }
    if (a.is_dob_estimated) push("DOB_ESTIMATED", "birth date is an estimate, not a document reading");
    if (!a.national_id_hash) push("NO_ID_DOCUMENT", "no identity document hash anchored");
    if (prov?.data_source === "self_reported" && prov.verification_status !== "verified") {
      push("SELF_REPORTED_ONLY", "only source is the athlete's own submission");
    }
    if (!consentByAthlete.get(a.athlete_id) && age !== null && age < 18) {
      push("NO_GUARDIAN_CONSENT", "minor with no guardian consent on file");
    }
  }

  // --- biometrics outside a plausible youth range.
  const athleteById = new Map(input.athletes.map((a) => [a.athlete_id, a]));
  for (const b of input.biometrics) {
    if (!b.athlete_id) continue;
    const h = num(b.height_cm);
    const w = num(b.weight_kg);
    const bad: string[] = [];
    if (h !== null && (h < LIMITS.heightCm[0] || h > LIMITS.heightCm[1])) bad.push(`height ${h}cm`);
    if (w !== null && (w < LIMITS.weightKg[0] || w > LIMITS.weightKg[1])) bad.push(`weight ${w}kg`);
    if (bad.length === 0) continue;
    const subject = athleteById.get(b.athlete_id);
    add(b.athlete_id, flag("BIOMETRIC_OUT_OF_RANGE", bad.join(", ")));
    cases.push({
      ...FLAGS.BIOMETRIC_OUT_OF_RANGE,
      code: "BIOMETRIC_OUT_OF_RANGE",
      detail: `${subject ? nameOf(subject) : b.athlete_id} — ${bad.join(", ")} on ${b.measured_at ?? "unknown date"}`,
      athleteIds: [b.athlete_id],
      subjects: subject ? [nameOf(subject)] : [b.athlete_id],
      hubName: hubName(b.athlete_id),
      region: hubRegion(b.athlete_id),
    });
  }

  const order: FlagSeverity[] = ["critical", "warn", "info"];
  cases.sort((x, y) => order.indexOf(x.severity) - order.indexOf(y.severity));

  return { byAthlete, cases, index };
}

// ---------------------------------------------------------------------
// Shadow Audit 2.0 — everything staged for promotion into the verified
// global talent database, with provenance and anomaly flags attached.
// ---------------------------------------------------------------------

const STAGED_STATUSES = new Set(["unverified", "pending", "disputed"]);

export function shadowAuditQueue(
  input: CommandInput,
  nowMs: number,
  index: HubIndex,
  flagsByAthlete: Map<string, Flag[]>,
): CommandPayload["audit"] {
  const provById = new Map(input.provenance.map((p) => [p.provenance_id, p]));
  const athleteById = new Map(input.athletes.map((a) => [a.athlete_id, a]));
  const queue: AuditItem[] = [];

  const hubFor = (athleteId: string | null) => {
    const hub = athleteId ? index.byId.get(index.hubOfAthlete.get(athleteId) ?? "") : undefined;
    return { hubId: hub?.hubId ?? null, hubName: hub?.name ?? "Unassigned hub", region: hub?.region ?? ("unassigned" as RegionId) };
  };

  // Approvable means "one click promotes this": no critical anomaly, and
  // a provenance row to write the verification onto. Telemetry has no
  // provenance of its own — it is verified where it is ingested.
  const stage = (item: Omit<AuditItem, "approvable" | "blockedReason">) => {
    const critical = item.flags.find((f) => f.severity === "critical");
    const reason = critical
      ? `${critical.label}: ${critical.detail}`
      : item.provenanceId
        ? null
        : "no provenance row — verify at the ingest source";
    queue.push({ ...item, approvable: reason === null, blockedReason: reason });
  };

  for (const a of input.athletes) {
    const prov = a.provenance_id ? provById.get(a.provenance_id) : undefined;
    const status = prov?.verification_status ?? "unverified";
    if (!STAGED_STATUSES.has(status)) continue;
    const hub = hubFor(a.athlete_id);
    stage({
      id: `passport:${a.athlete_id}`,
      provenanceId: prov?.provenance_id ?? null,
      recordKind: "passport",
      subject: nameOf(a),
      athleteId: a.athlete_id,
      ...hub,
      submittedBy: prov?.entered_by_actor_role ?? "unknown",
      submittedAt: prov?.entered_at ?? a.created_at,
      dataSource: prov?.data_source ?? "unknown",
      verificationStatus: status,
      confidence: num(prov?.confidence_score),
      flags: flagsByAthlete.get(a.athlete_id) ?? [],
    });
  }

  for (const b of input.biometrics) {
    const prov = b.provenance_id ? provById.get(b.provenance_id) : undefined;
    const status = prov?.verification_status ?? "unverified";
    if (!STAGED_STATUSES.has(status)) continue;
    const subject = b.athlete_id ? athleteById.get(b.athlete_id) : undefined;
    const hub = hubFor(b.athlete_id);
    stage({
      id: `biometric:${b.record_id}`,
      provenanceId: prov?.provenance_id ?? null,
      recordKind: "biometric",
      subject: `${subject ? nameOf(subject) : b.athlete_id ?? "unknown"} · biometrics ${b.measured_at ?? ""}`.trim(),
      athleteId: b.athlete_id,
      ...hub,
      submittedBy: prov?.entered_by_actor_role ?? "unknown",
      submittedAt: prov?.entered_at ?? b.measured_at,
      dataSource: prov?.data_source ?? "unknown",
      verificationStatus: status,
      confidence: num(prov?.confidence_score),
      flags: (b.athlete_id ? flagsByAthlete.get(b.athlete_id) ?? [] : []).filter(
        (f) => f.code === "BIOMETRIC_OUT_OF_RANGE" || f.severity === "critical",
      ),
    });
  }

  for (const q of input.queue) {
    if (q.processed_at) continue;
    const subject = q.athlete_id ? athleteById.get(q.athlete_id) : undefined;
    const hub = hubFor(q.athlete_id);
    const flags: Flag[] = [];
    if (q.venue_verified === false) flags.push(flag("VENUE_UNVERIFIED", "GPS/venue check did not pass"));
    stage({
      id: `telemetry:${q.id}`,
      provenanceId: null,
      recordKind: "telemetry",
      subject: `${subject ? nameOf(subject) : "bulk upload"} · ${q.status ?? "queued"}`,
      athleteId: q.athlete_id,
      ...hub,
      submittedBy: "edge device",
      submittedAt: q.created_at,
      dataSource: "device_stream",
      verificationStatus: q.error ? "disputed" : "pending",
      confidence: null,
      flags,
    });
  }

  queue.sort((a, b) => (ms(b.submittedAt) ?? 0) - (ms(a.submittedAt) ?? 0));

  return {
    queue,
    counts: {
      total: queue.length,
      blocked: queue.filter((q) => !q.approvable).length,
      approvable: queue.filter((q) => q.approvable).length,
      critical: queue.filter((q) => q.flags.some((f) => f.severity === "critical")).length,
    },
  };
}

// ---------------------------------------------------------------------
// Coach lens — readiness, compliance, velocity, leaderboard, windows.
// ---------------------------------------------------------------------

export function coachView(
  input: CommandInput,
  nowMs: number,
  index: HubIndex,
  flagsByAthlete: Map<string, Flag[]>,
): CommandPayload["coach"] {
  const athleteById = new Map(input.athletes.map((a) => [a.athlete_id, a]));

  // performance_logs.athlete_id is the app-plane id; nothing else in this
  // payload joins it to a passport, so telemetry is grouped by whatever
  // id it carries and named when a passport row matches.
  const logsByAthlete = new Map<string, PerfRow[]>();
  for (const row of input.performance) {
    if (!row.athlete_id) continue;
    const list = logsByAthlete.get(row.athlete_id) ?? [];
    list.push(row);
    logsByAthlete.set(row.athlete_id, list);
  }
  for (const list of logsByAthlete.values()) {
    list.sort((a, b) => (ms(a.created_at) ?? 0) - (ms(b.created_at) ?? 0));
  }

  const windowStart = nowMs - LIMITS.windowDays * 86_400_000;
  const readinessStart = nowMs - LIMITS.readinessWindowDays * 86_400_000;

  const athletes: CoachAthlete[] = [];
  const readinessSamples: number[] = [];
  let readinessBasis = "no telemetry";

  for (const [athleteId, logs] of logsByAthlete) {
    const latest = logs[logs.length - 1];
    if (!latest) continue;
    const composite = num(latest.composite_score);
    const latestAt = ms(latest.created_at);
    const inWindow = logs.filter((l) => (ms(l.created_at) ?? 0) >= readinessStart);
    const scores = (inWindow.length > 0 ? inWindow : [latest])
      .map((l) => num(l.composite_score))
      .filter((v): v is number => v !== null);
    const own = mean(scores);
    if (own !== null) {
      readinessSamples.push(own);
      if (inWindow.length > 0) readinessBasis = `${LIMITS.readinessWindowDays}-day rolling mean`;
      else if (readinessBasis === "no telemetry") readinessBasis = "most recent reading (no data in window)";
    }

    // One reading is a position, not a trend: an athlete with no prior
    // assessment shows no delta rather than a flat zero.
    const before = [...logs].reverse().find((l) => (ms(l.created_at) ?? 0) <= windowStart) ?? logs[0];
    const beforeScore = before === latest ? null : num(before?.composite_score);
    const passport = athleteById.get(athleteId);
    const hub = index.byId.get(index.hubOfAthlete.get(athleteId) ?? "");

    athletes.push({
      athleteId,
      name: passport ? nameOf(passport) : athleteId.slice(0, 8),
      hubId: hub?.hubId ?? null,
      hubName: hub?.name ?? "Unassigned hub",
      region: hub?.region ?? "unassigned",
      position: null,
      composite,
      tier: tierOf(composite),
      delta90d: composite !== null && beforeScore !== null ? Math.round((composite - beforeScore) * 10) / 10 : null,
      lastAssessedAt: latest.created_at,
      staleDays: latestAt === null ? null : days(latestAt, nowMs),
      status: passport?.current_status ?? "unknown",
      flagCount: (flagsByAthlete.get(athleteId) ?? []).length,
    });
  }

  // Passport-only athletes (no telemetry at all) still belong on a roster.
  for (const a of input.athletes) {
    if (logsByAthlete.has(a.athlete_id)) continue;
    const hub = index.byId.get(index.hubOfAthlete.get(a.athlete_id) ?? "");
    athletes.push({
      athleteId: a.athlete_id,
      name: nameOf(a),
      hubId: hub?.hubId ?? null,
      hubName: hub?.name ?? "Unassigned hub",
      region: hub?.region ?? "unassigned",
      position: null,
      composite: null,
      tier: null,
      delta90d: null,
      lastAssessedAt: null,
      staleDays: null,
      status: a.current_status ?? "unknown",
      flagCount: (flagsByAthlete.get(a.athlete_id) ?? []).length,
    });
  }

  athletes.sort((a, b) => (b.composite ?? -1) - (a.composite ?? -1));

  // Session compliance: a drill counts as complete when its telemetry
  // carries all five axes, which is what "full biometric data" means to
  // the engine.
  const logBySession = new Map<string, PerfRow>();
  for (const row of input.performance) if (row.session_id) logBySession.set(row.session_id, row);
  const windowSessions = input.sessions.filter((s) => (ms(s.start_time) ?? 0) >= windowStart);
  const scored = windowSessions.filter((s) => {
    const log = logBySession.get(s.id);
    if (!log) return false;
    return [log.speed, log.agility, log.stamina, log.technical, log.cognitive].every(
      (v) => num(v) !== null,
    );
  });

  // Velocity: tier now vs tier at the window edge.
  const velocity = TIER_IDS.map((tier) => ({
    tier,
    label: TIERS[tier].label,
    count: athletes.filter((a) => a.tier === tier).length,
    movedIn: 0,
    movedOut: 0,
  }));
  const tierIndex = new Map(velocity.map((v, i) => [v.tier, i]));
  for (const [athleteId, logs] of logsByAthlete) {
    const latest = logs[logs.length - 1];
    const before = [...logs].reverse().find((l) => (ms(l.created_at) ?? 0) <= windowStart) ?? logs[0];
    const now = tierOf(num(latest?.composite_score ?? null));
    const then = tierOf(num(before?.composite_score ?? null));
    if (!now || !then || now === then) continue;
    const inTo = tierIndex.get(now);
    const outOf = tierIndex.get(then);
    if (inTo !== undefined) {
      const row = velocity[inTo];
      if (row) row.movedIn += 1;
    }
    if (outOf !== undefined) {
      const row = velocity[outOf];
      if (row) row.movedOut += 1;
    }
    void athleteId;
  }

  // Leaderboard: latest composite, percentile inside the cohort measured.
  const measured = athletes.filter((a) => a.composite !== null);
  const sorted = [...measured].sort((a, b) => (a.composite ?? 0) - (b.composite ?? 0));
  const leaderboard = measured.slice(0, 8).map((a) => {
    const logs = logsByAthlete.get(a.athleteId) ?? [];
    const latest = logs[logs.length - 1];
    let best: BenchmarkAxis | null = null;
    let bestValue: number | null = null;
    for (const axis of BENCHMARK_AXES) {
      const value = num(latest?.[axis] ?? null);
      if (value !== null && (bestValue === null || value > bestValue)) {
        best = axis;
        bestValue = value;
      }
    }
    const rank = sorted.findIndex((s) => s.athleteId === a.athleteId);
    return {
      athleteId: a.athleteId,
      name: a.name,
      composite: a.composite ?? 0,
      best,
      bestValue,
      percentile: measured.length > 1 ? Math.round((rank / (measured.length - 1)) * 100) : 100,
      tier: a.tier,
    };
  });

  // Coaching assessment tracker: who logged, and when last.
  const byCoach = new Map<string, { athletes: Set<string>; roleLabel: string | null; lastLogAt: number | null }>();
  for (const link of input.coachLinks) {
    if (!link.coach_id) continue;
    const bucket = byCoach.get(link.coach_id) ?? {
      athletes: new Set<string>(),
      roleLabel: link.role_label,
      lastLogAt: null,
    };
    if (link.athlete_id) {
      bucket.athletes.add(link.athlete_id);
      for (const log of logsByAthlete.get(link.athlete_id) ?? []) {
        const at = ms(log.created_at);
        if (at !== null && (bucket.lastLogAt === null || at > bucket.lastLogAt)) bucket.lastLogAt = at;
      }
    }
    byCoach.set(link.coach_id, bucket);
  }
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const coachLogs = [...byCoach.entries()].map(([coachId, b]) => ({
    coachId,
    roleLabel: b.roleLabel,
    athletes: b.athletes.size,
    lastLogAt: b.lastLogAt === null ? null : new Date(b.lastLogAt).toISOString(),
    loggedToday: b.lastLogAt !== null && b.lastLogAt >= startOfDay.getTime(),
    staleDays: b.lastLogAt === null ? null : days(b.lastLogAt, nowMs),
  }));

  // Upcoming session windows from the cohort registry (day-of-week slots).
  const enrolledByRegistry = new Map<string, number>();
  for (const c of input.cohorts) {
    if (c.enrollment_status !== "enrolled") continue;
    enrolledByRegistry.set(c.registry_id, (enrolledByRegistry.get(c.registry_id) ?? 0) + 1);
  }
  const seenRegistry = new Set<string>();
  const windows = input.cohorts
    .filter((c) => {
      if (seenRegistry.has(c.registry_id)) return false;
      seenRegistry.add(c.registry_id);
      return true;
    })
    .map((c) => ({
      registryId: c.registry_id,
      cohort: c.cohort_label ?? "Unnamed cohort",
      track: c.track_type ?? null,
      nextAt: nextWindow(c, nowMs),
      capacity: c.capacity,
      enrolled: enrolledByRegistry.get(c.registry_id) ?? 0,
    }))
    .sort((a, b) => (ms(a.nextAt) ?? Infinity) - (ms(b.nextAt) ?? Infinity))
    .slice(0, 6);

  // Standings from the league table when the ETL has populated it.
  const byTeam = new Map<
    string,
    { team: string; division: string | null; players: number; points: number; attendance: number[]; composite: number[]; conduct: number }
  >();
  for (const row of input.league) {
    const team = row.team ?? "Unassigned";
    const bucket = byTeam.get(team) ?? {
      team,
      division: row.division,
      players: 0,
      points: 0,
      attendance: [],
      composite: [],
      conduct: 0,
    };
    bucket.players += 1;
    bucket.points += row.legacy_points ?? 0;
    const att = num(row.attendance_rate_pct);
    if (att !== null) bucket.attendance.push(att);
    const comp = num(row.composite_score);
    if (comp !== null) bucket.composite.push(comp);
    bucket.conduct += row.conduct_cases ?? 0;
    byTeam.set(team, bucket);
  }
  const standings = [...byTeam.values()]
    .map((b) => ({
      team: b.team,
      division: b.division,
      players: b.players,
      points: b.points,
      attendancePct: mean(b.attendance),
      compositeAvg: mean(b.composite),
      conductCases: b.conduct,
    }))
    .sort((a, b) => b.points - a.points || (b.compositeAvg ?? 0) - (a.compositeAvg ?? 0));

  const index100 = mean(readinessSamples);

  return {
    athletes,
    readiness: {
      index: index100 === null ? null : Math.round(index100),
      sampleSize: readinessSamples.length,
      windowDays: LIMITS.readinessWindowDays,
      basis: readinessBasis,
    },
    compliance: {
      sessions: windowSessions.length,
      complete: scored.length,
      pct: pct(scored.length, windowSessions.length),
      windowDays: LIMITS.windowDays,
    },
    velocity,
    leaderboard,
    coachLogs,
    windows,
    standings,
  };
}

/** Next occurrence of a weekly cohort slot, bounded by the season. */
export function nextWindow(c: CohortRow, nowMs: number): string | null {
  const dow = c.session_day_of_week;
  if (dow === null || dow === undefined) return null;
  const seasonEnd = ms(c.season_end_date);
  const [h = 0, m = 0] = (c.window_start_time ?? "00:00").split(":").map((v) => Number(v) || 0);
  const start = new Date(nowMs);
  const delta = (dow - start.getUTCDay() + 7) % 7;
  const next = new Date(Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate() + delta,
    h,
    m,
  ));
  if (next.getTime() < nowMs) next.setUTCDate(next.getUTCDate() + 7);
  if (seasonEnd !== null && next.getTime() > seasonEnd + 86_400_000) return null;
  return next.toISOString();
}

// ---------------------------------------------------------------------
// Founder lens — money, scouts, tenancy, edge buffer, ledger.
// ---------------------------------------------------------------------

const EXPORT_EVENT = /EXPORT|DOSSIER|SCOUT|SHARE/i;
const VERIFY_EVENT = /VERIF|APPROV|CONFIRM/i;
const TRANSFER_EVENT = /TRANSFER|CUSTODY|TRIAL/i;

export function ledgerFrom(rows: AuditRow[]): LedgerEntry[] {
  return rows.map((r) => {
    const type = r.event_type ?? "UNKNOWN";
    const kind: LedgerEntry["kind"] = EXPORT_EVENT.test(type)
      ? "export"
      : VERIFY_EVENT.test(type)
        ? "verification"
        : TRANSFER_EVENT.test(type)
          ? "transfer"
          : "other";
    return {
      eventId: r.event_id,
      kind,
      eventType: type,
      recordType: r.record_type,
      recordId: r.record_id,
      actorId: r.actor_id,
      occurredAt: r.occurred_at,
      hashPrefix: r.event_hash ? r.event_hash.trim().slice(0, 12) : null,
    };
  });
}

export function revenueFrom(
  registrations: RegistrationRow[],
  payments: PaymentRow[],
  nowMs: number,
): CommandPayload["revenue"] {
  const byVenture = new Map<string, { venture: string; settledKes: number; paid: number }>();
  let settledKes = 0;
  let last30 = 0;
  let trailing12 = 0;
  for (const r of registrations) {
    if (r.payment_status !== "PAYMENT_SETTLED") continue;
    const amount = num(r.amount_expected_kes) ?? 0;
    const venture = r.venture_context ?? "UNASSIGNED";
    const bucket = byVenture.get(venture) ?? { venture, settledKes: 0, paid: 0 };
    bucket.settledKes += amount;
    bucket.paid += 1;
    byVenture.set(venture, bucket);
    settledKes += amount;
    const at = ms(r.settled_at);
    if (at !== null) {
      if (days(at, nowMs) <= 30) last30 += amount;
      if (days(at, nowMs) <= 365) trailing12 += amount;
    }
  }
  const railKes = payments
    .filter((p) => (num(p.result_code) ?? 0) === 0)
    .reduce((sum, p) => sum + (num(p.amount_kes) ?? 0), 0);

  return {
    settledKes,
    railKes,
    last30Kes: last30,
    trailing12Kes: trailing12,
    // Run-rate, not a forecast: last 30 settled days annualised.
    arrRunRateKes: last30 * 12,
    paidRegistrations: [...byVenture.values()].reduce((s, v) => s + v.paid, 0),
    byVenture: [...byVenture.values()].sort((a, b) => b.settledKes - a.settledKes),
  };
}

export function scoutFrom(
  scoutLogs: ScoutLogRow[],
  ledger: LedgerEntry[],
  index: HubIndex,
  athletes: AthleteRow[],
  nowMs: number,
): CommandPayload["scout"] {
  const nameById = new Map(athletes.map((a) => [a.athlete_id, nameOf(a)]));
  const within = (at: string | null) => {
    const t = ms(at);
    return t !== null && days(t, nowMs) <= LIMITS.windowDays;
  };

  const exports = ledger.filter((e) => e.kind === "export" && within(e.occurredAt));
  const views = scoutLogs.filter((s) => within(s.logged_at));
  const actors = new Set<string>();
  for (const e of exports) if (e.actorId) actors.add(e.actorId);
  for (const v of views) if (v.context) actors.add(v.context);

  const ticker = [
    ...exports.map((e) => ({
      when: e.occurredAt,
      actor: e.actorId ? e.actorId.slice(0, 8) : "unattributed",
      action: e.eventType,
      subject: (e.recordId && nameById.get(e.recordId)) ?? e.recordType ?? "record",
      hubName:
        (e.recordId && index.byId.get(index.hubOfAthlete.get(e.recordId) ?? "")?.name) ?? "—",
    })),
    ...views.map((v) => ({
      when: v.logged_at,
      actor: v.context ?? "scout",
      action: v.metric_code ?? "DOSSIER_VIEW",
      subject: (v.athlete_id && nameById.get(v.athlete_id)) ?? "athlete",
      hubName:
        (v.athlete_id && index.byId.get(index.hubOfAthlete.get(v.athlete_id) ?? "")?.name) ?? "—",
    })),
  ]
    .sort((a, b) => (ms(b.when) ?? 0) - (ms(a.when) ?? 0))
    .slice(0, 25);

  return {
    // Bounded 0–100 so the KPI card reads as a score, not a raw count.
    engagementScore: Math.min(100, exports.length * 10 + views.length * 2 + actors.size * 15),
    formula: "min(100, exports×10 + dossier views×2 + distinct scouts×15) over 90 days",
    exportsWindow: exports.length,
    viewsWindow: views.length,
    activeScouts: actors.size,
    ticker,
  };
}

export function tenancyFrom(input: CommandInput, index: HubIndex): TenantHealth[] {
  const consent = new Map<string, boolean>();
  for (const g of input.guardians) {
    if (!g.athlete_id) continue;
    consent.set(g.athlete_id, (consent.get(g.athlete_id) ?? false) || Boolean(g.consent_on_file));
  }
  const verifiedProv = new Set(
    input.provenance.filter((p) => p.verification_status === "verified").map((p) => p.provenance_id),
  );
  const athleteById = new Map(input.athletes.map((a) => [a.athlete_id, a]));

  return input.tenants.map((t) => {
    const athleteIds = input.links.filter((l) => l.tenant_id === t.id && l.athlete_id).map((l) => l.athlete_id as string);
    const passportIds = athleteIds.filter((id) => athleteById.has(id));
    const verified = passportIds.filter((id) => {
      const prov = athleteById.get(id)?.provenance_id;
      return prov ? verifiedProv.has(prov) : false;
    }).length;
    const withConsent = passportIds.filter((id) => consent.get(id)).length;
    const telemetry = input.performance.filter((p) => p.tenant_id === t.id).length;
    const venues = input.venues.filter((v) => v.tenant_id === t.id).length;
    const syncFailures = input.queue.filter((q) => q.tenant_id === t.id && q.error).length;

    const flags: string[] = [];
    if (venues === 0) flags.push("no venue registered");
    if (athleteIds.length === 0) flags.push("no athletes linked");
    if (passportIds.length > 0 && withConsent < passportIds.length) {
      flags.push(`${passportIds.length - withConsent} without guardian consent`);
    }
    if (syncFailures > 0) flags.push(`${syncFailures} sync failures`);
    if (telemetry === 0 && athleteIds.length > 0) flags.push("no telemetry ingested");

    const status: TenantHealth["status"] =
      syncFailures > 0 || (passportIds.length > 0 && withConsent === 0)
        ? "blocked"
        : flags.length > 0
          ? "attention"
          : "healthy";

    return {
      tenantId: t.id,
      name: t.name ?? "Unnamed tenant",
      workspace: WORKSPACE_BY_TENANT[t.id] ?? null,
      athletes: athleteIds.length,
      venues,
      telemetry,
      consentCoverage: pct(withConsent, Math.max(passportIds.length, 1)),
      verifiedRatio: pct(verified, Math.max(passportIds.length, 1)),
      syncFailures,
      status,
      flags,
      createdAt: t.created_at,
    };
  });
}

export function edgeFrom(input: CommandInput): CommandPayload["edge"] {
  const buffered = input.queue.filter((q) => !q.processed_at);
  const failed = buffered.filter((q) => q.error || (q.attempts ?? 0) > 1);
  const oldest = buffered
    .map((q) => q.created_at)
    .filter((v): v is string => Boolean(v))
    .sort()[0] ?? null;
  const lastIngest = input.performance
    .map((p) => p.created_at)
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1) ?? null;

  return {
    online: null, // the browser owns this; the server cannot know.
    bufferedRecords: buffered.length,
    failedRecords: failed.length,
    deadLetters: input.deadLetters.length,
    oldestBufferedAt: oldest,
    lastIngestAt: lastIngest,
    unverifiedVenueLogs: input.performance.filter((p) => p.venue_verified === false).length,
    deadLetterRows: input.deadLetters,
  };
}

export function benchmarkFrom(input: CommandInput): CommandPayload["benchmark"] {
  const latestByAthlete = new Map<string, PerfRow>();
  for (const row of input.performance) {
    if (!row.athlete_id) continue;
    const current = latestByAthlete.get(row.athlete_id);
    if (!current || (ms(row.created_at) ?? 0) > (ms(current.created_at) ?? 0)) {
      latestByAthlete.set(row.athlete_id, row);
    }
  }
  const nameById = new Map(input.athletes.map((a) => [a.athlete_id, nameOf(a)]));

  const axes = BENCHMARK_AXES.map((axis) => ({
    axis,
    cohort: mean(
      [...latestByAthlete.values()]
        .map((r) => num(r[axis]))
        .filter((v): v is number => v !== null),
    ),
    ...BENCHMARKS[axis],
  })).map((row) => ({ ...row, cohort: row.cohort === null ? null : Math.round(row.cohort * 10) / 10 }));

  const athletes = [...latestByAthlete.entries()].map(([athleteId, row]) => ({
    athleteId,
    name: nameById.get(athleteId) ?? athleteId.slice(0, 8),
    values: Object.fromEntries(BENCHMARK_AXES.map((axis) => [axis, num(row[axis])])) as Record<
      BenchmarkAxis,
      number | null
    >,
  }));

  return { source: BENCHMARK_SOURCE, axes, athletes };
}

// ---------------------------------------------------------------------
// Composition.
// ---------------------------------------------------------------------

export function buildCommand(input: CommandInput, now: Date): CommandPayload {
  const nowMs = now.getTime();
  const { byAthlete, cases, index } = integrityFlags(input, nowMs);
  const audit = shadowAuditQueue(input, nowMs, index, byAthlete);
  const ledger = ledgerFrom(input.audit);

  const provById = new Map(input.provenance.map((p) => [p.provenance_id, p]));
  const counts = { verified: 0, pending: 0, unverified: 0, disputed: 0, revoked: 0 };
  for (const a of input.athletes) {
    const status = (a.provenance_id ? provById.get(a.provenance_id)?.verification_status : null) ?? "unverified";
    if (status === "verified") counts.verified += 1;
    else if (status === "pending") counts.pending += 1;
    else if (status === "disputed") counts.disputed += 1;
    else if (status === "revoked") counts.revoked += 1;
    else counts.unverified += 1;
  }

  return {
    generatedAt: now.toISOString(),
    hubs: index.hubs.sort((a, b) => b.athletes - a.athletes || a.name.localeCompare(b.name)),
    tenancy: tenancyFrom(input, index),
    passports: {
      total: input.athletes.length,
      ...counts,
      ratioPct: pct(counts.verified, input.athletes.length),
      estimatedDob: input.athletes.filter((a) => a.is_dob_estimated).length,
      legacy: input.athletes.filter((a) => a.is_legacy).length,
    },
    revenue: revenueFrom(input.registrations, input.payments, nowMs),
    scout: scoutFrom(input.scoutLogs, ledger, index, input.athletes, nowMs),
    audit,
    integrity: {
      cases,
      counts: {
        critical: cases.filter((c) => c.severity === "critical").length,
        warn: cases.filter((c) => c.severity === "warn").length,
        info: cases.filter((c) => c.severity === "info").length,
      },
    },
    edge: edgeFrom(input),
    ledger,
    coach: coachView(input, nowMs, index, byAthlete),
    benchmark: benchmarkFrom(input),
  };
}

/** Empty payload for the degraded case (config debt, zero grants). */
export function emptyCommand(now: Date): CommandPayload {
  return buildCommand(
    {
      athletes: [],
      provenance: [],
      clubs: [],
      federations: [],
      tenants: [],
      venues: [],
      custody: [],
      links: [],
      sessions: [],
      performance: [],
      biometrics: [],
      guardians: [],
      queue: [],
      deadLetters: [],
      audit: [],
      registrations: [],
      payments: [],
      scoutLogs: [],
      coachLinks: [],
      cohorts: [],
      league: [],
    },
    now,
  );
}
