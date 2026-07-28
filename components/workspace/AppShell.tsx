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
import {
  MODE_BLURB,
  MODE_LABEL,
  modeFromPerspective,
  panelsFor,
  perspectiveFromMode,
  type CommandMode,
} from "@/config/command";
import { useWorkspace } from "./WorkspaceProvider";
import { buttonStyle, selectStyle, theme } from "./ui";

// The shell is inline-styled like the rest of the app, so its one
// responsive rule (sidebar → horizontal strip on tablets and phones)
// ships as a scoped stylesheet. Widths live in CSS, not inline, because
// an inline width would win over the media query.
const SHELL_CSS = `
.shell-body { display: flex; flex: 1; align-items: flex-start; }
.shell-nav { width: 232px; flex-shrink: 0; padding: 20px 14px; position: sticky; top: 57px;
  border-right: 1px solid ${theme.border}; }
.shell-main { flex: 1; min-width: 0; padding: 20px 24px 40px; }
.shell-tap { min-height: 40px; display: flex; align-items: center; }
@media (max-width: 900px) {
  .shell-body { flex-direction: column; }
  .shell-nav { width: 100%; position: static; border-right: none;
    border-bottom: 1px solid ${theme.border}; padding: 12px 14px; }
  .shell-nav ul { grid-auto-flow: column; grid-auto-columns: max-content;
    overflow-x: auto; padding-bottom: 4px; }
  .shell-main { padding: 16px 14px 32px; }
  .shell-tap { min-height: 44px; }
}
`;

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
  const mode: CommandMode = role === "GLOBAL_FOUNDER" ? modeFromPerspective(perspective) : "coach";
  const commandPanels = role === "ATHLETE" ? [] : panelsFor(mode);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <style>{SHELL_CSS}</style>
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
            aria-label="Operating mode"
            style={{
              display: "flex",
              border: `1px solid ${theme.border}`,
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
            {(["founder", "coach"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className="shell-tap"
                onClick={() => setPerspective(perspectiveFromMode(m))}
                aria-pressed={mode === m}
                title={MODE_BLURB[m]}
                style={{
                  ...buttonStyle,
                  border: "none",
                  borderRadius: 0,
                  padding: "6px 14px",
                  fontSize: 12,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: mode === m ? (m === "founder" ? theme.warn : theme.accent) : "transparent",
                  color: mode === m ? "#08111f" : theme.muted,
                }}
              >
                {MODE_LABEL[m]}
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

      <div className="shell-body">
        {/* ------------------------------------------------------ sidebar */}
        <nav className="shell-nav">
          <NavGroup
            heading={`${MODE_LABEL[mode]} canvas`}
            accent={mode === "founder" ? theme.warn : theme.accent}
            items={commandPanels.map((p) => ({ id: p.id, label: p.label, href: `/dashboard#${p.id}` }))}
          />
          <NavGroup
            heading={`${workspace ? WORKSPACES[workspace].short : ""} deep dive`}
            accent={accent}
            items={nav.map((item) => ({
              id: item.id,
              label: item.label,
              href: `/dashboard/venture#${item.id}`,
            }))}
          />
          {role === "GLOBAL_FOUNDER" && mode === "coach" && (
            <p style={{ fontSize: 12, color: theme.dim, marginTop: 14, lineHeight: 1.6 }}>
              Head Coach Hub active — financial and administration panels are hidden.
            </p>
          )}
        </nav>

        {/* --------------------------------------------------------- main */}
        <main className="shell-main">
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
        <span style={{ marginLeft: "auto" }}>Developer tools: Ctrl + Shift + D on the canvas</span>
      </footer>
    </div>
  );
}

function NavGroup({
  heading,
  accent,
  items,
}: {
  heading: string;
  accent: string;
  items: Array<{ id: string; label: string; href: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <>
      <p
        style={{
          margin: "0 0 10px",
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: theme.dim,
        }}
      >
        {heading}
      </p>
      <ul style={{ listStyle: "none", margin: "0 0 18px", padding: 0, display: "grid", gap: 4 }}>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="shell-tap"
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                color: theme.muted,
                textDecoration: "none",
                fontSize: 13,
                borderLeft: `2px solid ${accent}55`,
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
