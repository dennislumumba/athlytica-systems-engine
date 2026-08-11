"use client";

// =====================================================================
// BIG ICE PARENT PORTAL — /portal
//
// OUTSIDE the (app) route group on purpose. That group is wrapped in
// WorkspaceProvider, which resolves public.workspace_roles and shows an
// "access pending" screen to anyone without a grant. A parent will never
// have a grant — and must never be given one, because a grant returns
// the venture's entire commercial payload (CLAUDE.md, SECURITY
// INVARIANTS). So this page carries its own session guard and reads the
// one endpoint scoped to the signed-in guardian.
//
// Big Ice brand only: navy + gold, no NRHL identity anywhere (§8, §60).
//
// EVERY PANEL HERE CAN BE EMPTY, and empty is drawn as a plain statement
// of what has not been recorded yet. There is no placeholder progress,
// no sample achievement and no illustrative coach note — a parent
// reading this page must be able to trust that what it shows happened
// (§25, §32, §43, §63).
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/utils/supabaseClient";

const NAVY = "#0A1B33";
const NAVY_SOFT = "#12294A";
const GOLD = "#FFC629";
const INK = "#E8EEF7";
const MUTED = "#93A7C4";

interface Enrollment {
  enrollmentId: string;
  programmeLabel: string;
  discipline: string | null;
  amountKes: number | null;
  status: string;
  coachName: string | null;
  location: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

interface NextSessionPayload {
  cohortLabel: string;
  trackType: string | null;
  startsAtIso: string;
  endsAtIso: string | null;
  startTimeEat: string;
  endTimeEat: string | null;
}

interface PortalDocument {
  documentId: string;
  title: string;
  slug: string | null;
  version: string | null;
  issuedAt: string | null;
}

interface Athlete {
  biifCode: string;
  fullName: string;
  dateOfBirth: string | null;
  primaryDiscipline: string | null;
  skatingLevel: string | null;
  status: string;
  currentEnrollment: Enrollment | null;
  enrollments: Enrollment[];
  nextSession: NextSessionPayload | null;
  progress: { state: "NO_BASELINE" | "BASELINE_ESTABLISHED" | "PROGRESSING" };
  coachNotes: unknown[];
  documents: PortalDocument[];
  achievements: unknown[];
}

interface PortalPayload {
  success: boolean;
  guardian: { email: string; name: string | null };
  athletes: Athlete[];
  unlinked?: boolean;
}

const DISCIPLINE_LABEL: Record<string, string> = {
  INLINE: "Inline Skating",
  ICE: "Ice Skating",
  FIGURE: "Figure Skating",
  HOCKEY: "Hockey Skating",
  FITNESS: "Athletic Development",
};

/** Sessions are wall-clock EAT; render them that way regardless of device. */
function formatSession(iso: string): string {
  return new Date(iso).toLocaleString("en-KE", {
    timeZone: "Africa/Nairobi",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const card: React.CSSProperties = {
  background: NAVY_SOFT,
  border: "1px solid rgba(255,198,41,0.18)",
  borderRadius: 14,
  padding: "20px 22px",
  marginBottom: 16,
};

const label: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: GOLD,
  fontWeight: 700,
  marginBottom: 10,
};

const quiet: React.CSSProperties = { color: MUTED, fontSize: 14, lineHeight: 1.6, margin: 0 };

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={card}>
      <div style={label}>{title}</div>
      {children}
    </section>
  );
}

export default function ParentPortalPage() {
  const router = useRouter();
  const [payload, setPayload] = useState<PortalPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    supabaseClient.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) {
        router.replace("/login?redirectTo=/portal");
        return;
      }
      if (!cancelled) setToken(token);
      try {
        const res = await fetch("/api/v1/portal", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json()) as PortalPayload & { error?: string };
        if (cancelled) return;
        if (!res.ok || !json.success) {
          // A parent is never shown a technical failure (§68).
          setError("We could not load your athlete's profile just now. Please try again shortly.");
          return;
        }
        setPayload(json);
        setSelected(json.athletes[0]?.biifCode ?? null);
      } catch {
        if (!cancelled) {
          setError("We could not load your athlete's profile just now. Please try again shortly.");
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [router]);

  const athlete = useMemo(
    () => payload?.athletes.find((a) => a.biifCode === selected) ?? null,
    [payload, selected],
  );

  /**
   * Documents are behind a bearer-authenticated route, so they cannot be
   * a plain <a href>. Fetch with the session token and hand the browser a
   * blob — which also means the document body never sits in a URL that
   * could be shared out of context.
   */
  async function openDocument(documentId: string) {
    if (!token) return;
    try {
      const res = await fetch(`/api/v1/portal/document/${documentId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setError("That document could not be opened just now. Please try again shortly.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener");
      // Revoked on a delay: revoking immediately races the new tab's load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError("That document could not be opened just now. Please try again shortly.");
    }
  }

  const shell: React.CSSProperties = {
    minHeight: "100vh",
    background: NAVY,
    color: INK,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
    padding: "28px 18px 64px",
  };
  const inner: React.CSSProperties = { maxWidth: 620, margin: "0 auto" };

  if (error) {
    return (
      <main style={shell}>
        <div style={inner}>
          <div style={label}>Big Ice Inline Fitness</div>
          <p style={quiet}>{error}</p>
        </div>
      </main>
    );
  }

  if (!payload) {
    return (
      <main style={shell}>
        <div style={inner}>
          <div style={label}>Big Ice Inline Fitness</div>
          <p style={quiet}>Loading your athlete&rsquo;s profile&hellip;</p>
        </div>
      </main>
    );
  }

  return (
    <main style={shell}>
      <div style={inner}>
        <header style={{ marginBottom: 24 }}>
          <div style={label}>Big Ice Inline Fitness</div>
          <h1 style={{ fontSize: 26, margin: "0 0 6px", fontWeight: 700 }}>
            Welcome back{payload.guardian.name ? `, ${payload.guardian.name}` : ""}.
          </h1>
          <p style={quiet}>{payload.guardian.email}</p>
        </header>

        {payload.athletes.length === 0 ? (
          <Panel title="No athlete linked yet">
            <p style={quiet}>
              We could not find a Big Ice athlete registered to this email address. If your child
              trains with us, the address on their registration may be a different one — contact
              Big Ice and we will link your account.
            </p>
          </Panel>
        ) : null}

        {/* §36: multiple children, never mixed. One tap switches records. */}
        {payload.athletes.length > 1 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {payload.athletes.map((a) => {
              const active = a.biifCode === selected;
              return (
                <button
                  key={a.biifCode}
                  onClick={() => setSelected(a.biifCode)}
                  style={{
                    background: active ? GOLD : "transparent",
                    color: active ? NAVY : INK,
                    border: `1px solid ${active ? GOLD : "rgba(255,198,41,0.3)"}`,
                    borderRadius: 999,
                    padding: "8px 16px",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {a.fullName}
                </button>
              );
            })}
          </div>
        ) : null}

        {athlete ? (
          <>
            {/* §62: the first screen is the athlete, not a table. */}
            <section
              style={{
                ...card,
                background: `linear-gradient(160deg, ${NAVY_SOFT} 0%, #1B3A66 100%)`,
                borderColor: "rgba(255,198,41,0.35)",
              }}
            >
              <div style={label}>Big Ice Athlete</div>
              <h2 style={{ fontSize: 28, margin: "0 0 14px", fontWeight: 700 }}>
                {athlete.fullName}
              </h2>
              <dl style={{ display: "grid", gap: 12, margin: 0 }}>
                <div>
                  <dt style={{ ...quiet, fontSize: 12 }}>Athlete ID</dt>
                  <dd
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 700,
                      color: GOLD,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {athlete.biifCode}
                  </dd>
                </div>
                <div>
                  <dt style={{ ...quiet, fontSize: 12 }}>Current pathway</dt>
                  <dd style={{ margin: 0, fontSize: 16 }}>
                    {athlete.primaryDiscipline
                      ? (DISCIPLINE_LABEL[athlete.primaryDiscipline] ?? athlete.primaryDiscipline)
                      : "Not yet set"}
                  </dd>
                </div>
                <div>
                  <dt style={{ ...quiet, fontSize: 12 }}>Current level</dt>
                  <dd style={{ margin: 0, fontSize: 16 }}>
                    {athlete.skatingLevel ?? "Set after the first assessment"}
                  </dd>
                </div>
              </dl>
            </section>

            <Panel title="Up next">
              {athlete.nextSession ? (
                <>
                  <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600 }}>
                    {formatSession(athlete.nextSession.startsAtIso)}
                  </p>
                  <p style={quiet}>
                    {athlete.nextSession.cohortLabel}
                    {athlete.nextSession.endTimeEat
                      ? ` · ${athlete.nextSession.startTimeEat}–${athlete.nextSession.endTimeEat}`
                      : ""}
                  </p>
                </>
              ) : (
                <p style={quiet}>
                  No session is scheduled yet. Your coach will confirm the training window for this
                  programme.
                </p>
              )}
            </Panel>

            <Panel title="Current programme">
              {athlete.currentEnrollment ? (
                <>
                  <p style={{ margin: "0 0 6px", fontSize: 18, fontWeight: 600 }}>
                    {athlete.currentEnrollment.programmeLabel}
                  </p>
                  <p style={quiet}>
                    {[
                      athlete.currentEnrollment.location,
                      athlete.currentEnrollment.coachName
                        ? `Coach ${athlete.currentEnrollment.coachName}`
                        : null,
                      athlete.currentEnrollment.startsOn
                        ? `From ${athlete.currentEnrollment.startsOn}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "Programme details to be confirmed."}
                  </p>
                </>
              ) : (
                <p style={quiet}>No programme is active right now.</p>
              )}
            </Panel>

            {/* §43: one data point is a baseline, not a trend. */}
            <Panel title="Progress">
              {athlete.progress.state === "NO_BASELINE" ? (
                <p style={quiet}>
                  Your athlete&rsquo;s baseline assessment has not been recorded yet. Once their
                  first assessment is complete, their starting point appears here.
                </p>
              ) : athlete.progress.state === "BASELINE_ESTABLISHED" ? (
                <p style={quiet}>
                  Baseline established. Progress is shown once a second assessment gives us
                  something to compare it against.
                </p>
              ) : (
                <p style={quiet}>Progress recorded.</p>
              )}
            </Panel>

            <Panel title="From your coach">
              {athlete.coachNotes.length === 0 ? (
                <p style={quiet}>No coach updates have been shared yet.</p>
              ) : null}
            </Panel>

            <Panel title="Programme history">
              {athlete.enrollments.length === 0 ? (
                <p style={quiet}>No programmes recorded yet.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
                  {athlete.enrollments.map((e) => (
                    <li key={e.enrollmentId}>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{e.programmeLabel}</div>
                      <div style={{ ...quiet, fontSize: 13 }}>
                        {e.status === "ACTIVE"
                          ? "Active"
                          : e.status === "COMPLETED"
                            ? "Completed"
                            : "Awaiting payment"}
                        {e.startsOn ? ` · from ${e.startsOn}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Documents">
              {athlete.documents.length === 0 ? (
                <p style={quiet}>No documents have been issued yet.</p>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
                  {athlete.documents.map((d) => (
                    <li
                      key={d.documentId}
                      style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
                    >
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{d.title}</div>
                        <div style={{ ...quiet, fontSize: 13 }}>
                          {[d.issuedAt?.slice(0, 10), d.version].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      <button
                        onClick={() => openDocument(d.documentId)}
                        style={{
                          background: "transparent",
                          color: GOLD,
                          border: `1px solid ${GOLD}`,
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          alignSelf: "center",
                          whiteSpace: "nowrap",
                        }}
                      >
                        View
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Achievements">
              {athlete.achievements.length === 0 ? (
                <p style={quiet}>
                  No achievements recorded yet. Certificates and completed levels appear here as
                  your athlete earns them.
                </p>
              ) : null}
            </Panel>
          </>
        ) : null}
      </div>
    </main>
  );
}
