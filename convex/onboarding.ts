import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import {
  geographicZoneValidator,
  podTierValidator,
  genderValidator,
} from "./schema";

/**
 * ATHLYTICA — LGE-NRHL Onboarding Validation Guard
 * ------------------------------------------------
 * Single write-path for athlete registration. All entitlement flags and the
 * competitive division are derived HERE, server-side, from the birthdate and
 * pod tier. The client payload is treated as untrusted input.
 */

// Hard tenant pin. This module serves exactly one tenant; the constant is the
// row-level isolation anchor for every read and write below.
const ACTIVE_TENANT_ID = "LGE-NRHL" as const;

type Division = "u8" | "u12" | "u16" | "open_men" | "open_women";
type PodTier = "tier1" | "tier2" | "tier3";
type MetricNode =
  | "basic_scorecard"
  | "biometrics"
  | "technical"
  | "tactical_iq"
  | "speed_power"
  | "psychological";

interface PodEntitlements {
  scrimmageAccess: boolean;
  videoTaggingAccess: boolean;
  offPeakRestricted: boolean;
  accessibleMetricNodes: MetricNode[];
}

/**
 * Exact chronological age in completed years as of `asOf`.
 * Month/day-aware — a naive year subtraction misclassifies athletes whose
 * birthday falls later in the calendar year, which corrupts division
 * assignment at the u8/u12/u16 boundaries.
 */
export function calculateChronologicalAge(dateOfBirth: string, asOf: Date): number {
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  if (!ISO_DATE.test(dateOfBirth)) {
    throw new Error(
      `Invalid dateOfBirth "${dateOfBirth}". Expected ISO format YYYY-MM-DD.`,
    );
  }
  const [year, month, day] = dateOfBirth.split("-").map(Number);
  const dob = new Date(Date.UTC(year, month - 1, day));
  // Reject impossible calendar dates (e.g. 2020-02-31 silently rolls over)
  if (
    dob.getUTCFullYear() !== year ||
    dob.getUTCMonth() !== month - 1 ||
    dob.getUTCDate() !== day
  ) {
    throw new Error(`dateOfBirth "${dateOfBirth}" is not a valid calendar date.`);
  }
  if (dob.getTime() > asOf.getTime()) {
    throw new Error("dateOfBirth cannot be in the future.");
  }
  let age = asOf.getUTCFullYear() - year;
  const birthdayNotYetReached =
    asOf.getUTCMonth() < month - 1 ||
    (asOf.getUTCMonth() === month - 1 && asOf.getUTCDate() < day);
  if (birthdayNotYetReached) age -= 1;
  return age;
}

/** Age → division bracket. Throws below the 6-year floor. */
export function resolveDivision(age: number, gender: "male" | "female"): Division {
  if (age >= 6 && age <= 8) return "u8";
  if (age >= 9 && age <= 12) return "u12";
  if (age >= 13 && age <= 16) return "u16";
  if (age >= 17) return gender === "male" ? "open_men" : "open_women";
  throw new Error(
    `Athlete age ${age} is below the minimum league entry age of 6 years.`,
  );
}

/** Pod tier → entitlement matrix. The ONLY place feature flags are computed. */
export function resolvePodEntitlements(podTier: PodTier): PodEntitlements {
  switch (podTier) {
    case "tier1": // Scrimmage Core Pod — 25,000 KES
      return {
        scrimmageAccess: true,
        videoTaggingAccess: false,
        offPeakRestricted: false,
        accessibleMetricNodes: ["basic_scorecard"],
      };
    case "tier2": // Showcase Performance Pod — 48,000 KES
      return {
        scrimmageAccess: true, // priority scrimmage access
        videoTaggingAccess: true,
        offPeakRestricted: false,
        accessibleMetricNodes: [
          "biometrics",
          "technical",
          "tactical_iq",
          "speed_power",
          "psychological",
        ],
      };
    case "tier3": // Foundational Development Pod — 32,000 KES
      return {
        scrimmageAccess: false, // strictly NO scrimmage access
        videoTaggingAccess: false,
        offPeakRestricted: true, // off-peak hours only
        accessibleMetricNodes: ["technical", "biometrics"],
      };
    default: {
      // Exhaustiveness guard — unreachable if the validator layer holds.
      const _exhaustive: never = podTier;
      throw new Error(`Unknown pod tier: ${String(_exhaustive)}`);
    }
  }
}

