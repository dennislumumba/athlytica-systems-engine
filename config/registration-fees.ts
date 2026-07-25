// =====================================================================
// REGISTRATION FEE TABLE — server-side source of truth (G-W6-PAY)
//
// LAW: the expected fee is NEVER client-supplied. A registration payload
// that could set its own amountExpected lets a registrant price their
// own league entry — the settlement RPC's underpayment guard would then
// guard nothing. The route derives the fee HERE, from founder-set env
// values, and stamps it into the session server-side.
//
// Fee values are founder decisions (04 §4.2(3)) provisioned via env:
//   REG_FEE_NRHL_KES, REG_FEE_BIG_ICE_KES, REG_FEE_ATHLYTICA_KES
// Fail-closed: an unset/invalid fee seals registration for that venture
// (503 CONFIG_DEBT), it never defaults to a made-up number.
// =====================================================================

export const VENTURE_CONTEXTS = ["NRHL", "BIG_ICE", "ATHLYTICA"] as const;
export type VentureContext = (typeof VENTURE_CONTEXTS)[number];

const FEE_ENV_KEYS: Readonly<Record<VentureContext, string>> = {
  NRHL: "REG_FEE_NRHL_KES",
  BIG_ICE: "REG_FEE_BIG_ICE_KES",
  ATHLYTICA: "REG_FEE_ATHLYTICA_KES",
};

/** Founder-set registration fee in KES, or null (fail closed) if unprovisioned. */
export function getRegistrationFeeKes(venture: VentureContext): number | null {
  const raw = process.env[FEE_ENV_KEYS[venture]];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Env var name for a venture's fee — used in CONFIG_DEBT error surfaces. */
export function feeEnvKey(venture: VentureContext): string {
  return FEE_ENV_KEYS[venture];
}

// ---------------------------------------------------------------------
// UNIFIED INTAKE TIERS — cross-domain /register funnel (founder
// directive 2026-07-25). Prices are founder-set constants; the tier id
// deliberately encodes the KES amount so a drifted price is visible at
// a glance. The stk-push route derives the charge from THIS table —
// client-supplied amounts are never trusted (same law as venture fees).
// ---------------------------------------------------------------------

export const REGISTRATION_TIERS = {
  baseline_7500: {
    amountKes: 7500,
    venture: "ATHLYTICA",
    label: "Baseline Tech Profiling",
  },
  combine_27500: {
    amountKes: 27_500,
    venture: "NRHL",
    label: "Fall Combine",
  },
  acceleration_45000: {
    amountKes: 45_000,
    venture: "NRHL",
    label: "Acceleration Program",
  },
} as const satisfies Record<
  string,
  { amountKes: number; venture: VentureContext; label: string }
>;

export type RegistrationTierId = keyof typeof REGISTRATION_TIERS;
export const REGISTRATION_TIER_IDS = Object.keys(
  REGISTRATION_TIERS,
) as RegistrationTierId[];
