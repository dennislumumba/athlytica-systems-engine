"use client";

// =====================================================================
// REVENUE PIPELINE — tab container.
//
// Sits inside the (app) route group, so it inherits the authenticated
// workspace shell. The layout holds the CrmProvider, which Next keeps
// mounted across the nested routes — one fetch serves every tab.
// =====================================================================

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CrmProvider, useCrm } from "@/components/workspace/crm";
import { buttonStyle, theme } from "@/components/workspace/ui";

const BASE = "/dashboard/crm";

const TABS = [
  { slug: "", label: "Today" },
  { slug: "pipeline", label: "Pipeline" },
  { slug: "contacts", label: "Contacts" },
  { slug: "tasks", label: "Tasks" },
  { slug: "reports", label: "Reports" },
] as const;

const TAB_CSS = `
.crm-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid ${theme.border}; }
.crm-tab { padding: 9px 14px; font-size: 13px; text-decoration: none; white-space: nowrap;
  border-bottom: 2px solid transparent; min-height: 44px; display: flex; align-items: center; }
`;

export default function CrmLayout({ children }: { children: ReactNode }) {
  return (
    <CrmProvider>
      <div style={{ display: "grid", gap: 16 }}>
        <style>{TAB_CSS}</style>
        <Header />
        <TabBar />
        {children}
      </div>
    </CrmProvider>
  );
}

function Header() {
  const { loading, refresh, data, role } = useCrm();
  const overdue = data?.metrics.today.overdue.length ?? 0;

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
          ← Command canvas
        </Link>
        <h1 style={{ margin: "6px 0 2px", fontSize: 20 }}>Revenue Pipeline</h1>
        <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
          Prospects, deals and follow-ups across NRHL, Big Ice and Athlytica
          {role ? ` · ${role.replace("_", " ").toLowerCase()}` : ""}
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {overdue > 0 && (
          <span style={{ fontSize: 13, color: theme.bad, fontWeight: 700 }}>
            {overdue} overdue
          </span>
        )}
        {loading && <span style={{ fontSize: 12, color: theme.dim }}>syncing…</span>}
        <button type="button" style={buttonStyle} onClick={refresh}>
          Refresh
        </button>
      </div>
    </header>
  );
}

function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="crm-tabs">
      {TABS.map((tab) => {
        const href = tab.slug ? `${BASE}/${tab.slug}` : BASE;
        const active = pathname === href;
        return (
          <Link
            key={tab.slug || "today"}
            href={href}
            className="crm-tab"
            style={{
              color: active ? theme.text : theme.muted,
              borderBottomColor: active ? theme.accent : "transparent",
              fontWeight: active ? 700 : 500,
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
