"use client";

// The main dashboard is the command canvas: one cross-workspace surface
// under two lenses (Founder Command / Head Coach Hub). Per-venture
// dashboards moved to /dashboard/venture, where the shell's panel
// anchors point.

import { CommandDashboard } from "@/components/workspace/CommandDashboard";

export default function DashboardPage() {
  return <CommandDashboard />;
}
