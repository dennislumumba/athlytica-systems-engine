"use client";

// =====================================================================
// AUTH CALLBACK — one return address for every sign-in method.
//
// Supabase hands the session back two different ways depending on flow:
//   magic link / implicit → #access_token=… in the URL fragment
//   PKCE / OAuth          → ?code=… in the query string
// The browser client is configured with detectSessionInUrl: true (see
// utils/supabaseClient), so it consumes BOTH on init and fires
// onAuthStateChange. That is why this is a client page and not a route
// handler: a server handler would have to exchange the code itself,
// which needs the cookie-backed @supabase/ssr client this app does not
// use — its session lives in localStorage.
//
// So the only job here is to wait, then route by role. <RedirectIfAuthed>
// already does exactly that, including honouring ?redirectTo=, so this
// page is the veil and nothing else.
//
// STATE SAFETY: the PKCE verifier is written to localStorage by the same
// browser client that reads it here, so the exchange survives the round
// trip. It does NOT survive a different browser or a private window —
// that is a genuine "link opened elsewhere" failure, and the error path
// below names it rather than spinning forever.
// =====================================================================

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { RedirectIfAuthed } from "@/components/auth/redirect-if-authed";

/** Supabase reports failures as query OR fragment params depending on flow. */
function readAuthError(search: URLSearchParams): string | null {
  const hash = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.hash.replace(/^#/, ""),
  );
  const description = search.get("error_description") ?? hash.get("error_description");
  const code = search.get("error") ?? hash.get("error");
  if (!description && !code) return null;
  return description ?? code;
}

// If neither flow has produced a session by now, it is not going to:
// an expired link, a verifier from another browser, or a tampered URL.
const GIVE_UP_MS = 10_000;

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Shell>Authenticating…</Shell>}>
      <Callback />
    </Suspense>
  );
}

function Callback() {
  const searchParams = useSearchParams();
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const reported = readAuthError(searchParams);
    if (reported) {
      setFailure(reported);
      return;
    }
    // <RedirectIfAuthed> navigates away the moment a session lands, so
    // this timer only ever fires when nothing arrived.
    const timer = setTimeout(
      () =>
        setFailure(
          "This sign-in link could not be completed. It may have expired, already been used, or been opened in a different browser than the one that requested it.",
        ),
      GIVE_UP_MS,
    );
    return () => clearTimeout(timer);
  }, [searchParams]);

  if (failure) {
    return (
      <Shell>
        <p role="alert" style={{ color: "#ffb3c6", margin: "0 0 18px", lineHeight: 1.7 }}>
          {failure}
        </p>
        <Link
          href="/login"
          style={{
            display: "inline-block",
            padding: "11px 22px",
            borderRadius: 10,
            background: "#2f81f7",
            color: "#fff",
            fontWeight: 700,
            fontSize: 14,
            textDecoration: "none",
          }}
        >
          Back to sign in
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* veil renders the spinner and does the routing once a session exists */}
      <RedirectIfAuthed veil />
      Authenticating…
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: 24,
        textAlign: "center",
        color: "#e6edf6",
        fontSize: 15,
      }}
    >
      {children}
    </main>
  );
}
