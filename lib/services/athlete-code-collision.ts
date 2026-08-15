// =====================================================================
// Athlete-code collision handling (D-43).
//
// M6 (D-33 Option C) replaces the monotonic `scalable_id_sequence` with a
// random draw from a reserved band. The issuer probes for a free code, but
// that probe is ADVISORY — two callers can pass it simultaneously, and in
// a batch the probe cannot see codes minted earlier in the same run. The
// PRIMARY KEY is the only authority, so every creation path has to be able
// to take a 23505 on the code column and draw again.
//
// The danger in doing that naively is swallowing the WRONG 23505. Both
// athlete tables carry a second unique constraint that means something
// entirely different, and retrying those would be wrong:
//
//   bigice_athlete   bigice_athlete_pkey            (biif_code)      <- redraw
//                    uq_bigice_athlete_identity     (name_key, guardian_msisdn_hash)
//                                                                    <- two children, one household: REVIEW
//   nrhl_athlete     nrhl_athlete_pkey              (athlete_code)   <- redraw
//                    nrhl_athlete_display_name_key  (display_name)   <- genuine name clash: surface it
//
// So collisions are identified by CONSTRAINT NAME, never by SQLSTATE
// alone. Verified against PostgREST in the isolated environment — the
// constraint name is present in `error.message`:
//
//   code:    "23505"
//   message: duplicate key value violates unique constraint "nrhl_athlete_pkey"
//   details: Key (athlete_code)=(ATH-11111) already exists.
//
// including for the case that motivated all of this: an upsert with
// onConflict=display_name whose athlete_code collides with a DIFFERENT
// row still reports nrhl_athlete_pkey, not the display-name constraint.
// =====================================================================

/** PostgreSQL unique_violation. */
export const UNIQUE_VIOLATION = "23505";

/** The constraint that owns each venture's athlete code. */
export const ATHLETE_CODE_CONSTRAINT = {
  nrhl: "nrhl_athlete_pkey",
  bigice: "bigice_athlete_pkey",
} as const;

/** Constraints that must KEEP their existing meaning and never trigger a redraw. */
export const IDENTITY_CONSTRAINT = {
  nrhlDisplayName: "nrhl_athlete_display_name_key",
  bigiceHousehold: "uq_bigice_athlete_identity",
} as const;

/**
 * How many codes one creation may draw before giving up.
 *
 * Five. At the NRHL band (90,000) the chance of five consecutive
 * collisions is (n/90000)^5 — about 1 in 243 once 30,000 athletes exist,
 * and 1 in 6e9 at 1,000. Exhausting it does not mean bad luck; it means
 * the band is saturating, which is a capacity alarm and must be loud.
 */
export const CODE_RETRY_BUDGET = 5;

/**
 * True only when `error` is a 23505 raised by exactly `constraint`.
 *
 * The name is matched with its surrounding quotes so that a constraint
 * whose name is a prefix of another (`..._pkey` vs `..._pkey_old`) can
 * never be mistaken for it.
 */
export function isConstraintViolation(error: unknown, constraint: string): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code !== UNIQUE_VIOLATION) return false;
  return typeof e.message === "string" && e.message.includes(`"${constraint}"`);
}

/** A 23505 on the venture's athlete-code constraint — the only redrawable one. */
export function isAthleteCodeCollision(
  error: unknown,
  venture: keyof typeof ATHLETE_CODE_CONSTRAINT,
): boolean {
  return isConstraintViolation(error, ATHLETE_CODE_CONSTRAINT[venture]);
}
