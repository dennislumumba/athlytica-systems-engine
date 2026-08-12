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
const GFORMS = "app/api/v1/onboarding/google-forms/route.ts";

/** Doors that create athlete records WITHOUT a payment check, by design. */
const NON_PAYMENT_DOORS = [INGEST, GFORMS];

/** Tables that represent money already paid. No non-payment door may write them. */
const PAID_ARTEFACT_TABLES = [
  "bigice_enrollment",
  "bigice_document",
  "payment_events",
  "payment_reconciliation_exception",
  "record_classification",
];

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

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

test("Google Forms onboarding verifies its HMAC before any database work", () => {
  const src = read(GFORMS);

  // Fail closed: an unset secret must refuse, never skip the check.
  assert.match(
    src,
    /if \(!secret \|\| !supabaseUrl \|\| !serviceRoleKey\) \{/,
    "an unprovisioned secret must seal the route",
  );
  assert.match(
    src,
    /if \(!signatureHeader \|\| !timingSafeEqualHex\(/,
    "a missing or wrong signature must be rejected",
  );

  const sig = src.indexOf("timingSafeEqualHex(signatureHeader");
  const parse = src.indexOf("JSON.parse(rawBody)");
  const client = src.indexOf("createClient(supabaseUrl");
  assert.ok(sig > 0, "the route must verify a signature");
  assert.ok(parse > sig, "JSON must not be parsed before the signature is verified");
  assert.ok(client > sig, "no Supabase client may be built before the signature is verified");
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

test("Google Forms onboarding cannot issue a public ATH-XXXXXX identifier", () => {
  const src = read(GFORMS);
  const rpcs = [...src.matchAll(/\.rpc\("([^"]+)"/g)].map((m) => m[1]!);

  // It creates a passport-plane athlete keyed by gen_random_uuid() inside
  // onboard_athlete_from_google_form. It never draws from
  // athlytica_core.scalable_id_sequence, so it cannot collide with the
  // legacy ATH-500..638 block (R4) and is not an M1 caller.
  assert.deepEqual(rpcs, ["onboard_athlete_from_google_form"], "one RPC, and it is not an issuer");
  assert.ok(
    !/next_athlete_code/.test(src),
    "the Google Forms path must not mint a public athlete code",
  );
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
