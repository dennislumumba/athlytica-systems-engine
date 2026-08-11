// =====================================================================
// ONBOARDING DELIVERY — the email a family gets once payment settles.
//
// Sits between three things that already exist: the settled registration
// row, the document pack, and the mailer. It owns exactly one decision —
// what a parent receives and when — and none of the others.
//
// ORDERING LAW: this runs AFTER settlement is durable, never before and
// never as a condition of it. §45 — if the email fails the registration
// is still valid, the parent is still registered, and the failure is a
// line in the log for an administrator, not an error on a payment
// receipt. `deliverOnboardingPack()` therefore cannot throw and cannot
// report success it did not achieve.
//
// NEW VS RETURNING (§31): resolved from nrhl_athlete by canonical name,
// the same key the onboarding webhook is idempotent on. A returning
// family keeps their athlete code and receives the shorter pack. If the
// athlete row does not exist yet — the code is minted by
// onboard-paid-athlete, which may not have run — the email says the ID
// follows rather than inventing one.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalName } from "./nrhl-etl.ts";
import { onboardingPack, PROGRAMME_FACTS, type OnboardingVars, type ProgrammeId } from "./nrhl-onboarding-pack.ts";
import { mailConfigured, send, type MailResult } from "./mailer.ts";
import { esc } from "./nrhl-pdf-generator.ts";

const ADMISSIONS_PHONE = "+254 724 324 529";
const ADMISSIONS_EMAIL = "dennis@bigice.co.ke";

/** Registration columns this needs. Kept narrow on purpose. */
interface RegistrationRow {
  account_reference: string;
  full_name: string | null;
  email: string | null;
  athlete_name: string | null;
  tier: string | null;
  preferred_campus: string | null;
}

export type DeliveryOutcome =
  | { delivered: true; to: string; documents: string[]; returning: boolean; athleteId: string }
  | { delivered: false; reason: string };

const isProgrammeId = (v: unknown): v is ProgrammeId =>
  typeof v === "string" && v in PROGRAMME_FACTS;

/**
 * §40 — short, parent-facing, no technical detail. The documents ride
 * along as attachments rather than behind a link: a link needs an
 * authenticated route, and an Athlete ID is an identifier, not a
 * credential (§48). Attachments avoid inventing an access surface.
 */
export function onboardingEmail(v: OnboardingVars, opts: { returning: boolean }): {
  subject: string;
  html: string;
} {
  const p = PROGRAMME_FACTS[v.programmeId];
  const idLine = v.athleteId
    ? `<tr><td style="padding:4px 0;color:#5b6b80">Athlete ID</td><td style="padding:4px 0"><strong>${esc(v.athleteId)}</strong></td></tr>`
    : "";

  const html = `<div style="font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.65;color:#0b1220;max-width:600px">
  <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#a8801d;font-weight:700;margin:0 0 6px">
    Nairobi Regional Hockey League</p>
  <h1 style="font-size:22px;margin:0 0 16px">Registration confirmed</h1>

  <p>Dear ${esc(v.parentName)},</p>
  <p>${esc(v.athleteName)} has been successfully registered with the Nairobi Regional Hockey League.</p>

  <table style="border-collapse:collapse;margin:18px 0;font-size:14px">
    ${idLine}
    <tr><td style="padding:4px 0;color:#5b6b80">Program</td><td style="padding:4px 0"><strong>${esc(p.name)}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#5b6b80">Training hub</td><td style="padding:4px 0"><strong>${esc(v.trainingHub)}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#5b6b80">Registration reference</td><td style="padding:4px 0"><strong>${esc(v.registrationReference)}</strong></td></tr>
    ${v.paymentReference ? `<tr><td style="padding:4px 0;color:#5b6b80">M-Pesa reference</td><td style="padding:4px 0"><strong>${esc(v.paymentReference)}</strong></td></tr>` : ""}
  </table>

  <p>${
    opts.returning
      ? "Your athlete's existing NRHL profile has been connected to this registration, so their previous assessments and training history stay attached to the same record."
      : "Your athlete's profile has now been created. The Athlete ID identifies their NRHL development record from here on."
  }</p>

  <p>Your onboarding documents are attached — your receipt, ${
    opts.returning ? "your programme confirmation" : "a welcome pack and the parent prospectus"
  }, and the athlete development agreement.</p>

  <p>We will confirm your training schedule and first-session details separately.</p>

  <p style="margin-top:24px;padding-top:16px;border-top:1px solid #dfe5ec;font-size:13px;color:#5b6b80">
    Questions? ${esc(ADMISSIONS_PHONE)} · ${esc(ADMISSIONS_EMAIL)}<br>
    <strong style="color:#0b1220">NRHL</strong> — Nairobi Regional Hockey League<br>
    Operated by Big Ice Inline Fitness.
  </p>
</div>`;

  return { subject: `NRHL athlete registration confirmed — ${v.athleteName}`, html };
}