export const validateAndOnboardAthlete = mutation({
  args: {
    userId: v.id("users"),
    parentId: v.optional(v.id("users")),
    name: v.string(),
    dateOfBirth: v.string(), // ISO YYYY-MM-DD
    gender: genderValidator, // Open League is strictly binary-segregated
    geographicZone: geographicZoneValidator,
    podTier: podTierValidator,
    teamId: v.optional(v.id("teams")),
  },
  handler: async (ctx, args) => {
    // ------------------------------------------------------------------
    // GUARD 1 — Identity anchors must exist and belong to THIS tenant.
    // Prevents cross-tenant FK grafting and orphan identity references.
    // ------------------------------------------------------------------
    const athleteUser = await ctx.db.get(args.userId);
    if (!athleteUser || athleteUser.tenantId !== ACTIVE_TENANT_ID) {
      throw new Error(
        "Athlete identity anchor not found within tenant LGE-NRHL. Registration rejected.",
      );
    }

    // ------------------------------------------------------------------
    // GUARD 2 — Chronological division assignment (server-computed).
    // ------------------------------------------------------------------
    const age = calculateChronologicalAge(args.dateOfBirth, new Date());
    const division = resolveDivision(age, args.gender);
    const isMinorDivision =
      division === "u8" || division === "u12" || division === "u16";

    // ------------------------------------------------------------------
    // GUARD 3 — Minors require a verified parent/guardian anchor.
    // ------------------------------------------------------------------
    let parentId: Id<"users"> | undefined = undefined;
    if (isMinorDivision) {
      if (!args.parentId) {
        throw new Error(
          `Division ${division} requires a parent/guardian anchor (parentId). ` +
            "Minor registration without a guardian is rejected.",
        );
      }
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.tenantId !== ACTIVE_TENANT_ID) {
        throw new Error(
          "Parent/guardian anchor not found within tenant LGE-NRHL. Registration rejected.",
        );
      }
      if (parent._id === athleteUser._id) {
        throw new Error("An athlete cannot be their own parent/guardian anchor.");
      }
      parentId = parent._id;
    } else if (args.parentId) {
      // Open League: retain the guardian link only if it resolves cleanly;
      // otherwise drop it rather than persisting a dangling reference.
      const parent = await ctx.db.get(args.parentId);
      parentId =
        parent && parent.tenantId === ACTIVE_TENANT_ID ? parent._id : undefined;
    }

    // ------------------------------------------------------------------
    // GUARD 4 — Optional team link must be tenant-owned, zone-consistent,
    // and division-consistent. No orphan or cross-conference grafts.
    // ------------------------------------------------------------------
    let teamId: Id<"teams"> | undefined = undefined;
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId);
      if (!team || team.tenantId !== ACTIVE_TENANT_ID) {
        throw new Error(
          "Target team does not exist within tenant LGE-NRHL. Registration rejected.",
        );
      }
      if (team.geographicZone !== args.geographicZone) {
        throw new Error(
          `Team is registered in conference "${team.geographicZone}" but the athlete ` +
            `selected "${args.geographicZone}". Cross-conference rostering is not permitted.`,
        );
      }
      if (team.division !== division) {
        throw new Error(
          `Team competes in division "${team.division}" but the athlete's computed ` +
            `division is "${division}". Division mismatch rejected.`,
        );
      }
      teamId = team._id;
    }

    // ------------------------------------------------------------------
    // GUARD 5 — Duplicate passport prevention (one passport per identity
    // per tenant). Uses the tenant-prefixed index only.
    // ------------------------------------------------------------------
    const existing = await ctx.db
      .query("athletes")
      .withIndex("by_tenant_user", (q) =>
        q.eq("tenantId", ACTIVE_TENANT_ID).eq("userId", args.userId),
      )
      .unique();
    if (existing) {
      throw new Error(
        "An athlete passport already exists for this identity within LGE-NRHL.",
      );
    }

    // ------------------------------------------------------------------
    // Entitlement derivation — client-supplied flags are never trusted.
    // Tier 3 payloads get scrimmageAccess = false unconditionally here.
    // ------------------------------------------------------------------
    const entitlements = resolvePodEntitlements(args.podTier);

    // ------------------------------------------------------------------
    // Atomic commit of the clean payload.
    // ------------------------------------------------------------------
    const athleteId = await ctx.db.insert("athletes", {
      tenantId: ACTIVE_TENANT_ID,
      userId: athleteUser._id,
      parentId,
      name: args.name.trim(),
      dateOfBirth: args.dateOfBirth,
      gender: args.gender,
      division,
      geographicZone: args.geographicZone,
      teamId,
      activePodTier: args.podTier,
      complianceStatus: "pending_baseline",
      ...entitlements,
    });

    return {
      athleteId,
      division,
      computedAge: age,
      entitlements,
      complianceStatus: "pending_baseline" as const,
    };
  },
});
