# nairobihockey.com × Athlytica HQ — integration bundle

Two files that turn the static NRHL site into a live front end for Athlytica HQ:
brand/taxonomy sections, live standings and leaderboard, public passport
verification, and an M-Pesa checkout.

> **Status: installed.** The bundle is already wired into the live site repo at
> `C:\Users\User Profile\NRHL-Site` — 3 new files plus a 14-line additive edit to
> `index.html` (two tags, six mount points, nothing removed). It is **not committed
> and not pushed**; a push to that repo triggers a Vercel deploy, which is your call.

## What was found before building

`nairobihockey.com` is **one static `index.html` (42 KB) + `style.css` + `main.js`** in
the `nrhl-site` Vercel project (repo `C:\Users\User Profile\NRHL-Site`). No
`package.json`, no build step, no server-side code of its own — but its `vercel.json`
already rewrites `/api/v1/:path*`, `/register` and `/_next/:path*` to
`athlytica-systems-engine.vercel.app`. That rewrite is the whole integration story:
the browser calls **same-origin `/api/v1/...`** and Vercel proxies it to the engine, so
there is no CORS, no API host to configure, and no key in client-side JS.

Three things in the original brief assume otherwise:

| Brief asks for | Reality | What was built instead |
|---|---|---|
| React components (`StandingsWidget.tsx` etc.) | No bundler, no React, no build | Same three widgets in vanilla JS. The data contract is identical, so they port to components unchanged if the site becomes a Next app. |
| Next.js `revalidate` / SWR caching | Not a Next app | Caching moved to the API: `s-maxage=300, stale-while-revalidate=600` on the public feed. Same effect, works on any host. |
| A webhook handler at `/api/webhooks/payments` on this site | A static host cannot run a handler or hold a secret | The handler lives in Athlytica HQ at `/api/v1/workspaces/nrhl/onboard-paid-athlete` — the path the brief itself names as the destination. |

**No second payment gateway was added, deliberately.** Athlytica HQ already owns the
rail: STK push, the Daraja settlement callback, HMAC-hashed MSISDNs, the idempotent
settlement RPC, and the reconciliation ledger. A Paystack or Flutterwave key in
client-side JS on a static host is a published secret, and a second gateway means two
competing answers to "who paid". Checkout posts to HQ; HQ stays authoritative. Card
payments belong on the same HQ route when a card processor is added there — one rail,
one ledger.

## Install (already applied — recorded here for the next site)

Add two tags to `index.html`:

```html
<link rel="stylesheet" href="nrhl-athlytica.css">
<script defer src="nrhl-athlytica.js"></script>
```

Then drop mount points wherever the content belongs. Every one is optional — an
omitted mount simply does not render.

```html
<div data-nrhl="pillars"></div>      <!-- the five-pillar taxonomy -->
<div data-nrhl="timeline"></div>     <!-- Aug–Oct 2026 → Jan 2027 -->
<div data-nrhl="packages"></div>     <!-- Tier 1 / Tier 2 + checkout -->
<div data-nrhl="standings"></div>    <!-- live division standings -->
<div data-nrhl="leaderboard"></div>  <!-- top performers -->
<div data-nrhl="verify"></div>       <!-- passport lookup -->
```

As installed: `pillars` at the end of `#roi`, `timeline` at the end of the `#timeline`
panel, `standings` and `leaderboard` at the end of `#conferences`, `packages` and
`verify` at the end of `#faq`. Each is a single `<div>` — move one line to relocate a
widget.

The script also repairs the dead countdown in `main.js` — it hardcodes
`2026-05-04` and has been rendering the permanent string "Open" against a window
that closed. It now counts down to the January 2027 opening matchday. You can delete
that block from `main.js` once this bundle is live.

## Endpoints it calls

All same-origin, resolved through the existing `vercel.json` rewrite.

| Purpose | Endpoint | Auth |
|---|---|---|
| Standings, leaderboard, phases, tier prices | `GET /api/v1/public/nrhl` | none, cached 5 min |
| Passport verification | `GET /api/v1/public/nrhl/verify?code=ATH-00047` | none |
| Checkout / STK push | `POST /api/v1/biz/stk-push` | none (public funnel, server-priced) |
| Paid-athlete onboarding | `POST /api/v1/workspaces/nrhl/onboard-paid-athlete` | HMAC, server-to-server only |

The two public read endpoints also send permissive CORS headers, so they work from a
different origin during local testing. Append `?api=http://localhost:3000/api/v1` to
any page URL to point the widgets at a local engine — that is how this bundle was
verified. `preview.html` is a standalone review harness for the same purpose; it is
not part of the site and can be deleted before deploying.

## Environment variables

All of these live on **Athlytica HQ**, not on this site. A static site holds no
secrets.

| Variable | Purpose |
|---|---|
| `DARAJA_CONSUMER_KEY` / `DARAJA_CONSUMER_SECRET` / `DARAJA_PASSKEY` | M-Pesa STK push (already provisioned) |
| `MPESA_CALLBACK_SECRET` | Authenticates Safaricom's settlement callback (already provisioned) |
| `MSISDN_HASH_KEY` | HMAC key so raw phone numbers never persist (already provisioned) |
| `NRHL_WEBHOOK_SECRET` | **New.** HMAC key for the onboarding webhook. Unset = the route is sealed at 503, never open. |

The brief also lists `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `PAYSTACK_SECRET_KEY`
and `ATHLYTICA_API_KEY`. The first two already exist under the `DARAJA_*` names;
`PAYSTACK_SECRET_KEY` is not needed unless a card processor is added to HQ; and the
public read endpoints are intentionally keyless, so `ATHLYTICA_API_KEY` has nothing to
authenticate — adding a key that ships in client-side JS would be theatre.

### Signing the onboarding webhook

HMAC-SHA256 over the **exact raw body bytes**, hex, in `X-Athlytica-Signature`:

```js
const signature = "sha256=" + crypto
  .createHmac("sha256", process.env.NRHL_WEBHOOK_SECRET)
  .update(rawBody)          // the bytes you send, not a re-serialised object
  .digest("hex");
```

Retries are safe: onboarding is idempotent on the athlete's canonical name, so a
replayed webhook returns the same `ATH-00xxx` code instead of minting a second
identity for one child — the exact failure that produced the `ATH-047` collision in
the legacy data.

## Privacy behaviour worth knowing about

These are minors, and the Performance Agreement makes the marketing release an
explicit "check one" that is never defaulted. So on every public surface:

- an athlete's **name** is published only where `consent_media = 'GRANTS'`;
- everyone else appears as their athlete code, and their **results still count** —
  dropping the row would distort the standings;
- the verification tool returns registration and clearance status only. No guardian
  name, phone, email, date of birth, conduct record, or performance figure crosses the
  public boundary.

The checkout collects the media election and the medical affirmation as required
fields, which the live web form does not — the digital funnel had been thinner than
the paper one it replaced.

## Not done here

- **Card / international payments.** Needs a processor on the HQ side first; wiring
  one into a static page would put a secret in the browser.
- **Rewriting the existing 40 KB of marketing copy.** The bundle adds the correct
  taxonomy, division names and timeline as new sections and repairs the countdown, but
  the older "Season 1 launches August 2026" copy in `index.html` and the page `<title>`
  still need a human editorial pass — that is brand voice, not code.
