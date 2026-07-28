"use client";

// =====================================================================
// COMMAND CANVAS — the main dashboard, re-architected (2026-07-28).
//
// One canvas, two lenses. The lens is the shell's existing founder
// perspective toggle (executive → Founder Command, coach → Head Coach
// Hub), so the switch survives a reload and cannot drift from the
// sidebar's panel filter.
//
// Layout, top to bottom:
//   scope bar   · lens + Global Africa / region / hub sub-filter
//   hero        · at most four KPI cards, mode-dependent
//   layer 1     · Shadow Audit 2.0 — staged data, provenance, anomalies
//   layer 2     · mode modules (hub health & scouts | velocity & roster)
//   layer 3     · Pan-African engines (edge buffer, integrity, benchmark,
//                 export ledger)
//   layer 4     · four tier-1 quick actions
//   footer      · developer drawer (Ctrl+Shift+D)
//
// CommandCanvas is pure: everything it renders arrives as props, which is
// why /command-preview can mount it against a fixture with no session.
// CommandDashboard is the container that fetches and holds mode state.
// =====================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BENCHMARK_AXES,
  MODE_BLURB,
  MODE_LABEL,
  QUICK_ACTIONS,
  REGIONS,
  REGION_IDS,
  TIERS,
  modeFromPerspective,
  panelsFor,
  perspectiveFromMode,
  type BenchmarkAxis,
  type CommandMode,
  type RegionId,
} from "@/config/command";
import type { CommandPayload } from "@/lib/services/command-metrics";
import { useWorkspace } from "./WorkspaceProvider";
import {
  Badge,
  DataTable,
  Empty,
  Kpi,
  Meter,
  Panel,
  buttonStyle,
  kes,
  selectStyle,
  theme,
  whenLocal,
  type Tone,
} from "./ui";

// ---------------------------------------------------------------------
// Responsive + touch rules. Inline styles cannot carry media queries and
// the app has no stylesheet, so the canvas ships its own — scoped by the
// cmd- prefix, injected once.
// ---------------------------------------------------------------------
const CANVAS_CSS = `
.cmd-canvas { display: grid; gap: 16px; }
/* Grid items default to min-width:auto, so one wide table would stretch
   the whole canvas and put a horizontal scrollbar on the page. Tables
   scroll inside their own panel instead. */
.cmd-canvas > *, .cmd-two > *, .cmd-kpis > *, .cmd-tiers > *, .cmd-actions > *,
.cmd-hubs > *, .cmd-stack > * { min-width: 0; }
.cmd-stack { display: grid; gap: 16px; min-width: 0; }
.cmd-scope { position: sticky; top: 57px; z-index: 10; display: flex; flex-wrap: wrap;
  align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px;
  background: ${theme.panelAlt}; border: 1px solid ${theme.border};
  box-shadow: 0 10px 24px -18px #000; }
.cmd-kpis { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cmd-two { display: grid; gap: 16px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.cmd-actions { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cmd-tiers { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cmd-hubs { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.cmd-tap { min-height: 40px; }
.cmd-chip { min-height: 36px; }
.cmd-live::before { content: ""; display: inline-block; width: 8px; height: 8px; border-radius: 999px;
  margin-right: 7px; background: ${theme.good}; animation: cmdPulse 2.4s ease-in-out infinite; }
@keyframes cmdPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.8); } }
@media (prefers-reduced-motion: reduce) { .cmd-live::before { animation: none; } }
.cmd-drawer { position: fixed; inset: 0 0 0 auto; width: min(520px, 100%); z-index: 60;
  background: ${theme.panel}; border-left: 1px solid ${theme.border}; overflow-y: auto; padding: 18px; }
.cmd-scrim { position: fixed; inset: 0; z-index: 55; background: #04070d99; }
@media (max-width: 1100px) { .cmd-kpis, .cmd-tiers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 900px) {
  .cmd-two, .cmd-actions { grid-template-columns: 1fr; }
  .cmd-scope { position: static; }
  .cmd-tap, .cmd-chip { min-height: 44px; }
}
@media (max-width: 560px) { .cmd-kpis, .cmd-tiers, .cmd-actions { grid-template-columns: 1fr; } }
`;

const chipStyle = (active: boolean, accent: string) => ({
  ...buttonStyle,
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 12,
  letterSpacing: "0.04em",
  background: active ? accent : "transparent",
  color: active ? "#08111f" : theme.muted,
  borderColor: active ? accent : theme.border,
});

const severityTone = (s: string): Tone => (s === "critical" ? "bad" : s === "warn" ? "warn" : "neutral");
const statusTone = (s: string): Tone =>
  s === "live" || s === "healthy" ? "good" : s === "blocked" ? "bad" : "warn";
const short = (v: string | null | undefined, n = 22) =>
  !v ? "—" : v.length > n ? `${v.slice(0, n - 1)}…` : v;

// =====================================================================
// CONTAINER
// =====================================================================

