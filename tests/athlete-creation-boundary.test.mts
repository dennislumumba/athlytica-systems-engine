// =====================================================================
// THE NON-PAYMENT ATHLETE-CREATION DOORS
//
// Phase 0.3E closed the payment-authorized paths. It explicitly did NOT
// claim the others were safe — it listed them so the claim could not be
// read too broadly. Phase 0.3F audits them.
//
// An athlete may legitimately exist without having paid: a legacy
// athlete, an imported competition athlete, an administratively
// registered athlete. So the rule is not "no creation without payment".
// It is:
//
//   a NON-PAYMENT path may create IDENTITY and COMPETITION records
//   under its own authorization, and must never manufacture PAID
//   entitlement — no bigice_enrollment, no bigice_document, no
//   payment_events, no settled registration.
//
// These guards pin the authorization on each door and the ceiling on
// what each door may write. Source assertions, for the same reason as
// the 0.3E guards: these are Next route handlers with no fixture layer.
//
// See docs/phase0/BUILD_AND_CREATION_BOUNDARY_AUDIT.md.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const INGEST = "app/api/v1/leagues/nrhl/ingest/route.ts";

/**
 * Doors that create athlete records WITHOUT a payment check, by design.
 *
 * Was [INGEST, GFORMS]. The Google Forms door was retired in Phase 0.3H
 * (D-26c) and is no longer a creation door at all — its guards live in
 * tests/google-forms-retired.test.mts, which asserts the absence of the
 * capability rather than its boundaries.
 *
 * NRHL legacy import is now the ONLY non-payment athlete-creation door.
 */
const NON_PAYMENT_DOORS = [INGEST];

