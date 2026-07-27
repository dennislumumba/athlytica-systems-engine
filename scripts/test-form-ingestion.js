#!/usr/bin/env node
"use strict";

// Lean, dependency-free smoke test for the onboarding webhook.
// Fires one signed fake Google Form submission at a locally running
// `next dev` server. No test framework — just run:
//   node scripts/test-form-ingestion.js [formResponseId]

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Next.js's own dotenv loading only applies to the Next.js process — this
// script is plain Node, so it loads .env.local itself. Values already set
// in the shell take precedence over the file.
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const ENDPOINT = process.env.TEST_ENDPOINT_URL || "http://localhost:3000/api/v1/onboarding/google-forms";
const SECRET = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

if (!SECRET) {
  console.error("Missing GOOGLE_FORMS_WEBHOOK_SECRET (set it in .env.local or the shell environment).");
  process.exit(1);
}

function buildFakePayload(formResponseId) {
  return {
    formResponseId,
    athlete: {
      legalName: "Test Athlete",
      dateOfBirth: "2012-04-15",
      sexAtBirth: "undisclosed",
      nationalities: ["KEN"],
      primarySportCode: "ice_hockey",
    },
    enrollment: {
      selectedTierName: "Baseline Track",
      trackType: "basic_skating",
      cohortLabel: "Test Cohort A",
      sessionSlot: 1,
      sessionDayOfWeek: 3,
      windowStartTime: "16:00",
      windowEndTime: "17:00",
      capacity: 12,
      seasonStartDate: "2026-09-01",
      seasonEndDate: "2026-12-01",
    },
  };
}

function sign(body, secret) {
  return crypto.createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

async function main() {
  const formResponseId = process.argv[2] || `test-${crypto.randomUUID()}`;
  const payload = buildFakePayload(formResponseId);
  const body = JSON.stringify(payload);
  const signature = sign(body, SECRET);

  console.log(`POST ${ENDPOINT}`);
  console.log(`formResponseId: ${formResponseId}`);

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Signature": signature,
    },
    body,
  });

  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  console.log(`Status: ${res.status}`);
  console.log(JSON.stringify(parsed, null, 2));

  process.exit(res.ok ? 0 : 1);
}

main().catch((err) => {
  console.error("Request failed:", err);
  process.exit(1);
});
