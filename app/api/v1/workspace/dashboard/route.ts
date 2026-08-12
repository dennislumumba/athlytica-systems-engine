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
//   GET  ?scope=command    → { actor, modes, data }  (command canvas)
//   GET  (no workspace)    → { actor }            (shell bootstrap)
//   POST { userId, workspace, role|null }         (founder-only matrix)
//   POST { action: "approve_provenance", ... }    (founder-only promotion)
//
// Panels degrade independently: a missing table yields an empty panel,
// never a 500 — a half-provisioned database must still render.
// =====================================================================

import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  isWorkspaceId,
  isWorkspaceRole,
  TTA_TENANT_ID,
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
import {
  BIG_ICE_SOURCE_URL,
  chargedBySlug,
  fetchBigIcePricing,
  findPriceDrift,
} from "@/lib/services/bigice-pricing";
import { buildCommand, type CommandInput } from "@/lib/services/command-metrics";

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

/**
 * NRHL and Big Ice predate multi-tenancy and still read the athlete /
 * venue / session tables globally — which was harmless while hockey was
 * the only sport on the box. It stopped being harmless when TTA-001
 * landed: a football squad would surface inside two hockey workspaces.
 * Until those two ventures get tenant rows of their own, they exclude
 * the football tenant explicitly.
 */
const HOCKEY_SPORTS = ["ice_hockey", "inline_hockey"];

