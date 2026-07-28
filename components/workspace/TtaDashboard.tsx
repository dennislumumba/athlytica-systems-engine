"use client";

// =====================================================================
// TTA WORKSPACE — TTA International Football Academy (tenant TTA-001).
//
// Single-tenant client surface: squad by programme, the longitudinal
// "Road to Mastery" curve, the five-axis taxonomy radar, and the scout
// passport export. Every row arrives pre-scoped by ttaData() in
// /api/v1/workspace/dashboard — this file renders, it never queries.
//
// Charts are hand-rolled SVG on one accent hue (single series each, so
// no categorical palette is involved). Marks are 2px, the grid is
// recessive, and only the endpoints carry direct labels.
// =====================================================================

import { visibleNav } from "@/config/workspaces";
import { useWorkspace } from "./WorkspaceProvider";
import { Badge, DataTable, Empty, Panel, Stat, StatRow, theme, whenLocal } from "./ui";

interface PerfRow {
  id: string;
  athlete_id: string | null;
  speed: number | null;
  agility: number | null;
  stamina: number | null;
  technical: number | null;
  cognitive: number | null;
  composite_score: number | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string | null;
}

interface AthleteRow {
  athlete_id: string;
  legal_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  current_status: string | null;
  parent_email: string | null;
}

interface ProfileRow {
  sport_profile_id: string;
  athlete_id: string | null;
  sport_code: string | null;
  discipline_code: string | null;
  role_position: string | null;
  dominant_side: string | null;
}

interface MetricLogRow {
  metric_log_id: number | string;
  athlete_id: string | null;
  metric_code: string | null;
  metric_timestamp: string | null;
  metric_payload: Record<string, unknown> | null;
}

interface MetricValueRow {
  metric_value_id: string;
  metric_code?: string | null;
  value_text: string | null;
  value_numeric?: number | string | null;
  measured_at: string | null;
}

interface AccountRow {
  appAthleteId: string;
  passportAthleteId: string | null;
}

interface TtaPayload {
  athletes: AthleteRow[];
  accounts: AccountRow[];
  profiles: ProfileRow[];
  performance: PerfRow[];
  programs: MetricLogRow[];
  academics: MetricValueRow[];
  videoTags: MetricValueRow[];
  scoutLink: Record<string, unknown> | null;
  trend: Record<string, unknown> | null;
}

const AXES = ["speed", "agility", "stamina", "technical", "cognitive"] as const;
type Axis = (typeof AXES)[number];

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const show = (v: number | null) => (v === null ? "—" : v.toFixed(1));

