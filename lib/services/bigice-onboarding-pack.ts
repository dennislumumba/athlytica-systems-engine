// =====================================================================
// BIG ICE ONBOARDING PACK — what a family receives once payment settles.
//
// SEPARATE FROM THE NRHL PACK, not a variant of it. NRHL's documents
// talk about divisions, drafts and league entry to a competitor's
// parent; these talk to a parent who has bought skating development for
// a child who may never enter a league (§3, §8, §60). They share only
// the print shell in nrhl-pdf-generator.ts.
//
// WHAT THIS DELIBERATELY DOES NOT CONTAIN, and why:
//   Equipment checklist, safety guidelines, code of conduct, consent and
//   waiver forms (§18 items 6-10). Each states Big Ice POLICY, and I do
//   not have Big Ice's policy text. A welcome pack that invents what
//   protective equipment is mandatory, or what a parent is consenting
//   to, is worse than one that omits it — the first is wrong on a safety
//   question, the second is merely incomplete. The pack is a list, so
//   adding them later is one entry each.
//   ponytail: add each as a document function once the real text exists.
//
// VERSIONING (§21): every document carries PACK_VERSION, and
// bigice-delivery.ts stores the RENDERED HTML rather than a reference to
// a template. A pack edited next season therefore cannot retroactively
// change what a family was actually sent.
// =====================================================================

import { BIG_ICE_BRAND, esc, page } from "./nrhl-pdf-generator.ts";

/** Bump on any content change. Stamped into every issued document. */
export const PACK_VERSION = "BIGICE-PACK-v1";

const ENTITY = "Big Ice Inline Fitness";
const CONTACT = "Big Ice Inline Fitness · +254 724 324 529 · dennis@bigice.co.ke · bigice.co.ke";
const PAYBILL = "4325935";

export interface BigIceVars {
  athleteName: string;
  /** BIIF-2026-0501, or the honest stand-in when one has not been minted. */
  athleteId: string;
  parentName: string;
  parentEmail: string;
  programmeName: string;
  amountKes: number | null;
  location?: string | null;
  registrationReference: string;
  paymentReference?: string | null;
  issuedOn?: string;
  /**
   * Absolute URL of the parent portal. Absent means the portal document
   * is omitted entirely — a welcome pack containing a guessed link is a
   * parent typing a dead address on their first evening.
   */
  portalUrl?: string | null;
}

export interface PackDocument {
  slug: string;
  title: string;
  html: string;
  version: string;
}

const kes = (n: number | null): string =>
  n === null ? "—" : `KES ${n.toLocaleString("en-KE", { maximumFractionDigits: 0 })}`;

const today = (): string => new Date().toISOString().slice(0, 10);

/** Two-column fact table — the shape a parent scans rather than reads. */
function facts(rows: [string, string][]): string {
  return `<table>${rows
    .filter(([, v]) => v && v !== "—")
    .map(
      ([k, v]) =>
        `<tr><td class="muted" style="width:38%">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`,
    )
    .join("")}</table>`;
}

const shell = (title: string, eyebrow: string, body: string, footnote?: string): string =>
  page({
    title,
    eyebrow,
    body,
    brand: BIG_ICE_BRAND,
    entity: ENTITY,
    contact: CONTACT,
    ...(footnote ? { footnote } : {}),
  });

// ---------------------------------------------------------------- docs

export function paymentReceipt(v: BigIceVars): string {
  return shell(
    "Payment Receipt",
    "Big Ice Inline Fitness",
    `<p>Received with thanks from <strong>${esc(v.parentName)}</strong>.</p>
     ${facts([
       ["Athlete", v.athleteName],
       ["Big Ice Athlete ID", v.athleteId],
       ["Programme", v.programmeName],
       ["Amount received", kes(v.amountKes)],
       ["M-Pesa reference", v.paymentReference ?? "—"],
       ["Paybill", PAYBILL],
       ["Registration reference", v.registrationReference],
       ["Date", v.issuedOn ?? today()],
     ])}
     <p class="muted">This receipt confirms payment only. Your training schedule is confirmed
     separately by your coach.</p>`,
    `${PACK_VERSION} · receipt`,
  );
}

export function welcomeLetter(v: BigIceVars): string {
  return shell(
    "Welcome to Big Ice",
    "Athlete Registration Confirmed",
    `<p>Dear ${esc(v.parentName)},</p>
     <p>${esc(v.athleteName)} is registered with Big Ice Inline Fitness, and now has a permanent
     Big Ice Athlete ID.</p>
     ${facts([
       ["Athlete", v.athleteName],
       ["Big Ice Athlete ID", v.athleteId],
       ["Programme", v.programmeName],
       ["Training hub", v.location ?? "Confirmed with your coach"],
       ["Registered on", v.issuedOn ?? today()],
     ])}
     <h2>What the Athlete ID is</h2>
     <p>It identifies your child's development record with Big Ice, and stays with them across
     every programme they take — skating foundations, figure skating, hockey skating or
     athletic development. Enrolling in something new adds to the same record rather than
     starting a new one.</p>
     <p class="muted">It is an identifier, not a password. It is never used on its own to sign
     in to anything.</p>
     <h2>What happens next</h2>
     <ol>
       <li>Your coach confirms your first session time and location.</li>
       <li>Your athlete completes an initial assessment, which establishes their starting point.</li>
       <li>Progress from that starting point is recorded against this Athlete ID.</li>
     </ol>`,
    `${PACK_VERSION} · welcome`,
  );
}

