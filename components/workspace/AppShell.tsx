"use client";

// =====================================================================
// APP SHELL — top-bar workspace switcher, founder perspective toggle,
// per-workspace sidebar, legal footer (founder directive 2026-07-26).
//
// The sidebar is generated from NAV: one entry per dashboard panel,
// filtered by the actor's role in the ACTIVE workspace (canSee) and by
// the founder's Executive/Coach lens. Panels and nav share the same ids,
// so the nav is an anchor list — no route per widget.
// =====================================================================

import type { ReactNode } from "react";
import Link from "next/link";
import { WORKSPACES, visibleNav, type WorkspaceId } from "@/config/workspaces";
import { useWorkspace } from "./WorkspaceProvider";
import { buttonStyle, selectStyle, theme } from "./ui";

export function AppShell({ children }: { children: ReactNode }) {
  const {
    ready,
    actor,
    available,
    workspace,
    setWorkspace,
    role,
    perspective,
    setPerspective,
    loading,
    error,
    refresh,
    signOut,
  } = useWorkspace();

  if (!ready || !actor) {
    return (
      <main style={{ padding: 48, color: theme.muted, fontSize: 14 }}>
        {ready ? "Resolving workspace access…" : "Checking your session…"}
      </main>
    );
  }

  if (available.length === 0) {
    return (
      <main style={{ maxWidth: 560, margin: "80px auto", padding: 24 }}>
        <h1 style={{ fontSize: 22 }}>No workspace access</h1>
        <p style={{ color: theme.muted, lineHeight: 1.7 }}>
          Signed in as <strong>{actor.email}</strong>, but no workspace role has been granted to
          this account yet. Ask the Athlytica HQ administrator to add you to a workspace.
        </p>
        <button type="button" style={buttonStyle} onClick={() => void signOut()}>
          Sign out
        </button>
      </main>
    );
  }

  const nav = workspace && role ? visibleNav(workspace, role, perspective) : [];
  const accent = workspace ? WORKSPACES[workspace].accent : theme.accent;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* ---------------------------------------------------------- top */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
          padding: "12px 20px",
          borderBottom: `1px solid ${theme.border}`,
          background: theme.panelAlt,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <span style={{ fontWeight: 800, letterSpacing: "0.14em", fontSize: 13, color: accent }}>
          ATHLYTICA
        </span>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
          <span style={{ color: theme.dim }}>Workspace</span>
          <select
            style={{ ...selectStyle, borderColor: accent }}
            value={workspace ?? ""}
            onChange={(e) => setWorkspace(e.target.value as WorkspaceId)}
            aria-label="Switch workspace"
          >
            {available.map((id) => (
              <option key={id} value={id}>
                {WORKSPACES[id].label}
              </option>
            ))}
          </select>
        </label>

        {role === "GLOBAL_FOUNDER" && (
          <div
            role="group"
            aria-label="Perspective"
            style={{
              display: "flex",
              border: `1px solid ${theme.border}`,
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            {(["executive", "coach"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPerspective(p)}
                aria-pressed={perspective === p}
                style={{
                  ...buttonStyle,
                  border: "none",
                  borderRadius: 0,
                  padding: "6px 14px",
                  textTransform: "capitalize",
                  background: perspective === p ? accent : "transparent",
                  color: perspective === p ? "#08111f" : theme.muted,
                }}
              >
                {p} view
              </button>
            ))}
          </div>
        )}

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
          {loading && <span style={{ fontSize: 12, color: theme.dim }}>syncing…</span>}
          <button type="button" style={buttonStyle} onClick={refresh}>
            Refresh
          </button>
          <span style={{ fontSize: 12, color: theme.muted }}>
            {actor.email}
            {role && (
              <span style={{ color: theme.dim }}> · {role.replace("_", " ").toLowerCase()}</span>
            )}
          </span>
          <button type="button" style={buttonStyle} onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, alignItems: "flex-start" }}>
        {/* ------------------------------------------------------ sidebar */}
        <nav
          style={{
            width: 232,
            flexShrink: 0,
            padding: "20px 14px",
            borderRight: `1px solid ${theme.border}`,
            position: "sticky",
            top: 57,
          }}
        >
          <p
            style={{
              margin: "0 0 10px",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.dim,
            }}
          >
            {workspace ? WORKSPACES[workspace].short : ""} panels
          </p>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 4 }}>
            {nav.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  style={{
                    display: "block",
                    padding: "8px 10px",
                    borderRadius: 8,
                    color: theme.muted,
                    textDecoration: "none",
                    fontSize: 13,
                    borderLeft: `2px solid ${accent}55`,
                  }}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          {role === "GLOBAL_FOUNDER" && perspective === "coach" && (
            <p style={{ fontSize: 12, color: theme.dim, marginTop: 14, lineHeight: 1.6 }}>
              Coach view active — financial and administration panels are hidden.
            </p>
          )}
        </nav>

        {/* --------------------------------------------------------- main */}
        <main style={{ flex: 1, padding: "20px 24px 40px", minWidth: 0 }}>
          {error && (
            <p
              role="alert"
              style={{
                background: "#2c1520",
                border: "1px solid #7f2b45",
                borderRadius: 8,
                padding: "10px 12px",
                fontSize: 13,
                color: "#ffb3c6",
              }}
            >
              {error}
            </p>
          )}
          {children}
        </main>
      </div>

      {/* ------------------------------------------------------- footer */}
      <footer
        style={{
          borderTop: `1px solid ${theme.border}`,
          padding: "14px 20px",
          fontSize: 12,
          color: theme.dim,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>© {new Date().getFullYear()} Athlytica Technologies Limited</span>
        <Link href="/terms" style={{ color: theme.muted }}>
          Terms of Service
        </Link>
        <Link href="/privacy" style={{ color: theme.muted }}>
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
