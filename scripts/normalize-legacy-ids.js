#!/usr/bin/env node
/* =====================================================================
 * scripts/normalize-legacy-ids.js
 * CONVEX BRIDGE — legacy athlete passport ID reconciliation
 *
 * Normalizes every public.athlete.passport_id that does not match the
 * canonical 'ATH-YYYY-NNNN' serialization (e.g. 'ATH-020'):
 *
 *   1. Scan public.athlete for non-conforming passport_id values.
 *   2. Derive the registration year from created_at (default: 2025).
 *   3. Zero-pad the sequential counter to 4 digits ('020' -> '0020').
 *   4. Apply the rename with per-record compensating rollback, cascade-
 *      updating any passport-bearing columns detected on
 *      athlete_sports, athlete_coaches, athlete_metrics_log.
 *      (Structural note: those junction tables FK on athlete_id UUID,
 *      which never changes — the cascade is only executed where a
 *      passport text column actually exists, detected at runtime.)
 *   5. Export a JSON log of every modified profile to outputs/.
 *
 * SAFETY MODEL
 *   - DRY-RUN IS THE DEFAULT. Nothing is written unless --execute is
 *     passed explicitly.
 *   - Collision guard: planned IDs are checked against both existing
 *     canonical IDs and other planned IDs; collisions abort before any
 *     write.
 *   - Service-role credentials come from env / .env.local, never argv.
 *
 * USAGE
 *   node scripts/normalize-legacy-ids.js --dry-run     # (default) plan only
 *   node scripts/normalize-legacy-ids.js --execute     # apply changes
 * ===================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const CANONICAL_RE = /^ATH-(\d{4})-(\d{4})$/;
const COUNTER_RE = /(\d{1,4})\s*$/;
const DEFAULT_YEAR = 2025;
const PAGE_SIZE = 1000;

const CASCADE_TABLES = ["athlete_sports", "athlete_coaches", "athlete_metrics_log"];
const PASSPORT_COLUMN_CANDIDATES = ["passport_id", "athlete_passport_id"];

// ---------------------------------------------------------------------
// Env loading (.env.local fallback, no dotenv dependency)
// ---------------------------------------------------------------------

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

// ---------------------------------------------------------------------
// Core normalization logic (pure, mirrors lib/converters/convexAdapter)
// ---------------------------------------------------------------------

function planNewId(passportId, createdAt) {
  const counterMatch = COUNTER_RE.exec(String(passportId).trim());
  if (!counterMatch) return { error: "NO_NUMERIC_COUNTER" };

  const counter = Number(counterMatch[1]);
  if (!Number.isInteger(counter) || counter < 0 || counter > 9999) {
    return { error: "COUNTER_OUT_OF_RANGE" };
  }

  let year = DEFAULT_YEAR;
  if (createdAt) {
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) year = d.getUTCFullYear();
  }

  return { newId: `ATH-${year}-${String(counter).padStart(4, "0")}` };
}

// ---------------------------------------------------------------------
// Runtime column detection (PostgREST 42703 probe)
// ---------------------------------------------------------------------

async function detectPassportColumn(supabase, table) {
  for (const col of PASSPORT_COLUMN_CANDIDATES) {
    const { error } = await supabase.from(table).select(col).limit(1);
    if (!error) return col;
    // 42703 = undefined_column; any other error is a real problem.
    if (error.code && error.code !== "42703" && !/column/i.test(error.message)) {
      throw new Error(`Probe of ${table}.${col} failed: ${error.message}`);
    }
  }
  return null;
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const execute = argv.includes("--execute");
  const dryRun = !execute;

  loadEnvFile(path.join(__dirname, "..", ".env.local"));

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (env or .env.local)."
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`mode: ${dryRun ? "DRY-RUN (no writes)" : "EXECUTE"}`);

  // --- 1. Full scan of public.athlete (paged) -------------------------
  const athletes = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("athlete")
      .select("athlete_id, passport_id, legal_name, created_at")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error(`FATAL: athlete scan failed: ${error.message}`);
      process.exit(1);
    }
    athletes.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  console.log(`scanned ${athletes.length} athlete rows`);

  const existingCanonical = new Set(
    athletes.filter((a) => a.passport_id && CANONICAL_RE.test(a.passport_id)).map((a) => a.passport_id)
  );

  // --- 2/3. Build the normalization plan ------------------------------
  const plan = [];
  const skipped = [];
  const plannedIds = new Set();

  for (const a of athletes) {
    if (!a.passport_id) {
      skipped.push({ athlete_id: a.athlete_id, reason: "NULL_PASSPORT_ID" });
      continue;
    }
    if (CANONICAL_RE.test(a.passport_id)) continue; // already conformant

    const { newId, error } = planNewId(a.passport_id, a.created_at);
    if (error) {
      skipped.push({ athlete_id: a.athlete_id, old_id: a.passport_id, reason: error });
      continue;
    }
    if (existingCanonical.has(newId) || plannedIds.has(newId)) {
      skipped.push({ athlete_id: a.athlete_id, old_id: a.passport_id, new_id: newId, reason: "COLLISION" });
      continue;
    }

    plannedIds.add(newId);
    plan.push({
      athlete_id: a.athlete_id,
      legal_name: a.legal_name,
      old_passport_id: a.passport_id,
      new_passport_id: newId,
      created_at: a.created_at ?? null,
      year_source: a.created_at ? "created_at" : `default_${DEFAULT_YEAR}`,
    });
  }

  console.log(`plan: ${plan.length} record(s) to normalize, ${skipped.length} skipped`);
  for (const p of plan) {
    console.log(`  ${p.old_passport_id} -> ${p.new_passport_id}  (${p.legal_name})`);
  }
  for (const s of skipped) {
    console.log(`  SKIP [${s.reason}] athlete ${s.athlete_id}${s.old_id ? ` (${s.old_id})` : ""}`);
  }

  // --- 4. Cascade column detection ------------------------------------
  const cascadeColumns = {};
  for (const table of CASCADE_TABLES) {
    try {
      cascadeColumns[table] = await detectPassportColumn(supabase, table);
    } catch (err) {
      console.error(`FATAL: ${err.message}`);
      process.exit(1);
    }
    console.log(
      `cascade ${table}: ${cascadeColumns[table] ? `column '${cascadeColumns[table]}'` : "no passport column (FKs ride on athlete_id UUID — no-op)"}`
    );
  }

  // --- Apply (with per-record compensating rollback) -------------------
  const modified = [];
  const failures = [];

  if (!dryRun) {
    for (const p of plan) {
      const applied = []; // { table, column, filterCol, filterVal, revertTo }
      try {
        // athlete first — the anchor row.
        const { error: aErr } = await supabase
          .from("athlete")
          .update({ passport_id: p.new_passport_id })
          .eq("athlete_id", p.athlete_id)
          .eq("passport_id", p.old_passport_id); // optimistic concurrency guard
        if (aErr) throw new Error(`athlete update failed: ${aErr.message}`);
        applied.push({
          table: "athlete", column: "passport_id",
          filterCol: "athlete_id", filterVal: p.athlete_id, revertTo: p.old_passport_id,
        });

        // cascade to junction tables that carry a passport column.
        for (const table of CASCADE_TABLES) {
          const col = cascadeColumns[table];
          if (!col) continue;
          const { error: cErr } = await supabase
            .from(table)
            .update({ [col]: p.new_passport_id })
            .eq("athlete_id", p.athlete_id);
          if (cErr) throw new Error(`${table} cascade failed: ${cErr.message}`);
          applied.push({
            table, column: col,
            filterCol: "athlete_id", filterVal: p.athlete_id, revertTo: p.old_passport_id,
          });
        }

        modified.push({ ...p, cascaded_tables: applied.slice(1).map((x) => x.table) });
        console.log(`OK   ${p.old_passport_id} -> ${p.new_passport_id}`);
      } catch (err) {
        // compensating rollback of everything applied for this record.
        console.error(`FAIL ${p.athlete_id}: ${err.message} — rolling back record`);
        for (const step of applied.reverse()) {
          const { error: rbErr } = await supabase
            .from(step.table)
            .update({ [step.column]: step.revertTo })
            .eq(step.filterCol, step.filterVal);
          if (rbErr) {
            console.error(
              `  ROLLBACK FAILURE on ${step.table} for athlete ${p.athlete_id}: ${rbErr.message} — MANUAL INTERVENTION REQUIRED`
            );
          }
        }
        failures.push({ ...p, error: err.message });
      }
    }
  }

  // --- 5. Export JSON log ----------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(__dirname, "..", "outputs");
  fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `normalize-legacy-ids-${dryRun ? "dryrun" : "executed"}-${stamp}.json`);

  const report = {
    generated_at: new Date().toISOString(),
    mode: dryRun ? "dry-run" : "execute",
    scanned: athletes.length,
    planned: plan.length,
    modified: dryRun ? [] : modified,
    planned_changes: plan,
    skipped,
    failures,
    cascade_columns: cascadeColumns,
  };
  fs.writeFileSync(logPath, JSON.stringify(report, null, 2));
  console.log(`log exported: ${logPath}`);

  if (failures.length > 0) process.exit(2);
  console.log(dryRun
    ? "dry-run complete — re-run with --execute to apply."
    : `execution complete — ${modified.length} profile(s) normalized.`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`FATAL: ${err.stack || err.message}`);
    process.exit(1);
  });
}

// Exported for offline verification / unit tests (main is safe to call
// programmatically; dry-run remains the default).
module.exports = { planNewId, CANONICAL_RE, DEFAULT_YEAR, main };