export function TtaDashboard() {
  const { data, role, perspective } = useWorkspace();
  if (!role) return null;
  const shown = new Set(visibleNav("tta", role, perspective).map((n) => n.id));

  const payload = (data ?? {}) as Partial<TtaPayload>;
  const athletes = payload.athletes ?? [];
  const accounts = payload.accounts ?? [];
  const profiles = payload.profiles ?? [];
  const performance = payload.performance ?? [];
  const programs = payload.programs ?? [];
  const academics = payload.academics ?? [];
  const videoTags = payload.videoTags ?? [];
  const scoutLink = payload.scoutLink ?? null;
  const trend = payload.trend ?? null;

  // Telemetry is keyed by the app-plane athlete id; names live on the
  // passport row. The accounts bridge is the only join between them.
  const passportForApp = new Map(accounts.map((a) => [a.appAthleteId, a.passportAthleteId]));
  const nameFor = new Map(
    athletes.map((a) => [a.athlete_id, a.preferred_name ?? a.legal_name ?? a.athlete_id]),
  );
  const programFor = new Map(
    programs.map((p) => [p.athlete_id ?? "", (p.metric_payload ?? {}) as Record<string, unknown>]),
  );
  const positionFor = new Map(profiles.map((p) => [p.athlete_id ?? "", p.role_position]));

  // Latest reading per athlete drives the squad table.
  const latestByPassport = new Map<string, PerfRow>();
  for (const row of performance) {
    const passportId = row.athlete_id ? passportForApp.get(row.athlete_id) ?? null : null;
    if (passportId) latestByPassport.set(passportId, row);
  }

  // The featured athlete is whoever has the deepest session history —
  // Brian Otieno in the seeded demo, without hardcoding his id here.
  const seriesByPassport = new Map<string, PerfRow[]>();
  for (const row of performance) {
    const passportId = row.athlete_id ? passportForApp.get(row.athlete_id) ?? null : null;
    if (!passportId) continue;
    const bucket = seriesByPassport.get(passportId) ?? [];
    bucket.push(row);
    seriesByPassport.set(passportId, bucket);
  }
  let featuredId: string | null = null;
  let featured: PerfRow[] = [];
  for (const [id, rows] of seriesByPassport) {
    if (rows.length > featured.length) {
      featuredId = id;
      featured = rows;
    }
  }
  const featuredName = featuredId ? nameFor.get(featuredId) ?? "Athlete" : "Athlete";
  const featuredProgram = featuredId ? programFor.get(featuredId) ?? {} : {};
  const last = featured[featured.length - 1] ?? null;
  const first = featured[0] ?? null;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {shown.has("squad") && (
        <Panel
          id="squad"
          title="Squad & Programs"
          subtitle="TTA roster mapped to academy programmes. Football only — this workspace reads nothing outside tenant TTA-001."
        >
          <StatRow>
            <Stat label="Registered athletes" value={athletes.length} />
            <Stat
              label="Programmes"
              value={new Set([...programFor.values()].map((p) => str(p.program) ?? "")).size}
            />
            <Stat label="Logged sessions" value={performance.length} />
            <Stat label="Discipline" value="Football / Soccer" hint="11-a-side" />
          </StatRow>

          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={athletes}
              rowKey={(a) => a.athlete_id}
              empty="No athletes linked to tenant TTA-001 yet."
              columns={[
                {
                  key: "athlete",
                  header: "Athlete",
                  render: (a) => a.preferred_name ?? a.legal_name ?? "—",
                },
                {
                  key: "program",
                  header: "Programme",
                  render: (a) => str(programFor.get(a.athlete_id)?.program) ?? "—",
                },
                {
                  key: "cohort",
                  header: "Cohort",
                  render: (a) => str(programFor.get(a.athlete_id)?.cohort) ?? "—",
                },
                {
                  key: "position",
                  header: "Position",
                  render: (a) => positionFor.get(a.athlete_id) ?? "—",
                },
                { key: "dob", header: "DOB", render: (a) => a.date_of_birth ?? "—" },
                {
                  key: "composite",
                  header: "Composite",
                  align: "right",
                  render: (a) => (
                    <strong style={{ color: theme.accent }}>
                      {show(num(latestByPassport.get(a.athlete_id)?.composite_score))}
                    </strong>
                  ),
                },
                {
                  key: "status",
                  header: "Status",
                  render: (a) => (
                    <Badge tone={a.current_status === "active" ? "good" : "neutral"}>
                      {a.current_status ?? "unknown"}
                    </Badge>
                  ),
                },
              ]}
            />
          </div>
        </Panel>
      )}

      {shown.has("development") && (
        <Panel
          id="development"
          title="Road to Mastery"
          subtitle={
            featured.length > 0
              ? `${featuredName} — ${featured.length} logged sessions, ${str(featuredProgram.cohort) ?? "cohort"}.`
              : "Longitudinal composite across every logged session."
          }
          actions={
            trend ? (
              <Badge tone={str(trend.direction) === "positive" ? "good" : "warn"}>
                {`${(num(trend.change_pct) ?? 0) >= 0 ? "+" : ""}${num(trend.change_pct) ?? 0}% · ${
                  num(trend.rolling_window_days) ?? 90
                }-day trend`}
              </Badge>
            ) : undefined
          }
        >
          {featured.length < 2 ? (
            <Empty>Not enough sessions logged to plot a progression curve.</Empty>
          ) : (
            <>
              <StatRow>
                <Stat
                  label="Composite now"
                  value={show(num(last?.composite_score))}
                  tone="good"
                  hint={`from ${show(num(first?.composite_score))} at baseline`}
                />
                <Stat
                  label="30m sprint"
                  value={`${show(num(last?.raw_payload?.sprint_30m_s))} s`}
                  tone="good"
                  hint={`from ${show(num(first?.raw_payload?.sprint_30m_s))} s`}
                />
                <Stat label="Sessions" value={featured.length} hint="bi-weekly cadence" />
                <Stat
                  label="Window"
                  value={(first?.created_at ?? "").slice(0, 7)}
                  hint={`through ${(last?.created_at ?? "").slice(0, 7)}`}
                />
              </StatRow>

              <div style={{ marginTop: 16 }}>
                <CompositeLine rows={featured} />
              </div>

              <h3 style={subheadStyle}>Taxonomy radar — latest session</h3>
              <TaxonomyRadar row={last} />
            </>
          )}
        </Panel>
      )}

      {shown.has("passport") && (
        <Panel
          id="passport"
          title="Scout Passport & Exports"
          subtitle="Verified video evidence, academic record, and the active recruiter share link."
        >
          {scoutLink ? (
            <div
              style={{
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: 14,
                background: theme.panelAlt,
                marginBottom: 16,
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong style={{ fontSize: 14 }}>{str(scoutLink.export_profile_name) ?? "Scout export"}</strong>
                <Badge tone={str(scoutLink.status) === "active" ? "good" : "warn"}>
                  {str(scoutLink.status) ?? "inactive"}
                </Badge>
                {scoutLink.requires_approval === false && <Badge tone="good">no approval needed</Badge>}
              </div>
              <dl style={defListStyle}>
                <Field label="Audience" value={str(scoutLink.audience) ?? str(scoutLink.recruitment_pathway)} />
                <Field label="Programme" value={str(scoutLink.program)} />
                <Field label="Cohort" value={str(scoutLink.cohort)} />
                <Field label="Share link" value={str(scoutLink.share_url)} />
                <Field label="Issued" value={whenLocal(scoutLink.issued_at)} />
                <Field label="Expires" value={whenLocal(scoutLink.expires_at)} />
              </dl>
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries((scoutLink.permissions ?? {}) as Record<string, unknown>).map(
                  ([key, granted]) => (
                    <Badge key={key} tone={granted ? "good" : "neutral"}>
                      {`${key.replace(/_/g, " ")}${granted ? "" : " · hidden"}`}
                    </Badge>
                  ),
                )}
              </div>
            </div>
          ) : (
            <Empty>No scout export configured for this squad yet.</Empty>
          )}

          <h3 style={subheadStyle}>Verified video tags</h3>
          <DataTable
            rows={videoTags}
            rowKey={(t) => t.metric_value_id}
            empty="No verified match footage tagged yet."
            columns={[
              { key: "tag", header: "Clip", render: (t) => t.value_text ?? "—" },
              { key: "when", header: "Match", render: (t) => whenLocal(t.measured_at) },
              { key: "verified", header: "Evidence", render: () => <Badge tone="good">hash-anchored</Badge> },
            ]}
          />

          <h3 style={subheadStyle}>Cambridge IGCSE record</h3>
          <DataTable
            rows={academics}
            rowKey={(a) => a.metric_value_id}
            empty="No academic markers on file."
            columns={[
              {
                key: "entry",
                header: "Marker",
                render: (a) =>
                  a.value_text ??
                  (a.value_numeric !== null && a.value_numeric !== undefined
                    ? `Term average: ${a.value_numeric}%`
                    : "—"),
              },
              { key: "when", header: "Recorded", render: (a) => whenLocal(a.measured_at) },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

const subheadStyle = {
  fontSize: 13,
  color: theme.dim,
  margin: "20px 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
};

const defListStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: "8px 18px",
  margin: "12px 0 0",
  fontSize: 13,
};

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <dt style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: theme.dim }}>
        {label}
      </dt>
      <dd style={{ margin: "2px 0 0", color: theme.text, wordBreak: "break-all" }}>{value}</dd>
    </div>
  );
}

/**
 * Composite over time. One series, so no legend — the panel title names
 * it. Only the two endpoints are labelled; every point carries a native
 * <title> so hovering reads out the exact session.
 */
function CompositeLine({ rows }: { rows: PerfRow[] }) {
  const W = 720;
  const H = 220;
  const pad = { top: 14, right: 44, bottom: 26, left: 34 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  const values = rows.map((r) => num(r.composite_score) ?? 0);
  const lo = Math.max(0, Math.floor((Math.min(...values) - 6) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...values) + 6) / 10) * 10);
  const x = (i: number) => pad.left + (plotW * i) / Math.max(1, rows.length - 1);
  const y = (v: number) => pad.top + plotH - (plotH * (v - lo)) / Math.max(1, hi - lo);

  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(values.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${pad.left},${(
    pad.top + plotH
  ).toFixed(1)} Z`;
  const ticks = [lo, Math.round((lo + hi) / 2), hi];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Composite score across ${rows.length} sessions, ${values[0]} to ${values[values.length - 1]}`}
      style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id="tta-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={theme.accent} stopOpacity="0.28" />
          <stop offset="100%" stopColor={theme.accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.left} x2={W - pad.right} y1={y(t)} y2={y(t)} stroke={theme.border} strokeWidth="1" />
          <text x={pad.left - 8} y={y(t) + 4} textAnchor="end" fontSize="10" fill={theme.dim}>
            {t}
          </text>
        </g>
      ))}

      <path d={area} fill="url(#tta-fill)" />
      <path d={line} fill="none" stroke={theme.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {rows.map((r, i) => (
        <circle
          key={r.id}
          cx={x(i)}
          cy={y(values[i]!)}
          r="8"
          fill="transparent"
          style={{ cursor: "pointer" }}
        >
          <title>{`Session ${i + 1} · ${(r.created_at ?? "").slice(0, 10)} · composite ${values[i]}`}</title>
        </circle>
      ))}

      {/* Endpoints only — a number on every point is noise. */}
      <circle cx={x(0)} cy={y(values[0]!)} r="3.5" fill={theme.accent} stroke={theme.panel} strokeWidth="2" />
      <circle
        cx={x(values.length - 1)}
        cy={y(values[values.length - 1]!)}
        r="4.5"
        fill={theme.accent}
        stroke={theme.panel}
        strokeWidth="2"
      />
      <text x={x(0) + 8} y={y(values[0]!) + 14} fontSize="11" fill={theme.muted}>
        {values[0]}
      </text>
      <text
        x={x(values.length - 1) + 10}
        y={y(values[values.length - 1]!) + 4}
        fontSize="12"
        fontWeight="700"
        fill={theme.text}
      >
        {values[values.length - 1]}
      </text>

      <text x={pad.left} y={H - 6} fontSize="10" fill={theme.dim}>
        {(rows[0]?.created_at ?? "").slice(0, 10)}
      </text>
      <text x={W - pad.right} y={H - 6} fontSize="10" fill={theme.dim} textAnchor="end">
        {(rows[rows.length - 1]?.created_at ?? "").slice(0, 10)}
      </text>
    </svg>
  );
}

