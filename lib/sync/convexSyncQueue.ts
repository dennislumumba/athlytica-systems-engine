// =====================================================================
// CONVEX BRIDGE — RESILIENT SYNC QUEUE HANDLER
//
// Asynchronous outbound queue: Supabase write events → Convex HTTP
// endpoint. Failure policy:
//
//   attempt 1 ──fail──▶ backoff 500ms ──▶ attempt 2 ──fail──▶ 1s
//   ──▶ attempt 3 ──fail──▶ dead-letter row in
//   public.sync_dead_letter_queue (raw payload + error code preserved).
//
// 429 responses honor Retry-After when the server provides one.
// The queue is a strict in-process FIFO with a single drain loop, so
// dispatch order is preserved and the route handler never blocks on
// Convex latency (fire-and-forget with durable failure capture).
// =====================================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ConvexDocument, ConvexRecordType } from "@/lib/converters/convexAdapter";

// ---------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------

const DEFAULT_CONVEX_ENDPOINT =
  "https://outstanding-platypus-738.convex.site/api/sync-athlete";

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500; // 500ms → 1000ms → (dead-letter)
const REQUEST_TIMEOUT_MS = 10_000;

function convexEndpoint(): string {
  return process.env.CONVEX_SYNC_ENDPOINT?.trim() || DEFAULT_CONVEX_ENDPOINT;
}

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

export interface SyncJob {
  jobId: string;
  recordType: ConvexRecordType;
  document: ConvexDocument;
  /** Raw source payload preserved verbatim for the dead-letter queue. */
  rawPayload: unknown;
  enqueuedAt: string;
}

export interface SyncQueueStats {
  pending: number;
  inFlight: boolean;
  dispatched: number;
  deadLettered: number;
}

interface AttemptFailure {
  code: string;
  message: string;
  status?: number;
}

// ---------------------------------------------------------------------
// Supabase (service-role) client for dead-letter persistence
// ---------------------------------------------------------------------

let dlqClient: SupabaseClient | null = null;

function getDlqClient(): SupabaseClient | null {
  if (dlqClient) return dlqClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  dlqClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return dlqClient;
}

// ---------------------------------------------------------------------
// Queue state (module-singleton per server instance)
// ---------------------------------------------------------------------

const queue: SyncJob[] = [];
let draining = false;
let dispatchedCount = 0;
let deadLetterCount = 0;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function log(level: "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) {
  const line = JSON.stringify({ scope: "convexSyncQueue", level, msg, ...extra });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

// ---------------------------------------------------------------------
// Dispatch — single attempt against the Convex HTTP endpoint
// ---------------------------------------------------------------------

async function dispatchOnce(job: SyncJob): Promise<AttemptFailure | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(convexEndpoint(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recordType: job.recordType,
        document: job.document,
        idempotencyKey: job.jobId,
      }),
      signal: controller.signal,
    });

    if (res.ok) return null;

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) {
        await sleep(Math.min(retryAfter * 1000, 30_000));
      }
      return { code: "RATE_LIMITED", message: "Convex endpoint rate-limited (429)", status: 429 };
    }

    const bodyText = await res.text().catch(() => "");
    return {
      code: `HTTP_${res.status}`,
      message: `Convex endpoint returned ${res.status}: ${bodyText.slice(0, 500)}`,
      status: res.status,
    };
  } catch (err: unknown) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      code: aborted ? "TIMEOUT" : "NETWORK_UNREACHABLE",
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------
// Retry policy — 3 attempts, exponential backoff
// ---------------------------------------------------------------------

async function processJob(job: SyncJob): Promise<void> {
  let lastFailure: AttemptFailure | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    lastFailure = await dispatchOnce(job);

    if (!lastFailure) {
      dispatchedCount++;
      log("info", "job dispatched to Convex", { jobId: job.jobId, attempt });
      return;
    }

    log("warn", "dispatch attempt failed", {
      jobId: job.jobId,
      attempt,
      code: lastFailure.code,
    });

    if (attempt < MAX_ATTEMPTS) {
      // 500ms, 1000ms (+ up to 100ms jitter to avoid thundering herd)
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1) + Math.random() * 100);
    }
  }

  await deadLetter(job, lastFailure!);
}

// ---------------------------------------------------------------------
// Dead-letter persistence — public.sync_dead_letter_queue
// ---------------------------------------------------------------------

async function deadLetter(job: SyncJob, failure: AttemptFailure): Promise<void> {
  deadLetterCount++;
  const client = getDlqClient();

  const row = {
    record_type: job.recordType,
    payload: {
      jobId: job.jobId,
      document: job.document,
      raw: job.rawPayload,
      enqueuedAt: job.enqueuedAt,
    },
    last_error: `[${failure.code}] ${failure.message}`,
    failed_at: new Date().toISOString(),
  };

  if (!client) {
    // No credentials — never swallow data silently; emit the full row.
    log("error", "DLQ client unavailable — dumping payload to logs", { jobId: job.jobId, row });
    return;
  }

  const { error } = await client.from("sync_dead_letter_queue").insert(row);
  if (error) {
    log("error", "failed to persist dead-letter row", {
      jobId: job.jobId,
      dbError: error.message,
      row,
    });
  } else {
    log("warn", "job dead-lettered after max retries", {
      jobId: job.jobId,
      code: failure.code,
    });
  }
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/** Push a job onto the queue and kick the drain loop (non-blocking). */
export function enqueueSyncJob(input: {
  recordType: ConvexRecordType;
  document: ConvexDocument;
  rawPayload: unknown;
}): SyncJob {
  const job: SyncJob = {
    jobId: globalThis.crypto.randomUUID(),
    recordType: input.recordType,
    document: input.document,
    rawPayload: input.rawPayload,
    enqueuedAt: new Date().toISOString(),
  };

  queue.push(job);
  void drain();
  return job;
}

/** FIFO drain loop — one job in flight at a time, order preserved. */
async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift()!;
      await processJob(job);
    }
  } finally {
    draining = false;
  }
}

/** Await full queue drain — used by tests and graceful shutdown hooks. */
export async function flushSyncQueue(pollMs = 50): Promise<void> {
  while (queue.length > 0 || draining) {
    await sleep(pollMs);
  }
}

export function getSyncQueueStats(): SyncQueueStats {
  return {
    pending: queue.length,
    inFlight: draining,
    dispatched: dispatchedCount,
    deadLettered: deadLetterCount,
  };
}
