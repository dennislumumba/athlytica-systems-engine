// =====================================================================
// ATHLYTICA ANALYTICS ENGINE — Universal Metric Taxonomy v1.0.0
// Canonical scoring core. Pure TypeScript, zero runtime dependencies,
// executable in both Deno (Supabase Edge Functions) and Node (Next.js).
//
// Contract: every ingestion stream resolves to five vectors, each a
// float hard-clamped to [1, 100], plus a composite score and a
// per-vector confidence in [0, 1] indicating how much direct evidence
// the stream supplied for that vector. Vectors with zero evidence
// return the neutral prior (50) with confidence 0 — downstream
// consumers MUST weight by confidence, never treat 50 as measured.
// =====================================================================

export const ENGINE_VERSION = "1.0.0";

export type StreamType =
  | "JSON_COORDINATES"
  | "CSV_SENSOR"
  | "IMU_PACKET"
  | "COACH_INTEL";

/** Coordinate sample in venue-local meters; t in seconds (monotonic). */
export interface CoordinatePoint {
  x: number;
  y: number;
  t: number;
}

/** IMU sample: accelerations in m/s^2; t in seconds. */
export interface ImuSample {
  t: number;
  ax: number;
  ay: number;
  az: number;
}

export interface TaxonomyVectors {
  speed: number;
  agility: number;
  stamina: number;
  technical: number;
  cognitive: number;
}

export interface EngineResult {
  vectors: TaxonomyVectors;
  confidence: TaxonomyVectors; // per-vector evidence weight, 0..1
  composite: number; // confidence-weighted mean, 1..100
  engineVersion: string;
}

// ---------------------------------------------------------------------
// Sport reference bands. Normalization anchors: `floor` maps to score 1,
// `elite` maps to score 100, linear in between. Anchors are calibrated
// for skating-family sports (ice/inline hockey); override per sport via
// calculateTaxonomyVectors(..., { bands }).
// ---------------------------------------------------------------------
export interface ReferenceBands {
  vmaxKmh: { floor: number; elite: number }; // top sustained speed
  accelMs2: { floor: number; elite: number }; // peak linear acceleration
  decelMs2: { floor: number; elite: number }; // peak controlled deceleration
  codPerMin: { floor: number; elite: number }; // change-of-direction rate
  gForcePeak: { floor: number; elite: number }; // explosive burst, resultant g
  trimpPerMin: { floor: number; elite: number }; // Banister TRIMP density
}

export const DEFAULT_BANDS: ReferenceBands = {
  vmaxKmh: { floor: 12, elite: 38 },
  accelMs2: { floor: 1.5, elite: 7.5 },
  decelMs2: { floor: 1.5, elite: 8.0 },
  codPerMin: { floor: 2, elite: 14 },
  gForcePeak: { floor: 1.2, elite: 4.5 },
  trimpPerMin: { floor: 0.4, elite: 2.8 },
};

// ---------------------------------------------------------------------
// Math primitives
// ---------------------------------------------------------------------

/** Hard clamp to the 1..100 contract. */
export function clampScore(x: number): number {
  if (!Number.isFinite(x)) return 1;
  return Math.min(100, Math.max(1, x));
}

/**
 * Linear band normalization.
 *   score = 1 + 99 * (x - floor) / (elite - floor), clamped to [1,100].
 * Values at/below `floor` score 1; at/above `elite` score 100.
 */
export function bandScore(x: number, band: { floor: number; elite: number }): number {
  if (band.elite === band.floor) return 50;
  return clampScore(1 + (99 * (x - band.floor)) / (band.elite - band.floor));
}

/** p-th percentile (0..1) of a numeric array, linear interpolation. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const vLo = sorted[lo]!;
  const vHi = sorted[hi]!;
  return vLo + (vHi - vLo) * (idx - lo);
}

/** Weighted mean over (value, weight) pairs with total-weight guard. */
function weightedMean(pairs: Array<[number, number]>): number {
  const totalW = pairs.reduce((s, [, w]) => s + w, 0);
  if (totalW <= 0) return 50;
  return pairs.reduce((s, [v, w]) => s + v * w, 0) / totalW;
}

