// =====================================================================
// WORKSPACE ACTOR RESOLUTION — server-side RBAC gate (2026-07-26).
//
// Every workspace API call carries the caller's Supabase access token as
// a Bearer header. We verify it against the auth server (never decode a
// JWT client-side and trust it), then resolve the caller's role in each
// workspace from public.workspace_roles.
//
// ROOT FOUNDER BYPASS: GLOBAL_FOUNDER_EMAIL short-circuits the grant
// lookup and receives GLOBAL_FOUNDER in all three workspaces — no
// onboarding, no seeded rows, no way to lock the founder out of their
// own system. Same rule as public.is_global_founder() in SQL.
//
// Env (server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  GLOBAL_FOUNDER_EMAIL,
  WORKSPACE_IDS,
  isWorkspaceId,
  isWorkspaceRole,
  type WorkspaceId,
  type WorkspaceRole,
} from "@/config/workspaces";

export interface Actor {
  userId: string;
  email: string;
  isFounder: boolean;
  /** Role per workspace; absent key = no access. */
  roles: Partial<Record<WorkspaceId, WorkspaceRole>>;
}

/** Fail-closed config probe — same CONFIG_DEBT posture as the pay routes. */
export function serviceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function adminClient(): SupabaseClient {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Verifies the bearer token and loads the caller's workspace grants.
 * Returns null for anonymous/invalid tokens — callers answer 401.
 */
export async function resolveActor(request: Request): Promise<Actor | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const supabase = adminClient();
  // A malformed JWT makes getUser throw rather than return an error —
  // that is still just an unauthenticated caller, never a 500.
  let data: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"];
  try {
    const result = await supabase.auth.getUser(token);
    if (result.error) return null;
    data = result.data;
  } catch {
    return null;
  }
  if (!data.user?.email) return null;

  const email = data.user.email.toLowerCase();
  if (email === GLOBAL_FOUNDER_EMAIL) {
    return {
      userId: data.user.id,
      email,
      isFounder: true,
      roles: Object.fromEntries(
        WORKSPACE_IDS.map((w) => [w, "GLOBAL_FOUNDER" as WorkspaceRole]),
      ) as Record<WorkspaceId, WorkspaceRole>,
    };
  }

  const { data: grants } = await supabase
    .from("workspace_roles")
    .select("workspace, role")
    .eq("user_id", data.user.id);

  const roles: Partial<Record<WorkspaceId, WorkspaceRole>> = {};
  for (const row of grants ?? []) {
    if (isWorkspaceId(row.workspace) && isWorkspaceRole(row.role)) {
      roles[row.workspace] = row.role;
    }
  }

  return { userId: data.user.id, email, isFounder: false, roles };
}

/** Role the actor holds in `workspace`, or null if they have no access. */
export function roleIn(actor: Actor, workspace: WorkspaceId): WorkspaceRole | null {
  return actor.roles[workspace] ?? null;
}
