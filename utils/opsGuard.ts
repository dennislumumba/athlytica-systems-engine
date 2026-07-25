// =====================================================================
// OPS-TOKEN GUARD — shared authorization for internal operator surfaces
// (.agentic-os/05_CORPORATE_SKILLS.md §2; security doctrine 02 §laws)
//
// Model: shared secrets presented via request headers, checked against
// env vars. This guards founder/ops surfaces and machine-rail callbacks
// — it is NOT the tenant barrier and must never gate athlete-scoped
// data (that remains the athlete_tenant_links barrier, 02 §2).
//
// FAIL-CLOSED LAW: if the expected env secret is unset (or trivially
// short), every guarded route returns 403. Deploying without the secret
// disables the surface; it never opens it.
//
// Comparison is performed on SHA-256 digests so equality checking does
// not leak secret length/prefix timing.
//
// LAW (mirrors utils/analyticsEngine.ts): single implementation.
// Never fork per-route copies of this guard.
// =====================================================================

import type { NextRequest } from "next/server";

const OPS_TOKEN_HEADER = "x-ops-token";

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generic fail-closed shared-secret header check. Returns true only when
 * the named env secret exists (>= 16 chars) AND the caller presented a
 * matching header. Missing env, missing header, mismatch -> false.
 */
export async function verifySecretHeader(
  request: NextRequest,
  headerName: string,
  envVar: string,
): Promise<boolean> {
  const expected = process.env[envVar];
  if (!expected || expected.length < 16) {
    // Unset or trivially short secret: surface stays sealed (SKL-003).
    return false;
  }
  const presented = request.headers.get(headerName);
  if (!presented) return false;

  const [a, b] = await Promise.all([sha256Hex(expected), sha256Hex(presented)]);
  return a === b;
}

/**
 * Founder/ops surfaces: X-Ops-Token vs OPS_CONSOLE_TOKEN. Fail closed.
 */
export async function verifyOpsToken(request: NextRequest): Promise<boolean> {
  return verifySecretHeader(request, OPS_TOKEN_HEADER, "OPS_CONSOLE_TOKEN");
}
