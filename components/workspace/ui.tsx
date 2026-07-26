"use client";

// =====================================================================
// WORKSPACE UI PRIMITIVES — shared panel/table/stat shells so the three
// dashboards stay visually identical without a component framework.
// Inline styles match the existing /register + landing surfaces.
// =====================================================================

import type { CSSProperties, ReactNode } from "react";

export const theme = {
  bg: "#0b1220",
  panel: "#111a2c",
  panelAlt: "#0e1626",
  border: "#24334d",
  text: "#e6edf6",
  muted: "#9fb1c9",
  dim: "#5f7392",
  accent: "#2f81f7",
  good: "#4ade80",
  warn: "#f6c443",
  bad: "#ff6b8b",
} as const;

export const kes = (n: number) =>
  `KES ${Math.round(n).toLocaleString("en-KE")}`;

export function whenLocal(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return String(value);
  return new Date(parsed).toLocaleString("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

const panelStyle: CSSProperties = {
  background: theme.panel,
  border: `1px solid ${theme.border}`,
  borderRadius: 14,
  padding: 18,
};

export function Panel({
  id,
  title,
  subtitle,
  actions,
  children,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} style={panelStyle}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 16, letterSpacing: 0.2 }}>{title}</h2>
          {subtitle && (
            <p style={{ margin: "4px 0 0", fontSize: 13, color: theme.muted }}>{subtitle}</p>
          )}
        </div>
        {actions}
      </header>
      {children}
    </section>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      }}
    >
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good" ? theme.good : tone === "warn" ? theme.warn : tone === "bad" ? theme.bad : theme.text;
  return (
    <div
      style={{
        background: theme.panelAlt,
        border: `1px solid ${theme.border}`,
        borderRadius: 10,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.16em",
          color: theme.dim,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const color =
    tone === "good" ? theme.good : tone === "warn" ? theme.warn : tone === "bad" ? theme.bad : theme.muted;
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color,
        border: `1px solid ${color}44`,
        background: `${color}14`,
        borderRadius: 999,
        padding: "2px 8px",
      }}
    >
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        margin: 0,
        padding: "18px 14px",
        border: `1px dashed ${theme.border}`,
        borderRadius: 10,
        color: theme.dim,
        fontSize: 13,
        textAlign: "center",
      }}
    >
      {children}
    </p>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  align?: "left" | "right";
}

export function DataTable<T>({
  rows,
  columns,
  empty,
  rowKey,
}: {
  rows: T[];
  columns: Column<T>[];
  empty: string;
  rowKey: (row: T, index: number) => string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{
                  textAlign: c.align ?? "left",
                  padding: "8px 10px",
                  borderBottom: `1px solid ${theme.border}`,
                  color: theme.dim,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  whiteSpace: "nowrap",
                }}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={rowKey(row, i)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  style={{
                    textAlign: c.align ?? "left",
                    padding: "9px 10px",
                    borderBottom: `1px solid ${theme.border}55`,
                    color: theme.text,
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const buttonStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.panelAlt,
  color: theme.text,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

export const selectStyle: CSSProperties = {
  padding: "6px 8px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  fontSize: 13,
};
