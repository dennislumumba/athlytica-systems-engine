// =====================================================================
// NRHL LEAGUE COMMAND CENTER API — /api/v1/leagues/nrhl
//
//   GET   -> the whole league payload (six tabs, one fetch). At 47
//            athletes and 10 matches this is a few KB; splitting it into
//            six endpoints would buy nothing but six round trips.
//   POST  -> one discriminated command union (see lib/validation).
//
// Gated to GLOBAL_FOUNDER / HEAD_COACH in the nrhl workspace. Reads run
// service-role behind that gate — the browser never touches these tables
// directly (migration 20260728120000 strips anon and authenticated).
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { adminClient, requireWorkspaceRole } from "@/lib/auth/workspace";
import { DIVISIONS, PILLARS, leagueActionSchema, type Pillar } from "@/lib/validation/nrhl-schemas";
import {
  COMPOSITE_INDEX_WEIGHTS,
  STANDINGS_POINTS,
  buildStandings,
  compositeIndex,
  type StandingRow,
} from "@/lib/services/nrhl-etl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Season plan — the dates every countdown and roadmap on the client reads. */
export const LEAGUE_PHASES = [
  {
    id: "combine",
    name: "Pre-Season Selection Combine & Skill Assessment",
    start: "2026-08-01",
    end: "2026-10-31",
  },
  { id: "draft", name: "Draft Lock & Roster Assignment", start: "2026-11-01", end: "2026-12-31" },
  { id: "launch", name: "Official League Launch — Season 1", start: "2027-01-01", end: "2027-06-30" },
] as const;

