// =====================================================================
// NRHL DRAFT-DAY GATE LEDGER — G-W6-PAY infrastructure parameters
// Governing manual: .agentic-os/04_NOTION_SYNC_MAP.md §4
//
// PURPOSE: single typed source of truth for the countdown to Draft Day
// (2026-08-22). Every downstream tournament/draft engine MUST call
// `assertDraftEngineUnblocked()` (or `isGateOpen()` for a specific gate)
// before executing. G-W6-PAY — the M-Pesa payment gate, due 2026-07-19 —
// is the root of the critical path: nothing downstream runs until
// financial confirmation events settle.
//
// LAW: a gate flips live ONLY via validated settlement evidence
// (`MpesaSettlementEventSchema` for G-W6-PAY), never by manual
// assertion. Editing dates here requires a founder-authored decision
// note per 04 §4.2(3).
// =====================================================================

import { z } from "zod";

// ---------------------------------------------------------------------
// Gate identifiers (closed set — additions are a founder decision)
// ---------------------------------------------------------------------
export const GATE_IDS = [
  "G-W6-PAY",
  "G-W5-REG",
  "G-W4-ROSTER",
  "G-W3-EVAL",
  "G-W2-CONF",
  "G-W1-OPS",
  "G-DRAFT",
] as const;

export type GateId = (typeof GATE_IDS)[number];

export interface GateDefinition {
  readonly id: GateId;
  readonly deliverable: string;
  readonly dueDate: string; // ISO date, Africa/Nairobi (UTC+3)
  readonly dependsOn: GateId | null; // strict chain — one upstream gate
  readonly primaryKpi: string;
}

export const NRHL_GATE_LEDGER: Readonly<Record<GateId, GateDefinition>> = {
  "G-W6-PAY": {
    id: "G-W6-PAY",
    deliverable:
      "Registration payment gate live — M-Pesa automated transaction flow (STK push collection, settlement callback verification, receipt issuance, reconciliation sheet)",
    dueDate: "2026-07-19",
    dependsOn: null, // ROOT OF THE CRITICAL PATH
    primaryKpi: "First validated M-Pesa settlement event (resultCode 0 + receipt) logged",
  },
  "G-W5-REG": {
    id: "G-W5-REG",
    deliverable: "Registration funnel open + sponsor block outreach live",
    dueDate: "2026-07-26",
    dependsOn: "G-W6-PAY",
    primaryKpi: "Paid registrations count; sponsor conversations >= target",
  },
  "G-W4-ROSTER": {
    id: "G-W4-ROSTER",
    deliverable:
      "Evaluation pods scheduled; athlete pool synced to athlete_tenant_links under the NRHL tenant",
    dueDate: "2026-08-01",
    dependsOn: "G-W5-REG",
    primaryKpi: "100% of paid registrants linked + pod-assigned",
  },
  "G-W3-EVAL": {
    id: "G-W3-EVAL",
    deliverable: "Evaluation pod sessions executed; 5-pillar scores logged via telemetry ingest",
    dueDate: "2026-08-08",
    dependsOn: "G-W4-ROSTER",
    primaryKpi: "performance_logs coverage: every draft-eligible athlete >= 1 scored session",
  },
  "G-W2-CONF": {
    id: "G-W2-CONF",
    deliverable:
      "Conference/draft-board build (Summit, Ridge, Plateau, Savannah) from composite scores — single engine_version across all athletes",
    dueDate: "2026-08-15",
    dependsOn: "G-W3-EVAL",
    primaryKpi: "Draft board locked; zero athletes missing composite",
  },
  "G-W1-OPS": {
    id: "G-W1-OPS",
    deliverable: "Venue, officials, comms, sponsor activation finalized",
    dueDate: "2026-08-20",
    dependsOn: "G-W2-CONF",
    primaryKpi: "Ops runbook signed off",
  },
  "G-DRAFT": {
    id: "G-DRAFT",
    deliverable: "NRHL DRAFT DAY",
    dueDate: "2026-08-22",
    dependsOn: "G-W1-OPS",
    primaryKpi: "Event executed; draft results published",
  },
};

