// =====================================================================
// CRM API — /api/v1/crm
//
//   GET  -> the whole pipeline (contacts, opportunities, tasks,
//           activities, computed metrics) in one payload. At founder
//           scale this is a few hundred rows; six endpoints would buy
//           six round trips and nothing else.
//   POST -> one discriminated action union (lib/validation/crm-schemas).
//
// GATED to GLOBAL_FOUNDER / SALES_OPS in athlytica_hq. Reads run
// service-role BEHIND that gate — the crm_* tables are revoked from anon
// and authenticated (20260812221912), so the browser has no path to them
// except through here.
//
// DELIBERATELY NOT PART OF /api/v1/workspace/dashboard. That payload is
// all-or-nothing to any grant holder; commercial data about parents and
// prospects must not be reachable by every HEAD_COACH with a grant.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { adminClient, requireWorkspaceRole } from "@/lib/auth/workspace";
import { CRM_ROLES } from "@/config/workspaces";
import { STAGE_PROBABILITY, listedPriceKes, type Product, type Stage } from "@/config/crm";
import { crmActionSchema } from "@/lib/validation/crm-schemas";
import {
  buildCrmMetrics,
  duplicateContacts,
  type ActivityRow,
  type LinkedRegistrationRow,
  type OpportunityRow,
  type StageEventRow,
  type TaskRow,
} from "@/lib/services/crm-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Supabase = ReturnType<typeof adminClient>;

/** Panel-local failure containment — same posture as the workspace route. */
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

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

// ---------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const gate = await requireWorkspaceRole(request, "athlytica_hq", CRM_ROLES);
  if ("denied" in gate) return gate.denied;

  const db = adminClient();

  const [contacts, organizations, opportunities, tasks, activities, events, athletes, academyTiers] =
    await Promise.all([
      safeRows(() =>
        db
          .from("crm_contact")
          .select(
            "contact_id, full_name, phone, email, contact_type, organization_id, athlete_id, user_id, source, notes, created_at, updated_at",
          )
          .order("created_at", { ascending: false })
          .limit(2000),
      ),
      safeRows(() =>
        db
          .from("crm_organization")
          .select("org_id, name, org_type, phone, email, location, tenant_id, club_id, notes, created_at")
          .order("name")
          .limit(1000),
      ),
      safeRows(() =>
        db
          .from("crm_opportunity")
          .select(
            "opportunity_id, contact_id, organization_id, athlete_id, product, source, stage, temperature, value_kes, list_price_kes, probability_pct, expected_value_kes, expected_close_date, assigned_to, registration_id, lost_reason, converted_at, created_at, updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(2000),
      ),
      safeRows(() =>
        db
          .from("crm_task")
          .select(
            "task_id, contact_id, opportunity_id, title, description, due_date, priority, status, assigned_to, completed_at, created_at",
          )
          .order("due_date")
          .limit(2000),
      ),
      safeRows(() =>
        db
          .from("crm_activity")
          .select(
            "activity_id, contact_id, opportunity_id, activity_type, subject, notes, outcome, occurred_at, created_by, created_at",
          )
          .order("occurred_at", { ascending: false })
          .limit(2000),
      ),
      safeRows(() =>
        db
          .from("crm_opportunity_event")
          .select("opportunity_id, field, old_value, new_value, changed_by, changed_at")
          .order("changed_at", { ascending: false })
          .limit(4000),
      ),
      // Existing athletes, for the "link, don't duplicate" picker (§12).
      safeRows(() =>
        db
          .from("athlete")
          .select("athlete_id, legal_name, preferred_name, date_of_birth, current_status, parent_email")
          .order("legal_name")
          .limit(500),
      ),
      // Big Ice cohort prices live in the DB, not in code — read, never copied.
      safeRows(() =>
        db
          .from("commercial_price_tier")
          .select("tier_id, tier_name, price_amount, is_active")
          .eq("tier_group", "academy")
          .eq("is_active", true)
          .order("price_amount"),
      ),
    ]);

  // The money join. Only registrations an opportunity actually points at,
  // and only receipts that survived record_classification — a settlement
  // classified TEST is not cash. payment_events_production is the
  // existing view that applies that filter (D-22/D-23).
  const registrationIds = [
    ...new Set(opportunities.map((o) => str(o.registration_id)).filter(Boolean) as string[]),
  ];

  const [registrations, productionPayments] = await Promise.all([
    registrationIds.length === 0
      ? Promise.resolve([] as Row[])
      : safeRows(() =>
          db
            .from("registrations")
            .select("id, payment_status, amount_expected_kes, settled_receipt, settled_at, venture_context")
            .in("id", registrationIds),
        ),
    safeRows(() =>
      db.from("payment_events_production").select("mpesa_receipt_number").limit(5000),
    ),
  ]);

  const productionReceipts = new Set(
    productionPayments.map((p) => str(p.mpesa_receipt_number)).filter(Boolean) as string[],
  );

  const metrics = buildCrmMetrics(
    {
      opportunities: opportunities as unknown as OpportunityRow[],
      tasks: tasks as unknown as TaskRow[],
      activities: activities as unknown as ActivityRow[],
      registrations: registrations as unknown as LinkedRegistrationRow[],
      stageEvents: events as unknown as StageEventRow[],
      productionReceipts,
    },
    new Date(),
  );

  return NextResponse.json({
    success: true,
    role: gate.role,
    data: {
      contacts,
      organizations,
      opportunities,
      tasks,
      activities,
      events,
      registrations,
      athletes,
      academyTiers,
      metrics,
      duplicates: duplicateContacts(
        contacts as unknown as Array<{
          contact_id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
        }>,
      ),
      // Whether any cash figure on screen can be trusted as real money.
      // Zero production receipts means every settlement in this database
      // is synthetic, and the dashboard says so rather than showing KES 0
      // as if it were a sales result.
      productionReceiptCount: productionReceipts.size,
    },
  });
}

