"use client";

// =====================================================================
// COMMAND CANVAS FIXTURE HARNESS — /command-preview
//
// The live canvas sits behind Supabase auth, which makes layout and
// responsiveness impossible to check without a session. This route mounts
// the same presenter against lib/services/command-fixture.ts, through the
// real derivation module, so what renders here is what production
// arithmetic produces.
//
// Development only: returns 404 in a production build, so nothing
// synthetic can ever be mistaken for platform data.
// =====================================================================

import { useState } from "react";
import { notFound } from "next/navigation";
import { CommandCanvas } from "@/components/workspace/CommandDashboard";
import { theme } from "@/components/workspace/ui";
import { COMMAND_FIXTURE, FIXTURE_NOW } from "@/lib/services/command-fixture";
import { buildCommand } from "@/lib/services/command-metrics";
import type { CommandMode } from "@/config/command";

const PAYLOAD = buildCommand(COMMAND_FIXTURE, FIXTURE_NOW);

export default function CommandPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const [mode, setMode] = useState<CommandMode>("founder");

  return (
    <main style={{ padding: "16px 20px 40px", maxWidth: 1440, margin: "0 auto" }}>
      <p
        style={{
          background: "#2c2410",
          border: `1px solid ${theme.warn}55`,
          color: theme.warn,
          borderRadius: 10,
          padding: "8px 12px",
          fontSize: 12,
          marginTop: 0,
        }}
      >
        Fixture harness — synthetic data, development builds only. The live canvas is /dashboard.
      </p>
      <CommandCanvas
        payload={PAYLOAD}
        mode={mode}
        modes={["founder", "coach"]}
        onMode={setMode}
        onRefresh={() => undefined}
        canApprove
        onApprove={async (ids) => ({
          success: false,
          error: `Fixture harness: ${ids.length} record(s) would be promoted against the live database.`,
        })}
        actorEmail="fixture@athlytica.local"
        roleLabel="GLOBAL_FOUNDER"
      />
    </main>
  );
}
