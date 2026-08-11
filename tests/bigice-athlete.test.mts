// Run: node --test tests/bigice-athlete.test.mts
//
// Guards Big Ice identity resolution. The failures worth testing are the
// silent ones: a MATCH that attaches a payment to the wrong child, and a
// NEW that splits one child's development record in two. Both look like
// a successful registration from the outside.

import assert from "node:assert/strict";
import test from "node:test";
import {
  matchAthlete,
  normaliseName,
  type AthleteCandidate,
} from "../lib/services/bigice-athlete.ts";
import { priceSource } from "../lib/services/bigice-onboarding.ts";

const AMARA: AthleteCandidate = {
  biifCode: "BIIF-2026-0501",
  fullName: "Amara Wanjiku",
  dateOfBirth: "2016-04-02",
  guardianPhoneE164: "+254712345678",
  guardianEmail: "parent@example.com",
  legacyCode: "BI-OLD-14",
};

const ROSTER = [AMARA];

test("normaliseName matches the SQL name_key column", () => {
  assert.equal(normaliseName("  Amara   Wanjiku "), "amara wanjiku");
  assert.equal(normaliseName("O'Brien-Smith"), "o brien smith");
});

test("name plus household phone is a match", () => {
  const r = matchAthlete(
    { fullName: "amara wanjiku", guardianPhoneE164: "+254712345678" },
    ROSTER,
  );
  assert.equal(r.verdict, "MATCH");
  assert.equal(r.athlete?.biifCode, "BIIF-2026-0501");
});

test("a sibling on the same phone is a NEW athlete, never a match", () => {
  // The expensive failure: merging two children into one Athlete ID.
  const r = matchAthlete(
    { fullName: "Baraka Wanjiku", guardianPhoneE164: "+254712345678" },
    ROSTER,
  );
  assert.equal(r.verdict, "NEW");
});

test("a shared name with nothing corroborating goes to review", () => {
  const r = matchAthlete({ fullName: "Amara Wanjiku", guardianPhoneE164: "+254799999999" }, ROSTER);
  assert.equal(r.verdict, "REVIEW");
});

test("a supplied Athlete ID is not enough on its own", () => {
  // Guessing BIIF-2026-0501 must not hand over another child's record.
  const r = matchAthlete(
    {
      fullName: "Someone Else",
      guardianPhoneE164: "+254700000000",
      claimedBiifCode: "BIIF-2026-0501",
    },
    ROSTER,
  );
  assert.equal(r.verdict, "REVIEW");
});

test("a supplied Athlete ID corroborated by the household resolves", () => {
  const r = matchAthlete(
    { fullName: "Amara W", guardianPhoneE164: "+254712345678", claimedBiifCode: "BIIF-2026-0501" },
    ROSTER,
  );
  assert.equal(r.verdict, "MATCH");
});

test("an unknown Athlete ID is reviewed, not silently ignored", () => {
  const r = matchAthlete({ fullName: "New Child", claimedBiifCode: "BIIF-2026-9999" }, ROSTER);
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.athlete, null);
});

test("a legacy id resolves without household corroboration", () => {
  const r = matchAthlete({ fullName: "A. Wanjiku", legacyCode: "BI-OLD-14" }, ROSTER);
  assert.equal(r.verdict, "MATCH");
});

test("an unrecognised family is new", () => {
  const r = matchAthlete(
    { fullName: "Zawadi Otieno", guardianPhoneE164: "+254733222111" },
    ROSTER,
  );
  assert.equal(r.verdict, "NEW");
});

// ---------------------------------------------------------------------
// The settlement path carries no raw phone — only the HMAC of it. If the
// matcher ignored the hash, every paid Big Ice registration would match
// on name alone, which is the ATH-047 collision rebuilt.
// ---------------------------------------------------------------------

const HASH_A = "a1b2c3d4e5f60718";
const HASH_B = "ffffffffffffffff";

const HASHED: AthleteCandidate = {
  biifCode: "BIIF-2026-0502",
  fullName: "Njeri Kamau",
  guardianMsisdnHash: HASH_A,
};

test("the household hash matches when no raw phone exists anywhere", () => {
  const r = matchAthlete({ fullName: "Njeri Kamau", guardianMsisdnHash: HASH_A }, [HASHED]);
  assert.equal(r.verdict, "MATCH");
  assert.equal(r.athlete?.biifCode, "BIIF-2026-0502");
});

test("the same name from a different household is not a match", () => {
  const r = matchAthlete({ fullName: "Njeri Kamau", guardianMsisdnHash: HASH_B }, [HASHED]);
  assert.equal(r.verdict, "REVIEW");
});

test("a sibling under one hashed household is still a new athlete", () => {
  const r = matchAthlete({ fullName: "Mwangi Kamau", guardianMsisdnHash: HASH_A }, [HASHED]);
  assert.equal(r.verdict, "NEW");
});

test("academy packages and code tiers name exactly one price source", () => {
  // bigice_enrollment's CHECK takes one or the other; naming both would
  // let the stored enrollment disagree with what was charged.
  const academy = priceSource("academy_7c9e6679-7425-40de-944b-e07fc1f90ae7");
  assert.equal(academy.priceTierId, "7c9e6679-7425-40de-944b-e07fc1f90ae7");
  assert.equal(academy.tierId, null);

  const coded = priceSource("combine_27500");
  assert.equal(coded.priceTierId, null);
  assert.equal(coded.tierId, "combine_27500");
});

test("an already-duplicated roster is reported, not picked from", () => {
  const twin = { ...AMARA, biifCode: "BIIF-2026-0777" };
  const r = matchAthlete(
    { fullName: "Amara Wanjiku", guardianPhoneE164: "+254712345678" },
    [AMARA, twin],
  );
  assert.equal(r.verdict, "REVIEW");
  assert.equal(r.athlete, null);
});
