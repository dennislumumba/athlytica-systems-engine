"use client";

import { useMemo, useState } from "react";

const steps = [
  { id: 1, title: "Program focus", blurb: "Choose the pathway that fits your household." },
  { id: 2, title: "Contact details", blurb: "Share who should receive the academy follow-up." },
  { id: 3, title: "Athlete context", blurb: "Let us know where the athlete is now and where they want to go." },
  { id: 4, title: "Confirm", blurb: "Submit the intake and we will reach out promptly." },
] as const;

export function GetIntakeDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    program: "Annual Athlete Pathway",
    parentName: "",
    email: "",
    athleteName: "",
    athleteGoal: "",
  });
  const [status, setStatus] = useState<string | null>(null);

  const progress = useMemo(() => Math.round((step / steps.length) * 100), [step]);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    setStatus("Submitting your intake...");
    const res = await fetch("/api/admissions/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const payload = await res.json();
    if (!res.ok) {
      setStatus(payload.error ?? "We could not submit your intake.");
      return;
    }

    setStatus(payload.message ?? "Your intake was captured successfully.");
    setStep(steps.length);
  };

  const closeDialog = () => {
    setOpen(false);
    setStep(1);
    setStatus(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          border: "none",
          borderRadius: 999,
          padding: "12px 18px",
          background: "#f6c443",
          color: "#07111f",
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        Start intake
      </button>

      {open ? (
        <div style={{ position: "fixed", inset: 0, background: "rgba(2, 8, 23, 0.74)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 1000 }}>
          <div style={{ width: "min(640px, 100%)", background: "#0f172a", borderRadius: 24, padding: 24, border: "1px solid rgba(115, 168, 255, 0.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <p style={{ margin: 0, fontSize: 12, letterSpacing: "0.26em", textTransform: "uppercase", color: "#73a8ff" }}>
                  4-step intake wizard
                </p>
                <h3 style={{ margin: "6px 0 0" }}>{steps[step - 1]?.title}</h3>
              </div>
              <button type="button" onClick={closeDialog} style={{ background: "transparent", border: "none", color: "#dce8ff", fontSize: 22, cursor: "pointer" }}>
                ×
              </button>
            </div>

            <div style={{ marginTop: 16, height: 8, borderRadius: 999, background: "#1e293b" }}>
              <div style={{ width: `${progress}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg, #73a8ff, #f6c443)" }} />
            </div>
            <p style={{ margin: "10px 0 0", color: "#dce8ff" }}>{steps[step - 1]?.blurb}</p>

            {step === 1 ? (
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <label style={{ display: "grid", gap: 6, color: "#dce8ff" }}>
                  Program focus
                  <select value={form.program} onChange={(event) => updateField("program", event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(115, 168, 255, 0.24)", background: "#111827", color: "#f8fafc" }}>
                    <option>Annual Athlete Pathway</option>
                    <option>Athlete Tier</option>
                    <option>Speed-Mov / West</option>
                    <option>Family & Estate</option>
                  </select>
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <label style={{ display: "grid", gap: 6, color: "#dce8ff" }}>
                  Parent / guardian name
                  <input value={form.parentName} onChange={(event) => updateField("parentName", event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(115, 168, 255, 0.24)", background: "#111827", color: "#f8fafc" }} />
                </label>
                <label style={{ display: "grid", gap: 6, color: "#dce8ff" }}>
                  Email
                  <input type="email" value={form.email} onChange={(event) => updateField("email", event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(115, 168, 255, 0.24)", background: "#111827", color: "#f8fafc" }} />
                </label>
              </div>
            ) : null}

            {step === 3 ? (
              <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                <label style={{ display: "grid", gap: 6, color: "#dce8ff" }}>
                  Athlete name
                  <input value={form.athleteName} onChange={(event) => updateField("athleteName", event.target.value)} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(115, 168, 255, 0.24)", background: "#111827", color: "#f8fafc" }} />
                </label>
                <label style={{ display: "grid", gap: 6, color: "#dce8ff" }}>
                  Athlete goal
                  <textarea value={form.athleteGoal} onChange={(event) => updateField("athleteGoal", event.target.value)} rows={4} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(115, 168, 255, 0.24)", background: "#111827", color: "#f8fafc" }} />
                </label>
              </div>
            ) : null}

            {step === 4 ? (
              <div style={{ marginTop: 16, color: "#dce8ff", lineHeight: 1.7 }}>
                <p style={{ marginTop: 0 }}>
                  Review the details and submit the admissions intake. A follow-up will be scheduled once the form is received.
                </p>
                <pre style={{ whiteSpace: "pre-wrap", background: "#111827", borderRadius: 14, padding: 12, color: "#8dd3ff" }}>
                  {JSON.stringify(form, null, 2)}
                </pre>
              </div>
            ) : null}

            {status ? <p style={{ marginTop: 14, color: "#f6c443" }}>{status}</p> : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
              {step > 1 ? (
                <button type="button" onClick={() => setStep((current) => current - 1)} style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid rgba(115, 168, 255, 0.24)", background: "#111827", color: "#dce8ff", cursor: "pointer" }}>
                  Back
                </button>
              ) : null}
              {step < steps.length ? (
                <button type="button" onClick={() => setStep((current) => current + 1)} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#73a8ff", color: "#07111f", cursor: "pointer", fontWeight: 700 }}>
                  Continue
                </button>
              ) : (
                <button type="button" onClick={handleSubmit} style={{ padding: "10px 14px", borderRadius: 10, border: "none", background: "#f6c443", color: "#07111f", cursor: "pointer", fontWeight: 700 }}>
                  Submit intake
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
