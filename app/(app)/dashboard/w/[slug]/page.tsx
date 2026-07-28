"use client";

// =====================================================================
// TENANT ROUTE ALIAS — /dashboard/w/<slug> for every workspace.
//
//   /dashboard/w/nrhl     → NRHL League Command Center (six tabs)
//   /dashboard/w/big-ice  → Big Ice academy dashboard
//   /dashboard/w/tta      → TTA football academy dashboard
//   /dashboard/w/hq       → Athlytica HQ dashboard
//
// One dynamic segment rather than four hand-written routes: the slug
// table in config/workspaces.ts is the only place a workspace's URL is
// spelled, so adding a venture cannot leave three of four routes behind.
//
// The alias does two things and stops: it sets the active workspace in
// the shell (so the switcher, sidebar and API reads all follow), then
// renders that workspace's surface. It grants nothing — the workspace
// endpoint still refuses a workspace the caller holds no role in, so a
// typed URL cannot become access.
// =====================================================================

import { useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { WORKSPACES, workspaceFromSlug } from "@/config/workspaces";
import { useWorkspace } from "@/components/workspace/WorkspaceProvider";
import { BigIceDashboard } from "@/components/workspace/BigIceDashboard";
import { HqDashboard } from "@/components/workspace/HqDashboard";
import { TtaDashboard } from "@/components/workspace/TtaDashboard";
import { theme } from "@/components/workspace/ui";

export default function WorkspaceAliasPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const { workspace, setWorkspace, available, ready, actor, data, loading } = useWorkspace();

  const target = workspaceFromSlug(params?.slug);

  // Point the shell at the aliased workspace before anything renders it.
  useEffect(() => {
    if (target && workspace !== target) setWorkspace(target);
  }, [target, workspace, setWorkspace]);

  // NRHL owns a richer surface than the generic venture panel — the
  // alias is a doorway to it, not a second implementation of it.
  useEffect(() => {
    if (target === "nrhl") router.replace("/dashboard/leagues/nrhl/overview");
  }, [target, router]);

  if (!target) {
    return (
      <Notice title="Unknown workspace">
        <code>/dashboard/w/{String(params?.slug ?? "")}</code> does not match any venture.{" "}
        <Link href="/dashboard" style={{ color: theme.accent }}>
          Back to the command canvas
        </Link>
        .
      </Notice>
    );
  }

  if (!ready || !actor) return <Notice title="Checking your session…" />;

  // A grant the actor does not hold is a 403 from the API either way;
  // saying so here beats an empty panel with no explanation.
  if (!available.includes(target)) {
    return (
      <Notice title={`No access to ${WORKSPACES[target].label}`}>
        Signed in as <strong>{actor.email}</strong>, which holds no role in this workspace. Ask the
        Athlytica HQ administrator for a grant.
      </Notice>
    );
  }

  if (target === "nrhl" || workspace !== target || !data) {
    return <Notice title={loading ? "Loading…" : `Opening ${WORKSPACES[target].label}…`} />;
  }

  if (target === "big_ice") return <BigIceDashboard />;
  if (target === "tta") return <TtaDashboard />;
  return <HqDashboard />;
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section style={{ maxWidth: 560, padding: "8px 0" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>{title}</h1>
      {children && (
        <p style={{ color: theme.muted, lineHeight: 1.7, margin: 0, fontSize: 14 }}>{children}</p>
      )}
    </section>
  );
}
