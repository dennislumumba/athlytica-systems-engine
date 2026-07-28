"use client";

// Venture deep dive. The active workspace selects the dashboard; this is
// the drill-down the command canvas at /dashboard links into, and the
// target of every sidebar panel anchor.

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { NrhlDashboard } from "@/components/workspace/NrhlDashboard";
import { BigIceDashboard } from "@/components/workspace/BigIceDashboard";
import { HqDashboard } from "@/components/workspace/HqDashboard";
import { TtaDashboard } from "@/components/workspace/TtaDashboard";
import { theme } from "@/components/workspace/ui";
import { WORKSPACES } from "@/config/workspaces";

export default function VenturePage() {
  const { workspace, data, loading } = useWorkspace();

  if (!workspace) {
    return <p style={{ color: theme.muted }}>Select a workspace to continue.</p>;
  }
  if (!data) {
    return (
      <p style={{ color: theme.muted }}>
        {loading ? `Loading ${WORKSPACES[workspace].label}…` : "No data available for this workspace."}
      </p>
    );
  }

  if (workspace === "tta") return <TtaDashboard />;
  if (workspace === "nrhl") return <NrhlDashboard />;
  if (workspace === "big_ice") return <BigIceDashboard />;
  return <HqDashboard />;
}
