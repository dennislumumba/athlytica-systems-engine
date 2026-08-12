// =====================================================================
// A GOOGLE FORMS SUBMISSION IS NOT A PAYMENT
//
// Phase 0.3G. `onboard_athlete_from_google_form` writes
// cohort_session_registry.enrollment_status = 'enrolled' together with a
// price_tier_id, and no payment appears anywhere in that path. F-7 asked
// whether that constitutes a paid entitlement.
//
// The answer, from D-26: Google Forms is UNPAID / ADMINISTRATIVE intake.
// A submission means "an athlete has been registered into a cohort", not
// "a parent paid". The four concepts stay separate:
//
//   REGISTRATION  someone submitted an athlete
//   ENROLLMENT    the organization accepted them onto a roster
//   PAYMENT       money arrived and passed the M4 boundary
//   ENTITLEMENT   they may consume a paid product
//
// cohort_enrollment_status_enum is {enrolled, waitlisted, cancelled,
// completed} — a roster vocabulary with no payment concept in it, which is
// correct. `enrolled` is not a lie; the danger is a future consumer
// READING it as payment because the row also carries a price.
//
// These guards keep the two apart at the only places they could meet.
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const GFORMS = "app/api/v1/onboarding/google-forms/route.ts";
const PORTAL = "app/api/v1/portal/route.ts";
const RPC = "core-engine/schemas/onboarding_google_form_rpc.sql";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const writeTargets = (src: string) =>
  [...src.matchAll(/\.from\("([^"]+)"\)\s*\.(?:insert|upsert|update|delete)/g)].map((m) => m[1]!);

test("a Google Forms submission cannot record a payment", () => {
  const src = read(GFORMS);
  const written = writeTargets(src);

  for (const moneyTable of ["payment_events", "registrations", "payment_reconciliation_exception"]) {
    assert.ok(
      !written.includes(moneyTable),
      `the Google Forms path must not write ${moneyTable}: a form submission is not money`,
    );
  }
  assert.ok(
    !/settle_payment_transaction/.test(src),
    "the Google Forms path must not settle anything",
  );
});

test("a Google Forms submission cannot create paid entitlement", () => {
  const written = writeTargets(read(GFORMS));

  // bigice_enrollment and bigice_document are the paid artefacts: one is
  // written only after payment authorization, the other only by the pack
  // delivery that follows it.
  for (const paid of ["bigice_athlete", "bigice_enrollment", "bigice_document"]) {
    assert.ok(
      !written.includes(paid),
      `the Google Forms path must not write ${paid} — that is the payment-authorized plane`,
    );
  }
});

test("administrative enrollment remains possible — the path still enrolls", () => {
  // The point of D-26 is NOT to stop Google Forms creating enrollments. An
  // athlete may legitimately be enrolled without paying. This asserts the
  // capability survives, so a future "fix" cannot quietly delete it.
  const src = read(GFORMS);
  assert.match(
    src,
    /\.rpc\("onboard_athlete_from_google_form"/,
    "the administrative enrollment path must remain",
  );

  const rpc = read(RPC);
  assert.match(
    rpc,
    /INSERT INTO cohort_session_registry/i,
    "the RPC must still create a cohort enrollment",
  );
  assert.match(
    rpc,
    /INSERT INTO athlete\b/i,
    "the RPC must still create the athlete identity",
  );
});

test("an unpaid registration is never marked as a TEST payment", () => {
  const src = read(GFORMS);

  // TEST means synthetic, non-production financial activity. UNPAID means a
  // real athlete with no payment. Conflating them would either hide real
  // registrations or fabricate financial records, so this path writes no
  // classification at all.
  assert.ok(
    !writeTargets(src).includes("record_classification"),
    "an ordinary unpaid registration must not be classified as a TEST payment",
  );
  assert.ok(
    !/record_classification/.test(read(RPC)),
    "the RPC must not classify either",
  );
});

test("portal schedule access follows guardian ownership, not enrollment_status", () => {
  const src = read(PORTAL);

  // The cohort query is reachable only through passportIds, which are the
  // passport_athlete_id values of bigice_athlete rows already resolved from
  // the authenticated guardian's e-mail. enrollment_status is a filter
  // WITHIN that scope, never the thing that grants it — so an unpaid
  // Google Forms enrollment is invisible until a payment-authorized
  // bigice_athlete row bridges to it.
  assert.match(
    src,
    /const passportIds = guardian\.athletes/,
    "portal scope must derive from the resolved guardian's own athletes",
  );
  assert.match(
    src,
    /\.in\("student_athlete_id", passportIds\)/,
    "the cohort query must be scoped to the guardian's own passport ids",
  );
  assert.match(
    src,
    /passportIds\.length\s*\n?\s*\?/,
    "the cohort query must not run at all when the guardian bridges to nothing",
  );
});

test("documents are issued by the paid delivery path only, never from a price tier", () => {
  // A row carrying a price_tier_id must not be able to produce a document.
  // bigice_document is written in exactly one place.
  const delivery = read("lib/services/bigice-delivery.ts");
  assert.ok(
    writeTargets(delivery).includes("bigice_document"),
    "bigice-delivery is the document writer; if that moved, re-verify this guard",
  );

  for (const other of [GFORMS, "app/api/v1/leagues/nrhl/ingest/route.ts"]) {
    assert.ok(
      !writeTargets(read(other)).includes("bigice_document"),
      `${other} must not issue documents`,
    );
  }
});

test("existing Google Forms athletes remain reachable by the ops surfaces", () => {
  // D-26 must not orphan the records it reclassifies. The dashboard reads
  // cohort_session_registry unfiltered by basis or payment, so an
  // administratively enrolled athlete stays visible to staff.
  const dash = read("app/api/v1/workspace/dashboard/route.ts");
  assert.ok(
    dash.includes('.from("cohort_session_registry")'),
    "the dashboard must keep reading the cohort registry",
  );
  assert.ok(
    !/cohort_session_registry"\)[\s\S]{0,400}?\.eq\("enrollment_basis"/.test(dash),
    "ops views must not be filtered to paid enrollments only",
  );
});
