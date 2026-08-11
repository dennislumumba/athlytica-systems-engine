"use client";

// =====================================================================
// NRHL ATHLETE REGISTRATION — /register
//
// This page belongs to the Nairobi Regional Hockey League and sells
// exactly the three programmes nairobihockey.com advertises: Assessment,
// Performance, Elite. A parent arriving here has already read those
// names and prices on the marketing site; meeting a different vocabulary
// at the checkout is how a funnel loses people at the last step.
//
// WHAT IS DELIBERATELY NOT HERE:
//   * Big Ice academy cohorts and the Athlytica institutional licence.
//     They are a different buyer with a different decision, and mixing a
//     KES 150,000 campus licence into a parent's radio list is how the
//     old page ended up defaulting a 7,500 assessment to 27,500. They
//     live at /register/academy; deep links carrying ?source=bigice,
//     ?package= or ?tier=enterprise_150k are redirected there.
//
// ORDER OF THE PAGE (the sequence a parent actually thinks in):
//   programme → what's included → price → athlete → schedule → pay
// The payment section does not exist until a programme is chosen, so the
// amount on the button is never ambiguous and never hard-coded.
//
// MONEY: the charge is still derived server-side from the tier id by
// /api/v1/biz/stk-push. Nothing this file renders can set a price.
// =====================================================================

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const PAYBILL = "4325935";
const ADMISSIONS_PHONE = "+254 724 324 529";
const ADMISSIONS_WA = "254724324529";
const ADMISSIONS_EMAIL = "dennis@bigice.co.ke";
const POLL_INTERVAL_MS = 3_000;

const kes = (n: number) => `Ksh ${n.toLocaleString("en-KE")}`;

// ---------------------------------------------------------------- offer

interface Programme {
  id: "baseline_7500" | "combine_27500" | "acceleration_45000";
  name: string;
  amountKes: number;
  term: string;
  badge: string;
  featured?: boolean;
  bestFor: string;
  /** Spelled out rather than derived from `name` — the button text is copy. */
  cta: string;
  hours: string;
  includes: string[];
  /** Condensed lines for the order summary. */
  summary: string[];
}

const PROGRAMMES: Programme[] = [
  {
    id: "baseline_7500",
    name: "Athlete Performance Assessment",
    amountKes: 7_500,
    term: "One-time · 90-minute assessment",
    badge: "Start here",
    bestFor:
      "Families who want to establish the athlete's starting point before committing to a development phase.",
    cta: "Select assessment",
    hours: "1.5 hours scheduled",
    includes: [
      "90-minute performance assessment",
      "Baseline measurements",
      "Digital Athlete Performance Profile",
      "Coach observations",
      "Development priorities",
    ],
    summary: ["90-minute assessment", "Digital athlete profile", "Development priorities"],
  },
  {
    id: "combine_27500",
    name: "Performance Hockey",
    amountKes: 27_500,
    term: "3-month development phase",
    badge: "Most popular",
    featured: true,
    bestFor:
      "Athletes who want structured group hockey development and regular game experience.",
    cta: "Select Performance",
    hours: "25.5 hours of scheduled programme exposure",
    includes: [
      "9 × 120-minute group training sessions",
      "3 × 120-minute showcase scrimmages",
      "90-minute initial assessment",
      "Digital Athlete Performance Profile",
      "Ongoing progress tracking",
      "End-of-phase progress review",
      "Facility fees",
    ],
    summary: [
      "9 group training sessions",
      "3 showcase scrimmages",
      "90-minute assessment",
      "Digital athlete profile",
      "Progress tracking",
      "End-of-phase review",
      "Facility fees",
    ],
  },
  {
    id: "acceleration_45000",
    name: "Elite Individual Development",
    amountKes: 45_000,
    term: "3-month development phase",
    badge: "Individual coaching",
    bestFor:
      "Athletes who want individual coaching in addition to the group development environment.",
    cta: "Select Elite",
    hours: "43.5 hours of scheduled programme exposure",
    includes: [
      "9 × 120-minute group training sessions",
      "12 × 90-minute private coaching sessions",
      "3 × 120-minute showcase scrimmages",
      "90-minute initial assessment",
      "Digital Athlete Performance Profile",
      "Ongoing progress tracking",
      "Movement / video review where appropriate",
      "End-of-phase progress review",
      "Facility fees",
    ],
    summary: [
      "9 group training sessions",
      "12 private coaching sessions",
      "3 showcase scrimmages",
      "90-minute assessment",
      "Digital athlete profile",
      "Progress tracking",
      "End-of-phase review",
      "Facility fees",
    ],
  },
];

