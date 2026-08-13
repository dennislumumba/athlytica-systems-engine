// =====================================================================
// WORKSPACE TAXONOMY — shared client/server source of truth for the
// multi-tenant shell (founder directive 2026-07-26).
//
// Mirror of the CHECK constraints in
// supabase/migrations/20260726120000_workspace_rbac.sql, widened by
// 20260727120000_tta_workspace.sql. If a workspace or role is added
// there, add it here — nowhere else encodes the list.
// =====================================================================

/** Hardcoded root account: bypasses onboarding, GLOBAL_FOUNDER everywhere. */
export const GLOBAL_FOUNDER_EMAIL = "dennis@bigice.co.ke";

/**
 * Tenant id of TTA International Football Academy (external code
 * TTA-001) in public.tenants. The TTA workspace is a single-tenant
 * client surface, so the id is pinned here rather than discovered —
 * every TTA read is scoped to it server-side.
 */
export const TTA_TENANT_ID = "77000001-0000-4000-8000-000000000001";

// Order matters: WorkspaceProvider lands on the first workspace the
// actor holds a grant in, so TTA is the default context.
export const WORKSPACES = {
  tta: {
    label: "TTA International Football Academy",
    short: "TTA",
    venture: "TTA",
    accent: "#2f81f7",
  },
  nrhl: {
    label: "Nairobi Regional Hockey League",
    short: "NRHL",
    venture: "NRHL",
    accent: "#2f81f7",
  },
  big_ice: {
    label: "Big Ice Hockey & Inline Academy",
    short: "Big Ice",
    venture: "BIG_ICE",
    accent: "#38bdf8",
  },
  athlytica_hq: {
    label: "Athlytica HQ",
    short: "HQ",
    venture: "ATHLYTICA",
    accent: "#f6c443",
  },
} as const satisfies Record<
  string,
  { label: string; short: string; venture: string; accent: string }
>;

export type WorkspaceId = keyof typeof WORKSPACES;
export const WORKSPACE_IDS = Object.keys(WORKSPACES) as WorkspaceId[];

/**
 * URL slug per workspace. Routes are kebab-case and human-typed
 * (/dashboard/w/big-ice); ids are snake_case and match the SQL CHECK
 * constraint (big_ice). Nothing else may map between the two — a second
 * mapping is how /dashboard/w/hq and /dashboard/w/athlytica-hq end up
 * both half-working.
 */
export const WORKSPACE_SLUGS = {
  tta: "tta",
  nrhl: "nrhl",
  big_ice: "big-ice",
  athlytica_hq: "hq",
} as const satisfies Record<WorkspaceId, string>;

export type WorkspaceSlug = (typeof WORKSPACE_SLUGS)[WorkspaceId];
export const WORKSPACE_SLUG_LIST = WORKSPACE_IDS.map((id) => WORKSPACE_SLUGS[id]);

const BY_SLUG = new Map<string, WorkspaceId>(
  WORKSPACE_IDS.map((id) => [WORKSPACE_SLUGS[id], id]),
);

/** Resolves a URL slug to a workspace id, or null for an unknown one. */
export function workspaceFromSlug(slug: unknown): WorkspaceId | null {
  return typeof slug === "string" ? (BY_SLUG.get(slug.toLowerCase()) ?? null) : null;
}

export const WORKSPACE_ROLES = [
  "GLOBAL_FOUNDER",
  "HEAD_COACH",
  "ATHLETE",
  "SALES_OPS",
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/**
 * Roles that may open a venture's dashboard payload.
 *
 * SALES_OPS is deliberately absent. That payload is all-or-nothing —
 * /api/v1/workspace/dashboard returns payment_events, the registration
 * ledger and the permission matrix to anyone holding a grant, with role
 * filtering applied client-side at render. A sales grant is meant to
 * open the CRM and nothing else, so the workspace route refuses it
 * server-side rather than relying on panels being hidden.
 */
export const VENTURE_DASHBOARD_ROLES = ["GLOBAL_FOUNDER", "HEAD_COACH", "ATHLETE"] as const;

/** Roles that may read and write the CRM (app/api/v1/crm). */
export const CRM_ROLES = ["GLOBAL_FOUNDER", "SALES_OPS"] as const;

export const canOpenVentureDashboard = (role: WorkspaceRole): boolean =>
  (VENTURE_DASHBOARD_ROLES as readonly string[]).includes(role);

export const canOpenCrm = (role: WorkspaceRole): boolean =>
  (CRM_ROLES as readonly string[]).includes(role);

/** Founder-only lens switch: financial/admin surfaces vs tactical ones. */
export type Perspective = "executive" | "coach";

export function isWorkspaceId(value: unknown): value is WorkspaceId {
  return typeof value === "string" && value in WORKSPACES;
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return WORKSPACE_ROLES.includes(value as WorkspaceRole);
}

/**
 * Which panel groups a role may see. ATHLETE never sees money or other
 * people's rosters; HEAD_COACH sees tactical surfaces only.
 */
export function canSee(role: WorkspaceRole, group: PanelGroup): boolean {
  if (role === "GLOBAL_FOUNDER") return true;
  if (role === "HEAD_COACH") return group === "tactical" || group === "self";
  // ATHLETE and SALES_OPS both fall through to "self". SALES_OPS never
  // reaches a venture dashboard at all (see VENTURE_DASHBOARD_ROLES);
  // this is the client-side half of the same answer.
  return group === "self";
}

// ---------------------------------------------------------------------
// Panel taxonomy. Nav entry ids double as the anchor ids of the panels
// they point at, so the sidebar needs no route per widget.
// ---------------------------------------------------------------------

export type PanelGroup = "financial" | "tactical" | "admin" | "self";

export interface NavItem {
  id: string;
  label: string;
  group: PanelGroup;
}

export const NAV: Record<WorkspaceId, NavItem[]> = {
  tta: [
    { id: "squad", label: "Squad & Programs", group: "tactical" },
    { id: "development", label: "Road to Mastery", group: "tactical" },
    { id: "passport", label: "Scout Passport", group: "tactical" },
  ],
  nrhl: [
    { id: "stk-stream", label: "STK Push Financial Stream", group: "financial" },
    { id: "combine-funnel", label: "Combine Funnel", group: "financial" },
    { id: "roster", label: "Roster & Player Database", group: "tactical" },
    { id: "league-ops", label: "Standings & Operations", group: "tactical" },
  ],
  big_ice: [
    { id: "billing", label: "Package Billing Engine", group: "financial" },
    { id: "schedule", label: "Training Schedule & Rinks", group: "tactical" },
    { id: "development", label: "Developmental Metrics", group: "tactical" },
    { id: "clients", label: "Client Roster", group: "tactical" },
  ],
  athlytica_hq: [
    { id: "revenue", label: "Cross-Tenant Revenue", group: "financial" },
    { id: "health", label: "System Health & Logs", group: "admin" },
    { id: "matrix", label: "User & Permission Matrix", group: "admin" },
  ],
};

/**
 * Panels visible to `role` in `workspace` under the current lens.
 * Coach view deliberately hides financial and admin surfaces even for
 * the founder — that is the entire point of the toggle.
 */
export function visibleNav(
  workspace: WorkspaceId,
  role: WorkspaceRole,
  perspective: Perspective,
): NavItem[] {
  return NAV[workspace].filter((item) => {
    if (!canSee(role, item.group)) return false;
    if (role === "GLOBAL_FOUNDER" && perspective === "coach") {
      return item.group === "tactical" || item.group === "self";
    }
    return true;
  });
}