// ---------------------------------------------------------------------
// Kinematics from coordinate timelines
// ---------------------------------------------------------------------

interface KinematicsProfile {
  velocities: number[]; // m/s per segment
  accelerations: number[]; // m/s^2 per segment pair (signed)
  headings: number[]; // radians per segment
  durationSec: number;
}

export function deriveKinematics(points: CoordinatePoint[]): KinematicsProfile | null {
  if (points.length < 3) return null;
  const velocities: number[] = [];
  const headings: number[] = [];
  const times: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const cur = points[i]!;
    const prev = points[i - 1]!;
    const dt = cur.t - prev.t;
    if (dt <= 0) continue; // reject non-monotonic samples
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    velocities.push(Math.hypot(dx, dy) / dt);
    headings.push(Math.atan2(dy, dx));
    times.push(cur.t);
  }
  if (velocities.length < 2) return null;
  const accelerations: number[] = [];
  for (let i = 1; i < velocities.length; i++) {
    const dt = times[i]! - times[i - 1]!;
    if (dt > 0) accelerations.push((velocities[i]! - velocities[i - 1]!) / dt);
  }
  return {
    velocities,
    accelerations,
    headings,
    durationSec: points[points.length - 1]!.t - points[0]!.t,
  };
}

// ---------------------------------------------------------------------
// VECTOR 1 — SPEED
// Evidence: coordinate timelines (velocity curves), IMU (accel bursts).
// speed = 0.6 * band(vmax_p95) + 0.4 * band(accel_p95)
//   vmax_p95: 95th-percentile velocity (robust vs. GPS/tracking spikes,
//   approximates sustainable top speed) converted to km/h.
//   accel_p95: 95th-percentile positive acceleration — sprint mechanics.
// ---------------------------------------------------------------------
function speedFromKinematics(k: KinematicsProfile, bands: ReferenceBands): number {
  const vmaxKmh = percentile(k.velocities, 0.95) * 3.6;
  const accelP95 = percentile(k.accelerations.filter((a) => a > 0), 0.95);
  return clampScore(0.6 * bandScore(vmaxKmh, bands.vmaxKmh) + 0.4 * bandScore(accelP95, bands.accelMs2));
}

// ---------------------------------------------------------------------
// VECTOR 2 — AGILITY
// Evidence: coordinate timelines (COD + deceleration), IMU (g-force).
// From coordinates:
//   codRate: heading changes > 45° per minute (change-of-direction density)
//   decel_p95: 95th-percentile |negative acceleration| — braking efficiency
//   retention: mean(exit_v / entry_v) across COD events — speed preserved
//              through the turn (1.0 = lossless), mapped 0.4..0.95 -> 1..100
// agility = 0.40*band(codRate) + 0.35*band(decel_p95) + 0.25*retention
// From IMU: band(resultant-g p95) — explosive burst / ground reaction proxy.
// ---------------------------------------------------------------------
function agilityFromKinematics(k: KinematicsProfile, bands: ReferenceBands): number {
  const COD_THRESHOLD = Math.PI / 4; // 45°
  let codCount = 0;
  const retentions: number[] = [];
  for (let i = 1; i < k.headings.length; i++) {
    let dh = Math.abs(k.headings[i]! - k.headings[i - 1]!);
    if (dh > Math.PI) dh = 2 * Math.PI - dh;
    const vPrev = k.velocities[i - 1]!;
    if (dh > COD_THRESHOLD && vPrev > 0.5) {
      codCount++;
      retentions.push(Math.min(k.velocities[i]! / vPrev, 1));
    }
  }
  const codRate = k.durationSec > 0 ? (codCount / k.durationSec) * 60 : 0;
  const decelP95 = percentile(k.accelerations.filter((a) => a < 0).map(Math.abs), 0.95);
  const meanRetention = retentions.length
    ? retentions.reduce((s, r) => s + r, 0) / retentions.length
    : 0.6;
  const retentionScore = clampScore(1 + (99 * (meanRetention - 0.4)) / (0.95 - 0.4));
  return clampScore(
    0.4 * bandScore(codRate, bands.codPerMin) +
      0.35 * bandScore(decelP95, bands.decelMs2) +
      0.25 * retentionScore,
  );
}

