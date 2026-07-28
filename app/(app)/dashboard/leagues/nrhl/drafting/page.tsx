"use client";

// =====================================================================
// TAB 5 — DRAFTING & TEAM RE-SHUFFLING
//
// The legacy problem: ten scrimmages, every side labelled the literal
// "Team A" / "Team B", reassigned weekly — one athlete played Team A in
// four and Team B in eight. No persistent team entity ever existed, so
// standings were uncomputable. This board is where that stops: drag an
// athlete into a squad, balance the two rosters by composite index, and
// lock.
//
// Drag and drop is the native HTML5 API. A drag library for six columns
// of text cards would be a dependency doing what the platform already
// does, and the click-to-move fallback below keeps it keyboard-usable.
// =====================================================================

import { useMemo, useState } from "react";
import {
  ActionButton,
  LeagueGate,
  Notice,
  fmt,
  inputStyle,
  useLeague,
  type LeagueAthlete,
  type LeaguePayload,
} from "@/components/workspace/nrhl-league";
import { Badge, Panel, Stat, StatRow, selectStyle, theme } from "@/components/workspace/ui";

const POOL = "__pool__";

export default function DraftingTab() {
  return <LeagueGate>{(data) => <Drafting data={data} />}</LeagueGate>;
}

function Drafting({ data }: { data: LeaguePayload }) {
  const { act } = useLeague();

  const indexOf = useMemo(
    () => new Map(data.leaderboard.map((r) => [r.athleteCode, r.compositeIndex])),
    [data.leaderboard],
  );

  const initialSquads = useMemo(() => {
    const named = [...new Set(data.athletes.map((a) => a.team).filter((t): t is string => Boolean(t)))];
    return named.length > 0 ? named : ["Team A", "Team B"];
  }, [data.athletes]);

  const [squads, setSquads] = useState<string[]>(initialSquads);
  const [assignment, setAssignment] = useState<Record<string, string>>(() =>
    Object.fromEntries(data.athletes.map((a) => [a.athlete_code, a.team ?? POOL])),
  );
  const [newSquad, setNewSquad] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  const locked = data.athletes.filter((a) => a.draft_locked_at).length;
  const byCode = useMemo(
    () => new Map(data.athletes.map((a) => [a.athlete_code, a])),
    [data.athletes],
  );

  const membersOf = (squad: string) =>
    data.athletes
      .filter((a) => (assignment[a.athlete_code] ?? POOL) === squad)
      .sort((a, b) => (indexOf.get(b.athlete_code) ?? -1) - (indexOf.get(a.athlete_code) ?? -1));

  const move = (code: string, squad: string) =>
    setAssignment((prev) => ({ ...prev, [code]: squad }));

  const balance = (squad: string) => {
    const values = membersOf(squad)
      .map((a) => indexOf.get(a.athlete_code))
      .filter((v): v is number => v !== null && v !== undefined);
    return {
      mean: values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null,
      rated: values.length,
      size: membersOf(squad).length,
    };
  };

  const spread = () => {
    const means = squads.map((s) => balance(s).mean).filter((v): v is number => v !== null);
    return means.length < 2 ? null : Math.round((Math.max(...means) - Math.min(...means)) * 10) / 10;
  };

  /**
   * Serpentine auto-balance: sort by composite index, then snake through
   * the squads. It is the standard fair-draft heuristic and gets two
   * squads within a point or two of each other on this cohort — the
   * coach still moves people afterwards, which is the whole point of the
   * board.
   */
  const autoBalance = () => {
    const ranked = [...data.athletes]
      .filter((a) => !a.draft_locked_at)
      .sort((a, b) => (indexOf.get(b.athlete_code) ?? -1) - (indexOf.get(a.athlete_code) ?? -1));
    const next: Record<string, string> = { ...assignment };
    ranked.forEach((a, i) => {
      const round = Math.floor(i / squads.length);
      const slot = i % squads.length;
      next[a.athlete_code] = squads[round % 2 === 0 ? slot : squads.length - 1 - slot]!;
    });
    setAssignment(next);
    setNotice({ text: "Serpentine draft applied — review and adjust before locking.", tone: "good" });
  };

  const commit = async (lock: boolean) => {
    const assignments = Object.entries(assignment)
      .filter(([, squad]) => squad !== POOL)
      .map(([athleteCode, team]) => ({ athleteCode, team }));
    if (assignments.length === 0) {
      setNotice({ text: "Nothing to commit — no athlete is assigned to a squad.", tone: "bad" });
      return;
    }
    setBusy(true);
    const res = await act({ action: "commit-draft", assignments, lock });
    setBusy(false);
    setNotice(
      res.success
        ? { text: `${assignments.length} roster assignments pushed${lock ? " and locked" : ""}.`, tone: "good" }
        : { text: res.error ?? "Commit failed.", tone: "bad" },
    );
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Panel
        title="Balance calculator"
        subtitle="Mean Athlytica Composite Index per squad. The index is a cohort-relative blend of points per game, speed band, technical precision and attendance — not the certificate composite, which needs a coach grade the legacy extract does not carry."
      >
        <StatRow>
          {squads.map((squad) => {
            const b = balance(squad);
            return (
              <Stat
                key={squad}
                label={squad}
                value={b.mean === null ? "—" : b.mean}
                hint={`${b.size} athletes · ${b.rated} rated`}
              />
            );
          })}
          <Stat
            label="Spread"
            value={spread() === null ? "—" : spread()!}
            tone={spread() === null ? "neutral" : spread()! <= 3 ? "good" : spread()! <= 8 ? "warn" : "bad"}
            hint="max − min mean index"
          />
          <Stat label="Unassigned" value={membersOf(POOL).length} tone={membersOf(POOL).length > 0 ? "warn" : "good"} />
        </StatRow>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: theme.dim, lineHeight: 1.7 }}>
          Weights:{" "}
          {Object.entries(data.indexWeights)
            .map(([k, v]) => `${k} ${Math.round(v * 100)}%`)
            .join(" · ")}
          . Athletes with no measurement at all show as unrated and do not move a squad's mean —
          they are a capture gap, not a weak player.
        </p>
      </Panel>

      <Panel
        title="Drafting board"
        subtitle="Drag an athlete between columns, or use the squad dropdown on the card. Nothing is written until you commit."
        actions={
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input
              style={{ ...inputStyle, width: 150 }}
              placeholder="New squad name"
              value={newSquad}
              onChange={(e) => setNewSquad(e.target.value)}
            />
            <ActionButton
              onClick={() => {
                const name = newSquad.trim();
                if (name && !squads.includes(name)) setSquads([...squads, name]);
                setNewSquad("");
              }}
              disabled={!newSquad.trim() || squads.includes(newSquad.trim())}
            >
              Add squad
            </ActionButton>
            <ActionButton onClick={autoBalance}>Auto-balance</ActionButton>
          </div>
        }
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: `repeat(auto-fit, minmax(230px, 1fr))`,
            alignItems: "start",
          }}
        >
          {[POOL, ...squads].map((squad) => {
            const b = balance(squad);
            return (
              <div
                key={squad}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragging) move(dragging, squad);
                  setDragging(null);
                }}
                style={{
                  background: squad === POOL ? theme.bg : theme.panelAlt,
                  border: `1px solid ${dragging ? theme.accent : theme.border}`,
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 140,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <strong style={{ fontSize: 13 }}>{squad === POOL ? "Undrafted pool" : squad}</strong>
                  <span style={{ fontSize: 11.5, color: theme.dim }}>
                    {b.size}
                    {squad !== POOL && b.mean !== null ? ` · idx ${b.mean}` : ""}
                  </span>
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  {membersOf(squad).map((a) => (
                    <AthleteCard
                      key={a.athlete_code}
                      athlete={a}
                      index={indexOf.get(a.athlete_code) ?? null}
                      squads={squads}
                      current={squad}
                      onDragStart={() => setDragging(a.athlete_code)}
                      onDragEnd={() => setDragging(null)}
                      onMove={(target) => move(a.athlete_code, target)}
                    />
                  ))}
                  {membersOf(squad).length === 0 && (
                    <p style={{ margin: 0, fontSize: 12, color: theme.dim, padding: "10px 2px" }}>
                      {squad === POOL ? "Everyone is drafted." : "Drop athletes here."}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel
        title="Roster finaliser"
        subtitle="Commit pushes squad assignments to the league registry, which is what makes standings computable. Locking additionally freezes division and squad edits on the Roster tab."
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <ActionButton onClick={() => void commit(false)} disabled={busy}>
              Save assignments
            </ActionButton>
            <ActionButton onClick={() => void commit(true)} tone="primary" disabled={busy}>
              {busy ? "Working…" : "Lock draft"}
            </ActionButton>
          </div>
        }
      >
        <StatRow>
          <Stat label="Assigned" value={Object.values(assignment).filter((s) => s !== POOL).length} />
          <Stat label="Squads" value={squads.length} />
          <Stat label="Currently locked" value={locked} tone={locked > 0 ? "warn" : "neutral"} />
          <Stat
            label="Draft window"
            value="Nov – Dec 2026"
            hint="Phase 2 · roster assignment"
          />
        </StatRow>
        {locked > 0 && (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: theme.warn }}>
            {locked} athletes are locked. Saving assignments without locking clears the lock on every
            athlete in this commit — do that deliberately, not to fix a typo.
          </p>
        )}
        <Notice text={notice?.text ?? null} tone={notice?.tone ?? "good"} />
      </Panel>
    </div>
  );
}

function AthleteCard({
  athlete,
  index,
  squads,
  current,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  athlete: LeagueAthlete;
  index: number | null;
  squads: string[];
  current: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (squad: string) => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        background: theme.panel,
        border: `1px solid ${theme.border}`,
        borderRadius: 8,
        padding: "8px 10px",
        cursor: "grab",
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 12.5 }}>{athlete.display_name}</span>
        <strong
          style={{
            fontSize: 12.5,
            color: index === null ? theme.dim : index >= 70 ? theme.good : theme.text,
            whiteSpace: "nowrap",
          }}
        >
          {index === null ? "unrated" : fmt.num(index, 1)}
        </strong>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, color: theme.dim }}>{athlete.athlete_code}</span>
        {athlete.draft_locked_at && <Badge tone="warn">locked</Badge>}
        {athlete.line_assignment && <Badge>{athlete.line_assignment}</Badge>}
      </div>
      <select
        style={{ ...selectStyle, padding: "3px 6px", fontSize: 11.5 }}
        value={current}
        onChange={(e) => onMove(e.target.value)}
        aria-label={`Squad for ${athlete.display_name}`}
      >
        <option value={POOL}>Undrafted pool</option>
        {squads.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}
