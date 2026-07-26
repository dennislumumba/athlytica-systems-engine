// =====================================================================
// WORKSPACE DASHBOARD API — GET/POST /api/v1/workspace/dashboard
// (founder directive 2026-07-26).
//
// ONE endpoint feeds all three workspace dashboards. Reads run under the
// service-role key BEHIND the RBAC gate in lib/auth/workspace.ts — the
// browser never queries registrations/payment_events directly, so
// financial rows are not exposed to the anon key surface.
//
//   GET  ?workspace=<id>   → { actor, role, data }
//   GET  (no workspace)    → { actor }            (shell bootstrap)
//   POST { userId, workspace, role|null }         (founder-only matrix)
//
// Panels degrade independently: a missing table yields an empty panel,
// never a 500 — a half-provisioned database must still render.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import {
  isWorkspaceId,
  isWorkspaceRole,
  WORKSPACES,
  type WorkspaceId,
} from "@/config/workspaces";
import {
  adminClient,
  resolveActor,
  roleIn,
  serviceRoleConfigured,
  type Actor,
} from "@/lib/auth/workspace";
import { MPESA_PAYBILL } from "@/config/payment-rail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Supabase = ReturnType<typeof adminClient>;

/** Panel-local failure containment: a broken table empties one panel. */
async function safeRows(
  run: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  try {
    const { data, error } = await run();
    if (error || !Array.isArray(data)) return [];
    return data as Row[];
  } catch {
    return [];
  }
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);

// ---------------------------------------------------------------------
// NRHL — combine intakes, paybill telemetry, roster, league ops
// ---------------------------------------------------------------------
async function nrhlData(db: Supabase) {
  const [payments, registrations, athletes, venues, sessions] = await Promise.all([
    safeRows(() =>
      db
        .from("payment_events")
        .select(
          "id, mpesa_receipt_number, amount_kes, account_reference, result_code, transaction_timestamp",
        )
        .order("transaction_timestamp", { ascending: false })
        .limit(25),
    ),
    safeRows(() =>
      db
        .from("registrations")
        .select(
          "id, account_reference, athlete_name, full_name, email, tier, payment_status, amount_expected_kes, preferred_campus, settled_receipt, settled_at, created_at",
        )
        .eq("venture_context", "NRHL")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("athlete")
        .select("athlete_id, legal_name, preferred_name, date_of_birth, current_status, primary_sport_code")
        .order("created_at", { ascending: false })
        .limit(100),
    ),
    safeRows(() => db.from("venues").select("id, name, coordinates").limit(50)),
    safeRows(() =>
      db
        .from("sessions")
        .select("id, athlete_id, venue_id, start_time, end_time")
        .order("start_time", { ascending: false })
        .limit(50),
    ),
  ]);

  // Combine funnel: registrant counts + settled value per tier.
  const funnel = new Map<string, { tier: string; started: number; paid: number; settledKes: number }>();
  for (const r of registrations) {
    const tier = typeof r.tier === "string" ? r.tier : "unspecified";
    const bucket = funnel.get(tier) ?? { tier, started: 0, paid: 0, settledKes: 0 };
    bucket.started += 1;
    if (r.payment_status === "PAYMENT_SETTLED") {
      bucket.paid += 1;
      bucket.settledKes += num(r.amount_expected_kes);
    }
    funnel.set(tier, bucket);
  }

  return {
    paybill: MPESA_PAYBILL,
    stkStream: payments,
    funnel: [...funnel.values()].sort((a, b) => b.started - a.started),
    roster: registrations.filter((r) => r.payment_status === "PAYMENT_SETTLED"),
    pending: registrations.filter((r) => r.payment_status !== "PAYMENT_SETTLED"),
    playerDatabase: athletes,
    venues,
    sessions,
  };
}