const HUBS = [
  { value: "The Summit", label: "The Summit", where: "Around Rosslyn Academy" },
  { value: "The Ridge", label: "The Ridge", where: "Spring Valley Community Court" },
  { value: "The Plateau", label: "The Plateau", where: "Lavington Community Hub" },
  { value: "The Savannah", label: "The Savannah", where: "Embakasi Multisport Centre" },
  { value: "Flexible", label: "I'm flexible", where: "Nearest available slot" },
];

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const TIME_SLOTS = [
  "After school (3:00pm–6:00pm)",
  "Saturday morning",
  "Saturday afternoon",
  "Sunday morning",
  "Sunday afternoon",
  "Flexible",
];

const SKATING_LEVELS = [
  "Complete beginner — cannot skate yet",
  "Can skate forward, still learning to stop",
  "Skates confidently, stops and turns",
  "Strong skater — crossovers and backward skating",
];

const HOCKEY_LEVELS = [
  "None",
  "Some informal play",
  "Has trained in hockey before",
  "Plays ice or inline hockey regularly",
];

// --------------------------------------------------------------- theme

const INK = "#07121f";
const PANEL = "#0e1a2b";
const LINE = "#22334d";
const GOLD = "#d4af37";
const TEXT = "#dbe6f3";
const MUTED = "#8ea3bd";

type Phase =
  | { name: "form" }
  | { name: "pushing" }
  | {
      name: "awaiting_pin";
      registrationId: string;
      accountReference: string;
      amountKes: number;
      stkDispatched: boolean;
    }
  | { name: "paid"; receipt: string | null; accountReference: string }
  | { name: "error"; message: string };

