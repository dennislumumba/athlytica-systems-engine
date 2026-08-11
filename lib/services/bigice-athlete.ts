// =====================================================================
// BIG ICE ATHLETE IDENTITY RESOLUTION
//
// One question, asked in two places: "is this child already a Big Ice
// athlete?" — at registration (brief §11/§15) and at legacy CSV import
// (§12). Both must answer it the same way, so the rule lives here rather
// than in either caller.
//
// THE COST OF EACH WRONG ANSWER IS NOT SYMMETRIC:
//   * A false MATCH attaches one family's payment to another family's
//     child, and exposes that child's record in the wrong parent portal.
//   * A false NEW mints a second Athlete ID and splits one child's
//     development history in half — recoverable by an admin merge.
// So anything short of corroborated agreement returns REVIEW. A human
// resolving 11 ambiguous rows is the cheap outcome here.
//
// A SUPPLIED ATHLETE ID IS A CLAIM, NOT A CREDENTIAL (§11, §68). A
// parent typing BIIF-2026-0042 gets the record only if the household
// contact or the name agrees with it — otherwise it is guessable access
// to another child's record.
// =====================================================================

export type MatchVerdict = "MATCH" | "REVIEW" | "NEW";

export interface AthleteCandidate {
  biifCode: string;
  fullName: string;
  dateOfBirth?: string | null; // ISO yyyy-mm-dd
  /**
   * HMAC of the household MSISDN. This — not the raw number — is the
   * household key, because the settlement pipeline hashes the phone at
   * the DPA barrier and never stores it. Paths that do hold a real
   * number (the NRHL webhook, legacy import) hash it on the way in so
   * every path compares the same value.
   */
  guardianMsisdnHash?: string | null;
  guardianPhoneE164?: string | null;
  guardianEmail?: string | null;
  legacyCode?: string | null;
}

export interface InboundAthlete {
  fullName: string;
  dateOfBirth?: string | null;
  guardianMsisdnHash?: string | null;
  guardianPhoneE164?: string | null;
  guardianEmail?: string | null;
  legacyCode?: string | null;
  claimedBiifCode?: string | null;
}

export interface MatchResult {
  verdict: MatchVerdict;
  athlete: AthleteCandidate | null;
  reason: string;
}

/**
 * Mirrors the `name_key` generated column in
 * 20260811120000_bigice_athlete_plane.sql. Change one, change both — the
 * DB's uniqueness rule and this matcher disagreeing is a duplicate the
 * import preview would not show.
 *
 * ponytail: exact token match after punctuation/case stripping. It does
 * not catch transpositions ("Peter John" / "John Peter") or spelling
 * drift, which fall to REVIEW rather than silently splitting a record.
 * Add a trigram/Levenshtein tier if review volume becomes the bottleneck.
 */
export function normaliseName(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase();
}

/** Exact comparison of an opaque token (hash, E.164). Absent matches nothing. */
function sameExact(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a === b);
}

function sameEmail(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function sameDob(a?: string | null, b?: string | null): boolean {
  return Boolean(a && b && a === b);
}

/** Does the household contact on the inbound row agree with the candidate? */
function householdAgrees(inbound: InboundAthlete, c: AthleteCandidate): boolean {
  return (
    // Hash first: it is the only household signal present on the
    // settlement path, and the only one available for every record.
    sameExact(inbound.guardianMsisdnHash, c.guardianMsisdnHash) ||
    sameExact(inbound.guardianPhoneE164, c.guardianPhoneE164) ||
    sameEmail(inbound.guardianEmail, c.guardianEmail)
  );
}

export function matchAthlete(
  inbound: InboundAthlete,
  candidates: readonly AthleteCandidate[],
): MatchResult {
  const inboundName = normaliseName(inbound.fullName);

  // 1. A claimed Athlete ID — resolved, then corroborated. An ID that
  //    names a real athlete but agrees with nothing else is exactly what
  //    a guessed identifier looks like.
  const claimed = inbound.claimedBiifCode?.trim();
  if (claimed) {
    const hit = candidates.find((c) => c.biifCode === claimed);
    if (!hit) {
      return { verdict: "REVIEW", athlete: null, reason: "Supplied Athlete ID matches no record." };
    }
    if (householdAgrees(inbound, hit) || normaliseName(hit.fullName) === inboundName) {
      return { verdict: "MATCH", athlete: hit, reason: "Athlete ID corroborated by name or household contact." };
    }
    return {
      verdict: "REVIEW",
      athlete: hit,
      reason: "Supplied Athlete ID agrees with neither the athlete name nor the household contact.",
    };
  }

  // 2. Legacy identifier — issued by Big Ice, not typed by a parent, so
  //    it stands on its own.
  const legacy = inbound.legacyCode?.trim();
  if (legacy) {
    const hit = candidates.find((c) => c.legacyCode?.trim() === legacy);
    if (hit) return { verdict: "MATCH", athlete: hit, reason: `Legacy id ${legacy} resolved.` };
  }

  const sameName = candidates.filter((c) => normaliseName(c.fullName) === inboundName);

  // 3. Name plus a second agreeing field. Either corroborator is enough;
  //    neither is enough alone.
  const corroborated = sameName.filter(
    (c) => sameDob(inbound.dateOfBirth, c.dateOfBirth) || householdAgrees(inbound, c),
  );
  if (corroborated.length === 1) {
    return { verdict: "MATCH", athlete: corroborated[0]!, reason: "Name and household/date of birth agree." };
  }
  if (corroborated.length > 1) {
    return {
      verdict: "REVIEW",
      athlete: null,
      reason: `${corroborated.length} existing athletes match on name and household — already duplicated.`,
    };
  }

  // 4. Same household, different child — a sibling. This is a NEW
  //    athlete, and getting it wrong merges two children into one record.
  const household = candidates.filter((c) => householdAgrees(inbound, c));
  if (sameName.length === 0 && household.length > 0) {
    return {
      verdict: "NEW",
      athlete: null,
      reason: "Known household, unseen athlete name — sibling or second child.",
    };
  }

  // 5. Name alone. Common names collide; a human decides.
  if (sameName.length > 0) {
    return {
      verdict: "REVIEW",
      athlete: null,
      reason: "Athlete name matches an existing record but nothing corroborates it.",
    };
  }

  return { verdict: "NEW", athlete: null, reason: "No existing athlete resembles this registration." };
}
