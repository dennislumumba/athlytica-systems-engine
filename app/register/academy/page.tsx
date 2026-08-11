"use client";

// =====================================================================
// UNIFIED INTAKE & CHECKOUT — /register (founder directive 2026-07-25)
//
// Cross-domain funnel entry point. Accepts
//   ?tier=[baseline_7500|combine_27500|acceleration_45000]
//   &source=[nrhl|bigice|athlytica]
// and drives the M-Pesa STK checkout:
//   submit → POST /api/v1/biz/stk-push → poll /api/v1/biz/check-status
//   every 3s until PAID → success panel.
// Manual Paybill fallback (4325935 + ATH-XXXX) is always shown once a
// session exists — settlement webhook matching verifies it server-side.
// =====================================================================

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// League / academy the registrant is joining. `source` is the value the
// STK route accepts; `brand` is the tier-table venture it filters to, so
// the chosen programme and the tier that gets charged can never disagree
// — venture_context is derived server-side from the tier, and a mismatch
// there would misattribute the athlete AND the revenue.
const PROGRAMS = [
  {
    source: "nrhl",
    brand: "NRHL",
    label: "Nairobi Regional Hockey League (NRHL)",
    coach: "Head Coach · NRHL",
  },
  {
    // Big Ice cohorts are priced from public.commercial_price_tier, not
    // the code table above, so this programme's options are fetched.
    source: "bigice",
    brand: "Big Ice",
    label: "Big Ice Hockey & Inline Academy",
    coach: "Head Coach · Big Ice",
  },
  {
    source: "athlytica",
    brand: "Athlytica",
    label: "Athlytica — sport-agnostic profiling",
    coach: "Athlytica HQ",
  },
] as const;

type ProgramSource = (typeof PROGRAMS)[number]["source"];

const TIERS = [
  {
    id: "baseline_7500",
    label: "Athlete Performance Assessment",
    brand: "Athlytica",
    amountKes: 7_500,
    blurb:
      "One 90-minute assessment. Digital Athlete Performance Profile, baseline measurements and development priorities.",
  },
  {
    id: "combine_27500",
    label: "Performance Hockey Program",
    brand: "NRHL",
    amountKes: 27_500,
    blurb:
      "3-month phase: 9 group sessions (120 min), 3 showcase scrimmages (120 min) and the 90-minute assessment.",
  },
  {
    id: "acceleration_45000",
    label: "Elite Individual Development",
    brand: "NRHL",
    amountKes: 45_000,
    blurb:
      "Everything in Performance plus 12 private coaching sessions (90 min) across the 3-month phase.",
  },
  {
    id: "enterprise_150k",
    label: "Institutional / Campus License",
    brand: "Athlytica",
    amountKes: 150_000,
    blurb: "Turnkey school & campus program: coaching staff, telemetry, gear.",
  },
] as const;

type TierId = (typeof TIERS)[number]["id"];

const isProgramSource = (v: unknown): v is ProgramSource =>
  PROGRAMS.some((p) => p.source === v);

/**
 * One shape for both funnels. The STK route takes exactly one of `tier`
 * (code table) or `priceTierId` (commercial_price_tier), so `kind`
 * decides which key the payload carries — the radio list itself does not
 * care where an option came from.
 */
interface Choice {
  key: string;
  kind: "tier" | "package";
  label: string;
  amountKes: number;
  blurb: string;
}

const tierChoices = (brand: string): Choice[] =>
  TIERS.filter((t) => t.brand === brand).map((t) => ({
    key: t.id,
    kind: "tier",
    label: t.label,
    amountKes: t.amountKes,
    blurb: t.blurb,
  }));

interface AcademyPackage {
  priceTierId: string;
  label: string;
  amountKes: number;
}

const CAMPUS_NODES = ["The Summit", "The Ridge", "The Plateau", "The Savannah"];