// The tier_name → cohort-slug join lives in lib/services/bigice-pricing
// alongside findPriceDrift, so it can be tested without next/server.

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
        .in("primary_sport_code", HOCKEY_SPORTS)
        .order("created_at", { ascending: false })
        .limit(100),
    ),
    safeRows(() =>
      db.from("venues").select("id, name, coordinates").neq("tenant_id", TTA_TENANT_ID).limit(50),
    ),
    safeRows(() =>
      db
        .from("sessions")
        .select("id, athlete_id, venue_id, start_time, end_time, venues!inner(tenant_id)")
        .neq("venues.tenant_id", TTA_TENANT_ID)
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
  const [
    packages,
    enrolments,
    registrations,
    athletes,
    guardians,
    perf,
    biifAthletes,
    biifEnrollments,
    biifDocuments,
  ] = await Promise.all([
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
          "id, account_reference, athlete_name, full_name, email, tier, payment_status, amount_expected_kes, settled_receipt, settled_at, created_at",
        )
        .eq("venture_context", "BIG_ICE")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("athlete")
        .select("athlete_id, legal_name, preferred_name, date_of_birth, current_status, parent_email")
        .in("primary_sport_code", HOCKEY_SPORTS)
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("guardian_contact")
        .select(
          "guardian_id, athlete_id, legal_name, relationship, contact_info, consent_on_file, athlete!inner(primary_sport_code)",
        )
        .in("athlete.primary_sport_code", HOCKEY_SPORTS)
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("performance_logs")
        .select(
          "id, athlete_id, session_id, speed, agility, stamina, technical, cognitive, composite_score, created_at",
        )
        .neq("tenant_id", TTA_TENANT_ID)
        .order("created_at", { ascending: false })
        .limit(50),
    ),
    // The three tables the post-settlement pipeline writes. Fetched
    // separately rather than joined because they degrade independently:
    // the whole point of the recovery panel is to be readable when one
    // of these steps is the thing that failed.
    safeRows(() =>
      db
        .from("bigice_athlete")
        .select("biif_code, full_name, guardian_email, portal_activated_at, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ),
    safeRows(() =>
      db
        .from("bigice_enrollment")
        .select("enrollment_id, biif_code, programme_label, mpesa_receipt, status, amount_kes")
        .limit(500),
    ),
    safeRows(() =>
      db
        .from("bigice_document")
        .select("document_id, biif_code, slug, mpesa_receipt, delivery_status")
        .limit(2000),
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

  // Reconciliation against the public quote on bigice.co.ke. A parent
  // who was quoted one number and charged another is a dispute, so the
  // mismatch is surfaced to the founder rather than left to settlement.
  // Never throws and never blocks: worst case the sheet is the fallback.
  const sheet = await fetchBigIcePricing();
  const { charged, unmapped } = chargedBySlug(packages);
  // A tier the site sells but this map does not know is a broken join,
  // not an absence of drift. Say so — quietly reporting "all clear" is
  // how the 2026-08-11 rename went unnoticed.
  if (unmapped.length) {
    console.error(
      "[bigice] price reconciliation: no cohort slug for tier_name(s) " +
        unmapped.map((n) => `"${n}"`).join(", ") +
        " — these are excluded from drift detection. Update BIG_ICE_TIER_SLUGS.",
    );
  }

  // -------------------------------------------------------------------
  // ONBOARDING PIPELINE — §35/§36/§37, one row per settled registration.
  //
  // The payment path deliberately runs identity, enrollment and document
  // delivery AFTER settlement and outside its transaction, so that a
  // failure there cannot un-settle money or charge a family twice. The
  // cost of that correct decision is that the four steps can disagree,
  // and until now the only place that disagreement appeared was a
  // console.error in a serverless log nobody reads. A parent whose
  // payment succeeded and whose welcome pack never generated was
  // invisible.
  //
  // `paid = true` is not a workflow state. This is the workflow state.
  // -------------------------------------------------------------------
  const enrolmentByReceipt = new Map(
    biifEnrollments
      .filter((e) => typeof e.mpesa_receipt === "string")
      .map((e) => [String(e.mpesa_receipt), e]),
  );
  const athleteByCode = new Map(biifAthletes.map((a) => [String(a.biif_code), a]));
  const docsByReceipt = new Map<string, { slug: string; delivery_status: string }[]>();
  for (const d of biifDocuments) {
    const receipt = typeof d.mpesa_receipt === "string" ? d.mpesa_receipt : null;
    if (!receipt) continue;
    const list = docsByReceipt.get(receipt) ?? [];
    list.push({ slug: String(d.slug), delivery_status: String(d.delivery_status) });
    docsByReceipt.set(receipt, list);
  }

  const pipeline = registrations
    .filter((r) => r.payment_status === "PAYMENT_SETTLED")
    .map((r) => {
      const receipt = typeof r.settled_receipt === "string" ? r.settled_receipt : null;
      const enrolment = receipt ? enrolmentByReceipt.get(receipt) : undefined;
      const biifCode = enrolment ? String(enrolment.biif_code) : null;
      const athlete = biifCode ? athleteByCode.get(biifCode) : undefined;
      const docs = receipt ? (docsByReceipt.get(receipt) ?? []) : [];
      const sent = docs.filter((d) => d.delivery_status === "SENT").length;

      return {
        registrationId: String(r.id),
        accountReference: r.account_reference === null ? null : String(r.account_reference),
        athleteName: r.athlete_name === null ? null : String(r.athlete_name),
        parentName: r.full_name === null ? null : String(r.full_name),
        parentEmail: r.email === null ? null : String(r.email),
        receipt,
        amountKes: r.amount_expected_kes === null ? null : Number(r.amount_expected_kes),
        settledAt: r.settled_at === null ? null : String(r.settled_at),
        programmeLabel: enrolment ? String(enrolment.programme_label) : null,

        // Four independent verdicts. Never collapsed into one "ok"
        // boolean — an administrator needs to know WHICH step to retry.
        payment: "COMPLETE" as const,
        athleteId: biifCode,
        athleteStatus: biifCode ? ("COMPLETE" as const) : ("PENDING" as const),
        enrollmentStatus: enrolment ? ("COMPLETE" as const) : ("PENDING" as const),
        documentStatus:
          docs.length === 0
            ? ("PENDING" as const)
            : sent === docs.length
              ? ("COMPLETE" as const)
              : ("GENERATED_NOT_SENT" as const),
        documentCount: docs.length,
        documentsSent: sent,
        // The portal is reachable the moment the athlete row names the
        // guardian's address — that IS the link (lib/auth/guardian.ts).
        // A missing address means the family cannot sign in, which is a
        // distinct failure from a missing athlete.
        portalStatus:
          athlete && typeof athlete.guardian_email === "string" && athlete.guardian_email.trim()
            ? ("READY" as const)
            : ("PENDING" as const),
      };
    });

  return {
    packages,
    publishedPricing: { tiers: sheet.tiers, live: sheet.live, source: BIG_ICE_SOURCE_URL },
    priceDrift: findPriceDrift(sheet.tiers, charged),
    schedule: enrolments,
    pipeline,
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
// TTA — single-tenant football academy client surface.
//
// Every read is pinned to TTA_TENANT_ID, or to the athletes reachable
// from it via athlete_tenant_links. Nothing here queries a table
// unscoped, so no other venture's athletes can surface in this
// workspace regardless of what else lives in the database.
//
// Three waves, because each depends on ids resolved by the last.
// ---------------------------------------------------------------------
async function ttaData(db: Supabase) {
  const strs = (rows: Row[], key: string): string[] =>
    rows.map((r) => r[key]).filter((v): v is string => typeof v === "string");

  // Wave 1 — the tenant boundary itself.
  const [links, perf, venues] = await Promise.all([
    safeRows(() =>
      db.from("athlete_tenant_links").select("athlete_id").eq("tenant_id", TTA_TENANT_ID),
    ),
    safeRows(() =>
      db
        .from("performance_logs")
        .select(
          "id, athlete_id, session_id, speed, agility, stamina, technical, cognitive, composite_score, raw_payload, created_at",
        )
        .eq("tenant_id", TTA_TENANT_ID)
        .order("created_at", { ascending: true })
        .limit(500),
    ),
    safeRows(() => db.from("venues").select("id, name").eq("tenant_id", TTA_TENANT_ID)),
  ]);

  const appAthleteIds = strs(links, "athlete_id");
  if (appAthleteIds.length === 0) {
    return { athletes: [], performance: perf, venues, programs: [], profiles: [], academics: [], videoTags: [], scoutLink: null, trend: null };
  }

  // Wave 2 — app accounts, then the passport identities they bridge to.
  const accounts = await safeRows(() =>
    db.from("athletes").select("id, passport_athlete_id").in("id", appAthleteIds),
  );
  const passportIds = strs(accounts, "passport_athlete_id");
  const passportByApp = new Map(
    accounts.map((a) => [String(a.id), a.passport_athlete_id as string | null]),
  );

  const [athletes, metrics, profiles, records] = await Promise.all([
    passportIds.length
      ? safeRows(() =>
          db
            .from("athlete")
            .select("athlete_id, legal_name, preferred_name, date_of_birth, current_status, parent_email")
            .in("athlete_id", passportIds),
        )
      : Promise.resolve([] as Row[]),
    passportIds.length
      ? safeRows(() =>
          db
            .from("athlete_metrics_log")
            .select("metric_log_id, athlete_id, metric_code, metric_timestamp, metric_payload")
            .in("athlete_id", passportIds)
            .in("metric_code", ["PROGRAM_ENROLMENT", "SCOUT_EXPORT_CONFIG", "TREND_INDICATOR", "RADAR_SNAPSHOT"]),
        )
      : Promise.resolve([] as Row[]),
    passportIds.length
      ? safeRows(() =>
          db
            .from("sport_profile")
            .select("sport_profile_id, athlete_id, sport_code, discipline_code, role_position, dominant_side")
            .in("athlete_id", passportIds),
        )
      : Promise.resolve([] as Row[]),
    passportIds.length
      ? safeRows(() =>
          db
            .from("performance_record")
            .select("performance_record_id, athlete_id, sport_code, video_evidence_hash")
            .in("athlete_id", passportIds),
        )
      : Promise.resolve([] as Row[]),
  ]);

  // Wave 3 — metric_value hangs off the profile and match-record ids.
  const profileIds = strs(profiles, "sport_profile_id");
  const recordIds = strs(records, "performance_record_id");
  const [academicRows, tagRows] = await Promise.all([
    profileIds.length
      ? safeRows(() =>
          db
            .from("metric_value")
            .select("metric_value_id, sport_profile_id, metric_code, value_text, value_numeric, measured_at")
            .in("sport_profile_id", profileIds)
            .like("metric_code", "ACAD%"),
        )
      : Promise.resolve([] as Row[]),
    recordIds.length
      ? safeRows(() =>
          db
            .from("metric_value")
            .select("metric_value_id, performance_record_id, value_text, measured_at")
            .in("performance_record_id", recordIds)
            .eq("metric_code", "VEO_CLIP_TAG"),
        )
      : Promise.resolve([] as Row[]),
  ]);

  const payloadOf = (code: string): Row | null =>
    (metrics.find((m) => m.metric_code === code)?.metric_payload as Row | undefined) ?? null;

  return {
    tenantId: TTA_TENANT_ID,
    athletes,
    // App-plane id per passport id, so the client can join telemetry to a name.
    accounts: accounts.map((a) => ({
      appAthleteId: String(a.id),
      passportAthleteId: passportByApp.get(String(a.id)) ?? null,
    })),
    profiles,
    performance: perf,
    venues,
    programs: metrics.filter((m) => m.metric_code === "PROGRAM_ENROLMENT"),
    academics: academicRows,
    videoTags: tagRows,
    scoutLink: payloadOf("SCOUT_EXPORT_CONFIG"),
    trend: payloadOf("TREND_INDICATOR"),
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

// ---------------------------------------------------------------------
// COMMAND CANVAS — cross-workspace aggregate behind the founder / head
// coach lens. Reads the platform-wide tables (no sport or tenant filter:
// this is the Pan-African scale view), then hands every row to the pure
// derivation module. Arithmetic lives in lib/services/command-metrics.ts
// so it can be tested without a database.
// ---------------------------------------------------------------------
const typed = <T,>(rows: Row[]): T[] => rows as unknown as T[];

async function commandInput(db: Supabase): Promise<CommandInput> {
  const [
    athletes,
    provenance,
    clubs,
    federations,
    tenants,
    venues,
    custody,
    links,
    sessions,
    performance,
    biometrics,
    guardians,
    queue,
    deadLetters,
    audit,
    registrations,
    payments,
    scoutLogs,
    coachLinks,
    cohorts,
    league,
  ] = await Promise.all([
    safeRows(() =>
      db
        .from("athlete")
        .select(
          "athlete_id, legal_name, preferred_name, date_of_birth, is_dob_estimated, is_legacy, national_id_hash, current_status, primary_sport_code, provenance_id, created_at",
        )
        .limit(500),
    ),
    safeRows(() =>
      db
        .from("provenance")
        .select(
          "provenance_id, data_source, entered_by_actor_id, entered_by_actor_role, entered_at, verified_at, verification_status, verification_method, confidence_score",
        )
        .limit(1000),
    ),
    safeRows(() =>
      db.from("club").select("club_id, name, country_code, federation_id, is_training_club").limit(200),
    ),
    safeRows(() =>
      db.from("federation").select("federation_id, name, country_code, sport_code").limit(200),
    ),
    safeRows(() => db.from("tenants").select("id, name, created_at").limit(200)),
    safeRows(() => db.from("venues").select("id, name, tenant_id").limit(200)),
    safeRows(() =>
      db
        .from("custody_record")
        .select("custody_id, athlete_id, club_id, federation_id, start_date, end_date")
        .limit(1000),
    ),
    safeRows(() => db.from("athlete_tenant_links").select("athlete_id, tenant_id").limit(1000)),
    safeRows(() =>
      db
        .from("sessions")
        .select("id, athlete_id, venue_id, start_time")
        .order("start_time", { ascending: false })
        .limit(1000),
    ),
    safeRows(() =>
      db
        .from("performance_logs")
        .select(
          "id, athlete_id, session_id, speed, agility, stamina, technical, cognitive, composite_score, tenant_id, venue_verified, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(1000),
    ),
    safeRows(() =>
      db
        .from("biometric_record")
        .select("record_id, athlete_id, measured_at, height_cm, weight_kg, age_at_measurement_years, provenance_id")
        .limit(500),
    ),
    safeRows(() => db.from("guardian_contact").select("guardian_id, athlete_id, consent_on_file").limit(500)),
    safeRows(() =>
      db
        .from("telemetry_ingest_queue")
        .select("id, status, attempts, tenant_id, athlete_id, error, venue_verified, created_at, processed_at")
        .order("created_at", { ascending: false })
        .limit(200),
    ),
    safeRows(() =>
      db
        .from("sync_dead_letter_queue")
        .select("id, record_type, last_error, failed_at")
        .order("failed_at", { ascending: false })
        .limit(50),
    ),
    safeRows(() =>
      db
        .from("audit_log")
        .select("event_id, event_type, actor_id, occurred_at, record_type, record_id, event_hash")
        .order("occurred_at", { ascending: false })
        .limit(100),
    ),
    safeRows(() =>
      db
        .from("registrations")
        .select("venture_context, tier, payment_status, amount_expected_kes, settled_at")
        .limit(2000),
    ),
    safeRows(() =>
      db
        .from("payment_events")
        .select("amount_kes, result_code, created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
    ),
    safeRows(() =>
      db
        .from("scouting_metric_log")
        .select("id, athlete_id, metric_code, context, logged_at")
        .order("logged_at", { ascending: false })
        .limit(200),
    ),
    safeRows(() => db.from("athlete_coaches").select("athlete_id, coach_id, role_label").limit(500)),
    safeRows(() =>
      db
        .from("cohort_session_registry")
        .select(
          "registry_id, cohort_label, track_type, session_day_of_week, window_start_time, window_end_time, capacity, season_start_date, season_end_date, student_athlete_id, enrollment_status",
        )
        .limit(500),
    ),
    safeRows(() =>
      db
        .from("nrhl_athlete")
        .select(
          "athlete_code, display_name, team, division, age_tier, games_played, attendance_rate_pct, coach_grade_avg, composite_score, legacy_points, conduct_cases",
        )
        .limit(500),
    ),
  ]);

  return {
    athletes: typed(athletes),
    provenance: typed(provenance),
    clubs: typed(clubs),
    federations: typed(federations),
    tenants: typed(tenants),
    venues: typed(venues),
    custody: typed(custody),
    links: typed(links),
    sessions: typed(sessions),
    performance: typed(performance),
    biometrics: typed(biometrics),
    guardians: typed(guardians),
    queue: typed(queue),
    deadLetters: typed(deadLetters),
    audit: typed(audit),
    registrations: typed(registrations),
    payments: typed(payments),
    scoutLogs: typed(scoutLogs),
    coachLinks: typed(coachLinks),
    cohorts: typed(cohorts),
    league: typed(league),
  };
}

/** Lenses an actor may enter: the coach hub needs no financial grant. */
function modesFor(actor: Actor): Array<"founder" | "coach"> {
  if (actor.isFounder) return ["founder", "coach"];
  const values = Object.values(actor.roles);
  if (values.includes("GLOBAL_FOUNDER")) return ["founder", "coach"];
  if (values.includes("HEAD_COACH")) return ["coach"];
  return [];
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

  // Command canvas: one aggregate for the whole platform, gated on the
  // lens rather than on a single workspace grant.
  if (request.nextUrl.searchParams.get("scope") === "command") {
    const modes = modesFor(actor);
    if (modes.length === 0) {
      return NextResponse.json(
        { success: false, error: "The command canvas needs a founder or head coach grant." },
        { status: 403 },
      );
    }
    const data = buildCommand(await commandInput(adminClient()), new Date());
    return NextResponse.json({ success: true, actor: publicActor(actor), scope: "command", modes, data });
  }

  const requested = request.nextUrl.searchParams.get("workspace");
  if (!requested) {
    // Shell bootstrap. hasProfile decides whether a grantless account is
    // sent to /onboarding or to the "access pending" screen — see
    // lib/auth/landing.ts. A missing table reads as "no profile", so an
    // unmigrated environment routes people to the form rather than 500s.
    return NextResponse.json({
      success: true,
      actor: publicActor(actor),
      hasProfile: await hasProfile(actor.userId),
    });
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
    requested === "tta"
      ? await ttaData(db)
      : requested === "nrhl"
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

  if ((body as { action?: unknown }).action === "approve_provenance") {
    return approveProvenance(body, actor);
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

// ---------------------------------------------------------------------
// SHADOW AUDIT PROMOTION — move staged provenance rows into the verified
// global talent database.
//
// Two rules that are not negotiable from the client:
//   1. the queue is recomputed server-side, so approving a row the client
//      invented (or one it was told was blocked) is impossible;
//   2. a row carrying a CRITICAL anomaly — duplicate identity, reused ID
//      document, implausible birth date, missing guardian consent — is
//      refused unless the founder explicitly overrides it, and the
//      override is what lands in the audit ledger.
//
// verification_method is deliberately left untouched: a dashboard click
// is not a document check, and claiming one in the passport would be a
// lie told by the UI.
// ---------------------------------------------------------------------
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

async function approveProvenance(body: unknown, actor: Actor) {
  if (!actor.isFounder) {
    return NextResponse.json(
      { success: false, error: "Only the global founder may promote records into the verified database." },
      { status: 403 },
    );
  }

  const input = body as { provenanceIds?: unknown; force?: unknown };
  const ids = Array.isArray(input.provenanceIds)
    ? input.provenanceIds.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  if (ids.length === 0 || ids.length > 200) {
    return NextResponse.json(
      { success: false, error: "Expected provenanceIds: string[] with 1–200 entries." },
      { status: 400 },
    );
  }
  const force = input.force === true;

  const db = adminClient();
  const payload = buildCommand(await commandInput(db), new Date());
  const staged = new Map(
    payload.audit.queue
      .filter((item) => item.provenanceId)
      .map((item) => [item.provenanceId as string, item]),
  );

  const approve: string[] = [];
  const skipped: Array<{ provenanceId: string; reason: string }> = [];
  for (const id of new Set(ids)) {
    const item = staged.get(id);
    if (!item) {
      skipped.push({ provenanceId: id, reason: "not in the staging queue" });
      continue;
    }
    if (!item.approvable && !force) {
      skipped.push({ provenanceId: id, reason: item.blockedReason ?? "blocked by an anomaly flag" });
      continue;
    }
    approve.push(id);
  }

  if (approve.length === 0) {
    return NextResponse.json({ success: false, error: "Nothing approved.", skipped }, { status: 409 });
  }

  const now = new Date().toISOString();
  const { error } = await db
    .from("provenance")
    .update({
      verification_status: "verified",
      verified_at: now,
      verified_by_actor_id: actor.userId,
      verified_by_org: "Athlytica HQ · command canvas",
    })
    .in("provenance_id", approve);
  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Append-only ledger, hash-chained application-side (the schema's
  // documented contract: event_hash = sha256(prev_hash || canonical json)).
  const { data: tail } = await db
    .from("audit_log")
    .select("event_hash")
    .order("occurred_at", { ascending: false })
    .limit(1);
  let prev = (tail?.[0]?.event_hash as string | undefined)?.trim() ?? null;
  const events = approve.map((id) => {
    const item = staged.get(id);
    const snapshot = {
      action: "PASSPORT_VERIFICATION_APPROVED",
      provenance_id: id,
      record_kind: item?.recordKind ?? null,
      subject: item?.subject ?? null,
      hub: item?.hubName ?? null,
      flags: (item?.flags ?? []).map((f) => f.code),
      override: force && !item?.approvable,
      approved_by: actor.email,
      approved_at: now,
    };
    const prevHash = prev;
    const hash = createHash("sha256").update(`${prevHash ?? ""}${canonicalJson(snapshot)}`).digest("hex");
    prev = hash;
    return {
      event_id: randomUUID(),
      event_type: snapshot.override
        ? "PASSPORT_VERIFICATION_APPROVED_OVERRIDE"
        : "PASSPORT_VERIFICATION_APPROVED",
      actor_id: actor.userId,
      occurred_at: now,
      record_type: "provenance",
      record_id: id,
      prev_event_hash: prevHash,
      event_hash: hash,
      payload_snapshot: snapshot,
    };
  });

  const { error: ledgerError } = await db.from("audit_log").insert(events);

  return NextResponse.json({
    success: true,
    approved: approve.length,
    skipped,
    // A verified row with no ledger entry is a governance gap, not a
    // silent success — the client surfaces this.
    ledgerWarning: ledgerError ? ledgerError.message : null,
  });
}

/** Has this account completed the self-service profile step? */
async function hasProfile(userId: string): Promise<boolean> {
  try {
    const { data, error } = await adminClient()
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    return !error && Boolean(data);
  } catch {
    return false;
  }
}

function publicActor(actor: Actor) {
  return {
    userId: actor.userId,
    email: actor.email,
    isFounder: actor.isFounder,
    roles: actor.roles,
  };
}
