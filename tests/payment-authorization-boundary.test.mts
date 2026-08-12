// =====================================================================
// EVERY PATH THAT CAN CREATE CUSTOMER VALUE GOES THROUGH THE BOUNDARY
//
// Phase 0.3E replaced four different, weaker payment checks with one:
// authorizePaymentForService() → public.payment_service_authorization.
//
//   before 0.3E                          after
//   ─────────────────────────────────    ──────────────────────────────
//   callback: outcome === "SETTLED"      + service authorization
//   retry:    payment_status settled     + service authorization
//   NRHL:     a receipt-shaped string    + service authorization
//   Big Ice:  nothing                    gated by its two callers
//
// These guards pin that. They are source assertions because all four
// subjects are Next route handlers needing a live Supabase client and a
// service-role key, and there is no fixture layer to run them against.
// The DATABASE half of the rule is proved separately — 29/29 assertions
// in a rolled-back transaction against the production schema, recorded in
// docs/phase0/PAYMENT_AUTHORIZATION_BOUNDARY.md §12. The behaviour of the
// TypeScript half is unit-tested in payment-authorization-rule.test.mts.
//
// What these catch is the regression that actually happens: someone
// editing one of these four files and dropping the check.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const CALLBACK = "app/api/v1/biz/mpesa-callback/route.ts";
const RETRY = "app/api/v1/biz/retry-onboarding/route.ts";
const NRHL_ONBOARD = "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts";

/** Every file that may create production customer value. */
const VALUE_CREATING_PATHS = [CALLBACK, RETRY, NRHL_ONBOARD];

