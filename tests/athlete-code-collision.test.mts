// =====================================================================
// D-43 — ATHLETE-CODE COLLISION HANDLING
//
// M6 (D-33 Option C) swaps a monotonic sequence for a random draw from a
// reserved band. That trade removes R15 and the legacy-block collision,
// and it introduces one new edge: a drawn code can already be taken. The
// PRIMARY KEY is the authority, so every creation path has to absorb a
// 23505 on the code column and draw again.
//
// The failure these guards exist to prevent is subtler than "no retry".
// It is retrying the WRONG 23505. Both athlete tables carry a second
// unique constraint that means something else entirely:
//
//   bigice_athlete   uq_bigice_athlete_identity     two children, one household -> REVIEW
//   nrhl_athlete     nrhl_athlete_display_name_key  a real name clash -> SURFACE IT
//
// Retrying either would loop until the budget burned and then report a
// saturating issuance band, which would be a lie about a data problem.
//
// The error shapes below are VERBATIM from PostgREST in the isolated
// Supabase environment, not invented.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ATHLETE_CODE_CONSTRAINT,
  CODE_RETRY_BUDGET,
  IDENTITY_CONSTRAINT,
  isAthleteCodeCollision,
  isConstraintViolation,
} from "../lib/services/athlete-code-collision.ts";
import { onboardBigIceAthlete } from "../lib/services/bigice-onboarding.ts";

// ---------------------------------------------------------------------
// Real PostgREST error payloads, captured against the isolated stack.
// ---------------------------------------------------------------------

const ERR = {
  bigiceCode: {
    code: "23505",
    message: 'duplicate key value violates unique constraint "bigice_athlete_pkey"',
    details: "Key (biif_code)=(BIIF-2026-1111) already exists.",
  },
  bigiceHousehold: {
    code: "23505",
    message: 'duplicate key value violates unique constraint "uq_bigice_athlete_identity"',
    details: "Key (name_key, guardian_msisdn_hash)=(zz one, h1) already exists.",
  },
  nrhlCode: {
    code: "23505",
    message: 'duplicate key value violates unique constraint "nrhl_athlete_pkey"',
    details: "Key (athlete_code)=(ATH-11111) already exists.",
  },
  nrhlDisplayName: {
    code: "23505",
    message: 'duplicate key value violates unique constraint "nrhl_athlete_display_name_key"',
    details: "Key (display_name)=(ZZ NRHL One) already exists.",
  },
  notNull: {
    code: "23502",
    message: 'null value in column "display_name" violates not-null constraint',
    details: null,
  },
} as const;

// ---------------------------------------------------------------------
// The predicate
// ---------------------------------------------------------------------

test("a code collision is recognised on both venture planes", () => {
  assert.equal(isAthleteCodeCollision(ERR.bigiceCode, "bigice"), true);
  assert.equal(isAthleteCodeCollision(ERR.nrhlCode, "nrhl"), true);
});

test("an identity clash is NEVER treated as a code collision", () => {
  // This is the regression. Both raise 23505; only one may be retried.
  assert.equal(isAthleteCodeCollision(ERR.bigiceHousehold, "bigice"), false);
  assert.equal(isAthleteCodeCollision(ERR.nrhlDisplayName, "nrhl"), false);

  assert.equal(isConstraintViolation(ERR.bigiceHousehold, IDENTITY_CONSTRAINT.bigiceHousehold), true);
  assert.equal(isConstraintViolation(ERR.nrhlDisplayName, IDENTITY_CONSTRAINT.nrhlDisplayName), true);
});

test("a venture's code constraint does not match the other venture", () => {
  assert.equal(isAthleteCodeCollision(ERR.nrhlCode, "bigice"), false);
  assert.equal(isAthleteCodeCollision(ERR.bigiceCode, "nrhl"), false);
});

test("unrelated errors are not swallowed", () => {
  assert.equal(isAthleteCodeCollision(ERR.notNull, "nrhl"), false);
  assert.equal(isConstraintViolation(ERR.notNull, ATHLETE_CODE_CONSTRAINT.nrhl), false);
  for (const junk of [null, undefined, "boom", 42, {}, { code: "23505" }]) {
    assert.equal(isAthleteCodeCollision(junk, "nrhl"), false);
  }
});

test("a constraint whose name is a prefix of another cannot be confused for it", () => {
  // Matched with surrounding quotes, so nrhl_athlete_pkey_old is not
  // nrhl_athlete_pkey.
  const older = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "nrhl_athlete_pkey_old"',
  };
  assert.equal(isAthleteCodeCollision(older, "nrhl"), false);
});

// ---------------------------------------------------------------------
// Big Ice — behavioural, with an injected client
// ---------------------------------------------------------------------

type InsertResult = { error: unknown } | { error: null };

