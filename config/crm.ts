// =====================================================================
// CRM TAXONOMY — shared client/server vocabulary for the revenue
// pipeline (founder directive 2026-08-13).
//
// Mirror of the CHECK constraints in the crm_core migration. Codes are
// snake_case and frozen (they land in stored rows and in filter URLs);
// only the labels move. Same law as config/workspaces.ts: widen both or
// neither.
//
// PRICES ARE NOT DEFINED HERE. A product may name a code-table tier in
// config/registration-fees.ts, which is where the intake funnel already
// derives its charge; Big Ice academy cohorts price from
// commercial_price_tier and are read live. The CRM stores what a deal is
// WORTH (negotiated), never a third copy of what something COSTS.
// =====================================================================

// Relative, with the extension: config/crm.ts is loaded directly by
// node --test through lib/services/crm-metrics.ts, which has no "@/"
// bundler alias available.
import {
  REGISTRATION_TIERS,
  type RegistrationTierId,
  type VentureContext,
} from "./registration-fees.ts";

// ---------------------------------------------------------------------
// Pipeline stages. One ordered list: a "lead" is an opportunity that has
// not passed `qualified` yet — there is no second status vocabulary to
// drift out of step with this one.
// ---------------------------------------------------------------------

export const STAGES = {
  new: { label: "New", order: 1, state: "open" },
  contacted: { label: "Contacted", order: 2, state: "open" },
  qualified: { label: "Qualified", order: 3, state: "open" },
  meeting: { label: "Meeting", order: 4, state: "open" },
  proposal: { label: "Proposal", order: 5, state: "open" },
  payment_pending: { label: "Payment Pending", order: 6, state: "open" },
  won: { label: "Won", order: 7, state: "won" },
  lost: { label: "Lost", order: 8, state: "lost" },
  // Parked, not dead: excluded from the board's default view and from
  // weighted pipeline, but still followed up.
  nurture: { label: "Nurture", order: 9, state: "parked" },
} as const satisfies Record<
  string,
  { label: string; order: number; state: "open" | "won" | "lost" | "parked" }
>;

export type Stage = keyof typeof STAGES;
export const STAGE_IDS = Object.keys(STAGES) as Stage[];

/** Board columns, in the order §8 specifies. Nurture is not a column. */
export const BOARD_STAGES: Stage[] = STAGE_IDS.filter((s) => STAGES[s].state !== "parked").sort(
  (a, b) => STAGES[a].order - STAGES[b].order,
);

export const isOpenStage = (s: Stage) => STAGES[s].state === "open";

/**
 * Default win probability per stage, in percent. A starting point the
 * founder overrides per deal — not a forecast model (§23 rules out
 * elaborate scoring). Stated once so the board and the weighted-pipeline
 * total cannot disagree.
 */
export const STAGE_PROBABILITY: Record<Stage, number> = {
  new: 10,
  contacted: 20,
  qualified: 40,
  meeting: 55,
  proposal: 70,
  payment_pending: 90,
  won: 100,
  lost: 0,
  nurture: 5,
};

// ---------------------------------------------------------------------
// Products. `tier` names a code-table intake tier where one exists, so
// the CRM can offer a listed price without restating it; null means the
// price is either negotiated (institutional) or lives in
// commercial_price_tier (Big Ice academy cohorts, read live).
// ---------------------------------------------------------------------

export const PRODUCTS = {
  nrhl_profile: { label: "NRHL Profile", venture: "NRHL", tier: null },
  nrhl_standard: { label: "NRHL Standard", venture: "NRHL", tier: "combine_27500" },
  nrhl_elite: { label: "NRHL Elite", venture: "NRHL", tier: "acceleration_45000" },
  bigice_prospect: { label: "Big Ice Prospect Pathway", venture: "BIG_ICE", tier: null },
  bigice_semi_annual: { label: "Big Ice Semi-Annual", venture: "BIG_ICE", tier: null },
  bigice_annual: { label: "Big Ice Annual", venture: "BIG_ICE", tier: null },
  athlytica_individual: { label: "Athlytica Individual", venture: "ATHLYTICA", tier: "baseline_7500" },
  athlytica_organization: { label: "Athlytica Organization", venture: "ATHLYTICA", tier: "enterprise_150k" },
  institutional_partnership: { label: "Institutional Partnership", venture: "ATHLYTICA", tier: null },
  other: { label: "Other", venture: "ATHLYTICA", tier: null },
} as const satisfies Record<
  string,
  { label: string; venture: VentureContext; tier: RegistrationTierId | null }
