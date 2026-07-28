"use client";

// =====================================================================
// TAB 2 — STATS & STANDINGS ENGINE
//
// Standings (division-filterable), a searchable player matrix, and the
// matchday sheet logger.
//
// The logger never sends a points total. It sends component counts and
// the server's GENERATED column applies 3*AG + SG + A — so a UI bug
// cannot write a score that disagrees with the league's scoring law.
// =====================================================================

import { useMemo, useState } from "react";
import {
  ActionButton,
  Field,
  FormGrid,
  LeagueGate,
  Notice,
  fmt,
  inputStyle,
  useLeague,
  type LeaguePayload,
} from "@/components/workspace/nrhl-league";
import { Column, DataTable, Panel, Stat, StatRow, selectStyle, theme } from "@/components/workspace/ui";

export default function StatsTab() {
  return <LeagueGate>{(data) => <Stats data={data} />}</LeagueGate>;
}

function Stats({ data }: { data: LeaguePayload }) {
  const [division, setDivision] = useState<string>("all");
  const [query, setQuery] = useState("");

  const standings = data.standings.filter((s) => division === "all" || s.division === division);

  const players = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.leaderboard
      .filter((p) => division === "all" || p.division === division)
      .filter(
        (p) =>
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.athleteCode.toLowerCase().includes(q) ||
          (p.team ?? "").toLowerCase().includes(q),
      )
      .sort(
        (a, b) =>
          (b.livePoints ?? b.legacyPoints ?? 0) - (a.livePoints ?? a.legacyPoints ?? 0) ||
          a.name.localeCompare(b.name),
      );
  }, [data.leaderboard, division, query]);

  const standingColumns: Column<(typeof data.standings)[number]>[] = [
    { key: "team", header: "Team", render: (r) => r.team },
    { key: "division", header: "Division", render: (r) => r.division },
    { key: "gp", header: "GP", align: "right", render: (r) => r.gp },
    { key: "w", header: "W", align: "right", render: (r) => r.w },
    { key: "otw", header: "OT W", align: "right", render: (r) => r.otW },
    { key: "l", header: "L", align: "right", render: (r) => r.l },
    { key: "otl", header: "OT L", align: "right", render: (r) => r.otL },
    { key: "d", header: "D", align: "right", render: (r) => r.d },
    { key: "gf", header: "GF", align: "right", render: (r) => r.gf },
    { key: "ga", header: "GA", align: "right", render: (r) => r.ga },
    {
      key: "gd",
      header: "GD",
      align: "right",
      render: (r) => (
        <span style={{ color: r.gd > 0 ? theme.good : r.gd < 0 ? theme.bad : theme.muted }}>
          {fmt.signed(r.gd)}
        </span>
      ),
    },
    { key: "pts", header: "PTS", align: "right", render: (r) => <strong>{r.pts}</strong> },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Panel
        title="Division standings"
        subtitle={`Only matches with both scores recorded count — ${data.counts.scrimmages - data.counts.scrimmagesScored} of ${data.counts.scrimmages} legacy scrimmages were logged without a score and are excluded rather than treated as 0-0.`}
        actions={
          <select
            style={selectStyle}
            value={division}
            onChange={(e) => setDivision(e.target.value)}
            aria-label="Filter by division"
          >
            <option value="all">All divisions</option>
            {data.divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
            <option value="Unassigned">Unassigned</option>
          </select>
        }
      >
        <DataTable
          rows={standings}
          columns={standingColumns}
          rowKey={(r) => `${r.division}-${r.team}`}
          empty="No scored matches yet. Standings populate as matchday sheets are logged — no persistent team entity existed in the legacy source, so every legacy side was the literal 'Team A' / 'Team B'."
        />
        <p style={{ margin: "12px 0 0", fontSize: 12, color: theme.dim }}>
          Win {data.standingsPoints.win} · OT win {data.standingsPoints.otWin} · OT loss{" "}
          {data.standingsPoints.otLoss} · draw {data.standingsPoints.draw} · loss{" "}
          {data.standingsPoints.loss}. Team-level point weighting exists in no source document — these
          are IIHF three-point weights held as a league assumption until the Director ratifies them.
        </p>
      </Panel>

      <Panel
        title="Player leaderboard"
        subtitle="Search by name, athlete code or squad. AG/SG are only available for matches logged through the sheet below; the legacy rollup carries totals without the split."
        actions={
          <input
            style={{ ...inputStyle, width: 220 }}
            placeholder="Search athletes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search athletes"
          />
        }
      >
        <DataTable
          rows={players}
          rowKey={(r) => r.athleteCode}
          empty="No athletes match."
          columns={[
            {
              key: "athlete",
              header: "Athlete",
              render: (r) => (
                <span>
                  {r.name}
                  <span style={{ color: theme.dim, marginLeft: 8, fontSize: 11.5 }}>{r.athleteCode}</span>
                </span>
              ),
            },
            { key: "squad", header: "Squad", render: (r) => r.team ?? "—" },
            { key: "gp", header: "GP", align: "right", render: (r) => fmt.int(r.liveGamesPlayed || r.legacyGamesPlayed) },
            { key: "goals", header: "G", align: "right", render: (r) => fmt.int(r.goals) },
            { key: "ag", header: "AG", align: "right", render: (r) => fmt.int(r.assistedGoals) },
            { key: "sg", header: "SG", align: "right", render: (r) => fmt.int(r.soloGoals) },
            { key: "a", header: "A", align: "right", render: (r) => fmt.int(r.assists) },
            {
              key: "pts",
              header: "PTS",
              align: "right",
              render: (r) => <strong>{fmt.int(r.livePoints ?? r.legacyPoints)}</strong>,
            },
            { key: "sv", header: "SV%", align: "right", render: (r) => fmt.num(r.savePct, 1) },
            {
              key: "idx",
              header: "Composite idx",
              align: "right",
              render: (r) =>
                r.compositeIndex === null ? (
                  <span style={{ color: theme.dim }}>—</span>
                ) : (
                  <span style={{ color: r.compositeIndex >= 70 ? theme.good : theme.text }}>
                    {fmt.num(r.compositeIndex, 1)}
                  </span>
                ),
            },
          ]}
        />
      </Panel>

      <MatchdayLogger data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Matchday sheet logger
// ---------------------------------------------------------------------

interface SheetLine {
  athleteCode: string;
  side: "A" | "B";
  assistedGoals: number;
  soloGoals: number;
  assists: number;
  penaltyMinutes: number;
  shotVelocityKmh: string;
  saves: string;
  shotsFaced: string;
  conductNote: string;
}

const emptyLine = (athleteCode: string): SheetLine => ({
  athleteCode,
  side: "A",
  assistedGoals: 0,
  soloGoals: 0,
  assists: 0,
  penaltyMinutes: 0,
  shotVelocityKmh: "",
  saves: "",
  shotsFaced: "",
  conductNote: "",
});

function MatchdayLogger({ data }: { data: LeaguePayload }) {
  const { act } = useLeague();
  const [scrimmageId, setScrimmageId] = useState(nextScrimmageId(data));
  const [playedOn, setPlayedOn] = useState(new Date().toISOString().slice(0, 10));
  const [division, setDivision] = useState("");
  const [teamA, setTeamA] = useState("Team A");
  const [teamB, setTeamB] = useState("Team B");
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [overtime, setOvertime] = useState(false);
  const [venue, setVenue] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<SheetLine[]>([]);
  const [picker, setPicker] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  const nameOf = useMemo(
    () => new Map(data.athletes.map((a) => [a.athlete_code, a.display_name])),
    [data.athletes],
  );
  const available = data.athletes.filter((a) => !lines.some((l) => l.athleteCode === a.athlete_code));

  const patch = (code: string, changes: Partial<SheetLine>) =>
    setLines((prev) => prev.map((l) => (l.athleteCode === code ? { ...l, ...changes } : l)));

  const sheetPoints = (l: SheetLine) => l.assistedGoals * 3 + l.soloGoals + l.assists;
  const goalsFor = (side: "A" | "B") =>
    lines.filter((l) => l.side === side).reduce((s, l) => s + l.assistedGoals + l.soloGoals, 0);

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const res = await act({
      action: "log-match",
      scrimmageId: scrimmageId.trim(),
      playedOn: playedOn || null,
      division: (division || null) as never,
      teamA: teamA.trim() || "Team A",
      teamB: teamB.trim() || "Team B",
      scoreA: scoreA === "" ? null : Number(scoreA),
      scoreB: scoreB === "" ? null : Number(scoreB),
      decidedInOvertime: overtime,
      venue: venue.trim() || null,
      notes: notes.trim() || null,
      statLines: lines.map((l) => ({
        athleteCode: l.athleteCode,
        side: l.side,
        assistedGoals: l.assistedGoals,
        soloGoals: l.soloGoals,
        assists: l.assists,
        penaltyMinutes: l.penaltyMinutes,
        shotVelocityKmh: l.shotVelocityKmh === "" ? null : Number(l.shotVelocityKmh),
        saves: l.saves === "" ? null : Number(l.saves),
        shotsFaced: l.shotsFaced === "" ? null : Number(l.shotsFaced),
        conductNote: l.conductNote.trim() || null,
      })),
    });
    setBusy(false);
    if (res.success) {
      setResult({ text: `${scrimmageId} saved with ${lines.length} stat lines.`, tone: "good" });
      setLines([]);
    } else {
      setResult({ text: res.error ?? "Save failed.", tone: "bad" });
    }
  };

  return (
    <Panel
      title="Matchday sheet logger"
      subtitle="Live scorekeeping. Enter goal components — the weighted point total is computed by the database, never sent from here."
      actions={
        <ActionButton onClick={submit} tone="primary" disabled={busy || scrimmageId.trim().length < 3}>
          {busy ? "Saving…" : "Save matchday sheet"}
        </ActionButton>
      }
    >
      <FormGrid>
        <Field label="Match id">
          <input style={inputStyle} value={scrimmageId} onChange={(e) => setScrimmageId(e.target.value)} />
        </Field>
        <Field label="Date">
          <input type="date" style={inputStyle} value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
        </Field>
        <Field label="Division">
          <select style={{ ...selectStyle, width: "100%" }} value={division} onChange={(e) => setDivision(e.target.value)}>
            <option value="">Unassigned</option>
            {data.divisions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Venue">
          <input style={inputStyle} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Venue or coordinates" />
        </Field>
      </FormGrid>

      <div style={{ marginTop: 12 }}>
        <FormGrid min={130}>
          <Field label="Team A">
            <input style={inputStyle} value={teamA} onChange={(e) => setTeamA(e.target.value)} />
          </Field>
          <Field label="Score A" hint={`sheet goals: ${goalsFor("A")}`}>
            <input type="number" min={0} style={inputStyle} value={scoreA} onChange={(e) => setScoreA(e.target.value)} />
          </Field>
          <Field label="Team B">
            <input style={inputStyle} value={teamB} onChange={(e) => setTeamB(e.target.value)} />
          </Field>
          <Field label="Score B" hint={`sheet goals: ${goalsFor("B")}`}>
            <input type="number" min={0} style={inputStyle} value={scoreB} onChange={(e) => setScoreB(e.target.value)} />
          </Field>
          <Field label="Decided in overtime">
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.text }}>
              <input type="checkbox" checked={overtime} onChange={(e) => setOvertime(e.target.checked)} />
              OT / shootout
            </label>
          </Field>
        </FormGrid>
      </div>

      <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
        <div style={{ minWidth: 240, flex: 1 }}>
          <Field label="Add athlete to sheet">
            <select
              style={{ ...selectStyle, width: "100%" }}
              value={picker}
              onChange={(e) => setPicker(e.target.value)}
            >
              <option value="">Select an athlete…</option>
              {available.map((a) => (
                <option key={a.athlete_code} value={a.athlete_code}>
                  {a.display_name} · {a.athlete_code}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ActionButton
          onClick={() => {
            if (!picker) return;
            setLines((prev) => [...prev, emptyLine(picker)]);
            setPicker("");
          }}
          disabled={!picker}
        >
          Add line
        </ActionButton>
        {lines.length > 0 && <ActionButton onClick={() => setLines([])} tone="danger">Clear sheet</ActionButton>}
      </div>

      <div style={{ marginTop: 12 }}>
        <DataTable
          rows={lines}
          rowKey={(l) => l.athleteCode}
          empty="No stat lines yet. Add the athletes who played, then record goal components per athlete."
          columns={[
            {
              key: "athlete",
              header: "Athlete",
              render: (l) => (
                <span>
                  {nameOf.get(l.athleteCode) ?? l.athleteCode}
                  <span style={{ color: theme.dim, marginLeft: 6, fontSize: 11 }}>{l.athleteCode}</span>
                </span>
              ),
            },
            {
              key: "side",
              header: "Side",
              render: (l) => (
                <select
                  style={{ ...selectStyle, padding: "3px 6px" }}
                  value={l.side}
                  onChange={(e) => patch(l.athleteCode, { side: e.target.value as "A" | "B" })}
                >
                  <option value="A">{teamA}</option>
                  <option value="B">{teamB}</option>
                </select>
              ),
            },
            numberCell("AG ×3", "assistedGoals", patch),
            numberCell("SG ×1", "soloGoals", patch),
            numberCell("A ×1", "assists", patch),
            {
              key: "pts",
              header: "PTS",
              align: "right",
              render: (l) => <strong style={{ color: theme.accent }}>{sheetPoints(l)}</strong>,
            },
            numberCell("PIM", "penaltyMinutes", patch),
            textCell("Shot km/h", "shotVelocityKmh", patch, 72),
            textCell("Saves", "saves", patch, 60),
            textCell("Shots faced", "shotsFaced", patch, 70),
            {
              key: "conduct",
              header: "Conduct note",
              render: (l) => (
                <input
                  style={{ ...inputStyle, width: 180, padding: "4px 7px" }}
                  value={l.conductNote}
                  placeholder="qualitative only"
                  onChange={(e) => patch(l.athleteCode, { conductNote: e.target.value })}
                />
              ),
            },
            {
              key: "remove",
              header: "",
              render: (l) => (
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((x) => x.athleteCode !== l.athleteCode))}
                  style={{ background: "none", border: "none", color: theme.bad, cursor: "pointer", fontSize: 15 }}
                  aria-label={`Remove ${l.athleteCode}`}
                >
                  ×
                </button>
              ),
            },
          ]}
        />
      </div>

      {lines.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <StatRow>
            <Stat label="Athletes on sheet" value={lines.length} />
            <Stat label="Sheet points" value={lines.reduce((s, l) => s + sheetPoints(l), 0)} tone="good" />
            <Stat
              label="Shared-goal share"
              value={sharedShare(lines)}
              hint="assisted goals as % of all goals"
            />
          </StatRow>
          {mismatch(scoreA, goalsFor("A")) || mismatch(scoreB, goalsFor("B")) ? (
            <p style={{ marginTop: 10, fontSize: 12.5, color: theme.warn }}>
              Scoreline and sheet goals disagree. Both are saved as entered — the discrepancy is
              recorded, not silently reconciled.
            </p>
          ) : null}
        </div>
      )}

      <Notice text={result?.text ?? null} tone={result?.tone ?? "good"} />
    </Panel>
  );
}

