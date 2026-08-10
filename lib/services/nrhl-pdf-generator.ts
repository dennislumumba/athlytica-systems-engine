// =====================================================================
// NRHL DOCUMENT SERVICE — self-contained printable HTML.
//
// WHY NOT @react-pdf/renderer: the brief allows "@react-pdf/renderer OR
// an HTML-to-PDF utility". Every browser already has a print-to-PDF
// engine with real pagination, live fonts and zero bundle cost, and
// these are one-page documents. Adding a ~500 KB renderer to emit a
// certificate the coach prints anyway is a dependency that earns
// nothing. `openPrintable()` hands the string to that engine.
//
// Every function returns a COMPLETE standalone document (inline CSS, no
// external requests) so the same string can be printed, emailed, or
// written to disk unchanged.
//
// Brand tokens are the live nairobihockey.com palette verified in
// NRHL_CONTEXT_DOSSIER.md §4.1 — navy ladder + gold accent, so an issued
// document matches the site the parent registered on.
// =====================================================================

export const NRHL_BRAND = {
  navy: "#051020",
  navy2: "#081a31",
  sheen: "#0e2749",
  gold: "#D4AF37",
  goldSoft: "#F4E4B7",
  text: "#D9E5F2",
  muted: "#8CA0B8",
} as const;

/** HTML-escape. Every interpolated value goes through this. */
export function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const LEGAL_ENTITY = "Big Ice Inline Fitness (operating Athlytica Performance Intelligence)";
const CONTACT = "Dennis Lumumba · League Director · +254 724 324 529 · dennis@bigice.co.ke";

/**
 * Shared page shell. `ink: "print"` flips to a light ground — a full-
 * bleed navy certificate empties a parent's ink cartridge, so screen
 * documents stay dark and issued paperwork prints light.
 */
