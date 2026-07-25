// =====================================================================
// DARAJA STK PUSH CLIENT — payment gateway utility (G-W6-PAY)
// Rail: M-Pesa Paybill 4325935 (Athlytica Technologies Limited) (config/payment-rail.ts)
//
// DISPATCH POSTURE — FAIL SOFT, NEVER FAIL THE FUNNEL:
// The STK push is an acceleration, not the settlement authority.
// Settlement truth arrives only through the callback route + RPC. If
// Daraja is unreachable/unconfigured, registration still succeeds and
// the registrant falls back to the manual Paybill instruction (4325935 +
// REG-<their phone>). Therefore this module returns a discriminated
// result instead of throwing.
//
// ENV (server-only):
//   DARAJA_CONSUMER_KEY / DARAJA_CONSUMER_SECRET — OAuth app credentials
//   DARAJA_PASSKEY                               — Lipa na M-Pesa online passkey
//   DARAJA_STK_SHORTCODE                         — business shortcode (defaults to Paybill 4325935)
//   DARAJA_CALLBACK_URL                          — public URL of /api/v1/biz/mpesa-callback
//   DARAJA_ENV                                   — "production" | anything-else => sandbox
//
// PII: the MSISDN is transmitted to Safaricom (the party that owns it)
// and never persisted or logged by this module.
// =====================================================================

import { MPESA_PAYBILL } from "@/config/payment-rail";

const REQUEST_TIMEOUT_MS = 10_000;

export type StkDispatchResult =
  | { dispatched: true; merchantRequestId: string | null; checkoutRequestId: string | null }
  | { dispatched: false; reason: string };

type DarajaConfig = {
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
  shortcode: string;
  callbackUrl: string;
  baseUrl: string;
};

function readConfig(): DarajaConfig | null {
  const consumerKey = process.env.DARAJA_CONSUMER_KEY;
  const consumerSecret = process.env.DARAJA_CONSUMER_SECRET;
  const passkey = process.env.DARAJA_PASSKEY;
  const callbackUrl = process.env.DARAJA_CALLBACK_URL;
  if (!consumerKey || !consumerSecret || !passkey || !callbackUrl) return null;

  return {
    consumerKey,
    consumerSecret,
    passkey,
    shortcode: process.env.DARAJA_STK_SHORTCODE || MPESA_PAYBILL,
    callbackUrl,
    baseUrl:
      process.env.DARAJA_ENV === "production"
        ? "https://api.safaricom.co.ke"
        : "https://sandbox.safaricom.co.ke",
  };
}

/** Daraja timestamp: YYYYMMDDHHmmss in Africa/Nairobi (UTC+3, no DST). */
function darajaTimestamp(now = new Date()): string {
  const nairobi = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${nairobi.getUTCFullYear()}${pad(nairobi.getUTCMonth() + 1)}${pad(nairobi.getUTCDate())}` +
    `${pad(nairobi.getUTCHours())}${pad(nairobi.getUTCMinutes())}${pad(nairobi.getUTCSeconds())}`
  );
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(config: DarajaConfig): Promise<string | null> {
  const basic =
    typeof btoa === "function"
      ? btoa(`${config.consumerKey}:${config.consumerSecret}`)
      : Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");

  const res = await fetchWithTimeout(
    `${config.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
    { method: "GET", headers: { Authorization: `Basic ${basic}` } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token ?? null;
}

/**
 * Dispatch an M-Pesa STK push to the registrant's handset.
 *
 * @param amountKes         expected fee (server-derived, whole KES >= 1)
 * @param msisdn            normalized 254XXXXXXXXX (utils/msisdn.ts)
 * @param accountReference  deterministic tracking string. Daraja caps
 *                          AccountReference at 12 chars — truncated here.
 *                          Matching does NOT depend on it: STK callbacks
 *                          are resolved via the transaction MSISDN hash.
 */
export async function initiateStkPush(params: {
  amountKes: number;
  msisdn: string;
  accountReference: string;
  description?: string;
}): Promise<StkDispatchResult> {
  const config = readConfig();
  if (!config) {
    return {
      dispatched: false,
      reason:
        "CONFIG_DEBT: Daraja credentials not provisioned (DARAJA_CONSUMER_KEY/SECRET/PASSKEY/CALLBACK_URL). Manual Paybill fallback remains live.",
    };
  }

  try {
    const token = await getAccessToken(config);
    if (!token) {
      return { dispatched: false, reason: "Daraja OAuth token acquisition failed." };
    }

    const timestamp = darajaTimestamp();
    const rawPassword = `${config.shortcode}${config.passkey}${timestamp}`;
    const password =
      typeof btoa === "function" ? btoa(rawPassword) : Buffer.from(rawPassword).toString("base64");

    const res = await fetchWithTimeout(`${config.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        BusinessShortCode: config.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.max(1, Math.round(params.amountKes)),
        PartyA: params.msisdn,
        PartyB: config.shortcode,
        PhoneNumber: params.msisdn,
        CallBackURL: config.callbackUrl,
        AccountReference: params.accountReference.slice(0, 12),
        TransactionDesc: (params.description ?? "Registration fee").slice(0, 13),
      }),
    });

    const body = (await res.json().catch(() => ({}))) as {
      ResponseCode?: string;
      MerchantRequestID?: string;
      CheckoutRequestID?: string;
      errorMessage?: string;
    };

    if (!res.ok || body.ResponseCode !== "0") {
      return {
        dispatched: false,
        reason: body.errorMessage ?? `Daraja STK request rejected (HTTP ${res.status}).`,
      };
    }

    return {
      dispatched: true,
      merchantRequestId: body.MerchantRequestID ?? null,
      checkoutRequestId: body.CheckoutRequestID ?? null,
    };
  } catch {
    return { dispatched: false, reason: "Daraja request failed or timed out." };
  }
}