/**
 * Minimal stand-in for the parts of the Supabase client this path uses.
 * `insertResults` is consumed one per attempt, which is what makes the
 * collision injection deterministic rather than probabilistic.
 */
function fakeDb(insertResults: InsertResult[]) {
  const calls = { mint: 0, insert: 0, committed: 0, committedCodes: [] as string[] };
  let codeSeq = 0;
  let lastCode = "";

  const thenable = (value: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "order", "limit", "in", "is", "not"]) {
      b[m] = () => b;
    }
    b.maybeSingle = async () => value;
    b.single = async () => value;
    b.then = (res: (v: unknown) => unknown) => Promise.resolve(value).then(res);
    return b;
  };

  const registration = {
    venture_context: "BIG_ICE",
    athlete_name: "Test Athlete",
    full_name: "Test Guardian",
    email: "guardian@example.test",
    tier: "beginner_skating",
    preferred_campus: null,
    msisdn_hash: "hash-1",
    amount_expected_kes: 16500,
  };

  const db = {
    from(table: string) {
      if (table === "registrations") return thenable({ data: registration, error: null });
      if (table === "bigice_athlete") {
        const b: Record<string, unknown> = {};
        for (const m of ["select", "eq", "neq", "order", "limit", "in", "is", "ilike", "or"]) {
          b[m] = () => b;
        }
        b.maybeSingle = async () => ({ data: null, error: null });
        b.then = (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(res);
        b.insert = async () => {
          calls.insert += 1;
          const result = insertResults[calls.insert - 1] ?? { error: null };
          if (!result.error) {
            calls.committed += 1;
            calls.committedCodes.push(lastCode);
          }
          return result;
        };
        b.update = () => b;
        return b;
      }
      // bigice_enrollment and anything else: succeed quietly.
      const b: Record<string, unknown> = {};
      for (const m of ["select", "eq", "neq", "order", "limit"]) b[m] = () => b;
      b.then = (res: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null, count: 0 }).then(res);
      b.insert = async () => ({ error: null });
      b.upsert = async () => ({ error: null });
      return b;
    },
    async rpc(fn: string) {
      if (fn === "bigice_next_athlete_code") {
        calls.mint += 1;
        codeSeq += 1;
        lastCode = `BIIF-2026-${String(1000 + codeSeq)}`;
        return { data: lastCode, error: null };
      }
      return { data: null, error: null };
    },
  };

  return { db: db as never, calls };
}

test("Big Ice: a code collision regenerates and commits exactly one athlete", async () => {
  // Two collisions, then success.
  const { db, calls } = fakeDb([
    { error: ERR.bigiceCode },
    { error: ERR.bigiceCode },
    { error: null },
  ]);

  const out = await onboardBigIceAthlete(db, "reg-1", "RCPT1");

  assert.equal(calls.mint, 3, "should have drawn a fresh code per attempt");
  assert.equal(calls.insert, 3, "should have attempted three inserts");
  assert.equal(calls.committed, 1, "EXACTLY ONE athlete row may be committed");
  assert.deepEqual(calls.committedCodes, ["BIIF-2026-1003"], "the committed code is the last drawn");
  // The success shape carries no `reviewRequired` at all; the failure
  // shape carries it as a boolean. Either way a code collision must never
  // surface as a review case.
  assert.notEqual(out.reviewRequired, true, "a code collision is not a review case");
});

test("Big Ice: a household clash still fails to review, and does NOT retry", async () => {
  const { db, calls } = fakeDb([{ error: ERR.bigiceHousehold }]);

  const out = await onboardBigIceAthlete(db, "reg-1", "RCPT1");

  assert.equal(out.onboarded, false);
  assert.equal(out.reviewRequired, true, "duplicate-name behaviour must be unchanged");
  assert.match(String(out.reason), /already exists with no household contact/);
  assert.equal(calls.insert, 1, "must not burn the retry budget on a data problem");
  assert.equal(calls.mint, 1);
});

test("Big Ice: an unrelated error is surfaced, not retried and not swallowed", async () => {
  const { db, calls } = fakeDb([{ error: ERR.notNull }]);

  const out = await onboardBigIceAthlete(db, "reg-1", "RCPT1");

  assert.equal(out.onboarded, false);
  assert.equal(out.reviewRequired, false);
  assert.match(String(out.reason), /athlete insert failed/);
  assert.match(String(out.reason), /not-null/);
  assert.equal(calls.insert, 1, "no retry for a non-collision error");
});

