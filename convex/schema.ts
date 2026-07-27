import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * ATHLYTICA — LGE-NRHL Multi-Tenant Data Layer
 * --------------------------------------------
 * Row-level tenant isolation is enforced by:
 *   1. A mandatory `tenantId` discriminator on every tenant-scoped table.
 *   2. Compound indexes that are ALWAYS prefixed with `tenantId`, so every
 *      indexed read path is tenant-bounded by construction — a query cannot
 *      range across tenants without deliberately bypassing the index.
 *   3. Mutations (see convex/onboarding.ts) that hard-pin writes to the
 *      active tenant constant and re-verify tenant ownership of every
 *      foreign-key hop before insert (no cross-tenant orphan links).
 *
 * NOTE: The draft spec referenced v.id("users") without defining a `users`
 * table — that schema would fail Convex validation on deploy. The identity
 * anchor table is defined here explicitly.
 */

// ---------------------------------------------------------------------------
// Shared literal unions (single source of truth for enumerable domains)
// ---------------------------------------------------------------------------

export const geographicZoneValidator = v.union(
  v.literal("the_summit"),
  v.literal("the_ridge"),
  v.literal("the_plateau"),
  v.literal("the_savannah"),
);

export const divisionValidator = v.union(
  v.literal("u8"), // Ages 6–8, mixed
  v.literal("u12"), // Ages 9–12, mixed
  v.literal("u16"), // Ages 13–16, mixed
  v.literal("open_men"), // Ages 17+, gender-segregated
  v.literal("open_women"), // Ages 17+, gender-segregated
);

export const podTierValidator = v.union(
  v.literal("tier1"), // Scrimmage Core Pod — 25,000 KES
  v.literal("tier2"), // Showcase Performance Pod — 48,000 KES
  v.literal("tier3"), // Foundational Development Pod — 32,000 KES
);

export const complianceStatusValidator = v.union(
  v.literal("pending_baseline"),
  v.literal("verified_draft_eligible"),
);

export const metricNodeValidator = v.union(
  v.literal("basic_scorecard"), // Tier 1's single basic metric node
  v.literal("biometrics"),
  v.literal("technical"),
  v.literal("tactical_iq"),
  v.literal("speed_power"),
  v.literal("psychological"),
);

export const genderValidator = v.union(v.literal("male"), v.literal("female"));

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

export default defineSchema({
  /**
   * Identity anchors. Parents, athletes-with-accounts, and team managers all
   * resolve to a row here. Guardian/minor linkage is expressed on `athletes`
   * via `parentId`, never inferred.
   */
  users: defineTable({
    tenantId: v.string(),
    name: v.optional(v.string()), // absent on auth-created rows (identity provider had no name claim)
    email: v.string(),
    phone: v.optional(v.string()), // E.164; required downstream for M-Pesa STK push
    // The literals are the roles this module writes; the trailing v.string()
    // accepts roles minted by the other writer on this deployment ("founder",
    // "coach", "scout", ...) so deploy does not fail on their rows.
    role: v.union(
      v.literal("parent_guardian"),
      v.literal("athlete"),
      v.literal("team_manager"),
      v.literal("league_admin"),
      v.literal("founder"),
      v.string(),
    ),

    // Metadata written by the auth/onboarding path, not by this module.
    // Declared optional so existing documents validate.
    accountType: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    deviceRegisteredAt: v.optional(v.string()), // ISO 8601 UTC
    onboardingCompletedAt: v.optional(v.string()), // ISO 8601 UTC
    trustedDevices: v.optional(v.array(v.string())),
  })
    .index("by_tenant", ["tenantId"])
    .index("by_tenant_email", ["tenantId", "email"]),

  /**
   * Multi-tenant institutional nodes. `tenantId` is globally unique per
   * organization (e.g. "LGE-NRHL") and is the isolation key for every
   * downstream table.
   */
  organizations: defineTable({
    tenantId: v.string(), // e.g. "LGE-NRHL"
    name: v.string(), // e.g. "Nairobi Regional Hockey League"
    type: v.union(v.literal("league"), v.literal("club"), v.literal("academy")),
  }).index("by_tenant", ["tenantId"]),

  /**
   * Geographic conferences & club/external team units.
   * `managerId` is a hard FK to `users`; mutations must verify the manager
   * row belongs to the same tenant before linking.
   */
  teams: defineTable({
    tenantId: v.string(),
    name: v.string(),
    isExternalUnit: v.boolean(), // true → Full External Team Unit onboarding path
    geographicZone: geographicZoneValidator,
    division: divisionValidator,
    managerId: v.id("users"),
  })
    .index("by_tenant_zone", ["tenantId", "geographicZone"])
    .index("by_tenant_division", ["tenantId", "division"]),

  /**
   * Core athlete passports mapped to financial pod constraints.
   * Feature flags are DERIVED SERVER-SIDE from `activePodTier` in
   * validateAndOnboardAthlete — the client never supplies them directly.
   */
  athletes: defineTable({
    tenantId: v.string(),
    userId: v.id("users"), // the athlete's own identity anchor
    parentId: v.optional(v.id("users")), // MANDATORY for u8/u12/u16 — enforced in mutation
    name: v.string(),
    dateOfBirth: v.string(), // ISO "YYYY-MM-DD"; chronologically parsed server-side
    gender: genderValidator,
    division: divisionValidator, // computed, never client-supplied
    geographicZone: geographicZoneValidator,
    teamId: v.optional(v.id("teams")), // tenant-ownership re-verified before link

    // Pod subscription mapping
    activePodTier: podTierValidator,
    complianceStatus: complianceStatusValidator,

    // Feature flags determined strictly by pod tier
    scrimmageAccess: v.boolean(), // tier3 → always false
    videoTaggingAccess: v.boolean(), // tier2 only
    offPeakRestricted: v.boolean(), // tier3 only
    accessibleMetricNodes: v.array(metricNodeValidator), // tier1: 1 | tier2: 5 | tier3: 2
  })
    .index("by_tenant_compliance", ["tenantId", "complianceStatus"])
    .index("by_tenant_division", ["tenantId", "division"])
    .index("by_tenant_user", ["tenantId", "userId"]),
});