function RegistrationPage() {
  const router = useRouter();
  const params = useSearchParams();

  // Anything that is not one of the three athlete programmes belongs to
  // the other funnel. Redirect rather than 404 — these links are printed
  // on bigice.co.ke and in the schools section of nairobihockey.com.
  const urlTier = params.get("tier");
  const belongsToAcademy =
    params.get("source") === "bigice" ||
    params.get("package") !== null ||
    urlTier === "enterprise_150k";
  useEffect(() => {
    if (belongsToAcademy) router.replace(`/register/academy?${params.toString()}`);
  }, [belongsToAcademy, params, router]);

  // "auto" = nobody has chosen yet, so the ?tier= in the link decides.
  // This CANNOT be a useState initializer: useSearchParams is empty on the
  // first client render, the initializer runs exactly once against that
  // empty value, and a parent arriving from "Join Performance — Ksh 27,500"
  // would land on an unselected page. Derived every render instead.
  // "none" is the explicit clear, so Change program beats the URL.
  const [choice, setChoice] = useState<Programme["id"] | "auto" | "none">("auto");
  const programme = useMemo(() => {
    if (choice === "none") return null;
    const id = choice === "auto" ? urlTier : choice;
    return PROGRAMMES.find((p) => p.id === id) ?? null;
  }, [choice, urlTier]);

  const [parentName, setParentName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [athleteAge, setAthleteAge] = useState("");
  const [canSkate, setCanSkate] = useState<"" | "YES" | "NO" | "UNSURE">("");
  const [skating, setSkating] = useState("");
  const [hockey, setHockey] = useState("");
  const [hub, setHub] = useState("");
  const [days, setDays] = useState<string[]>([]);
  const [timeSlot, setTimeSlot] = useState("");
  const [notes, setNotes] = useState("");

  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A REF, not the phase, is the in-flight latch. `setPhase` is async:
  // three impatient clicks in one tick all read the same stale "form"
  // phase and all get through, which sent three STK prompts to one
  // parent's handset. A ref flips synchronously on the first click.
  const inFlight = useRef(false);
  const submitting = phase.name === "pushing";

  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    [],
  );

  const detailsComplete =
    parentName.trim().length > 1 &&
    phoneNumber.trim().length > 8 &&
    /\S+@\S+\.\S+/.test(parentEmail) &&
    athleteName.trim().length > 1 &&
    athleteAge !== "" &&
    canSkate !== "" &&
    skating !== "" &&
    hockey !== "" &&
    hub !== "" &&
    timeSlot !== "";

  function toggleDay(d: string) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function startPolling(registrationId: string, accountReference: string) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/biz/check-status?registrationId=${registrationId}`);
        if (!res.ok) return;
        const body = (await res.json()) as { status?: string; mpesaReceipt?: string | null };
        if (body.status === "PAID") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase({ name: "paid", receipt: body.mpesaReceipt ?? null, accountReference });
        }
      } catch {
        // transient poll failure — the next tick retries
      }
    }, POLL_INTERVAL_MS);
  }

  /**
   * The scheduling and experience answers have no column on
   * `registrations` yet, so they cannot ride the STK payload — its schema
   * is `.strict()` and would reject them. They are not thrown away: the
   * confirmation screen hands them to admissions over WhatsApp, which is
   * how sessions are actually scheduled today. Persisting them properly
   * is one nullable column and one optional schema field.
   */
  const intakeSummary = () =>
    [
      `Athlete: ${athleteName} (age ${athleteAge})`,
      `Parent: ${parentName} — ${phoneNumber}`,
      `Programme: ${programme?.name}`,
      `Hub: ${hub}`,
      `Skating: ${skating}`,
      `Hockey: ${hockey}`,
      days.length ? `Preferred days: ${days.join(", ")}` : null,
      `Preferred time: ${timeSlot}`,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!programme || inFlight.current) return;
    inFlight.current = true;
    setPhase({ name: "pushing" });
    try {
      const res = await fetch("/api/v1/biz/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          tier: programme.id, // amount is NOT sent — the server prices it
          athleteName,
          parentName,
          parentEmail,
          ...(athleteAge ? { athleteAge: Number(athleteAge) } : {}),
          preferredCampus: hub,
          source: "nrhl",
        }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        status?: string;
        error?: string;
        registrationId?: string;
        accountReference?: string;
        amountKes?: number;
        stkPush?: { dispatched: boolean };
      };
      if (!res.ok || !body.success || !body.registrationId) {
        // A fail-closed config error is a message to us, not to a parent
        // holding a phone. Never surface the reason; log it and route the
        // family to a human.
        const sealed =
          res.status === 503 || body.status === "CONFIG_DEBT" || body.status === "SCHEMA_DEBT";
        if (sealed) {
          console.error("[register] checkout sealed:", body.status, body.error);
          inFlight.current = false;
          setPhase({
            name: "error",
            message:
              "Registration is temporarily unavailable. Please try again shortly, or contact the " +
              `NRHL registration team on ${ADMISSIONS_PHONE} and we will complete it with you.`,
          });
          return;
        }
        inFlight.current = false;
        setPhase({
          name: "error",
          message: body.error ?? "Registration could not be started. Please try again.",
        });
        return;
      }
      setPhase({
        name: "awaiting_pin",
        registrationId: body.registrationId,
        accountReference: body.accountReference ?? "—",
        amountKes: body.amountKes ?? programme.amountKes,
        stkDispatched: body.stkPush?.dispatched ?? false,
      });
      startPolling(body.registrationId, body.accountReference ?? "—");
    } catch {
      inFlight.current = false;
      setPhase({ name: "error", message: "Network error — please try again." });
    }
  }

  // ------------------------------------------------------- confirmation

  if (phase.name === "paid") {
    return (
      <Shell>
        <section style={{ ...panelStyle, padding: 32, maxWidth: 760, margin: "0 auto" }}>
          <p style={eyebrow}>Nairobi Regional Hockey League</p>
          <h1 style={{ ...h1Style, fontSize: 34 }}>Athlete registration complete</h1>
          <p style={{ color: TEXT, fontSize: 16, lineHeight: 1.7 }}>
            Your athlete&apos;s place in the selected development program has been registered.
          </p>

          <dl style={factGrid}>
            <Fact k="Athlete" v={athleteName} />
            <Fact k="Program" v={programme?.name ?? "—"} />
            <Fact k="Training hub" v={hub} />
            <Fact k="Registration reference" v={phase.accountReference} />
            <Fact k="Payment reference" v={phase.receipt ?? "Confirming with M-Pesa"} />
          </dl>

          <div style={noticeStyle}>
            {programme?.id === "baseline_7500" ? (
              <p style={{ margin: 0 }}>
                <strong style={{ color: "#fff" }}>Your next step</strong> is to confirm your
                assessment slot. The NRHL registration team will contact you with the available
                times at {hub}.
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                <strong style={{ color: "#fff" }}>Your next step:</strong> your initial Athlete
                Performance Assessment will be scheduled as part of your program. The NRHL
                registration team will contact you with the confirmed training schedule and
                first-session details.
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24 }}>
            <a
              href={`https://wa.me/${ADMISSIONS_WA}?text=${encodeURIComponent(
                `NRHL registration ${phase.accountReference}\n\n${intakeSummary()}`,
              )}`}
              target="_blank"
              rel="noopener"
              style={primaryBtn}
            >
              Contact NRHL
            </a>
            <a href="https://www.nairobihockey.com/#programs" style={ghostBtn}>
              Return to programs
            </a>
          </div>
          <p style={{ color: MUTED, fontSize: 13, marginTop: 18, lineHeight: 1.7 }}>
            Keep your registration reference — it identifies this registration in every NRHL
            communication. Your scheduling preferences are included in the message above so the
            team can confirm your slot.
          </p>
        </section>
      </Shell>
    );
  }

  // ------------------------------------------------------ awaiting M-Pesa

  if (phase.name === "awaiting_pin") {
    return (
      <Shell>
        <section style={{ ...panelStyle, padding: 32, maxWidth: 640, margin: "0 auto" }}>
          <p style={eyebrow}>Nairobi Regional Hockey League</p>
          <h1 style={{ ...h1Style, fontSize: 30 }}>Approve the M-Pesa prompt</h1>
          <p style={{ color: TEXT, lineHeight: 1.7 }}>
            {phase.stkDispatched
              ? `A request for ${kes(phase.amountKes)} has been sent to ${phoneNumber}. Enter your M-Pesa PIN to complete the registration — this screen updates by itself.`
              : `We could not send the prompt automatically. Pay ${kes(phase.amountKes)} manually using the details below and this screen will update once it settles.`}
          </p>

          <div style={{ ...noticeStyle, marginTop: 20 }}>
            <p style={{ margin: "0 0 8px", color: MUTED, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Didn&apos;t get the prompt? Pay manually
            </p>
            <p style={{ margin: 0, lineHeight: 1.9 }}>
              M-Pesa → Lipa na M-Pesa → Paybill
              <br />
              Business number: <strong style={{ color: "#fff" }}>{PAYBILL}</strong>
              <br />
              Account: <strong style={{ color: "#fff" }}>{phase.accountReference}</strong>
              <br />
              Amount: <strong style={{ color: "#fff" }}>{kes(phase.amountKes)}</strong>
            </p>
            <p style={{ margin: "10px 0 0", color: MUTED, fontSize: 13 }}>
              Pay from {phoneNumber} so the payment matches this registration.
            </p>
          </div>

          <p style={{ color: MUTED, fontSize: 13, marginTop: 18 }}>
            Checking for confirmation every few seconds. Do not refresh — your place is already
            reserved against reference {phase.accountReference}.
          </p>
        </section>
      </Shell>
    );
  }

  // -------------------------------------------------------------- form

  return (
    <Shell>
      <header style={{ marginBottom: 28 }}>
        <p style={eyebrow}>Nairobi Regional Hockey League</p>
        <p style={{ ...kicker, marginBottom: 10 }}>Athlete registration</p>
        <h1 style={h1Style}>Register your athlete</h1>
        <p style={{ color: TEXT, fontSize: 17, lineHeight: 1.7, maxWidth: "60ch" }}>
          Choose your development program, provide your athlete&apos;s details and select from
          available training options.
        </p>
        <p style={{ color: MUTED, fontSize: 14, marginTop: 8 }}>
          Structured youth inline hockey development for athletes ages 8–15.
        </p>
      </header>

      <figure style={{ margin: "0 0 32px" }}>
        <img
          src="/nrhl-hero.jpg"
          alt="An NRHL coach working with young athletes at a Nairobi training session"
          className="nrhl-hero"
        />
      </figure>

      {phase.name === "error" && (
        <div role="alert" style={errorStyle}>
          {phase.message}
        </div>
      )}

      <div className="nrhl-layout">
        <div>
          {/* ---------------------------------------------- 1. programme */}
          <StepHeading n="1" title="Choose your program" />

          {!programme ? (
            <div className="nrhl-cards">
              {PROGRAMMES.map((p) => (
                <article
                  key={p.id}
                  style={{
                    ...panelStyle,
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    borderColor: p.featured ? GOLD : LINE,
                    borderWidth: p.featured ? 2 : 1,
                  }}
                >
                  <span
                    style={{
                      alignSelf: "flex-start",
                      background: p.featured ? GOLD : "rgba(255,255,255,0.08)",
                      color: p.featured ? INK : TEXT,
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: "0.14em",
                      textTransform: "uppercase",
                      padding: "5px 12px",
                      borderRadius: 999,
                      marginBottom: 14,
                    }}
                  >
                    {p.badge}
                  </span>
                  <h2 style={{ margin: "0 0 6px", fontSize: 19, color: "#fff" }}>{p.name}</h2>
                  <p style={{ margin: "0 0 12px", fontSize: 30, fontWeight: 800, color: "#fff" }}>
                    {kes(p.amountKes)}
                  </p>
                  <p style={{ margin: "0 0 14px", color: MUTED, fontSize: 13 }}>{p.term}</p>
                  <p style={hoursPill}>{p.hours}</p>
                  <ul style={listStyle}>
                    {p.includes.map((f) => (
                      <li key={f} style={listItem}>
                        <span style={{ color: GOLD }}>✓</span> {f}
                      </li>
                    ))}
                  </ul>
                  <p style={{ color: MUTED, fontSize: 13, lineHeight: 1.6, margin: "6px 0 18px" }}>
                    <strong style={{ color: TEXT }}>Best for:</strong> {p.bestFor}
                  </p>
                  <button
                    type="button"
                    onClick={() => setChoice(p.id)}
                    style={p.featured ? { ...primaryBtn, width: "100%" } : { ...ghostBtn, width: "100%" }}
                  >
                    {p.cta}
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <section style={{ ...panelStyle, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <p style={{ ...kicker, marginBottom: 6 }}>Your selection</p>
                  <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "#fff" }}>{programme.name}</h2>
                  <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: GOLD }}>
                    {kes(programme.amountKes)}
                  </p>
                  <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13 }}>{programme.term}</p>
                </div>
                <button type="button" onClick={() => setChoice("none")} style={ghostBtn}>
                  Change program
                </button>
              </div>
              <ul style={{ ...listStyle, marginTop: 16 }}>
                {programme.summary.map((s) => (
                  <li key={s} style={listItem}>
                    <span style={{ color: GOLD }}>✓</span> {s}
                  </li>
                ))}
              </ul>

              {programme.id === "baseline_7500" && (
                <div style={creditStyle}>
                  <strong style={{ display: "block", color: "#f0dfa8", marginBottom: 4 }}>
                    Assessment credit
                  </strong>
                  If you enroll in Performance or Elite within 30 days of completing your
                  assessment, your {kes(7_500)} assessment fee is credited toward the program fee.
                </div>
              )}

              {programme.id === "combine_27500" && (
                <div style={{ ...noticeStyle, marginTop: 16 }}>
                  <p style={{ ...kicker, margin: "0 0 8px" }}>How the 3-month phase works</p>
                  <p style={{ margin: 0, lineHeight: 1.8 }}>
                    Month 1 — 3 group sessions + 1 showcase
                    <br />
                    Month 2 — 3 group sessions + 1 showcase
                    <br />
                    Month 3 — 3 group sessions + 1 showcase
                  </p>
                  <p style={{ margin: "10px 0 0", color: MUTED, fontSize: 13 }}>
                    The showcase replaces the normal group training session during the final week
                    of each month — it is not an extra session to find time for.
                  </p>
                </div>
              )}

              {programme.id === "acceleration_45000" && (
                <div style={{ ...noticeStyle, marginTop: 16 }}>
                  <p style={{ ...kicker, margin: "0 0 8px" }}>How Elite works</p>
                  <p style={{ margin: 0, lineHeight: 1.8 }}>
                    9 group training sessions + 12 private coaching sessions + 3 showcase
                    scrimmages + the 90-minute assessment.
                  </p>
                  <p style={{ margin: "10px 0 0", color: MUTED, fontSize: 13 }}>
                    Private sessions are scheduled according to available coaching slots, and do
                    not have to fall on a showcase day.
                  </p>
                </div>
              )}
            </section>
          )}

          {/* ------------------------------------------------ 2. details */}
          {programme && (
            <form onSubmit={onSubmit}>
              <StepHeading n="2" title="Athlete details" />

              <div style={{ ...noticeStyle, marginBottom: 18 }}>
                <p style={{ ...kicker, margin: "0 0 8px" }}>Who is this program for?</p>
                <p style={{ margin: 0, lineHeight: 1.7 }}>
                  This program is for athletes ages 8–15 who already have basic skating ability.
                  Complete beginners should first complete foundational skating training before
                  entering competitive inline hockey development.
                </p>
              </div>

              <div className="nrhl-fields">
                <Field label="Parent / guardian name" required>
                  <input style={input} value={parentName} onChange={(e) => setParentName(e.target.value)} required autoComplete="name" />
                </Field>
                <Field label="Phone number" required hint="The M-Pesa prompt goes to this number.">
                  <input style={input} value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} required inputMode="tel" placeholder="07XX XXX XXX" autoComplete="tel" />
                </Field>
                <Field label="Email address" required>
                  <input style={input} type="email" value={parentEmail} onChange={(e) => setParentEmail(e.target.value)} required autoComplete="email" />
                </Field>
                <Field label="Athlete name" required>
                  <input style={input} value={athleteName} onChange={(e) => setAthleteName(e.target.value)} required />
                </Field>
                <Field label="Athlete age" required>
                  <input style={input} type="number" min={4} max={18} value={athleteAge} onChange={(e) => setAthleteAge(e.target.value)} required />
                </Field>
                <Field label="Does your child already have basic skating ability?" required>
                  <select style={input} value={canSkate} onChange={(e) => setCanSkate(e.target.value as typeof canSkate)} required>
                    <option value="">Select…</option>
                    <option value="YES">Yes</option>
                    <option value="NO">No</option>
                    <option value="UNSURE">Not sure</option>
                  </select>
                </Field>
                <Field label="Current skating experience" required>
                  <select style={input} value={skating} onChange={(e) => setSkating(e.target.value)} required>
                    <option value="">Select…</option>
                    {SKATING_LEVELS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Current hockey experience" required>
                  <select style={input} value={hockey} onChange={(e) => setHockey(e.target.value)} required>
                    <option value="">Select…</option>
                    {HOCKEY_LEVELS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </Field>
              </div>

              {canSkate === "NO" && (
                <div style={{ ...noticeStyle, borderColor: "#3d6fa5", background: "rgba(43,143,214,0.12)" }}>
                  Your athlete may be better suited to our beginner skating pathway first. Complete
                  this registration and we can recommend the appropriate starting point before any
                  session is scheduled.
                </div>
              )}

              {/* -------------------------------------- 3. hub & schedule */}
              <StepHeading n="3" title="Training hub & schedule" />

              <Field label="Preferred training hub" required>
                <select style={input} value={hub} onChange={(e) => setHub(e.target.value)} required>
                  <option value="">Select…</option>
                  {HUBS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label} — {h.where}
                    </option>
                  ))}
                </select>
              </Field>
              <p style={{ color: MUTED, fontSize: 13, margin: "8px 0 20px" }}>
                Training hubs and session times are subject to cohort and coaching availability.
              </p>

              <div style={{ ...noticeStyle, marginBottom: 18 }}>
                <p style={{ ...kicker, margin: "0 0 8px" }}>When training happens</p>
                <p style={{ margin: 0, lineHeight: 1.9 }}>
                  After school — 3:00pm–6:00pm
                  <br />
                  Weekends — 9:00am–7:00pm
                  <br />
                  Showcase scrimmages — generally weekends from approximately 11:00am
                </p>
                <p style={{ margin: "10px 0 0", color: MUTED, fontSize: 13 }}>
                  Families select from available training slots inside these windows.
                </p>
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: "0 0 18px" }}>
                <legend style={{ ...labelStyle, padding: 0 }}>Preferred day(s)</legend>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {DAYS.map((d) => {
                    const on = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        aria-pressed={on}
                        style={{
                          padding: "9px 14px",
                          borderRadius: 999,
                          cursor: "pointer",
                          fontSize: 13.5,
                          fontWeight: 600,
                          border: `1px solid ${on ? GOLD : LINE}`,
                          background: on ? "rgba(212,175,55,0.16)" : "transparent",
                          color: on ? "#f0dfa8" : TEXT,
                        }}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              <Field label="Preferred time" required>
                <select style={input} value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} required>
                  <option value="">Select…</option>
                  {TIME_SLOTS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>

              <Field label="Anything the coach should know?">
                <textarea
                  style={{ ...input, minHeight: 88, resize: "vertical" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="School timetable, other sports, medical notes, siblings training together."
                />
              </Field>

              {/* ------------------------------------------- 4. payment */}
              <StepHeading n="4" title="Secure your athlete's place" />

              <div className="nrhl-summary-mobile">
                <OrderSummary programme={programme} />
              </div>

              <button
                type="submit"
                disabled={!detailsComplete || submitting}
                style={{
                  ...primaryBtn,
                  width: "100%",
                  opacity: !detailsComplete || submitting ? 0.5 : 1,
                  cursor: !detailsComplete || submitting ? "not-allowed" : "pointer",
                }}
              >
                {submitting
                  ? "Sending M-Pesa prompt…"
                  : `Complete registration — ${kes(programme.amountKes)}`}
              </button>
              {!detailsComplete && (
                <p style={{ color: MUTED, fontSize: 13, marginTop: 10 }}>
                  Complete the required details above to continue.
                </p>
              )}

              <p style={{ color: MUTED, fontSize: 13, marginTop: 16, lineHeight: 1.7 }}>
                <strong style={{ color: TEXT }}>Secure registration.</strong> Your registration
                information is handled securely. Payment is taken by M-Pesa — you will approve a
                prompt on your phone for exactly {kes(programme.amountKes)}.
              </p>
            </form>
          )}
        </div>

        {/* ------------------------------------------- desktop summary */}
        {programme && (
          <aside className="nrhl-summary-desktop">
            <OrderSummary programme={programme} />
          </aside>
        )}
      </div>

      <footer style={{ marginTop: 44, paddingTop: 20, borderTop: `1px solid ${LINE}`, color: MUTED, fontSize: 13, lineHeight: 1.8 }}>
        <strong style={{ color: "#fff", display: "block" }}>NRHL</strong>
        Nairobi Regional Hockey League · Youth inline hockey athlete development, Nairobi
        <br />
        Registration team: {ADMISSIONS_PHONE} · {ADMISSIONS_EMAIL}
        <br />
        <span style={{ fontSize: 12 }}>
          Operated by Big Ice Inline Fitness. Performance tracking by Athlytica.
        </span>
      </footer>
    </Shell>
  );
}

// ------------------------------------------------------------- pieces

function OrderSummary({ programme }: { programme: Programme }) {
  return (
    <div style={{ ...panelStyle, padding: 22 }}>
      <p style={{ ...kicker, marginBottom: 10 }}>Your program</p>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: "#fff" }}>{programme.name}</h2>
      <p style={{ margin: "0 0 2px", fontSize: 28, fontWeight: 800, color: "#fff" }}>
        {kes(programme.amountKes)}
      </p>
      <p style={{ margin: "0 0 16px", color: MUTED, fontSize: 13 }}>{programme.term}</p>
      <ul style={listStyle}>
        {programme.summary.map((s) => (
          <li key={s} style={listItem}>
            <span style={{ color: GOLD }}>✓</span> {s}
          </li>
        ))}
      </ul>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginTop: 16,
          paddingTop: 14,
          borderTop: `1px solid ${LINE}`,
        }}
      >
        <span style={{ ...kicker, margin: 0 }}>Total</span>
        <strong style={{ fontSize: 22, color: "#fff" }}>{kes(programme.amountKes)}</strong>
      </div>
    </div>
  );
}

function StepHeading({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "34px 0 16px" }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: "rgba(212,175,55,0.16)",
          color: GOLD,
          fontWeight: 800,
          fontSize: 14,
          flex: "0 0 auto",
        }}
      >
        {n}
      </span>
      <h2 style={{ margin: 0, fontSize: 20, color: "#fff" }}>{title}</h2>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={labelStyle}>
        {label}
        {required && <span style={{ color: GOLD }}> *</span>}
      </span>
      {children}
      {hint && <span style={{ display: "block", color: MUTED, fontSize: 12, marginTop: 4 }}>{hint}</span>}
    </label>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: "10px 0" }}>
      <dt style={{ ...kicker, margin: "0 0 4px" }}>{k}</dt>
      <dd style={{ margin: 0, color: "#fff", fontSize: 15, fontWeight: 600 }}>{v}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 10% 0%, rgba(212,175,55,0.10), transparent 40%), ${INK}`,
        color: TEXT,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: "40px 20px 60px",
      }}
    >
      <style>{`
        .nrhl-hero {
          width: 100%;
          height: auto;
          aspect-ratio: 21 / 9;
          object-fit: cover;
          object-position: center 35%;
          border-radius: 18px;
          border: 1px solid ${LINE};
          display: block;
        }
        .nrhl-layout { display: block; max-width: 1120px; margin: 0 auto; }
        .nrhl-cards { display: grid; gap: 16px; grid-template-columns: 1fr; }
        .nrhl-fields { display: grid; gap: 0 16px; grid-template-columns: 1fr; }
        .nrhl-summary-desktop { display: none; }
        .nrhl-summary-mobile { margin-bottom: 18px; }
        @media (min-width: 720px) {
          .nrhl-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .nrhl-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .nrhl-hero { aspect-ratio: 21 / 8; }
        }
        @media (min-width: 1000px) {
          .nrhl-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 32px; align-items: start; }
          .nrhl-summary-desktop { display: block; position: sticky; top: 24px; }
          .nrhl-summary-mobile { display: none; }
        }
      `}</style>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>{children}</div>
    </main>
  );
}

