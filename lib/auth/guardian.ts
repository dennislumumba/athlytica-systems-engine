// =====================================================================
// GUARDIAN RESOLUTION — the parent portal's authorization boundary
//
// THIS DELIBERATELY DOES NOT USE public.workspace_roles.
// A workspace grant is all-or-nothing: /api/v1/workspace/dashboard
// returns a venture's ENTIRE payload — payment_events, registrations,
// revenue, every athlete — to any role holding one, and the role
// filtering happens client-side at render. Granting parents a workspace
// role to let them see their own child would hand every parent the
// commercial books and every other family's record. See CLAUDE.md,
// SECURITY INVARIANTS.
//
// So the portal has its own, narrower resolution: a verified auth email
// resolves to the bigice_athlete rows that name it as guardian, and to
// nothing else. Membership is DERIVED SERVER-SIDE on every request —
// there is no client-supplied athlete id anywhere in this path, which is
// what makes §68 ("Parent A cannot view Athlete B") structural rather
// than a check somebody has to remember to write.
//
// EMAIL IS THE LINK, and it is trustworthy because Supabase only issues
// a session for an address that answered a magic link. Phone is not used
// for matching: nothing in this system verifies possession of a number,
// so a phone match would be an unauthenticated claim.
//
// ponytail: a guardian who paid under one address and signs in with
// another resolves to zero athletes. That is the safe direction to fail,
// and it is what the §37 "ACTIVATE YOUR ACCOUNT" flow exists to repair —
// an explicit, admin-visible link rather than fuzzy contact matching.
// =====================================================================

import { adminClient, bearerToken } from "@/lib/auth/workspace";

export interface GuardianAthlete {
  biifCode: string;
  fullName: string;
  dateOfBirth: string | null;
  primaryDiscipline: string | null;
  skatingLevel: string | null;
  status: string;
  portalActivatedAt: string | null;
  passportAthleteId: string | null;
}

export interface Guardian {
  userId: string;
  email: string;
  guardianName: string | null;
  athletes: GuardianAthlete[];
}

/**
 * Verifies the bearer token, then loads exactly the athletes this
 * address is guardian of. Returns null for anonymous/invalid tokens —
 * callers answer 401. An authenticated address with no athletes returns
 * a Guardian with an empty list, which is a different state (a signed-in
 * parent whose record is not linked yet) and renders differently.
 */
export async function resolveGuardian(request: Request): Promise<Guardian | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const supabase = adminClient();
  let user: { id: string; email?: string } | null = null;
  try {
    const result = await supabase.auth.getUser(token);
    if (result.error) return null;
    user = result.data.user;
  } catch {
    // A malformed JWT throws rather than erroring; still just anonymous.
    return null;
  }
  if (!user?.email) return null;

  const email = user.email.toLowerCase();

  // WITHDRAWN athletes are excluded: a closed record is not a portal
  // surface. DORMANT is included — a parent between programmes must
  // still reach their child's history, which is most of the retention
  // argument for the portal existing (§64, §65).
  const { data, error } = await supabase
    .from("bigice_athlete")
    .select(
      "biif_code, full_name, date_of_birth, primary_discipline, skating_level, status, portal_activated_at, passport_athlete_id, guardian_name",
    )
    .ilike("guardian_email", email)
    .neq("status", "WITHDRAWN")
    .order("created_at", { ascending: true });

  if (error) return { userId: user.id, email, guardianName: null, athletes: [] };

  const rows = data ?? [];
  return {
    userId: user.id,
    email,
    guardianName: (rows[0]?.guardian_name as string | null) ?? null,
    athletes: rows.map((r) => ({
      biifCode: String(r.biif_code),
      fullName: String(r.full_name),
      dateOfBirth: (r.date_of_birth as string | null) ?? null,
      primaryDiscipline: (r.primary_discipline as string | null) ?? null,
      skatingLevel: (r.skating_level as string | null) ?? null,
      status: String(r.status),
      portalActivatedAt: (r.portal_activated_at as string | null) ?? null,
      passportAthleteId: (r.passport_athlete_id as string | null) ?? null,
    })),
  };
}
