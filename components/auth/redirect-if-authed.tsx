"use client";

// =====================================================================
// LANDING-PAGE AUTH GATE.
//
// The Supabase session lives in localStorage (see utils/supabaseClient),
// not in a cookie, so neither middleware nor a server component can see
// it — the check has to run in the browser. Renders nothing; it only
// bounces an already-signed-in visitor off the marketing page.
//
// Redirect graph is acyclic by construction:
//   /          → /dashboard   only when a session EXISTS
//   /login     → /dashboard   only when a session EXISTS
//   (app)/*    → /login       only when a session is ABSENT
// The predicates are disjoint, so no pair can ping-pong.
// =====================================================================

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/utils/supabaseClient";

export function RedirectIfAuthed({ to = "/dashboard" }: { to?: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    supabaseClient.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) router.replace(to);
    });
    return () => {
      cancelled = true;
    };
  }, [router, to]);

  return null;
}