export function CommandDashboard() {
  const { actor, role, perspective, setPerspective, token } = useWorkspace();
  const router = useRouter();
  const [payload, setPayload] = useState<CommandPayload | null>(null);
  const [modes, setModes] = useState<CommandMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // An athlete has no lens on this canvas — their surface is the venture
  // workspace, so send them there instead of showing them a 403.
  const barred = role !== null && role !== "GLOBAL_FOUNDER" && role !== "HEAD_COACH";
  useEffect(() => {
    if (barred) router.replace("/dashboard/venture");
  }, [barred, router]);

  useEffect(() => {
    if (!token || barred) return;
    let cancelled = false;
    setLoading(true);
    fetch("/api/v1/workspace/dashboard?scope=command", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          success?: boolean;
          error?: string;
          modes?: CommandMode[];
          data?: CommandPayload;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setError(body.error ?? `Command service failed (${res.status}).`);
        } else {
          setError(null);
          setPayload(body.data);
          setModes(body.modes ?? []);
        }
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error contacting the command service.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, nonce]);

  const approve = useCallback(
    async (provenanceIds: string[], force: boolean) => {
      if (!token) return { success: false, error: "Not authenticated." };
      const res = await fetch("/api/v1/workspace/dashboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve_provenance", provenanceIds, force }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        approved?: number;
        skipped?: Array<{ provenanceId: string; reason: string }>;
        ledgerWarning?: string | null;
      };
      if (body.success) setNonce((n) => n + 1);
      return {
        success: Boolean(body.success),
        error: body.error,
        approved: body.approved ?? 0,
        skipped: body.skipped ?? [],
        ledgerWarning: body.ledgerWarning ?? null,
      };
    },
    [token],
  );

  // The founder's lens is the shell toggle; a head coach has one lens.
  const allowed = modes.length > 0 ? modes : role === "GLOBAL_FOUNDER" ? ["founder", "coach"] : ["coach"];
  const wanted = modeFromPerspective(perspective);
  const mode: CommandMode = allowed.includes(wanted) ? wanted : (allowed[0] as CommandMode);

  if (barred) {
    return <p style={{ color: theme.muted, fontSize: 14 }}>Opening your workspace…</p>;
  }
  if (error) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <p role="alert" style={{ color: theme.bad, fontSize: 14 }}>
          {error}
        </p>
        <button type="button" style={buttonStyle} onClick={() => setNonce((n) => n + 1)}>
          Retry
        </button>
      </div>
    );
  }
  if (!payload) {
    return <p style={{ color: theme.muted, fontSize: 14 }}>Assembling the command canvas…</p>;
  }

  return (
    <CommandCanvas
      payload={payload}
      mode={mode}
      modes={allowed as CommandMode[]}
      onMode={(m) => setPerspective(perspectiveFromMode(m))}
      loading={loading}
      onRefresh={() => setNonce((n) => n + 1)}
      canApprove={Boolean(actor?.isFounder)}
      onApprove={approve}
      actorEmail={actor?.email ?? ""}
      roleLabel={role ?? "—"}
    />
  );
}

// =====================================================================
// PRESENTER
// =====================================================================

export interface ApproveResult {
  success: boolean;
  error?: string;
  approved?: number;
  skipped?: Array<{ provenanceId: string; reason: string }>;
  ledgerWarning?: string | null;
}

