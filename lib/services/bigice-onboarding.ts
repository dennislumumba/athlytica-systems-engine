// =====================================================================
// BIG ICE POST-SETTLEMENT ONBOARDING
//
// Turns a settled Big Ice registration into the two durable records the
// portal reads: a permanent athlete identity (minted once, reused
// forever) and an enrollment for the thing that was just bought.
//
// ORDERING LAW, inherited from onboarding-delivery.ts: this runs AFTER
// settlement is durable and is never a condition of it. §55 — a payment
// that succeeded while onboarding failed must leave the money settled,
// the family un-charged a second time, and a loud line in the log. So
// this function CANNOT THROW and never reports success it did not
// achieve. Every exit is a described outcome.
//
// IDEMPOTENCY, three layers deep, because a gateway retry is certain:
//   1. The settle RPC returns DUPLICATE on a repeated receipt and this
//      never runs a second time.
//   2. matchAthlete() resolves the household to the existing athlete, so
//      a re-run reuses the BIIF code rather than minting another.
//   3. bigice_enrollment.mpesa_receipt is UNIQUE, so the enrollment
//      insert collapses onto the existing row.
//
// A CODE IS MINTED ONLY FOR A CONFIDENT NEW ATHLETE. Ambiguity returns
// REVIEW_REQUIRED and writes nothing: minting on a maybe splits one
// child's history across two IDs, and merging on a maybe puts one
// family's child in another family's portal. Both are worse than a
// pending row an administrator resolves.
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { REGISTRATION_TIERS } from "../../config/registration-fees.ts";
import { matchAthlete, normaliseName, type AthleteCandidate } from "./bigice-athlete.ts";

export type BigIceOnboardingOutcome =
  | { onboarded: true; biifCode: string; minted: boolean; returning: boolean }
  | { onboarded: false; reviewRequired: boolean; reason: string };

interface RegistrationRow {
  venture_context: string | null;
  athlete_name: string | null;
  full_name: string | null;
  email: string | null;
  tier: string | null;
  preferred_campus: string | null;
  msisdn_hash: string | null;
  amount_expected_kes: number | string | null;
}

/** Postgres unique_violation — the last-line duplicate guard firing. */
const UNIQUE_VIOLATION = "23505";

/**
 * /register writes `academy_<uuid>` for a commercial_price_tier package
 * and a bare tier id for a code-table programme. The enrollment's CHECK
 * constraint takes exactly one of the two, same law as the STK route:
 * a row that could name both price sources could disagree with what was
 * actually charged.
 */
export function priceSource(tier: string): { priceTierId: string | null; tierId: string | null } {
  return tier.startsWith("academy_")
    ? { priceTierId: tier.slice("academy_".length), tierId: null }
    : { priceTierId: null, tierId: tier };
}

async function programmeLabel(
  db: SupabaseClient,
  tier: string,
  priceTierId: string | null,
): Promise<string> {
  if (priceTierId) {
    const { data } = await db
      .from("commercial_price_tier")
      .select("tier_name")
      .eq("tier_id", priceTierId)
      .maybeSingle<{ tier_name: string | null }>();
    // The name the parent read on bigice.co.ke immediately before paying.
    if (data?.tier_name) return data.tier_name;
    return "Big Ice academy package";
  }
  const known = REGISTRATION_TIERS[tier as keyof typeof REGISTRATION_TIERS];
  return known?.label ?? tier;
}

/**
 * Candidates are fetched as two narrow queries rather than one `.or()`:
 * the name key is derived from a parent-supplied string, and PostgREST's
 * or-filter is a string grammar in which an embedded comma or paren
 * changes the query. Two exact-match queries cannot be steered.
 */
async function loadCandidates(
  db: SupabaseClient,
  nameKey: string,
  msisdnHash: string | null,
): Promise<AthleteCandidate[]> {
  const columns =
    "biif_code, full_name, date_of_birth, guardian_msisdn_hash, guardian_phone_e164, guardian_email, guardian_name, legacy_code";

  const byName = await db.from("bigice_athlete").select(columns).eq("name_key", nameKey);
  const byHousehold = msisdnHash
    ? await db.from("bigice_athlete").select(columns).eq("guardian_msisdn_hash", msisdnHash)
    : { data: [], error: null };

  const rows = [...(byName.data ?? []), ...(byHousehold.data ?? [])] as Record<string, unknown>[];
  const seen = new Set<string>();
  const out: AthleteCandidate[] = [];
  for (const r of rows) {
    const code = String(r.biif_code);
    if (seen.has(code)) continue;
    seen.add(code);
    out.push({
      biifCode: code,
      fullName: String(r.full_name),
      dateOfBirth: (r.date_of_birth as string | null) ?? null,
      guardianMsisdnHash: (r.guardian_msisdn_hash as string | null) ?? null,
      guardianPhoneE164: (r.guardian_phone_e164 as string | null) ?? null,
      guardianEmail: (r.guardian_email as string | null) ?? null,
      legacyCode: (r.legacy_code as string | null) ?? null,
    });
  }
  return out;
}