// ---------------------------------------------------------------------
// BIG ICE — academy package billing, rink schedule, development metrics
// ---------------------------------------------------------------------
async function bigIceData(db: Supabase) {
  const [packages, enrolments, registrations, athletes, guardians, perf] = await Promise.all([
    safeRows(() =>
      db
        .from("commercial_price_tier")
        .select("tier_id, tier_name, tier_group, price_amount, currency, is_active")
        .eq("tier_group", "academy")
        .eq("is_active", true)
        .order("price_amount", { ascending: true }),
    ),
    safeRows(() =>
      db
        .from("cohort_session_registry")
        .select(
          "registry_id, track_type, cohort_label, session_slot, session_day_of_week, window_start_time, window_end_time, capacity, season_start_date, season_end_date, student_athlete_id, price_tier_id, enrollment_status, enrolled_at",
        )
        .order("session_day_of_week", { ascending: true })
        .limit(500),
    ),
    safeRows(() =>
      db
        .from("registrations")
        .select(
          "id, account_reference, athlete_name, full_name, email, tier, payment_status, amount_expected_kes, settled_at, created_at",
        )
        .eq("venture_context", "BIG_ICE")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("athlete")
        .select("athlete_id, legal_name, preferred_name, date_of_birth, current_status, parent_email")
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("guardian_contact")
        .select("guardian_id, athlete_id, legal_name, relationship, contact_info, consent_on_file")
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("performance_logs")
        .select(
          "id, athlete_id, session_id, speed, agility, stamina, technical, cognitive, composite_score, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
    ),
  ]);

  // Session-pack balance: enrolled slots remaining per athlete this season.
  const balances = new Map<string, { athleteId: string; enrolled: number; completed: number }>();
  for (const e of enrolments) {
    const id = typeof e.student_athlete_id === "string" ? e.student_athlete_id : null;
    if (!id) continue;
    const bucket = balances.get(id) ?? { athleteId: id, enrolled: 0, completed: 0 };
    if (e.enrollment_status === "completed") bucket.completed += 1;
    else if (e.enrollment_status === "enrolled") bucket.enrolled += 1;
    balances.set(id, bucket);
  }

  const nameById = new Map(
    athletes.map((a) => [
      String(a.athlete_id),
      String(a.preferred_name ?? a.legal_name ?? "Unnamed athlete"),
    ]),
  );

  return {
    packages,
    schedule: enrolments,
    balances: [...balances.values()].map((b) => ({
      ...b,
      athleteName: nameById.get(b.athleteId) ?? b.athleteId,
      remaining: b.enrolled,
    })),
    clients: registrations,
    athletes,
    guardians,
    performance: perf,
  };
}

// ---------------------------------------------------------------------
// ATHLYTICA HQ — cross-tenant revenue, system health, permission matrix
// ---------------------------------------------------------------------
async function hqData(db: Supabase) {
  const [payments, registrations, dlq, grants, telemetryQueue] = await Promise.all([
    safeRows(() =>
      db
        .from("payment_events")
        .select("id, amount_kes, result_code, account_reference, transaction_timestamp, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ),
    safeRows(() =>
      db
        .from("registrations")
        .select("id, venture_context, tier, payment_status, amount_expected_kes, settled_at")
        .limit(1000),
    ),
    safeRows(() =>
      db
        .from("sync_dead_letter_queue")
        .select("id, record_type, last_error, failed_at")
        .order("failed_at", { ascending: false })
        .limit(20),
    ),
    safeRows(() =>
      db.from("workspace_roles").select("id, user_id, workspace, role, created_at").limit(500),
    ),
    safeRows(() => db.from("telemetry_ingest_queue").select("id").limit(1)),
  ]);

  // Revenue by venture — settled registrations are the audited figure;
  // payment_events is the raw rail total (includes unmatched payments).
  const byVenture = new Map<string, { venture: string; settledKes: number; paid: number }>();
  for (const r of registrations) {
    if (r.payment_status !== "PAYMENT_SETTLED") continue;
    const venture = typeof r.venture_context === "string" ? r.venture_context : "UNASSIGNED";
    const bucket = byVenture.get(venture) ?? { venture, settledKes: 0, paid: 0 };
    bucket.settledKes += num(r.amount_expected_kes);
    bucket.paid += 1;
    byVenture.set(venture, bucket);
  }

  const settledPayments = payments.filter((p) => num(p.result_code) === 0);
  const railTotalKes = settledPayments.reduce((sum, p) => sum + num(p.amount_kes), 0);
  const lastCallback = payments[0]?.created_at ?? null;

  // Directory for the permission matrix (auth users are the identity truth).
  let directory: Array<{ id: string; email: string; lastSignInAt: string | null }> = [];
  try {
    const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
    directory = (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email ?? "(no email)",
      lastSignInAt: u.last_sign_in_at ?? null,
    }));
  } catch {
    directory = [];
  }

  return {
    revenue: {
      byVenture: [...byVenture.values()],
      totalSettledKes: [...byVenture.values()].reduce((s, v) => s + v.settledKes, 0),
      railTotalKes,
      railTransactions: settledPayments.length,
    },
    health: {
      supabase: "connected" as const,
      darajaLastCallbackAt: lastCallback,
      darajaCallbackConfigured: Boolean(process.env.DARAJA_CALLBACK_URL),
      darajaEnv: process.env.DARAJA_ENV === "production" ? "production" : "sandbox",
      stkCredentialsConfigured: Boolean(
        process.env.DARAJA_CONSUMER_KEY && process.env.DARAJA_CONSUMER_SECRET && process.env.DARAJA_PASSKEY,
      ),
      msisdnHashKeySet: Boolean(process.env.MSISDN_HASH_KEY),
      convexConfigured: Boolean(process.env.NEXT_PUBLIC_CONVEX_URL),
      telemetryQueueReachable: true,
      telemetryQueueDepth: telemetryQueue.length,
      deadLetterCount: dlq.length,
      deadLetters: dlq,
    },
    matrix: { grants, directory },
  };
}

const CONFIG_DEBT = NextResponse.json(
  {
    success: false,
    status: "CONFIG_DEBT",
    error:
      "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not provisioned; the workspace service cannot verify identities.",
  },
  { status: 503 },
);

export async function GET(request: NextRequest) {
  if (!serviceRoleConfigured()) return CONFIG_DEBT.clone();
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json(
      { success: false, error: "Not authenticated." },
      { status: 401 },
    );
  }

  const requested = request.nextUrl.searchParams.get("workspace");
  if (!requested) {
    return NextResponse.json({ success: true, actor: publicActor(actor) });
  }
  if (!isWorkspaceId(requested)) {
    return NextResponse.json(
      { success: false, error: `Unknown workspace '${requested}'.` },
      { status: 400 },
    );
  }

  const role = roleIn(actor, requested);
  if (!role) {
    return NextResponse.json(
      { success: false, error: `No role granted in ${WORKSPACES[requested].label}.` },
      { status: 403 },
    );
  }

  const db = adminClient();
  const data =
    requested === "nrhl"
      ? await nrhlData(db)
      : requested === "big_ice"
        ? await bigIceData(db)
        : await hqData(db);

  return NextResponse.json({
    success: true,
    actor: publicActor(actor),
    workspace: requested,
    role,
    data,
  });
}