function agilityFromImu(samples: ImuSample[], bands: ReferenceBands): number | null {
  if (samples.length < 10) return null;
  const G = 9.80665;
  const resultantG = samples.map((s) => Math.hypot(s.ax, s.ay, s.az) / G);
  return bandScore(percentile(resultantG, 0.95), bands.gForcePeak);
}

// ---------------------------------------------------------------------
// VECTOR 3 — STAMINA
// Evidence: heart-rate series (CSV sensor / IMU packets with hr channel).
// Banister TRIMP (male coefficient):
//   hrr_i  = (hr_i - hrRest) / (hrMax - hrRest)          [heart-rate reserve]
//   TRIMP  = Σ dt_min * hrr_i * 0.64 * e^(1.92 * hrr_i)
// Normalized as TRIMP density (TRIMP / duration_min) against band, then
// adjusted by work:rest profile:
//   workFraction = share of samples with hrr > 0.70
//   stamina = 0.75 * band(trimpPerMin) + 0.25 * (workFraction mapped 0.2..0.8)
// ---------------------------------------------------------------------
function staminaFromHeartRate(
  hr: number[],
  tSec: number[],
  bands: ReferenceBands,
  hrRest = 60,
  hrMax = 195,
): number | null {
  if (hr.length < 5 || hr.length !== tSec.length) return null;
  let trimp = 0;
  let workSamples = 0;
  let valid = 0;
  for (let i = 1; i < hr.length; i++) {
    const hrI = hr[i]!;
    const dtMin = (tSec[i]! - tSec[i - 1]!) / 60;
    if (dtMin <= 0 || hrI < 30 || hrI > 230) continue; // physiologic gate
    const hrr = Math.min(Math.max((hrI - hrRest) / (hrMax - hrRest), 0), 1);
    trimp += dtMin * hrr * 0.64 * Math.exp(1.92 * hrr);
    if (hrr > 0.7) workSamples++;
    valid++;
  }
  if (valid < 4) return null;
  const durationMin = (tSec[tSec.length - 1]! - tSec[0]!) / 60;
  if (durationMin <= 0) return null;
  const workFraction = workSamples / valid;
  const workScore = clampScore(1 + (99 * (workFraction - 0.2)) / (0.8 - 0.2));
  return clampScore(0.75 * bandScore(trimp / durationMin, bands.trimpPerMin) + 0.25 * workScore);
}

// ---------------------------------------------------------------------
// VECTOR 4 — TECHNICAL SKILL
// Evidence: coach intelligence (structured subjective assessment).
// technical = weighted mean of provided 0..100 sub-scores:
//   executionAccuracyPct (w=0.6), toolHandlingProficiency (w=0.4),
//   plus any sportSpecific{} extension scores at w=0.3 each.
// Subjective inputs are already 0..100 by contract; re-clamped defensively.
// ---------------------------------------------------------------------
function technicalFromCoachIntel(p: CoachIntelPayload): number | null {
  const pairs: Array<[number, number]> = [];
  if (typeof p.executionAccuracyPct === "number") pairs.push([clampScore(p.executionAccuracyPct), 0.6]);
  if (typeof p.toolHandlingProficiency === "number") pairs.push([clampScore(p.toolHandlingProficiency), 0.4]);
  for (const v of Object.values(p.sportSpecificTechnical ?? {})) {
    if (typeof v === "number") pairs.push([clampScore(v), 0.3]);
  }
  return pairs.length ? clampScore(weightedMean(pairs)) : null;
}