// -------------------------------------------------------------- styles

const panelStyle: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
};

const h1Style: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 40,
  lineHeight: 1.1,
  color: "#fff",
  letterSpacing: "-0.02em",
};

const eyebrow: React.CSSProperties = {
  margin: "0 0 6px",
  color: GOLD,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
};

const kicker: React.CSSProperties = {
  color: MUTED,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: MUTED,
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "11px 13px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#0a1524",
  color: TEXT,
  fontSize: 15,
  fontFamily: "inherit",
};

const listStyle: React.CSSProperties = { listStyle: "none", margin: "0 0 14px", padding: 0 };

const listItem: React.CSSProperties = {
  display: "flex",
  gap: 9,
  alignItems: "flex-start",
  padding: "6px 0",
  fontSize: 14,
  lineHeight: 1.5,
  color: TEXT,
};

const hoursPill: React.CSSProperties = {
  display: "inline-block",
  alignSelf: "flex-start",
  background: "rgba(43,143,214,0.16)",
  color: "#9ed0f5",
  borderRadius: 8,
  padding: "6px 11px",
  fontSize: 12.5,
  fontWeight: 700,
  margin: "0 0 14px",
};

const noticeStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: "16px 18px",
  color: TEXT,
  fontSize: 14.5,
  lineHeight: 1.7,
  marginTop: 16,
};