/** Tables that represent money already paid. No non-payment door may write them. */
const PAID_ARTEFACT_TABLES = [
  "bigice_enrollment",
  "bigice_document",
  "payment_events",
  "payment_reconciliation_exception",
  "record_classification",
];

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/**
 * Source with comments stripped. These files document themselves heavily
 * and several deliberately NAME the things they no longer do, so a guard
 * that greps raw text reports the prose as a violation.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const writeTargets = (src: string) =>
  [...src.matchAll(/\.from\("([^"]+)"\)\s*\.(?:insert|upsert|update|delete)/g)].map((m) => m[1]!);
const allTargets = (src: string) =>
  [...src.matchAll(/\.from\("([^"]+)"\)/g)].map((m) => m[1]!);

test("NRHL ingest is gated to founder/head-coach before it reads a body", () => {
  const src = read(INGEST);

  assert.match(
    src,
    /requireWorkspaceRole\(request, "nrhl", \["GLOBAL_FOUNDER", "HEAD_COACH"\]\)/,
    "ingest must require an NRHL founder/head-coach grant",
  );
  assert.match(src, /if \("denied" in gate\) return gate\.denied;/, "the gate result must be honoured");

  // The gate must precede body parsing: an unauthenticated caller should
  // not be able to reach CSV parsing, let alone the athlete loop.
  const gate = src.indexOf("requireWorkspaceRole(");
  const body = src.indexOf("await request.text()");
  const mint = src.indexOf('db.rpc("nrhl_next_athlete_code")');
  assert.ok(gate > 0 && body > gate, "authorization must run before the request body is read");
  assert.ok(mint > gate, "authorization must run before any athlete code is minted");
});

test("the athlete-creation door census is closed and complete", () => {
  // Every file in the repository that can create an athlete row. If a new
  // one appears it must be reviewed against the payment boundary (M4) and
  // the ID-issuance boundary (M1) before it ships — this test is the
  // tripwire, and it is the reason the census can be trusted at all.
  //
  // Google Forms was removed from this list in 0.3H. It is not "a door
  // that is currently closed"; it is not a door.
  const CREATION_DOORS = [
    "app/api/v1/biz/mpesa-callback/route.ts", // paid, Big Ice + NRHL packs
    "app/api/v1/biz/retry-onboarding/route.ts", // paid, recovery
    "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts", // paid, NRHL
    INGEST, // trusted import, no payment by design
  ];

  const ATHLETE_TABLES = ["bigice_athlete", "nrhl_athlete", "athlete"];
  const found: string[] = [];
  for (const f of [...CREATION_DOORS, "app/api/v1/onboarding/google-forms/route.ts"]) {
    const src = code(f);
    const writes = writeTargets(src);
    const viaService = /onboardBigIceAthlete\(|\.rpc\("onboard_athlete_from_google_form"/.test(src);
    if (writes.some((t) => ATHLETE_TABLES.includes(t)) || viaService) found.push(f);
  }

  assert.deepEqual(
    found.sort(),
    CREATION_DOORS.slice().sort(),
    "the set of athlete-creating routes changed — review any new door against M4 and M1",
  );
});

test("no non-payment door writes a paid artefact", () => {
  // This is the boundary that matters. These doors may create identity and
  // competition records; they may not manufacture evidence of money.
  for (const door of NON_PAYMENT_DOORS) {
    const written = writeTargets(read(door));
    for (const paid of PAID_ARTEFACT_TABLES) {
      assert.ok(
        !written.includes(paid),
        `${door} must not write ${paid} — that would fabricate paid entitlement without payment`,
      );
    }
  }
});

test("no non-payment door touches the settlement or authorization machinery", () => {
  for (const door of NON_PAYMENT_DOORS) {
    const src = read(door);
    const rpcs = [...src.matchAll(/\.rpc\("([^"]+)"/g)].map((m) => m[1]!);
    assert.ok(
      !rpcs.includes("settle_payment_transaction"),
      `${door} must not settle payments`,
    );
    assert.ok(
      !rpcs.includes("payment_service_authorization"),
      `${door} must not consult the payment rule — it has no payment to authorize, ` +
        "and calling it would imply one",
    );
    assert.ok(
      !allTargets(src).includes("registrations"),
      `${door} must not touch registrations — that is the payment funnel's record`,
    );
  }
});

test("no untrusted or retired surface can mint a permanent athlete identity", () => {
  // The sequence behind ATH-XXXXX is the one irreversible resource in the
  // system: a burned code is gone (R15/D-20) and a colliding one corrupts
  // legacy history (R4). Only these three files may draw from it, and each
  // is either payment-authorized or grant-gated.
  const ISSUERS = [
    "lib/services/bigice-onboarding.ts",
    "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts",
    INGEST,
  ];
  const NON_ISSUERS = [
    "app/api/v1/onboarding/google-forms/route.ts", // retired
    "app/api/v1/sync/convex/route.ts",
    "app/api/v1/portal/route.ts",
    "app/api/v1/biz/check-status/route.ts",
    "app/api/v1/auth/register/route.ts",
    "app/api/v1/biz/stk-push/route.ts",
  ];

  for (const f of ISSUERS) {
    assert.match(
      read(f),
      /\.rpc\("(?:nrhl|bigice)_next_athlete_code"\)/,
      `${f} is a known issuer; if it stopped minting, re-verify the census`,
    );
  }
  for (const f of NON_ISSUERS) {
    assert.ok(
      !/next_athlete_code|scalable_id_sequence/.test(read(f)),
      `${f} must never mint a permanent athlete identifier`,
    );
  }
});

test("Big Ice onboarding refuses anything that is not a Big Ice registration", () => {
  // Venture isolation at the onboarding door, independent of the venture
  // checks in the settlement matcher and the authorization rule. Three
  // layers, because a Big Ice payment creating an NRHL athlete (or the
  // reverse) is the failure this project can least afford.
  const src = read("lib/services/bigice-onboarding.ts");
  assert.match(
    src,
    /if \(row\.venture_context !== "BIG_ICE"\)/,
    "Big Ice onboarding must self-select on venture_context",
  );

  const written = writeTargets(src);
  assert.ok(
    !written.includes("nrhl_athlete"),
    "the Big Ice onboarding path must never write an NRHL athlete",
  );
});

test("the NRHL doors never write a Big Ice athlete, enrollment or document", () => {
  for (const door of [INGEST, "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts"]) {
    const written = writeTargets(read(door));
    for (const bigIce of ["bigice_athlete", "bigice_enrollment", "bigice_document"]) {
      assert.ok(
        !written.includes(bigIce),
        `${door} must not write ${bigIce} — venture isolation runs both ways`,
      );
    }
  }
});
