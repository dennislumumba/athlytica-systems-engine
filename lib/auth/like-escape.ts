// =====================================================================
// SQL LIKE ESCAPING — a cross-account control, in its own module.
//
// It lives here rather than in guardian.ts for one reason: guardian.ts
// imports the Supabase admin client through the `@/` path alias, and
// `node --test` cannot resolve that. A control that cannot be reached
// from a test is a control nobody can keep. This file imports nothing.
// =====================================================================

/**
 * Escapes SQL LIKE metacharacters so a matched value cannot behave as a
 * pattern.
 *
 * THE PARENT PORTAL DEPENDS ON THIS. resolveGuardian() matches
 * bigice_athlete.guardian_email with ILIKE, for case-insensitivity —
 * which makes the matched address a PATTERN. `_` is a single-character
 * wildcard in SQL LIKE, and it is legal, and common, in an email local
 * part. Passed through raw, a verified sign-in as `john_smith@gmail.com`
 * matched every guardian whose address had the shape
 * `johnXsmith@gmail.com`, and the portal's entire job is to return one
 * household's children and nobody else's.
 *
 * Measured against the audit's test corpus: the unescaped pattern
 * returned three athletes across two unrelated families where the
 * address itself named two.
 *
 * `%` and PostgREST's own `*` are escaped for the same reason. Postgres
 * LIKE treats backslash as the escape character by default, so prefixing
 * is the whole fix.
 */
export function likeEscape(value: string): string {
  return value.replace(/[\\%_*]/g, (c) => `\\${c}`);
}
