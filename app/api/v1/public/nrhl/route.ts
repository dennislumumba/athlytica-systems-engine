// =====================================================================
// PUBLIC NRHL FEED — GET /api/v1/public/nrhl
//
// The read surface nairobihockey.com embeds: standings, leaderboard,
// season phases, and the live tier prices. Unauthenticated by design;
// CORS-open because the consumer is a static site on another origin.
//
// PRIVACY RULE — this is the part that matters, because these are
// minors. The Performance Agreement (§3.2 media release) makes the
// marketing election an explicit binary that is never defaulted. So:
//
//   consent_media = 'GRANTS'  -> full name published
//   anything else             -> the athlete's ROW still appears (their
//                                results are part of the standings) but
//                                the name is replaced with their code
//
// Nothing else crosses the boundary: no guardian name, phone, email,
// date of birth, or conduct record. Those live behind the workspace
// gate and stay there.
//
// Cached for 5 minutes at the edge — standings change on matchday, not
// on page view, and an uncached public endpoint is a free load generator.
// =====================================================================

import { NextResponse } from "next/server";
import { adminClient, serviceRoleConfigured } from "@/lib/auth/workspace";
import { DIVISIONS } from "@/lib/validation/nrhl-schemas";
import { buildStandings } from "@/lib/services/nrhl-etl";
import { REGISTRATION_TIERS } from "@/config/registration-fees";
import { LEAGUE_PHASES } from "@/app/api/v1/leagues/nrhl/route";

export const runtime = "nodejs";
export const revalidate = 300;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const numOrNull = (v: unknown): number | null =>
  v === null || v === undefined || v === "" ? null : Number(v);

/** Public display name, honouring the media-consent election. */
const publicName = (row: { display_name: unknown; consent_media: unknown; athlete_code: unknown }) =>
  row.consent_media === "GRANTS" ? String(row.display_name) : `Athlete ${String(row.athlete_code)}`;

export async function GET() {
  const empty = {
    success: true,
    standings: [],
    leaderboard: [],
    divisions: DIVISIONS,
    phases: LEAGUE_PHASES,
    tiers: publicTiers(),
    scoringRule: "3 × assisted goals + 1 × solo goal + 1 × assist",
    updatedAt: new Date().toISOString(),
  };

  if (!serviceRoleConfigured()) {
    // A public widget must degrade to "no data yet", never to a 500 on
    // someone else's homepage.
    return NextResponse.json(empty, { headers: CORS });
  }

  const db = adminClient();
  const [athletesRes, scrimmagesRes, linesRes] = await Promise.all([
    db
      .from("nrhl_athlete")
      .select(
        "athlete_code, display_name, consent_media, division, team, games_played, legacy_points, certificate_tier",
      ),
    db.from("nrhl_scrimmage").select("division, team_a, team_b, score_a, score_b, decided_in_overtime"),
    db.from("nrhl_stat_line").select("athlete_code, assisted_goals, solo_goals, assists, points, saves, shots_faced"),
  ]);

  if (athletesRes.error || scrimmagesRes.error || linesRes.error) {
    return NextResponse.json(empty, { headers: CORS });
  }

  const standings = buildStandings(
    (scrimmagesRes.data ?? []).map((s) => ({
      division: typeof s.division === "string" ? s.division : null,
      teamA: String(s.team_a),
      teamB: String(s.team_b),
      scoreA: numOrNull(s.score_a),
      scoreB: numOrNull(s.score_b),
      decidedInOvertime: Boolean(s.decided_in_overtime),
    })),
  );

  const totals = new Map<
    string,
    { gp: number; assisted: number; solo: number; assists: number; points: number; saves: number; shots: number }
  >();
  for (const l of linesRes.data ?? []) {
    const code = String(l.athlete_code);
    const b = totals.get(code) ?? { gp: 0, assisted: 0, solo: 0, assists: 0, points: 0, saves: 0, shots: 0 };
    b.gp += 1;
    b.assisted += num(l.assisted_goals);
    b.solo += num(l.solo_goals);
    b.assists += num(l.assists);
    b.points += num(l.points);
    b.saves += num(l.saves);
    b.shots += num(l.shots_faced);
    totals.set(code, b);
  }

  const leaderboard = (athletesRes.data ?? [])
    .map((a) => {
      const live = totals.get(String(a.athlete_code));
      return {
        athleteCode: String(a.athlete_code),
        name: publicName(a),
        division: typeof a.division === "string" ? a.division : null,
        team: typeof a.team === "string" ? a.team : null,
        gamesPlayed: live?.gp ?? numOrNull(a.games_played) ?? 0,
        goals: live ? live.assisted + live.solo : null,
        assistedGoals: live?.assisted ?? null,
        soloGoals: live?.solo ?? null,
        assists: live?.assists ?? null,
        points: live?.points ?? numOrNull(a.legacy_points) ?? 0,
        savePct: live && live.shots > 0 ? Math.round((live.saves / live.shots) * 1000) / 10 : null,
        certificateTier: typeof a.certificate_tier === "string" ? a.certificate_tier : null,
      };
    })
    .sort((x, y) => y.points - x.points)
    .slice(0, 25);

  return NextResponse.json(
    { ...empty, standings, leaderboard, updatedAt: new Date().toISOString() },
    { headers: CORS },
  );
}

/**
 * The three programmes the public site sells. Names, prices and session
 * counts are the ones nairobihockey.com publishes — a public feed that
 * describes a different product than the page quoting it is worse than
 * no feed. Prices are read from the server-side tier table so this can
 * never advertise a figure the checkout will not charge.
 */
function publicTiers() {
  return [
    {
      id: "baseline_7500",
      name: "Athlete Performance Assessment",
      amountKes: REGISTRATION_TIERS.baseline_7500.amountKes,
      includes: [
        "One 90-minute assessment session",
        "Digital Athlete Performance Profile with baseline measurements",
        "Recommended development priorities",
        "Fee credited toward Performance or Elite if you enrol within 30 days",
      ],
    },
    {
      id: "combine_27500",
      name: "Performance Hockey Program",
      amountKes: REGISTRATION_TIERS.combine_27500.amountKes,
      includes: [
        "9 group training sessions of 120 minutes",
        "3 showcase scrimmages of 120 minutes",
        "The 90-minute assessment",
        "Training groups of approximately 3–8 athletes per coach",
        "Facility fees and end-of-phase progress review included",
      ],
    },
    {
      id: "acceleration_45000",
      name: "Elite Individual Development",
      amountKes: REGISTRATION_TIERS.acceleration_45000.amountKes,
      includes: [
        "Everything in the Performance Hockey Program",
        "12 private coaching sessions of 90 minutes",
        "Movement and video review where appropriate",
        "43.5 hours of scheduled programme exposure across the phase",
      ],
    },
  ];
}