const ISSUANCE_SITES = [
  "lib/services/bigice-onboarding.ts",
  "app/api/v1/workspaces/nrhl/onboard-paid-athlete/route.ts",
  "app/api/v1/leagues/nrhl/ingest/route.ts",
];

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("every value-creating path calls the one authorization rule", () => {
  for (const path of VALUE_CREATING_PATHS) {
    const src = read(path);
    assert.match(
      src,
      /authorizePaymentForService\(/,
      `${path} must ask lib/services/payment-authorization before creating customer value`,
    );
    assert.match(
      src,
      /from "@\/lib\/services\/payment-authorization"/,
      `${path} must import the shared rule, not re-implement one`,
    );
  }
});

test("nothing re-implements the rule with its own classification query", () => {
  // The rule reads record_classification inside the SQL function. If one of
  // these routes grows its own classification lookup, there are two rules
  // again — which is the state 0.3E existed to end.
  // Matches a QUERY, not the word — these files are entitled to explain
  // themselves in prose, and an earlier version of this guard failed on a
  // comment that said "record_classification".
  const queries = (src: string) => [
    ...src.matchAll(/\.from\("([^"]+)"\)/g),
    ...src.matchAll(/\.rpc\("([^"]+)"/g),
  ].map((m) => m[1]!);

  for (const path of VALUE_CREATING_PATHS) {
    const targets = queries(read(path));
    assert.ok(
      !targets.includes("record_classification"),
      `${path} must not query record_classification directly; the rule owns that`,
    );
    assert.ok(
      !targets.includes("payment_events_production"),
      `${path} must not substitute a revenue view for an authorization check`,
    );
  }
});

test("callback side effects are gated on authorization, not on an outcome string", () => {
  const src = read(CALLBACK);

  // Three post-settlement side effects can create customer value: the
  // draft-authorization webhook, the NRHL onboarding pack, and Big Ice
  // athlete/enrollment/document creation. All three key on the boolean
  // derived from the rule.
  const gated = [...src.matchAll(/if \(serviceAuthorized && result\.registration_id/g)];
  assert.equal(
    gated.length,
    3,
    `expected 3 authorization-gated side effects (webhook, NRHL pack, Big Ice), found ${gated.length}`,
  );

  // The old guard. `outcome === "SETTLED"` proves money moved and nothing
  // more — a settlement classified TEST reaches this line.
  assert.ok(
    !/if \(result\.outcome === "SETTLED" && result\.registration_id\)/.test(src),
    "settlement outcome alone must no longer gate any side effect",
  );
  assert.ok(
    !/result\.outcome !== "DUPLICATE"/.test(src),
    "side effects must never be gated on 'not a duplicate'",
  );
});

test("the callback reports RECONCILIATION_REQUIRED honestly", () => {
  const src = read(CALLBACK);

  // The 0.3D defect: reconciliationRequired was derived from two outcomes
  // and therefore read FALSE for the one verdict that demands a human.
  const derivation = src.slice(src.indexOf("const reconciliationRequired"));
  assert.ok(
    derivation.includes('authorization.status === "RECONCILIATION_REQUIRED"'),
    "reconciliationRequired must reflect the authorization verdict",
  );
  assert.ok(
    derivation.includes('result.outcome === "RECONCILIATION_REQUIRED"'),
    "reconciliationRequired must reflect the settlement verdict",
  );

  // Both new outcomes must be in the union, or the compiler stops helping.
  assert.ok(
    src.includes('| "TEST_CLASSIFIED"') && src.includes('| "RECONCILIATION_REQUIRED"'),
    "the outcome union must name every verdict the RPC can return",
  );

  // The caller is told the authorization answer, separately from the money.
  assert.ok(
    src.includes("serviceAuthorization: authorization.status"),
    "the response must carry the service-authorization verdict explicitly",
  );
});

test("the callback authorizes against the matched registration's venture", () => {
  const src = read(CALLBACK);

  // The venture must come from what the RPC matched, never from the
  // request body — otherwise a payer nominates the venture their money
  // settles, which is F-5 reintroduced at the application layer.
  assert.match(
    src,
    /const settledVenture = \(result\.venture_context \?\? null\)/,
    "venture must be read from the settlement result",
  );
  assert.ok(
    !/authorizePaymentForService\([^)]*event\./s.test(src.slice(src.indexOf("settledVenture"))),
    "the venture passed to the rule must not be derived from the request payload",
  );
});

test("retry-onboarding authorizes before it can mint", () => {
  const src = read(RETRY);

  // PAYMENT_SETTLED is retained — it is a cheap early exit — but it is no
  // longer sufficient, and the authorization call must precede onboarding.
  assert.match(
    src,
    /if \(data\.payment_status !== "PAYMENT_SETTLED" \|\| !data\.settled_receipt\)/,
    "the settled precondition is still required",
  );

  const auth = src.indexOf("authorizePaymentForService(");
  const mint = src.indexOf("onboardBigIceAthlete(");
  assert.ok(auth > 0, "retry-onboarding must authorize");
  assert.ok(mint > auth, "authorization must run BEFORE onboarding is driven");

  assert.match(
    src,
    /authorizePaymentForService\(db, data\.settled_receipt, "BIG_ICE"\)/,
    "the venture must be pinned to this route's venture, not inferred",
  );

  // Calling the rule is not the same as OBEYING it. An earlier version of
  // this guard checked only that the call happened, and survived a mutation
  // that neutered the branch to `if (false)` — the call ran, the answer was
  // discarded, and the route minted anyway.
  assert.match(
    src.slice(auth, mint),
    /if \(!mayCreateCustomerValue\(authorization\)\) \{/,
    "the authorization answer must gate a branch between the call and the mint",
  );
  assert.match(
    src.slice(auth, mint),
    /return NextResponse\.json\([\s\S]*?\{ status: 409 \}/,
    "a denied authorization must return, not fall through to onboarding",
  );
});

test("NRHL onboarding verifies a payment before minting an identity", () => {
  const src = read(NRHL_ONBOARD);

  const auth = src.indexOf("authorizePaymentForService(");
  const mint = src.indexOf('db.rpc("nrhl_next_athlete_code")');
  const guardian = src.indexOf('db.rpc("link_guardian"');

  assert.ok(auth > 0, "onboard-paid-athlete must verify the payment server-side");
  assert.ok(
    mint > auth,
    "the payment check must precede minting — a receipt string is not proof of payment",
  );
  assert.ok(
    guardian > auth,
    "the payment check must precede writing guardian PII",
  );
  assert.match(
    src,
    /authorizePaymentForService\(db, input\.mpesaReceipt, "NRHL"\)/,
    "a Big Ice receipt must not be able to onboard an NRHL athlete",
  );
});

test("only three application paths draw a permanent athlete code", () => {
  // The canonical rule is ONE REAL ATHLETE = ONE PERMANENT ID, and it is
  // only auditable while the set of minting sites stays enumerable. A
  // fourth is not necessarily wrong — it must be reviewed against D-20/M1
  // and this boundary before it ships.
  const minting = ISSUANCE_SITES.filter((f) =>
    /\.rpc\("(?:nrhl|bigice)_next_athlete_code"\)/.test(read(f)),
  );
  assert.deepEqual(
    minting,
    ISSUANCE_SITES,
    "an expected issuance site stopped minting — re-verify the census before trusting it",
  );
});
