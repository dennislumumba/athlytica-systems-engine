// =====================================================================
// PARENT PORTAL READ SURFACE — GET /api/v1/portal
//
// Everything a signed-in parent is allowed to see, in one request. The
// set of athletes is DERIVED from the verified session
// (lib/auth/guardian.ts); this route accepts no athlete identifier from
// the client at all, so there is no parameter to tamper with in order to
// reach another family's child.
//
// READ-ONLY BY CONSTRUCTION — no POST/PATCH. Attendance, coach notes and
// assessments are written by coaches through a separate surface; a
// parent-facing route that could write is a parent-facing route that can
// be made to write.
//
// PANELS DEGRADE INDEPENDENTLY (same posture as the workspace
// dashboard): a missing or broken table empties one section rather than
// 500-ing a parent's whole portal.
//
// EMPTY IS A REAL ANSWER. Sessions, progress, coach notes, documents and
// achievements have no recorded data for most athletes yet. They come
// back empty and the UI says so. Nothing here fabricates a milestone to
// fill a panel (§25, §32, §43, §63).
// =====================================================================

import { NextRequest, NextResponse } from "next/server";
import { adminClient, serviceRoleConfigured } from "@/lib/auth/workspace";
import { resolveGuardian, type GuardianAthlete } from "@/lib/auth/guardian";
import { nextSession, progressState, type CohortSlot } from "@/lib/services/bigice-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

async function safeRows(
  run: () => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  try {
    const { data, error } = await run();
    if (error || !Array.isArray(data)) return [];
    return data as Row[];
  } catch {
    return [];
  }
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export async function GET(request: NextRequest) {
  if (!serviceRoleConfigured()) {
    return NextResponse.json(
      {
        success: false,
        status: "CONFIG_DEBT",
        error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not provisioned.",
      },
      { status: 503 },
    );
  }

  const guardian = await resolveGuardian(request);
  if (!guardian) {
    return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });
  }

  // A signed-in address with no linked athlete is a legitimate state,
  // not an error — it is what a parent sees before activation.
  if (guardian.athletes.length === 0) {
    return NextResponse.json({
      success: true,
      guardian: { email: guardian.email, name: guardian.guardianName },
      athletes: [],
      unlinked: true,
    });
  }

  const db = adminClient();
  const codes = guardian.athletes.map((a) => a.biifCode);
  const passportIds = guardian.athletes
    .map((a) => a.passportAthleteId)
    .filter((id): id is string => Boolean(id));

  const enrollmentRows = await safeRows(() =>
    db
      .from("bigice_enrollment")
      .select(
        "enrollment_id, biif_code, programme_label, discipline, amount_kes, status, coach_name, location, starts_on, ends_on, created_at",
      )
      .in("biif_code", codes)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false }),
  );

  // Only fetched when at least one athlete bridges to the passport plane
  // the cohort schedule keys on — otherwise it is a guaranteed-empty query.
  const scheduleRows = passportIds.length
    ? await safeRows(() =>
        db
          .from("cohort_session_registry")
          .select(
            "student_athlete_id, cohort_label, track_type, session_day_of_week, window_start_time, window_end_time, season_start_date, season_end_date",
          )
          .in("student_athlete_id", passportIds)
          .eq("enrollment_status", "enrolled"),
      )
    : [];

  // content_html is deliberately not selected: this is a list, and a
  // list endpoint that carries document bodies is one that leaks them by
  // volume. The body comes from /api/v1/portal/document/<id>.
  const documentRows = await safeRows(() =>
    db
      .from("bigice_document")
      .select("document_id, biif_code, slug, title, template_version, issued_at")
      .in("biif_code", codes)
      .order("issued_at", { ascending: false }),
  );

  const now = new Date();

  const athletes = guardian.athletes.map((athlete: GuardianAthlete) => {
    const enrollments = enrollmentRows
      .filter((r) => r.biif_code === athlete.biifCode)
      .map((r) => ({
        enrollmentId: String(r.enrollment_id),
        programmeLabel: str(r.programme_label) ?? "Programme",
        discipline: str(r.discipline),
        amountKes: r.amount_kes === null ? null : Number(r.amount_kes),
        status: String(r.status),
        coachName: str(r.coach_name),
        location: str(r.location),
        startsOn: str(r.starts_on),
        endsOn: str(r.ends_on),
      }));

    const slots: CohortSlot[] = scheduleRows
      .filter((r) => athlete.passportAthleteId && r.student_athlete_id === athlete.passportAthleteId)
      .map((r) => ({
        cohortLabel: str(r.cohort_label) ?? "Cohort",
        trackType: str(r.track_type),
        sessionDayOfWeek:
          typeof r.session_day_of_week === "number" ? r.session_day_of_week : null,
        windowStartTime: str(r.window_start_time),
        windowEndTime: str(r.window_end_time),
        seasonStartDate: str(r.season_start_date),
        seasonEndDate: str(r.season_end_date),
      }));

    return {
      ...athlete,
      currentEnrollment: enrollments.find((e) => e.status === "ACTIVE") ?? null,
      enrollments,
      nextSession: nextSession(slots, now),

      // Nothing writes these yet. They are present and empty so the
      // client renders "not recorded yet" from real absence rather than
      // from a missing key it might mistake for a loading state.
      progress: { state: progressState(0), metrics: [] as never[] },
      sessionHistory: [] as never[],
      coachNotes: [] as never[],
      achievements: [] as never[],

      documents: documentRows
        .filter((r) => r.biif_code === athlete.biifCode)
        .map((r) => ({
          documentId: String(r.document_id),
          title: str(r.title) ?? "Document",
          slug: str(r.slug),
          version: str(r.template_version),
          issuedAt: str(r.issued_at),
        })),
    };
  });

  return NextResponse.json({
    success: true,
    guardian: { email: guardian.email, name: guardian.guardianName },
    athletes,
  });
}
