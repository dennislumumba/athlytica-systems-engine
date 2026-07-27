# 03 — TAXONOMY ENGINE: The 5-Pillar Computational Guardrails

**Status:** BINDING. These are the mathematical laws of the Universal Metric Taxonomy. A downstream model may extend this engine; it may never silently alter it.
**Canonical implementation:** `supabase/functions/_shared/analyticsEngine.ts` (isomorphic — executed identically by the Deno Edge Function and the Node/Next.js app). `utils/analyticsEngine.ts` is a re-export shim ONLY. **Forking logic into the shim is a critical failure.**
**Current version:** `ENGINE_VERSION = "1.0.0"`.

---

## 1. The Output Contract (immutable)

Every raw stream — JSON coordinate telemetry, CSV sensor exports, IMU accelerometer arrays, coach-intel scoresheets — resolves to exactly five vectors on a **1–100 float scale**, plus a composite and a per-vector confidence:

| Pillar | Column (`performance_logs`) | Primary evidence sources |
|---|---|---|
| Speed | `speed` | JSON_COORDINATES kinematics, CSV_SENSOR `speedMs` |
| Agility | `agility` | JSON_COORDINATES change-of-direction, IMU_PACKET bursts |
| Stamina | `stamina` | CSV_SENSOR heart-rate/TRIMP, IMU_PACKET HR channel |
| Technical Skill | `technical` | COACH_INTEL execution/tool-handling scores |
| Cognitive Tactical Intelligence | `cognitive` | COACH_INTEL game-IQ/positional scores; coordinate coverage (weak) |

Enforcement is **triple-layered** and all three layers must survive any edit:

1. `clampScore()` in the engine (application layer),
2. `CHECK (1..100)` bounds in `supabase/migrations/20260711120000_hercules_core_merge.sql` (database layer),
3. Zod `min/max` bounds on subjective inputs at the API boundary (contract layer).

`performance_logs` is **append-only** (UPDATE/DELETE blocked by DB trigger). Scores are never revised in place — a recalculation is a new row with a new `engine_version`.

---

## 2. Core Primitives (formulas locked)

### 2.1 Hard clamp

```ts
/** Hard clamp to the 1..100 contract. */
export function clampScore(x: number): number; // returns min(100, max(1, x)); NaN-safe per implementation
```

Every function that emits a pillar score terminates in `clampScore`. No raw value ever reaches persistence.

### 2.2 Band normalization (the universal scaling law)

```ts
// score = 1 + 99 * (x - floor) / (elite - floor), clamped to [1,100]
// x <= floor → 1;  x >= elite → 100;  degenerate band (elite == floor) → 50
export function bandScore(x: number, band: { floor: number; elite: number }): number;
```

This linear anchor mapping is THE normalization mechanism. New metrics do not invent alternative curves (log, sigmoid, z-score) without an engine version bump and founder sign-off.

### 2.3 Reference bands (default anchors, sport-overridable)

```ts
export const DEFAULT_BANDS: ReferenceBands = {
  vmaxKmh:    { floor: 12,  elite: 38  }, // top sustained speed
  accelMs2:   { floor: 1.5, elite: 7.5 }, // peak linear acceleration
  decelMs2:   { floor: 1.5, elite: 8.0 }, // peak controlled deceleration
  codPerMin:  { floor: 2,   elite: 14  }, // change-of-direction rate
  gForcePeak: { floor: 1.2, elite: 4.5 }, // explosive burst, resultant g
  trimpPerMin:{ floor: 0.4, elite: 2.8 }, // Banister TRIMP density
};
```

**Law:** `DEFAULT_BANDS` is never mutated. Sport-specific calibration enters exclusively through the options parameter: `calculateTaxonomyVectors(streamType, payload, { bands: { vmaxKmh: { floor: 15, elite: 45 } } })`. Partial overrides merge over defaults.

---

## 3. Per-Pillar Processing Logic (locked vectors)

### 3.1 Speed
- From kinematics (JSON_COORDINATES): `clampScore(0.6 * bandScore(vmaxKmh, bands.vmaxKmh) + 0.4 * bandScore(accelP95, bands.accelMs2))` — 60% sustained velocity, 40% p95 acceleration.
- From CSV `speedMs`: `bandScore(percentile(speedMs, 0.95) * 3.6, bands.vmaxKmh)` — p95 (not max) to reject GPS/sensor spikes; ×3.6 converts m/s → km/h. Velocity-only evidence carries reduced confidence (0.6 vs 0.9).

### 3.2 Agility
- Change-of-direction detection: heading delta > `COD_THRESHOLD = π/4` (45°) **while** prior velocity > 0.5 m/s (stationary jitter is not agility).
- Velocity-retention through direction changes normalized over anchor window [0.40, 0.95]: `retentionScore = clampScore(1 + 99 * (meanRetention - 0.4) / (0.95 - 0.4))`.
- IMU path (`agilityFromImu`) scores burst density from resultant-g peaks against `gForcePeak` band.

