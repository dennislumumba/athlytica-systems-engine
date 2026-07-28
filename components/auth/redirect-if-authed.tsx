"use client";

// =====================================================================
// POST-AUTH ROUTER — the single place a signed-in visitor is bounced
// off a public page and into the dashboard they actually own.
//
// The Supabase session lives in localStorage (see utils/supabaseClient),
// not in a cookie, so neither middleware nor a server component can see
// it — the check has to run in the browser. Renders nothing except the
// optional "Authenticating…" veil while the role lookup is in flight.
//
// Destination is NOT decided here: roles are resolved server-side by
// /api/v1/workspace/dashboard and mapped by landingFor(). A ?redirectTo=
// on the URL wins, so a bounced deep link resumes where it left off.
//
// Redirect graph is acyclic by construction:
//   /          → landingFor(actor)  only when a session EXISTS
//   /login     → landingFor(actor)  only when a session EXISTS
//   (app)/*    → /login?redirectTo  only when a session is ABSENT
// The predicates are disjoint, so no pair can ping-pong. landingFor()
// never returns a public route, so the first edge cannot re-fire.
// =====================================================================

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/utils/supabaseClient";
import { landingFor, safeRedirectTo, type LandingActor } from "@/lib/auth/landing";

// Literals rather than the workspace `theme`: importing it would pull
// 388 lines of dashboard primitives into the marketing-page bundle for
// four hex values. Same palette as /login and the landing page.
const BORDER = "#24334d";
const TEXT = "#e6edf6";
const ACCENT = "#2f81f7";

async function resolveLanding(token: string, override: string | null): Promise<string> {
  if (override) return override;
  try {
    const res = await fetch("/api/v1/workspace/dashboard", {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = (await res.json()) as { actor?: LandingActor; hasProfile?: boolean };
    // A 503 (service role unprovisioned) or a 401 must not strand the
    // visitor on the marketing page. Claim hasProfile so the fallback
    // lands on the shell's own no-access screen rather than pushing an
    // onboarding form at someone whose profile we simply could not read.
    if (!res.ok || !body.actor) {
      return landingFor({ isFounder: false, roles: {}, hasProfile: true });
    }
    return landingFor({ ...body.actor, hasProfile: body.hasProfile });
  } catch {
    return landingFor({ isFounder: false, roles: {}, hasProfile: true });
  }
}

/**
 * @param veil renders the "Authenticating…" panel while the role lookup
 *   runs. Off on the marketing page (a flash of a veil on every anonymous
 *   visit is worse than nothing), on for /login.
 */
export function RedirectIfAuthed(props: { veil?: boolean } = {}) {
  // useSearchParams forces the nearest boundary into client rendering;
  // owning the Suspense here keeps every caller a plain server component.
  return (
    <Suspense fallback={null}>
      <PostAuthRouter {...props} />
    </Suspense>
  );
}

function PostAuthRouter({ veil = false }: { veil?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const override = safeRedirectTo(searchParams.get("redirectTo"));
  const [routing, setRouting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const go = (token: string | undefined) => {
      if (cancelled || !token) return;
      setRouting(true);
      void resolveLanding(token, override).then((to) => {
        if (!cancelled) router.replace(to);
      });
    };

    void supabaseClient.auth.getSession().then(({ data }) => go(data.session?.access_token));
    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange((_event, session) => go(session?.access_token));

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router, override]);

  if (!veil || !routing) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        background: "rgba(4, 8, 16, 0.9)",
        color: TEXT,
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      <Spinner />
      Authenticating…
    </div>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        border: `2px solid ${BORDER}`,
        borderTopColor: ACCENT,
        animation: "athlytica-spin 0.8s linear infinite",
      }}
    >
      <style>{"@keyframes athlytica-spin { to { transform: rotate(360deg) } }"}</style>
    </span>
  );
}