/**
 * Loads the settled registration, resolves the athlete, builds the pack
 * and sends it. Returns a described outcome; never throws.
 */
export async function deliverOnboardingPack(
  db: SupabaseClient,
  registrationId: string,
  paymentReference?: string,
): Promise<DeliveryOutcome> {
  if (!mailConfigured()) {
    return { delivered: false, reason: "mail is not provisioned (RESEND_API_KEY / NRHL_MAIL_FROM)" };
  }

  try {
    const { data, error } = await db
      .from("registrations")
      .select("account_reference, full_name, email, athlete_name, tier, preferred_campus")
      .eq("id", registrationId)
      .maybeSingle();
    if (error) return { delivered: false, reason: `registration lookup failed: ${error.message}` };

    const row = data as RegistrationRow | null;
    if (!row) return { delivered: false, reason: "registration not found" };
    if (!row.email) return { delivered: false, reason: "registration has no email address" };
    if (!isProgrammeId(row.tier)) {
      // enterprise_150k and academy packages are not parent onboarding.
      return { delivered: false, reason: `tier ${row.tier ?? "null"} has no athlete onboarding pack` };
    }

    const athleteName = row.athlete_name ?? row.full_name ?? "Your athlete";
    const name = canonicalName(athleteName) ?? athleteName.trim();

    // Returning if an athlete row already carries a code for this name.
    const { data: existing } = await db
      .from("nrhl_athlete")
      .select("athlete_code")
      .eq("display_name", name)
      .maybeSingle();
    const athleteCode = existing?.athlete_code ? String(existing.athlete_code) : "";
    const returning = athleteCode !== "";

    const vars: OnboardingVars = {
      athleteName,
      // Empty rather than fabricated: the code is minted by
      // onboard-paid-athlete and may not exist yet. The documents and the
      // email both degrade to "issued with your first session".
      athleteId: athleteCode || "Issued with your first session",
      athleteAge: "",
      parentName: row.full_name ?? "Parent / guardian",
      parentPhone: "",
      parentEmail: row.email,
      programmeId: row.tier,
      trainingHub: row.preferred_campus ?? "To be confirmed",
      registrationReference: row.account_reference,
      ...(paymentReference ? { paymentReference } : {}),
    };

    const pack = onboardingPack(vars, { returning });
    const { subject, html } = onboardingEmail(vars, { returning });

    const result: MailResult = await send({
      to: row.email,
      subject,
      html,
      replyTo: ADMISSIONS_EMAIL,
      attachments: pack.map((d) => ({
        filename: `NRHL-${d.slug}-${row.account_reference}.html`,
        content: d.html,
      })),
    });

    if (!result.sent) return { delivered: false, reason: `${result.reason}: ${result.detail}` };
    return {
      delivered: true,
      to: row.email,
      documents: pack.map((d) => d.slug),
      returning,
      athleteId: vars.athleteId,
    };
  } catch (err) {
    return { delivered: false, reason: err instanceof Error ? err.message : String(err) };
  }
}
