"use client";

// =====================================================================
// TAB 4 — ONBOARDING & DOCUMENT ISSUING
//
// Legacy ingest runner, certificate/passport tracker with batch issuing,
// and the document template generator.
//
// Documents are generated as standalone printable HTML and handed to the
// browser's own print-to-PDF engine (lib/services/nrhl-pdf-generator).
// No renderer dependency, and the same string can be emailed unchanged.
// =====================================================================

import { useMemo, useState } from "react";
import {
  ActionButton,
  LeagueGate,
  Notice,
  fmt,
  inputStyle,
  useLeague,
  type LeagueAthlete,
  type LeaguePayload,
} from "@/components/workspace/nrhl-league";
import {
  combineHandout,
  completionCertificate,
  liabilityWaiver,
  openPrintable,
  playerPassport,
  registrationForm,
  type PassportAthlete,
} from "@/lib/services/nrhl-pdf-generator";
import { Badge, DataTable, Empty, Panel, Stat, StatRow, theme } from "@/components/workspace/ui";

export default function OnboardingTab() {
  return <LeagueGate>{(data) => <Onboarding data={data} />}</LeagueGate>;
}

function Onboarding({ data }: { data: LeaguePayload }) {
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <IngestRunner />
      <CertificateTracker data={data} />
      <TemplateGenerator data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------
// Legacy ingest
// ---------------------------------------------------------------------

interface IngestResult {
  success: boolean;
  dryRun?: boolean;
  error?: string;
  summary?: {
    scrimmages: number;
    scrimmagesWithScore: number;
    athletes: number;
    excluded: number;
    pointsReconciled: number;
    metricsWritten?: number;
    codesMinted?: { athlete: string; code: string }[];
  };
  warnings?: string[];
  excluded?: string[];
  identityResolutions?: { athlete: string; code: string | null; note: string }[];
}

function IngestRunner() {
  const { ingest } = useLeague();
  const [scrimmagesCsv, setScrimmagesCsv] = useState("");
  const [athleteStatsCsv, setAthleteStatsCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);

  const run = async (dryRun: boolean) => {
    setBusy(true);
    setResult(null);
    const res = await ingest({
      dryRun,
      scrimmagesCsv: scrimmagesCsv.trim() || undefined,
      athleteStatsCsv: athleteStatsCsv.trim() || undefined,
    });
    setBusy(false);
    setResult(
      res.success
        ? ((res.body ?? {}) as IngestResult)
        : { success: false, error: res.error ?? "Ingest failed." },
    );
  };

  const readFile = (setter: (v: string) => void) => async (file: File | null | undefined) => {
    if (file) setter(await file.text());
  };

  return (
    <Panel
      title="Legacy ingest"
      subtitle="Reconciles the recovered scrimmage extract into the league plane. Idempotent — re-running updates in place and never mints a second code for the same athlete. Leave both boxes empty to use the extract committed at core-engine/schemas/seed/nrhl_legacy/."
      actions={
        <div style={{ display: "flex", gap: 8 }}>
          <ActionButton onClick={() => void run(true)} disabled={busy}>
            {busy ? "Working…" : "Dry run"}
          </ActionButton>
          <ActionButton onClick={() => void run(false)} tone="primary" disabled={busy}>
            Ingest
          </ActionButton>
        </div>
      }
    >
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <CsvBox
          label="legacy_scrimmages.csv"
          value={scrimmagesCsv}
          onChange={setScrimmagesCsv}
          onFile={readFile(setScrimmagesCsv)}
        />
        <CsvBox
          label="athlete_individual_stats.csv"
          value={athleteStatsCsv}
          onChange={setAthleteStatsCsv}
          onFile={readFile(setAthleteStatsCsv)}
        />
      </div>

      {result && (
        <div style={{ marginTop: 14 }}>
          {result.error ? (
            <Notice text={result.error} tone="bad" />
          ) : (
            <>
              <StatRow>
                <Stat label="Scrimmages" value={result.summary?.scrimmages ?? 0} hint={`${result.summary?.scrimmagesWithScore ?? 0} scored`} />
                <Stat label="Athletes" value={result.summary?.athletes ?? 0} tone="good" />
                <Stat label="Points reconciled" value={`${result.summary?.pointsReconciled ?? 0} / ${result.summary?.athletes ?? 0}`} hint="NRHL-PTS-v1" />
                <Stat label="Metrics written" value={result.summary?.metricsWritten ?? "dry run"} />
              </StatRow>

              {result.dryRun && (
                <p style={{ fontSize: 12.5, color: theme.warn, marginTop: 10 }}>
                  Dry run — nothing was written.
                </p>
              )}

              {(result.identityResolutions?.length ?? 0) > 0 && (
                <>
                  <h3 style={subHeading}>Identity resolutions</h3>
                  {result.identityResolutions!.map((r) => (
                    <p key={r.athlete} style={{ fontSize: 12.5, color: theme.muted, margin: "0 0 6px", lineHeight: 1.6 }}>
                      <strong style={{ color: theme.text }}>{r.athlete}</strong>{" "}
                      {r.code && <Badge tone="good">{r.code}</Badge>} — {r.note}
                    </p>
                  ))}
                </>
              )}

              {(result.summary?.codesMinted?.length ?? 0) > 0 && (
                <p style={{ fontSize: 12.5, color: theme.muted, marginTop: 8 }}>
                  Minted {result.summary!.codesMinted!.length} new athlete codes from
                  scalable_id_sequence.
                </p>
              )}

              {(result.warnings?.length ?? 0) > 0 && (
                <>
                  <h3 style={subHeading}>Warnings ({result.warnings!.length})</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: theme.warn, lineHeight: 1.7 }}>
                    {result.warnings!.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </>
              )}

              {(result.excluded?.length ?? 0) > 0 && (
                <>
                  <h3 style={subHeading}>Excluded rows ({result.excluded!.length})</h3>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: theme.dim, lineHeight: 1.7 }}>
                    {result.excluded!.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

const subHeading = {
  fontSize: 11.5,
  color: theme.dim,
  margin: "16px 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
};

function CsvBox({
  label,
  value,
  onChange,
  onFile,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFile: (f: File | null | undefined) => void;
}) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
        <span style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.dim }}>
          {label}
        </span>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => onFile(e.target.files?.[0])}
          style={{ fontSize: 11, color: theme.muted, maxWidth: 150 }}
          aria-label={`Upload ${label}`}
        />
      </div>
      <textarea
        style={{ ...inputStyle, minHeight: 92, fontFamily: "ui-monospace, monospace", fontSize: 11.5, resize: "vertical" }}
        placeholder="Paste CSV, upload a file, or leave empty to use the committed extract."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------
// Certificates
// ---------------------------------------------------------------------

const toPassport = (a: LeagueAthlete): PassportAthlete => ({
  athleteCode: a.athlete_code,
  displayName: a.display_name,
  division: a.division,
  team: a.team,
  ageTier: a.age_tier,
  studentLevel: a.student_level,
  gamesPlayed: a.games_played,
  legacyPoints: a.legacy_points,
  compositeScore: a.composite_score,
  certificateTier: a.certificate_tier,
  attendanceRatePct: a.attendance_rate_pct,
  speedRating: a.speed_rating,
  technicalRating: a.technical_rating,
  guardianName: a.guardian_name,
});

function CertificateTracker({ data }: { data: LeaguePayload }) {
  const { act } = useLeague();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  const uncertified = useMemo(
    () => data.athletes.filter((a) => !a.certificate_issued_at),
    [data.athletes],
  );
  const blocked = uncertified.filter((a) => !a.certificate_tier);

  const toggle = (code: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  const issue = async (document: "certificate" | "passport") => {
    if (selected.size === 0) return;
    setBusy(true);
    const res = await act({
      action: "issue-documents",
      athleteCodes: [...selected],
      document,
    });
    setBusy(false);
    const body = res.body as { issued?: string[]; skipped?: string[] } | undefined;
    setNotice(
      res.success
        ? {
            text: `Issued ${body?.issued?.length ?? 0} ${document}${(body?.skipped?.length ?? 0) > 0 ? `; skipped ${body!.skipped!.length} without an earned tier` : ""}.`,
            tone: "good",
          }
        : { text: res.error ?? "Issuing failed.", tone: "bad" },
    );
    if (res.success) setSelected(new Set());
  };

  return (
    <Panel
      title="Certificate & passport tracker"
      subtitle={`${uncertified.length} of ${data.athletes.length} athletes hold no certificate. Certificates require an earned tier — an athlete with no composite score cannot be issued one, and batch issuing silently skips them rather than handing a parent an unearned award.`}
      actions={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <ActionButton
            onClick={() => setSelected(new Set(uncertified.filter((a) => a.certificate_tier).map((a) => a.athlete_code)))}
          >
            Select all eligible
          </ActionButton>
          <ActionButton onClick={() => void issue("passport")} disabled={busy || selected.size === 0}>
            Issue {selected.size || ""} passports
          </ActionButton>
          <ActionButton onClick={() => void issue("certificate")} tone="primary" disabled={busy || selected.size === 0}>
            Issue {selected.size || ""} certificates
          </ActionButton>
        </div>
      }
    >
      <StatRow>
        <Stat label="Missing certification" value={uncertified.length} tone={uncertified.length > 0 ? "warn" : "good"} />
        <Stat label="Eligible now" value={uncertified.length - blocked.length} tone="good" />
        <Stat label="Blocked — no composite" value={blocked.length} tone={blocked.length > 0 ? "bad" : "good"} hint="needs a coach grade" />
        <Stat label="Passports issued" value={data.counts.passportsIssued} />
      </StatRow>

      {blocked.length > 0 && (
        <p style={{ fontSize: 12.5, color: theme.muted, marginTop: 12, lineHeight: 1.7 }}>
          The composite is attendance % + (20 × average coach grade) + weighted points. The legacy
          extract carries attendance and points but no coach grade, so {blocked.length} athletes have
          no composite and no tier. Record coach grades before issuing — the gap is a missing input,
          not a low score.
        </p>
      )}

      <div style={{ marginTop: 14 }}>
        <DataTable
          rows={data.athletes}
          rowKey={(a) => a.athlete_code}
          empty="No athletes in the registry yet."
          columns={[
            {
              key: "select",
              header: "",
              render: (a) => (
                <input
                  type="checkbox"
                  checked={selected.has(a.athlete_code)}
                  onChange={() => toggle(a.athlete_code)}
                  aria-label={`Select ${a.display_name}`}
                />
              ),
            },
            {
              key: "athlete",
              header: "Athlete",
              render: (a) => (
                <span>
                  {a.display_name}
                  <span style={{ color: theme.dim, marginLeft: 8, fontSize: 11.5 }}>{a.athlete_code}</span>
                </span>
              ),
            },
            { key: "composite", header: "Composite", align: "right", render: (a) => fmt.num(a.composite_score, 2) },
            {
              key: "tier",
              header: "Tier",
              render: (a) =>
                a.certificate_tier ? (
                  <Badge tone={a.certificate_tier.startsWith("Elite") ? "good" : "neutral"}>
                    {a.certificate_tier}
                  </Badge>
                ) : (
                  <Badge tone="warn">no tier</Badge>
                ),
            },
            {
              key: "cert",
              header: "Certificate",
              render: (a) =>
                a.certificate_issued_at ? (
                  <Badge tone="good">{fmt.date(a.certificate_issued_at)}</Badge>
                ) : (
                  <Badge tone="bad">not issued</Badge>
                ),
            },
            {
              key: "passport",
              header: "Passport",
              render: (a) =>
                a.passport_issued_at ? (
                  <Badge tone="good">{fmt.date(a.passport_issued_at)}</Badge>
                ) : (
                  <Badge tone="bad">not issued</Badge>
                ),
            },
            {
              key: "print",
              header: "Print",
              render: (a) => (
                <span style={{ display: "flex", gap: 6 }}>
                  <ActionButton onClick={() => openPrintable(playerPassport(toPassport(a)))}>
                    Passport
                  </ActionButton>
                  <ActionButton
                    onClick={() => openPrintable(completionCertificate(toPassport(a)))}
                    disabled={!a.certificate_tier}
                    title={a.certificate_tier ? undefined : "No earned tier"}
                  >
                    Certificate
                  </ActionButton>
                </span>
              ),
            },
          ]}
        />
      </div>
      <Notice text={notice?.text ?? null} tone={notice?.tone ?? "good"} />
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------

function TemplateGenerator({ data }: { data: LeaguePayload }) {
  const [athleteCode, setAthleteCode] = useState("");
  const athlete = data.athletes.find((a) => a.athlete_code === athleteCode);
  const prefill = athlete ? toPassport(athlete) : {};

  const templates = [
    {
      id: "registration",
      name: "Official Player Registration Form",
      note: "Collects the fields the live web funnel omits: date of birth, guardian address, emergency contact, and a required media-consent election.",
      build: () => registrationForm(prefill),
    },
    {
      id: "waiver",
      name: "Parent/Guardian Medical & Liability Waiver",
      note: "Mirrors the signed paper agreement, including the gross-negligence carve-out and the surface/weather risk acknowledgment.",
      build: () => liabilityWaiver(prefill),
    },
    {
      id: "handout",
      name: "Pre-Season Combine Information Handout",
      note: "What is measured across the five pillars, how scoring works, session shape, conferences, and the road to the January 2027 draft.",
      build: () => combineHandout(),
    },
  ];

  return (
    <Panel
      title="Document template generator"
      subtitle="Generates a complete standalone document and opens the browser's print dialog — choose 'Save as PDF'. Select an athlete to prefill, or leave blank for a clean form."
      actions={
        <select
          style={{ ...inputStyle, width: 240 }}
          value={athleteCode}
          onChange={(e) => setAthleteCode(e.target.value)}
          aria-label="Prefill with athlete"
        >
          <option value="">Blank form</option>
          {data.athletes.map((a) => (
            <option key={a.athlete_code} value={a.athlete_code}>
              {a.display_name} · {a.athlete_code}
            </option>
          ))}
        </select>
      }
    >
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
        {templates.map((t) => (
          <div
            key={t.id}
            style={{
              background: theme.panelAlt,
              border: `1px solid ${theme.border}`,
              borderRadius: 10,
              padding: "14px 15px",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{t.name}</div>
              <p style={{ margin: "6px 0 0", fontSize: 12, color: theme.muted, lineHeight: 1.6 }}>{t.note}</p>
            </div>
            <div style={{ marginTop: "auto", display: "flex", gap: 8 }}>
              <ActionButton onClick={() => openPrintable(t.build(), false)}>Preview</ActionButton>
              <ActionButton onClick={() => openPrintable(t.build())} tone="primary">
                Print / PDF
              </ActionButton>
            </div>
          </div>
        ))}
      </div>
      {data.athletes.length === 0 && (
        <div style={{ marginTop: 12 }}>
          <Empty>Blank templates work without any data. Prefill needs the registry populated.</Empty>
        </div>
      )}
    </Panel>
  );
}
