"use client";

// =====================================================================
// BIG ICE INLINE FITNESS — ACADEMY REGISTRATION  /register/bigice
//
// This page belongs to BIG ICE and sells BIG ICE PACKAGES ONLY. That is
// the whole reason it exists.
//
// WHAT IT REPLACES. /register/academy was a "unified intake": a
// League/academy dropdown offering Big Ice, NRHL and Athlytica, with the
// package list swapping underneath it. A parent who arrived from
// bigice.co.ke to buy skating lessons was shown, in one radio list, the
// NRHL Performance Hockey Program at 27,500, NRHL Elite at 45,000 and a
// 150,000 institutional campus licence — under a header reading
// "NRHL · Big Ice · Athlytica", on nairobihockey.com. Every Big Ice
// package here now comes from commercial_price_tier where
// tier_group = 'academy', and there is no control on this page that can
// reach another venture's catalogue.
//
// NRHL IS AN UPSELL, NOT AN OPTION. The competitive-hockey pathway is a
// separate block at the bottom that LINKS OUT to the NRHL registration
// dashboard (config/venture-links.ts). It does not embed NRHL package
// cards, does not show NRHL prices, and does not check out here.
//
// MONEY. Nothing this file renders can set a price. /api/v1/biz/stk-push
// re-derives the charge from `priceTierId` server-side and the amount is
// deliberately not sent. The figure on the button, the figure in the
// order summary and the figure in the M-Pesa prompt are one number that
// came from one place.
//
// PAYMENT STATE IS NEVER ASSUMED. "STK request accepted" is not
// "payment confirmed". The success screen is reached only when
// /api/v1/biz/check-status reports the settlement the callback wrote.
// =====================================================================

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import {
  BIG_ICE_ADMISSIONS,
  BIG_ICE_SITE_URL,
  NRHL_REGISTRATION_URL,
  PORTAL_URL,
} from "@/config/venture-links";

// Imported rather than referenced as /bigice-shield.png: this page is
// served to parents through bigice.co.ke's proxy, which forwards
// /register, /api/v1/* and /_next/* — a root-relative public asset would
// resolve against the static site and 404. Same lesson as the NRHL hero.
import shield from "./bigice-shield.png";

const PAYBILL = "4325935";
const POLL_INTERVAL_MS = 3_000;
// Safaricom expires an unanswered STK prompt at about 60s. Past this the
// page stops implying the prompt is still live and offers the way out.
const STK_PATIENCE_MS = 75_000;

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

// --------------------------------------------------------------- brand
// bigice.co.ke's navy and gold, matching lib/services/nrhl-pdf-generator
// BIG_ICE_BRAND so the page, the receipt and the welcome pack are one
// visual system.

const NAVY = "#0A1B33";
const PANEL = "#12294A";
const LINE = "#1B3A66";
const GOLD = "#FFC629";
const GOLD_SOFT = "#FFE49B";
const TEXT = "#E8EEF7";
const MUTED = "#93A7C4";

// ------------------------------------------------------------- catalog

interface AcademyPackage {
  priceTierId: string;
  label: string;
  amountKes: number;
  description: string | null;
  bestFor: string | null;
  ageRange: string | null;
  durationLabel: string | null;
  sessionFormat: string | null;
  sessionsIncluded: string | null;
  location: string | null;
  inclusions: string[];
  featured: boolean;
}

/**
 * Stated once, rendered under every price. Big Ice sells COACHING; ice
 * time is the parent's own relationship with the rink. bigice.co.ke says
 * so plainly on the pricing page and the checkout must not quietly drop
 * it — a parent who discovers it after paying is a refund conversation.
 */
const FEE_EXCLUSIONS =
  "Ice time and rink hire are arranged and paid directly with the rink, and are not part of " +
  "the programme fee. Competition and event entry fees, and travel to events, are also separate.";

const DISCIPLINES = [
  "Inline Hockey",
  "Slalom Mastery",
  "Figure Skating",
  "Ice Freestyle",
  "Street Skating",
  "Multi-Discipline — not sure yet",
];

const SKATING_LEVELS = [
  "Complete beginner — has never skated",
  "Can skate forward, still learning to stop",
  "Skates confidently, stops and turns",
  "Strong skater — ready for specialised training",
];

// --------------------------------------------------------------- state

type Phase =
  | { name: "form" }
  | { name: "pushing" }
  | {
      name: "awaiting_pin";
      registrationId: string;
      accountReference: string;
      amountKes: number;
      programmeLabel: string;
      stkDispatched: boolean;
      startedAt: number;
    }
  | {
      name: "paid";
      accountReference: string;
      receipt: string | null;
      athleteId: string | null;
      athleteName: string | null;
      programmeLabel: string | null;
      amountKes: number | null;
      location: string | null;
      settledAt: string | null;
      onboarding: string | null;
      documentsSent: boolean;
    }
  | { name: "error"; message: string; retryable: boolean };

