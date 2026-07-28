// =====================================================================
// ATHLYTICA APP ENTRY (/) — the public marketing surface.
//
// Server-rendered for signed-out visitors. Signed-in visitors are routed
// to the dashboard their role owns by <RedirectIfAuthed>, which has to
// run client-side because the Supabase session is held in localStorage
// rather than a cookie (see components/auth/redirect-if-authed.tsx for
// the redirect graph, and lib/auth/landing.ts for the destination table).
//
// Nav targets are in-page anchors, not routes: this is one scroll, and a
// route per marketing section is a route per thing that can 404.
//
// Pricing deliberately does NOT live here — /register owns the tier
// funnel and its M-Pesa checkout.
// =====================================================================

import Link from "next/link";
import { RedirectIfAuthed } from "@/components/auth/redirect-if-authed";
import { WORKSPACES, WORKSPACE_IDS, WORKSPACE_SLUGS } from "@/config/workspaces";
import { fetchBigIcePricing, BIG_ICE_SOURCE_URL } from "@/lib/services/bigice-pricing";

/**
 * Default tenant list. Derived from config/workspaces.ts rather than
 * hand-written, so the marketing page and the workspace shell can never
 * disagree about which ventures exist — and so no network call is
 * needed to name ventures that are known at build time.
 */
const FALLBACK_TENANTS = WORKSPACE_IDS.map((id) => ({
  id: WORKSPACE_SLUGS[id],
  name: WORKSPACES[id].label,
  code: WORKSPACES[id].short.toUpperCase(),
  accent: WORKSPACES[id].accent,
}));

const page: React.CSSProperties = {
  minHeight: "100vh",
  background: "linear-gradient(135deg, #07111f 0%, #111d31 100%)",
  color: "#e6edf6",
};

const shell: React.CSSProperties = {
  maxWidth: 1080,
  margin: "0 auto",
  padding: "20px 20px 0",
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

const navLink: React.CSSProperties = {
  color: "#9fb1c9",
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
  padding: "8px 4px",
};

const card: React.CSSProperties = {
  background: "rgba(11, 22, 39, 0.82)",
  border: "1px solid #24334d",
  borderRadius: 16,
  padding: 22,
};

const eyebrow: React.CSSProperties = {
  margin: 0,
  color: "#73a8ff",
  fontSize: 12,
  letterSpacing: "0.3em",
  textTransform: "uppercase",
};

const sectionHeading: React.CSSProperties = {
  margin: "10px 0 8px",
  fontSize: 26,
  lineHeight: 1.25,
};

const lede: React.CSSProperties = { margin: 0, color: "#9fb1c9", fontSize: 15, lineHeight: 1.75 };

// Anchor ids double as the nav hrefs — one list, no drift.
const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "sports", label: "Sports" },
  { id: "taxonomy", label: "Taxonomy" },
  { id: "coaches", label: "Coaches" },
  { id: "pricing", label: "Pricing" },
] as const;

const FEATURES = [
  {
    title: "Digital Scouting Passport",
    body: "One verified athlete record — identity, biometrics, custody history — that follows the athlete between clubs, leagues, and federations instead of dying in a club spreadsheet.",
  },
  {
    title: "Combine & Session Telemetry",
    body: "Speed, agility, stamina, technical and cognitive captures land against the passport, venue-verified, with a composite score that a scout can actually defend.",
  },
  {
    title: "League Operations",
    body: "Rosters, standings, drafting, onboarding documents and conduct records in one command centre, so the table and the paperwork read from the same rows.",
  },
  {
    title: "Programme Billing",
    body: "M-Pesa Paybill checkout and settlement reconciliation wired to the same registration record — the money and the roster never disagree.",
  },
];

const SPORTS = [
  { name: "Ice Hockey", note: "NRHL league play, combines, and the road to the 2027 draft." },
  { name: "Inline Hockey", note: "Big Ice academy tracks, rink scheduling, and session packs." },
  { name: "Football", note: "TTA International Football Academy — squads, programmes, scout exports." },
  { name: "Your sport next", note: "The taxonomy is sport-agnostic: add a sport code, not a product." },
];

