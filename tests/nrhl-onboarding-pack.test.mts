// Run: node --test tests/nrhl-onboarding-pack.test.mts
//
// These documents are the last thing a family reads after paying, and
// the first thing they will quote back if something disagrees with the
// site. Two failures matter: a retired claim creeping back in (every one
// of these was live in the 2026 samples), and the itemised sessions
// drifting away from the total hours printed beside them.

import assert from "node:assert/strict";
import test from "node:test";
import {
  PROGRAMME_FACTS,
  fillTemplate,
  onboardingPack,
  parentProspectus,
  paymentReceipt,
  performanceAgreement,
  welcomePack,
  type OnboardingVars,
} from "../lib/services/nrhl-onboarding-pack.ts";
import { REGISTRATION_TIERS } from "../config/registration-fees.ts";

const VARS: OnboardingVars = {
  athleteName: "Amani Wanjiru",
  athleteId: "ATH-00042",
  athleteAge: 11,
  parentName: "Jane Wanjiru",
  parentPhone: "+254722000111",
  parentEmail: "jane@example.com",
  programmeId: "combine_27500",
  trainingHub: "The Plateau — Lavington Community Hub",
  preferredDays: "Tuesday, Saturday",
  preferredTimes: "After school",
  registrationReference: "ATH-K7QP",
  paymentReference: "TFG7HJ2K9L",
};

const everyDocument = () => [
  parentProspectus(),
  performanceAgreement(VARS),
  welcomePack(VARS),
  welcomePack(VARS, { returning: true }),
  paymentReceipt(VARS),
  ...(["baseline_7500", "acceleration_45000"] as const).flatMap((programmeId) => [
    performanceAgreement({ ...VARS, programmeId }),
    welcomePack({ ...VARS, programmeId }),
    paymentReceipt({ ...VARS, programmeId }),
  ]),
];

// ---------------------------------------------------------------------
// The regression that matters: stale copy coming back
// ---------------------------------------------------------------------

/** Every one of these was in the samples this pack replaced. */
const RETIRED: Array<[RegExp, string]> = [
  [/\b6\s*[–-]\s*14\b/, "ages 6–14 (the programme is 8–15)"],
  [/May\s*18|July\s*31|May[–-]July/i, "the retired May–July pod window"],
  [/August 2026 (league|launch)|draft-only/i, "the retired August 2026 draft-only league"],
  [/\b24\s+(bi-weekly|high-intensity|pod)\b/i, "24 bi-weekly pod sessions"],
  [/Pesapal/i, "Pesapal as a payment method"],
  [/Scouting Passport/i, "Scouting Passport (now Digital Athlete Performance Profile)"],
  [/8\s*[–-]\s*12 athletes/i, "8–12 athletes per pod (the cap is 3–8 per coach)"],
  [/mandatory (rule|requirement)|no athlete enters/i, "mandatory-entry framing"],
  // Negative lookbehind, because the documents are REQUIRED to contain
  // "does not guarantee a draft position" — the phrase to catch is the
  // affirmative one.
  [/(?<!not )guarantee[sd]? (a )?(draft|placement|selection|spot)/i, "a selection guarantee"],
  [/Equipment Moat|Fast-Chess|data-governed|technical auditing fee/i, "internal jargon"],
  [/880100/, "the retired paybill"],
  [/Notion Dashboard/i, "the Notion dashboard promise"],
];

test("no retired claim survives in any document", () => {
  for (const html of everyDocument()) {
    for (const [pattern, why] of RETIRED) {
      assert.ok(!pattern.test(html), `document still contains ${why}`);
    }
  }
});

test("any document that raises the draft also carries the disclaimer", () => {
  // The absence of a guarantee is not the same as saying so out loud. Any
  // document that mentions the draft or league selection has to say
  // plainly that completing a phase does not buy one.
  for (const html of everyDocument()) {
    if (!/draft|league selection|seeding/i.test(html)) continue;
    assert.match(
      html,
      /does not guarantee a draft position|does not guarantee a draft/i,
      "a document raises the draft without the no-guarantee line",
    );
  }
});

test("every document leads with NRHL, not Athlytica", () => {
  for (const html of everyDocument()) {
    const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
    const eyebrow = /class="eyebrow">([^<]*)</.exec(html)?.[1] ?? "";
    assert.ok(
      /NRHL|Nairobi Regional Hockey League/i.test(`${title} ${eyebrow}`),
      `masthead does not name NRHL: "${eyebrow}" / "${title}"`,
    );
  }
});

