"use client";

// =====================================================================
// PROFILE SETUP — the one step between an account and a dashboard.
//
// Lives OUTSIDE the (app) route group on purpose: the workspace shell
// refuses to render for an actor with no grant, which is exactly the
// person who needs this page. So it does its own session check.
//
// Filing a profile grants nothing (see the migration header). The copy
// says so plainly rather than implying a dashboard is one click away —
// a false promise here becomes a support message an hour later.
//
// Anyone who already holds a grant is bounced to their real dashboard
// by landingFor(), so the founder never sees this form.
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/utils/supabaseClient";
import { WORKSPACES, WORKSPACE_IDS, type WorkspaceId } from "@/config/workspaces";

const REQUESTED_ROLES = [
  { id: "ATHLETE", label: "Athlete — I'm the one training or competing" },
  { id: "PARENT", label: "Parent / guardian — I'm registering an athlete" },
  { id: "COACH", label: "Coach — I run sessions for a club or academy" },
  { id: "SCOUT", label: "Scout — I evaluate athletes for a club or programme" },
] as const;

type RequestedRole = (typeof REQUESTED_ROLES)[number]["id"];

const card: React.CSSProperties = {
  background: "#111a2c",
  border: "1px solid #24334d",
  borderRadius: 14,
  padding: 24,
};

const input: React.CSSProperties = {
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

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#9fb1c9",
  marginTop: 16,
};

type Phase = "checking" | "form" | "saving" | "saved";

export default function OnboardingPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("checking");
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceId>("nrhl");
  const [requestedRole, setRequestedRole] = useState<RequestedRole>("PARENT");
  const [note, setNote] = useState("");

  // Own session gate — the shell's guard does not cover this route.
  useEffect(() => {
    let cancelled = false;
    void supabaseClient.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      const session = data.session;
      if (!session) {
        router.replace("/login?redirectTo=%2Fonboarding");
        return;
      }
      setToken(session.access_token);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Prefill from an existing profile so this doubles as "edit profile".
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void fetch("/api/v1/onboarding/profile", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((body: { profile?: Record<string, string | null> | null }) => {
        if (cancelled) return;
        const p = body.profile;
        if (p) {
          setFullName(p.full_name ?? "");
          setPhone(p.phone ?? "");
          if (p.requested_workspace && WORKSPACE_IDS.includes(p.requested_workspace as WorkspaceId)) {
            setWorkspace(p.requested_workspace as WorkspaceId);
          }
          if (REQUESTED_ROLES.some((r) => r.id === p.requested_role)) {
            setRequestedRole(p.requested_role as RequestedRole);
          }
          setNote(p.note ?? "");
        }
        setPhase("form");
      })
      .catch(() => !cancelled && setPhase("form"));
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!token) return;
      setPhase("saving");
      setError(null);
      try {
        const res = await fetch("/api/v1/onboarding/profile", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            phone,
            requestedWorkspace: workspace,
            requestedRole,
            note,
          }),
        });
        const body = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !body.success) {
          setError(body.error ?? `Could not save your profile (${res.status}).`);
          setPhase("form");
          return;
        }
        setPhase("saved");
      } catch {
        setError("Network error — please try again.");
        setPhase("form");
      }
    },
    [token, fullName, phone, workspace, requestedRole, note],
  );

  if (phase === "checking") {
    return <Shell>Checking your session…</Shell>;
  }

  if (phase === "saved") {
    return (
      <Shell>
        <div style={{ ...card, borderColor: "#1d7a45", textAlign: "left" }} role="status">
          <h1 style={{ fontSize: 21, marginTop: 0, color: "#4ade80" }}>Profile saved</h1>
          <p style={{ color: "#9fb1c9", lineHeight: 1.75, fontSize: 14 }}>
            Thanks, {fullName.split(" ")[0]}. You&apos;ve asked to join{" "}
            <strong style={{ color: "#e6edf6" }}>{WORKSPACES[workspace].label}</strong> as a{" "}
            {requestedRole.toLowerCase()}.
          </p>
          <p style={{ color: "#9fb1c9", lineHeight: 1.75, fontSize: 14 }}>
            An Athlytica HQ administrator reviews every request before access opens — a profile is a
            request, not a key. You&apos;ll get an email once your workspace is live.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
            <Link
              href="/dashboard"
              style={{
                padding: "11px 22px",
                borderRadius: 10,
                background: "#2f81f7",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Check access status
            </Link>
            <button
              type="button"
              onClick={() => setPhase("form")}
              style={{
                padding: "11px 22px",
                borderRadius: 10,
                border: "1px solid #2c3d5c",
                background: "transparent",
                color: "#e6edf6",
                fontWeight: 600,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              Edit details
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const busy = phase === "saving";

  return (
    <Shell>
      <div style={{ textAlign: "left", width: "100%" }}>
        <p style={{ fontSize: 12, letterSpacing: 2, color: "#5f7392", textTransform: "uppercase" }}>
          Step 1 of 1
        </p>
        <h1 style={{ fontSize: 26, margin: "4px 0 6px" }}>Tell us who you are</h1>
        <p style={{ color: "#9fb1c9", marginTop: 0, fontSize: 14, lineHeight: 1.7 }}>
          Every account files a profile before a dashboard opens. Pick the league or academy you
          belong to and we&apos;ll route you to the right coach.
        </p>

        <form onSubmit={submit} style={{ ...card, marginTop: 20 }}>
          <label style={{ ...label, marginTop: 0 }}>
            Full name
            <input
              style={input}
              required
              minLength={2}
              maxLength={120}
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>

          <label style={label}>
            Phone <span style={{ fontWeight: 400, color: "#5f7392" }}>(optional)</span>
            <input
              style={input}
              type="tel"
              autoComplete="tel"
              placeholder="07XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>

          <label style={label}>
            League / academy
            <select
              style={input}
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value as WorkspaceId)}
            >
              {WORKSPACE_IDS.map((id) => (
                <option key={id} value={id}>
                  {WORKSPACES[id].label}
                </option>
              ))}
            </select>
          </label>

          <label style={label}>
            I am a…
            <select
              style={input}
              value={requestedRole}
              onChange={(e) => setRequestedRole(e.target.value as RequestedRole)}
            >
              {REQUESTED_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <label style={label}>
            Anything we should know?{" "}
            <span style={{ fontWeight: 400, color: "#5f7392" }}>(optional)</span>
            <textarea
              style={{ ...input, minHeight: 76, resize: "vertical" }}
              maxLength={500}
              placeholder="Athlete name and age, the coach who referred you, your club…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && (
            <p role="alert" style={{ marginTop: 14, marginBottom: 0, fontSize: 13, color: "#ffb3c6" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 20,
              padding: "12px 16px",
              borderRadius: 10,
              border: "none",
              background: busy ? "#1d3a63" : "#2f81f7",
              color: "#fff",
              fontSize: 15,
              fontWeight: 700,
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Saving…" : "Save profile"}
          </button>

          <p
            style={{
              marginTop: 16,
              marginBottom: 0,
              paddingTop: 14,
              borderTop: "1px solid #24334d",
              fontSize: 12,
              color: "#9fb1c9",
              lineHeight: 1.8,
            }}
          >
            An administrator reviews every request before access opens. Read the{" "}
            <Link href="/privacy" style={{ color: "#73a8ff", textDecoration: "underline" }}>
              Privacy Policy
            </Link>{" "}
            for what we do with this.
          </p>
        </form>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 16px",
        color: "#e6edf6",
        fontSize: 15,
      }}
    >
      <div style={{ maxWidth: 480, width: "100%" }}>{children}</div>
    </main>
  );
}
