// =====================================================================
// CRM VALIDATION CONTRACT — the trust boundary for every CRM write.
//
// Three rules the rest of the module depends on:
//   1. Phone numbers are normalised HERE, by the one implementation in
//      utils/msisdn.ts (opsGuard law: never fork a per-route copy). The
//      DB CHECK is the backstop, not the parser.
//   2. The taxonomy comes from config/crm.ts, which mirrors the SQL
//      CHECKs. Nothing in this file restates a stage or a product.
//   3. Derived money is never accepted from a client. expected_value is
//      a GENERATED column; a caller sends value and probability only.
// =====================================================================

import { z } from "zod";
import { normalizeKenyanMsisdn } from "@/utils/msisdn";
import {
  ACTIVITY_TYPE_IDS,
  CONTACT_TYPE_IDS,
  ORG_TYPE_IDS,
  PRIORITY_IDS,
  PRODUCT_IDS,
  SOURCE_IDS,
  STAGE_IDS,
  TEMPERATURE_IDS,
} from "@/config/crm";

const nonEmpty = (max: number) => z.string().trim().min(1).max(max);

/**
 * Kenyan mobile → canonical 254(1|7)XXXXXXXX; a bare +E.164 passes
 * through for international partners. Everything else is a typo, and a
 * typo is an uncallable lead.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const kenyan = normalizeKenyanMsisdn(raw);
    if (kenyan) return kenyan;
    const e164 = raw.replace(/[\s\-()]/g, "");
    if (/^\+[1-9]\d{6,14}$/.test(e164)) return e164;
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `'${raw}' is not a usable phone number.` });
    return z.NEVER;
  });

export const emailSchema = z.string().trim().toLowerCase().email().max(160);

const uuid = z.string().uuid();
const stage = z.enum(STAGE_IDS as [string, ...string[]]);
const product = z.enum(PRODUCT_IDS as [string, ...string[]]);
const source = z.enum(SOURCE_IDS as [string, ...string[]]);
const temperature = z.enum(TEMPERATURE_IDS as [string, ...string[]]);
const priority = z.enum(PRIORITY_IDS as [string, ...string[]]);
const contactType = z.enum(CONTACT_TYPE_IDS as [string, ...string[]]);
const orgType = z.enum(ORG_TYPE_IDS as [string, ...string[]]);
const activityType = z.enum(ACTIVITY_TYPE_IDS as [string, ...string[]]);

const money = z.number().finite().min(0).max(1_000_000_000);
const percent = z.number().int().min(0).max(100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.");

export const crmActionSchema = z.discriminatedUnion("action", [
  // ------------------------------------------------------------ people
  z.object({
    action: z.literal("create-contact"),
    fullName: nonEmpty(120),
    contactType,
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    source: source.default("other"),
    organizationId: uuid.optional(),
    athleteId: uuid.optional(),
    notes: z.string().max(2000).optional(),
    /** Set after the founder has seen a duplicate warning and chosen to proceed. */
    confirmDuplicate: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("update-contact"),
    contactId: uuid,
    patch: z.object({
      fullName: nonEmpty(120).optional(),
      contactType: contactType.optional(),
      phone: phoneSchema.nullable().optional(),
      email: emailSchema.nullable().optional(),
      source: source.optional(),
      organizationId: uuid.nullable().optional(),
      athleteId: uuid.nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
    }),
  }),

  // ----------------------------------------------------- organizations
  z.object({
    action: z.literal("create-organization"),
    name: nonEmpty(160),
    orgType,
    phone: phoneSchema.optional(),
    email: emailSchema.optional(),
    location: z.string().max(160).optional(),
    notes: z.string().max(2000).optional(),
    confirmDuplicate: z.boolean().default(false),
  }),
  z.object({
    action: z.literal("update-organization"),
    orgId: uuid,
    patch: z.object({
      name: nonEmpty(160).optional(),
      orgType: orgType.optional(),
      phone: phoneSchema.nullable().optional(),
      email: emailSchema.nullable().optional(),
      location: z.string().max(160).nullable().optional(),
      notes: z.string().max(2000).nullable().optional(),
      tenantId: uuid.nullable().optional(),
      clubId: uuid.nullable().optional(),
    }),
  }),

  // ----------------------------------------------------- opportunities
  z.object({
    action: z.literal("create-opportunity"),
    contactId: uuid,
    product,
    source: source.default("other"),
    valueKes: money,
    listPriceKes: money.optional(),
    probabilityPct: percent.optional(),
    temperature: temperature.default("warm"),
    expectedCloseDate: isoDate.optional(),
    organizationId: uuid.optional(),
    athleteId: uuid.optional(),
  }),
  z.object({
    action: z.literal("update-opportunity"),
    opportunityId: uuid,
    patch: z.object({
      product: product.optional(),
      source: source.optional(),
      stage: stage.optional(),
      temperature: temperature.optional(),
      valueKes: money.optional(),
      listPriceKes: money.nullable().optional(),
      probabilityPct: percent.optional(),
      expectedCloseDate: isoDate.nullable().optional(),
      organizationId: uuid.nullable().optional(),
      athleteId: uuid.nullable().optional(),
      // Required by a DB CHECK when the stage is 'lost' — the API says so
      // first, so the founder gets a sentence rather than a constraint name.
      lostReason: z.string().trim().max(500).nullable().optional(),
    }),
  }),
  /**
   * Attach the deal to the registration that carries its money. One
   * registration, one opportunity (unique index) — this is the join every
   * "cash collected" figure is read through.
   */
  z.object({
    action: z.literal("link-registration"),
    opportunityId: uuid,
    registrationId: uuid.nullable(),
  }),

  // -------------------------------------------------------- timeline
  z.object({
    action: z.literal("log-activity"),
    contactId: uuid,
    opportunityId: uuid.optional(),
    activityType,
    subject: nonEmpty(200),
    notes: z.string().max(4000).optional(),
    outcome: z.string().max(500).optional(),
    /** Defaults to now; back-dating a WhatsApp thread is normal. */
    occurredAt: z.string().datetime({ offset: true }).optional(),
  }),

  // ----------------------------------------------------------- tasks
  z.object({
    action: z.literal("create-task"),
    contactId: uuid,
    opportunityId: uuid.optional(),
    title: nonEmpty(200),
    description: z.string().max(2000).optional(),
    dueDate: isoDate,
    priority: priority.default("medium"),
  }),
  z.object({
    action: z.literal("update-task"),
    taskId: uuid,
    patch: z.object({
      title: nonEmpty(200).optional(),
      description: z.string().max(2000).nullable().optional(),
      dueDate: isoDate.optional(),
      priority: priority.optional(),
      // completed_at is set server-side: a client cannot claim it finished
      // an hour ago to move its own overdue count.
      status: z.enum(["pending", "completed", "cancelled"]).optional(),
    }),
  }),

  // ------------------------------------------------------- conversion
  /**
   * Point the CRM at an athlete that already exists. The explicit,
   * auditable half of §12: linking never creates a person.
   */
  z.object({
    action: z.literal("link-athlete"),
    contactId: uuid,
    athleteId: uuid.nullable(),
    opportunityId: uuid.optional(),
  }),
]);

export type CrmAction = z.infer<typeof crmActionSchema>;