const creditStyle: React.CSSProperties = {
  background: "rgba(212,175,55,0.10)",
  border: "1px solid rgba(212,175,55,0.35)",
  borderRadius: 12,
  padding: "16px 18px",
  color: "#e8d9a8",
  fontSize: 14.5,
  lineHeight: 1.7,
  marginTop: 16,
};

const errorStyle: React.CSSProperties = {
  background: "rgba(255,107,129,0.10)",
  border: "1px solid rgba(255,107,129,0.4)",
  borderRadius: 12,
  padding: "14px 18px",
  color: "#ffb3bf",
  fontSize: 14.5,
  lineHeight: 1.7,
  marginBottom: 20,
};

const primaryBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 52,
  padding: "13px 22px",
  borderRadius: 12,
  border: "none",
  background: `linear-gradient(135deg, #e8c65c, ${GOLD})`,
  color: INK,
  fontSize: 14.5,
  fontWeight: 800,
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "inherit",
};

const ghostBtn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 52,
  padding: "13px 22px",
  borderRadius: 12,
  border: `1px solid ${LINE}`,
  background: "transparent",
  color: "#fff",
  fontSize: 14.5,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "inherit",
};

const factGrid: React.CSSProperties = { margin: "22px 0 0" };

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RegistrationPage />
    </Suspense>
  );
}
