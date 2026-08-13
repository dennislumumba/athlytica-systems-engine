// =====================================================================
// POST-AUTHENTICATION LANDING ROUTE — one function, one rule table.
//
// Every surface that bounces a signed-in visitor somewhere (the marketing
// page, /login, a magic-link return) resolves the destination HERE, so
// the redirect graph has a single edge to change when a role gains a
// dashboard. Roles come from lib/auth/workspace.ts, which resolves them
// server-side; this module never trusts a client claim.
//
// Isomorphic and dependency-free on purpose: it is imported by a client
// component and covered by tests/landing-route.test.mts.
// =====================================================================

// Type-only: this module must stay runtime-import-free so the test can
// load it under node --test without the "@/" bundler alias.
import type { WorkspaceId, WorkspaceRole } from "@/config/workspaces";

/** The shape /api/v1/workspace/dashboard hands back on bootstrap. */
export interface LandingActor {
  isFounder: boolean;
  roles: Partial<Record<WorkspaceId, WorkspaceRole>>;
  /** Has the account completed the self-service profile step? */
  hasProfile?: boolean;
}

/**
 * A signed-in account with no workspace grant and no profile has not
 * said who it is yet. Everyone passes through here exactly once.
 */
export const PROFILE_SETUP_ROUTE = "/onboarding";

/**
 * Profile filed, no grant yet. The shell's own "no workspace access"
 * screen is the honest end state: the founder grants from the HQ
 * permission matrix, and nothing the user can do speeds that up.
 */
export const ACCESS_PENDING_ROUTE = "/dashboard";

/**
 * Founder / league-admin command centre. The NRHL League Command Center
 * is the operational surface (six tabs), not the cross-venture canvas —
 * the founder directive lands on the league, not the summary.
 */
export const LEAGUE_COMMAND_ROUTE = "/dashboard/leagues/nrhl/overview";

/** Cross-workspace canvas: the coach hub and the executive summary. */
export const COMMAND_CANVAS_ROUTE = "/dashboard";

/** Single-workspace deep dive: what an athlete/parent account gets. */
export const VENTURE_ROUTE = "/dashboard/venture";

/**
 * Revenue pipeline. A SALES_OPS grant opens the CRM and nothing else, so
 * this is not merely where they land first — it is the only surface the
 * grant reaches.
 */
export const CRM_ROUTE = "/dashboard/crm";

/**
 * Where `actor` belongs immediately after sign-in.
 *
 *   founder / any GLOBAL_FOUNDER grant → league command centre
 *   any HEAD_COACH grant               → command canvas (coach lens)
 *   any SALES_OPS grant                → the CRM pipeline
 *   any ATHLETE grant                  → their venture dashboard
 *   no grant, no profile               → profile setup
 *   no grant, profile filed            → access pending
 *
 * A grant always wins over the profile step: the founder and any coach
 * already onboarded out-of-band must never be sent to fill in a form.
 *
 * SALES_OPS outranks ATHLETE because it is the narrower surface: an
 * account holding both is a seller who also trains, and dropping them on
 * a venture dashboard would hide the pipeline they signed in for.
 */
export function landingFor(actor: LandingActor | null | undefined): string {
  if (!actor) return "/login";
  const held = Object.values(actor.roles).filter(Boolean);
  if (actor.isFounder || held.includes("GLOBAL_FOUNDER")) return LEAGUE_COMMAND_ROUTE;
  if (held.includes("HEAD_COACH")) return COMMAND_CANVAS_ROUTE;
  if (held.includes("SALES_OPS")) return CRM_ROUTE;
  if (held.includes("ATHLETE")) return VENTURE_ROUTE;
  return actor.hasProfile ? ACCESS_PENDING_ROUTE : PROFILE_SETUP_ROUTE;
}

/**
 * Sanitises a ?redirectTo= value before it is used as a router target.
 * Only same-origin absolute paths survive — `//evil.com` and
 * `https://evil.com` are open redirects, and a login screen is exactly
 * where they get planted.
 */
export function safeRedirectTo(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
