// =====================================================================
// BIG ICE PUBLIC PRICE SHEET — reads bigice.co.ke, never depends on it.
//
// bigice.co.ke is the customer-facing quote. This module pulls it so the
// Athlytica surfaces can show what a parent was actually quoted, and so
// drift between the public site and the charging table
// (public.commercial_price_tier) is visible rather than discovered at
// settlement.
//
// THREE LAWS, because this is a third-party network call on a render path:
//   1. It cannot hang        — AbortController, 1.5s, no exceptions.
//   2. It cannot throw       — every failure returns the fallback sheet.
//   3. It cannot set a price — nothing here reaches the STK rail. The
//      charge is still derived server-side from the tier table
//      (see app/api/v1/biz/stk-push), which is the only place a number
//      may become money. This module is display and reconciliation only.
//
// The parse targets the enquiry form's "Preferred programme" <select>,
// which carries every cohort with stable slugs — the most
// machine-readable block on the page, and the one the site's own README
// marks as a contract. (Before 2026-08-11 this was the intake modal's
// cohort select; the modal was removed in the rebuild and the option
// list moved into the enquiry form, ids intact.) If the marketing site
// is restyled the regex misses, the fallback answers, and the landing
// page is none the wiser. That is the design, not a bug.
// =====================================================================

export interface BigIceTier {
  /** Stable slug from the site's intake form. */
  id: string;
  label: string;
  /** null = "Custom Quote", i.e. priced by conversation, not by table. */
  amountKes: number | null;
}

export interface BigIcePriceSheet {
  tiers: BigIceTier[];
  /** false when the fallback answered — surfaces are free to say so. */
  live: boolean;
  fetchedAt: string;
}

export const BIG_ICE_SOURCE_URL = "https://www.bigice.co.ke/";

const TIMEOUT_MS = 1_500;

/**
 * Last known-good sheet, verbatim from bigice.co.ke on 2026-08-11.
 * Update it when the site changes — a stale fallback is the one way
 * this module can quietly lie. `tests/bigice-pricing.test.mts` asserts
 * this list equals what the live markup parses to, so the fixture, this
 * array and bigice.co.ke's own <option> text move together or not at all.
 *
 * 2026-08-11: the site was re-architected around the customer's buying
 * journey (start → discipline → commitment). The IDS DID NOT MOVE — they
 * are the join key for `findPriceDrift` and are written into settled
 * rows — but the labels are now the ones a parent actually reads, and a
 * `beginner` cohort was added as the entry rung at KSh 16,500. Anything
 * that displays `label` shows the new names; anything that matches on
 * `id` is unaffected.
 *
 * 2026-08-12: the three `combine-*` options were REMOVED from the site.
 * They were NRHL products — Assessment 7,500, Performance 27,500, Elite
 * 45,000 — listed in Big Ice's own enquiry form, which merged two
 * organisations' catalogues at the point of purchase. NRHL is now an
 * upsell on bigice.co.ke that links to nairobihockey.com/register, and
 * this sheet is Big Ice programmes only.
 *
 * That drops the required option count from 8 to 5, and the count is
 * load-bearing: `fetchBigIcePricing` treats anything shorter than this
 * array as a partial scrape and falls back. Removing an option from the
 * site WITHOUT editing here would have been harmless (5 >= 5 fails, so
 * it falls back silently and forever); removing it here without editing
 * the site would too. `tests/bigice-pricing.test.mts` asserts this array
 * equals what the live markup parses to, which is what keeps the two
 * honest.
 */
export const FALLBACK_TIERS: readonly BigIceTier[] = [
  { id: "beginner", label: "Beginner Skating Programme", amountKes: 16_500 },
  { id: "quarter", label: "3-Month Development", amountKes: 95_000 },
  { id: "semi-annual", label: "6-Month Development", amountKes: 180_000 },
  { id: "annual", label: "12-Month Development", amountKes: 350_000 },
  { id: "family-estate", label: "Family & Estate Private Cohort", amountKes: null },
];

const OPTION_RE =
  /<option\s+value="([a-z0-9-]+)"\s*>([^<]*?)\s*—\s*(?:KSh|KSH|KES)?\s*([0-9,]+|Custom Quote)\s*<\/option>/gi;

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