export async function GET(request: NextRequest) {
  const gate = await requireWorkspaceRole(request, "nrhl", ["GLOBAL_FOUNDER", "HEAD_COACH"]);
  if ("denied" in gate) return gate.denied;

  const db = adminClient();
  const [athletesRes, scrimmagesRes, statLinesRes, metricsRes] = await Promise.all([
    db.from("nrhl_athlete").select("*").order("display_name"),
    db.from("nrhl_scrimmage").select("*").order("played_on", { ascending: false, nullsFirst: false }),
    db.from("nrhl_stat_line").select("*"),
    db.from("nrhl_metric").select("athlete_code, metric_code, pillar, metric_value, metric_unit"),
  ]);

  // A missing table means the migration has not been applied yet. Say so
  // once, plainly, rather than rendering six empty tabs that look live.
  const firstError =
    athletesRes.error ?? scrimmagesRes.error ?? statLinesRes.error ?? metricsRes.error;
  if (firstError) {
    return NextResponse.json(
      {
        success: false,
        error: `League tables unavailable: ${firstError.message}. Apply supabase/migrations/20260728120000_nrhl_league.sql.`,
      },
      { status: 503 },
    );
  }

  const athletes = (athletesRes.data ?? []) as Row[];
  const scrimmages = (scrimmagesRes.data ?? []) as Row[];
  const statLines = (statLinesRes.data ?? []) as Row[];
  const metrics = (metricsRes.data ?? []) as Row[];

  // ------------------------------------------------------------ standings
  const standings: StandingRow[] = buildStandings(
    scrimmages.map((s) => ({
      division: str(s.division),
      teamA: String(s.team_a),
      teamB: String(s.team_b),
      scoreA: numOrNull(s.score_a),
      scoreB: numOrNull(s.score_b),
      decidedInOvertime: Boolean(s.decided_in_overtime),
    })),
  );

  // ---------------------------------------------------------- leaderboard
  const byAthlete = new Map<
    string,
    { gp: number; assisted: number; solo: number; assists: number; points: number; pim: number; saves: number; shotsFaced: number }
  >();
  for (const line of statLines) {
    const code = String(line.athlete_code);
    const bucket =
      byAthlete.get(code) ??
      { gp: 0, assisted: 0, solo: 0, assists: 0, points: 0, pim: 0, saves: 0, shotsFaced: 0 };
    bucket.gp += 1;
    bucket.assisted += num(line.assisted_goals);
    bucket.solo += num(line.solo_goals);
    bucket.assists += num(line.assists);
    bucket.points += num(line.points);
    bucket.pim += num(line.penalty_minutes);
    bucket.saves += num(line.saves);
    bucket.shotsFaced += num(line.shots_faced);
    byAthlete.set(code, bucket);
  }

  const indices = compositeIndex(
    athletes.map((a) => ({
      athleteCode: String(a.athlete_code),
      gamesPlayed: numOrNull(a.games_played),
      legacyPoints: numOrNull(a.legacy_points),
      speedRating: numOrNull(a.speed_rating),
      technicalRating: numOrNull(a.technical_rating),
      attendanceRatePct: numOrNull(a.attendance_rate_pct),
    })),
  );

  const leaderboard = athletes.map((a) => {
    const code = String(a.athlete_code);
    const live = byAthlete.get(code);
    return {
      athleteCode: code,
      name: String(a.display_name),
      division: str(a.division),
      team: str(a.team),
      // Live columns come from logged matchday sheets; the legacy pair is
      // the rollup CSV, which carries no assisted/solo split.
      liveGamesPlayed: live?.gp ?? 0,
      assistedGoals: live?.assisted ?? null,
      soloGoals: live?.solo ?? null,
      goals: live ? live.assisted + live.solo : null,
      assists: live?.assists ?? null,
      livePoints: live?.points ?? null,
      penaltyMinutes: live?.pim ?? 0,
      savePct:
        live && live.shotsFaced > 0 ? Math.round((live.saves / live.shotsFaced) * 1000) / 10 : null,
      legacyGamesPlayed: numOrNull(a.games_played),
      legacyPoints: numOrNull(a.legacy_points),
      compositeScore: numOrNull(a.composite_score),
      compositeIndex: indices.get(code) ?? null,
      certificateTier: str(a.certificate_tier),
    };
  });

  // ------------------------------------------------------ pillar coverage
  const coverage = Object.fromEntries(
    PILLARS.map((p: Pillar) => {
      const rows = metrics.filter((m) => m.pillar === p);
      return [
        p,
        {
          metricCodes: [...new Set(rows.map((m) => String(m.metric_code)))],
          measurements: rows.length,
          athletes: new Set(rows.map((m) => String(m.athlete_code))).size,
        },
      ];
    }),
  );

  return NextResponse.json({
    success: true,
    role: gate.role,
    divisions: DIVISIONS,
    phases: LEAGUE_PHASES,
    standingsPoints: STANDINGS_POINTS,
    indexWeights: COMPOSITE_INDEX_WEIGHTS,
    athletes,
    scrimmages,
    statLines,
    standings,
    leaderboard,
    coverage,
    counts: {
      athletes: athletes.length,
      scrimmages: scrimmages.length,
      scrimmagesScored: scrimmages.filter((s) => s.score_a !== null && s.score_b !== null).length,
      divisions: DIVISIONS.length,
      certified: athletes.filter((a) => a.certificate_issued_at).length,
      certificateEligible: athletes.filter((a) => a.certificate_tier).length,
      passportsIssued: athletes.filter((a) => a.passport_issued_at).length,
      guardiansLinked: athletes.filter((a) => a.guardian_phone_e164).length,
      guardiansVerified: athletes.filter((a) => a.guardian_verified_at).length,
      drafted: athletes.filter((a) => a.team).length,
      draftLocked: athletes.filter((a) => a.draft_locked_at).length,
    },
  });
}