const PAYBILL = "4325935";
const ADMISSIONS_PHONE = "+254 724 324 529";
const POLL_INTERVAL_MS = 3_000;

const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

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

/** Post-payment onboarding hand-off target. */
const ONBOARDING_URL = "https://app.athlyticahq.com/nrhl/welcome";

const card: React.CSSProperties = {
  background: "#111a2c",
  border: "1px solid #24334d",
  borderRadius: 14,
  padding: 20,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid #2c3d5c",
  background: "#0b1220",
  color: "#e6edf6",
  fontSize: 15,
  marginTop: 4,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#9fb1c9",
  marginTop: 14,
};

function RegisterForm() {
  const searchParams = useSearchParams();
  const urlTier = searchParams.get("tier");
  const urlSource = searchParams.get("source");
  // ?package=<tier_id> is the academy equivalent of ?tier=. Big Ice
  // cohorts live in commercial_price_tier, so they have no id in the code
  // table and ?tier= can never name one — bigice.co.ke's "Choose 6 Months"
  // button had no way to arrive here with 6 months selected.
  const urlPackage = searchParams.get("package");

  // ?source= pre-selects the programme (that is what the NRHL and Big Ice
  // marketing links carry); the dropdown is how everyone else picks.
  //
  // ?tier= OUTRANKS ?source=, because a tier names a specific purchase and
  // a source only names a landing page. nairobihockey.com sells the KES
  // 7,500 assessment (`baseline_7500`, brand Athlytica) from an `nrhl`
  // page: with source winning, that tier is absent from the NRHL choice
  // list and `selected` silently fell back to combine_27500 — a parent
  // clicking a 7,500 CTA landed on a 27,500 selection. Deriving the
  // programme from the tier's own brand cannot desync from the
  // server-side venture, because brand mirrors it.
  const tierProgram = PROGRAMS.find(
    (p) => p.brand === TIERS.find((t) => t.id === urlTier)?.brand,
  )?.source;
  // ?package= implies Big Ice for the same reason ?tier= implies its own
  // brand: it names a specific purchase, and only one programme sells it.
  const [program, setProgram] = useState<ProgramSource>(
    tierProgram ??
      (urlPackage ? "bigice" : isProgramSource(urlSource) ? urlSource : "nrhl"),
  );
  // Big Ice cohorts come from the database; every other programme is
  // priced from the code table. Fetched once, not per programme switch.
  const [packages, setPackages] = useState<AcademyPackage[] | null>(null);
  const [packagesFailed, setPackagesFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/v1/public/packages")
      .then((res) => res.json())
      .then((body: { success?: boolean; packages?: AcademyPackage[] }) => {
        if (cancelled) return;
        if (body.success && body.packages?.length) setPackages(body.packages);
        else setPackagesFailed(true);
      })
      .catch(() => !cancelled && setPackagesFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const choices: Choice[] =
    program === "bigice"
      ? (packages ?? []).map((p) => ({
          key: p.priceTierId,
          kind: "package" as const,
          label: p.label,
          amountKes: p.amountKes,
          // Not "rink time": ice and rink hire are charged by the venue and
          // are excluded from the programme fee on bigice.co.ke. Claiming
          // it here would contradict the page the parent just came from,
          // at the exact moment they are about to enter a PIN.
          blurb:
            "Big Ice academy cohort — coaching, structured training, assessment and " +
            "progress reporting. Ice time / rink fees and event fees are billed separately.",
        }))
      : tierChoices(PROGRAMS.find((p) => p.source === program)!.brand);

  const [pickedKey, setPickedKey] = useState<string>(
    TIERS.some((t) => t.id === urlTier) ? (urlTier as TierId) : "combine_27500",
  );
  // Switching programme must not leave an option from the other one
  // selected — that is exactly the mismatch venture_context cannot
  // survive. Derived rather than synced by an effect, so there is never
  // an invalid intermediate state to submit from.
  //
  // ?package= resolves in the SAME derivation rather than in `pickedKey`'s
  // initial state, because the academy list arrives from the network after
  // first render — there is no initial state that could hold it. It sits
  // below `pickedKey` so the moment a parent touches a radio their choice
  // wins, and above `choices[0]` so an untouched deep link does not
  // silently land on the most expensive cohort (the list is priced
  // descending, so choices[0] is the 350,000 one). An unknown or malformed
  // id simply fails to match and falls through — no validation needed,
  // because only ids the server published can ever match.
  const selected =
    choices.find((c) => c.key === pickedKey) ??
    choices.find((c) => c.key === urlPackage) ??
    choices[0] ??
    null;
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [athleteAge, setAthleteAge] = useState("");
  const [campus, setCampus] = useState(CAMPUS_NODES[0]);
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function startPolling(registrationId: string, accountReference: string) {
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/v1/biz/check-status?registrationId=${registrationId}`,
        );
        if (!res.ok) return;
        const body = (await res.json()) as { status?: string; mpesaReceipt?: string | null };
        if (body.status === "PAID") {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setPhase({ name: "paid", receipt: body.mpesaReceipt ?? null, accountReference });
        }
      } catch {
        // transient poll failure — next tick retries
      }
    }, POLL_INTERVAL_MS);
  }

  // Hand off to the onboarding dashboard shortly after payment confirms.
  useEffect(() => {
    if (phase.name !== "paid") return;
    const t = setTimeout(() => {
      window.location.href = ONBOARDING_URL;
    }, 8_000);
    return () => clearTimeout(t);
  }, [phase.name]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setPhase({ name: "pushing" });
    try {
      const res = await fetch("/api/v1/biz/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          // Exactly one of these, which is what the route's schema
          // refines on. Amount is deliberately not sent: the charge is
          // re-derived server-side from whichever key this is.
          ...(selected.kind === "package"
            ? { priceTierId: selected.key }
            : { tier: selected.key }),
          athleteName,
          parentName,
          parentEmail,
          ...(athleteAge ? { athleteAge: Number(athleteAge) } : {}),
          preferredCampus: campus,
          source: program,
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
        // A fail-closed config error is a message to US, not to a parent
        // holding a phone. "MSISDN_HASH_KEY is not provisioned; refusing to
        // persist unhashed PII" was reaching customers verbatim — it reads
        // as a crash, and it publishes an internal env var name. Route the
        // family to a human instead and keep the cause in the console.
        const sealed = res.status === 503 || body.status === "CONFIG_DEBT" || body.status === "SCHEMA_DEBT";
        if (sealed) {
          console.error("[register] checkout sealed:", body.status, body.error);
          setPhase({
            name: "error",
            message:
              `Online registration is temporarily unavailable — this is on our side, not yours. ` +
              `Message admissions on ${ADMISSIONS_PHONE} (WhatsApp or call) and we will complete ` +
              `your registration and confirm payment for you.`,
          });
          return;
        }
        setPhase({
          name: "error",
          message: body.error ?? "Checkout could not be started. Please try again.",
        });
        return;
      }
      setPhase({
        name: "awaiting_pin",
        registrationId: body.registrationId,
        accountReference: body.accountReference ?? "—",
        // The server's figure is authoritative; ours is only a fallback
        // for the overlay copy if the response omits it.
        amountKes: body.amountKes ?? selected.amountKes,
        stkDispatched: body.stkPush?.dispatched ?? false,
      });
      startPolling(body.registrationId, body.accountReference ?? "—");
    } catch {
      setPhase({ name: "error", message: "Network error — please try again." });
    }
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "40px 16px 80px" }}>
      <p style={{ fontSize: 12, letterSpacing: 2, color: "#5f7392", textTransform: "uppercase" }}>
        NRHL · Big Ice · Athlytica
      </p>
      <h1 style={{ fontSize: 28, margin: "4px 0 6px" }}>Athlete Registration</h1>
      <p style={{ color: "#9fb1c9", marginTop: 0 }}>
        One intake for every program. Pay securely via M-Pesa.
      </p>

      {/* Programme selection — which league / academy owns this athlete */}
      <label style={{ ...labelStyle, marginTop: 24 }}>
        League / academy
        <select
          style={inputStyle}
          value={program}
          onChange={(e) => setProgram(e.target.value as ProgramSource)}
        >
          {PROGRAMS.map((p) => (
            <option key={p.source} value={p.source}>
              {p.label}
            </option>
          ))}
        </select>
        <span style={{ display: "block", fontSize: 12, color: "#5f7392", marginTop: 6, fontWeight: 400 }}>
          The athlete&apos;s record lands in this programme&apos;s roster —{" "}
          {PROGRAMS.find((p) => p.source === program)!.coach}.
        </span>
      </label>

      {/* Option selection, scoped to the chosen programme */}
      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {choices.map((c) => (
          <label
            key={c.key}
            style={{
              ...card,
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              cursor: "pointer",
              borderColor: selected?.key === c.key ? "#2f81f7" : "#24334d",
              background: selected?.key === c.key ? "#122036" : "#111a2c",
            }}
          >
            <input
              type="radio"
              name="offering"
              value={c.key}
              checked={selected?.key === c.key}
              onChange={() => setPickedKey(c.key)}
              style={{ marginTop: 4 }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>{c.label}</span>
                <span>{kes(c.amountKes)}</span>
              </span>
              <span style={{ display: "block", fontSize: 13, color: "#9fb1c9", marginTop: 2 }}>
                {PROGRAMS.find((p) => p.source === program)!.brand} · {c.blurb}
              </span>
            </span>
          </label>
        ))}

        {/* Big Ice cohorts are fetched, so they have states the code-table
            programmes do not: still loading, or unreachable. Never show an
            empty list with a live pay button under it. */}
        {choices.length === 0 && (
          <p style={{ ...card, padding: 14, fontSize: 14, color: "#9fb1c9", margin: 0 }}>
            {packagesFailed
              ? "Academy cohorts are unavailable right now. Pick another programme, or contact Big Ice to register directly."
              : "Loading academy cohorts…"}
          </p>
        )}
      </div>

      {phase.name === "form" || phase.name === "pushing" || phase.name === "error" ? (
        <form onSubmit={onSubmit} style={{ ...card, marginTop: 20 }}>
          <label style={{ ...labelStyle, marginTop: 0 }}>
            Parent / Guardian name
            <input
              style={inputStyle}
              required
              minLength={2}
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
          </label>
          <label style={labelStyle}>
            Email
            <input
              style={inputStyle}
              type="email"
              required
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
            />
          </label>
          <label style={labelStyle}>
            Phone number (M-Pesa)
            <input
              style={inputStyle}
              type="tel"
              required
              placeholder="07XXXXXXXX"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </label>
          <label style={labelStyle}>
            Athlete name
            <input
              style={inputStyle}
              required
              minLength={2}
              value={athleteName}
              onChange={(e) => setAthleteName(e.target.value)}
            />
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label style={{ ...labelStyle, flex: 1 }}>
              Athlete age
              <input
                style={inputStyle}
                type="number"
                min={4}
                max={60}
                value={athleteAge}
                onChange={(e) => setAthleteAge(e.target.value)}
              />
            </label>
            <label style={{ ...labelStyle, flex: 2 }}>
              Preferred campus node
              <select
                style={inputStyle}
                value={campus}
                onChange={(e) => setCampus(e.target.value)}
              >
                {CAMPUS_NODES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {phase.name === "error" && (
            <p
              role="alert"
              style={{
                background: "#2c1520",
                border: "1px solid #7f2b45",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 14,
                color: "#ffb3c6",
              }}
            >
              {phase.message}
            </p>
          )}

          {/* No selection means the fetched cohort list is empty or still
              loading — charging nothing is not a checkout. */}
          <button
            type="submit"
            disabled={phase.name === "pushing" || !selected}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "13px 16px",
              borderRadius: 10,
              border: "none",
              background: phase.name === "pushing" || !selected ? "#1d4e33" : "#16a34a",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: phase.name === "pushing" ? "wait" : selected ? "pointer" : "not-allowed",
            }}
          >
            {phase.name === "pushing"
              ? "Sending M-Pesa prompt…"
              : selected
                ? `Complete Registration via M-Pesa — ${kes(selected.amountKes)}`
                : "Select a programme option"}
          </button>
        </form>
      ) : null}

      {/* Full-screen STK overlay while the registrant enters their PIN */}
      {(phase.name === "pushing" || phase.name === "awaiting_pin") && (
        <div
          role="dialog"
          aria-modal="true"
          aria-live="polite"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(4, 8, 16, 0.88)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 50,
          }}
        >
          <div style={{ ...card, maxWidth: 480, width: "100%" }}>
            <h2 style={{ marginTop: 0, fontSize: 19 }}>
              {phase.name === "pushing" || phase.stkDispatched
                ? "Prompting your phone…"
                : "Complete payment via Paybill"}
            </h2>
            <p style={{ color: "#9fb1c9", fontSize: 14 }}>
              {phase.name === "pushing"
                ? `Contacting Safaricom — the M-Pesa prompt for Paybill ${PAYBILL} is on its way.`
                : phase.stkDispatched
                  ? `Please enter your M-Pesa PIN for Paybill ${PAYBILL}. A prompt for ${kes(phase.amountKes)} has been sent to your handset. This screen updates automatically once payment lands.`
                  : `The automatic prompt could not be sent — use the manual Paybill option below. This screen updates automatically once payment lands.`}
            </p>
            {phase.name === "awaiting_pin" && (
              <>
                <details
                  open={!phase.stkDispatched}
                  style={{
                    border: "1px dashed #3a4f74",
                    borderRadius: 10,
                    padding: "10px 14px",
                    fontSize: 14,
                    lineHeight: 1.7,
                  }}
                >
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>
                    Didn&apos;t receive the prompt? Pay manually
                  </summary>
                  Go to M-Pesa → Lipa na M-Pesa → Paybill
                  <br />
                  Paybill Business No: <strong>{PAYBILL}</strong>
                  <br />
                  Account No: <strong>{phase.accountReference}</strong>
                  <br />
                  Amount: <strong>{kes(phase.amountKes)}</strong>
                  <br />
                  <em style={{ color: "#9fb1c9" }}>
                    Manual payments are verified automatically within ~2 minutes
                    via backend webhook matching.
                  </em>
                </details>
                <p style={{ fontSize: 13, color: "#5f7392", marginBottom: 0 }}>
                  Waiting for confirmation… (checking every 3 seconds)
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {phase.name === "paid" && (
        <section style={{ ...card, marginTop: 20, borderColor: "#1d7a45" }} role="status">
          <h2 style={{ marginTop: 0, fontSize: 20, color: "#4ade80" }}>
            Payment confirmed 🎉
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            Athlete reference code: <strong>{phase.accountReference}</strong>
            {phase.receipt && (
              <>
                <br />
                M-Pesa receipt: <strong>{phase.receipt}</strong>
              </>
            )}
            <br />
            Your athlete&apos;s Digital Athlete Performance Profile is being
            provisioned and a training group assignment is underway. Portal
            access details will arrive by email shortly.
          </p>
          <p style={{ fontSize: 14, color: "#9fb1c9" }}>
            Redirecting you to the onboarding dashboard…{" "}
            <a href={ONBOARDING_URL} style={{ color: "#4ade80" }}>
              Continue now →
            </a>
          </p>
        </section>
      )}
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterForm />
    </Suspense>
  );
}
