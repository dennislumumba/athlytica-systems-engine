// =====================================================================
// NRHL ONBOARDING PACK — the documents a family receives after paying.
//
// Rebuilt 2026-08-11 from the 2026 Athlytica samples. Those documents
// were written for a May–July pod cycle feeding an August 2026 league,
// and every load-bearing fact in them has since moved. What changed, and
// why each change is not optional:
//
//   ages 6–14                → 8–15 with basic skating ability
//   May 18 – Jul 31 pods     → Aug–Oct 2026 development phase
//   August 2026 league       → January 2027 league phase
//   "24 bi-weekly sessions"  → 9 group + 3 showcase + 1 assessment
//   KES 45,000 for all of it → 7,500 / 27,500 / 45,000, three programmes
//   8–12 athletes per pod    → 3–8 athletes per coach
//   Pesapal / bank transfer  → M-Pesa Paybill 4325935
//   "Performance ID is MANDATORY for draft-only league entry"
//                            → no guarantee of selection, anywhere
//   Scouting Passport        → Digital Athlete Performance Profile
//   Athlytica-branded        → NRHL-branded, Big Ice as operator
//
// A parent who pays on nairobihockey.com and then receives a document
// quoting different ages, dates, prices and session counts has been
// given a reason to doubt everything else in it. `tests/
// nrhl-onboarding-pack.test.mts` fails the build if any retired claim
// reappears — copy rots quietly, so the guard has to be automatic.
//
// PDF: these are complete standalone HTML documents. `openPrintable()`
// hands one to the browser's own print engine; server-side, playwright
// (already a dependency) renders the same string. No PDF library.
// =====================================================================

import { esc, page } from "./nrhl-pdf-generator.ts";

// ---------------------------------------------------------------- vars

/**
 * Every value a generated document can carry. Names mirror the
 * {{PLACEHOLDER}} tokens so an admin-uploaded template and a built-in
 * document are populated from one source.
 */
export interface OnboardingVars {
  athleteName: string;
  athleteId: string;
  athleteAge: number | string;
  parentName: string;
  parentPhone: string;
  parentEmail: string;
  programmeId: ProgrammeId;
  trainingHub: string;
  preferredDays?: string;
  preferredTimes?: string;
  coachName?: string;
  registrationReference: string;
  paymentReference?: string;
  registrationDate?: string;
  programmeStartDate?: string;
  programmeEndDate?: string;
}

export type ProgrammeId = "baseline_7500" | "combine_27500" | "acceleration_45000";

interface ProgrammeFacts {
  name: string;
  amountKes: number;
  term: string;
  /** Every scheduled contact hour, itemised. This is the number a parent checks. */
  delivery: string[];
  totalHours: string;
}

export const PROGRAMME_FACTS: Readonly<Record<ProgrammeId, ProgrammeFacts>> = {
  baseline_7500: {
    name: "Athlete Performance Assessment",
    amountKes: 7_500,
    term: "One-time",
    delivery: ["1 × 90-minute assessment session"],
    totalHours: "1.5 hours",
  },
  combine_27500: {
    name: "Performance Hockey Program",
    amountKes: 27_500,
    term: "3-month development phase",
    delivery: [
      "9 × 120-minute group training sessions",
      "3 × 120-minute showcase scrimmages",
      "1 × 90-minute initial assessment",
    ],
    totalHours: "25.5 hours",
  },
  acceleration_45000: {
    name: "Elite Individual Development",
    amountKes: 45_000,
    term: "3-month development phase",
    delivery: [
      "9 × 120-minute group training sessions",
      "12 × 90-minute private coaching sessions",
      "3 × 120-minute showcase scrimmages",
      "1 × 90-minute initial assessment",
    ],
    totalHours: "43.5 hours",
  },
};

const PAYBILL = "4325935";
const MOTTO = "See First. Connect Fast. Trust Structure.";

/**
 * FOUNDER-OWNED CLAUSE. This is the one paragraph in the pack that is a
 * commercial decision rather than a restatement of what the site already
 * publishes. It mirrors the attendance policy on nairobihockey.com; the
 * refund position needs the founder's sign-off before the agreement is
 * countersigned by anyone. Override it rather than editing it inline.
 */
