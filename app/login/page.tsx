"use client";

// =====================================================================
// UNIFIED SIGN-ON — one account, three workspaces.
//
// Magic link is the default (no password to leak or reset). Password
// sign-in stays available because magic links depend on Supabase SMTP
// being provisioned; if email is down the founder must still get in.
// Workspace grants are resolved server-side after sign-in — this screen
// knows nothing about roles.
// =====================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/utils/supabaseClient";

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
  marginTop: 14,
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Already signed in (or just returned from a magic link) → straight in.
  useEffect(() => {
    supabaseClient.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (session) router.replace("/dashboard");
    });
    return () => subscription.unsubscribe();
  }, [router]);

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error } = await supabaseClient.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setBusy(false);
    setNotice(
      error
        ? { tone: "err", text: error.message }
        : { tone: "ok", text: "Check your inbox — the sign-in link is valid for one hour." },
    );
  }

  async function signInWithPassword() {
    if (!password) {
      setNotice({ tone: "err", text: "Enter your password, or use the magic link instead." });
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    setBusy(false);
    if (error) setNotice({ tone: "err", text: error.message });
    else router.replace("/dashboard");
  }

  return (
    <main style={{ maxWidth: 440, margin: "0 auto", padding: "64px 16px 40px" }}>
      <p style={{ fontSize: 12, letterSpacing: 2, color: "#5f7392", textTransform: "uppercase" }}>
        NRHL · Big Ice · Athlytica HQ
      </p>
      <h1 style={{ fontSize: 26, margin: "4px 0 6px" }}>Sign in</h1>
      <p style={{ color: "#9fb1c9", marginTop: 0, fontSize: 14 }}>
        One account across every workspace. Your access is resolved after sign-in.
      </p>

      <form onSubmit={sendMagicLink} style={{ ...card, marginTop: 20 }}>
        <label style={{ ...label, marginTop: 0 }}>
          Work email
          <input
            style={input}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label style={label}>
          Password <span style={{ fontWeight: 400, color: "#5f7392" }}>(optional)</span>
          <input
            style={input}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {notice && (
          <p
            role="alert"
            style={{
              marginTop: 14,
              marginBottom: 0,
              fontSize: 13,
              color: notice.tone === "ok" ? "#4ade80" : "#ffb3c6",
            }}
          >
            {notice.text}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            marginTop: 18,
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
          {busy ? "Working…" : "Email me a sign-in link"}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => void signInWithPassword()}
          style={{
            width: "100%",
            marginTop: 10,
            padding: "10px 16px",
            borderRadius: 10,
            border: "1px solid #2c3d5c",
            background: "transparent",
            color: "#e6edf6",
            fontSize: 14,
            fontWeight: 600,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          Sign in with password
        </button>

        {/* Consent notice lives INSIDE the card — it must be visible at
            the moment of sign-in, not stranded below the fold. */}
        <p
          style={{
            marginTop: 18,
            marginBottom: 0,
            paddingTop: 14,
            borderTop: "1px solid #24334d",
            fontSize: 12,
            color: "#9fb1c9",
            lineHeight: 1.8,
          }}
        >
          By signing in you agree to the{" "}
          <Link href="/terms" style={{ color: "#73a8ff", textDecoration: "underline" }}>
            Terms of Service
          </Link>{" "}
          and the{" "}
          <Link href="/privacy" style={{ color: "#73a8ff", textDecoration: "underline" }}>
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </main>
  );
}
