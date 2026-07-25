// =====================================================================
// CONVEX BRIDGE — OUTBOUND GATEWAY CONTROLLER
//
// POST /api/v1/sync/convex
//
// Internal webhook gateway: Supabase trigger executions (pg_net /
// database webhooks) POST row-change payloads here. The route:
//   1. Verifies HMAC-SHA256 over the RAW body (X-Signature header,
//      GOOGLE_FORMS_WEBHOOK_SECRET) — first operation, timing-safe,
//      identical discipline to app/api/v1/onboarding/google-forms.
//   2. Validates + adapts the payload via lib/converters/convexAdapter.
//   3. Dispatches to lib/sync/convexSyncQueue (non-blocking; retries
//      and dead-lettering happen off the request path).
//
// Runtime is nodejs (NOT edge): the sync queue is a module-singleton
// with a background drain loop that must outlive the response.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adaptRecordForConvex } from "@/lib/converters/convexAdapter";
import { enqueueSyncJob, getSyncQueueStats } from "@/lib/sync/convexSyncQueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------
// Payload contract — Supabase trigger webhook shape
// ---------------------------------------------------------------------

const SyncEventSchema = z
  .object({
    recordType: z.enum(["athlete", "metric"]),
    /** Raw Postgres row (NEW) forwarded by the trigger. */
    record: z.record(z.string(), z.unknown()),
    /** Optional trigger metadata — accepted, not required. */
    table: z.string().trim().max(128).optional(),
    operation: z.enum(["INSERT", "UPDATE"]).optional(),
  })
  .strict();

// ---------------------------------------------------------------------
// HMAC verification (mirrors the ratified google-forms pattern)
// ---------------------------------------------------------------------

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function computeHmacSha256Hex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(body));
  return toHex(mac);
}

function log(
  level: "info" | "warn" | "error",
  requestId: string,
  msg: string,
  extra?: Record<string, unknown>
) {
  const line = JSON.stringify({ scope: "sync/convex", requestId, level, msg, ...extra });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ---------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const requestId = globalThis.crypto.randomUUID();

  const secret = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
  if (!secret) {
    log("error", requestId, "GOOGLE_FORMS_WEBHOOK_SECRET unset — surface sealed");
    return NextResponse.json(
      { error: "sync gateway not configured", requestId },
      { status: 503 }
    );
  }

  // 1. Signature check BEFORE any parsing or database work.
  const rawBody = await req.text();
  const signature = req.headers.get("x-signature") ?? "";
  const expected = await computeHmacSha256Hex(secret, rawBody);

  if (!signature || !timingSafeEqualHex(signature.toLowerCase(), expected)) {
    log("warn", requestId, "signature verification failed");
    return NextResponse.json({ error: "invalid signature", requestId }, { status: 401 });
  }

  // 2. Parse + validate.
  let parsed: z.infer<typeof SyncEventSchema>;
  try {
    parsed = SyncEventSchema.parse(JSON.parse(rawBody));
  } catch (err: unknown) {
    log("warn", requestId, "payload rejected", {
      reason: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "malformed sync event", requestId }, { status: 400 });
  }

  // 3. Adapt Postgres row → Convex document.
  let document;
  try {
    document = adaptRecordForConvex(parsed.recordType, parsed.record);
  } catch (err: unknown) {
    const reason = err instanceof Error ? err.message : String(err);
    log("error", requestId, "adapter rejected record", { reason });
    return NextResponse.json(
      { error: "record failed convex adaptation", detail: reason, requestId },
      { status: 422 }
    );
  }

  // 4. Enqueue — retries + dead-lettering happen off the request path.
  const job = enqueueSyncJob({
    recordType: parsed.recordType,
    document,
    rawPayload: parsed.record,
  });

  log("info", requestId, "sync job accepted", {
    jobId: job.jobId,
    recordType: parsed.recordType,
  });

  return NextResponse.json(
    {
      accepted: true,
      jobId: job.jobId,
      recordType: parsed.recordType,
      queue: getSyncQueueStats(),
      requestId,
    },
    { status: 202 }
  );
}