export async function onboardBigIceAthlete(
  db: SupabaseClient,
  registrationId: string,
  receipt: string,
): Promise<BigIceOnboardingOutcome> {
  try {
    const { data, error } = await db
      .from("registrations")
      .select(
        "venture_context, athlete_name, full_name, email, tier, preferred_campus, msisdn_hash, amount_expected_kes",
      )
      .eq("id", registrationId)
      .maybeSingle();
    if (error) {
      return { onboarded: false, reviewRequired: false, reason: `registration lookup failed: ${error.message}` };
    }

    const row = data as RegistrationRow | null;
    if (!row) return { onboarded: false, reviewRequired: false, reason: "registration not found" };

    // Not an error — NRHL and Athlytica settle through the same pipeline
    // and have their own onboarding.
    if (row.venture_context !== "BIG_ICE") {
      return { onboarded: false, reviewRequired: false, reason: "not a Big Ice registration" };
    }
    if (!row.athlete_name?.trim()) {
      return { onboarded: false, reviewRequired: true, reason: "registration carries no athlete name" };
    }
    if (!row.tier) {
      return { onboarded: false, reviewRequired: true, reason: "registration carries no tier" };
    }

    const athleteName = row.athlete_name.trim();
    const nameKey = normaliseName(athleteName);
    const msisdnHash = row.msisdn_hash;

    const candidates = await loadCandidates(db, nameKey, msisdnHash);
    const match = matchAthlete(
      {
        fullName: athleteName,
        guardianMsisdnHash: msisdnHash,
        guardianEmail: row.email,
      },
      candidates,
    );

    if (match.verdict === "REVIEW") {
      return { onboarded: false, reviewRequired: true, reason: match.reason };
    }

    let biifCode: string;
    let minted = false;

    if (match.verdict === "MATCH" && match.athlete) {
      biifCode = match.athlete.biifCode;

      // Enrich blanks only. Overwriting a known contact with a newer
      // registration's would let the most recent payer silently take
      // over an existing athlete's household record.
      const patch: Record<string, unknown> = {};
      if (!match.athlete.guardianMsisdnHash && msisdnHash) patch.guardian_msisdn_hash = msisdnHash;
      if (!match.athlete.guardianEmail && row.email) patch.guardian_email = row.email;
      if (Object.keys(patch).length > 0) {
        patch.updated_at = new Date().toISOString();
        await db.from("bigice_athlete").update(patch).eq("biif_code", biifCode);
      }
    } else {
      const { data: next, error: seqError } = await db.rpc("bigice_next_athlete_code");
      if (seqError || typeof next !== "string") {
        return {
          onboarded: false,
          reviewRequired: false,
          reason: `athlete code sequence unavailable: ${seqError?.message ?? "no code returned"}`,
        };
      }
      biifCode = next.trim();

      const { error: insertError } = await db.from("bigice_athlete").insert({
        biif_code: biifCode,
        full_name: athleteName,
        guardian_name: row.full_name,
        guardian_email: row.email,
        guardian_msisdn_hash: msisdnHash,
        origin: "REGISTRATION",
        identity_note: `Minted on settlement of receipt ${receipt}.`,
      });

      if (insertError) {
        // The unique index caught a duplicate the matcher did not — two
        // same-named children with no household hash to separate them.
        // Deliberately fails closed rather than merging their records.
        const code = (insertError as { code?: string }).code;
        return {
          onboarded: false,
          reviewRequired: code === UNIQUE_VIOLATION,
          reason:
            code === UNIQUE_VIOLATION
              ? `an athlete named ${athleteName} already exists with no household contact to distinguish them`
              : `athlete insert failed: ${insertError.message}`,
        };
      }
      minted = true;
    }

    const { priceTierId, tierId } = priceSource(row.tier);
    const amount = row.amount_expected_kes === null ? null : Number(row.amount_expected_kes);

    // IS THIS FAMILY RETURNING? Asked of their enrollment history, not of
    // whether THIS RUN happened to mint the code.
    //
    // `returning: !minted` was very nearly right and wrong in exactly the
    // case that matters. When onboarding minted an Athlete ID and then
    // failed at document delivery, the admin retry (§35) re-entered here,
    // matched the athlete it had just created, and therefore reported
    // minted = false — so a first-time family's recovery pack was headed
    // "Welcome Back to Big Ice" and told them their new programme had
    // been "added to their existing profile". Their first ever contact
    // from Big Ice would have implied a history they did not have.
    //
    // Enrollments other than this receipt are the honest question, and it
    // answers correctly on the first run and on every retry.
    const { count: priorEnrollments } = await db
      .from("bigice_enrollment")
      .select("enrollment_id", { count: "exact", head: true })
      .eq("biif_code", biifCode)
      .neq("mpesa_receipt", receipt);
    const returning = (priorEnrollments ?? 0) > 0;

    const { error: enrollError } = await db.from("bigice_enrollment").upsert(
      {
        biif_code: biifCode,
        programme_label: await programmeLabel(db, row.tier, priceTierId),
        price_tier_id: priceTierId,
        tier_id: tierId,
        amount_kes: Number.isFinite(amount) && (amount ?? 0) > 0 ? amount : null,
        mpesa_receipt: receipt,
        status: "ACTIVE",
        location: row.preferred_campus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "mpesa_receipt" },
    );

    if (enrollError) {
      // The athlete exists and keeps their ID; only the enrollment is
      // missing, which is the recoverable half.
      return {
        onboarded: false,
        reviewRequired: true,
        reason: `athlete ${biifCode} ${minted ? "minted" : "matched"} but enrollment failed: ${enrollError.message}`,
      };
    }

    return { onboarded: true, biifCode, minted, returning };
  } catch (err) {
    return {
      onboarded: false,
      reviewRequired: false,
      reason: `unexpected onboarding failure: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
