// =====================================================================
// BIG ICE PACK DELIVERY — render, record, then send.
//
// THAT ORDER IS THE POINT. Documents are written to bigice_document
// BEFORE the email is attempted, so a mail failure leaves a complete
// record of what should have gone out (§52). The alternative — send
// first, record on success — loses exactly the cases an administrator
// needs to find.
//
// ORDERING LAW, inherited from the rest of the settlement path: this
// runs after money and identity are durable, and cannot throw. A family
// whose welcome email bounced is still registered, still has their
// Athlete ID, and is not charged again (§55).
//
// UNPROVISIONED MAIL IS NOT A FAILURE TO GENERATE. With no RESEND_API_KEY
// the documents are still rendered and stored as PENDING, so switching
// mail on later is a resend rather than a reconstruction.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { mailConfigured, send } from "./mailer.ts";
import {
  bigIceOnboardingEmail,
  bigIceOnboardingPack,
  type BigIceVars,
} from "./bigice-onboarding-pack.ts";

export type BigIceDeliveryOutcome =
  | { delivered: true; to: string; documents: string[] }
  | { delivered: false; documents: string[]; reason: string };

const ADMISSIONS_EMAIL = "dennis@bigice.co.ke";

interface DeliverInput {
  biifCode: string;
  registrationId: string;
  receipt: string;
  /** Returning families get the shorter pack (§19). */
  returning: boolean;
}

export async function deliverBigIcePack(
  db: SupabaseClient,
  input: DeliverInput,
): Promise<BigIceDeliveryOutcome> {
  try {
    const { data: regData, error: regError } = await db
      .from("registrations")
      .select("account_reference, full_name, email, athlete_name, preferred_campus")
      .eq("id", input.registrationId)
      .maybeSingle();
    if (regError) {
      return { delivered: false, documents: [], reason: `registration lookup failed: ${regError.message}` };
    }
    const reg = regData as {
      account_reference: string;
      full_name: string | null;
      email: string | null;
      athlete_name: string | null;
      preferred_campus: string | null;
    } | null;
    if (!reg) return { delivered: false, documents: [], reason: "registration not found" };

    // The enrollment is the authority on what was bought and for how
    // much — it is what the settlement wrote, rather than what the
    // client once claimed.
    const { data: enrolData } = await db
      .from("bigice_enrollment")
      .select("enrollment_id, programme_label, amount_kes, location")
      .eq("mpesa_receipt", input.receipt)
      .maybeSingle();
    const enrolment = enrolData as {
      enrollment_id: string;
      programme_label: string;
      amount_kes: number | string | null;
      location: string | null;
    } | null;

    const amount =
      enrolment?.amount_kes === null || enrolment?.amount_kes === undefined
        ? null
        : Number(enrolment.amount_kes);

    const portalBase = process.env.PORTAL_BASE_URL?.replace(/\/+$/, "");

    const vars: BigIceVars = {
      athleteName: reg.athlete_name?.trim() || "Your athlete",
      athleteId: input.biifCode,
      parentName: reg.full_name?.trim() || "Parent / guardian",
      parentEmail: reg.email ?? "",
      programmeName: enrolment?.programme_label ?? "Big Ice programme",
      amountKes: Number.isFinite(amount) ? amount : null,
      location: enrolment?.location ?? reg.preferred_campus,
      registrationReference: reg.account_reference,
      paymentReference: input.receipt,
      ...(portalBase ? { portalUrl: `${portalBase}/portal` } : {}),
    };

    const pack = bigIceOnboardingPack(vars, { returning: input.returning });
    const slugs = pack.map((d) => d.slug);

    // Record first. A retry re-renders onto the same rows rather than
    // stacking a second welcome letter.
    const { error: writeError } = await db.from("bigice_document").upsert(
      pack.map((d) => ({
        biif_code: input.biifCode,
        enrollment_id: enrolment?.enrollment_id ?? null,
        slug: d.slug,
        title: d.title,
        template_version: d.version,
        content_html: d.html,
        audience: input.returning ? "RETURNING" : "NEW",
        mpesa_receipt: input.receipt,
        delivery_status: "PENDING",
      })),
      { onConflict: "biif_code,slug,mpesa_receipt" },
    );
    if (writeError) {
      return { delivered: false, documents: [], reason: `document write failed: ${writeError.message}` };
    }

    if (!reg.email) {
      return { delivered: false, documents: slugs, reason: "registration has no email address" };
    }
    if (!mailConfigured()) {
      return {
        delivered: false,
        documents: slugs,
        reason: "mail is not provisioned (RESEND_API_KEY / NRHL_MAIL_FROM); documents stored as PENDING",
      };
    }

    const { subject, html } = bigIceOnboardingEmail(vars, { returning: input.returning });
    const result = await send({
      to: reg.email,
      subject,
      html,
      replyTo: ADMISSIONS_EMAIL,
      attachments: pack.map((d) => ({
        filename: `BigIce-${d.slug}-${input.biifCode}.html`,
        content: d.html,
      })),
    });

    const now = new Date().toISOString();
    await db
      .from("bigice_document")
      .update(
        result.sent
          ? { delivery_status: "SENT", delivered_at: now, delivery_detail: null }
          : { delivery_status: "FAILED", delivery_detail: `${result.reason}: ${result.detail}` },
      )
      .eq("biif_code", input.biifCode)
      .eq("mpesa_receipt", input.receipt);

    if (!result.sent) {
      return { delivered: false, documents: slugs, reason: `${result.reason}: ${result.detail}` };
    }
    return { delivered: true, to: reg.email, documents: slugs };
  } catch (err) {
    return {
      delivered: false,
      documents: [],
      reason: `unexpected delivery failure: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
