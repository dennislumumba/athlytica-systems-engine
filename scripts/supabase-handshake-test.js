#!/usr/bin/env node
"use strict";

const fetch = require("node-fetch");
const path = require("node:path");
const fs = require("node:fs");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonUrl || !anonKey) {
  console.error("Missing one or more required Supabase env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

(async () => {
  console.log(`SUPABASE_URL=${supabaseUrl}`);
  console.log(`NEXT_PUBLIC_SUPABASE_URL=${anonUrl}`);

  const handshakeEndpoint = process.env.TEST_HANDSHAKE_ENDPOINT || "http://localhost:3000/api/v1/debug/supabase-handshake";

  try {
    const res = await fetch(handshakeEndpoint, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    const body = await res.text();
    console.log(`Handshake endpoint status: ${res.status} ${res.statusText}`);
    console.log(body);
    process.exit(res.ok ? 0 : 1);
  } catch (err) {
    console.error("Handshake request failed:", err.message || err);
    process.exit(1);
  }
})();
