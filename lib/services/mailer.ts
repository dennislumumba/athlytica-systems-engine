// =====================================================================
// TRANSACTIONAL MAIL — one sender, provider behind an HTTP call.
//
// WHY NO SDK: Resend's send endpoint is a single JSON POST. An SDK to
// build one request body would be a dependency, a version to track and a
// bundle cost, for something `fetch` already does. If the provider ever
// changes, `send()` is the only function that knows.
//
// THREE LAWS, because this sits on the M-Pesa settlement path:
//   1. It cannot throw. A settled payment is durable before this runs;
//      an email failure must never unwind it or 500 the callback.
//   2. It cannot hang. Safaricom expects a prompt acknowledgement, so
//      the request is aborted well inside that budget.
//   3. It cannot lie. An unprovisioned key returns CONFIG_DEBT, never a
//      cheerful no-op — "we sent it" when nothing was sent is the one
//      outcome that costs a family their first session.
//
// PROVISIONING: RESEND_API_KEY and NRHL_MAIL_FROM. Unset = mail is
// disabled and every call reports it. The rest of the system keeps
// working: registration, payment and settlement do not depend on mail.
// =====================================================================

const SEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 5_000;

export interface MailAttachment {
  filename: string;
  /** UTF-8 document text; base64-encoded on the way out. */
  content: string;
}

export interface MailRequest {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  attachments?: MailAttachment[];
}

export type MailResult =
  | { sent: true; id: string | null }
  | { sent: false; reason: "CONFIG_DEBT" | "REJECTED" | "TIMEOUT" | "NETWORK"; detail: string };

export function mailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NRHL_MAIL_FROM);
}

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** Never throws. Every failure is a described, loggable result. */
export async function send(req: MailRequest): Promise<MailResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.NRHL_MAIL_FROM;
  if (!key || !from) {
    return {
      sent: false,
      reason: "CONFIG_DEBT",
      detail: "RESEND_API_KEY / NRHL_MAIL_FROM are not provisioned; mail is disabled.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        from,
        to: [req.to],
        subject: req.subject,
        html: req.html,
        ...(req.replyTo ? { reply_to: req.replyTo } : {}),
        ...(req.attachments?.length
          ? { attachments: req.attachments.map((a) => ({ filename: a.filename, content: b64(a.content) })) }
          : {}),
      }),
    });
    if (!res.ok) {
      // Body is the provider's own error; useful in a log, never shown.
      const detail = await res.text().catch(() => "");
      return { sent: false, reason: "REJECTED", detail: `${res.status} ${detail}`.trim() };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { sent: true, id: body.id ?? null };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      sent: false,
      reason: aborted ? "TIMEOUT" : "NETWORK",
      detail: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
