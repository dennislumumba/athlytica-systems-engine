// =====================================================================
// NRHL LEGACY INGEST — POST /api/v1/leagues/nrhl/ingest
//
// Backfills the recovered legacy corpus (10 scrimmages, 31 athletes)
// into the league plane. Gated to GLOBAL_FOUNDER / HEAD_COACH in the
// nrhl workspace; every read and write runs service-role behind that
// gate, same posture as /api/v1/workspace/dashboard.
//
// Body (all optional):
//   { scrimmagesCsv?: string, athleteStatsCsv?: string, dryRun?: boolean }
//
// With no CSV supplied the route falls back to the extract committed at
// core-engine/schemas/seed/nrhl_legacy/. That read is best-effort — a
// serverless bundle may not carry the file — so the dashboard uploads
// the text and the disk path is only a local convenience.
//
// IDEMPOTENT: athletes key on display_name, scrimmages on scrimmage_id,
// metrics on (athlete, metric, source, scrimmage). Re-running updates in
// place and never mints a second code for the same human.
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient, requireWorkspaceRole } from "@/lib/auth/workspace";
import { ingestRequestSchema } from "@/lib/validation/nrhl-schemas";
import {
  COMPOSITE_FORMULA_VERSION,
  POINT_FORMULA_VERSION,
  buildIngestReport,
  certificateTiers,
  compositeScore,
} from "@/lib/services/nrhl-etl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEED_DIR = join(process.cwd(), "core-engine", "schemas", "seed", "nrhl_legacy");