function page(opts: {
  title: string;
  eyebrow: string;
  body: string;
  ink?: "screen" | "print";
  footnote?: string;
}): string {
  const print = opts.ink !== "screen";
  const bg = print ? "#ffffff" : NRHL_BRAND.navy;
  const fg = print ? "#0b1220" : NRHL_BRAND.text;
  const rule = print ? "#c8a94a" : NRHL_BRAND.gold;
  const soft = print ? "#5b6b80" : NRHL_BRAND.muted;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(opts.title)}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin:0; background:${bg}; color:${fg};
         font-family: "Segoe UI", Inter, system-ui, -apple-system, sans-serif;
         font-size: 12.5px; line-height: 1.6; }
  .sheet { max-width: 800px; margin: 0 auto; padding: 28px 32px; }
  .eyebrow { font-size:10px; letter-spacing:.28em; text-transform:uppercase; color:${rule}; font-weight:700; }
  h1 { font-size: 26px; margin: 6px 0 2px; letter-spacing:-.01em; }
  h2 { font-size: 13px; letter-spacing:.14em; text-transform:uppercase; color:${rule};
       margin: 22px 0 8px; border-bottom:1px solid ${rule}55; padding-bottom:5px; }
  p { margin: 0 0 10px; }
  .muted { color:${soft}; }
  .rule { height:3px; background:linear-gradient(90deg, ${rule}, transparent); margin:10px 0 18px; }
  table { width:100%; border-collapse:collapse; font-size:12px; margin:6px 0 14px; }
  th { text-align:left; font-size:9.5px; letter-spacing:.12em; text-transform:uppercase;
       color:${soft}; border-bottom:1px solid ${rule}55; padding:6px 8px; }
  td { padding:6px 8px; border-bottom:1px solid ${soft}33; vertical-align:top; }
  td.num, th.num { text-align:right; font-variant-numeric: tabular-nums; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin:12px 0; }
  .cell { border:1px solid ${rule}44; border-radius:8px; padding:10px 12px; }
  .cell .k { font-size:9.5px; letter-spacing:.14em; text-transform:uppercase; color:${soft}; }
  .cell .v { font-size:19px; font-weight:700; margin-top:3px; }
  .field { border-bottom:1px solid ${soft}; min-height:22px; margin:4px 0 14px; }
  .sig { display:grid; grid-template-columns:1fr 1fr; gap:24px; margin-top:26px; }
  .badge { display:inline-block; border:1px solid ${rule}; border-radius:999px;
           padding:3px 12px; font-size:10.5px; font-weight:700; letter-spacing:.1em;
           text-transform:uppercase; color:${rule}; }
  .seal { text-align:center; border:2px solid ${rule}; border-radius:14px; padding:22px; margin:18px 0; }
  .seal .title { font-size:30px; font-weight:800; letter-spacing:.02em; }
  ol, ul { margin:0 0 10px; padding-left:20px; }
  li { margin-bottom:5px; }
  footer { margin-top:26px; padding-top:12px; border-top:1px solid ${soft}55;
           font-size:10px; color:${soft}; }
  @media print { body { background:#fff; color:#0b1220; } .no-print { display:none; } }
</style></head>
<body><div class="sheet">
  <div class="eyebrow">${esc(opts.eyebrow)}</div>
  <h1>${esc(opts.title)}</h1>
  <div class="rule"></div>
  ${opts.body}
  <footer>
    ${esc(LEGAL_ENTITY)}<br>${esc(CONTACT)}<br>
    ${opts.footnote ? `${esc(opts.footnote)}<br>` : ""}
    Issued via Athlytica HQ · ${esc(new Date().toISOString().slice(0, 10))}
  </footer>
</div></body></html>`;
}

// ---------------------------------------------------------------------
// Athlete-facing documents
// ---------------------------------------------------------------------

export interface PassportAthlete {
  athleteCode: string;
  displayName: string;
  division?: string | null;
  team?: string | null;
  ageTier?: string | null;
  studentLevel?: string | null;
  gamesPlayed?: number | null;
  legacyPoints?: number | null;
  compositeScore?: number | null;
  compositeIndex?: number | null;
  certificateTier?: string | null;
  attendanceRatePct?: number | null;
  speedRating?: number | null;
  technicalRating?: number | null;
  guardianName?: string | null;
}

const cell = (k: string, v: unknown) =>
  `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${v === null || v === undefined || v === "" ? "—" : esc(v)}</div></div>`;

/**
 * NRHL Player Passport. Pillars with no measurement print "Not yet
 * measured" — Rubric EV-08 rule 3 forbids interpolating a number, and a
 * blank cell on a parent's document is more honest than a zero.
 */
export function playerPassport(a: PassportAthlete): string {
  const body = `
  <div class="grid">
    ${cell("Athlete code", a.athleteCode)}
    ${cell("Athlete", a.displayName)}
    ${cell("Conference", a.division ?? "Awaiting seeding")}
    ${cell("Squad", a.team ?? "Undrafted")}
  </div>
  <div class="grid">
    ${cell("Age tier", a.ageTier)}
    ${cell("Level", a.studentLevel)}
    ${cell("Certificate tier", a.certificateTier)}
    ${cell("Composite index", a.compositeIndex)}
  </div>

  <h2>Universal Taxonomy — five pillars</h2>
  <table>
    <thead><tr><th>Pillar</th><th>Measurement</th><th class="num">Value</th><th>Scale</th></tr></thead>
    <tbody>
      <tr><td>Speed</td><td>Speed band</td><td class="num">${a.speedRating ?? "Not yet measured"}</td><td>0–10 ordinal</td></tr>
      <tr><td>Agility</td><td class="muted" colspan="3">Not yet instrumented — shuttle, figure-8 and lateral asymmetry exist on paper capture sheets only.</td></tr>
      <tr><td>Stamina</td><td>Attendance rate</td><td class="num">${a.attendanceRatePct ?? "Not yet measured"}</td><td>0–100 %</td></tr>
      <tr><td>Technical Skill</td><td>Technical precision</td><td class="num">${a.technicalRating ?? "Not yet measured"}</td><td>−2 … +4 signed</td></tr>
      <tr><td>Cognitive / Tactical</td><td>Weighted league points</td><td class="num">${a.legacyPoints ?? "Not yet measured"}</td><td>NRHL-PTS-v1</td></tr>
    </tbody>
  </table>

  <h2>Scrimmage record</h2>
  <div class="grid">
    ${cell("Games played", a.gamesPlayed)}
    ${cell("Weighted points", a.legacyPoints)}
    ${cell("Composite score", a.compositeScore)}
  </div>
  <p class="muted">Weighted points follow the league scoring law: a goal built through a
  teammate scores 3, a solo goal scores 1, an assist scores 1. Shared attack is priced
  into the scoreboard at four to one.</p>

  <p><span class="badge">Verify at nairobihockey.com/verify</span></p>`;
  return page({
    eyebrow: "Nairobi Regional Hockey League · Digital Athlete Performance Profile",
    title: `Player Passport — ${a.displayName}`,
    body,
    footnote: `Passport ${a.athleteCode}. Performance data is internal to NRHL league operations and is not released to third parties without Academy Director approval.`,
  });
}

/** Completion certificate. Only issued where a tier was actually earned. */
export function completionCertificate(a: PassportAthlete): string {
  const body = `
  <div class="seal">
    <div class="eyebrow">Certificate of Completion</div>
    <div class="title">${esc(a.displayName)}</div>
    <p class="muted">${esc(a.athleteCode)}</p>
    <p>has completed the Athlytica performance block with the Nairobi Regional Hockey League
    and is recognised as</p>
    <p><span class="badge">${esc(a.certificateTier ?? "Core All-Rounder")}</span></p>
  </div>
  <div class="grid">
    ${cell("Composite score", a.compositeScore)}
    ${cell("Attendance", a.attendanceRatePct === null || a.attendanceRatePct === undefined ? null : `${a.attendanceRatePct}%`)}
    ${cell("Weighted points", a.legacyPoints)}
    ${cell("Games played", a.gamesPlayed)}
  </div>
  <p class="muted">Composite = attendance % + (20 × average coach grade) + weighted points
  (NRHL-COMP-v1). Tier is a percentile rank within the athlete's own discipline.</p>
  <div class="sig">
    <div><div class="field"></div><div class="muted">League Director</div></div>
    <div><div class="field"></div><div class="muted">Date</div></div>
  </div>`;
  return page({
    eyebrow: "Nairobi Regional Hockey League",
    title: "Athlytica Performance Certificate",
    body,
  });
}

// ---------------------------------------------------------------------
// Onboarding paperwork
// ---------------------------------------------------------------------

const blank = (label: string) => `<div class="muted">${esc(label)}</div><div class="field"></div>`;

/** Official registration form — closes the gaps in the live web funnel. */
export function registrationForm(prefill: Partial<PassportAthlete> = {}): string {
  const body = `
  <p>Complete in full. Fields marked * are required to register. Athletes who complete a
  development phase carry a performance record into the January 2027 league selection
  process; selection itself follows the league's published eligibility rules.</p>

  <h2>Athlete</h2>
  ${blank("Full legal name *")}
  ${prefill.athleteCode ? `<div class="muted">Athlete code</div><div class="field">${esc(prefill.athleteCode)}</div>` : blank("Athlete code (issued by Athlytica)")}
  ${blank("Date of birth (DD/MM/YYYY) *")}
  ${blank("Age tier — U8 / U12 / U15 *")}
  ${blank("Home territory / preferred conference — The Summit · The Ridge · The Plateau · The Savannah")}

  <h2>Parent or guardian</h2>
  ${blank("Full name *")}
  ${blank("Mobile number — format +254 7XX XXX XXX *")}
  ${blank("Email *")}
  ${blank("Home address (used to seed the athlete into their home territory) *")}
  ${blank("Emergency contact name and relationship *")}

  <h2>Package</h2>
  <table>
    <thead><tr><th>Select</th><th>Package</th><th class="num">Fee (KES)</th><th>Includes</th></tr></thead>
    <tbody>
      <tr><td>☐</td><td>Athlete Performance Assessment</td><td class="num">7,500</td><td>One 90-minute assessment; Digital Athlete Performance Profile and development priorities. Credited toward Performance or Elite if you enrol within 30 days</td></tr>
      <tr><td>☐</td><td>Performance Hockey Program</td><td class="num">27,500</td><td>3-month phase: 9 group sessions (120 min), 3 showcase scrimmages (120 min), the 90-minute assessment, progress tracking, facility fees, end-of-phase review</td></tr>
      <tr><td>☐</td><td>Elite Individual Development</td><td class="num">45,000</td><td>Everything in Performance plus 12 private coaching sessions (90 min) across the phase</td></tr>
    </tbody>
  </table>
  ${blank("Payment method — M-Pesa / Card / Bank transfer")}
  ${blank("Transaction reference")}

  <h2>Declarations</h2>
  <p>☐ I affirm the athlete has no undisclosed medical condition that would contraindicate
  high-intensity athletic activity.</p>
  <p>Media release — <strong>check one, this is required</strong>:<br>
  ☐ GRANTS use of name, image and video in NRHL and Athlytica marketing<br>
  ☐ DENIES marketing use — performance analysis only</p>
  <p>☐ I acknowledge the Athlete Code of Conduct and the liability release overleaf.</p>

  <div class="sig">
    <div><div class="field"></div><div class="muted">Guardian signature</div></div>
    <div><div class="field"></div><div class="muted">Date</div></div>
  </div>`;
  return page({ eyebrow: "NRHL · Pre-Season Registration", title: "Official Player Registration Form", body });
}

/** Medical and liability waiver — mirrors the signed paper agreement. */
export function liabilityWaiver(a: Partial<PassportAthlete> = {}): string {
  const body = `
  <p><strong>Service provider:</strong> ${esc(LEGAL_ENTITY)}<br>
  <strong>Athlete:</strong> ${esc(a.displayName ?? "____________________")} ${a.athleteCode ? `(${esc(a.athleteCode)})` : ""}<br>
  <strong>Guardian:</strong> ${esc(a.guardianName ?? "____________________")}</p>

  <h2>1 · Assumption of risk</h2>
  <p>Inline hockey is a contact sport played at speed. Sessions run on concrete, tile and
  outdoor surfaces and are exposed to weather. The guardian acknowledges the risk of
  collision, fall, abrasion and impact injury inherent to the activity and the surface.</p>

  <h2>2 · Release of liability</h2>
  <p>The guardian releases ${esc(LEGAL_ENTITY)}, Athlytica, the Nairobi Regional Hockey League
  and all host venues from claims arising from participation, <strong>except</strong> claims
  arising from gross negligence or wilful misconduct, which are expressly not released.</p>

  <h2>3 · Medical clearance</h2>
  <p>The guardian affirms the athlete carries no undisclosed medical condition that would
  contraindicate high-intensity athletic activity, and consents to first aid and emergency
  transport where a coach judges it necessary. The guardian is notified immediately on the
  contact number supplied.</p>
  ${blank("Known conditions, allergies or medication")}
  ${blank("Emergency contact — name, relationship, mobile")}

  <h2>4 · Media and data</h2>
  <p>Performance capture (including 4K video) is used for technical analysis, Performance ID
  generation and internal quality assurance. Marketing use is a separate, explicit election:</p>
  <p>☐ GRANTS marketing use &nbsp;&nbsp; ☐ DENIES marketing use — analysis only</p>
  <p>Biometric data, scores and footage are stored securely and are not shared with third
  parties without written guardian consent, other than as required for NRHL league operations.</p>

  <h2>5 · Conduct and refunds</h2>
  <p>Athletes arrive ten minutes early and engage fully. Breach of the Code of Conduct may
  result in removal without refund. No refunds within 48 hours of a scheduled pod;
  rescheduling is permitted with 72 hours' notice.</p>

  <div class="sig">
    <div><div class="field"></div><div class="muted">Guardian signature</div></div>
    <div><div class="field"></div><div class="muted">Date</div></div>
    <div><div class="field"></div><div class="muted">Guardian name (print)</div></div>
    <div><div class="field"></div><div class="muted">Emergency contact and relationship</div></div>
  </div>`;
  return page({
    eyebrow: "NRHL · Parent & Guardian Agreement",
    title: "Medical Clearance & Liability Waiver",
    body,
  });
}

/** Programme information handout given to families at intake. */
export function combineHandout(): string {
  const body = `
  <p>The Fall development and assessment phase runs <strong>August to October 2026</strong>.
  Athletes establish a baseline, train in small groups, play a showcase scrimmage each month
  and build the performance record they carry into the January 2027 league phase.</p>

  <h2>What is measured</h2>
  <table>
    <thead><tr><th>Pillar</th><th>What we capture</th></tr></thead>
    <tbody>
      <tr><td>Speed</td><td>10 m dash, 20 m top speed, acceleration profile</td></tr>
      <tr><td>Agility</td><td>5-10-5 shuttle, figure-8, crossover quality, lateral asymmetry</td></tr>
      <tr><td>Stamina</td><td>Work rate, perceived exertion, session load, attendance</td></tr>
      <tr><td>Technical Skill</td><td>Technical precision, full extension, low centre of gravity, target accuracy</td></tr>
      <tr><td>Cognitive / Tactical</td><td>Scan rate, blind-pass rate, shared-goal %, static violations, weak-side usage</td></tr>
    </tbody>
  </table>

  <h2>How scoring works</h2>
  <p>A goal built through a teammate is worth <strong>three</strong> points. A solo goal is
  worth <strong>one</strong>. An assist is worth <strong>one</strong>. A two-player goal
  therefore generates four points of team value against one for a solo finish. The league's
  doctrine — see first, connect fast, trust structure — is priced into the scoreboard.</p>

  <h2>Session shape — 120 minutes</h2>
  <ol>
    <li>Arrival, equipment check and setup — 10 min</li>
    <li>Off-court activation: agility, reaction, athleticism — 20 min</li>
    <li>Drill A — isolated technical, vision-led (not scored)</li>
    <li>Drill B — tactical and cognitive, 2v1 / 2v2 / 3v2 (scored)</li>
    <li>Drill C — small-area game, full rules (scored)</li>
    <li>Player-led debrief — 10 min</li>
  </ol>

  <h2>Conferences</h2>
  <table>
    <thead><tr><th>Conference</th><th>Territories</th></tr></thead>
    <tbody>
      <tr><td>The Summit</td><td>Muthaiga · Gigiri · Rosslyn</td></tr>
      <tr><td>The Ridge</td><td>Kyuna · Kitisuru · Spring Valley</td></tr>
      <tr><td>The Plateau</td><td>Karen · Lavington · Kilimani</td></tr>
      <tr><td>The Savannah</td><td>Embakasi · Ruiru · Kitengela</td></tr>
    </tbody>
  </table>

  <h2>From development to competition</h2>
  <ul>
    <li><strong>Aug – Oct 2026</strong> — development and assessment phase</li>
    <li><strong>Nov – Dec 2026</strong> — roster assignment and league preparation</li>
    <li><strong>January 2027</strong> — official league opening matchday</li>
  </ul>
  <p>Completing a development phase does not guarantee a draft position or league selection.
  Selection follows the league's published eligibility process.</p>

  <h2>Equipment</h2>
  <p>Athletes currently need their own inline hockey skates, protective equipment and a
  skating/hockey helmet. Full league play additionally requires a multi-impact certified
  helmet, wrist guards, elbow shields, shin guards and a stick cut to collarbone height. We
  are working toward equipment loan and purchase options from January 2027.</p>`;
  return page({
    eyebrow: "NRHL · Fall 2026 development phase",
    title: "Youth Inline Hockey Development — Information Handout",
    body,
  });
}

// ---------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------

export interface MatchdayReportInput {
  scrimmageId: string;
  playedOn: string | null;
  division: string | null;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  venue: string | null;
  notes: string | null;
  lines: {
    name: string;
    athleteCode: string;
    side: string | null;
    assistedGoals: number;
    soloGoals: number;
    assists: number;
    points: number;
    penaltyMinutes: number;
    conductNote: string | null;
  }[];
}

export function matchdaySummary(m: MatchdayReportInput): string {
  const scoreline =
    m.scoreA === null || m.scoreB === null
      ? "No score recorded"
      : `${esc(m.teamA)} ${m.scoreA} — ${m.scoreB} ${esc(m.teamB)}`;
  const rows = [...m.lines]
    .sort((a, b) => b.points - a.points)
    .map(
      (l) => `<tr>
        <td>${esc(l.name)}<div class="muted">${esc(l.athleteCode)}</div></td>
        <td>${esc(l.side ?? "—")}</td>
        <td class="num">${l.assistedGoals}</td><td class="num">${l.soloGoals}</td>
        <td class="num">${l.assists}</td><td class="num"><strong>${l.points}</strong></td>
        <td class="num">${l.penaltyMinutes}</td>
        <td>${esc(l.conductNote ?? "")}</td></tr>`,
    )
    .join("");

  const body = `
  <div class="grid">
    ${cell("Match", m.scrimmageId)}
    ${cell("Date", m.playedOn ?? "Not recorded")}
    ${cell("Conference", m.division ?? "Unassigned")}
    ${cell("Venue", m.venue ?? "Not recorded")}
  </div>
  <h2>${scoreline}</h2>
  <table>
    <thead><tr><th>Athlete</th><th>Side</th><th class="num">AG</th><th class="num">SG</th>
    <th class="num">A</th><th class="num">PTS</th><th class="num">PIM</th><th>Conduct</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="8" class="muted">No stat lines recorded.</td></tr>`}</tbody>
  </table>
  <p class="muted">AG assisted goals (×3) · SG solo goals (×1) · A assists (×1) · NRHL-PTS-v1.</p>
  ${m.notes ? `<h2>Coach notes</h2><p>${esc(m.notes)}</p>` : ""}`;
  return page({ eyebrow: "NRHL · Matchday Report", title: `Matchday Summary — ${m.scrimmageId}`, body });
}

export interface DigestInput {
  athlete: PassportAthlete;
  weekOf: string;
  matches: { scrimmageId: string; points: number; assistedGoals: number; soloGoals: number; assists: number }[];
  coachNote?: string | null;
}

/** Parent weekly developmental digest. */
export function parentDigest(d: DigestInput): string {
  const total = d.matches.reduce((s, m) => s + m.points, 0);
  const shared = d.matches.reduce((s, m) => s + m.assistedGoals, 0);
  const solo = d.matches.reduce((s, m) => s + m.soloGoals, 0);
  const body = `
  <p>Week of ${esc(d.weekOf)} for <strong>${esc(d.athlete.displayName)}</strong> (${esc(d.athlete.athleteCode)}).</p>
  <div class="grid">
    ${cell("Sessions logged", d.matches.length)}
    ${cell("Weighted points", total)}
    ${cell("Shared goals", shared)}
    ${cell("Solo goals", solo)}
  </div>
  <h2>Session by session</h2>
  <table>
    <thead><tr><th>Match</th><th class="num">Shared</th><th class="num">Solo</th>
    <th class="num">Assists</th><th class="num">Points</th></tr></thead>
    <tbody>${
      d.matches
        .map(
          (m) =>
            `<tr><td>${esc(m.scrimmageId)}</td><td class="num">${m.assistedGoals}</td>
             <td class="num">${m.soloGoals}</td><td class="num">${m.assists}</td>
             <td class="num"><strong>${m.points}</strong></td></tr>`,
        )
        .join("") || `<tr><td colspan="5" class="muted">No sessions logged this week.</td></tr>`
    }</tbody>
  </table>
  <p class="muted">Shared goals are weighted three times a solo goal. A rising shared-goal
  count is the signal we care about most — it means the athlete is building attacks through
  teammates rather than carrying alone.</p>
  ${d.coachNote ? `<h2>Coach note</h2><p>${esc(d.coachNote)}</p>` : ""}`;
  return page({ eyebrow: "NRHL · Parent Digest", title: "Weekly Development Digest", body });
}

export interface DivisionReportInput {
  division: string;
  standings: { team: string; gp: number; w: number; otW: number; l: number; otL: number; d: number; gf: number; ga: number; gd: number; pts: number }[];
  leaders: { name: string; athleteCode: string; points: number | null; goals: number | null; assists: number | null }[];
}

export function divisionReport(r: DivisionReportInput): string {
  const body = `
  <h2>Standings</h2>
  <table>
    <thead><tr><th>Team</th><th class="num">GP</th><th class="num">W</th><th class="num">OTW</th>
    <th class="num">L</th><th class="num">OTL</th><th class="num">D</th><th class="num">GF</th>
    <th class="num">GA</th><th class="num">GD</th><th class="num">PTS</th></tr></thead>
    <tbody>${
      r.standings
        .map(
          (s) =>
            `<tr><td>${esc(s.team)}</td><td class="num">${s.gp}</td><td class="num">${s.w}</td>
             <td class="num">${s.otW}</td><td class="num">${s.l}</td><td class="num">${s.otL}</td>
             <td class="num">${s.d}</td><td class="num">${s.gf}</td><td class="num">${s.ga}</td>
             <td class="num">${s.gd > 0 ? "+" : ""}${s.gd}</td><td class="num"><strong>${s.pts}</strong></td></tr>`,
        )
        .join("") || `<tr><td colspan="11" class="muted">No scored matches in this conference yet.</td></tr>`
    }</tbody>
  </table>
  <p class="muted">Win 3 · overtime win 2 · overtime loss 1 · draw 1 · loss 0. Team-level
  point weighting is a league decision pending ratification; it exists in no source document.</p>

  <h2>Scoring leaders</h2>
  <table>
    <thead><tr><th>Athlete</th><th class="num">G</th><th class="num">A</th><th class="num">PTS</th></tr></thead>
    <tbody>${
      r.leaders
        .map(
          (l) =>
            `<tr><td>${esc(l.name)}<div class="muted">${esc(l.athleteCode)}</div></td>
             <td class="num">${l.goals ?? "—"}</td><td class="num">${l.assists ?? "—"}</td>
             <td class="num"><strong>${l.points ?? "—"}</strong></td></tr>`,
        )
        .join("") || `<tr><td colspan="4" class="muted">No scoring records yet.</td></tr>`
    }</tbody>
  </table>`;
  return page({ eyebrow: "NRHL · Conference Report", title: `${r.division} — Division Report`, body });
}

// ---------------------------------------------------------------------
// Browser handoff
// ---------------------------------------------------------------------

/**
 * Opens a generated document in a new tab and triggers the print dialog,
 * where the user chooses "Save as PDF". Uses a blob URL rather than
 * document.write so the popup carries a real origin and can be saved
 * directly. Returns false when a popup blocker eats the window.
 */
export function openPrintable(html: string, autoPrint = true): boolean {
  if (typeof window === "undefined") return false;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const tab = window.open(url, "_blank", "noopener");
  if (!tab) {
    URL.revokeObjectURL(url);
    return false;
  }
  if (autoPrint) {
    tab.addEventListener("load", () => tab.print(), { once: true });
  }
  // Revoke late: the tab needs the URL alive until it has parsed.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
