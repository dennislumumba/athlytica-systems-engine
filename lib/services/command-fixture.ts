// =====================================================================
// COMMAND CANVAS FIXTURE — a synthetic but shape-accurate platform used
// by tests/command-metrics.test.mts and by /command-preview.
//
// Deliberately messy: duplicate identities, an estimated birth date, an
// out-of-range biometric, a buffered edge queue, a dead letter, two
// regions and one dormant hub. A fixture where everything is clean
// proves nothing about the anomaly engine.
//
// NOT production data and never served to an authenticated surface —
// the live canvas reads Postgres through the gated endpoint.
// =====================================================================

import type { CommandInput } from "./command-metrics.ts";

export const FIXTURE_NOW = new Date("2026-07-28T09:00:00.000Z");

const day = 86_400_000;
const iso = (offsetDays: number) => new Date(FIXTURE_NOW.getTime() - offsetDays * day).toISOString();
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10);

const KEN_CLUB = "c1000000-0000-4000-8000-000000000001";
const KEN_ACADEMY = "c1000000-0000-4000-8000-000000000002";
const UGA_CLUB = "c1000000-0000-4000-8000-000000000003";
const ZAF_CLUB = "c1000000-0000-4000-8000-000000000004";
const FED = "f1000000-0000-4000-8000-000000000001";
const TENANT_TTA = "77000001-0000-4000-8000-000000000001";
const TENANT_RINK = "77000001-0000-4000-8000-000000000009";

const A = (n: number) => `a1000000-0000-4000-8000-00000000000${n}`;
const P = (n: number) => `b1000000-0000-4000-8000-00000000000${n}`;