// ---------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const gate = await requireWorkspaceRole(request, "nrhl", ["GLOBAL_FOUNDER", "HEAD_COACH"]);
  if ("denied" in gate) return gate.denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = leagueActionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid command.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const db = adminClient();
  const command = parsed.data;
  const now = new Date().toISOString();

  switch (command.action) {
    // ------------------------------------------------- matchday sheet
    case "log-match": {
      const { error: matchError } = await db.from("nrhl_scrimmage").upsert(
        {
          scrimmage_id: command.scrimmageId,
          played_on: command.playedOn ?? null,
          division: command.division ?? null,
          team_a: command.teamA,
          team_b: command.teamB,
          score_a: command.scoreA ?? null,
          score_b: command.scoreB ?? null,
          decided_in_overtime: command.decidedInOvertime,
          venue: command.venue ?? null,
          notes: command.notes ?? null,
          source: "matchday_sheet",
        },
        { onConflict: "scrimmage_id" },
      );
      if (matchError) return fail(matchError.message);

      if (command.statLines.length > 0) {
        // points is a GENERATED column — deliberately not sent. The
        // formula lives in the database and in the ETL, nowhere else.
        const { error: lineError } = await db.from("nrhl_stat_line").upsert(
          command.statLines.map((l) => ({
            scrimmage_id: command.scrimmageId,
            athlete_code: l.athleteCode,
            side: l.side ?? null,
            assisted_goals: l.assistedGoals,
            solo_goals: l.soloGoals,
            assists: l.assists,
            penalty_minutes: l.penaltyMinutes,
            shot_velocity_kmh: l.shotVelocityKmh ?? null,
            saves: l.saves ?? null,
            shots_faced: l.shotsFaced ?? null,
            conduct_note: l.conductNote ?? null,
            recorded_by: gate.actor.userId,
            recorded_at: now,
          })),
          { onConflict: "scrimmage_id,athlete_code" },
        );
        if (lineError) return fail(lineError.message);
      }
      return NextResponse.json({ success: true, scrimmageId: command.scrimmageId });
    }

    // -------------------------------------------------- roster editing
    case "update-athlete": {
      const p = command.patch;
      const patch: Record<string, unknown> = { updated_at: now };
      if (p.displayName !== undefined) patch.display_name = p.displayName;
      if (p.division !== undefined) patch.division = p.division;
      if (p.team !== undefined) patch.team = p.team;
      if (p.lineAssignment !== undefined) patch.line_assignment = p.lineAssignment;
      if (p.ageTier !== undefined) patch.age_tier = p.ageTier;
      if (p.studentLevel !== undefined) patch.student_level = p.studentLevel;
      if (p.guardianName !== undefined) patch.guardian_name = p.guardianName;
      if (p.guardianEmail !== undefined) patch.guardian_email = p.guardianEmail;
      if (p.guardianPhone !== undefined) {
        patch.guardian_phone_e164 = p.guardianPhone;
        // A changed number is an unverified number.
        patch.guardian_verified_at = null;
      }
      if (p.consentMedia !== undefined) {
        patch.consent_media = p.consentMedia;
        patch.consent_recorded_at = p.consentMedia ? now : null;
      }
      if (p.identityNote !== undefined) patch.identity_note = p.identityNote;

      const { error } = await db
        .from("nrhl_athlete")
        .update(patch)
        .eq("athlete_code", command.athleteCode);
      if (error) return fail(error.message);
      return NextResponse.json({ success: true, athleteCode: command.athleteCode });
    }

    // ------------------------------------------------------- draft lock
    case "commit-draft": {
      for (const a of command.assignments) {
        const { error } = await db
          .from("nrhl_athlete")
          .update({
            team: a.team,
            draft_locked_at: command.lock ? now : null,
            updated_at: now,
          })
          .eq("athlete_code", a.athleteCode);
        if (error) return fail(error.message);
      }
      return NextResponse.json({
        success: true,
        assigned: command.assignments.length,
        locked: command.lock,
      });
    }

    // -------------------------------------------------- batch issuing
    case "issue-documents": {
      const column =
        command.document === "certificate" ? "certificate_issued_at" : "passport_issued_at";
      // Certificates require a computed tier: issuing one to an athlete
      // with no composite would put an unearned award in a parent's hand.
      let query = db
        .from("nrhl_athlete")
        .update({ [column]: now, updated_at: now })
        .in("athlete_code", command.athleteCodes);
      if (command.document === "certificate") query = query.not("certificate_tier", "is", null);

      const { data, error } = await query.select("athlete_code");
      if (error) return fail(error.message);
      return NextResponse.json({
        success: true,
        issued: (data ?? []).map((r) => String(r.athlete_code)),
        skipped: command.athleteCodes.filter(
          (c) => !(data ?? []).some((r) => String(r.athlete_code) === c),
        ),
      });
    }

    // ------------------------------------------------ guardian verify
    case "verify-guardian": {
      const { error } = await db
        .from("nrhl_athlete")
        .update({ guardian_verified_at: command.verified ? now : null, updated_at: now })
        .eq("athlete_code", command.athleteCode);
      if (error) return fail(error.message);
      return NextResponse.json({ success: true });
    }
  }
}

const fail = (message: string) =>
  NextResponse.json({ success: false, error: message }, { status: 500 });