const TAXONOMY = [
  { term: "Athlete", body: "The root identity. Legal name, date of birth, provenance, current status." },
  { term: "Sport profile", body: "Per-sport discipline, position, dominant side — one athlete, many sports." },
  { term: "Performance record", body: "A single measured event, with the evidence hash that backs it." },
  { term: "Custody record", body: "Which club or federation held the athlete, and between which dates." },
  { term: "Provenance", body: "Who entered a record, how it was verified, and how much to trust it." },
];

// The Big Ice price sheet is the one piece of this page that is fetched
// rather than compiled in. fetchBigIcePricing() cannot throw and cannot
// hang (1.5s abort, static fallback), so no Suspense or error boundary
// is warranted — the failure mode is "slightly stale prices", not a
// broken render.
export default async function HomePage() {
  const pricing = await fetchBigIcePricing();

  return (
    <main style={page}>
      <RedirectIfAuthed />

      <div style={shell}>
        {/* ------------------------------------------------------ header */}
        <header
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            justifyContent: "space-between",
            alignItems: "center",
            paddingBottom: 48,
          }}
        >
          <Link
            href="/"
            style={{ fontSize: 17, fontWeight: 800, letterSpacing: "0.02em", color: "#e6edf6", textDecoration: "none" }}
          >
            Athlytica HQ
          </Link>

          <nav aria-label="Primary" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} style={navLink}>
                {s.label}
              </a>
            ))}
            <Link href="/register" style={{ ...secondaryCta, padding: "9px 18px", fontSize: 14 }}>
              Get Profiled
            </Link>
            <Link href="/login" style={{ ...primaryCta, padding: "9px 18px", fontSize: 14 }}>
              Sign In / Get Started
            </Link>
          </nav>
        </header>

        {/* -------------------------------------------------------- hero */}
        <section style={{ maxWidth: 780 }}>
          <p style={eyebrow}>Athlete performance operating system</p>
          <h1 style={{ margin: "12px 0 14px", fontSize: "clamp(2.1rem, 5vw, 3.4rem)", lineHeight: 1.1 }}>
            Elevate Every Athlete. Every Sport.
          </h1>
          <p style={{ ...lede, fontSize: 17 }}>
            Athlytica unifies athlete profiling, combine operations, league administration, and
            programme billing behind a single workspace shell — so the roster, the standings, and
            the money all read from the same record.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 30 }}>
            <Link href="/login" style={primaryCta}>
              Sign In / Get Started
            </Link>
            <a href="#features" style={secondaryCta}>
              Learn More
            </a>
          </div>
        </section>

        {/* ---------------------------------------------------- features */}
        <section id="features" style={{ scrollMarginTop: 24, marginTop: 80 }}>
          <p style={eyebrow}>Features</p>
          <h2 style={sectionHeading}>One record, from first combine to first contract.</h2>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              marginTop: 24,
            }}
          >
            {FEATURES.map((f) => (
              <article key={f.title} style={card}>
                <h3 style={{ margin: "0 0 8px", fontSize: 17, lineHeight: 1.4 }}>{f.title}</h3>
                <p style={{ ...lede, fontSize: 14 }}>{f.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------------ sports */}
        <section id="sports" style={{ scrollMarginTop: 24, marginTop: 72 }}>
          <p style={eyebrow}>Sports</p>
          <h2 style={sectionHeading}>Built sport-agnostic, proven on ice and on grass.</h2>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              marginTop: 24,
            }}
          >
            {SPORTS.map((s) => (
              <article key={s.name} style={card}>
                <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{s.name}</h3>
                <p style={{ ...lede, fontSize: 14 }}>{s.note}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------- taxonomy */}
        <section id="taxonomy" style={{ scrollMarginTop: 24, marginTop: 72 }}>
          <p style={eyebrow}>Taxonomy</p>
          <h2 style={sectionHeading}>The vocabulary every workspace shares.</h2>
          <p style={{ ...lede, maxWidth: 720 }}>
            Every dashboard on the platform is a view over the same entities. Learn five words and
            you can read any of them.
          </p>
          <dl style={{ ...card, marginTop: 24, display: "grid", gap: 14 }}>
            {TAXONOMY.map((t) => (
              <div key={t.term} style={{ display: "grid", gap: 4 }}>
                <dt style={{ fontWeight: 700, fontSize: 15 }}>{t.term}</dt>
                <dd style={{ ...lede, fontSize: 14, margin: 0 }}>{t.body}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ----------------------------------------------------- coaches */}
        <section id="coaches" style={{ scrollMarginTop: 24, marginTop: 72 }}>
          <p style={eyebrow}>Coaches</p>
          <h2 style={sectionHeading}>Leagues and academies already running on Athlytica.</h2>
          <p style={{ ...lede, maxWidth: 720 }}>
            Registering an athlete? Pick the league or academy below during registration and the
            record lands in that coach&apos;s roster from day one — no re-keying, no orphaned
            spreadsheet.
          </p>
          <div
            style={{
              display: "grid",
              gap: 16,
              gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
              marginTop: 24,
            }}
          >
            {FALLBACK_TENANTS.map((tenant) => (
              <article key={tenant.id} style={card}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    letterSpacing: "0.22em",
                    textTransform: "uppercase",
                    color: tenant.accent,
                  }}
                >
                  {tenant.code}
                </p>
                <h3 style={{ margin: "8px 0 0", fontSize: 17, lineHeight: 1.4 }}>{tenant.name}</h3>
              </article>
            ))}
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}>
            <Link href="/register" style={primaryCta}>
              Get Profiled
            </Link>
            <Link href="/login" style={secondaryCta}>
              Sign In / Get Started
            </Link>
          </div>
        </section>

        {/* ----------------------------------------------------- pricing */}
        <section id="pricing" style={{ scrollMarginTop: 24, marginTop: 72 }}>
          <p style={eyebrow}>Pricing</p>
          <h2 style={sectionHeading}>Big Ice Academy cohorts.</h2>
          <p style={{ ...lede, maxWidth: 720 }}>
            Published rates for the Big Ice Hockey &amp; Inline Academy. Combine entries are shared
            with the NRHL pre-season funnel — one payment, one athlete record.
          </p>

          <div
            style={{
              display: "grid",
              gap: 12,
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              marginTop: 24,
            }}
          >
            {pricing.tiers.map((tier) => (
              <article key={tier.id} style={{ ...card, padding: 18 }}>
                <h3 style={{ margin: "0 0 6px", fontSize: 15, lineHeight: 1.4 }}>{tier.label}</h3>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: "#38bdf8" }}>
                  {tier.amountKes === null
                    ? "Custom quote"
                    : `KES ${tier.amountKes.toLocaleString("en-KE")}`}
                </p>
              </article>
            ))}
          </div>

          <p style={{ marginTop: 18, fontSize: 12, color: "#5f7392" }}>
            {pricing.live ? "Live from " : "Last published rates from "}
            <a href={BIG_ICE_SOURCE_URL} style={{ color: "#73a8ff" }}>
              bigice.co.ke
            </a>
            . Final amounts are confirmed at checkout.
          </p>
        </section>

        {/* ------------------------------------------------------ footer */}
        <footer
          style={{
            marginTop: 88,
            paddingTop: 24,
            paddingBottom: 48,
            borderTop: "1px solid #24334d",
            display: "flex",
            flexWrap: "wrap",
            gap: 14,
            justifyContent: "space-between",
            fontSize: 13,
            color: "#5f7392",
          }}
        >
          <span>© {new Date().getFullYear()} Athlytica HQ · Nairobi, Kenya</span>
          <span style={{ display: "flex", gap: 16 }}>
            <Link href="/privacy" style={{ color: "#73a8ff" }}>
              Privacy Policy
            </Link>
            <Link href="/terms" style={{ color: "#73a8ff" }}>
              Terms of Service
            </Link>
            <Link href="/login" style={{ color: "#73a8ff" }}>
              Sign in
            </Link>
          </span>
        </footer>
      </div>
    </main>
  );
}
