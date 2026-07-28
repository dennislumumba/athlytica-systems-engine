"use client";

// =====================================================================
// TAB 1 — EXECUTIVE OVERVIEW
//
// Key metrics, top-performer carousel, and the combine-phase countdown.
// Every figure is read from the league payload; nothing is illustrative.
// Where a measurement genuinely does not exist yet the tile says so
// rather than showing a zero.
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { LeagueGate, fmt, type LeaderboardRow, type LeaguePayload } from "@/components/workspace/nrhl-league";
import { Badge, Column, DataTable, Panel, Stat, StatRow, theme } from "@/components/workspace/ui";

export default function OverviewTab() {
  return <LeagueGate>{(data) => <Overview data={data} />}</LeagueGate>;
}

function Overview({ data }: { data: LeaguePayload }) {
  const { counts, coverage } = data;

  // Combine Readiness Index: the share of active athletes carrying the
  // three things the January draft actually requires — a measured
  // baseline, a verified guardian contact, and a media-consent election.
  // A weighted average, not a vibe: each athlete contributes 0-1.
  const readiness = useMemo(() => {
    if (data.athletes.length === 0) return null;
    const score = data.athletes.reduce((sum, a) => {
      const baseline = a.speed_rating !== null || a.technical_rating !== null ? 1 : 0;
      const guardian = a.guardian_verified_at ? 1 : a.guardian_phone_e164 ? 0.5 : 0;
      const consent = a.consent_media ? 1 : 0;
      return sum + (baseline + guardian + consent) / 3;
    }, 0);
    return Math.round((score / data.athletes.length) * 1000) / 10;
  }, [data.athletes]);

  const topScorers = rank(data.leaderboard, (r) => r.livePoints ?? r.legacyPoints);
  const topAssists = rank(data.leaderboard, (r) => r.assists);
  const topSaves = rank(data.leaderboard, (r) => r.savePct);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <PhaseBanner data={data} />

      <Panel
        title="League at a glance"
        subtitle="Counts are live from the league plane — ingest the legacy extract from the Onboarding tab if these read zero."
      >
        <StatRow>
          <Stat label="Active athletes" value={counts.athletes} hint="in the NRHL registry" />
          <Stat label="Scrimmages ingested" value={counts.scrimmages} hint={`${counts.scrimmagesScored} with a recorded score`} />
          <Stat label="Divisions" value={counts.divisions} hint="Summit · Ridge · Plateau · Savannah" />
          <Stat
            label="Combine readiness"
            value={readiness === null ? "—" : `${readiness}%`}
            tone={readiness === null ? "neutral" : readiness > 60 ? "good" : "warn"}
            hint="baseline · guardian · consent"
          />
        </StatRow>

        <StatRow>
          <Stat label="Certificates issued" value={`${counts.certified} / ${counts.athletes}`} tone={counts.certified < counts.athletes ? "warn" : "good"} />
          <Stat label="Passports issued" value={counts.passportsIssued} />
          <Stat label="Guardians verified" value={`${counts.guardiansVerified} / ${counts.guardiansLinked}`} tone={counts.guardiansVerified < counts.guardiansLinked ? "warn" : "neutral"} />
          <Stat label="Drafted" value={counts.drafted} hint={counts.draftLocked > 0 ? `${counts.draftLocked} locked` : "draft open"} />
        </StatRow>
      </Panel>

      <Panel
        title="Top performers"
        subtitle="Scroll horizontally. Live columns come from logged matchday sheets; where none exist yet the legacy scrimmage rollup is shown."
      >
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            paddingBottom: 6,
          }}
        >
          <LeaderCard title="Weighted points" rows={topScorers} value={(r) => r.livePoints ?? r.legacyPoints} unit="pts" />
          <LeaderCard title="Assist leaders" rows={topAssists} value={(r) => r.assists} unit="A" />
          <LeaderCard title="Save percentage" rows={topSaves} value={(r) => r.savePct} unit="%" />
          <LeaderCard title="Composite index" rows={rank(data.leaderboard, (r) => r.compositeIndex)} value={(r) => r.compositeIndex} unit="idx" />
        </div>
      </Panel>

      <Panel
        title="Universal Taxonomy coverage"
        subtitle="Which of the five pillars actually carry measurements after the backfill. A pillar with no metric is a capture gap, not a zero score."
      >
        <DataTable
          rows={Object.entries(coverage).map(([pillar, v]) => ({ pillar, ...v }))}
          rowKey={(r) => r.pillar}
          empty="No metrics ingested yet."
          columns={
            [
              { key: "pillar", header: "Pillar", render: (r) => r.pillar },
              {
                key: "state",
                header: "State",
                render: (r) =>
                  r.measurements === 0 ? (
                    <Badge tone="bad">no capture</Badge>
                  ) : r.metricCodes.length === 1 ? (
                    <Badge tone="warn">single metric</Badge>
                  ) : (
                    <Badge tone="good">instrumented</Badge>
                  ),
              },
              { key: "codes", header: "Metrics", render: (r) => r.metricCodes.join(", ") || "—" },
              { key: "athletes", header: "Athletes", align: "right", render: (r) => r.athletes },
              { key: "measurements", header: "Measurements", align: "right", render: (r) => r.measurements },
            ] as Column<{ pillar: string; metricCodes: string[]; measurements: number; athletes: number }>[]
          }
        />
      </Panel>
    </div>
  );
}

