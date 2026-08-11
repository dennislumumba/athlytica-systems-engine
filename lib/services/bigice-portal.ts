// =====================================================================
// BIG ICE PARENT PORTAL — derivation rules
//
// The portal shows a parent when their child next skates, and how far
// along they are. Both are places where a plausible-looking wrong answer
// is worse than an empty panel: a wrong day means a child is driven to a
// closed rink, and invented progress is the one thing the brief forbids
// outright (§25, §43, §63).
//
// So every function here returns null / NO_BASELINE rather than a guess.
// =====================================================================

/**
 * Kenya is UTC+3 year-round and has never observed DST. cohort_session_registry
 * stores `time without time zone`, i.e. wall-clock EAT, so the server's own
 * timezone must never enter the computation — a Vercel box running UTC would
 * otherwise roll a 16:00 Wednesday session onto Tuesday for anyone reading it
 * after 21:00 local.
 */
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface CohortSlot {
  cohortLabel: string;
  trackType: string | null;
  /** 0-7. See normaliseDayOfWeek. */
  sessionDayOfWeek: number | null;
  windowStartTime: string | null; // "16:00:00"
  windowEndTime: string | null;
  seasonStartDate: string | null; // "2026-09-01"
  seasonEndDate: string | null;
}

export interface NextSession {
  cohortLabel: string;
  trackType: string | null;
  /** Instant, UTC. The client formats it in EAT. */
  startsAtIso: string;
  endsAtIso: string | null;
  startTimeEat: string;
  endTimeEat: string | null;
}

/**
 * cohort_session_registry.session_day_of_week carries no documented
 * convention — the table has no DDL in this repo and its seven rows all
 * say 3. ISO-8601 (1=Mon..7=Sun) and Postgres DOW (0=Sun..6=Sat) agree
 * on every value except Sunday, which ISO calls 7 and Postgres calls 0.
 * Accepting both spellings of Sunday resolves the ambiguity outright
 * instead of betting on one convention.
 *
 * Returns 0=Sun..6=Sat, or null if the value is outside both schemes.
 */
export function normaliseDayOfWeek(raw: number | null | undefined): number | null {
  if (raw === null || raw === undefined || !Number.isInteger(raw)) return null;
  if (raw === 0 || raw === 7) return 0;
  return raw >= 1 && raw <= 6 ? raw : null;
}

/** "HH:MM[:SS]" -> ms after midnight, or null. */
function timeToMs(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]), s = Number(m[3] ?? "0");
  if (h > 23 || min > 59 || s > 59) return null;
  return ((h * 60 + min) * 60 + s) * 1000;
}

/** "YYYY-MM-DD" -> the civil day, labelled as a UTC-midnight timestamp. */
function dateToDayLabel(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** The EAT civil date `now` falls on, as the same UTC-midnight label. */
function eatDayLabel(now: Date): number {
  const shifted = new Date(now.getTime() + EAT_OFFSET_MS);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate());
}

/** A civil EAT day + wall-clock time, as a real UTC instant. */
function instantOf(dayLabel: number, msIntoDay: number): number {
  return dayLabel + msIntoDay - EAT_OFFSET_MS;
}

/**
 * The next occurrence of one weekly slot, or null when the slot is
 * unusable (missing day/time) or its season has ended.
 */
export function nextOccurrence(slot: CohortSlot, now: Date): NextSession | null {
  const dow = normaliseDayOfWeek(slot.sessionDayOfWeek);
  const startMs = timeToMs(slot.windowStartTime);
  const seasonStart = dateToDayLabel(slot.seasonStartDate);
  const seasonEnd = dateToDayLabel(slot.seasonEndDate);
  if (dow === null || startMs === null || seasonStart === null || seasonEnd === null) return null;

  const endMs = timeToMs(slot.windowEndTime);
  const today = eatDayLabel(now);

  // Never propose a date before the season opens.
  const from = Math.max(today, seasonStart);
  const fromDow = new Date(from).getUTCDay();
  let candidate = from + ((dow - fromDow + 7) % 7) * DAY_MS;

  // Today's session, already finished, is not the next one. Falls back to
  // the start time when no end time is recorded.
  if (candidate === today && now.getTime() >= instantOf(candidate, endMs ?? startMs)) {
    candidate += 7 * DAY_MS;
  }
  if (candidate > seasonEnd) return null;

  return {
    cohortLabel: slot.cohortLabel,
    trackType: slot.trackType,
    startsAtIso: new Date(instantOf(candidate, startMs)).toISOString(),
    endsAtIso: endMs === null ? null : new Date(instantOf(candidate, endMs)).toISOString(),
    startTimeEat: slot.windowStartTime!.slice(0, 5),
    endTimeEat: slot.windowEndTime ? slot.windowEndTime.slice(0, 5) : null,
  };
}

/** The soonest session across every cohort the athlete is enrolled in. */
export function nextSession(slots: readonly CohortSlot[], now: Date): NextSession | null {
  let best: NextSession | null = null;
  for (const slot of slots) {
    const hit = nextOccurrence(slot, now);
    if (hit && (!best || hit.startsAtIso < best.startsAtIso)) best = hit;
  }
  return best;
}

/**
 * §43: an athlete with one assessment has a BASELINE, not progress. A
 * chart drawn through a single point is a claim the data does not
 * support, so the portal is told which of the three things to render
 * rather than being left to infer it from an array length.
 */
export type ProgressState = "NO_BASELINE" | "BASELINE_ESTABLISHED" | "PROGRESSING";

export function progressState(assessmentCount: number): ProgressState {
  if (assessmentCount <= 0) return "NO_BASELINE";
  return assessmentCount === 1 ? "BASELINE_ESTABLISHED" : "PROGRESSING";
}