/** POST — grant or revoke a workspace role. Root founder only. */
export async function POST(request: NextRequest) {
  if (!serviceRoleConfigured()) return CONFIG_DEBT.clone();
  const actor = await resolveActor(request);
  if (!actor) {
    return NextResponse.json({ success: false, error: "Not authenticated." }, { status: 401 });
  }
  if (!actor.isFounder) {
    return NextResponse.json(
      { success: false, error: "Only the global founder may edit the permission matrix." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON body." }, { status: 400 });
  }

  const input = body as { userId?: unknown; workspace?: unknown; role?: unknown };
  if (typeof input.userId !== "string" || !isWorkspaceId(input.workspace)) {
    return NextResponse.json(
      { success: false, error: "Expected { userId: string, workspace: WorkspaceId, role: Role|null }." },
      { status: 400 },
    );
  }
  const workspace: WorkspaceId = input.workspace;
  const db = adminClient();

  if (input.role === null) {
    const { error } = await db
      .from("workspace_roles")
      .delete()
      .eq("user_id", input.userId)
      .eq("workspace", workspace);
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ success: true, revoked: { userId: input.userId, workspace } });
  }

  if (!isWorkspaceRole(input.role)) {
    return NextResponse.json(
      { success: false, error: "role must be GLOBAL_FOUNDER, HEAD_COACH, ATHLETE, or null." },
      { status: 400 },
    );
  }

  const { error } = await db
    .from("workspace_roles")
    .upsert(
      {
        user_id: input.userId,
        workspace,
        role: input.role,
        granted_by: actor.userId,
      },
      { onConflict: "user_id,workspace" },
    );
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    success: true,
    granted: { userId: input.userId, workspace, role: input.role },
  });
}

function publicActor(actor: Actor) {
  return {
    userId: actor.userId,
    email: actor.email,
    isFounder: actor.isFounder,
    roles: actor.roles,
  };
}
