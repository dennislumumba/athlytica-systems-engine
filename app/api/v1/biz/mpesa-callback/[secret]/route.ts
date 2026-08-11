// =====================================================================
// DARAJA SETTLEMENT CALLBACK — URL-authenticated entry point
// POST /api/v1/biz/mpesa-callback/<MPESA_CALLBACK_SECRET>
//
// WHY THIS EXISTS: Safaricom posts settlement to the callback URL
// registered with Daraja and cannot attach a custom header. The sibling
// route authenticates on `X-Callback-Secret`, which Safaricom will never
// send — so with only that route, a real payment would arrive, return
// 403, and the registration would never flip to PAYMENT_SETTLED. Money
// in, nothing recorded.
//
// So the URL carries the credential. Consequences, accepted knowingly:
//
//   * DARAJA_CALLBACK_URL IS A SECRET. Anyone holding it can post a
//     settlement claim. Treat it exactly like the key it contains — do
//     not paste it into a ticket, a screenshot or a commit.
//   * It is a PATH SEGMENT, not a query string: query strings are the
//     part of a URL that analytics, proxies and error trackers capture
//     most eagerly.
//   * Rotating MPESA_CALLBACK_SECRET changes this URL, so the Daraja
//     dashboard must be updated in the same breath or settlement stops.
//
// WHAT IT DOES NOT GRANT: machine rails only. MANUAL_RECON — which can
// settle an arbitrary registration — still requires the ops token, so a
// leaked callback URL cannot be used to mark anything paid at will. The
// worst it permits is a forged settlement for a receipt the forger has
// to guess, which the RPC's duplicate-receipt constraint then rejects.
// =====================================================================

import type { NextRequest } from "next/server";
import { settleFromRequest } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ secret: string }> },
) {
  const { secret } = await context.params;
  return settleFromRequest(request, secret);
}
