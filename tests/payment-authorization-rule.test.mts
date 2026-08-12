// =====================================================================
// THE AUTHORIZATION RULE'S TYPESCRIPT HALF
//
// public.payment_service_authorization decides. This module's job is
// narrower and entirely testable without a database:
//
//   1. supply the one fact the database cannot see — which M-Pesa rail
//      this deployment is pointed at (DARAJA_ENV);
//   2. map the RPC's answer to a typed verdict;
//   3. DENY on every path where it cannot get a clean answer.
//
// (3) is the one that matters. A lookup that fails is not a lookup that
// said yes, and the cost of getting that backwards is a permanent
// Athlete ID minted because a network call timed out.
//
// The SQL half is proved separately: 29/29 assertions in a rolled-back
// transaction against the production schema, in
// docs/phase0/PAYMENT_AUTHORIZATION_BOUNDARY.md §12.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authorizePaymentForService,
  mayCreateCustomerValue,
  railIsProduction,
} from "../lib/services/payment-authorization.ts";

/** Records what the module sent, and replies with what the test dictates. */
function stubDb(reply: { data?: unknown; error?: unknown }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: reply.data ?? null, error: reply.error ?? null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const AUTHORIZED_ROW = {
  status: "AUTHORIZED",
  reason: "MATCHED_PRODUCTION_REGISTRATION",
  registration_id: "11111111-2222-3333-4444-555555555555",
  venture_context: "BIG_ICE",
};

test("an authorized payment maps through with its registration and venture", async () => {
  const { db } = stubDb({ data: AUTHORIZED_ROW });
  const auth = await authorizePaymentForService(db, "REAL0001", "BIG_ICE");

  assert.equal(auth.status, "AUTHORIZED");
  assert.ok(mayCreateCustomerValue(auth));
  assert.equal(auth.status === "AUTHORIZED" && auth.registrationId, AUTHORIZED_ROW.registration_id);
  assert.equal(auth.status === "AUTHORIZED" && auth.ventureContext, "BIG_ICE");
});

test("the rail flag is sent to the rule and is never taken from a caller", async () => {
  const { db, calls } = stubDb({ data: AUTHORIZED_ROW });
  await authorizePaymentForService(db, "REAL0001", "NRHL");

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, "payment_service_authorization");
  assert.deepEqual(Object.keys(calls[0]!.args).sort(), [
    "p_rail_is_production",
    "p_receipt",
    "p_venture",
  ]);
  // Whatever DARAJA_ENV says in this process, the flag is a boolean the
  // module derived — there is no parameter by which a caller could set it.
  assert.equal(typeof calls[0]!.args.p_rail_is_production, "boolean");
  assert.equal(calls[0]!.args.p_rail_is_production, railIsProduction());
  assert.equal(calls[0]!.args.p_venture, "NRHL");
});

test("a denial maps through with its reason", async () => {
  const { db } = stubDb({
    data: { status: "NOT_AUTHORIZED", reason: "CLASSIFIED_TEST", receipt: "AUDITTEST001" },
  });
  const auth = await authorizePaymentForService(db, "AUDITTEST001", "NRHL");

  assert.equal(auth.status, "NOT_AUTHORIZED");
  assert.equal(auth.reason, "CLASSIFIED_TEST");
  assert.ok(!mayCreateCustomerValue(auth));
});

test("reconciliation is its own verdict, distinct from denial", async () => {
  const { db } = stubDb({
    data: { status: "RECONCILIATION_REQUIRED", reason: "OPEN_RECONCILIATION_EXCEPTION" },
  });
  const auth = await authorizePaymentForService(db, "DISPUTED1", "BIG_ICE");

  assert.equal(auth.status, "RECONCILIATION_REQUIRED");
  assert.ok(!mayCreateCustomerValue(auth));
});

test("an RPC error denies rather than falling open", async () => {
  const { db } = stubDb({ error: { message: "connection reset", code: "08006" } });
  const auth = await authorizePaymentForService(db, "REAL0001", "BIG_ICE");

  assert.equal(auth.status, "NOT_AUTHORIZED");
  assert.match(auth.reason, /AUTHORIZATION_LOOKUP_FAILED/);
});

test("a missing function names the migration and still denies", async () => {
  const { db } = stubDb({ error: { message: "does not exist", code: "42883" } });
  const auth = await authorizePaymentForService(db, "REAL0001", "BIG_ICE");

  assert.equal(auth.status, "NOT_AUTHORIZED");
  assert.match(auth.reason, /SCHEMA_DEBT/);
  assert.match(auth.reason, /m4_payment_authorization_boundary/);
});

test("a null or malformed answer denies", async () => {
  for (const data of [null, {}, { status: "SOMETHING_ELSE" }, "not an object"]) {
    const { db } = stubDb({ data });
    const auth = await authorizePaymentForService(db, "REAL0001", "BIG_ICE");
    assert.equal(auth.status, "NOT_AUTHORIZED", `expected denial for ${JSON.stringify(data)}`);
  }
});

test("AUTHORIZED without a registration id denies", async () => {
  // The rule never returns this. If it ever did — a refactor dropping the
  // field, a partial row — the answer is unusable, and an unusable answer
  // is not permission to mint a permanent identity.
  const { db } = stubDb({ data: { status: "AUTHORIZED", venture_context: "BIG_ICE" } });
  const auth = await authorizePaymentForService(db, "REAL0001", "BIG_ICE");
  assert.equal(auth.status, "NOT_AUTHORIZED");
});

test("an absent receipt is refused without consulting the database", async () => {
  for (const receipt of [null, undefined, "", "   "]) {
    const { db, calls } = stubDb({ data: AUTHORIZED_ROW });
    const auth = await authorizePaymentForService(db, receipt, "BIG_ICE");
    assert.equal(auth.status, "NOT_AUTHORIZED");
    assert.equal(auth.reason, "RECEIPT_ABSENT");
    assert.equal(calls.length, 0, "an empty receipt must not reach the database");
  }
});

test("railIsProduction is exact, matching the STK client's strictness", () => {
  const original = process.env.DARAJA_ENV;
  try {
    process.env.DARAJA_ENV = "production";
    assert.equal(railIsProduction(), true);

    // utils/mpesaDaraja.ts selects the sandbox for anything but the exact
    // lowercase string. If these two ever disagree, a deployment pushes STK
    // to the sandbox while authorizing service as production.
    for (const v of ["Production", "PRODUCTION", "prod", "sandbox", ""]) {
      process.env.DARAJA_ENV = v;
      assert.equal(railIsProduction(), false, `"${v}" must not read as the production rail`);
    }
    delete process.env.DARAJA_ENV;
    assert.equal(railIsProduction(), false, "unset must not read as the production rail");
  } finally {
    if (original === undefined) delete process.env.DARAJA_ENV;
    else process.env.DARAJA_ENV = original;
  }
});