// ---------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------

const bad = (error: string, status = 400, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ success: false, error, ...extra }, { status });

/** Postgres surfaces our CHECK names; the founder should read a sentence. */
function explain(message: string): string {
  if (message.includes("crm_opportunity_lost_needs_reason")) {
    return "A lost deal needs a reason — that is the only thing that makes the loss report worth reading.";
  }
  if (message.includes("crm_opportunity_registration_idx")) {
    return "That registration is already linked to another opportunity.";
  }
  if (message.includes("crm_contact_phone_check") || message.includes("crm_contact_phone")) {
    return "That phone number is not a usable Kenyan mobile or international number.";
  }
  if (message.includes("crm_task_completed_timestamp")) {
    return "A completed task needs a completion time; a pending one must not have it.";
  }
  return message;
}

export async function POST(request: NextRequest) {
  const gate = await requireWorkspaceRole(request, "athlytica_hq", CRM_ROLES);
  if ("denied" in gate) return gate.denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return bad("Body must be JSON.");
  }

  const parsed = crmActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid command.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const db = adminClient();
  const command = parsed.data;
  const actorId = gate.actor.userId;

  try {
    switch (command.action) {
      // --------------------------------------------------------- people
      case "create-contact": {
        // Duplicate DETECTION, not prevention (§17): the founder is told
        // and decides. Two parents at one school share a phone often
        // enough that blocking would be wrong.
        if (!command.confirmDuplicate) {
          const matches = await findDuplicateContacts(db, command.phone, command.email, command.fullName);
          if (matches.length > 0) {
            return NextResponse.json(
              {
                success: false,
                warning: "POSSIBLE_DUPLICATE",
                error: `Possible duplicate contact: ${matches.map((m) => m.full_name).join(", ")}. Re-send with confirmDuplicate to create anyway.`,
                matches,
              },
              { status: 409 },
            );
          }
        }

        const { data, error } = await db
          .from("crm_contact")
          .insert({
            full_name: command.fullName,
            contact_type: command.contactType,
            phone: command.phone ?? null,
            email: command.email ?? null,
            source: command.source,
            organization_id: command.organizationId ?? null,
            athlete_id: command.athleteId ?? null,
            notes: command.notes ?? null,
          })
          .select("contact_id")
          .single();
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true, contactId: data?.contact_id });
      }

      case "update-contact": {
        const { error } = await db
          .from("crm_contact")
          .update(camelPatch(command.patch))
          .eq("contact_id", command.contactId);
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      // -------------------------------------------------- organizations
      case "create-organization": {
        if (!command.confirmDuplicate) {
          const { data } = await db
            .from("crm_organization")
            .select("org_id, name")
            .ilike("name", command.name.trim())
            .limit(5);
          if (data && data.length > 0) {
            return NextResponse.json(
              {
                success: false,
                warning: "POSSIBLE_DUPLICATE",
                error: `An organization named "${command.name}" already exists. Re-send with confirmDuplicate to create a second record.`,
                matches: data,
              },
              { status: 409 },
            );
          }
        }
        const { data, error } = await db
          .from("crm_organization")
          .insert({
            name: command.name,
            org_type: command.orgType,
            phone: command.phone ?? null,
            email: command.email ?? null,
            location: command.location ?? null,
            notes: command.notes ?? null,
          })
          .select("org_id")
          .single();
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true, orgId: data?.org_id });
      }

      case "update-organization": {
        const { error } = await db
          .from("crm_organization")
          .update(camelPatch(command.patch))
          .eq("org_id", command.orgId);
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      // -------------------------------------------------- opportunities
      case "create-opportunity": {
        const product = command.product as Product;
        const { data, error } = await db
          .from("crm_opportunity")
          .insert({
            contact_id: command.contactId,
            organization_id: command.organizationId ?? null,
            athlete_id: command.athleteId ?? null,
            product,
            source: command.source,
            value_kes: command.valueKes,
            // What the price table says, kept beside the negotiated value
            // so a discount is visible rather than inferred.
            list_price_kes: command.listPriceKes ?? listedPriceKes(product),
            probability_pct: command.probabilityPct ?? STAGE_PROBABILITY.new,
            temperature: command.temperature,
            expected_close_date: command.expectedCloseDate ?? null,
            assigned_to: actorId,
            last_actor: actorId,
          })
          .select("opportunity_id")
          .single();
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true, opportunityId: data?.opportunity_id });
      }

      case "update-opportunity": {
        const patch = camelPatch(command.patch);
        // Moving stage without touching probability adopts that stage's
        // default, so the weighted pipeline tracks reality instead of
        // holding a 10% guess made when the deal was new.
        if (command.patch.stage && command.patch.probabilityPct === undefined) {
          patch.probability_pct = STAGE_PROBABILITY[command.patch.stage as Stage];
        }
        // Triggers run as service_role, where auth.uid() is null. This is
        // how crm_opportunity_event learns who made the change.
        patch.last_actor = actorId;

        const { error } = await db
          .from("crm_opportunity")
          .update(patch)
          .eq("opportunity_id", command.opportunityId);
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      case "link-registration": {
        if (command.registrationId) {
          const { data: reg } = await db
            .from("registrations")
            .select("id")
            .eq("id", command.registrationId)
            .maybeSingle();
          if (!reg) return bad("No such registration.", 404);
        }
        const { error } = await db
          .from("crm_opportunity")
          .update({ registration_id: command.registrationId, last_actor: actorId })
          .eq("opportunity_id", command.opportunityId);
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      // ------------------------------------------------------- timeline
      case "log-activity": {
        const { error } = await db.from("crm_activity").insert({
          contact_id: command.contactId,
          opportunity_id: command.opportunityId ?? null,
          activity_type: command.activityType,
          subject: command.subject,
          notes: command.notes ?? null,
          outcome: command.outcome ?? null,
          occurred_at: command.occurredAt ?? new Date().toISOString(),
          created_by: actorId,
        });
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      // ---------------------------------------------------------- tasks
      case "create-task": {
        const { error } = await db.from("crm_task").insert({
          contact_id: command.contactId,
          opportunity_id: command.opportunityId ?? null,
          title: command.title,
          description: command.description ?? null,
          due_date: command.dueDate,
          priority: command.priority,
          assigned_to: actorId,
        });
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      case "update-task": {
        const patch = camelPatch(command.patch);
        // completed_at is server-set and paired with status by a CHECK,
        // so a client cannot back-date its way out of an overdue count.
        if (command.patch.status === "completed") patch.completed_at = new Date().toISOString();
        if (command.patch.status && command.patch.status !== "completed") patch.completed_at = null;

        const { error } = await db.from("crm_task").update(patch).eq("task_id", command.taskId);
        if (error) return bad(explain(error.message), 400);
        return NextResponse.json({ success: true });
      }

      // ----------------------------------------------------- conversion
      case "link-athlete": {
        if (command.athleteId) {
          const { data: athlete } = await db
            .from("athlete")
            .select("athlete_id")
            .eq("athlete_id", command.athleteId)
            .maybeSingle();
          if (!athlete) return bad("No such athlete.", 404);
        }
        const { error } = await db
          .from("crm_contact")
          .update({ athlete_id: command.athleteId })
          .eq("contact_id", command.contactId);
        if (error) return bad(explain(error.message), 400);

        if (command.opportunityId) {
          await db
            .from("crm_opportunity")
            .update({ athlete_id: command.athleteId, last_actor: actorId })
            .eq("opportunity_id", command.opportunityId);
        }
        return NextResponse.json({ success: true });
      }
    }
  } catch (e) {
    return bad(explain(e instanceof Error ? e.message : "Unexpected error."), 500);
  }
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const COLUMN_OF: Record<string, string> = {
  fullName: "full_name",
  contactType: "contact_type",
  organizationId: "organization_id",
  athleteId: "athlete_id",
  orgType: "org_type",
  tenantId: "tenant_id",
  clubId: "club_id",
  valueKes: "value_kes",
  listPriceKes: "list_price_kes",
  probabilityPct: "probability_pct",
  expectedCloseDate: "expected_close_date",
  lostReason: "lost_reason",
  dueDate: "due_date",
  registrationId: "registration_id",
};

/** camelCase patch → column patch, skipping keys the caller omitted. */
function camelPatch(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[COLUMN_OF[key] ?? key] = value;
  }
  return out;
}

async function findDuplicateContacts(
  db: Supabase,
  phone: string | undefined,
  email: string | undefined,
  fullName: string,
): Promise<Array<{ contact_id: string; full_name: string; phone: string | null; email: string | null }>> {
  const filters: string[] = [];
  if (phone) filters.push(`phone.eq.${phone}`);
  if (email) filters.push(`email.eq.${email}`);
  if (filters.length === 0) {
    // Nothing unique to match on, so fall back to an exact name match —
    // weak evidence, which is why it only ever produces a warning.
    const { data } = await db
      .from("crm_contact")
      .select("contact_id, full_name, phone, email")
      .ilike("full_name", fullName.trim())
      .limit(5);
    return (data ?? []) as never;
  }
  const { data } = await db
    .from("crm_contact")
    .select("contact_id, full_name, phone, email")
    .or(filters.join(","))
    .limit(5);
  return (data ?? []) as never;
}