export function programmeConfirmation(v: BigIceVars): string {
  return shell(
    "Programme Confirmation",
    "Welcome Back to Big Ice",
    `<p>Dear ${esc(v.parentName)},</p>
     <p>${esc(v.athleteName)}'s new programme has been added to their existing Big Ice athlete
     profile. Their Athlete ID and their development history are unchanged.</p>
     ${facts([
       ["Athlete", v.athleteName],
       ["Big Ice Athlete ID", v.athleteId],
       ["New programme", v.programmeName],
       ["Training hub", v.location ?? "Confirmed with your coach"],
       ["Confirmed on", v.issuedOn ?? today()],
     ])}
     <p>Everything recorded during previous programmes — assessments, coach observations and
     completed levels — stays attached to the same record.</p>`,
    `${PACK_VERSION} · programme-confirmation`,
  );
}

export function portalInstructions(v: BigIceVars): string {
  return shell(
    "Your Parent Portal",
    "Big Ice Inline Fitness",
    `<p>The parent portal is where ${esc(v.athleteName)}'s Big Ice record lives.</p>
     ${facts([
       ["Portal", v.portalUrl ?? ""],
       ["Sign in with", v.parentEmail],
     ])}
     <h2>How to sign in</h2>
     <ol>
       <li>Open the portal address above.</li>
       <li>Enter <strong>${esc(v.parentEmail)}</strong> — the address this pack was sent to.</li>
       <li>We email you a sign-in link. There is no password to remember.</li>
     </ol>
     <p class="muted">Sign in with this address specifically. It is what connects your account to
     your athlete's record — if you use a different one, the portal will not find them.</p>
     <h2>What you will see</h2>
     <p>Your athlete's ID and current programme from today. Their next session, assessment
     results, coach updates and documents appear as those are recorded — the portal shows what
     has actually happened, so panels stay empty until there is something real in them.</p>`,
    `${PACK_VERSION} · portal-instructions`,
  );
}

/**
 * §18/§19 — the pack is configured, not fixed. A returning family gets
 * the shorter set: they have had the welcome and know what an Athlete ID
 * is, and re-sending it reads as though we have forgotten them.
 */
export function bigIceOnboardingPack(
  v: BigIceVars,
  opts: { returning?: boolean } = {},
): PackDocument[] {
  const returning = opts.returning === true;
  const docs: PackDocument[] = [
    { slug: "receipt", title: "Payment Receipt", html: paymentReceipt(v), version: PACK_VERSION },
    returning
      ? {
          slug: "programme-confirmation",
          title: "Programme Confirmation",
          html: programmeConfirmation(v),
          version: PACK_VERSION,
        }
      : {
          slug: "welcome",
          title: "Welcome to Big Ice",
          html: welcomeLetter(v),
          version: PACK_VERSION,
        },
  ];

  // Omitted rather than guessed when the portal has no configured host.
  if (v.portalUrl) {
    docs.push({
      slug: "portal-instructions",
      title: "Your Parent Portal",
      html: portalInstructions(v),
      version: PACK_VERSION,
    });
  }
  return docs;
}

/**
 * The covering email. Short, because the documents carry the detail and
 * a parent reads this on a phone (§67).
 */
export function bigIceOnboardingEmail(
  v: BigIceVars,
  opts: { returning?: boolean } = {},
): { subject: string; html: string } {
  const returning = opts.returning === true;
  const html = `<div style="font-family:'Segoe UI',system-ui,sans-serif;font-size:15px;line-height:1.65;color:#0b1220;max-width:600px">
  <p style="font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:#B58100;font-weight:700;margin:0 0 6px">
    Big Ice Inline Fitness</p>
  <h1 style="font-size:22px;margin:0 0 16px">${returning ? "Programme confirmed" : "Welcome to Big Ice"}</h1>

  <p>Dear ${esc(v.parentName)},</p>
  <p>${
    returning
      ? `${esc(v.athleteName)}'s new programme has been added to their Big Ice athlete profile.`
      : `${esc(v.athleteName)} is now registered with Big Ice, and has a permanent Big Ice Athlete ID.`
  }</p>

  <table style="border-collapse:collapse;margin:18px 0;font-size:14px">
    <tr><td style="padding:4px 0;color:#5b6b80">Athlete ID</td><td style="padding:4px 0"><strong>${esc(v.athleteId)}</strong></td></tr>
    <tr><td style="padding:4px 0;color:#5b6b80">Programme</td><td style="padding:4px 0"><strong>${esc(v.programmeName)}</strong></td></tr>
    ${v.paymentReference ? `<tr><td style="padding:4px 0;color:#5b6b80">M-Pesa reference</td><td style="padding:4px 0"><strong>${esc(v.paymentReference)}</strong></td></tr>` : ""}
  </table>

  <p>Your documents are attached${v.portalUrl ? ", including how to reach your parent portal" : ""}.
  Your coach will confirm your first session separately.</p>

  <p style="margin-top:24px;padding-top:16px;border-top:1px solid #dfe5ec;font-size:13px;color:#5b6b80">
    ${esc(CONTACT)}
  </p>
</div>`;

  return {
    subject: returning
      ? `Big Ice programme confirmed — ${v.athleteName}`
      : `Welcome to Big Ice — ${v.athleteName}`,
    html,
  };
}
