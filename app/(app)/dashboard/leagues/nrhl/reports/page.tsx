"use client";

// =====================================================================
// TAB 6 — REPORT GENERATION & ROADMAP
//
// Matchday summaries, parent developmental digests, conference reports,
// and the season roadmap.
//
// Reports render from the payload already in memory — no export
// endpoint, because a second server round trip to reformat data the
// client is holding buys nothing. CSV export uses a blob download for
// the same reason.
// =====================================================================

import { useMemo, useState } from "react";
import {
  ActionButton,
  Field,
  FormGrid,
  LeagueGate,
  fmt,
  useLeague,
  type LeaguePayload,
} from "@/components/workspace/nrhl-league";
import {
  divisionReport,
  matchdaySummary,
  openPrintable,
  parentDigest,
} from "@/lib/services/nrhl-pdf-generator";
import { Badge, DataTable, Panel, Stat, StatRow, selectStyle, theme } from "@/components/workspace/ui";

export default function ReportsTab() {
  return <LeagueGate>{(data) => <Reports data={data} />}</LeagueGate>;
}

function Reports({ data }: { data: LeaguePayload }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Roadmap data={data} />
      <MatchdayReports data={data} />
      <ParentDigests data={data} />
      <DivisionReports data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Roadmap
// ---------------------------------------------------------------------

const PHASE_DETAIL: Record<string, { label: string; items: string[] }> = {
  combine: {
    label: "Phase 1",
    items: [
      "Standardised kinetic profiling — every athlete gets a five-pillar baseline",
      "Monthly showcase scrimmage, final weekend of each month",
      "Digital Athlete Performance Profile created at first measurement",
    ],
  },
  draft: {
    label: "Phase 2",
    items: [
      "Squad assignment by composite index, balanced across conferences",
      "Roster lock — the first persistent team entity the league has ever had",
      "Guardian verification and consent election closed out before seeding",
    ],
  },
  launch: {
    label: "Phase 3",
    items: [
      "Season 1 opening matchday on modular inline surfaces",
      "Standings become live: matchday sheets feed GP/W/GD/PTS per squad",
      "Weekly parent digests and conference reports run off real fixtures",
    ],
  },
};

function Roadmap({ data }: { data: LeaguePayload }) {
  const readiness: Record<string, { done: number; total: number; note: string }> = {
    combine: {
      done: data.athletes.filter((a) => a.speed_rating !== null || a.technical_rating !== null).length,
      total: data.athletes.length,
      note: "athletes with a measured baseline",
    },
    draft: {
      done: data.counts.drafted,
      total: data.athletes.length,
      note: "athletes assigned to a squad",
    },
    launch: {
      done: data.counts.scrimmagesScored,
      total: Math.max(data.counts.scrimmages, 1),
      note: "matches with a recorded score",
    },
  };

  return (
    <Panel
      title="Season roadmap"
      subtitle="Each phase carries its live completion signal, so the timeline reflects the database rather than the plan."
    >
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {data.phases.map((phase) => {
          const detail = PHASE_DETAIL[phase.id]!;
          const r = readiness[phase.id]!;
          const pct = r.total === 0 ? 0 : Math.round((r.done / r.total) * 100);
          return (
            <div
              key={phase.id}
              style={{
                background: theme.panelAlt,
                border: `1px solid ${theme.border}`,
                borderRadius: 12,
                padding: "14px 15px",
              }}
            >
              <div style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: theme.accent, fontWeight: 700 }}>
                {detail.label}
              </div>
              <h3 style={{ margin: "6px 0 4px", fontSize: 14.5 }}>{phase.name}</h3>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: theme.muted }}>
                {phase.start} → {phase.end}
              </p>

              <div
                style={{
                  height: 6,
                  borderRadius: 999,
                  background: theme.bg,
                  overflow: "hidden",
                  border: `1px solid ${theme.border}`,
                }}
              >
                <div style={{ width: `${pct}%`, height: "100%", background: theme.accent }} />
              </div>
              <p style={{ margin: "6px 0 12px", fontSize: 11.5, color: theme.dim }}>
                {r.done} / {r.total} {r.note}
              </p>

              <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: theme.muted, lineHeight: 1.7 }}>
                {detail.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Matchday reports
// ---------------------------------------------------------------------

function MatchdayReports({ data }: { data: LeaguePayload }) {
  const nameOf = useMemo(
    () => new Map(data.athletes.map((a) => [a.athlete_code, a.display_name])),
    [data.athletes],
  );

  const build = (scrimmageId: string) => {
    const match = data.scrimmages.find((s) => s.scrimmage_id === scrimmageId)!;
    return matchdaySummary({
      scrimmageId: match.scrimmage_id,
      playedOn: match.played_on,
      division: match.division,
      teamA: match.team_a,
      teamB: match.team_b,
      scoreA: match.score_a,
      scoreB: match.score_b,
      venue: match.venue,
      notes: match.notes,
      lines: data.statLines
        .filter((l) => l.scrimmage_id === scrimmageId)
        .map((l) => ({
          name: nameOf.get(l.athlete_code) ?? l.athlete_code,
          athleteCode: l.athlete_code,
          side: l.side,
          assistedGoals: l.assisted_goals,
          soloGoals: l.solo_goals,
          assists: l.assists,
          points: l.points,
          penaltyMinutes: l.penalty_minutes,
          conductNote: l.conduct_note,
        })),
    });
  };

  return (
    <Panel
      title="Matchday summaries"
      subtitle="One report per logged match. Matches without stat lines print their scoreline and say so — the legacy series carries no per-athlete sheet."
    >
      <DataTable
        rows={data.scrimmages}
        rowKey={(s) => s.scrimmage_id}
        empty="No matches recorded yet."
        columns={[
          { key: "id", header: "Match", render: (s) => s.scrimmage_id },
          { key: "date", header: "Date", render: (s) => s.played_on ?? <Badge tone="warn">no date</Badge> },
          { key: "division", header: "Division", render: (s) => s.division ?? "Unassigned" },
          {
            key: "score",
            header: "Result",
            render: (s) =>
              s.score_a === null || s.score_b === null ? (
                <Badge tone="warn">no score</Badge>
              ) : (
                <span>
                  {s.team_a} {s.score_a} — {s.score_b} {s.team_b}
                  {s.decided_in_overtime ? " (OT)" : ""}
                </span>
              ),
          },
          {
            key: "lines",
            header: "Stat lines",
            align: "right",
            render: (s) => data.statLines.filter((l) => l.scrimmage_id === s.scrimmage_id).length,
          },
          {
            key: "export",
            header: "",
            render: (s) => (
              <ActionButton onClick={() => openPrintable(build(s.scrimmage_id))}>Report</ActionButton>
            ),
          },
        ]}
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Parent digests
// ---------------------------------------------------------------------

function ParentDigests({ data }: { data: LeaguePayload }) {
  const [athleteCode, setAthleteCode] = useState(data.athletes[0]?.athlete_code ?? "");
  const [weekOf, setWeekOf] = useState(mondayOf(new Date()));
  const [coachNote, setCoachNote] = useState("");

  const athlete = data.athletes.find((a) => a.athlete_code === athleteCode);

  const matchesInWeek = useMemo(() => {
    const start = Date.parse(`${weekOf}T00:00:00+03:00`);
    const end = start + 7 * 86_400_000;
    const ids = new Set(
      data.scrimmages
        .filter((s) => {
          if (!s.played_on) return false;
          const t = Date.parse(`${s.played_on}T00:00:00+03:00`);
          return t >= start && t < end;
        })
        .map((s) => s.scrimmage_id),
    );
    return data.statLines
      .filter((l) => l.athlete_code === athleteCode && ids.has(l.scrimmage_id))
      .map((l) => ({
        scrimmageId: l.scrimmage_id,
        points: l.points,
        assistedGoals: l.assisted_goals,
        soloGoals: l.solo_goals,
        assists: l.assists,
      }));
  }, [data.scrimmages, data.statLines, athleteCode, weekOf]);

  const generate = () => {
    if (!athlete) return;
    openPrintable(
      parentDigest({
        athlete: {
          athleteCode: athlete.athlete_code,
          displayName: athlete.display_name,
          division: athlete.division,
          team: athlete.team,
        },
        weekOf,
        matches: matchesInWeek,
        coachNote: coachNote.trim() || null,
      }),
    );
  };

  return (
    <Panel
      title="Parent weekly developmental digest"
      subtitle="Sent to guardians. Leads with shared-goal count rather than raw goals, because that is the behaviour the scoring law rewards at four to one."
      actions={
        <ActionButton onClick={generate} tone="primary" disabled={!athlete}>
          Generate digest
        </ActionButton>
      }
    >
      <FormGrid min={190}>
        <Field label="Athlete">
          <select
            style={{ ...selectStyle, width: "100%" }}
            value={athleteCode}
            onChange={(e) => setAthleteCode(e.target.value)}
          >
            {data.athletes.map((a) => (
              <option key={a.athlete_code} value={a.athlete_code}>
                {a.display_name} · {a.athlete_code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Week commencing">
          <input
            type="date"
            style={{ ...selectStyle, width: "100%" }}
            value={weekOf}
            onChange={(e) => setWeekOf(e.target.value)}
          />
        </Field>
        <Field label="Coach note (optional)">
          <input
            style={{ ...selectStyle, width: "100%" }}
            value={coachNote}
            onChange={(e) => setCoachNote(e.target.value)}
            placeholder="One line to the family"
          />
        </Field>
      </FormGrid>

      <div style={{ marginTop: 14 }}>
        <StatRow>
          <Stat label="Sessions this week" value={matchesInWeek.length} tone={matchesInWeek.length ? "good" : "warn"} />
          <Stat label="Weighted points" value={matchesInWeek.reduce((s, m) => s + m.points, 0)} />
          <Stat label="Shared goals" value={matchesInWeek.reduce((s, m) => s + m.assistedGoals, 0)} />
          <Stat label="Solo goals" value={matchesInWeek.reduce((s, m) => s + m.soloGoals, 0)} />
        </StatRow>
        {matchesInWeek.length === 0 && (
          <p style={{ margin: "10px 0 0", fontSize: 12.5, color: theme.dim }}>
            No logged sessions in that week — the digest will state that plainly rather than showing
            zeros as performance.
          </p>
        )}
      </div>
    </Panel>
  );
}

function mondayOf(d: Date): string {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday = 0
  copy.setDate(copy.getDate() - day);
  return copy.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------
// Division reports + raw export
// ---------------------------------------------------------------------

function DivisionReports({ data }: { data: LeaguePayload }) {
  const build = (division: string) =>
    divisionReport({
      division,
      standings: data.standings.filter((s) => s.division === division),
      leaders: data.leaderboard
        .filter((l) => l.division === division)
        .sort((a, b) => (b.livePoints ?? b.legacyPoints ?? 0) - (a.livePoints ?? a.legacyPoints ?? 0))
        .slice(0, 10)
        .map((l) => ({
          name: l.name,
          athleteCode: l.athleteCode,
          points: l.livePoints ?? l.legacyPoints,
          goals: l.goals,
          assists: l.assists,
        })),
    });

  const exportCsv = () => {
    const header = [
      "athlete_code",
      "name",
      "division",
      "team",
      "games_played",
      "goals",
      "assists",
      "points",
      "composite_score",
      "composite_index",
      "certificate_tier",
    ];
    const rows = data.leaderboard.map((r) =>
      [
        r.athleteCode,
        r.name,
        r.division ?? "",
        r.team ?? "",
        r.liveGamesPlayed || r.legacyGamesPlayed || "",
        r.goals ?? "",
        r.assists ?? "",
        r.livePoints ?? r.legacyPoints ?? "",
        r.compositeScore ?? "",
        r.compositeIndex ?? "",
        r.certificateTier ?? "",
      ]
        .map((v) => (String(v).includes(",") ? `"${String(v).replace(/"/g, '""')}"` : String(v)))
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nrhl-league-export-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Panel
      title="League & division reports"
      subtitle="One report per conference, plus a flat CSV of the whole player matrix for anything the dashboard does not answer."
      actions={<ActionButton onClick={exportCsv}>Export player matrix (CSV)</ActionButton>}
    >
      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))" }}>
        {data.divisions.map((division) => {
          const teams = data.standings.filter((s) => s.division === division).length;
          const athletes = data.leaderboard.filter((l) => l.division === division).length;
          return (
            <div
              key={division}
              style={{
                background: theme.panelAlt,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: "12px 14px",
                display: "grid",
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 13.5 }}>{division}</strong>
              <span style={{ fontSize: 12, color: theme.muted }}>
                {athletes} athletes · {teams} squads with results
              </span>
              <ActionButton onClick={() => openPrintable(build(division))}>Generate report</ActionButton>
            </div>
          );
        })}
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 12, color: theme.dim, lineHeight: 1.7 }}>
        Conferences are geographic and hold territories, not squads — a division report is empty
        until athletes are seeded into it and squads play scored fixtures. Legacy scrimmage totals:{" "}
        {fmt.int(data.counts.scrimmages)} matches, {fmt.int(data.counts.scrimmagesScored)} scored.
      </p>
    </Panel>
  );
}