// ---------------------------------------------------------------------
// The arithmetic a parent will check
// ---------------------------------------------------------------------

test("itemised sessions add up to the total hours printed beside them", () => {
  for (const [id, p] of Object.entries(PROGRAMME_FACTS)) {
    const minutes = p.delivery.reduce((sum, line) => {
      const m = /^(\d+)\s*×\s*(\d+)-minute/.exec(line);
      assert.ok(m, `delivery line is not machine-checkable: "${line}"`);
      return sum + Number(m![1]) * Number(m![2]);
    }, 0);
    const stated = Number(/^([\d.]+)/.exec(p.totalHours)![1]);
    assert.equal(minutes / 60, stated, `${id}: itemised ${minutes / 60}h vs stated ${stated}h`);
  }
});

test("document prices come from the server-side tier table", () => {
  for (const [id, p] of Object.entries(PROGRAMME_FACTS)) {
    assert.equal(
      p.amountKes,
      REGISTRATION_TIERS[id as keyof typeof REGISTRATION_TIERS].amountKes,
      `${id} is priced differently in the pack than at checkout`,
    );
  }
});

test("the receipt states the amount actually charged for that programme", () => {
  for (const id of Object.keys(PROGRAMME_FACTS) as Array<keyof typeof PROGRAMME_FACTS>) {
    const html = paymentReceipt({ ...VARS, programmeId: id });
    const expected = PROGRAMME_FACTS[id].amountKes.toLocaleString("en-KE");
    assert.ok(html.includes(expected), `${id} receipt does not show KES ${expected}`);
    for (const other of Object.values(PROGRAMME_FACTS)) {
      if (other.amountKes === PROGRAMME_FACTS[id].amountKes) continue;
      assert.ok(
        !html.includes(`KES ${other.amountKes.toLocaleString("en-KE")}`),
        `${id} receipt also shows another programme's price`,
      );
    }
  }
});

// ---------------------------------------------------------------------
// New vs returning athlete
// ---------------------------------------------------------------------

test("a returning athlete is not sent the new-athlete pack", () => {
  const fresh = onboardingPack(VARS).map((d) => d.slug);
  const returning = onboardingPack(VARS, { returning: true }).map((d) => d.slug);

  assert.ok(fresh.includes("prospectus"), "a new family should receive the prospectus");
  assert.ok(fresh.includes("welcome"));
  assert.ok(!returning.includes("prospectus"), "a returning family does not need the prospectus again");
  assert.ok(returning.includes("programme-confirmation"));
  // Both still get the two documents that are per-purchase, not per-athlete.
  for (const slug of ["receipt", "agreement"]) {
    assert.ok(fresh.includes(slug) && returning.includes(slug));
  }
});

test("the returning-athlete letter says the existing identity was reused", () => {
  const html = welcomePack(VARS, { returning: true });
  assert.match(html, /existing NRHL profile has been connected/i);
  assert.ok(html.includes("ATH-00042"));
});

// ---------------------------------------------------------------------
// Admin-uploaded templates
// ---------------------------------------------------------------------

test("known tokens fill and unknown ones are reported, not silently dropped", () => {
  const { html, unresolved } = fillTemplate(
    "<p>{{ATHLETE_NAME}} / {{ATHLETE_ID}} / {{PROGRAM_PRICE}} / {{COACH_NAME}} / {{INVENTED_FIELD}}</p>",
    VARS,
  );
  assert.ok(html.includes("Amani Wanjiru"));
  assert.ok(html.includes("ATH-00042"));
  assert.ok(html.includes("KES 27,500"));
  // COACH_NAME has no value on VARS and INVENTED_FIELD is not a token:
  // both stay visible so an admin sees exactly what needs completing.
  assert.ok(html.includes("{{COACH_NAME}}"));
  assert.ok(html.includes("{{INVENTED_FIELD}}"));
  assert.deepEqual(unresolved.sort(), ["COACH_NAME", "INVENTED_FIELD"]);
});

test("a value from a registration form cannot inject markup", () => {
  const { html } = fillTemplate("<p>{{ATHLETE_NAME}}</p>", {
    ...VARS,
    athleteName: '<script>alert("x")</script>',
  });
  assert.ok(!html.includes("<script>"), "athlete name was interpolated as live markup");
  assert.ok(html.includes("&lt;script&gt;"));
});

test("whitespace inside a token is tolerated", () => {
  const { html } = fillTemplate("{{ ATHLETE_ID }}", VARS);
  assert.equal(html, "ATH-00042");
});
