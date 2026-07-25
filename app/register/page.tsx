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

const TIERS = [
  {
    id: "baseline_7500",
    label: "Baseline Tech Profiling",
    brand: "Athlytica",
    amountKes: 7_500,
    blurb: "Digital Scouting Passport + baseline metric capture.",
  },
  {
    id: "combine_27500",
    label: "Fall Combine",
    brand: "NRHL",
    amountKes: 27_500,
    blurb: "Full combine entry with evaluation pod placement.",
  },
  {
    id: "acceleration_45000",
    label: "Acceleration Program",
    brand: "NRHL",
    amountKes: 45_000,
    blurb: "Combine entry + 3-to-8 coaching pod acceleration track.",
  },
] as const;

type TierId = (typeof TIERS)[number]["id"];

const CAMPUS_NODES = ["The Summit", "The Ridge", "The Plateau", "The Savannah"];

const PAYBILL = "4325935";
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
  | { name: "paid"; receipt: string | null }
  | { name: "error"; message: string };

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
  const source = searchParams.get("source") ?? undefined;

  const [tier, setTier] = useState<TierId>(
    TIERS.some((t) => t.id === urlTier) ? (urlTier as TierId) : "combine_27500",
  );
  const [parentName, setParentName] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [athleteName, setAthleteName] = useState("");
  const [athleteAge, setAthleteAge] = useState("");
  const [campus, setCampus] = useState(CAMPUS_NODES[0]);
  const [phase, setPhase] = useState<Phase>({ name: "form" });
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const selected = TIERS.find((t) => t.id === tier)!;

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function startPolling(registrationId: string) {
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
          setPhase({ name: "paid", receipt: body.mpesaReceipt ?? null });
        }
      } catch {
        // transient poll failure — next tick retries
      }
    }, POLL_INTERVAL_MS);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPhase({ name: "pushing" });
    try {
      const res = await fetch("/api/v1/biz/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phoneNumber,
          tier,
          athleteName,
          parentName,
          parentEmail,
          ...(athleteAge ? { athleteAge: Number(athleteAge) } : {}),
          preferredCampus: campus,
          ...(source === "nrhl" || source === "bigice" || source === "athlytica"
            ? { source }
            : {}),
        }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        registrationId?: string;
        accountReference?: string;
        amountKes?: number;
        stkPush?: { dispatched: boolean };
      };
      if (!res.ok || !body.success || !body.registrationId) {
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
        amountKes: body.amountKes ?? selected.amountKes,
        stkDispatched: body.stkPush?.dispatched ?? false,
      });
      startPolling(body.registrationId);
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

      {/* Tier selection */}
      <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
        {TIERS.map((t) => (
          <label
            key={t.id}
            style={{
              ...card,
              padding: 14,
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              cursor: "pointer",
              borderColor: tier === t.id ? "#2f81f7" : "#24334d",
              background: tier === t.id ? "#122036" : "#111a2c",
            }}
          >
            <input
              type="radio"
              name="tier"
              value={t.id}
              checked={tier === t.id}
              onChange={() => setTier(t.id)}
              style={{ marginTop: 4 }}
            />
            <span style={{ flex: 1 }}>
              <span style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                <span>{t.label}</span>
                <span>{kes(t.amountKes)}</span>
              </span>
              <span style={{ display: "block", fontSize: 13, color: "#9fb1c9", marginTop: 2 }}>
                {t.brand} · {t.blurb}
              </span>
            </span>
          </label>
        ))}
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

          <button
            type="submit"
            disabled={phase.name === "pushing"}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "13px 16px",
              borderRadius: 10,
              border: "none",
              background: phase.name === "pushing" ? "#1d4e33" : "#16a34a",
              color: "#fff",
              fontSize: 16,
              fontWeight: 700,
              cursor: phase.name === "pushing" ? "wait" : "pointer",
            }}
          >
            {phase.name === "pushing"
              ? "Sending M-Pesa prompt…"
              : `Pay ${kes(selected.amountKes)} via M-Pesa STK Push`}
          </button>
        </form>
      ) : null}

      {phase.name === "awaiting_pin" && (
        <section style={{ ...card, marginTop: 20 }} aria-live="polite">
          <h2 style={{ marginTop: 0, fontSize: 18 }}>
            {phase.stkDispatched
              ? "Check your phone and enter your M-Pesa PIN…"
              : "Complete payment via Paybill"}
          </h2>
          <p style={{ color: "#9fb1c9", fontSize: 14 }}>
            {phase.stkDispatched
              ? `A prompt for ${kes(phase.amountKes)} has been sent to your handset. This page updates automatically once payment lands.`
              : `The automatic prompt could not be sent — use the manual Paybill option below. This page updates automatically once payment lands.`}
          </p>
          <div
            style={{
              border: "1px dashed #3a4f74",
              borderRadius: 10,
              padding: 14,
              fontSize: 14,
              lineHeight: 1.7,
            }}
          >
            <strong>Manual Paybill option</strong>
            <br />
            Paybill Business No: <strong>{PAYBILL}</strong>
            <br />
            Account No: <strong>{phase.accountReference}</strong>
            <br />
            Amount: <strong>{kes(phase.amountKes)}</strong>
            <br />
            <em style={{ color: "#9fb1c9" }}>
              Manual payments are verified automatically within ~2 minutes via
              backend webhook matching.
            </em>
          </div>
          <p style={{ fontSize: 13, color: "#5f7392" }}>
            Waiting for confirmation… (checking every 3 seconds)
          </p>
        </section>
      )}

      {phase.name === "paid" && (
        <section style={{ ...card, marginTop: 20, borderColor: "#1d7a45" }} role="status">
          <h2 style={{ marginTop: 0, fontSize: 20, color: "#4ade80" }}>
            Payment confirmed 🎉
          </h2>
          <p style={{ fontSize: 15, lineHeight: 1.6 }}>
            {phase.receipt && (
              <>
                M-Pesa receipt: <strong>{phase.receipt}</strong>
                <br />
              </>
            )}
            Your athlete&apos;s Scouting Passport is being provisioned and a
            coaching pod assignment is underway. Portal access details will
            arrive by email shortly.
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
