// =====================================================================
// ATHLYTICA APP ENTRY (/) — replaces the legacy Big Ice conversion mock.
//
// Server-rendered marketing shell for signed-out visitors. Signed-in
// visitors are bounced to /dashboard by <RedirectIfAuthed>, which has to
// run client-side because the Supabase session is held in localStorage
// rather than a cookie (see components/auth/redirect-if-authed.tsx for
// the full redirect graph and why middleware cannot do this job).
//
// Pricing deliberately does NOT live here — /register owns the tier
// funnel and its M-Pesa checkout. The old page duplicated a stale tier
// grid that no longer matched it.
// =====================================================================

import Link from "next/link";
import { RedirectIfAuthed } from "@/components/auth/redirect-if-authed";
import { WORKSPACES, WORKSPACE_IDS } from "@/config/workspaces";

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #07111f 0%, #111d31 100%)",
  color: "#e6edf6",
};

const shell: React.CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "28px 20px 96px",
};

const primaryCta: React.CSSProperties = {
  display: "inline-block",
  padding: "13px 26px",
  borderRadius: 10,
  background: "#2f81f7",
  color: "#fff",
  fontWeight: 700,
  fontSize: 15,
  textDecoration: "none",
};

const secondaryCta: React.CSSProperties = {
  ...primaryCta,
  background: "transparent",
  border: "1px solid #2c3d5c",
  color: "#e6edf6",
};

const card: React.CSSProperties = {
  background: "rgba(11, 22, 39, 0.82)",
  border: "1px solid #24334d",
  borderRadius: 16,
  padding: 22,
};

export default function HomePage() {
  return (
    <main style={page}>
      <RedirectIfAuthed />

      <div style={shell}>
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 40,
          }}
        >
          <strong style={{ fontSize: 17, letterSpacing: "0.02em" }}>Athlytica</strong>
          <nav style={{ display: "flex", gap: 10 }}>
            <Link href="/login" style={{ ...secondaryCta, padding: "9px 18px", fontSize: 14 }}>
              Sign in
            </Link>
            <Link href="/register" style={{ ...primaryCta, padding: "9px 18px", fontSize: 14 }}>
              Get started
            </Link>
          </nav>
        </header>

        <section style={{ maxWidth: 760 }}>
          <p
            style={{
              margin: 0,
              color: "#73a8ff",
              fontSize: 12,
              letterSpacing: "0.3em",
              textTransform: "uppercase",
            }}
          >
            Athlete performance operating system
          </p>
          <h1 style={{ margin: "12px 0 14px", fontSize: "clamp(2.1rem, 5vw, 3.4rem)", lineHeight: 1.1 }}>
            One sign-on for every squad, league, and academy you run.
          </h1>
          <p style={{ margin: 0, fontSize: 17, lineHeight: 1.7, color: "#9fb1c9" }}>
            Athlytica unifies athlete profiling, combine operations, league administration, and
            programme billing behind a single workspace shell — so the roster, the standings, and
            the money all read from the same record.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            <Link href="/register" style={primaryCta}>
              Get started
            </Link>
            <Link href="/login" style={secondaryCta}>
              Sign in
            </Link>
          </div>
        </section>

        <section
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
            marginTop: 64,
          }}
        >
          {WORKSPACE_IDS.map((id) => (
            <article key={id} style={card}>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  color: WORKSPACES[id].accent,
                }}
              >
                {WORKSPACES[id].short}
              </p>
              <h2 style={{ margin: "8px 0 0", fontSize: 17, lineHeight: 1.4 }}>
                {WORKSPACES[id].label}
              </h2>
            </article>
          ))}
        </section>

        <p style={{ marginTop: 56, fontSize: 13, color: "#5f7392" }}>
          Already have an account?{" "}
          <Link href="/login" style={{ color: "#73a8ff" }}>
            Sign in
          </Link>{" "}
          · Read the{" "}
          <Link href="/terms" style={{ color: "#73a8ff" }}>
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" style={{ color: "#73a8ff" }}>
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