const mismatch = (score: string, sheet: number) => score !== "" && Number(score) !== sheet;

function sharedShare(lines: SheetLine[]): string {
  const assisted = lines.reduce((s, l) => s + l.assistedGoals, 0);
  const total = assisted + lines.reduce((s, l) => s + l.soloGoals, 0);
  return total === 0 ? "—" : `${Math.round((assisted / total) * 100)}%`;
}

function numberCell(
  header: string,
  key: "assistedGoals" | "soloGoals" | "assists" | "penaltyMinutes",
  patch: (code: string, changes: Partial<SheetLine>) => void,
): Column<SheetLine> {
  return {
    key,
    header,
    align: "right",
    render: (l) => (
      <input
        type="number"
        min={0}
        style={{ ...inputStyle, width: 62, padding: "4px 6px", textAlign: "right" }}
        value={l[key]}
        onChange={(e) => patch(l.athleteCode, { [key]: Math.max(0, Number(e.target.value) || 0) })}
      />
    ),
  };
}

function textCell(
  header: string,
  key: "shotVelocityKmh" | "saves" | "shotsFaced",
  patch: (code: string, changes: Partial<SheetLine>) => void,
  width: number,
): Column<SheetLine> {
  return {
    key,
    header,
    align: "right",
    render: (l) => (
      <input
        type="number"
        min={0}
        style={{ ...inputStyle, width, padding: "4px 6px", textAlign: "right" }}
        value={l[key]}
        onChange={(e) => patch(l.athleteCode, { [key]: e.target.value })}
      />
    ),
  };
}

/** NRHL-SCR-2026-011 after -010, so the coach never types a collision. */
function nextScrimmageId(data: LeaguePayload): string {
  const year = new Date().getFullYear();
  const prefix = `NRHL-SCR-${year}-`;
  const highest = data.scrimmages
    .map((s) => (s.scrimmage_id.startsWith(prefix) ? Number(s.scrimmage_id.slice(prefix.length)) : 0))
    .reduce((a, b) => Math.max(a, Number.isFinite(b) ? b : 0), 0);
  return `${prefix}${String(highest + 1).padStart(3, "0")}`;
}