function seedCsv(file: string): string | null {
  try {
    return readFileSync(join(SEED_DIR, file), "utf8");
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireWorkspaceRole(request, "nrhl", ["GLOBAL_FOUNDER", "HEAD_COACH"]);
  if ("denied" in gate) return gate.denied;

  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ success: false, error: "Malformed JSON body." }, { status: 400 });
  }

  const parsed = ingestRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid request.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const scrimmagesCsv = parsed.data.scrimmagesCsv ?? seedCsv("legacy_scrimmages.csv");
  const athleteStatsCsv = parsed.data.athleteStatsCsv ?? seedCsv("athlete_individual_stats.csv");
  if (!scrimmagesCsv || !athleteStatsCsv) {
    return NextResponse.json(
      {
        success: false,
        error:
          "No CSV supplied and the committed legacy extract is not readable from this runtime. " +
          "Send { scrimmagesCsv, athleteStatsCsv } in the body.",
      },
      { status: 422 },
    );
  }

  let report: ReturnType<typeof buildIngestReport>;
  try {
    report = buildIngestReport(scrimmagesCsv, athleteStatsCsv);
  } catch (err) {
    return NextResponse.json(
      { success: false, error: `CSV rejected: ${(err as Error).message}` },
      { status: 422 },
    );
  }

  if (parsed.data.dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      formulas: { points: POINT_FORMULA_VERSION, composite: COMPOSITE_FORMULA_VERSION },
      summary: summarise(report),
      warnings: report.warnings,
      excluded: report.excluded,
      identityResolutions: report.athletes
        .filter((a) => a.identityNote)
        .map((a) => ({ athlete: a.canonicalName, code: a.assignedCode, note: a.identityNote })),
    });
  }

  const db = adminClient();

  // ------------------------------------------------------------- matches
  const scrimmageRows = report.scrimmages.map((s) => ({
    scrimmage_id: s.scrimmage_id,
    played_on: s.isoDate,
    discipline: s.discipline,
    division: s.division,
    team_a: s.team_a,
    team_b: s.team_b,
    score_a: s.score_team_a,
    score_b: s.score_team_b,
    venue: s.venue,
    attendance_count: s.attendance_count,
    source: "legacy_csv",
  }));
  const { error: scrimmageError } = await db
    .from("nrhl_scrimmage")
    .upsert(scrimmageRows, { onConflict: "scrimmage_id" });
  if (scrimmageError) {
    return NextResponse.json({ success: false, error: scrimmageError.message }, { status: 500 });
  }

  // ------------------------------------------------------------ athletes
  const { data: existing, error: existingError } = await db
    .from("nrhl_athlete")
    .select("athlete_code, display_name");
  if (existingError) {
    return NextResponse.json({ success: false, error: existingError.message }, { status: 500 });
  }
  const codeByName = new Map<string, string>(
    (existing ?? []).map((r) => [String(r.display_name), String(r.athlete_code)]),
  );

  const minted: { athlete: string; code: string }[] = [];
  const athleteRows: Record<string, unknown>[] = [];

  for (const a of report.athletes) {
    let code = codeByName.get(a.canonicalName) ?? a.assignedCode;
    if (!code) {
      const { data: next, error: seqError } = await db.rpc("nrhl_next_athlete_code");
      if (seqError || typeof next !== "string") {
        return NextResponse.json(
          { success: false, error: seqError?.message ?? "Athlete code sequence unavailable." },
          { status: 500 },
        );
      }
      code = next.trim();
      minted.push({ athlete: a.canonicalName, code });
    }
    codeByName.set(a.canonicalName, code);

    athleteRows.push({
      athlete_code: code,
      legacy_code: a.legacyCode,
      display_name: a.canonicalName,
      primary_discipline: a.row.primary_discipline,
      games_played: a.row.games_played,
      attendance_rate_pct: a.row.attendance_rate_pct,
      coach_grade_avg: a.row.coach_grade,
      speed_rating: a.row.speed_rating,
      technical_rating: a.row.technical_rating,
      conduct_cases: a.metrics.find((m) => m.metricCode === "CONDUCT_CASES")?.value ?? 0,
      legacy_points: a.recomputedPoints,
      composite_score: compositeScore({
        attendanceRatePct: a.row.attendance_rate_pct,
        coachGradeAvg: a.row.coach_grade,
        points: a.recomputedPoints,
      }),
      identity_note: a.identityNote,
      updated_at: new Date().toISOString(),
    });
  }

  const { error: athleteError } = await db
    .from("nrhl_athlete")
    .upsert(athleteRows, { onConflict: "display_name" });
  if (athleteError) {
    return NextResponse.json({ success: false, error: athleteError.message }, { status: 500 });
  }

  // ------------------------------------------------------ pillar backfill
  const metricRows = report.athletes.flatMap((a) =>
    a.metrics.map((m) => ({
      athlete_code: codeByName.get(a.canonicalName)!,
      scrimmage_id: null,
      metric_code: m.metricCode,
      pillar: m.pillar,
      metric_value: m.value,
      metric_unit: m.unit,
      scale_min: m.scaleMin,
      scale_max: m.scaleMax,
      captured_at: null,
      capture_confidence: 0, // rollup row: no date exists at source
      source_tab: "athlete_individual_stats.csv",
      formula_version: m.formulaVersion,
    })),
  );
  const { error: metricError } = await db
    .from("nrhl_metric")
    .upsert(metricRows, { onConflict: "athlete_code,metric_code,source_tab,scrimmage_id" });
  if (metricError) {
    return NextResponse.json({ success: false, error: metricError.message }, { status: 500 });
  }

  // -------------------------------------------------- certificate tiers
  // Segmented by discipline: the composite is not comparable across
  // them (dossier §2A.4) because the points term is structurally 0 for
  // non-scrimmage disciplines.
  const tiers = certificateTiers(
    report.athletes.map((a) => ({
      name: a.canonicalName,
      discipline: a.row.primary_discipline,
      composite: compositeScore({
        attendanceRatePct: a.row.attendance_rate_pct,
        coachGradeAvg: a.row.coach_grade,
        points: a.recomputedPoints,
      }),
    })),
  );
  for (const [name, tier] of tiers) {
    await db.from("nrhl_athlete").update({ certificate_tier: tier }).eq("display_name", name);
  }

  return NextResponse.json({
    success: true,
    formulas: { points: POINT_FORMULA_VERSION, composite: COMPOSITE_FORMULA_VERSION },
    summary: { ...summarise(report), metricsWritten: metricRows.length, codesMinted: minted },
    warnings: report.warnings,
    excluded: report.excluded,
    identityResolutions: report.athletes
      .filter((a) => a.identityNote)
      .map((a) => ({
        athlete: a.canonicalName,
        code: codeByName.get(a.canonicalName) ?? null,
        note: a.identityNote,
      })),
  });
}

function summarise(report: ReturnType<typeof buildIngestReport>) {
  return {
    scrimmages: report.scrimmages.length,
    scrimmagesWithScore: report.scrimmages.filter(
      (s) => s.score_team_a !== null && s.score_team_b !== null,
    ).length,
    athletes: report.athletes.length,
    excluded: report.excluded.length,
    standings: report.standings,
    pointsReconciled: report.athletes.filter((a) => a.split !== null).length,
  };
}
