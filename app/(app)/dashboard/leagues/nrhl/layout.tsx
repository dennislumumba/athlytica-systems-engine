"use client";

// =====================================================================
// NRHL LEAGUE COMMAND CENTER — tab container.
//
// Sits inside the (app) route group, so it inherits the authenticated
// workspace shell: /dashboard/leagues/nrhl is the live path. The layout
// holds the LeagueProvider, which Next keeps mounted across the six
// nested routes — one fetch serves every tab.
// =====================================================================

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LeagueProvider, useLeague } from "@/components/workspace/nrhl-league";
import { theme } from "@/components/workspace/ui";

const BASE = "/dashboard/leagues/nrhl";

const TABS = [
  { slug: "overview", label: "Executive Overview" },
  { slug: "stats", label: "Stats & Standings" },
  { slug: "admin", label: "Roster & Admin" },
  { slug: "onboarding", label: "Onboarding & Documents" },
  { slug: "drafting", label: "Drafting" },
  { slug: "reports", label: "Reports & Roadmap" },
] as const;

export default function NrhlLeagueLayout({ children }: { children: ReactNode }) {
  return (
    <LeagueProvider>
      <div style={{ display: "grid", gap: 16 }}>
        <Header />
        <TabBar />
        {children}
      </div>
    </LeagueProvider>
  );
}

function Header() {
  const { loading, refresh, data } = useLeague();
  return (
    <header
      style={{
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "space-between",
        gap: 16,
        flexWrap: "wrap",
      }}
    >
      <div>
        <Link
          href="/dashboard"
          style={{
            fontSize: 11,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: theme.dim,
            textDecoration: "none",
          }}
        >
          ← NRHL workspace
        </Link>
        <h1 style={{ margin: "6px 0 2px", fontSize: 24, letterSpacing: "-0.01em" }}>
          League Command Center
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
          Nairobi Regional Hockey League · pre-season combine phase, road to the January 2027 draft.
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {loading && <span style={{ fontSize: 12, color: theme.dim }}>syncing…</span>}
        {data && (
          <span style={{ fontSize: 12, color: theme.dim }}>
            {data.counts.athletes} athletes · {data.counts.scrimmages} matches
          </span>
        )}
        <button
          type="button"
          onClick={refresh}
          style={{
            padding: "7px 12px",
            borderRadius: 8,
            border: `1px solid ${theme.border}`,
            background: theme.panelAlt,
            color: theme.text,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>
    </header>
  );
}

function TabBar() {
  const pathname = usePathname();
  return (
    <nav
      style={{
        display: "flex",
        gap: 4,
        flexWrap: "wrap",
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: 2,
      }}
    >
      {TABS.map((tab) => {
        const href = `${BASE}/${tab.slug}`;
        const active = pathname === href || (tab.slug === "overview" && pathname === BASE);
        return (
          <Link
            key={tab.slug}
            href={href}
            style={{
              padding: "9px 14px",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "none",
              color: active ? theme.text : theme.muted,
              borderBottom: `2px solid ${active ? theme.accent : "transparent"}`,
              background: active ? `${theme.accent}12` : "transparent",
              borderRadius: "8px 8px 0 0",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
