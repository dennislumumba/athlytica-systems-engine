"use client";

// The active workspace selects the dashboard; the shell owns identity,
// switching, and the perspective lens.

import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { NrhlDashboard } from "@/components/workspace/NrhlDashboard";
import { BigIceDashboard } from "@/components/workspace/BigIceDashboard";
import { HqDashboard } from "@/components/workspace/HqDashboard";
import { theme } from "@/components/workspace/ui";
import { WORKSPACES } from "@/config/workspaces";

export default function DashboardPage() {
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

  if (workspace === "nrhl") return <NrhlDashboard />;
  if (workspace === "big_ice") return <BigIceDashboard />;
  return <HqDashboard />;
}