export const ATTENDANCE_POLICY =
  "Give at least 6 hours' notice if the athlete cannot attend a session. Makeup sessions " +
  "are offered subject to coaching availability and expire one month after the missed " +
  "session. Showcase scrimmages cannot be individually replaced — the athlete joins the " +
  "next scheduled team showcase. Programme fees are not refundable once the development " +
  "phase has begun.";

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;
const today = () => new Date().toISOString().slice(0, 10);

const factRow = (k: string, v: unknown) =>
  `<div class="cell"><div class="k">${esc(k)}</div><div class="v" style="font-size:15px">${esc(v)}</div></div>`;

const list = (items: string[]) =>
  `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

// -------------------------------------------------- 1. parent prospectus

/** Pre-purchase explainer. Document 1, rebuilt. */
export function parentProspectus(): string {
  const body = `
  <p class="muted">${esc(MOTTO)}</p>

  <h2>What this is</h2>
  <p>Structured youth inline hockey development for athletes aged <strong>8–15 who already
  have basic skating ability</strong>. Athletes train in small groups, apply the work in a
  showcase scrimmage every month, and have their development recorded so progress can be
  reviewed rather than remembered.</p>
  <p>Complete beginners should build a skating foundation first. We would rather point a
  family to the right starting place than sell them the wrong programme.</p>

  <h2>Why inline hockey builds athletes</h2>
  <p><strong>Movement.</strong> Multi-directional agility, rapid stops, lateral crossovers and
  technical transitions — with the dynamic balance and ankle stability that come from holding
  an edge under speed. Straight-line skating develops none of it.</p>
  <p><strong>Decision-making.</strong> The athlete reads space while controlling the puck and
  tracking teammates. Managing two demands at once, at speed, is the part that transfers well
  beyond sport.</p>

  <table>
    <thead><tr><th>&nbsp;</th><th>Recreational skating</th><th>Structured development</th></tr></thead>
    <tbody>
      <tr><td>Movement demand</td><td>Straight-line, forward</td><td>Multi-directional, explosive</td></tr>
      <tr><td>Decision load</td><td>Low — one task at a time</td><td>High — spatial and tactical together</td></tr>
      <tr><td>Physical outcome</td><td>Balance and stamina</td><td>Core stability, ankle strength, acceleration</td></tr>
      <tr><td>Pathway</td><td>Hobby</td><td>Structured athlete development</td></tr>
    </tbody>
  </table>

  <h2>The three programmes</h2>
  ${Object.values(PROGRAMME_FACTS)
    .map(
      (p) => `<p><strong>${esc(p.name)} — ${esc(kes(p.amountKes))}</strong> (${esc(p.term)})<br>
      ${esc(p.delivery.join(" · "))} — ${esc(p.totalHours)} of scheduled programme exposure.</p>`,
    )
    .join("")}
  <p class="muted">If a family enrols in Performance or Elite within 30 days of completing the
  assessment, the ${esc(kes(7_500))} assessment fee is credited toward the programme fee.</p>

  <h2>How a 3-month phase runs</h2>
  <p>Three training weeks and one showcase week, each month. The showcase <em>replaces</em> that
  week's group session — it is not an extra commitment to find time for.</p>
  <ol>
    <li>Assessment establishes the baseline and the athlete's development priorities.</li>
    <li>Months 1–3: three group sessions and one showcase scrimmage per month.</li>
    <li>End-of-phase progress review, with a recommendation for the next phase.</li>
  </ol>

  <h2>Group size, and why it is the number that matters</h2>
  <p>Training groups are kept to approximately <strong>3–8 athletes per coach</strong>, so a
  coach can actually observe and correct each athlete rather than run a large group through
  drills. It is the single constraint that decides whether a session develops anyone.</p>

  <h2>Where and when</h2>
  ${list([
    "The Summit — around Rosslyn Academy",
    "The Ridge — Spring Valley Community Court",
    "The Plateau — Lavington Community Hub",
    "The Savannah — Embakasi Multisport Centre",
  ])}
  <p>After school 3:00pm–6:00pm; weekends 9:00am–7:00pm; showcase scrimmages generally at
  weekends from approximately 11:00am. Families select from available slots — hubs and times
  are subject to cohort and coaching availability.</p>
  <p class="muted">Sessions currently run on suitable community court surfaces — concrete,
  asphalt or cabro — while we prepare to introduce a professional modular inline rink system.</p>

  <h2>From development to competition</h2>
  <p><strong>Fall 2026</strong> — development and assessment phase. <strong>January 2027</strong>
  — the competitive league phase begins. Athletes who complete a development phase carry a
  performance record into that stage.</p>
  <p class="muted">Completing a phase does not guarantee a draft position or league selection.
  Selection follows the league's published eligibility process.</p>

  <h2>Who coaches</h2>
  <p>Sessions are led by <strong>Dennis Lumumba</strong> — NCCP certified, Hockey Canada
  coaching credentials across the U7, U9 and U12 development stages, ten years of teaching
  experience, and a current player for the Kenya Ice Lions, the first and only ice hockey team
  in East and Central Africa.</p>`;

  return page({
    eyebrow: "Nairobi Regional Hockey League",
    title: "Youth Inline Hockey Athlete Development — Parent Prospectus",
    body,
    footnote: "Fall 2026 intake",
  });
}

// ------------------------------------------------ 2. performance agreement

/** The signed agreement. Document 2, rebuilt. */
export function performanceAgreement(v: OnboardingVars): string {
  const p = PROGRAMME_FACTS[v.programmeId];
  const body = `
  <div class="grid">
    ${factRow("Athlete", v.athleteName)}
    ${factRow("Athlete ID", v.athleteId)}
    ${factRow("Age", v.athleteAge)}
    ${factRow("Parent / guardian", v.parentName)}
    ${factRow("Programme", p.name)}
    ${factRow("Training hub", v.trainingHub)}
    ${factRow("Registration ref", v.registrationReference)}
    ${factRow("Date", v.registrationDate ?? today())}
  </div>

  <h2>1. What is provided</h2>
  <p><strong>${esc(p.name)} — ${esc(kes(p.amountKes))}, ${esc(p.term)}.</strong></p>
  ${list(p.delivery)}
  <p>Total scheduled programme exposure: <strong>${esc(p.totalHours)}</strong>. Group training
  runs at approximately 3–8 athletes per coach. Facility fees are included${
    v.programmeId === "baseline_7500" ? "" : ", as is the end-of-phase progress review"
  }.</p>

  <h2>2. The assessment</h2>
  <p>Every athlete is measured the same way, so a later result can be compared to their own
  earlier one:</p>
  ${list([
    "Speed and power — 10 m sprint, 20 m sprint, broad jump",
    "Skating — one-foot glide, crossovers, backward skating, backward crossovers, stopping, transitions",
    "Puck control — skating while controlling the puck or ball",
    "Hockey movement assessment and coach observations",
  ])}
  <p>Results and coach observations form the athlete's <strong>Digital Athlete Performance
  Profile</strong>, together with a set of recommended development priorities.</p>

  <h2>3. Risk acknowledgement</h2>
  <p>Inline hockey and athletic testing carry inherent physical risk, including falls,
  collisions, muscle strain, equipment-related injury, and hazards associated with outdoor
  community court surfaces (concrete, asphalt or cabro). Venue conditions, including weather
  exposure, vary by hub. The guardian will be notified of the specific venue on cohort
  placement.</p>

  <h2>4. Medical and emergency protocol</h2>
  <p>The guardian confirms the athlete has no undisclosed medical condition contraindicating
  high-intensity athletic activity. In the event of injury, coaching staff will provide
  immediate first aid as trained, contact emergency services where required, and notify the
  guardian immediately on the number provided.</p>
  <p>The guardian releases Big Ice Inline Fitness, NRHL, Athlytica and venue hosts from
  liability for injuries sustained during participation, except in cases of gross negligence
  or wilful misconduct.</p>

  <h2>5. Media release — choose one</h2>
  <p>Video and still capture is used for technical movement analysis and for the athlete's
  performance profile. Marketing use is a separate, explicit election and is never assumed:</p>
  <p>[&nbsp;&nbsp;] <strong>GRANTS</strong> permission to use the athlete's name, image and
  video in NRHL marketing.<br>
  [&nbsp;&nbsp;] <strong>DENIES</strong> permission — performance analysis only.</p>
  <p class="muted">Performance data and footage are stored securely and are not shared with
  third parties without explicit guardian consent, except as required to operate the league.</p>

  <h2>6. Payment</h2>
  <p>Amount due: <strong>${esc(kes(p.amountKes))}</strong>. Paid by M-Pesa — either the
  prompt sent during registration, or Lipa na M-Pesa &rarr; Paybill
  <strong>${esc(PAYBILL)}</strong>, account <strong>${esc(v.registrationReference)}</strong>
  (the athlete's name also works). Pay from the registered number so the payment matches this
  registration.</p>
  ${v.paymentReference ? `<p>Payment reference on file: <strong>${esc(v.paymentReference)}</strong>.</p>` : ""}

  <h2>7. Attendance, makeups and refunds</h2>
  <p>${esc(ATTENDANCE_POLICY)}</p>

  <h2>8. Athlete code of conduct</h2>
  ${list([
    "Arrive 10 minutes before the session start, changed and ready",
    "Respect coaches, teammates and venue property",
    "Full engagement in drills and assessments",
  ])}
  <p>Athletes bring their own inline hockey skates, protective equipment and a skating or
  hockey helmet. Equipment is checked before participation and unsafe gear means the athlete
  sits out. We are working toward equipment loan and purchase options from January 2027.</p>

  <h2>9. Selection</h2>
  <p>Participation in a development phase does not guarantee a draft position, conference
  placement or league selection. Selection follows the league's published eligibility process.</p>

  <div class="sig">
    <div>
      <div class="muted">Guardian signature</div><div class="field"></div>
      <div class="muted">Name (print)</div><div class="field"></div>
    </div>
    <div>
      <div class="muted">Date</div><div class="field"></div>
      <div class="muted">Emergency contact &amp; relationship</div><div class="field"></div>
    </div>
  </div>`;

  return page({
    eyebrow: "Nairobi Regional Hockey League · Athlete agreement",
    title: "Athlete Development Agreement",
    body,
    footnote: `Athlete ${v.athleteId} · ${p.name}`,
  });
}

// ------------------------------------------------------- 3. welcome pack

/** Post-payment welcome. Document 3, rebuilt. */
export function welcomePack(v: OnboardingVars, opts: { returning?: boolean } = {}): string {
  const p = PROGRAMME_FACTS[v.programmeId];
  const returning = opts.returning === true;

  const body = `
  <p>${
    returning
      ? `Welcome back. <strong>${esc(v.athleteName)}</strong>'s existing NRHL profile has been connected to this registration — the same Athlete ID, with every previous assessment, session and coach observation still attached to it.`
      : `Welcome. <strong>${esc(v.athleteName)}</strong> is registered with the Nairobi Regional Hockey League, and now has an Athlete ID that will follow them through every phase, season and assessment from here on.`
  }</p>

  <div class="grid">
    ${factRow("Athlete", v.athleteName)}
    ${factRow("Athlete ID", v.athleteId)}
    ${factRow("Programme", p.name)}
    ${factRow("Training hub", v.trainingHub)}
    ${factRow("Registration ref", v.registrationReference)}
    ${factRow("Status", returning ? "Existing athlete · re-enrolled" : "Registered")}
  </div>

  <h2>What you have booked</h2>
  ${list(p.delivery)}
  <p>${esc(p.totalHours)} of scheduled programme exposure${
    v.programmeId === "baseline_7500"
      ? ". If you enrol in Performance or Elite within 30 days of the assessment, this fee is credited toward the programme."
      : ", including the end-of-phase progress review."
  }</p>

  <h2>The first session — the 90-minute assessment</h2>
  <ol>
    <li><strong>Arrival</strong> — check in and equipment check, 10 minutes before the start.</li>
    <li><strong>Warm-up</strong> — dynamic activation and movement preparation.</li>
    <li><strong>Speed and power</strong> — 10 m and 20 m sprints, broad jump.</li>
    <li><strong>Skating</strong> — glide, crossovers, backward skating, stopping, transitions.</li>
    <li><strong>Puck control and hockey movement</strong> — with coach observations.</li>
    <li><strong>Debrief</strong> — immediate feedback for athlete and parent.</li>
  </ol>
  <p>Group training sessions run 120 minutes and follow the same shape at greater depth, ending
  in small-area game play. Showcase scrimmages are 120 minutes of game conditions.</p>

  <h2>What to bring</h2>
  <p><strong>Required</strong></p>
  ${list([
    "Inline hockey skates, correctly sized and double-knotted",
    "Helmet with full cage or visor (CSA / HECC certified)",
    "Hockey gloves and a stick cut to roughly collarbone height",
    "Water bottle, minimum 750 ml",
  ])}
  <p><strong>Strongly recommended</strong></p>
  ${list([
    "Elbow pads and shin guards",
    "Mouthguard",
    "Athletic cup (U12 and above)",
    "Moisture-wicking base layer",
  ])}
  <p><strong>Not permitted</strong> — recreational or open-toe skates, bike or skateboard
  helmets, loose jewellery or watches.</p>
  <p class="muted">Athletes currently provide their own equipment. We are working toward loan
  and purchase options from January 2027.</p>

  <h2>Attendance</h2>
  <p>${esc(ATTENDANCE_POLICY)}</p>

  <h2>Staying in touch</h2>
  ${list([
    "WhatsApp group — day-to-day scheduling and session updates",
    "Email — progress documents and your athlete's performance profile",
    `Urgent matters — ${"Dennis Lumumba"} on +254 724 324 529`,
  ])}
  <p><strong>Parents at sessions:</strong> no sideline coaching, arrive and collect punctually,
  and save technical questions for the coach after the session ends. It is the difference
  between a coachable group and a noisy one.</p>

  <h2>What happens next</h2>
  <p>The NRHL registration team will confirm your training slot at ${esc(v.trainingHub)} and the
  date of ${
    v.programmeId === "baseline_7500"
      ? "your assessment"
      : "the initial assessment that opens your phase"
  }.${v.preferredDays ? ` Your stated preference — ${esc(v.preferredDays)}${v.preferredTimes ? `, ${esc(v.preferredTimes)}` : ""} — is on file.` : ""}</p>
  <p class="muted">${esc(MOTTO)}</p>`;

  return page({
    eyebrow: returning ? "Nairobi Regional Hockey League · Re-enrolment" : "Nairobi Regional Hockey League · Welcome",
    title: returning ? "Programme Confirmation" : "Welcome to NRHL",
    body,
    footnote: `Athlete ${v.athleteId}`,
  });
}

// ----------------------------------------------------- 4. payment receipt

/** Proof of payment. New — the samples had none. */
export function paymentReceipt(v: OnboardingVars): string {
  const p = PROGRAMME_FACTS[v.programmeId];
  const body = `
  <div class="seal">
    <div class="muted" style="letter-spacing:.2em;font-size:10px">AMOUNT PAID</div>
    <div class="title">${esc(kes(p.amountKes))}</div>
    <div class="muted">${esc(p.name)} · ${esc(p.term)}</div>
  </div>

  <div class="grid">
    ${factRow("Received from", v.parentName)}
    ${factRow("Athlete", v.athleteName)}
    ${factRow("Athlete ID", v.athleteId)}
    ${factRow("Registration ref", v.registrationReference)}
    ${factRow("M-Pesa reference", v.paymentReference ?? "Pending confirmation")}
    ${factRow("Date", v.registrationDate ?? today())}
    ${factRow("Paid to", `M-Pesa Paybill ${PAYBILL}`)}
    ${factRow("Training hub", v.trainingHub)}
  </div>

  <h2>What this covers</h2>
  ${list(p.delivery)}
  <p>Total scheduled programme exposure: <strong>${esc(p.totalHours)}</strong>. Facility fees
  included.</p>

  <p class="muted">Keep this receipt with your registration reference
  (<strong>${esc(v.registrationReference)}</strong>). It identifies this payment in every NRHL
  communication. This document is issued by Big Ice Inline Fitness, the operating entity for
  the Nairobi Regional Hockey League.</p>`;

  return page({
    eyebrow: "Nairobi Regional Hockey League",
    title: "Payment Receipt",
    body,
    footnote: `Receipt ${v.registrationReference}`,
  });
}

// ------------------------------------------------------------- the pack

export interface PackDocument {
  slug: string;
  title: string;
  html: string;
}

/**
 * §36 — a returning athlete does not need the prospectus or a second
 * welcome letter; they need confirmation that the same identity picked up
 * a new programme. Sending a new athlete's full pack to a family on their
 * third phase is how a professional system starts to feel automated.
 */
export function onboardingPack(
  v: OnboardingVars,
  opts: { returning?: boolean } = {},
): PackDocument[] {
  const returning = opts.returning === true;
  const docs: PackDocument[] = [
    { slug: "receipt", title: "Payment Receipt", html: paymentReceipt(v) },
    {
      slug: returning ? "programme-confirmation" : "welcome",
      title: returning ? "Programme Confirmation" : "Welcome to NRHL",
      html: welcomePack(v, { returning }),
    },
    { slug: "agreement", title: "Athlete Development Agreement", html: performanceAgreement(v) },
  ];
  if (!returning) {
    docs.push({ slug: "prospectus", title: "Parent Prospectus", html: parentProspectus() });
  }
  return docs;
}

// ------------------------------------------- admin-uploaded templates

/** The tokens an uploaded template may use. Kept beside the interface it mirrors. */
export const TEMPLATE_TOKENS = [
  "ATHLETE_NAME",
  "ATHLETE_ID",
  "ATHLETE_AGE",
  "PARENT_NAME",
  "PARENT_PHONE",
  "PARENT_EMAIL",
  "PROGRAM_NAME",
  "PROGRAM_PRICE",
  "PROGRAM_START_DATE",
  "PROGRAM_END_DATE",
  "TRAINING_HUB",
  "PREFERRED_TRAINING_DAYS",
  "PREFERRED_TRAINING_TIMES",
  "COACH_NAME",
  "REGISTRATION_REFERENCE",
  "PAYMENT_REFERENCE",
  "REGISTRATION_DATE",
] as const;

export type TemplateToken = (typeof TEMPLATE_TOKENS)[number];

function tokenValues(v: OnboardingVars): Record<TemplateToken, string> {
  const p = PROGRAMME_FACTS[v.programmeId];
  return {
    ATHLETE_NAME: v.athleteName,
    ATHLETE_ID: v.athleteId,
    ATHLETE_AGE: String(v.athleteAge),
    PARENT_NAME: v.parentName,
    PARENT_PHONE: v.parentPhone,
    PARENT_EMAIL: v.parentEmail,
    PROGRAM_NAME: p.name,
    PROGRAM_PRICE: kes(p.amountKes),
    PROGRAM_START_DATE: v.programmeStartDate ?? "",
    PROGRAM_END_DATE: v.programmeEndDate ?? "",
    TRAINING_HUB: v.trainingHub,
    PREFERRED_TRAINING_DAYS: v.preferredDays ?? "",
    PREFERRED_TRAINING_TIMES: v.preferredTimes ?? "",
    COACH_NAME: v.coachName ?? "",
    REGISTRATION_REFERENCE: v.registrationReference,
    PAYMENT_REFERENCE: v.paymentReference ?? "",
    REGISTRATION_DATE: v.registrationDate ?? today(),
  };
}

export interface FilledTemplate {
  html: string;
  /**
   * Tokens the data could not fill, and unknown tokens the template
   * invented. §51: a field that cannot be populated is flagged for an
   * admin, never guessed — and never silently blanked, because a document
   * that reads "Athlete:" with nothing after it looks broken to a parent.
   */
  unresolved: string[];
}

/**
 * Substitute {{TOKEN}} in an admin-uploaded template. Values are escaped:
 * a template is authored content, but the values come from a registration
 * form, and an athlete named `<script>` must not become one.
 */
export function fillTemplate(template: string, v: OnboardingVars): FilledTemplate {
  const values = tokenValues(v);
  const unresolved: string[] = [];
  const html = template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (whole, token: string) => {
    if (!(token in values)) {
      unresolved.push(token);
      return whole; // leave it visible — an admin has to see what is missing
    }
    const value = values[token as TemplateToken];
    if (value === "") {
      unresolved.push(token);
      return whole;
    }
    return esc(value);
  });
  return { html, unresolved: [...new Set(unresolved)] };
}
