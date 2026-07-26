"use client";

// =====================================================================
// WORKSPACE CONTEXT — single sign-on, N workspaces (2026-07-26).
//
// Holds the authenticated identity, the workspace grants resolved
// server-side, the active workspace, and the founder perspective lens.
// Dashboard panels are pure renderers: every read goes through the one
// gated endpoint /api/v1/workspace/dashboard, never straight to the
// anon Postgres surface.
//
// The root founder never sees onboarding — the server hands back
// GLOBAL_FOUNDER for all three workspaces on email match, so the shell
// mounts straight into a populated switcher.
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/utils/supabaseClient";
import {
  WORKSPACE_IDS,
  isWorkspaceId,
  type Perspective,
  type WorkspaceId,
  type WorkspaceRole,
} from "@/config/workspaces";

export interface WorkspaceActor {
  userId: string;
  email: string;
  isFounder: boolean;
  roles: Partial<Record<WorkspaceId, WorkspaceRole>>;
}

interface WorkspaceContextValue {
  ready: boolean;
  actor: WorkspaceActor | null;
  /** Workspaces the actor may enter, in canonical order. */
  available: WorkspaceId[];
  workspace: WorkspaceId | null;
  setWorkspace: (id: WorkspaceId) => void;
  role: WorkspaceRole | null;
  perspective: Perspective;
  setPerspective: (p: Perspective) => void;
  data: Record<string, unknown> | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** Authenticated POST against the workspace endpoint (permission matrix). */
  post: (body: unknown) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const WORKSPACE_STORAGE_KEY = "athlytica.workspace";
const PERSPECTIVE_STORAGE_KEY = "athlytica.perspective";

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>.");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [actor, setActor] = useState<WorkspaceActor | null>(null);
  const [workspace, setWorkspaceState] = useState<WorkspaceId | null>(null);
  const [perspective, setPerspectiveState] = useState<Perspective>("executive");
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [role, setRole] = useState<WorkspaceRole | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // 1. Auth session → access token (and follow login/logout).
  useEffect(() => {
    let cancelled = false;

    supabaseClient.auth.getSession().then(({ data: session }) => {
      if (cancelled) return;
      setToken(session.session?.access_token ?? null);
      setReady(true);
    });

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      setToken(session?.access_token ?? null);
      setReady(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // 2. Restore the last workspace / perspective choice.
  useEffect(() => {
    const storedWorkspace = window.localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (isWorkspaceId(storedWorkspace)) setWorkspaceState(storedWorkspace);
    const storedPerspective = window.localStorage.getItem(PERSPECTIVE_STORAGE_KEY);
    if (storedPerspective === "coach" || storedPerspective === "executive") {
      setPerspectiveState(storedPerspective);
    }
  }, []);

  // 3. Unauthenticated visitors go to the login screen.
  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  const available = useMemo(
    () => (actor ? WORKSPACE_IDS.filter((id) => actor.roles[id]) : []),
    [actor],
  );

  // 4. Bootstrap the actor, then hydrate the active workspace payload.
  useEffect(() => {
    if (!token) {
      setActor(null);
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);

    const query = workspace ? `?workspace=${workspace}` : "";
    fetch(`/api/v1/workspace/dashboard${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(async (res) => {
        const body = (await res.json()) as {
          success?: boolean;
          error?: string;
          actor?: WorkspaceActor;
          role?: WorkspaceRole;
          data?: Record<string, unknown>;
        };
        if (cancelled) return;
        if (!res.ok || !body.success) {
          setError(body.error ?? `Request failed (${res.status}).`);
          // A revoked workspace should not wedge the shell: fall back.
          if (res.status === 403 && workspace) setWorkspaceState(null);
          setLoading(false);
          return;
        }
        setError(null);
        if (body.actor) setActor(body.actor);
        setRole(body.role ?? null);
        setData(body.data ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error contacting the workspace service.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, workspace, reloadNonce]);

  // 5. First workspace with a grant becomes the default landing surface.
  useEffect(() => {
    if (!workspace && available.length > 0) {
      const first = available[0];
      if (first) setWorkspaceState(first);
    }
  }, [available, workspace]);

  const setWorkspace = useCallback((id: WorkspaceId) => {
    window.localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
    setWorkspaceState(id);
    setData(null);
  }, []);

  const setPerspective = useCallback((p: Perspective) => {
    window.localStorage.setItem(PERSPECTIVE_STORAGE_KEY, p);
    setPerspectiveState(p);
  }, []);

  const refresh = useCallback(() => setReloadNonce((n) => n + 1), []);

  const post = useCallback(
    async (body: unknown) => {
      if (!token) return { success: false, error: "Not authenticated." };
      const res = await fetch("/api/v1/workspace/dashboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as { success?: boolean; error?: string };
      if (result.success) setReloadNonce((n) => n + 1);
      return { success: Boolean(result.success), error: result.error };
    },
    [token],
  );

  const signOut = useCallback(async () => {
    await supabaseClient.auth.signOut();
    setActor(null);
    setData(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ready,
      actor,
      available,
      workspace,
      setWorkspace,
      role,
      perspective,
      setPerspective,
      data,
      loading,
      error,
      refresh,
      post,
      signOut,
    }),
    [
      ready,
      actor,
      available,
      workspace,
      setWorkspace,
      role,
      perspective,
      setPerspective,
      data,
      loading,
      error,
      refresh,
      post,
      signOut,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