// ---------------------------------------------------------------------
// Financial confirmation contract — normalized M-Pesa settlement event.
// Populated by the payment callback handler after verifying the Daraja
// callback (resultCode 0 = success). Anything that fails this schema is
// NOT settlement evidence and must not flip the gate.
// ---------------------------------------------------------------------
export const MpesaSettlementEventSchema = z.object({
  gateId: z.literal("G-W6-PAY"),
  mpesaReceiptNumber: z.string().trim().min(8).max(20),
  amountKes: z.number().positive(),
  msisdn: z.string().regex(/^254(1|7)\d{8}$/, "expected Kenyan MSISDN, e.g. 2547XXXXXXXX"),
  transactionTimestamp: z.string().datetime(),
  resultCode: z.literal(0), // Daraja success code — any other value is a failed transaction
  accountReference: z.string().trim().min(1).max(64), // registration/registry identifier
});

export type MpesaSettlementEvent = z.infer<typeof MpesaSettlementEventSchema>;

// ---------------------------------------------------------------------
// Gate state + blocking logic
// ---------------------------------------------------------------------
export interface GateState {
  readonly gateId: GateId;
  readonly live: boolean;
  readonly liveAt: string | null; // ISO datetime when evidence settled
  readonly evidence: string | null; // e.g. M-Pesa receipt number, runbook sign-off ref
}

export class GateBlockedError extends Error {
  readonly blockedChain: readonly GateId[];

  constructor(blockedChain: readonly GateId[]) {
    super(
      `NRHL draft engine BLOCKED. Unsettled upstream gates (dependency order): ${blockedChain.join(" -> ")}. ` +
        `Root cause is the first entry; no downstream engine may execute until it settles.`,
    );
    this.name = "GateBlockedError";
    this.blockedChain = blockedChain;
  }
}

function toStateMap(states: readonly GateState[]): ReadonlyMap<GateId, GateState> {
  const map = new Map<GateId, GateState>();
  for (const s of states) map.set(s.gateId, s);
  return map;
}

/** Full upstream chain for a gate, root-first (excludes the gate itself). */
export function upstreamChain(gateId: GateId): readonly GateId[] {
  const chain: GateId[] = [];
  let cursor: GateId | null = NRHL_GATE_LEDGER[gateId].dependsOn;
  while (cursor !== null) {
    chain.unshift(cursor);
    cursor = NRHL_GATE_LEDGER[cursor].dependsOn;
  }
  return chain;
}

/**
 * A gate is OPEN iff the gate itself and every upstream ancestor is live.
 * Missing state rows are treated as NOT live — fail closed.
 */
export function isGateOpen(gateId: GateId, states: readonly GateState[]): boolean {
  const map = toStateMap(states);
  const required: readonly GateId[] = [...upstreamChain(gateId), gateId];
  return required.every((id) => map.get(id)?.live === true);
}

/** Root-first list of gates blocking the given gate (empty = open). */
export function blockedGates(gateId: GateId, states: readonly GateState[]): readonly GateId[] {
  const map = toStateMap(states);
  const required: readonly GateId[] = [...upstreamChain(gateId), gateId];
  return required.filter((id) => map.get(id)?.live !== true);
}

/**
 * HARD BLOCK for tournament draft engines. Call at every draft-engine
 * entry point BEFORE any roster, board, or scheduling computation.
 * Throws GateBlockedError while G-W6-PAY (or any downstream gate up to
 * the target) has no settled financial/operational confirmation.
 */
export function assertDraftEngineUnblocked(
  states: readonly GateState[],
  target: GateId = "G-DRAFT",
): void {
  const blocked = blockedGates(target, states);
  if (blocked.length > 0) {
    throw new GateBlockedError(blocked);
  }
}

/**
 * The ONLY sanctioned way to flip G-W6-PAY live: a schema-valid
 * settlement event. Returns the GateState to persist. Invalid evidence
 * throws (ZodError) — callers must not catch-and-force.
 */
export function settlePaymentGate(rawEvent: unknown): GateState {
  const event = MpesaSettlementEventSchema.parse(rawEvent);
  return {
    gateId: event.gateId,
    live: true,
    liveAt: event.transactionTimestamp,
    evidence: event.mpesaReceiptNumber,
  };
}
