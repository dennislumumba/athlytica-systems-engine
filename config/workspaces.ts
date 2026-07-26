// =====================================================================
// WORKSPACE TAXONOMY — shared client/server source of truth for the
// multi-tenant shell (founder directive 2026-07-26).
//
// Mirror of the CHECK constraints in
// supabase/migrations/20260726120000_workspace_rbac.sql. If a workspace
// or role is added there, add it here — nowhere else encodes the list.
// =====================================================================

/** Hardcoded root account: bypasses onboarding, GLOBAL_FOUNDER everywhere. */
export const GLOBAL_FOUNDER_EMAIL = "dennis@bigice.co.ke";

export const WORKSPACES = {
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

export const WORKSPACE_ROLES = ["GLOBAL_FOUNDER", "HEAD_COACH", "ATHLETE"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

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