### 3.3 Stamina
- Banister TRIMP density from heart-rate stream (uses `hrRest`/`hrMax` when supplied; contract bounds: rest 30–120, max 120–230).
- Work-fraction anchor window [0.20, 0.80]: `workScore = clampScore(1 + 99 * (workFraction - 0.2) / (0.8 - 0.2))`.
- Final: `clampScore(0.75 * bandScore(trimp/durationMin, bands.trimpPerMin) + 0.25 * workScore)`.

### 3.4 Technical Skill (subjective plane — COACH_INTEL)
Weighted mean over supplied fields, each defensively re-clamped:
`executionAccuracyPct` weight 0.6, `toolHandlingProficiency` weight 0.4, each `sportSpecificTechnical[key]` weight 0.3. Returns `null` (no evidence) when nothing is supplied — never a fabricated 50.

### 3.5 Cognitive Tactical Intelligence
- COACH_INTEL: `gameIqScore` weight 0.6, `positionalAwarenessScore` weight 0.4.
- Positional-coverage proxy from coordinates (spatial grid occupancy → `clampScore(100 - 99 * distance)`): **weak evidence by design**, confidence 0.5 vs 0.85 for coach intel.

---

## 4. Confidence & Composite (the anti-dilution law)

Every pillar carries a per-stream confidence weight. Locked matrix:

| Stream | speed | agility | stamina | technical | cognitive |
|---|---|---|---|---|---|
| JSON_COORDINATES | 0.9 | 0.8 | — | — | 0.5 |
| CSV_SENSOR | 0.6 | — | 0.9 | — | — |
| IMU_PACKET | — | 0.7 | 0.8 | — | — |
| COACH_INTEL | — | — | — | 0.85 | 0.85 |

Composite: `clampScore(weightedMean(pairs))` over `[vector, confidence]` pairs. Unevidenced pillars sit at the `NEUTRAL = 50` prior **with confidence 0**, so they contribute nothing:

> **A stream that only measures speed must never dilute the composite with four neutral priors.** Any edit that lets a zero-confidence vector leak into the composite is a regression, full stop.

Confidence weights persist to `raw_payload.confidence` on each `performance_logs` row — evidence rides with the record so downstream analytics can re-weight without recomputation.

---

## 5. Pipeline Placement (where math is allowed to run)

```
API route (app/api/v1/telemetry/ingest)      ← validation + gates + enqueue ONLY. NEVER computes.
  → telemetry_ingest_queue                   ← durable, idempotent via sha256 ingest_hash (dup ⇒ 23505 ⇒ no-op)
    → Edge Function telemetry-processor      ← THE ONLY caller of calculateTaxonomyVectors for persistence
      → performance_logs (append-only)       ← vectors + composite + confidence + engine_version
```

Geospatial pre-gate: JSON_COORDINATES streams must pass ray-casting point-in-polygon (`insideRatio ≥ 0.95`) against `venues.coordinates = { vertices: [{x,y},...] }` in venue-local meter space, else `GEO_REJECTED` (422). Passing sets `venue_verified = true`.

---

## 6. Preservation Rules for Downstream Models (the actual guardrails)

When editing background processing engines or adding multi-sport modules:

1. **One canonical file.** All math edits happen in `supabase/functions/_shared/analyticsEngine.ts`. Touching the re-export shim's logic, or duplicating a formula into a route/worker, is a critical failure.
2. **Version discipline.** ANY change to formulas, weights, bands, thresholds, or confidence values bumps `ENGINE_VERSION` (semver: recalibration = minor, formula change = major, refactor with bit-identical output = patch). Rows are comparable only within an engine version — an unbumped math change silently corrupts longitudinal athlete data.
3. **Signature stability.** `calculateTaxonomyVectors(streamType, payload, opts?)`, `clampScore`, `bandScore`, `percentile`, `insideRatio`, `pointInPolygon` keep their exported signatures. Extend via new optional fields on `opts`, never by breaking callers in two runtimes.
4. **New sports = new bands + new payload variants, not new math.** Adding basketball/padel/rugby means: (a) a sport-calibrated `ReferenceBands` override, (b) if needed, a new member of the Zod discriminated union at the API layer and matching `StreamPayload` variant, (c) `sportSpecificTechnical` keys for subjective metrics. The five pillars themselves are closed — a sixth pillar is a founder-level schema decision (new column, new CHECK bound, new migration), never an engine patch.
5. **Null over fabrication.** Extractors return `null` when evidence is absent. Never emit a default score as if it were measured. NEUTRAL=50 exists only as the unevidenced prior with zero confidence.
6. **Percentiles over maxima** for any noisy physical sensor channel (existing pattern: p95). Do not "fix" this to `Math.max`.
7. **Both runtimes must pass.** The file executes under Deno (Edge) and Node (Next.js). No Node-only imports (`fs`, `crypto` module — use `crypto.subtle`), no Deno-only globals.
8. **Verification tail:** after any engine edit run `npm run typecheck`, then assert on synthetic fixtures that (a) all five vectors ∈ [1,100], (b) composite ∈ [1,100], (c) a single-pillar stream's composite equals that pillar's score, (d) duplicate ingest of an identical payload is a no-op.