export const COMMAND_FIXTURE: CommandInput = {
  clubs: [
    { club_id: KEN_CLUB, name: "Big Ice Panari", country_code: "KEN", federation_id: FED, is_training_club: true },
    { club_id: KEN_ACADEMY, name: "TTA International Football Academy", country_code: "KEN", federation_id: null, is_training_club: true },
    { club_id: UGA_CLUB, name: "Kampala Inline Collective", country_code: "UGA", federation_id: null, is_training_club: true },
    { club_id: ZAF_CLUB, name: "Cape Town Ice Guild", country_code: "ZAF", federation_id: null, is_training_club: false },
  ],
  federations: [
    { federation_id: FED, name: "Nairobi Regional Hockey League", country_code: "KEN", sport_code: "inline_hockey" },
  ],
  tenants: [
    { id: TENANT_TTA, name: "TTA International Football Academy", created_at: iso(200) },
    { id: TENANT_RINK, name: "Panari Sky Centre Rink", created_at: iso(20) },
  ],
  venues: [
    { id: "v1", name: "TTA Main Pitch — Nairobi", tenant_id: TENANT_TTA },
    { id: "v2", name: "Panari Ice Rink", tenant_id: TENANT_RINK },
  ],
  athletes: [
    // Verified football cohort at the academy.
    { athlete_id: A(1), legal_name: "Brian Otieno", preferred_name: "Brian", date_of_birth: "2013-02-14", is_dob_estimated: false, is_legacy: false, national_id_hash: "id-hash-001", current_status: "active", primary_sport_code: "football", provenance_id: P(1), created_at: iso(180) },
    { athlete_id: A(2), legal_name: "Amani Wanjiru", preferred_name: "Amani", date_of_birth: "2015-05-02", is_dob_estimated: false, is_legacy: false, national_id_hash: "id-hash-002", current_status: "active", primary_sport_code: "football", provenance_id: P(2), created_at: iso(170) },
    { athlete_id: A(3), legal_name: "Neema Achieng", preferred_name: null, date_of_birth: "2006-09-19", is_dob_estimated: false, is_legacy: false, national_id_hash: "id-hash-003", current_status: "active", primary_sport_code: "football", provenance_id: P(3), created_at: iso(160) },
    // Hockey intake: duplicate identity pair, one with an estimated dob.
    { athlete_id: A(4), legal_name: "Samuel Kiprop", preferred_name: "Sam", date_of_birth: "2012-04-15", is_dob_estimated: false, is_legacy: true, national_id_hash: null, current_status: "active", primary_sport_code: "inline_hockey", provenance_id: P(4), created_at: iso(40) },
    { athlete_id: A(5), legal_name: "Samuel Kiprop", preferred_name: "Samuel K", date_of_birth: "2012-04-15", is_dob_estimated: true, is_legacy: true, national_id_hash: null, current_status: "active", primary_sport_code: "inline_hockey", provenance_id: P(5), created_at: iso(9) },
    // Reused identity document across two hubs.
    { athlete_id: A(6), legal_name: "Faith Nyambura", preferred_name: "Faith", date_of_birth: "2005-11-07", is_dob_estimated: false, is_legacy: false, national_id_hash: "id-hash-dup", current_status: "active", primary_sport_code: "inline_hockey", provenance_id: P(6), created_at: iso(30) },
    { athlete_id: A(7), legal_name: "Kevin Mutiso", preferred_name: "Kevin", date_of_birth: "2007-01-28", is_dob_estimated: false, is_legacy: false, national_id_hash: "id-hash-dup", current_status: "active", primary_sport_code: "inline_hockey", provenance_id: P(7), created_at: iso(28) },
    // Implausible birth date, no document, no guardian consent.
    { athlete_id: A(8), legal_name: "Test Athlete", preferred_name: null, date_of_birth: "1968-01-01", is_dob_estimated: false, is_legacy: true, national_id_hash: null, current_status: "active", primary_sport_code: "inline_hockey", provenance_id: P(8), created_at: iso(3) },
    // Clean intake: documented, consented, staged — the one row a founder
    // can promote with a single click.
    { athlete_id: A(9), legal_name: "Grace Wairimu", preferred_name: "Grace", date_of_birth: "2010-03-12", is_dob_estimated: false, is_legacy: false, national_id_hash: "id-hash-009", current_status: "active", primary_sport_code: "football", provenance_id: "b1000000-0000-4000-8000-000000000010", created_at: iso(2) },
  ],
  provenance: [
    { provenance_id: P(1), data_source: "club_official", entered_by_actor_id: "coach-1", entered_by_actor_role: "club_admin", entered_at: iso(180), verified_at: iso(175), verification_status: "verified", verification_method: "document_check", confidence_score: 0.95 },
    { provenance_id: P(2), data_source: "club_official", entered_by_actor_id: "coach-1", entered_by_actor_role: "club_admin", entered_at: iso(170), verified_at: iso(168), verification_status: "verified", verification_method: "document_check", confidence_score: 0.9 },
    { provenance_id: P(3), data_source: "video_verified", entered_by_actor_id: "coach-1", entered_by_actor_role: "club_admin", entered_at: iso(160), verified_at: iso(150), verification_status: "verified", verification_method: "witness_corroboration", confidence_score: 0.8 },
    { provenance_id: P(4), data_source: "club_official", entered_by_actor_id: "coach-2", entered_by_actor_role: "club_admin", entered_at: iso(40), verified_at: null, verification_status: "unverified", verification_method: "none", confidence_score: 0.6 },
    { provenance_id: P(5), data_source: "self_reported", entered_by_actor_id: "guardian-1", entered_by_actor_role: "guardian", entered_at: iso(9), verified_at: null, verification_status: "pending", verification_method: "none", confidence_score: 0.4 },
    { provenance_id: P(6), data_source: "club_official", entered_by_actor_id: "coach-2", entered_by_actor_role: "club_admin", entered_at: iso(30), verified_at: null, verification_status: "unverified", verification_method: "none", confidence_score: 0.55 },
    { provenance_id: P(7), data_source: "agent_submission", entered_by_actor_id: "agent-1", entered_by_actor_role: "agent", entered_at: iso(28), verified_at: null, verification_status: "disputed", verification_method: "none", confidence_score: 0.3 },
    { provenance_id: P(8), data_source: "self_reported", entered_by_actor_id: "ops-1", entered_by_actor_role: "athlytica_ops", entered_at: iso(3), verified_at: null, verification_status: "unverified", verification_method: "none", confidence_score: 0.2 },
    { provenance_id: P(9), data_source: "independent_clinic", entered_by_actor_id: "clinic-1", entered_by_actor_role: "clinician", entered_at: iso(6), verified_at: null, verification_status: "pending", verification_method: "none", confidence_score: 0.7 },
    { provenance_id: "b1000000-0000-4000-8000-000000000010", data_source: "federation_official", entered_by_actor_id: "coach-1", entered_by_actor_role: "federation_admin", entered_at: iso(2), verified_at: null, verification_status: "pending", verification_method: "none", confidence_score: 0.88 },
  ],
  custody: [
    { custody_id: "cu1", athlete_id: A(1), club_id: KEN_ACADEMY, federation_id: null, start_date: date(180), end_date: null },
    { custody_id: "cu2", athlete_id: A(2), club_id: KEN_ACADEMY, federation_id: null, start_date: date(170), end_date: null },
    { custody_id: "cu3", athlete_id: A(3), club_id: KEN_ACADEMY, federation_id: null, start_date: date(160), end_date: null },
    { custody_id: "cu4", athlete_id: A(4), club_id: KEN_CLUB, federation_id: null, start_date: date(40), end_date: null },
    { custody_id: "cu5", athlete_id: A(5), club_id: UGA_CLUB, federation_id: null, start_date: date(9), end_date: null },
    { custody_id: "cu6", athlete_id: A(6), club_id: KEN_CLUB, federation_id: null, start_date: date(30), end_date: null },
    { custody_id: "cu7", athlete_id: A(7), club_id: ZAF_CLUB, federation_id: null, start_date: date(28), end_date: null },
    { custody_id: "cu8", athlete_id: A(9), club_id: KEN_ACADEMY, federation_id: null, start_date: date(2), end_date: null },
  ],
  links: [
    { athlete_id: A(1), tenant_id: TENANT_TTA },
    { athlete_id: A(2), tenant_id: TENANT_TTA },
    { athlete_id: A(3), tenant_id: TENANT_TTA },
    { athlete_id: A(8), tenant_id: TENANT_RINK },
  ],
  sessions: [
    { id: "s1", athlete_id: A(1), venue_id: "v1", start_time: iso(2) },
    { id: "s2", athlete_id: A(1), venue_id: "v1", start_time: iso(16) },
    { id: "s3", athlete_id: A(2), venue_id: "v1", start_time: iso(5) },
    { id: "s4", athlete_id: A(3), venue_id: "v1", start_time: iso(45) },
    { id: "s5", athlete_id: A(4), venue_id: "v2", start_time: iso(8) },
    { id: "s6", athlete_id: A(6), venue_id: "v2", start_time: iso(120) },
  ],
  performance: [
    { id: "p1", athlete_id: A(1), session_id: "s2", speed: 60, agility: 58, stamina: 62, technical: 64, cognitive: 55, composite_score: 59.8, tenant_id: TENANT_TTA, venue_verified: true, created_at: iso(16) },
    { id: "p2", athlete_id: A(1), session_id: "s1", speed: 68, agility: 66, stamina: 70, technical: 72, cognitive: 63, composite_score: 67.8, tenant_id: TENANT_TTA, venue_verified: true, created_at: iso(2) },
    { id: "p3", athlete_id: A(2), session_id: "s3", speed: 44, agility: 46, stamina: 41, technical: 39, cognitive: 43, composite_score: 42.6, tenant_id: TENANT_TTA, venue_verified: true, created_at: iso(5) },
    { id: "p4", athlete_id: A(3), session_id: "s4", speed: 80, agility: 78, stamina: 83, technical: 86, cognitive: 74, composite_score: 80.2, tenant_id: TENANT_TTA, venue_verified: true, created_at: iso(45) },
    { id: "p5", athlete_id: A(4), session_id: "s5", speed: 34, agility: 30, stamina: 36, technical: null, cognitive: 29, composite_score: 32.3, tenant_id: TENANT_RINK, venue_verified: false, created_at: iso(8) },
    { id: "p6", athlete_id: A(1), session_id: null, speed: 52, agility: 50, stamina: 55, technical: 54, cognitive: 48, composite_score: 51.8, tenant_id: TENANT_TTA, venue_verified: true, created_at: iso(120) },
  ],
  biometrics: [
    { record_id: "b1", athlete_id: A(1), measured_at: date(16), height_cm: 157.5, weight_kg: 45.2, age_at_measurement_years: 13.4, provenance_id: P(1) },
    // Clinician submission still pending, and physically impossible.
    { record_id: "b2", athlete_id: A(4), measured_at: date(6), height_cm: 241, weight_kg: 12, age_at_measurement_years: 14, provenance_id: P(9) },
  ],
  guardians: [
    { guardian_id: "g1", athlete_id: A(1), consent_on_file: true },
    { guardian_id: "g2", athlete_id: A(2), consent_on_file: true },
    { guardian_id: "g3", athlete_id: A(4), consent_on_file: false },
    { guardian_id: "g4", athlete_id: A(9), consent_on_file: true },
  ],
  queue: [
    { id: "q1", status: "pending", attempts: 0, tenant_id: TENANT_RINK, athlete_id: A(4), error: null, venue_verified: false, created_at: iso(1), processed_at: null },
    { id: "q2", status: "retrying", attempts: 3, tenant_id: TENANT_RINK, athlete_id: A(6), error: "edge upload timed out", venue_verified: true, created_at: iso(2), processed_at: null },
    { id: "q3", status: "processed", attempts: 1, tenant_id: TENANT_TTA, athlete_id: A(1), error: null, venue_verified: true, created_at: iso(3), processed_at: iso(3) },
  ],
  deadLetters: [
    { id: "dl1", record_type: "performance_log", last_error: "Convex bridge rejected payload: missing engine_version", failed_at: iso(4) },
  ],
  audit: [
    { event_id: "e1", event_type: "DOSSIER_EXPORT", actor_id: "scout-arsenal-01", occurred_at: iso(6), record_type: "athlete", record_id: A(3), event_hash: "9f2b71c4aa01b3d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d" },
    { event_id: "e2", event_type: "SCOUT_DOSSIER_VIEW", actor_id: "scout-ajax-02", occurred_at: iso(11), record_type: "athlete", record_id: A(1), event_hash: "1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f809" },
    { event_id: "e3", event_type: "PASSPORT_VERIFICATION_APPROVED", actor_id: "founder-01", occurred_at: iso(20), record_type: "provenance", record_id: P(3), event_hash: "5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c" },
    { event_id: "e4", event_type: "TRIAL_INVITATION_ISSUED", actor_id: "agent-1", occurred_at: iso(120), record_type: "athlete", record_id: A(2), event_hash: "abc1230000000000000000000000000000000000000000000000000000000000" },
  ],
  registrations: [
    { venture_context: "BIG_ICE", tier: "academy_term", payment_status: "PAYMENT_SETTLED", amount_expected_kes: 45000, settled_at: iso(12) },
    { venture_context: "BIG_ICE", tier: "academy_term", payment_status: "PAYMENT_SETTLED", amount_expected_kes: 45000, settled_at: iso(26) },
    { venture_context: "NRHL", tier: "combine_27500", payment_status: "PAYMENT_SETTLED", amount_expected_kes: 27500, settled_at: iso(60) },
    { venture_context: "NRHL", tier: "baseline_7500", payment_status: "STK_PENDING", amount_expected_kes: 7500, settled_at: null },
    { venture_context: "TTA", tier: "enterprise_150k", payment_status: "PAYMENT_SETTLED", amount_expected_kes: 150000, settled_at: iso(200) },
  ],
  payments: [
    { amount_kes: 45000, result_code: 0, created_at: iso(12) },
    { amount_kes: 45000, result_code: 0, created_at: iso(26) },
    { amount_kes: 27500, result_code: 0, created_at: iso(60) },
    { amount_kes: 7500, result_code: 1032, created_at: iso(1) },
  ],
  scoutLogs: [
    { id: "sl1", athlete_id: A(3), metric_code: "DOSSIER_VIEW", context: "scout-arsenal-01", logged_at: iso(6) },
    { id: "sl2", athlete_id: A(1), metric_code: "DOSSIER_VIEW", context: "scout-ajax-02", logged_at: iso(11) },
    { id: "sl3", athlete_id: A(1), metric_code: "SHORTLIST_ADD", context: "scout-ajax-02", logged_at: iso(10) },
  ],
  coachLinks: [
    { athlete_id: A(1), coach_id: "coach_njoroge", role_label: "Head of Football Performance" },
    { athlete_id: A(2), coach_id: "coach_njoroge", role_label: "Head of Football Performance" },
    { athlete_id: A(3), coach_id: "coach_njoroge", role_label: "Head of Football Performance" },
    { athlete_id: A(4), coach_id: "coach_wanjala", role_label: "Rink Skills Coach" },
    { athlete_id: A(6), coach_id: "coach_wanjala", role_label: "Rink Skills Coach" },
  ],
  cohorts: [
    { registry_id: "r1", cohort_label: "Panari Basic Skating — Term 3", track_type: "basic_skating", session_day_of_week: 6, window_start_time: "09:00", window_end_time: "10:30", capacity: 20, season_start_date: date(30), season_end_date: date(-60), student_athlete_id: A(4), enrollment_status: "enrolled" },
    { registry_id: "r1", cohort_label: "Panari Basic Skating — Term 3", track_type: "basic_skating", session_day_of_week: 6, window_start_time: "09:00", window_end_time: "10:30", capacity: 20, season_start_date: date(30), season_end_date: date(-60), student_athlete_id: A(6), enrollment_status: "enrolled" },
    { registry_id: "r2", cohort_label: "Precision Squad — Term 3", track_type: "figure_skating_precision", session_day_of_week: 3, window_start_time: "17:00", window_end_time: "18:30", capacity: 12, season_start_date: date(30), season_end_date: date(-60), student_athlete_id: A(5), enrollment_status: "enrolled" },
  ],
  league: [
    { athlete_code: "NRHL-001", display_name: "Samuel Kiprop", team: "Panari Penguins", division: "U16", age_tier: "16_23", games_played: 8, attendance_rate_pct: 92, coach_grade_avg: 3.8, composite_score: 61.2, legacy_points: 14, conduct_cases: 0 },
    { athlete_code: "NRHL-002", display_name: "Faith Nyambura", team: "Panari Penguins", division: "U16", age_tier: "16_23", games_played: 7, attendance_rate_pct: 88, coach_grade_avg: 4.1, composite_score: 66.4, legacy_points: 11, conduct_cases: 1 },
    { athlete_code: "NRHL-003", display_name: "Kevin Mutiso", team: "Westlands Warriors", division: "U16", age_tier: "16_23", games_played: 8, attendance_rate_pct: 74, coach_grade_avg: 3.2, composite_score: 52.9, legacy_points: 9, conduct_cases: 2 },
  ],
};