function rank(rows: LeaderboardRow[], pick: (r: LeaderboardRow) => number | null): LeaderboardRow[] {
  return rows
    .filter((r) => pick(r) !== null && pick(r) !== 0)
    .sort((a, b) => (pick(b) ?? 0) - (pick(a) ?? 0))
    .slice(0, 5);
}

function LeaderCard({
  title,
  rows,
  value,
  unit,
}: {
  title: string;
  rows: LeaderboardRow[];
  value: (r: LeaderboardRow) => number | null;
  unit: string;
}) {
  return (
    <div
      style={{
        scrollSnapAlign: "start",
        minWidth: 250,
        flex: "0 0 auto",
        background: theme.panelAlt,
        border: `1px solid ${theme.border}`,
        borderRadius: 12,
        padding: "12px 14px",
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: theme.dim,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12.5, color: theme.dim }}>Not yet recorded.</p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
          {rows.map((r, i) => (
            <li
              key={r.athleteCode}
              style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}
            >
              <span style={{ color: i === 0 ? theme.text : theme.muted }}>
                <span style={{ color: theme.dim, marginRight: 6 }}>{i + 1}</span>
                {r.name}
              </span>
              <strong style={{ color: i === 0 ? theme.accent : theme.text, whiteSpace: "nowrap" }}>
                {fmt.num(value(r), unit === "pts" || unit === "A" ? 0 : 1)} {unit}
              </strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------
// Phase banner + countdown
// ---------------------------------------------------------------------

function PhaseBanner({ data }: { data: LeaguePayload }) {
  // Rendered only after mount: a server-rendered "days remaining" would
  // hydrate against a different clock and flash the wrong number.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const launch = data.phases.find((p) => p.id === "launch");
  const current = now === null ? null : data.phases.find((p) => within(p.start, p.end, now));
  const days = (iso: string) =>
    now === null ? null : Math.ceil((Date.parse(`${iso}T00:00:00+03:00`) - now) / 86_400_000);

  return (
    <section
      style={{
        background: `linear-gradient(120deg, ${theme.panel}, ${theme.panelAlt})`,
        border: `1px solid ${theme.accent}44`,
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: theme.accent,
              fontWeight: 700,
            }}
          >
            League operations
          </div>
          <h2 style={{ margin: "6px 0 2px", fontSize: 17 }}>
            {current ? current.name : "Between phases"}
          </h2>
          <p style={{ margin: 0, fontSize: 13, color: theme.muted }}>
            {current
              ? `Runs ${current.start} → ${current.end}.`
              : "No phase window is currently open."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {data.phases.map((p) => {
            const remaining = days(p.start);
            const state =
              now === null
                ? "…"
                : within(p.start, p.end, now)
                  ? "Active"
                  : remaining !== null && remaining > 0
                    ? `in ${remaining} d`
                    : "Complete";
            return (
              <div
                key={p.id}
                style={{
                  background: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  padding: "10px 12px",
                  minWidth: 130,
                }}
              >
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.dim }}>
                  {p.id === "combine" ? "Phase 1 · Combine" : p.id === "draft" ? "Phase 2 · Draft" : "Phase 3 · Launch"}
                </div>
                <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{state}</div>
                <div style={{ fontSize: 11.5, color: theme.muted, marginTop: 2 }}>{p.start}</div>
              </div>
            );
          })}
        </div>
      </div>
      {launch && (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: theme.dim }}>
          Opening matchday {fmt.date(launch.start)} · competitive play was deferred from August 2026
          pending junior liability insurance, the Joker Floors modular surface install, and a
          data-driven pre-season.
        </p>
      )}
    </section>
  );
}

const within = (start: string, end: string, now: number) =>
  now >= Date.parse(`${start}T00:00:00+03:00`) && now <= Date.parse(`${end}T23:59:59+03:00`);