export function CommandCanvas({
  payload,
  mode,
  modes,
  onMode,
  loading = false,
  onRefresh,
  canApprove,
  onApprove,
  actorEmail,
  roleLabel,
}: {
  payload: CommandPayload;
  mode: CommandMode;
  modes: CommandMode[];
  onMode: (m: CommandMode) => void;
  loading?: boolean;
  onRefresh: () => void;
  canApprove: boolean;
  onApprove: (ids: string[], force: boolean) => Promise<ApproveResult>;
  actorEmail: string;
  roleLabel: string;
}) {
  const [region, setRegion] = useState<RegionId | "all">("all");
  const [hubId, setHubId] = useState<string>("all");
  const [drawer, setDrawer] = useState(false);
  const online = useOnline();

  // Ctrl+Shift+D anywhere on the canvas opens the developer drawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setDrawer((v) => !v);
      }
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const accent = mode === "founder" ? theme.warn : theme.accent;

  // ---- scope filter ------------------------------------------------
  const hubsInRegion = useMemo(
    () => payload.hubs.filter((h) => region === "all" || h.region === region),
    [payload.hubs, region],
  );
  const hubs = useMemo(
    () => hubsInRegion.filter((h) => hubId === "all" || h.hubId === hubId),
    [hubsInRegion, hubId],
  );
  const inScope = useCallback(
    (row: { region?: RegionId; hubId?: string | null }) => {
      if (region !== "all" && row.region !== region) return false;
      if (hubId !== "all" && row.hubId !== hubId) return false;
      return true;
    },
    [region, hubId],
  );
  const narrowed = region !== "all" || hubId !== "all";

  const queue = payload.audit.queue.filter(inScope);
  const cases = payload.integrity.cases.filter((c) => (region === "all" ? true : c.region === region));
  const roster = payload.coach.athletes.filter(inScope);
  const scopedVerified = hubs.reduce((s, h) => s + h.verified, 0);
  const scopedAthletes = hubs.reduce((s, h) => s + h.athletes, 0);

  const panels = panelsFor(mode);
  const has = (id: string) => panels.some((p) => p.id === id);

  return (
    <div className="cmd-canvas">
      <style>{CANVAS_CSS}</style>

      {/* ------------------------------------------------- scope bar */}
      <div className="cmd-scope">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Operating lens">
          {(["founder", "coach"] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="cmd-chip"
              disabled={!modes.includes(m)}
              aria-pressed={mode === m}
              title={modes.includes(m) ? MODE_BLURB[m] : "No grant for this lens"}
              onClick={() => onMode(m)}
              style={{
                ...chipStyle(mode === m, m === "founder" ? theme.warn : theme.accent),
                fontWeight: 800,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                opacity: modes.includes(m) ? 1 : 0.4,
                cursor: modes.includes(m) ? "pointer" : "not-allowed",
              }}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>

        <span aria-hidden style={{ color: theme.border }}>|</span>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="group" aria-label="Region filter">
          <button
            type="button"
            className="cmd-chip"
            aria-pressed={region === "all"}
            onClick={() => {
              setRegion("all");
              setHubId("all");
            }}
            style={chipStyle(region === "all", accent)}
          >
            Global Africa · {payload.hubs.length}
          </button>
          {REGION_IDS.filter((id) => id !== "unassigned" || payload.hubs.some((h) => h.region === id)).map(
            (id) => {
              const count = payload.hubs.filter((h) => h.region === id).length;
              return (
                <button
                  key={id}
                  type="button"
                  className="cmd-chip"
                  aria-pressed={region === id}
                  disabled={count === 0}
                  onClick={() => {
                    setRegion(id);
                    setHubId("all");
                  }}
                  style={{
                    ...chipStyle(region === id, accent),
                    opacity: count === 0 ? 0.35 : 1,
                    cursor: count === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  {REGIONS[id].short} · {count}
                </button>
              );
            },
          )}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ color: theme.dim }}>Hub</span>
          <select
            className="cmd-tap"
            style={{ ...selectStyle, maxWidth: 240 }}
            value={hubId}
            onChange={(e) => setHubId(e.target.value)}
            aria-label="Filter by hub"
          >
            <option value="all">All hubs in view</option>
            {hubsInRegion.map((h) => (
              <option key={h.hubId} value={h.hubId}>
                {h.name} ({h.kind})
              </option>
            ))}
          </select>
        </label>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 12 }}>
          <span
            className={online ? "cmd-live" : undefined}
            style={{ color: online ? theme.good : theme.bad, fontWeight: 700 }}
          >
            {online ? "EDGE ONLINE" : "OFFLINE — BUFFERING"}
          </span>
          <span style={{ color: theme.dim }}>{loading ? "syncing…" : whenLocal(payload.generatedAt)}</span>
          <button type="button" className="cmd-tap" style={buttonStyle} onClick={onRefresh}>
            Refresh
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------- hero */}
      <div className="cmd-kpis">
        {mode === "founder" ? (
          <FounderKpis payload={payload} hubs={hubs} narrowed={narrowed} scopedVerified={scopedVerified} scopedAthletes={scopedAthletes} />
        ) : (
          <CoachKpis payload={payload} roster={roster} />
        )}
      </div>

      {/* -------------------------------- layer 1 · shadow audit 2.0 */}
      {has("shadow-audit") && (
        <ShadowAudit
          items={queue}
          counts={payload.audit.counts}
          canApprove={canApprove}
          onApprove={onApprove}
        />
      )}

      {/* ------------------------------- layer 2 · mode-bound modules */}
      {mode === "founder" ? (
        <>
          <Panel
            id="hub-health"
            title="Regional Expansion & Hub Health"
            subtitle="Live pulse per registered hub — clubs, federations and billing tenants across the continent."
            actions={<Badge tone="neutral">{hubs.length} in view</Badge>}
          >
            <HubHealth hubs={hubs} />
          </Panel>

          <div className="cmd-two">
            <Panel
              id="scout-pipeline"
              title="Scout & Institutional Pipeline"
              subtitle={payload.scout.formula}
            >
              <DataTable
                rows={payload.scout.ticker}
                rowKey={(r, i) => `${r.when ?? "x"}-${i}`}
                empty="No scout access recorded in the last 90 days."
                columns={[
                  { key: "when", header: "When", render: (r) => whenLocal(r.when) },
                  { key: "actor", header: "Actor", render: (r) => short(r.actor, 18) },
                  {
                    key: "action",
                    header: "Action",
                    render: (r) => <Badge tone="neutral">{short(r.action, 26)}</Badge>,
                  },
                  { key: "subject", header: "Dossier", render: (r) => short(r.subject) },
                  { key: "hub", header: "Hub", render: (r) => short(r.hubName) },
                ]}
              />
            </Panel>

            <Panel
              id="tenancy"
              title="Multi-Tenant Compliance & Billing"
              subtitle="Consent coverage, telemetry flow and sync health per partner academy or rink."
            >
              <DataTable
                rows={payload.tenancy}
                rowKey={(t) => t.tenantId}
                empty="No billing tenants provisioned yet."
                columns={[
                  {
                    key: "name",
                    header: "Tenant",
                    render: (t) => (
                      <span>
                        {short(t.name, 26)}
                        {t.workspace && <span style={{ color: theme.dim }}> · {t.workspace}</span>}
                      </span>
                    ),
                  },
                  {
                    key: "status",
                    header: "Status",
                    render: (t) => <Badge tone={statusTone(t.status)}>{t.status}</Badge>,
                  },
                  { key: "athletes", header: "Athletes", align: "right", render: (t) => t.athletes },
                  {
                    key: "consent",
                    header: "Consent",
                    align: "right",
                    render: (t) => `${t.consentCoverage}%`,
                  },
                  { key: "verified", header: "Verified", align: "right", render: (t) => `${t.verifiedRatio}%` },
                  {
                    key: "flags",
                    header: "Notes",
                    render: (t) =>
                      t.flags.length === 0 ? (
                        <span style={{ color: theme.good }}>clean</span>
                      ) : (
                        <span style={{ color: theme.warn, whiteSpace: "normal" }}>{t.flags.join(" · ")}</span>
                      ),
                  },
                ]}
              />
            </Panel>
          </div>
        </>
      ) : (
        <>
          <Panel
            id="velocity"
            title="Talent Development Velocity Matrix"
            subtitle={`Cohort distribution now, with movement over the rolling ${payload.coach.compliance.windowDays}-day window.`}
          >
            <div className="cmd-tiers">
              {payload.coach.velocity.map((row) => {
                const total = payload.coach.velocity.reduce((s, v) => s + v.count, 0);
                const net = row.movedIn - row.movedOut;
                return (
                  <div
                    key={row.tier}
                    style={{
                      background: theme.panelAlt,
                      border: `1px solid ${theme.border}`,
                      borderRadius: 12,
                      padding: "12px 14px",
                    }}
                  >
                    <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.dim }}>
                      {row.label}
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                      <span style={{ fontSize: 24, fontWeight: 800 }}>{row.count}</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: net > 0 ? theme.good : net < 0 ? theme.bad : theme.dim,
                        }}
                      >
                        {net > 0 ? `+${net}` : net}
                      </span>
                    </div>
                    <Meter
                      value={total > 0 ? (row.count / total) * 100 : 0}
                      tone={row.tier === "pro" ? "good" : "neutral"}
                    />
                    <div style={{ fontSize: 12, color: theme.muted, marginTop: 8 }}>
                      {row.movedIn} in · {row.movedOut} out · band {TIERS[row.tier].min}–{TIERS[row.tier].max - 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>

          <div className="cmd-two">
            <Panel
              id="readiness"
              title="Live Roster Readiness"
              subtitle="Latest composite, 90-day delta and assessment freshness per athlete in view."
              actions={<Badge tone="neutral">{roster.length} athletes</Badge>}
            >
              <DataTable
                rows={roster.slice(0, 40)}
                rowKey={(a) => a.athleteId}
                empty="No athletes under supervision in this scope."
                columns={[
                  { key: "name", header: "Athlete", render: (a) => short(a.name, 24) },
                  {
                    key: "tier",
                    header: "Tier",
                    render: (a) =>
                      a.tier ? (
                        <Badge tone={a.tier === "pro" ? "good" : a.tier === "beginner" ? "warn" : "neutral"}>
                          {TIERS[a.tier].label}
                        </Badge>
                      ) : (
                        <span style={{ color: theme.dim }}>unmeasured</span>
                      ),
                  },
                  {
                    key: "composite",
                    header: "Composite",
                    align: "right",
                    render: (a) => (a.composite === null ? "—" : a.composite.toFixed(1)),
                  },
                  {
                    key: "delta",
                    header: "Δ 90d",
                    align: "right",
                    render: (a) =>
                      a.delta90d === null ? (
                        "—"
                      ) : (
                        <span style={{ color: a.delta90d >= 0 ? theme.good : theme.bad }}>
                          {a.delta90d > 0 ? `+${a.delta90d}` : a.delta90d}
                        </span>
                      ),
                  },
                  {
                    key: "last",
                    header: "Last assessed",
                    render: (a) =>
                      a.staleDays === null ? (
                        <Badge tone="warn">never</Badge>
                      ) : a.staleDays > 90 ? (
                        <Badge tone="warn">{a.staleDays}d ago</Badge>
                      ) : (
                        `${a.staleDays}d ago`
                      ),
                  },
                  {
                    key: "flags",
                    header: "Flags",
                    align: "right",
                    render: (a) =>
                      a.flagCount === 0 ? (
                        <span style={{ color: theme.good }}>0</span>
                      ) : (
                        <Badge tone="bad">{a.flagCount}</Badge>
                      ),
                  },
                ]}
              />
            </Panel>

            <div className="cmd-stack">
              <Panel title="Combine Leaderboard" subtitle="Top composites and their strongest axis.">
                <DataTable
                  rows={payload.coach.leaderboard}
                  rowKey={(r) => r.athleteId}
                  empty="No combine results recorded yet."
                  columns={[
                    { key: "name", header: "Athlete", render: (r) => short(r.name, 20) },
                    { key: "composite", header: "Composite", align: "right", render: (r) => r.composite.toFixed(1) },
                    {
                      key: "best",
                      header: "Strongest",
                      render: (r) =>
                        r.best ? (
                          <Badge tone="good">
                            {r.best} {r.bestValue?.toFixed(0)}
                          </Badge>
                        ) : (
                          "—"
                        ),
                    },
                    { key: "pct", header: "Percentile", align: "right", render: (r) => `${r.percentile}` },
                  ]}
                />
              </Panel>

              <Panel
                id="coach-logs"
                title="Coaching Assessment Tracker"
                subtitle="Who has logged metrics today, and who has gone quiet."
              >
                <DataTable
                  rows={payload.coach.coachLogs}
                  rowKey={(c) => c.coachId}
                  empty="No coach assignments on file."
                  columns={[
                    { key: "coach", header: "Coach", render: (c) => short(c.coachId, 20) },
                    { key: "athletes", header: "Athletes", align: "right", render: (c) => c.athletes },
                    {
                      key: "today",
                      header: "Today",
                      render: (c) =>
                        c.loggedToday ? <Badge tone="good">logged</Badge> : <Badge tone="warn">pending</Badge>,
                    },
                    {
                      key: "last",
                      header: "Last log",
                      render: (c) => (c.staleDays === null ? "never" : `${c.staleDays}d ago`),
                    },
                  ]}
                />
              </Panel>
            </div>
          </div>

          <div className="cmd-two">
            <Panel title="Upcoming Session & Match Windows" subtitle="Next occurrence of each cohort slot.">
              <DataTable
                rows={payload.coach.windows}
                rowKey={(w) => w.registryId}
                empty="No cohort windows scheduled."
                columns={[
                  { key: "cohort", header: "Cohort", render: (w) => short(w.cohort, 26) },
                  { key: "track", header: "Track", render: (w) => short(w.track ?? "—", 20) },
                  { key: "next", header: "Next window", render: (w) => whenLocal(w.nextAt) },
                  {
                    key: "load",
                    header: "Enrolled",
                    align: "right",
                    render: (w) => `${w.enrolled}${w.capacity ? ` / ${w.capacity}` : ""}`,
                  },
                ]}
              />
            </Panel>
            <Panel title="Active League Standings" subtitle="Points and conduct per team from the league table.">
              <DataTable
                rows={payload.coach.standings}
                rowKey={(s) => s.team}
                empty="League table is empty — run the NRHL ETL to populate teams."
                columns={[
                  { key: "team", header: "Team", render: (s) => short(s.team, 22) },
                  { key: "players", header: "Players", align: "right", render: (s) => s.players },
                  { key: "points", header: "Points", align: "right", render: (s) => s.points },
                  {
                    key: "att",
                    header: "Attendance",
                    align: "right",
                    render: (s) => (s.attendancePct === null ? "—" : `${s.attendancePct.toFixed(0)}%`),
                  },
                  {
                    key: "conduct",
                    header: "Conduct",
                    align: "right",
                    render: (s) =>
                      s.conductCases > 0 ? <Badge tone="bad">{s.conductCases}</Badge> : <span>0</span>,
                  },
                ]}
              />
            </Panel>
          </div>
        </>
      )}

      {/* --------------------------- layer 3 · Pan-African engines */}
      <div className="cmd-two">
        <Panel
          id="edge-buffer"
          title="Offline Sync & Edge Buffer"
          subtitle="Rink-side and pitch-side capture holds locally when the link drops; this is the backlog."
          actions={
            <Badge tone={online ? "good" : "bad"}>{online ? "link up" : "link down"}</Badge>
          }
        >
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
            <MiniStat label="Buffered" value={payload.edge.bufferedRecords} tone={payload.edge.bufferedRecords > 0 ? "warn" : "good"} />
            <MiniStat label="Failed" value={payload.edge.failedRecords} tone={payload.edge.failedRecords > 0 ? "bad" : "good"} />
            <MiniStat label="Dead letters" value={payload.edge.deadLetters} tone={payload.edge.deadLetters > 0 ? "bad" : "good"} />
            <MiniStat
              label="Venue unverified"
              value={payload.edge.unverifiedVenueLogs}
              tone={payload.edge.unverifiedVenueLogs > 0 ? "warn" : "good"}
            />
          </div>
          <p style={{ fontSize: 12, color: theme.muted, margin: "12px 0 0", lineHeight: 1.6 }}>
            Oldest buffered record: {whenLocal(payload.edge.oldestBufferedAt)} · last ingest{" "}
            {whenLocal(payload.edge.lastIngestAt)}
          </p>
          {payload.edge.deadLetterRows.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <DataTable
                rows={payload.edge.deadLetterRows}
                rowKey={(d) => d.id}
                empty=""
                columns={[
                  { key: "when", header: "Failed", render: (d) => whenLocal(d.failed_at) },
                  { key: "type", header: "Record", render: (d) => d.record_type ?? "—" },
                  {
                    key: "err",
                    header: "Error",
                    render: (d) => (
                      <span style={{ color: theme.bad, whiteSpace: "normal" }}>{short(d.last_error, 60)}</span>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </Panel>

        <Panel
          id="integrity"
          title="Biometric & Passport Integrity Engine"
          subtitle="Duplicate registrations, birth-date anomalies and missing identity documents across every hub."
          actions={
            <span style={{ display: "flex", gap: 6 }}>
              <Badge tone="bad">{payload.integrity.counts.critical} critical</Badge>
              <Badge tone="warn">{payload.integrity.counts.warn} warn</Badge>
            </span>
          }
        >
          <DataTable
            rows={cases.slice(0, 25)}
            rowKey={(c, i) => `${c.code}-${c.athleteIds.join("+")}-${i}`}
            empty="No integrity cases open — every passport in this scope is internally consistent."
            columns={[
              {
                key: "sev",
                header: "Severity",
                render: (c) => <Badge tone={severityTone(c.severity)}>{c.severity}</Badge>,
              },
              { key: "code", header: "Case", render: (c) => c.label },
              {
                key: "detail",
                header: "Detail",
                render: (c) => <span style={{ whiteSpace: "normal" }}>{c.detail}</span>,
              },
              { key: "hub", header: "Hub", render: (c) => short(c.hubName, 24) },
            ]}
          />
        </Panel>
      </div>

      <Panel
        id="benchmark"
        title="Cross-Academy Benchmark Engine"
        subtitle="Overlay one athlete against the cohort in view and against regional, national and international marks."
        actions={<Badge tone="warn">{payload.benchmark.source}</Badge>}
      >
        <Benchmark payload={payload} />
      </Panel>

      <Panel
        id="export-ledger"
        title="Talent Export Ledger"
        subtitle="Hash-chained record of every dossier export, verification and transfer event."
      >
        <DataTable
          rows={payload.ledger.slice(0, 25)}
          rowKey={(l) => l.eventId}
          empty="Ledger is empty — it fills as dossiers are exported and passports verified."
          columns={[
            { key: "when", header: "When", render: (l) => whenLocal(l.occurredAt) },
            {
              key: "kind",
              header: "Kind",
              render: (l) => (
                <Badge tone={l.kind === "export" ? "warn" : l.kind === "verification" ? "good" : "neutral"}>
                  {l.kind}
                </Badge>
              ),
            },
            { key: "type", header: "Event", render: (l) => short(l.eventType, 34) },
            { key: "record", header: "Record", render: (l) => short(l.recordType ?? "—", 18) },
            { key: "actor", header: "Actor", render: (l) => short(l.actorId ?? "—", 12) },
            {
              key: "hash",
              header: "Hash",
              render: (l) => (
                <code style={{ fontSize: 11, color: theme.dim }}>{l.hashPrefix ?? "—"}</code>
              ),
            },
          ]}
        />
      </Panel>

      {/* ----------------------------- layer 4 · tier-1 quick actions */}
      <Panel id="quick-actions" title="Quick Actions" subtitle={MODE_BLURB[mode]}>
        <div className="cmd-actions">
          {QUICK_ACTIONS[mode].map((action) => (
            <Link
              key={action.id}
              href={action.href}
              className="cmd-tap"
              style={{
                display: "block",
                padding: "14px 16px",
                borderRadius: 12,
                border: `1px solid ${theme.border}`,
                background: theme.panelAlt,
                color: theme.text,
                textDecoration: "none",
                borderLeft: `3px solid ${accent}`,
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700 }}>{action.label}</div>
              <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>{action.hint}</div>
            </Link>
          ))}
        </div>
      </Panel>

      {/* ------------------------------------- developer drawer trigger */}
      <p style={{ fontSize: 12, color: theme.dim, margin: 0, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: theme.dim,
            fontSize: 12,
            cursor: "pointer",
            textDecoration: "underline dotted",
          }}
        >
          Developer tools
        </button>
        <span>Ctrl + Shift + D</span>
        <span>
          {panels.length} panels · {MODE_LABEL[mode]}
        </span>
      </p>

      {drawer && (
        <DevDrawer
          payload={payload}
          mode={mode}
          region={region}
          hubId={hubId}
          actorEmail={actorEmail}
          roleLabel={roleLabel}
          online={online}
          onClose={() => setDrawer(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Hero KPI groups — four cards, never more.
// ---------------------------------------------------------------------

function FounderKpis({
  payload,
  hubs,
  narrowed,
  scopedVerified,
  scopedAthletes,
}: {
  payload: CommandPayload;
  hubs: CommandPayload["hubs"];
  narrowed: boolean;
  scopedVerified: number;
  scopedAthletes: number;
}) {
  const live = hubs.filter((h) => h.status === "live").length;
  const onboarding = hubs.filter((h) => h.status === "onboarding").length;
  const tenants = hubs.filter((h) => h.kind === "tenant").length;
  const verified = narrowed ? scopedVerified : payload.passports.verified;
  const total = narrowed ? scopedAthletes : payload.passports.total;
  const ratio = total > 0 ? Math.round((verified / total) * 100) : 0;

  return (
    <>
      <Kpi
        label="Active hubs & tenants"
        value={hubs.length}
        hint={`${live} live · ${onboarding} onboarding · ${tenants} billing tenant${tenants === 1 ? "" : "s"}`}
        tone={live > 0 ? "good" : "warn"}
        meter={hubs.length > 0 ? (live / hubs.length) * 100 : 0}
      />
      <Kpi
        label="Verified athlete passports"
        value={verified}
        unit={`/ ${total}`}
        hint={`${payload.passports.pending} pending · ${payload.passports.unverified} unverified · ${payload.passports.legacy} legacy`}
        tone={verified > 0 ? "good" : "warn"}
      />
      <Kpi
        label="Platform verification ratio"
        value={`${ratio}%`}
        hint={`verified ÷ registered${narrowed ? " (scope)" : " (platform)"} · ${payload.passports.estimatedDob} estimated birth dates`}
        tone={ratio >= 80 ? "good" : ratio >= 40 ? "warn" : "bad"}
        meter={ratio}
      />
      <Kpi
        label="Scout engagement & ARR"
        value={payload.scout.engagementScore}
        unit="/ 100"
        hint={`${payload.scout.exportsWindow} exports · ${payload.scout.activeScouts} scouts · run-rate ${kes(payload.revenue.arrRunRateKes)} · settled ${kes(payload.revenue.settledKes)}`}
        tone={payload.scout.engagementScore > 0 ? "good" : "warn"}
        meter={payload.scout.engagementScore}
      />
    </>
  );
}

function CoachKpis({
  payload,
  roster,
}: {
  payload: CommandPayload;
  roster: CommandPayload["coach"]["athletes"];
}) {
  const readiness = payload.coach.readiness;
  const compliance = payload.coach.compliance;
  const measured = roster.filter((a) => a.composite !== null).length;
  const nextWindow = payload.coach.windows.find((w) => w.nextAt);
  const leader = payload.coach.standings[0];

  return (
    <>
      <Kpi
        label="Athletes under supervision"
        value={roster.length}
        hint={`${measured} with telemetry · ${roster.length - measured} awaiting first assessment`}
        tone={roster.length > 0 ? "good" : "warn"}
      />
      <Kpi
        label="High-performance readiness"
        value={readiness.index ?? "—"}
        unit="/ 100"
        hint={`${readiness.basis} · n=${readiness.sampleSize}`}
        tone={
          readiness.index === null ? "warn" : readiness.index >= 70 ? "good" : readiness.index >= 50 ? "warn" : "bad"
        }
        meter={readiness.index ?? 0}
      />
      <Kpi
        label="Assessment & log compliance"
        value={`${compliance.pct}%`}
        hint={`${compliance.complete} of ${compliance.sessions} drills in ${compliance.windowDays}d carry all five axes`}
        tone={compliance.pct >= 90 ? "good" : compliance.pct >= 60 ? "warn" : "bad"}
        meter={compliance.pct}
      />
      <Kpi
        label="League & next window"
        value={nextWindow?.nextAt ? whenLocal(nextWindow.nextAt).split(",")[0] ?? "—" : "—"}
        hint={
          leader
            ? `${leader.team} leads on ${leader.points} pts · ${payload.coach.standings.length} teams`
            : nextWindow
              ? `${short(nextWindow.cohort, 30)} · no league table yet`
              : "No windows scheduled"
        }
        tone={nextWindow ? "good" : "warn"}
      />
    </>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number | string; tone: Tone }) {
  const color = tone === "good" ? theme.good : tone === "warn" ? theme.warn : tone === "bad" ? theme.bad : theme.text;
  return (
    <div style={{ background: theme.panelAlt, border: `1px solid ${theme.border}`, borderRadius: 10, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.dim }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Layer 1 — Shadow Audit 2.0.
// ---------------------------------------------------------------------

function ShadowAudit({
  items,
  counts,
  canApprove,
  onApprove,
}: {
  items: CommandPayload["audit"]["queue"];
  counts: CommandPayload["audit"]["counts"];
  canApprove: boolean;
  onApprove: (ids: string[], force: boolean) => Promise<ApproveResult>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectable = items.filter((i) => i.provenanceId && (i.approvable || override));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setMessage(null);
    const result = await onApprove(ids, override);
    setBusy(false);
    setSelected(new Set());
    if (!result.success) {
      setMessage(result.error ?? "Approval failed.");
      return;
    }
    const skipped = result.skipped ?? [];
    setMessage(
      [
        `${result.approved ?? 0} record(s) promoted into the verified talent database.`,
        skipped.length > 0 ? `${skipped.length} skipped: ${skipped.map((s) => s.reason).join("; ")}` : "",
        result.ledgerWarning ? `Ledger warning: ${result.ledgerWarning}` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return (
    <Panel
      id="shadow-audit"
      title="Shadow Audit 2.0 — staging queue"
      subtitle="Bulk athletic data submitted across every hub, with origin, submitter and anomaly flags. Approval promotes records into the verified global talent database."
      actions={
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <Badge tone="neutral">{counts.total} staged</Badge>
          <Badge tone={counts.critical > 0 ? "bad" : "good"}>{counts.critical} flagged</Badge>
          <Badge tone="good">{counts.approvable} clear</Badge>
        </span>
      }
    >
      {canApprove && items.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
            padding: "10px 12px",
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            background: theme.panelAlt,
          }}
        >
          <button
            type="button"
            className="cmd-tap"
            style={{
              ...buttonStyle,
              background: selected.size > 0 ? theme.good : theme.panelAlt,
              color: selected.size > 0 ? "#08111f" : theme.dim,
              borderColor: selected.size > 0 ? theme.good : theme.border,
            }}
            disabled={busy || selected.size === 0}
            onClick={() => void submit()}
          >
            {busy ? "Approving…" : `Approve ${selected.size || ""} selected`}
          </button>
          <button
            type="button"
            className="cmd-tap"
            style={buttonStyle}
            onClick={() => setSelected(new Set(selectable.map((i) => i.provenanceId as string)))}
          >
            Select all clear ({selectable.length})
          </button>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: theme.warn }}>
            <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
            Override critical flags (logged as an override in the ledger)
          </label>
        </div>
      )}

      {override && (
        <p role="alert" style={{ fontSize: 12, color: theme.bad, margin: "0 0 12px" }}>
          Override active — duplicate identities, reused ID documents, implausible birth dates and
          missing guardian consent can now be promoted. Each one is recorded against your account.
        </p>
      )}

      <DataTable
        rows={items.slice(0, 40)}
        rowKey={(i) => i.id}
        empty="Nothing staged — every submitted record has been promoted or verified at source."
        columns={[
          ...(canApprove
            ? [
                {
                  key: "select",
                  header: "",
                  render: (i: CommandPayload["audit"]["queue"][number]) =>
                    i.provenanceId ? (
                      <input
                        type="checkbox"
                        aria-label={`Select ${i.subject}`}
                        disabled={!i.approvable && !override}
                        checked={selected.has(i.provenanceId)}
                        onChange={() => toggle(i.provenanceId as string)}
                      />
                    ) : (
                      <span title="No provenance row — promote at source" style={{ color: theme.dim }}>
                        —
                      </span>
                    ),
                },
              ]
            : []),
          {
            key: "subject",
            header: "Record",
            render: (i) => (
              <span>
                {short(i.subject, 30)}
                <span style={{ color: theme.dim }}> · {i.recordKind}</span>
              </span>
            ),
          },
          { key: "hub", header: "Origin hub", render: (i) => short(i.hubName, 24) },
          { key: "by", header: "Submitted by", render: (i) => short(i.submittedBy, 18) },
          { key: "when", header: "Timestamp", render: (i) => whenLocal(i.submittedAt) },
          {
            key: "source",
            header: "Provenance",
            render: (i) => (
              <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                <Badge tone="neutral">{i.dataSource}</Badge>
                <Badge tone={i.verificationStatus === "disputed" ? "bad" : "warn"}>
                  {i.verificationStatus}
                </Badge>
              </span>
            ),
          },
          {
            key: "flags",
            header: "Anomalies",
            render: (i) =>
              i.flags.length === 0 ? (
                <span style={{ color: theme.good }}>clean</span>
              ) : (
                <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }} title={i.flags.map((f) => f.detail).join(" · ")}>
                  {i.flags.slice(0, 3).map((f, n) => (
                    <Badge key={`${f.code}-${n}`} tone={severityTone(f.severity)}>
                      {f.label}
                    </Badge>
                  ))}
                  {i.flags.length > 3 && <Badge tone="neutral">+{i.flags.length - 3}</Badge>}
                </span>
              ),
          },
        ]}
      />

      {message && (
        <p role="status" style={{ fontSize: 13, color: theme.muted, margin: "12px 0 0", whiteSpace: "normal" }}>
          {message}
        </p>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Layer 2 — hub health pulse.
// ---------------------------------------------------------------------

function HubHealth({ hubs }: { hubs: CommandPayload["hubs"] }) {
  if (hubs.length === 0) return <Empty>No hubs registered in this scope.</Empty>;

  const byRegion = new Map<RegionId, CommandPayload["hubs"]>();
  for (const hub of hubs) {
    const list = byRegion.get(hub.region) ?? [];
    list.push(hub);
    byRegion.set(hub.region, list);
  }

  return (
    <div className="cmd-stack">
      {[...byRegion.entries()].map(([regionId, list]) => (
        <div key={regionId}>
          <h3
            style={{
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.dim,
              margin: "0 0 10px",
            }}
          >
            {REGIONS[regionId].label} · {list.length}
          </h3>
          <div className="cmd-hubs">
            {list.map((hub) => (
              <div
                key={hub.hubId}
                style={{
                  background: theme.panelAlt,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 12,
                  padding: "12px 14px",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <span
                    className={hub.status === "live" ? "cmd-live" : undefined}
                    style={{ fontSize: 14, fontWeight: 700 }}
                  >
                    {short(hub.name, 26)}
                  </span>
                  <Badge tone={statusTone(hub.status)}>{hub.status}</Badge>
                </div>
                <div style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>
                  {hub.kind} · {hub.countryCode ?? "no country"} · {hub.athletes} athlete
                  {hub.athletes === 1 ? "" : "s"} · {hub.sessions} session{hub.sessions === 1 ? "" : "s"}
                </div>
                <Meter
                  value={hub.athletes > 0 ? (hub.verified / hub.athletes) * 100 : 0}
                  tone={hub.verified === hub.athletes && hub.athletes > 0 ? "good" : "warn"}
                />
                <div style={{ fontSize: 12, color: theme.dim, marginTop: 8 }}>
                  {hub.verified}/{hub.athletes} verified · last activity {whenLocal(hub.lastActivityAt)}
                </div>
                {hub.workspace && (
                  <Link
                    href="/dashboard/venture"
                    style={{ fontSize: 12, color: theme.accent, display: "inline-block", marginTop: 8 }}
                  >
                    Open venture workspace →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------
// Layer 3 — benchmark overlay.
// ---------------------------------------------------------------------

function Benchmark({ payload }: { payload: CommandPayload }) {
  const [athleteId, setAthleteId] = useState<string>("cohort");
  const selected = payload.benchmark.athletes.find((a) => a.athleteId === athleteId);

  if (payload.benchmark.athletes.length === 0 && payload.benchmark.axes.every((a) => a.cohort === null)) {
    return <Empty>No telemetry to benchmark yet — log a combine or an assessment first.</Empty>;
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
        <span style={{ color: theme.dim }}>Overlay</span>
        <select
          className="cmd-tap"
          style={selectStyle}
          value={athleteId}
          onChange={(e) => setAthleteId(e.target.value)}
          aria-label="Athlete to benchmark"
        >
          <option value="cohort">Cohort mean (all athletes in view)</option>
          {payload.benchmark.athletes.map((a) => (
            <option key={a.athleteId} value={a.athleteId}>
              {a.name}
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "grid", gap: 12 }}>
        {payload.benchmark.axes.map((row) => {
          const value = selected ? selected.values[row.axis as BenchmarkAxis] : row.cohort;
          const tone: Tone =
            value === null
              ? "neutral"
              : value >= row.international
                ? "good"
                : value >= row.national
                  ? "good"
                  : value >= row.regional
                    ? "warn"
                    : "bad";
          return (
            <div key={row.axis}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 2 }}>
                <span style={{ textTransform: "capitalize", color: theme.muted }}>{row.axis}</span>
                <span style={{ color: theme.text, fontWeight: 700 }}>
                  {value === null ? "no data" : value.toFixed(1)}
                  <span style={{ color: theme.dim, fontWeight: 400 }}>
                    {" "}
                    · reg {row.regional} · nat {row.national} · intl {row.international}
                  </span>
                </span>
              </div>
              <Meter
                value={value ?? 0}
                tone={tone}
                markers={[
                  { at: row.regional, label: "regional" },
                  { at: row.national, label: "national" },
                  { at: row.international, label: "international" },
                ]}
              />
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: theme.dim, margin: 0, lineHeight: 1.6 }}>
        Marks are configuration, not measurements — {payload.benchmark.source}. Replace them in
        <code style={{ color: theme.muted }}> config/command.ts</code> as federation data lands.
        Axes: {BENCHMARK_AXES.join(", ")}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------
// Developer drawer — everything that used to clutter the canvas.
// ---------------------------------------------------------------------

function DevDrawer({
  payload,
  mode,
  region,
  hubId,
  actorEmail,
  roleLabel,
  online,
  onClose,
}: {
  payload: CommandPayload;
  mode: CommandMode;
  region: string;
  hubId: string;
  actorEmail: string;
  roleLabel: string;
  online: boolean;
  onClose: () => void;
}) {
  const [emulated, setEmulated] = useState("actual");

  return (
    <>
      <div className="cmd-scrim" onClick={onClose} aria-hidden />
      <aside className="cmd-drawer" role="dialog" aria-label="Developer tools" aria-modal="true">
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <h2 style={{ margin: 0, fontSize: 15 }}>Developer tools</h2>
          <button type="button" className="cmd-tap" style={buttonStyle} onClick={onClose}>
            Close (Esc)
          </button>
        </header>

        <p style={{ fontSize: 12, color: theme.dim, lineHeight: 1.6 }}>
          Playground surfaces live here so the canvas stays operational. Nothing in this drawer
          changes server-side authorisation — role emulation is a rendering hint only.
        </p>

        <h3 style={sectionStyle}>Session</h3>
        <pre style={preStyle}>
          {JSON.stringify(
            {
              actor: actorEmail,
              role: roleLabel,
              mode,
              scope: { region, hubId },
              edgeOnline: online,
              generatedAt: payload.generatedAt,
            },
            null,
            2,
          )}
        </pre>

        <h3 style={sectionStyle}>Emulate perspective (view only)</h3>
        <select
          className="cmd-tap"
          style={{ ...selectStyle, width: "100%" }}
          value={emulated}
          onChange={(e) => setEmulated(e.target.value)}
        >
          <option value="actual">Actual grants ({roleLabel})</option>
          <option value="coach">Team coach</option>
          <option value="parent">Parent / guardian</option>
          <option value="athlete">Athlete</option>
        </select>
        {emulated !== "actual" && (
          <p style={{ fontSize: 12, color: theme.warn, lineHeight: 1.6 }}>
            Emulating <strong>{emulated}</strong> is inert: RLS and the workspace gate still answer to{" "}
            {actorEmail}. Sign in as the account to test its real surface.
          </p>
        )}

        <h3 style={sectionStyle}>Database & telemetry probes</h3>
        <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13, lineHeight: 1.9 }}>
          <li>
            <a href="/api/v1/debug/supabase-handshake" style={linkStyle} target="_blank" rel="noreferrer">
              Supabase handshake
            </a>
          </li>
          <li>
            <a href="/api/v1/dev/context-fetcher" style={linkStyle} target="_blank" rel="noreferrer">
              Context fetcher
            </a>
          </li>
          <li>
            <a href="/api/v1/workspace/dashboard?scope=command" style={linkStyle} target="_blank" rel="noreferrer">
              Raw command payload (needs bearer token)
            </a>
          </li>
        </ul>

        <h3 style={sectionStyle}>Payload counts</h3>
        <pre style={preStyle}>
          {JSON.stringify(
            {
              hubs: payload.hubs.length,
              tenancy: payload.tenancy.length,
              staged: payload.audit.counts,
              integrity: payload.integrity.counts,
              ledger: payload.ledger.length,
              roster: payload.coach.athletes.length,
              edge: {
                buffered: payload.edge.bufferedRecords,
                failed: payload.edge.failedRecords,
                deadLetters: payload.edge.deadLetters,
              },
            },
            null,
            2,
          )}
        </pre>

        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, color: theme.muted, margin: "12px 0" }}>
            Raw payload JSON
          </summary>
          <pre style={{ ...preStyle, maxHeight: 320 }}>{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </aside>
    </>
  );
}

const sectionStyle = {
  fontSize: 11,
  letterSpacing: "0.16em",
  textTransform: "uppercase" as const,
  color: theme.dim,
  margin: "18px 0 8px",
};

const preStyle = {
  background: theme.bg,
  border: `1px solid ${theme.border}`,
  borderRadius: 10,
  padding: 12,
  fontSize: 11,
  color: theme.muted,
  overflow: "auto",
  maxHeight: 220,
  margin: 0,
};

const linkStyle = { color: theme.accent };

/** Browser connectivity — the one signal only the client can observe. */
function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}