>;

export type Product = keyof typeof PRODUCTS;
export const PRODUCT_IDS = Object.keys(PRODUCTS) as Product[];

/** Listed price in KES where the code tier table sets one, else null. */
export function listedPriceKes(product: Product): number | null {
  const tier = PRODUCTS[product].tier;
  return tier ? REGISTRATION_TIERS[tier].amountKes : null;
}

// ---------------------------------------------------------------------
// Acquisition channels (§10). The whole point is answering which of
// these produces cash, so the list stays closed — free text would make
// "Instagram" and "instagram" two channels.
// ---------------------------------------------------------------------

export const SOURCES = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  whatsapp: "WhatsApp",
  website: "Website",
  referral: "Referral",
  school_outreach: "School outreach",
  coach_referral: "Coach referral",
  nrhl_event: "NRHL event",
  big_ice: "Big Ice",
  athlytica: "Athlytica",
  existing_network: "Existing network",
  other: "Other",
} as const;

export type Source = keyof typeof SOURCES;
export const SOURCE_IDS = Object.keys(SOURCES) as Source[];

// ---------------------------------------------------------------------
// Contacts, organizations, activities, tasks
// ---------------------------------------------------------------------

export const CONTACT_TYPES = {
  parent: "Parent",
  athlete: "Athlete",
  coach: "Coach",
  school_admin: "School administrator",
  academy_owner: "Academy owner",
  club_admin: "Club administrator",
  organization_contact: "Organization contact",
  partner: "Partner",
  other: "Other",
} as const;

export type ContactType = keyof typeof CONTACT_TYPES;
export const CONTACT_TYPE_IDS = Object.keys(CONTACT_TYPES) as ContactType[];

export const ORG_TYPES = {
  school: "School",
  academy: "Academy",
  club: "Club",
  corporate: "Corporate",
  federation: "Federation",
  other: "Other",
} as const;

export type OrgType = keyof typeof ORG_TYPES;
export const ORG_TYPE_IDS = Object.keys(ORG_TYPES) as OrgType[];

export const ACTIVITY_TYPES = {
  call: "Call",
  whatsapp: "WhatsApp",
  sms: "SMS",
  email: "Email",
  meeting: "Meeting",
  assessment: "Assessment",
  follow_up: "Follow-up",
  proposal: "Proposal",
  payment_request: "Payment request",
  note: "Note",
  other: "Other",
} as const;

export type ActivityType = keyof typeof ACTIVITY_TYPES;
export const ACTIVITY_TYPE_IDS = Object.keys(ACTIVITY_TYPES) as ActivityType[];

export const TEMPERATURES = { cold: "Cold", warm: "Warm", hot: "Hot" } as const;
export type Temperature = keyof typeof TEMPERATURES;
export const TEMPERATURE_IDS = Object.keys(TEMPERATURES) as Temperature[];

export const PRIORITIES = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
} as const;
export type Priority = keyof typeof PRIORITIES;
export const PRIORITY_IDS = Object.keys(PRIORITIES) as Priority[];

export const TASK_STATUSES = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;
export type TaskStatus = keyof typeof TASK_STATUSES;
export const TASK_STATUS_IDS = Object.keys(TASK_STATUSES) as TaskStatus[];

// ---------------------------------------------------------------------
// Staleness (§24.9). An open deal nobody has touched in this many days
// is surfaced as going stale — one number, stated once.
// ---------------------------------------------------------------------
export const STALE_AFTER_DAYS = 14;

export const isStage = (v: unknown): v is Stage => typeof v === "string" && v in STAGES;
export const isProduct = (v: unknown): v is Product => typeof v === "string" && v in PRODUCTS;
export const isSource = (v: unknown): v is Source => typeof v === "string" && v in SOURCES;