// ---------------------------------------------------------------------
// VECTOR 5 — COGNITIVE TACTICAL INTELLIGENCE
// Evidence A — coach intel: gameIqScore (w=0.6), positionalAwarenessScore (w=0.4).
// Evidence B — coordinates: spatial coverage entropy.
//   Venue bounding box is partitioned into a 12x12 occupancy grid; Shannon
//   entropy H of the occupancy distribution is normalized by H_max = ln(144).
//   Tactical positioning is neither camping (H→0) nor random wandering (H→1):
//   score peaks at H_norm = 0.65 and decays linearly to 1 at both extremes.
// ---------------------------------------------------------------------
function cognitiveFromCoachIntel(p: CoachIntelPayload): number | null {
  const pairs: Array<[number, number]> = [];
  if (typeof p.gameIqScore === "number") pairs.push([clampScore(p.gameIqScore), 0.6]);
  if (typeof p.positionalAwarenessScore === "number") pairs.push([clampScore(p.positionalAwarenessScore), 0.4]);
  return pairs.length ? clampScore(weightedMean(pairs)) : null;
}

function cognitiveFromCoverage(points: CoordinatePoint[]): number | null {
  if (points.length < 30) return null;
  const GRID = 12;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  if (maxX - minX < 1 || maxY - minY < 1) return null; // stationary athlete
  const cells = new Map<number, number>();
  for (const p of points) {
    const cx = Math.min(GRID - 1, Math.floor(((p.x - minX) / (maxX - minX)) * GRID));
    const cy = Math.min(GRID - 1, Math.floor(((p.y - minY) / (maxY - minY)) * GRID));
    const key = cy * GRID + cx;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  let H = 0;
  for (const count of cells.values()) {
    const p = count / points.length;
    H -= p * Math.log(p);
  }
  const hNorm = H / Math.log(GRID * GRID);
  const OPTIMUM = 0.65;
  const distance = Math.abs(hNorm - OPTIMUM) / Math.max(OPTIMUM, 1 - OPTIMUM);
  return clampScore(100 - 99 * distance);
}

// ---------------------------------------------------------------------
// Stream payload contracts (validated upstream by Zod at the API edge;
// re-checked structurally here so the engine is safe standalone)
// ---------------------------------------------------------------------

export interface CoordinatesPayload {
  points: CoordinatePoint[];
}

export interface CsvSensorPayload {
  /** Parsed column arrays; tSec required, others optional. */
  columns: { tSec: number[]; hr?: number[]; speedMs?: number[] };
  hrRest?: number;
  hrMax?: number;
}

export interface ImuPayload {
  samples: ImuSample[];
  hr?: number[]; // optional aligned hr channel
  tSecHr?: number[];
  hrRest?: number;
  hrMax?: number;
}

export interface CoachIntelPayload {
  executionAccuracyPct?: number;
  toolHandlingProficiency?: number;
  gameIqScore?: number;
  positionalAwarenessScore?: number;
  sportSpecificTechnical?: Record<string, number>;
}

export type StreamPayload =
  | CoordinatesPayload
  | CsvSensorPayload
  | ImuPayload
  | CoachIntelPayload;

// ---------------------------------------------------------------------
// MAIN ENTRY — calculateTaxonomyVectors
// ---------------------------------------------------------------------
const NEUTRAL = 50;

export function calculateTaxonomyVectors(
  streamType: StreamType,
  payload: StreamPayload,
  opts?: { bands?: Partial<ReferenceBands> },
): EngineResult {
  const bands: ReferenceBands = { ...DEFAULT_BANDS, ...(opts?.bands ?? {}) };

  const v: TaxonomyVectors = {
    speed: NEUTRAL,
    agility: NEUTRAL,
    stamina: NEUTRAL,
    technical: NEUTRAL,
    cognitive: NEUTRAL,
  };
  const c: TaxonomyVectors = { speed: 0, agility: 0, stamina: 0, technical: 0, cognitive: 0 };

  switch (streamType) {
    case "JSON_COORDINATES": {
      const p = payload as CoordinatesPayload;
      const k = Array.isArray(p.points) ? deriveKinematics(p.points) : null;
      if (k) {
        v.speed = speedFromKinematics(k, bands);
        c.speed = 0.9;
        v.agility = agilityFromKinematics(k, bands);
        c.agility = 0.8;
        const cog = cognitiveFromCoverage(p.points);
        if (cog !== null) {
          v.cognitive = cog;
          c.cognitive = 0.5; // positional evidence only — weaker than coach intel
        }
      }
      break;
    }
    case "CSV_SENSOR": {
      const p = payload as CsvSensorPayload;
      if (p.columns?.hr && p.columns.tSec) {
        const st = staminaFromHeartRate(p.columns.hr, p.columns.tSec, bands, p.hrRest, p.hrMax);
        if (st !== null) {
          v.stamina = st;
          c.stamina = 0.9;
        }
      }
      if (p.columns?.speedMs && p.columns.speedMs.length >= 3) {
        const vmaxKmh = percentile(p.columns.speedMs, 0.95) * 3.6;
        v.speed = bandScore(vmaxKmh, bands.vmaxKmh);
        c.speed = 0.6; // velocity only, no acceleration component
      }
      break;
    }
    case "IMU_PACKET": {
      const p = payload as ImuPayload;
      const ag = Array.isArray(p.samples) ? agilityFromImu(p.samples, bands) : null;
      if (ag !== null) {
        v.agility = ag;
        c.agility = 0.7;
      }
      if (p.hr && p.tSecHr) {
        const st = staminaFromHeartRate(p.hr, p.tSecHr, bands, p.hrRest, p.hrMax);
        if (st !== null) {
          v.stamina = st;
          c.stamina = 0.8;
        }
      }
      break;
    }
    case "COACH_INTEL": {
      const p = payload as CoachIntelPayload;
      const te = technicalFromCoachIntel(p);
      if (te !== null) {
        v.technical = te;
        c.technical = 0.85;
      }
      const cog = cognitiveFromCoachIntel(p);
      if (cog !== null) {
        v.cognitive = cog;
        c.cognitive = 0.85;
      }
      break;
    }
  }

  // Composite: confidence-weighted mean over evidenced vectors.
  // A stream that only measures speed does not dilute the composite with
  // four neutral priors.
  const pairs: Array<[number, number]> = [
    [v.speed, c.speed],
    [v.agility, c.agility],
    [v.stamina, c.stamina],
    [v.technical, c.technical],
    [v.cognitive, c.cognitive],
  ];
  const composite = clampScore(weightedMean(pairs));

  return { vectors: v, confidence: c, composite, engineVersion: ENGINE_VERSION };
}

// ---------------------------------------------------------------------
// GEOSPATIAL GATE — ray-casting point-in-polygon
// Venue contract: venues.coordinates = { vertices: [{x,y}, ...] } in the
// same venue-local meter space as coordinate telemetry.
// Returns the fraction of points inside the polygon; the API layer
// enforces the acceptance threshold (>= 0.95).
// ---------------------------------------------------------------------
export interface VenuePolygon {
  vertices: Array<{ x: number; y: number }>;
}

export function pointInPolygon(px: number, py: number, poly: VenuePolygon): boolean {
  const v = poly.vertices;
  let inside = false;
  for (let i = 0, j = v.length - 1; i < v.length; j = i++) {
    const vi = v[i]!;
    const vj = v[j]!;
    const intersects =
      vi.y > py !== vj.y > py &&
      px < ((vj.x - vi.x) * (py - vi.y)) / (vj.y - vi.y) + vi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function insideRatio(points: CoordinatePoint[], poly: VenuePolygon): number {
  if (!poly?.vertices || poly.vertices.length < 3 || points.length === 0) return 0;
  let inside = 0;
  for (const p of points) if (pointInPolygon(p.x, p.y, poly)) inside++;
  return inside / points.length;
}