/** Exported for the test: parsing is the part that can silently rot. */
export function parseBigIceTiers(html: string): BigIceTier[] {
  const tiers: BigIceTier[] = [];
  for (const m of html.matchAll(OPTION_RE)) {
    const [, id, rawLabel, rawAmount] = m;
    if (!id || !rawLabel || !rawAmount) continue;
    const digits = rawAmount.replace(/,/g, "");
    const amountKes = /^\d+$/.test(digits) ? Number(digits) : null;
    // A zero or negative price is a parse artefact, not a free programme.
    if (amountKes !== null && amountKes <= 0) continue;
    tiers.push({ id, label: decode(rawLabel), amountKes });
  }
  return tiers;
}

/**
 * Never throws, never hangs, always returns a usable sheet.
 *
 * Cached for an hour by the Next data cache: the public price list
 * changes a few times a year, and putting a third-party round trip on
 * every cold render of the landing page would be a self-inflicted
 * latency budget.
 */
export async function fetchBigIcePricing(): Promise<BigIcePriceSheet> {
  const fallback = (): BigIcePriceSheet => ({
    tiers: [...FALLBACK_TIERS],
    live: false,
    fetchedAt: new Date().toISOString(),
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(BIG_ICE_SOURCE_URL, {
      signal: controller.signal,
      headers: { accept: "text/html" },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return fallback();
    const tiers = parseBigIceTiers(await res.text());
    // A partial scrape is worse than no scrape: showing three of seven
    // cohorts looks authoritative and is wrong. Demand the full sheet.
    if (tiers.length < FALLBACK_TIERS.length) return fallback();
    return { tiers, live: true, fetchedAt: new Date().toISOString() };
  } catch {
    // Abort, DNS, TLS, socket, malformed body — all one outcome.
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reconciliation: which published prices disagree with what the rail
 * would actually charge. `charged` comes from commercial_price_tier.
 * Matching is by amount-bearing label rather than id, because the two
 * systems were named independently — an unmatched published tier is
 * reported as such rather than silently dropped.
 */
export interface PriceDrift {
  label: string;
  publishedKes: number;
  chargedKes: number | null;
}

/**
 * commercial_price_tier.tier_name → the cohort slug on bigice.co.ke.
 *
 * The join is by NAME, and that is the fragile link in reconciliation.
 * On 2026-08-11 the tier rows were renamed to match the rebuilt site
 * ("Quarterly" → "3-Month Development") and this map was not updated in
 * the same breath: every academy tier stopped matching, the charged map
 * came out empty, and `findPriceDrift` dutifully reported no drift.
 * Nothing errored. The founder's panel would have shown a clean bill of
 * health forever.
 *
 * It lives here rather than in the dashboard route so it can be tested
 * without pulling in `next/server` — the failure is invisible from the
 * outside, so it has to be reachable from a test.
 */
export const BIG_ICE_TIER_SLUGS: Readonly<Record<string, string>> = {
  "Beginner Skating Programme": "beginner",
  "3-Month Development": "quarter",
  "6-Month Development": "semi-annual",
  "12-Month Development": "annual",
};

/**
 * Charged prices keyed by the site's cohort slug, plus the tier names
 * that matched nothing. An unmapped tier is a BROKEN JOIN, not an
 * absence of drift, and the caller is expected to say so out loud.
 */
export function chargedBySlug(
  packages: readonly { tier_name?: unknown; price_amount?: unknown }[],
): { charged: Map<string, number>; unmapped: string[] } {
  const charged = new Map<string, number>();
  const unmapped: string[] = [];
  for (const p of packages) {
    const name = String(p.tier_name ?? "");
    const slug = BIG_ICE_TIER_SLUGS[name];
    if (!slug) {
      if (name) unmapped.push(name);
      continue;
    }
    const amount = Number(p.price_amount);
    // A zero or unparseable price is a data fault, not a free cohort —
    // letting it through would reconcile the published price against 0.
    if (Number.isFinite(amount) && amount > 0) charged.set(slug, amount);
  }
  return { charged, unmapped };
}

export function findPriceDrift(
  published: readonly BigIceTier[],
  charged: ReadonlyMap<string, number>,
): PriceDrift[] {
  const drift: PriceDrift[] = [];
  for (const tier of published) {
    if (tier.amountKes === null) continue;
    const chargedKes = charged.get(tier.id) ?? null;
    if (chargedKes === null || chargedKes === tier.amountKes) continue;
    drift.push({ label: tier.label, publishedKes: tier.amountKes, chargedKes });
  }
  return drift;
}
