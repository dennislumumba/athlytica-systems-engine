"use client";

// =====================================================================
// NRHL LEAGUE CLIENT — one fetch, six tabs.
//
// The provider lives in the league layout, which Next keeps mounted
// across the nested tab routes, so switching tabs re-renders from state
// instead of re-fetching. Every mutation goes through act(), which
// refetches on success — no optimistic local state to drift out of sync
// with the standings the server computes.
//
// Auth: the access token comes from the Supabase browser session
// directly rather than from WorkspaceProvider, so this module works on
// its own routes without widening the workspace context's surface.
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { supabaseClient } from "@/utils/supabaseClient";
import type { LeagueAction } from "@/lib/validation/nrhl-schemas";
import { theme } from "./ui";

// ---------------------------------------------------------------------
// Payload types — mirror of the GET response in app/api/v1/leagues/nrhl
// ---------------------------------------------------------------------

export interface LeagueAthlete {
  athlete_code: string;
  legacy_code: string | null;
  display_name: string;
  primary_discipline: string | null;
  division: string | null;
  team: string | null;
  line_assignment: string | null;
  draft_locked_at: string | null;
  age_tier: string | null;
  student_level: string | null;
  games_played: number | null;
  attendance_rate_pct: number | null;
  coach_grade_avg: number | null;
  speed_rating: number | null;
  technical_rating: number | null;
  conduct_cases: number;
  legacy_points: number | null;
  composite_score: number | null;
  certificate_tier: string | null;
  certificate_issued_at: string | null;
  passport_issued_at: string | null;
  guardian_name: string | null;
  guardian_email: string | null;
  guardian_phone_e164: string | null;
  guardian_verified_at: string | null;
  consent_media: string | null;
  identity_note: string | null;
  /** Bridges to athlytica_core once the athlete has the documents that plane requires. */
  core_athlete_id: string | null;
  core_parent_id: string | null;
}

export interface LeagueScrimmage {
  scrimmage_id: string;
  played_on: string | null;
  division: string | null;
  team_a: string;
  team_b: string;
  score_a: number | null;
  score_b: number | null;
  decided_in_overtime: boolean;
  venue: string | null;
  attendance_count: number | null;
  notes: string | null;
  source: string;
}

export interface LeagueStatLine {
  id: string;
  scrimmage_id: string;
  athlete_code: string;
  side: string | null;
  assisted_goals: number;
  solo_goals: number;
  assists: number;
  points: number;
  penalty_minutes: number;
  shot_velocity_kmh: number | null;
  saves: number | null;
  shots_faced: number | null;
  conduct_note: string | null;
}

export interface StandingRow {
  division: string;
  team: string;
  gp: number;
  w: number;
  otW: number;
  l: number;
  otL: number;
  d: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
}

export interface LeaderboardRow {
  athleteCode: string;
  name: string;
  division: string | null;
  team: string | null;
  liveGamesPlayed: number;
  assistedGoals: number | null;
  soloGoals: number | null;
  goals: number | null;
  assists: number | null;
  livePoints: number | null;
  penaltyMinutes: number;
  savePct: number | null;
  legacyGamesPlayed: number | null;
  legacyPoints: number | null;
  compositeScore: number | null;
  compositeIndex: number | null;
  certificateTier: string | null;
}

export interface LeaguePhase {
  id: string;
  name: string;
  start: string;
  end: string;
}

/**
 * Named rather than Record<string, number>: with noUncheckedIndexedAccess
 * an index signature makes every count `number | undefined`, which would
 * push a non-null assertion into every tile that reads one.
 */
export interface LeagueCounts {
  athletes: number;
  scrimmages: number;
  scrimmagesScored: number;
  divisions: number;
  certified: number;
  certificateEligible: number;
  passportsIssued: number;
  guardiansLinked: number;
  guardiansVerified: number;
  drafted: number;
  draftLocked: number;
}

export interface LeaguePayload {
  role: string;
  divisions: string[];
  phases: LeaguePhase[];
  standingsPoints: { win: number; otWin: number; otLoss: number; loss: number; draw: number };
  indexWeights: Record<string, number>;
  athletes: LeagueAthlete[];
  scrimmages: LeagueScrimmage[];
  statLines: LeagueStatLine[];
  standings: StandingRow[];
  leaderboard: LeaderboardRow[];
  coverage: Record<string, { metricCodes: string[]; measurements: number; athletes: number }>;
  counts: LeagueCounts;
}

// ---------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------