function BigIceRegistration() {
  const params = useSearchParams();
  // ?package=<commercial_price_tier.tier_id>. Deep-linked from the
  // "Choose 6 Months" buttons on bigice.co.ke.
  const urlPackage = params.get("package");

  const [packages, setPackages] = useState<AcademyPackage[] | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/public/packages")
      .then((res) => res.json())
      .then((body: { success?: boolean; packages?: AcademyPackage[] }) => {
        if (cancelled) return;
        if (body.success && body.packages?.length) setPackages(body.packages);
        else setCatalogFailed(true);
      })
      .catch(() => !cancelled && setCatalogFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // "auto" = nobody has chosen, so ?package= decides. Derived rather
  // than held in initial state, because the catalogue arrives over the
  // network AFTER first render — there is no initial state that could
  // hold it, and a useState initializer would run against an empty list.
  const [choice, setChoice] = useState<string | "auto" | "none">("auto");
  const selected = useMemo(() => {
    if (choice === "none" || !packages) return null;
    const key = choice === "auto" ? urlPackage : choice;
    return packages.find((p) => p.priceTierId === key) ?? null;
  }, [choice, packages, urlPackage]);

  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [athleteAge, setAthleteAge] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [skating, setSkating] = useState("");
  const [notes, setNotes] = useState("");

  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const [waitedTooLong, setWaitedTooLong] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // A REF, not the phase, is the in-flight latch. setPhase is async:
  // three impatient taps in one tick all read the same stale "form"
  // phase, all pass the check, and all POST — which is three M-Pesa
  // prompts on one parent's handset. A ref flips synchronously on the
  // first tap. (The NRHL page learned this; this page had not.)
  const inFlight = useRef(false);

  useEffect(
    () => () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    },
    [],
  );

  const detailsComplete =
    parentName.trim().length > 1 &&
    /\S+@\S+\.\S+/.test(parentEmail) &&
    phoneNumber.trim().length > 8 &&
    athleteName.trim().length > 1 &&
    athleteAge !== "" &&
    discipline !== "" &&
    skating !== "";

  const stopPolling = () => {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = null;
  };

  const startPolling = useCallback((registrationId: string, accountReference: string) => {
    stopPolling();
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/biz/check-status?registrationId=${registrationId}`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          status?: string;
          mpesaReceipt?: string | null;
          athleteId?: string | null;
          athleteName?: string | null;
          programmeLabel?: string | null;
          amountKes?: number | null;
          location?: string | null;
          settledAt?: string | null;
          onboarding?: string | null;
          documentsSent?: boolean;
        };
        if (body.status !== "PAID") return;
        stopPolling();
        inFlight.current = false;
        setPhase({
          name: "paid",
          accountReference,
          receipt: body.mpesaReceipt ?? null,
          athleteId: body.athleteId ?? null,
          athleteName: body.athleteName ?? null,
          programmeLabel: body.programmeLabel ?? null,
          amountKes: body.amountKes ?? null,
          location: body.location ?? null,
          settledAt: body.settledAt ?? null,
          onboarding: body.onboarding ?? null,
          documentsSent: body.documentsSent === true,
        });
      } catch {
        // A dropped poll is not a failed payment. The next tick retries,
        // and the settlement is durable in the database either way.
      }
    }, POLL_INTERVAL_MS);
  }, []);

  // "The prompt should have arrived by now." Kept separate from the poll
  // so a slow network never reads as a failed payment: polling continues
  // underneath, because a manual Paybill payment still settles.
  useEffect(() => {
    if (phase.name !== "awaiting_pin") return;
    setWaitedTooLong(false);
    const t = setTimeout(
      () => setWaitedTooLong(true),
      Math.max(0, STK_PATIENCE_MS - (Date.now() - phase.startedAt)),
    );
    return () => clearTimeout(t);
  }, [phase]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!selected || inFlight.current) return;
    inFlight.current = true;
    setPhase({ name: "pushing" });
    try {
      const res = await fetch("/api/v1/biz/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          // The charge is re-derived from this id server-side. The
          // amount is deliberately not sent.
          priceTierId: selected.priceTierId,
          athleteName,
          parentName,
          parentEmail,
          ...(athleteAge ? { athleteAge: Number(athleteAge) } : {}),
          source: "bigice",
        }),
      });
      // A crashed route answers 500 with an empty body, and res.json() on
      // that throws — which used to land in the catch below and tell a
      // parent "Network error" while their connection was fine.
      const body = ((await res.json().catch(() => ({}))) ?? {}) as {
        success?: boolean;
        status?: string;
        error?: string;
        registrationId?: string;
        accountReference?: string;
        amountKes?: number;
        programmeLabel?: string;
        stkPush?: { dispatched: boolean };
      };

      // Already paid for this exact child and programme — a refresh or a
      // second tap after settlement. Show the confirmation, not an error.
      if (res.status === 409 && body.status === "ALREADY_SETTLED" && body.registrationId) {
        startPolling(body.registrationId, body.accountReference ?? "—");
        setPhase({
          name: "awaiting_pin",
          registrationId: body.registrationId,
          accountReference: body.accountReference ?? "—",
          amountKes: selected.amountKes,
          programmeLabel: selected.label,
          stkDispatched: false,
          startedAt: Date.now(),
        });
        return;
      }

      if (!res.ok || !body.success || !body.registrationId) {
        // A fail-closed config error is a message to US, not to a parent
        // holding a phone. "MSISDN_HASH_KEY is not provisioned" was
        // reaching customers verbatim: it reads as a crash and it
        // publishes an internal env var name. Anything 5xx is ours.
        // Only a 4xx carries something a parent can act on.
        const sealed =
          res.status >= 500 || body.status === "CONFIG_DEBT" || body.status === "SCHEMA_DEBT";
        inFlight.current = false;
        if (sealed) {
          console.error("[bigice-register] checkout sealed:", body.status, body.error);
          setPhase({
            name: "error",
            retryable: true,
            message:
              "We could not start the registration just now, and your payment has NOT been taken. " +
              `Please try again in a moment, or message Big Ice on ${BIG_ICE_ADMISSIONS.phoneDisplay} ` +
              "and we will complete it with you.",
          });
          return;
        }
        setPhase({
          name: "error",
          retryable: true,
          message:
            body.error ??
            "We could not start the registration. Your payment has not been taken — please check your details and try again.",
        });
        return;
      }

      setPhase({
        name: "awaiting_pin",
        registrationId: body.registrationId,
        accountReference: body.accountReference ?? "—",
        // The server's figure is authoritative. Ours is a fallback for
        // the overlay copy only if the response omits it.
        amountKes: body.amountKes ?? selected.amountKes,
        programmeLabel: body.programmeLabel ?? selected.label,
        stkDispatched: body.stkPush?.dispatched ?? false,
        startedAt: Date.now(),
      });
      startPolling(body.registrationId, body.accountReference ?? "—");
    } catch {
      inFlight.current = false;
      setPhase({
        name: "error",
        retryable: true,
        message:
          "We could not reach Big Ice — check your connection and try again. " +
          "Your payment has not been taken.",
      });
    }
  }

  /** Re-send the prompt. Reuses the same registration; never a new one. */
  function retryPayment() {
    stopPolling();
    inFlight.current = false;
    setWaitedTooLong(false);
    void submit();
  }

  /** Back to the form with the number cleared, everything else kept. */
  function changePhoneNumber() {
    stopPolling();
    inFlight.current = false;
    setWaitedTooLong(false);
    setPhoneNumber("");
    setPhase({ name: "form" });
  }

  // =================================================== PAYMENT CONFIRMED

  if (phase.name === "paid") {
    const onboardingPending = phase.onboarding === "PENDING";
    return (
      <Shell>
        <section style={{ ...panel, padding: 28, maxWidth: 720, margin: "0 auto" }}>
          <Wordmark />
          <p style={{ ...eyebrow, color: "#7ee0a4" }}>Payment confirmed</p>
          <h1 style={{ ...h1, fontSize: 32 }}>
            Welcome to Big Ice{phase.athleteName ? `, ${phase.athleteName}` : ""}
          </h1>
          <p style={{ color: TEXT, fontSize: 16, lineHeight: 1.7, margin: "0 0 4px" }}>
            {phase.programmeLabel
              ? `Your registration for ${phase.programmeLabel} has been confirmed.`
              : "Your registration has been confirmed."}
          </p>

          <dl style={{ margin: "24px 0 0" }}>
            <Fact k="Athlete" v={phase.athleteName ?? athleteName} />
            {/* Absent rather than blank when onboarding is still running:
                a row with nothing next to it reads as a system that lost
                the child, which is exactly what has not happened. */}
            {phase.athleteId && <Fact k="Big Ice Athlete ID" v={phase.athleteId} highlight />}
            <Fact k="Programme" v={phase.programmeLabel ?? "—"} />
            {phase.amountKes !== null && <Fact k="Amount paid" v={kes(phase.amountKes)} />}
            <Fact k="M-Pesa reference" v={phase.receipt ?? "Confirming with M-Pesa"} />
            <Fact k="Registration reference" v={phase.accountReference} />
            <Fact
              k="Date"
              v={(phase.settledAt ?? new Date().toISOString()).slice(0, 10)}
            />
            <Fact k="Status" v="PAID" />
          </dl>

          <div style={{ ...notice, marginTop: 22 }}>
            {onboardingPending ? (
              <p style={{ margin: 0 }}>
                <strong style={{ color: "#fff" }}>Your payment is confirmed.</strong> Your
                athlete&apos;s Big Ice Athlete ID and welcome documents are being prepared now —
                they will arrive by email at {parentEmail || "the address you gave us"} shortly,
                and will be in your parent portal. Nothing further is needed from you, and you
                will not be charged again.
              </p>
            ) : (
              // "Sent" is asserted only when the delivery actually
              // succeeded. Rendering it unconditionally told parents
              // whose mail bounced — and everyone registered while mail
              // was unprovisioned — to go and check an inbox that would
              // never receive anything. The portal copy is true in both
              // cases, because the documents are written to
              // bigice_document before the email is attempted.
              <p style={{ margin: 0 }}>
                <strong style={{ color: "#fff" }}>What happens next.</strong>{" "}
                {phase.documentsSent ? (
                  <>
                    Your welcome pack, receipt and parent portal instructions have been sent to{" "}
                    {parentEmail || "your email address"}, and are in your parent portal.
                  </>
                ) : (
                  <>
                    Your welcome pack and receipt are ready in your parent portal — sign in with{" "}
                    {parentEmail || "the address you gave us"} to open them.
                  </>
                )}{" "}
                Your coach will contact you to confirm your first session. This Athlete ID stays
                with your child across every Big Ice programme they ever take.
              </p>
            )}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 22 }}>
            <a href={PORTAL_URL} style={primaryBtn}>
              Open the parent portal
            </a>
            <button type="button" onClick={() => window.print()} style={ghostBtn}>
              Print / save this receipt
            </button>
          </div>

          <p style={{ color: MUTED, fontSize: 13, marginTop: 20, lineHeight: 1.7 }}>
            Keep your registration reference — it identifies this payment in any conversation with
            Big Ice. Questions: {BIG_ICE_ADMISSIONS.phoneDisplay} · {BIG_ICE_ADMISSIONS.email}
          </p>
        </section>
      </Shell>
    );
  }

  // ================================================= AWAITING THE M-PESA PIN

  if (phase.name === "awaiting_pin") {
    return (
      <Shell>
        <section
          style={{ ...panel, padding: 28, maxWidth: 620, margin: "0 auto" }}
          role="status"
          aria-live="polite"
        >
          <Wordmark />
          <p style={eyebrow}>{phase.stkDispatched ? "Payment initiated" : "Complete your payment"}</p>
          <h1 style={{ ...h1, fontSize: 28 }}>
            {phase.stkDispatched ? "Check your phone" : "Pay by M-Pesa Paybill"}
          </h1>

          <p style={{ color: TEXT, fontSize: 16, lineHeight: 1.7 }}>
            {phase.stkDispatched ? (
              <>
                An M-Pesa request for <strong style={{ color: GOLD_SOFT }}>{kes(phase.amountKes)}</strong>{" "}
                has been sent to <strong style={{ color: "#fff" }}>{phoneNumber}</strong>. Enter your
                M-Pesa PIN to complete the registration.
              </>
            ) : (
              <>
                We could not send the prompt automatically. Pay{" "}
                <strong style={{ color: GOLD_SOFT }}>{kes(phase.amountKes)}</strong> using the
                details below and this page will update once it lands.
              </>
            )}
          </p>

          <p style={{ color: MUTED, fontSize: 14, margin: "0 0 18px" }}>
            {phase.programmeLabel} · Please do not close this page.
          </p>

          <div style={{ ...notice, display: "flex", alignItems: "center", gap: 12 }}>
            <Spinner />
            <span>Waiting for confirmation… checking every few seconds.</span>
          </div>

          {/* Always available, not only after a failure — the prompt goes
              missing often enough on Kenyan networks that hiding the
              fallback behind an error state strands people. */}
          <details
            open={!phase.stkDispatched || waitedTooLong}
            style={{
              border: `1px dashed ${LINE}`,
              borderRadius: 12,
              padding: "14px 16px",
              marginTop: 16,
              fontSize: 14.5,
              lineHeight: 1.9,
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#fff" }}>
              Didn&apos;t get the prompt? Pay manually
            </summary>
            M-Pesa → Lipa na M-Pesa → Paybill
            <br />
            Business number: <strong style={{ color: "#fff" }}>{PAYBILL}</strong>
            <br />
            Account number: <strong style={{ color: "#fff" }}>{phase.accountReference}</strong>
            <br />
            Amount: <strong style={{ color: "#fff" }}>{kes(phase.amountKes)}</strong>
            <p style={{ margin: "10px 0 0", color: MUTED, fontSize: 13 }}>
              Pay from {phoneNumber} so the payment matches this registration. Manual payments are
              confirmed automatically, usually within about two minutes.
            </p>
          </details>

          {waitedTooLong && (
            <div style={{ marginTop: 18 }}>
              <p style={{ color: TEXT, fontSize: 14.5, lineHeight: 1.7, margin: "0 0 12px" }}>
                The prompt should have arrived by now. If nothing appeared on your phone, you can
                send it again or use a different number —{" "}
                <strong style={{ color: "#fff" }}>you have not been charged twice</strong>, and this
                page is still watching for the payment either way.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                <button type="button" onClick={retryPayment} style={primaryBtn}>
                  Send the prompt again
                </button>
                <button type="button" onClick={changePhoneNumber} style={ghostBtn}>
                  Change phone number
                </button>
              </div>
            </div>
          )}

          <p style={{ color: MUTED, fontSize: 13, marginTop: 20, lineHeight: 1.7 }}>
            Your place is held against reference {phase.accountReference}. Stuck? Message Big Ice on{" "}
            {BIG_ICE_ADMISSIONS.phoneDisplay}.
          </p>
        </section>
      </Shell>
    );
  }

  // ============================================================ THE FORM

  const submitting = phase.name === "pushing";

  return (
    <Shell>
      <header style={{ marginBottom: 26 }}>
        <Wordmark />
        <p style={eyebrow}>Academy registration</p>
        <h1 style={h1}>Register your athlete</h1>
        <p style={{ color: TEXT, fontSize: 17, lineHeight: 1.7, maxWidth: "58ch" }}>
          Choose a Big Ice programme, tell us about your athlete, and pay securely by M-Pesa. Your
          child receives a permanent Big Ice Athlete ID that stays with them across every programme
          they take.
        </p>
      </header>

      {phase.name === "error" && (
        <div role="alert" style={errorBox}>
          <strong style={{ display: "block", marginBottom: 4, color: "#ffd7de" }}>
            Payment not completed
          </strong>
          {phase.message}
        </div>
      )}

      <div className="bi-layout">
        <div>
          {/* ------------------------------------------ 1. the programme */}
          <Step n="1" title="Choose your programme" />

          {!packages && !catalogFailed && (
            <p style={{ ...panel, padding: 18, color: MUTED, margin: 0 }}>
              Loading Big Ice programmes…
            </p>
          )}

          {catalogFailed && (
            <div style={{ ...panel, padding: 20, borderColor: "#7f4a2b" }}>
              <p style={{ margin: "0 0 10px", color: TEXT, lineHeight: 1.7 }}>
                We can&apos;t load the programme list right now. Nothing is wrong with your
                registration — we just can&apos;t show you prices at this moment.
              </p>
              <a
                href={`https://wa.me/${BIG_ICE_ADMISSIONS.whatsapp}`}
                target="_blank"
                rel="noopener"
                style={primaryBtn}
              >
                Message Big Ice on WhatsApp
              </a>
            </div>
          )}

          {packages && !selected && (
            <div className="bi-cards">
              {packages.map((p) => (
                <PackageCard key={p.priceTierId} p={p} onChoose={() => setChoice(p.priceTierId)} />
              ))}
            </div>
          )}

          {selected && (
            <section style={{ ...panel, padding: 22 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <p style={{ ...kicker, marginBottom: 6 }}>Your programme</p>
                  <h2 style={{ margin: "0 0 4px", fontSize: 22, color: "#fff" }}>
                    {selected.label}
                  </h2>
                  <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: GOLD }}>
                    {kes(selected.amountKes)}
                  </p>
                  {selected.durationLabel && (
                    <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 13.5 }}>
                      {selected.durationLabel}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setChoice("none")} style={ghostBtn}>
                  Change programme
                </button>
              </div>
            </section>
          )}

          {/* ------------------------------------------ 2. athlete details */}
          {selected && (
            <form onSubmit={submit}>
              <Step n="2" title="Athlete &amp; parent details" />

              <div className="bi-fields">
                <Field label="Parent / guardian name" required>
                  <input
                    style={input}
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                </Field>
                <Field
                  label="Email address"
                  required
                  hint="Your welcome pack, receipt and portal sign-in go here."
                >
                  <input
                    style={input}
                    type="email"
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </Field>
                <Field
                  label="M-Pesa phone number"
                  required
                  hint="The payment prompt goes to this number."
                >
                  <input
                    style={input}
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    required
                    inputMode="tel"
                    placeholder="07XX XXX XXX"
                    autoComplete="tel"
                  />
                </Field>
                <Field label="Athlete name" required hint="Your child's full name.">
                  <input
                    style={input}
                    value={athleteName}
                    onChange={(e) => setAthleteName(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Athlete age" required>
                  <input
                    style={input}
                    type="number"
                    min={4}
                    max={60}
                    value={athleteAge}
                    onChange={(e) => setAthleteAge(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Discipline" required hint="This can change later with your coach.">
                  <select
                    style={input}
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                    required
                  >
                    <option value="">Select…</option>
                    {DISCIPLINES.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Current skating ability" required>
                <select
                  style={input}
                  value={skating}
                  onChange={(e) => setSkating(e.target.value)}
                  required
                >
                  <option value="">Select…</option>
                  {SKATING_LEVELS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>

              <Field label="Anything the coach should know?">
                <textarea
                  style={{ ...input, minHeight: 84, resize: "vertical" }}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="School timetable, other sports, medical notes, siblings training together."
                />
              </Field>

              {/* -------------------------------------------- 3. payment */}
              <Step n="3" title="Confirm and pay" />

              <div className="bi-summary-mobile">
                <OrderSummary p={selected} athleteName={athleteName} />
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
                  : `Pay by M-Pesa — ${kes(selected.amountKes)}`}
              </button>
              {!detailsComplete && (
                <p style={{ color: MUTED, fontSize: 13, marginTop: 10 }}>
                  Complete the details above to continue.
                </p>
              )}
              <p style={{ color: MUTED, fontSize: 13, marginTop: 14, lineHeight: 1.7 }}>
                You will approve a prompt on your phone for exactly{" "}
                <strong style={{ color: TEXT }}>{kes(selected.amountKes)}</strong>. Nothing is
                charged until you enter your M-Pesa PIN.
              </p>
            </form>
          )}
        </div>

        {selected && (
          <aside className="bi-summary-desktop">
            <OrderSummary p={selected} athleteName={athleteName} />
          </aside>
        )}
      </div>

      {/* ================================================ NRHL UPSELL ====
          Structurally separate from everything above: its own block, its
          own visual treatment, and a LINK OUT rather than a checkout.
          There are no NRHL packages, prices or radio options anywhere on
          this page — a parent who wants competitive hockey goes to the
          NRHL registration dashboard and registers there. */}
      <section
        style={{
          ...panel,
          padding: 24,
          marginTop: 44,
          background: "linear-gradient(135deg, #12294A, #0A1B33)",
          borderColor: LINE,
        }}
      >
        <p style={{ ...kicker, color: MUTED, marginBottom: 8 }}>Competitive hockey pathway</p>
        <h2 style={{ margin: "0 0 10px", fontSize: 21, color: "#fff" }}>
          Ready for competitive inline hockey?
        </h2>
        <p style={{ margin: "0 0 16px", color: TEXT, fontSize: 15, lineHeight: 1.7, maxWidth: "62ch" }}>
          If your athlete is ready to move from skating development into structured competitive
          inline hockey, that runs through the Nairobi Regional Hockey League — a separate
          programme, with its own registration, schedule and fees.
        </p>
        <a href={NRHL_REGISTRATION_URL} style={ghostBtn} data-track="explore_nrhl">
          Explore NRHL →
        </a>
      </section>

      <footer
        style={{
          marginTop: 40,
          paddingTop: 20,
          borderTop: `1px solid ${LINE}`,
          color: MUTED,
          fontSize: 13,
          lineHeight: 1.8,
        }}
      >
        <strong style={{ color: "#fff", display: "block" }}>Big Ice Inline Fitness</strong>
        Skating and athlete development, Nairobi
        <br />
        {BIG_ICE_ADMISSIONS.phoneDisplay} · {BIG_ICE_ADMISSIONS.email} ·{" "}
        <a href={BIG_ICE_SITE_URL} style={{ color: GOLD_SOFT }}>
          bigice.co.ke
        </a>
      </footer>
    </Shell>
  );
}

// ============================================================== PIECES

/**
 * Answers, in the order a parent asks them: what is this, who is it for,
 * how long, how many sessions, what do we actually get, how much.
 * Every row is omitted when its field is null rather than rendered
 * empty — the catalogue leaves age range and venue NULL on purpose.
 */
function PackageCard({ p, onChoose }: { p: AcademyPackage; onChoose: () => void }) {
  return (
    <article
      style={{
        ...panel,
        padding: 22,
        display: "flex",
        flexDirection: "column",
        borderColor: p.featured ? GOLD : LINE,
        borderWidth: p.featured ? 2 : 1,
      }}
    >
      {p.featured && (
        <span
          style={{
            alignSelf: "flex-start",
            background: GOLD,
            color: NAVY,
            fontSize: 10.5,
            fontWeight: 800,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            padding: "5px 12px",
            borderRadius: 999,
            marginBottom: 14,
          }}
        >
          Most popular
        </span>
      )}
      <h2 style={{ margin: "0 0 8px", fontSize: 19, color: "#fff" }}>{p.label}</h2>
      <p style={{ margin: "0 0 12px", fontSize: 29, fontWeight: 800, color: "#fff" }}>
        {kes(p.amountKes)}
      </p>

      {p.description && (
        <p style={{ margin: "0 0 14px", color: TEXT, fontSize: 14, lineHeight: 1.6 }}>
          {p.description}
        </p>
      )}

      <dl style={{ margin: "0 0 14px" }}>
        {p.bestFor && <MicroFact k="Best for" v={p.bestFor} />}
        {p.ageRange && <MicroFact k="Ages" v={p.ageRange} />}
        {p.durationLabel && <MicroFact k="Duration" v={p.durationLabel} />}
        {p.sessionFormat && <MicroFact k="Format" v={p.sessionFormat} />}
        <MicroFact
          k="Sessions"
          // Not a blank and not a made-up number. bigice.co.ke states
          // training frequency is set with the coach around the ice time
          // you book, so that is what a parent is told here.
          v={p.sessionsIncluded ?? "Scheduled with your coach around your booked rink time"}
        />
        <MicroFact k="Location" v={p.location ?? "Nairobi — confirmed with your coach"} />
      </dl>

      {p.inclusions.length > 0 && (
        <>
          <p style={{ ...kicker, margin: "0 0 8px" }}>What&apos;s included</p>
          <ul style={list}>
            {p.inclusions.map((f) => (
              <li key={f} style={listItem}>
                <span style={{ color: GOLD, flex: "0 0 auto" }}>✓</span> {f}
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={{ color: MUTED, fontSize: 12.5, lineHeight: 1.6, margin: "8px 0 16px" }}>
        {FEE_EXCLUSIONS}
      </p>

      <button
        type="button"
        onClick={onChoose}
        style={{ ...(p.featured ? primaryBtn : ghostBtn), width: "100%", marginTop: "auto" }}
      >
        Choose {p.label}
      </button>
    </article>
  );
}

function OrderSummary({ p, athleteName }: { p: AcademyPackage; athleteName: string }) {
  return (
    <div style={{ ...panel, padding: 22 }}>
      <p style={{ ...kicker, marginBottom: 10 }}>Order summary</p>
      <p style={{ margin: "0 0 2px", fontSize: 12.5, color: GOLD_SOFT, fontWeight: 700 }}>
        Big Ice Inline Fitness
      </p>
      <h2 style={{ margin: "0 0 12px", fontSize: 19, color: "#fff" }}>{p.label}</h2>

      <dl style={{ margin: 0 }}>
        <MicroFact k="Athlete" v={athleteName.trim() || "—"} />
        {p.durationLabel && <MicroFact k="Duration" v={p.durationLabel} />}
        <MicroFact
          k="Sessions"
          v={p.sessionsIncluded ?? "Scheduled with your coach"}
        />
      </dl>

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
        <span style={{ ...kicker, margin: 0 }}>Amount</span>
        <strong style={{ fontSize: 23, color: "#fff" }}>{kes(p.amountKes)}</strong>
      </div>
      <p style={{ color: MUTED, fontSize: 12, lineHeight: 1.6, margin: "10px 0 0" }}>
        Paid once by M-Pesa. {FEE_EXCLUSIONS}
      </p>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
      <img
        src={shield.src}
        alt=""
        aria-hidden="true"
        width={38}
        height={38}
        style={{ display: "block", width: 38, height: 38, objectFit: "contain" }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "#fff",
        }}
      >
        Big Ice Inline Fitness
      </span>
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="bi-spin"
      style={{
        width: 18,
        height: 18,
        borderRadius: 999,
        border: `2px solid ${LINE}`,
        borderTopColor: GOLD,
        display: "inline-block",
        flex: "0 0 auto",
      }}
    />
  );
}

function Step({ n, title }: { n: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "32px 0 16px" }}>
      <span
        style={{
          width: 30,
          height: 30,
          borderRadius: 999,
          display: "grid",
          placeItems: "center",
          background: "rgba(255,198,41,0.16)",
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
      {hint && (
        <span style={{ display: "block", color: MUTED, fontSize: 12, marginTop: 4 }}>{hint}</span>
      )}
    </label>
  );
}

function Fact({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div style={{ borderTop: `1px solid ${LINE}`, padding: "10px 0" }}>
      <dt style={{ ...kicker, margin: "0 0 4px" }}>{k}</dt>
      <dd
        style={{
          margin: 0,
          color: highlight ? GOLD : "#fff",
          fontSize: highlight ? 19 : 15,
          fontWeight: highlight ? 800 : 600,
          letterSpacing: highlight ? "0.04em" : undefined,
          wordBreak: "break-word",
        }}
      >
        {v}
      </dd>
    </div>
  );
}

function MicroFact({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 10, padding: "4px 0", fontSize: 13.5, lineHeight: 1.55 }}>
      <dt style={{ color: MUTED, flex: "0 0 84px", fontWeight: 600 }}>{k}</dt>
      <dd style={{ margin: 0, color: TEXT, flex: 1 }}>{v}</dd>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: `radial-gradient(circle at 12% 0%, rgba(255,198,41,0.10), transparent 42%), ${NAVY}`,
        color: TEXT,
        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
        padding: "36px 18px 60px",
      }}
    >
      <style>{`
        .bi-layout { display: block; max-width: 1100px; margin: 0 auto; }
        .bi-cards { display: grid; gap: 16px; grid-template-columns: 1fr; }
        .bi-fields { display: grid; gap: 0 16px; grid-template-columns: 1fr; }
        .bi-summary-desktop { display: none; }
        .bi-summary-mobile { margin-bottom: 18px; }
        .bi-spin { animation: bi-rot 0.9s linear infinite; }
        @keyframes bi-rot { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .bi-spin { animation: none; } }
        /* Two up before three: the cards carry a full inclusions list, and
           three columns on a 760px tablet shrinks each to an unreadable
           column of wrapped single words. */
        @media (min-width: 700px) {
          .bi-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .bi-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 1000px) {
          .bi-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 32px; align-items: start; }
          .bi-summary-desktop { display: block; position: sticky; top: 24px; }
          .bi-summary-mobile { display: none; }
        }
        /* "Print / save this receipt" has to produce something a parent
           would keep, not a navy screenshot with a spinner in it. */
        @media print {
          main { background: #fff !important; color: #0b1220 !important; padding: 0 !important; }
          button { display: none !important; }
          section { border-color: #ccd4e0 !important; background: #fff !important; }
          dt, dd, p, h1, h2, span { color: #0b1220 !important; }
        }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>{children}</div>
    </main>
  );
}

// ============================================================== STYLES

const panel: React.CSSProperties = {
  background: PANEL,
  border: `1px solid ${LINE}`,
  borderRadius: 16,
};

const h1: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 38,
  lineHeight: 1.12,
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
  padding: "12px 13px",
  borderRadius: 10,
  border: `1px solid ${LINE}`,
  background: "#0B1F3A",
  color: TEXT,
  // 16px, deliberately: iOS Safari zooms the whole page in on focus for
  // anything smaller, and a parent then has to pinch back out to reach
  // the pay button. This is the mobile-checkout fix, not a type choice.
  fontSize: 16,
  fontFamily: "inherit",
};

const list: React.CSSProperties = { listStyle: "none", margin: "0 0 10px", padding: 0 };

const listItem: React.CSSProperties = {
  display: "flex",
  gap: 9,
  alignItems: "flex-start",
  padding: "5px 0",
  fontSize: 13.5,
  lineHeight: 1.5,
  color: TEXT,
};

const notice: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: `1px solid ${LINE}`,
  borderRadius: 12,
  padding: "15px 17px",
  color: TEXT,
  fontSize: 14.5,
  lineHeight: 1.7,
  marginTop: 16,
};

const errorBox: React.CSSProperties = {
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
  // 52px: comfortably above the 44px minimum tap target, on a page whose
  // whole job happens on a phone.
  minHeight: 52,
  padding: "13px 22px",
  borderRadius: 12,
  border: "none",
  background: `linear-gradient(135deg, ${GOLD_SOFT}, ${GOLD})`,
  color: NAVY,
  fontSize: 15,
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
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "none",
  fontFamily: "inherit",
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <BigIceRegistration />
    </Suspense>
  );
}
