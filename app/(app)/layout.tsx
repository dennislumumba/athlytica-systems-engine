import type { ReactNode } from "react";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { AppShell } from "@/components/workspace/AppShell";

export const metadata = {
  title: "Athlytica Workspaces",
  description: "NRHL, Big Ice Academy, and Athlytica HQ under one sign-on.",
};

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceProvider>
      <AppShell>{children}</AppShell>
    </WorkspaceProvider>
  );
}