/** Five-axis taxonomy radar. Single series, every axis direct-labelled. */
function TaxonomyRadar({ row }: { row: PerfRow | null }) {
  if (!row) return <Empty>No session to plot.</Empty>;

  const size = 300;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const radius = 96;
  const values = AXES.map((axis: Axis) => num(row[axis]) ?? 0);

  const point = (i: number, value: number) => {
    const angle = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
    const r = (radius * Math.max(0, Math.min(100, value))) / 100;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)] as const;
  };

  const polygon = values.map((v, i) => point(i, v).join(",")).join(" ");

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={AXES.map((a, i) => `${a} ${values[i]}`).join(", ")}
        style={{ width: 300, maxWidth: "100%", height: "auto", overflow: "visible" }}
      >
        {[25, 50, 75, 100].map((ring) => (
          <polygon
            key={ring}
            points={AXES.map((_, i) => point(i, ring).join(",")).join(" ")}
            fill="none"
            stroke={theme.border}
            strokeWidth="1"
          />
        ))}
        {AXES.map((_, i) => {
          const [px, py] = point(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={px} y2={py} stroke={theme.border} strokeWidth="1" />;
        })}

        <polygon points={polygon} fill={theme.accent} fillOpacity="0.22" stroke={theme.accent} strokeWidth="2" />

        {AXES.map((axis, i) => {
          const [px, py] = point(i, values[i]!);
          const [lx, ly] = point(i, 122);
          return (
            <g key={axis}>
              <circle cx={px} cy={py} r="3.5" fill={theme.accent} stroke={theme.panel} strokeWidth="2" />
              <text
                x={lx}
                y={ly}
                fontSize="11"
                fill={theme.muted}
                textAnchor={lx > cx + 4 ? "start" : lx < cx - 4 ? "end" : "middle"}
                dominantBaseline="middle"
              >
                {axis[0]!.toUpperCase() + axis.slice(1)}
                <tspan fill={theme.text} fontWeight="700">{` ${values[i]}`}</tspan>
              </text>
            </g>
          );
        })}
      </svg>

      {/* Table view of the same numbers — identity never rests on the shape alone. */}
      <div style={{ flex: "1 1 220px", minWidth: 220 }}>
        <DataTable
          rows={AXES.map((axis, i) => ({ axis, value: values[i]! }))}
          rowKey={(r) => r.axis}
          empty="No taxonomy vectors."
          columns={[
            {
              key: "axis",
              header: "Vector",
              render: (r) => r.axis[0]!.toUpperCase() + r.axis.slice(1),
            },
            {
              key: "value",
              header: "Score",
              align: "right",
              render: (r) => <strong style={{ color: theme.accent }}>{r.value.toFixed(0)}</strong>,
            },
          ]}
        />
      </div>
    </div>
  );
}
