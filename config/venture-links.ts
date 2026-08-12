// =====================================================================
// CROSS-VENTURE DESTINATIONS — one place, because there were four.
//
// Big Ice and NRHL are separate customer journeys that point at each
// other. Every one of those pointers was previously written inline, and
// they had already drifted: bigice.co.ke's hockey CTAs pointed at
// `nairobihockey.com/register?tier=…&source=bigice`, and `source=bigice`
// is precisely the flag /register uses to redirect a visitor AWAY from
// the NRHL registration dashboard and into the academy checkout. A
// parent clicking "NRHL · Athlete Performance Assessment" on the Big Ice
// site never reached NRHL at all.
//
// So the destinations live here, once, and the Big Ice upsell links to
// NRHL_REGISTRATION_URL — never to a hand-built query string.
//
// OVERRIDABLE, because these are deployment facts rather than product
// facts. The NEXT_PUBLIC_ prefix is load-bearing: the checkout pages are
// client components, and Next only inlines prefixed variables into the
// browser bundle. An unset variable falls back to the live address
// rather than to nothing — a missing env var must not render a dead CTA
// on a marketing page.
// =====================================================================

/**
 * The NRHL athlete registration dashboard — the three-programme funnel
 * at app/register. Served to parents through nairobihockey.com, whose
 * vercel.json proxies /register to this app.
 *
 * Deliberately carries NO query string. `?source=` and `?tier=` are the
 * funnel's own parameters; a link that hard-codes them is a link that
 * silently redirects somewhere else when their meaning changes, which is
 * exactly what happened.
 */
export const NRHL_REGISTRATION_URL =
  process.env.NEXT_PUBLIC_NRHL_REGISTRATION_URL ?? "https://www.nairobihockey.com/register";

/** Big Ice academy registration — Big Ice packages only. */
export const BIG_ICE_REGISTRATION_URL =
  process.env.NEXT_PUBLIC_BIG_ICE_REGISTRATION_URL ?? "https://www.bigice.co.ke/register";

/** The Big Ice marketing site a parent arrived from. */
export const BIG_ICE_SITE_URL =
  process.env.NEXT_PUBLIC_BIG_ICE_SITE_URL ?? "https://www.bigice.co.ke";

/**
 * Parent portal root. Server-side callers (bigice-delivery.ts) read
 * PORTAL_BASE_URL directly and OMIT the portal document when it is
 * unset, because a welcome pack containing a guessed sign-in address is
 * a parent typing a dead URL on their first evening. This constant is
 * the client-side equivalent and is allowed a default, because a link on
 * a page the parent is already looking at can be corrected by going back.
 */
export const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL ?? `${BIG_ICE_SITE_URL}/portal`;

/** Big Ice admissions, for every "talk to a human" exit. */
export const BIG_ICE_ADMISSIONS = {
  phoneDisplay: "+254 724 324 529",
  whatsapp: "254724324529",
  email: "dennis@bigice.co.ke",
} as const;
