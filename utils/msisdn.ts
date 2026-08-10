// =====================================================================
// MSISDN IDENTITY UTILITIES — single implementation (opsGuard law:
// never fork per-route copies).
//
// DPA 2019 POSTURE: the raw MSISDN exists in-memory only. Every
// persistence path (registrations.msisdn_hash, payment_events
// .msisdn_hash / .account_reference) consumes the HMAC-SHA256 output or
// the canonical hash-derived reference produced here. The raw number is
// never stored, logged, or echoed to anyone but the registrant who
// submitted it in the same request.
//
// Consumed by:
//   * app/api/v1/auth/register/route.ts   (session creation + STK push)
//   * app/api/v1/biz/mpesa-callback/route.ts (resolution router)
// =====================================================================

// PROVISIONING — MSISDN_HASH_KEY (>= 16 chars, any random string):
//
//   NEVER ROTATE IT once a single registration exists. This is not only a
//   privacy hash — it is a LOOKUP key. `registrations.msisdn_hash` is how
//   the settlement callback matches a payment to a registration when the
//   payer mistypes the account field, and `account_reference` is derived
//   from the same digest. Change the key and every existing registration
//   becomes unmatchable: money still arrives, but it lands as
//   SETTLED_UNMATCHED and has to be reconciled by hand, forever.
//
//   For the same reason it must hold the SAME value in every Vercel
//   environment. A preview deployment with a different key computes a
//   different hash for the same phone, so a payment made through a preview
//   URL will not match the production row it belongs to.
//
//   Unset (or shorter than the bar below) seals /register and the
//   settlement callback at 503 rather than persisting a raw MSISDN.

/** Minimum viable HMAC key length — mirrors the callback's fail-closed bar. */
export const MSISDN_HASH_MIN_KEY_LENGTH = 16;

/** Fail-closed accessor: returns null unless a usable key is provisioned. */
export function getMsisdnHashKey(): string | null {
  const key = process.env.MSISDN_HASH_KEY;
  if (!key || key.length < MSISDN_HASH_MIN_KEY_LENGTH) return null;
  return key;
}

/**
 * Normalize any customer-entered Kenyan phone form to canonical
 * 254(1|7)XXXXXXXX. Accepts 07XX/01XX, +2547XX, 2547XX, 7XX/1XX bare
 * forms; strips spaces, dashes, parens. Returns null for anything that
 * is not a Kenyan mobile identity — callers must fail closed on null.
 */
export function normalizeKenyanMsisdn(raw: string): string | null {
  const digits = raw.replace(/[\s\-()+.]/g, "");
  if (/^254(1|7)\d{8}$/.test(digits)) return digits;
  if (/^0(1|7)\d{8}$/.test(digits)) return `254${digits.slice(1)}`;
  if (/^(1|7)\d{8}$/.test(digits)) return `254${digits}`;
  return null;
}

/** HMAC-SHA256 hex digest (WebCrypto — runs on nodejs and edge runtimes). */
export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Canonical persisted registration reference: hash-derived, phone-free.
 * 21 chars, well inside the 64-char account_reference bound. This is the
 * value written to registrations.account_reference and forwarded to the
 * settlement RPC — the raw "REG-<phone>" fallback string the registrant
 * types into M-Pesa is resolved to this form BEFORE persistence.
 */
export function canonicalRegistrationReference(msisdnHashHex: string): string {
  return `REG-#${msisdnHashHex.slice(0, 16)}`;
}

/**
 * RESOLUTION ROUTER (parse half): extract a phone identity from an
 * incoming account reference, if one is present.
 *   "REG-0712345678" / "REG254712345678" / "reg-+254712..." -> 2547XXXXXXXX
 *   bare MSISDN reference ("0712345678")                    -> 2547XXXXXXXX
 *   canonical "REG-#<hash16>" or legacy opaque refs         -> null
 * Null means: match on reference equality, not on phone identity.
 */
export function extractMsisdnFromReference(accountReference: string): string | null {
  const trimmed = accountReference.trim();
  const match = /^REG[-_ ]?(.+)$/i.exec(trimmed);
  const candidate = match?.[1] ?? trimmed;
  return normalizeKenyanMsisdn(candidate);
}
