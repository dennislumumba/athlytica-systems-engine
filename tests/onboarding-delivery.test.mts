// Run: node --test tests/onboarding-delivery.test.mts
//
// This code runs on the M-Pesa settlement path, after money has moved and
// the registration is durable. So the failures that matter are not "did
// the email look nice" — they are: does a mail problem throw and unwind a
// settled payment, does an unprovisioned key silently pretend to send,
// and does anything internal reach a parent's inbox.

import assert from "node:assert/strict";
import test from "node:test";
import { mailConfigured, send } from "../lib/services/mailer.ts";
import { deliverOnboardingPack, onboardingEmail } from "../lib/services/onboarding-delivery.ts";
import type { OnboardingVars } from "../lib/services/nrhl-onboarding-pack.ts";

const realFetch = globalThis.fetch;
const realEnv = { key: process.env.RESEND_API_KEY, from: process.env.NRHL_MAIL_FROM };

function withMailEnv(on: boolean) {
  if (on) {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.NRHL_MAIL_FROM = "NRHL <registrations@nairobihockey.com>";
  } else {
    delete process.env.RESEND_API_KEY;
    delete process.env.NRHL_MAIL_FROM;
  }
}

function restore() {
  globalThis.fetch = realFetch;
  if (realEnv.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = realEnv.key;
  if (realEnv.from === undefined) delete process.env.NRHL_MAIL_FROM;
  else process.env.NRHL_MAIL_FROM = realEnv.from;
}

const VARS: OnboardingVars = {
  athleteName: "Amani Wanjiru",
  athleteId: "ATH-00042",
  athleteAge: 11,
  parentName: "Jane Wanjiru",
  parentPhone: "+254722000111",
  parentEmail: "jane@example.com",
  programmeId: "combine_27500",
  trainingHub: "The Plateau — Lavington Community Hub",
  registrationReference: "ATH-K7QP",
  paymentReference: "TFG7HJ2K9L",
};

// ---------------------------------------------------------------- mailer

test("an unprovisioned key reports CONFIG_DEBT rather than pretending to send", async (t) => {
  withMailEnv(false);
  t.after(restore);
  assert.equal(mailConfigured(), false);
  const res = await send({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
  assert.equal(res.sent, false);
  assert.equal(res.sent === false && res.reason, "CONFIG_DEBT");
});

test("every provider failure is a result, never a throw", async (t) => {
  withMailEnv(true);
  t.after(restore);

  const failures: Array<[string, typeof globalThis.fetch, string]> = [
    ["rejects the request", () => Promise.resolve(new Response("bad from address", { status: 422 })), "REJECTED"],
    ["is unreachable", () => Promise.reject(new Error("ENOTFOUND")), "NETWORK"],
    [
      "hangs until aborted",
      (_u, init) =>
        new Promise((_res, rej) =>
          init?.signal?.addEventListener("abort", () => rej(init.signal!.reason)),
        ),
      "TIMEOUT",
    ],
  ];

  for (const [name, impl, expected] of failures) {
    globalThis.fetch = impl;
    const res = await send({ to: "a@b.com", subject: "x", html: "<p>x</p>" });
    assert.equal(res.sent, false, `${name}: should not report success`);
    assert.equal(res.sent === false && res.reason, expected, `${name}`);
  }
});

test("attachments are base64-encoded and the key never lands in the body", async (t) => {
  withMailEnv(true);
  t.after(restore);
  let captured: { headers: Record<string, string>; body: string } | null = null;
  globalThis.fetch = (_u, init) => {
    captured = {
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: String(init?.body ?? ""),
    };
    return Promise.resolve(
      new Response(JSON.stringify({ id: "msg_1" }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  };

  const res = await send({
    to: "jane@example.com",
    subject: "s",
    html: "<p>hello</p>",
    attachments: [{ filename: "doc.html", content: "<h1>Doc</h1>" }],
  });
  assert.equal(res.sent, true);

  const sent = JSON.parse(captured!.body) as {
    attachments: Array<{ filename: string; content: string }>;
  };
  assert.equal(sent.attachments[0]!.filename, "doc.html");
  assert.equal(
    Buffer.from(sent.attachments[0]!.content, "base64").toString("utf8"),
    "<h1>Doc</h1>",
  );
  assert.ok(!captured!.body.includes("re_test_key"), "the API key must not travel in the body");
  assert.match(captured!.headers.Authorization ?? "", /^Bearer /);
});

// ------------------------------------------------------------ the email

test("the email is parent-facing and carries the references", () => {
  const { subject, html } = onboardingEmail(VARS, { returning: false });
  assert.match(subject, /Amani Wanjiru/);
  for (const needed of ["Jane Wanjiru", "ATH-00042", "ATH-K7QP", "TFG7HJ2K9L", "Performance Hockey Program"]) {
    assert.ok(html.includes(needed), `email omits ${needed}`);
  }
  // Nothing internal, ever.
  for (const banned of ["RESEND", "SUPABASE", "MSISDN", "registration_id", "CONFIG_DEBT", "combine_27500"]) {
    assert.ok(!html.includes(banned), `email leaks ${banned}`);
  }
});

test("a returning family is told their existing profile was reused", () => {
  const fresh = onboardingEmail(VARS, { returning: false }).html;
  const back = onboardingEmail(VARS, { returning: true }).html;
  assert.match(fresh, /profile has now been created/i);
  assert.match(back, /existing NRHL profile has been connected/i);
});

// --------------------------------------------------------- the delivery

/** Minimal stand-in for the two reads deliverOnboardingPack performs. */
function fakeDb(registration: Record<string, unknown> | null, athleteCode?: string) {
  return {
    from(table: string) {
      const row = table === "registrations" ? registration : athleteCode ? { athlete_code: athleteCode } : null;
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return chain;
    },
  } as never;
}

const REG_ROW = {
  account_reference: "ATH-K7QP",
  full_name: "Jane Wanjiru",
  email: "jane@example.com",
  athlete_name: "Amani Wanjiru",
  tier: "combine_27500",
  preferred_campus: "The Plateau",
};

test("delivery is skipped, not attempted, when mail is unprovisioned", async (t) => {
  withMailEnv(false);
  t.after(restore);
  const out = await deliverOnboardingPack(fakeDb(REG_ROW), "reg-1");
  assert.equal(out.delivered, false);
  assert.match(out.delivered === false ? out.reason : "", /not provisioned/i);
});

test("a settled registration produces the full new-athlete pack", async (t) => {
  withMailEnv(true);
  t.after(restore);
  let payload: { to: string[]; attachments: Array<{ filename: string }> } | null = null;
  globalThis.fetch = (_u, init) => {
    payload = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({ id: "m1" }), { status: 200 }));
  };

  const out = await deliverOnboardingPack(fakeDb(REG_ROW), "reg-1", "TFG7HJ2K9L");
  assert.equal(out.delivered, true);
  assert.equal(payload!.to[0], "jane@example.com");
  const names = payload!.attachments.map((a) => a.filename).join(" ");
  for (const slug of ["receipt", "welcome", "agreement", "prospectus"]) {
    assert.ok(names.includes(slug), `pack is missing the ${slug}`);
  }
});

test("a known athlete gets the shorter returning pack and keeps their code", async (t) => {
  withMailEnv(true);
  t.after(restore);
  let payload: { attachments: Array<{ filename: string }> } | null = null;
  globalThis.fetch = (_u, init) => {
    payload = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({ id: "m2" }), { status: 200 }));
  };

  const out = await deliverOnboardingPack(fakeDb(REG_ROW, "ATH-00042"), "reg-1");
  assert.equal(out.delivered, true);
  assert.equal(out.delivered === true && out.returning, true);
  assert.equal(out.delivered === true && out.athleteId, "ATH-00042");
  const names = payload!.attachments.map((a) => a.filename).join(" ");
  assert.ok(!names.includes("prospectus"), "a returning family should not get the prospectus again");
  assert.ok(names.includes("programme-confirmation"));
});

test("a tier with no athlete pack is declined, not guessed at", async (t) => {
  withMailEnv(true);
  t.after(restore);
  globalThis.fetch = () => {
    throw new Error("must not send");
  };
  const out = await deliverOnboardingPack(fakeDb({ ...REG_ROW, tier: "enterprise_150k" }), "reg-1");
  assert.equal(out.delivered, false);
  assert.match(out.delivered === false ? out.reason : "", /no athlete onboarding pack/);
});

test("a missing email address fails cleanly instead of throwing", async (t) => {
  withMailEnv(true);
  t.after(restore);
  const out = await deliverOnboardingPack(fakeDb({ ...REG_ROW, email: null }), "reg-1");
  assert.equal(out.delivered, false);
  assert.match(out.delivered === false ? out.reason : "", /no email/i);
});

test("a database failure cannot escape as an exception", async (t) => {
  withMailEnv(true);
  t.after(restore);
  const exploding = {
    from() {
      throw new Error("connection reset");
    },
  } as never;
  const out = await deliverOnboardingPack(exploding, "reg-1");
  assert.equal(out.delivered, false);
  assert.match(out.delivered === false ? out.reason : "", /connection reset/);
});