interface LeagueContextValue {
  data: LeaguePayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  act: (command: LeagueAction) => Promise<{ success: boolean; error?: string; body?: unknown }>;
  ingest: (body: {
    scrimmagesCsv?: string;
    athleteStatsCsv?: string;
    dryRun?: boolean;
  }) => Promise<{ success: boolean; error?: string; body?: unknown }>;
}

const LeagueContext = createContext<LeagueContextValue | null>(null);

export function useLeague(): LeagueContextValue {
  const ctx = useContext(LeagueContext);
  if (!ctx) throw new Error("useLeague must be used inside <LeagueProvider>.");
  return ctx;
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated.");
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LeaguePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authedFetch("/api/v1/leagues/nrhl")
      .then(async (res) => {
        const body = (await res.json()) as Partial<LeaguePayload> & {
          success?: boolean;
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setError(body.error ?? `Request failed (${res.status}).`);
        } else {
          setError(null);
          setData(body as LeaguePayload);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const send = useCallback(
    async (path: string, payload: unknown) => {
      try {
        const res = await authedFetch(path, { method: "POST", body: JSON.stringify(payload) });
        const body = (await res.json()) as { success?: boolean; error?: string };
        if (res.ok && body.success) {
          setNonce((n) => n + 1);
          return { success: true, body };
        }
        return { success: false, error: body.error ?? `Request failed (${res.status}).`, body };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
    [],
  );

  const value = useMemo<LeagueContextValue>(
    () => ({
      data,
      loading,
      error,
      refresh,
      act: (command) => send("/api/v1/leagues/nrhl", command),
      ingest: (body) => send("/api/v1/leagues/nrhl/ingest", body),
    }),
    [data, loading, error, refresh, send],
  );

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
}

/** Standard gate for a tab body: loading / error / empty are handled once. */
export function LeagueGate({ children }: { children: (data: LeaguePayload) => ReactNode }) {
  const { data, loading, error } = useLeague();
  if (error) {
    return (
      <p
        role="alert"
        style={{
          background: "#2c1520",
          border: "1px solid #7f2b45",
          borderRadius: 8,
          padding: "12px 14px",
          fontSize: 13,
          color: "#ffb3c6",
        }}
      >
        {error}
      </p>
    );
  }
  if (!data) {
    return <p style={{ color: theme.muted }}>{loading ? "Loading league data…" : "No league data."}</p>;
  }
  return <>{children(data)}</>;
}

// ---------------------------------------------------------------------
// Form primitives — the workspace ui.tsx set has no inputs, and six tabs
// need the same three.
// ---------------------------------------------------------------------

export const inputStyle: CSSProperties = {
  padding: "7px 9px",
  borderRadius: 8,
  border: `1px solid ${theme.border}`,
  background: theme.bg,
  color: theme.text,
  fontSize: 13,
  width: "100%",
  minWidth: 0,
};

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 12 }}>
      <span
        style={{
          color: theme.dim,
          fontSize: 10.5,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
      {hint && <span style={{ color: theme.dim, fontSize: 11 }}>{hint}</span>}
    </label>
  );
}

export function FormGrid({ children, min = 160 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        alignItems: "end",
      }}
    >
      {children}
    </div>
  );
}

export function ActionButton({
  children,
  onClick,
  tone = "neutral",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  tone?: "neutral" | "primary" | "danger";
  disabled?: boolean;
  title?: string;
}) {
  const accent = tone === "primary" ? theme.accent : tone === "danger" ? theme.bad : theme.border;
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        padding: "8px 13px",
        borderRadius: 8,
        border: `1px solid ${accent}`,
        background: tone === "primary" ? `${theme.accent}22` : theme.panelAlt,
        color: disabled ? theme.dim : tone === "danger" ? theme.bad : theme.text,
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/** Inline result line for a mutation. Errors persist; successes fade. */
export function Notice({ text, tone }: { text: string | null; tone: "good" | "bad" }) {
  if (!text) return null;
  return (
    <p
      style={{
        margin: "10px 0 0",
        fontSize: 12.5,
        color: tone === "good" ? theme.good : theme.bad,
      }}
    >
      {text}
    </p>
  );
}

export const fmt = {
  num: (v: number | null | undefined, dp = 1) =>
    v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(dp),
  int: (v: number | null | undefined) => (v === null || v === undefined ? "—" : String(v)),
  signed: (v: number | null | undefined) =>
    v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}`,
  date: (v: string | null | undefined) => (v ? v.slice(0, 10) : "—"),
};