test("Big Ice: the retry budget is bounded and fails without creating an athlete", async () => {
  // Always collide.
  const { db, calls } = fakeDb(Array.from({ length: 20 }, () => ({ error: ERR.bigiceCode })));

  const out = await onboardBigIceAthlete(db, "reg-1", "RCPT1");

  assert.equal(calls.insert, CODE_RETRY_BUDGET, "must stop at the budget, not spin");
  assert.equal(out.onboarded, false, "no athlete may be reported as created");
  assert.equal(calls.committed, 0, "no partial athlete may be left behind");
  assert.equal(out.reviewRequired, false, "saturation is not a duplicate-name review");
  assert.match(String(out.reason), /saturating/);
});

// ---------------------------------------------------------------------
// NRHL importer — intra-batch reservation
// ---------------------------------------------------------------------

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const INGEST = "app/api/v1/leagues/nrhl/ingest/route.ts";
const PAID = "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts";

test("NRHL import reserves codes across the batch, seeded from the database", () => {
  const src = read(INGEST);
  assert.match(src, /const reservedCodes = new Set<string>\(/);
  assert.match(
    src,
    /\(existing \?\? \[\]\)\.map\(\(r\) => String\(r\.athlete_code\)\)/,
    "the reservation set must start from every code already committed",
  );
  assert.match(src, /if \(!reservedCodes\.has\(candidate\)\) return \{ code: candidate \}/);
  assert.match(src, /reservedCodes\.add\(code\)/);
});

test("NRHL import mints inside a bounded loop, not around the batch insert", () => {
  const src = read(INGEST);
  assert.match(src, /attempt <= CODE_RETRY_BUDGET/);
  // The fix must be at mint time. A retry wrapped around the final upsert
  // would just re-roll the same dice.
  const upsertIdx = src.indexOf('.upsert(athleteRows');
  const mintIdx = src.indexOf("mintUnreservedCode");
  assert.ok(mintIdx > -1 && upsertIdx > mintIdx, "reservation happens before the batch insert");
});

test("NRHL import keeps its idempotency and legacy-code semantics", () => {
  const src = read(INGEST);
  // An athlete already in the database keeps its code; a legacy row's
  // assigned code is still honoured ahead of any draw.
  assert.match(src, /codeByName\.get\(a\.canonicalName\) \?\? a\.assignedCode/);
  assert.match(src, /codeByName = new Map<string, string>\(/);
});

test("the batch algorithm cannot emit a duplicate code — deterministic injection", () => {
  // Reproduces the route's reservation rule against an issuer rigged to
  // return the same code repeatedly, which is what an unlucky random draw
  // looks like. Without the set this yields duplicates; with it, none.
  const rigged = ["ATH-10001", "ATH-10001", "ATH-10001", "ATH-10002", "ATH-10002", "ATH-10003"];
  let i = 0;
  const draw = () => rigged[i++] ?? `ATH-9${String(i).padStart(4, "0")}`;

  const reserved = new Set<string>(["ATH-50000"]); // already in the database
  const issued: string[] = [];

  for (let athlete = 0; athlete < 3; athlete++) {
    let code: string | null = null;
    for (let attempt = 1; attempt <= CODE_RETRY_BUDGET; attempt++) {
      const candidate = draw();
      if (!reserved.has(candidate)) {
        code = candidate;
        break;
      }
    }
    assert.notEqual(code, null, "budget must not be exhausted in this fixture");
    reserved.add(code!);
    issued.push(code!);
  }

  assert.equal(new Set(issued).size, issued.length, "no duplicate code within one batch");
  assert.equal(issued.includes("ATH-50000"), false, "must not reuse a committed code");
});

// ---------------------------------------------------------------------
// NRHL paid onboarding
// ---------------------------------------------------------------------

test("NRHL paid onboarding redraws only on the code constraint", () => {
  const src = read(PAID);
  assert.match(src, /isAthleteCodeCollision\(error, "nrhl"\)/);
  assert.match(src, /athleteCode = null; \/\/ force a fresh draw/);
  assert.match(src, /attempt <= CODE_RETRY_BUDGET/);
});

test("NRHL paid onboarding does not use display_name to absorb code collisions", () => {
  const src = read(PAID);
  // onConflict stays — it is the correct idempotency key for the route —
  // but the redraw must be gated on the PK constraint, never on the mere
  // presence of a unique violation.
  assert.match(src, /onConflict: "display_name"/);
  assert.doesNotMatch(
    src,
    /code === "23505"/,
    "a bare SQLSTATE check cannot tell a code collision from a name clash",
  );
});

test("no caller keys athlete-code retries off a bare 23505", () => {
  for (const p of [INGEST, PAID, "lib/services/bigice-onboarding.ts"]) {
    const src = read(p);
    assert.doesNotMatch(
      src.replace(/^\s*\/\/.*$/gm, ""),
      /=== UNIQUE_VIOLATION|code === "23505"/,
      `${p} must identify the constraint, not the SQLSTATE`,
    );
  }
});
