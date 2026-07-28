"use client";

// =====================================================================
// TAB 3 — ADMINISTRATION & ROSTER ENGINE
//
// Roster manager, head-coach control panel (lines + identity overrides),
// and parent identity sync.
//
// Guardian phone numbers are normalised to E.164 before they leave the
// browser and re-validated server-side; a changed number clears its own
// verification flag, because a verified digit string is only verified
// for the number that was actually confirmed.
// =====================================================================

import { useMemo, useState } from "react";
import {
  ActionButton,
  Field,
  FormGrid,
  LeagueGate,
  Notice,
  fmt,
  inputStyle,
  useLeague,
  type LeagueAthlete,
  type LeaguePayload,
} from "@/components/workspace/nrhl-league";
import { AGE_TIERS, LINE_SLOTS, STUDENT_LEVELS, toE164 } from "@/lib/validation/nrhl-schemas";
import { Badge, DataTable, Panel, Stat, StatRow, selectStyle, theme } from "@/components/workspace/ui";

export default function AdminTab() {
  return <LeagueGate>{(data) => <Admin data={data} />}</LeagueGate>;
}

function Admin({ data }: { data: LeaguePayload }) {
  const { act } = useLeague();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  const roster = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.athletes.filter(
      (a) =>
        !q ||
        a.display_name.toLowerCase().includes(q) ||
        a.athlete_code.toLowerCase().includes(q) ||
        (a.legacy_code ?? "").toLowerCase().includes(q),
    );
  }, [data.athletes, query]);

  const patch = async (athleteCode: string, changes: Record<string, unknown>) => {
    const res = await act({ action: "update-athlete", athleteCode, patch: changes } as never);
    setNotice(
      res.success
        ? { text: `${athleteCode} updated.`, tone: "good" }
        : { text: res.error ?? "Update failed.", tone: "bad" },
    );
  };

  const teams = [...new Set(data.athletes.map((a) => a.team).filter((t): t is string => Boolean(t)))];
  const locked = data.athletes.some((a) => a.draft_locked_at);

  const inlineSelect = (
    a: LeagueAthlete,
    field: string,
    value: string | null,
    options: readonly string[],
    placeholder: string,
  ) => (
    <select
      style={{ ...selectStyle, padding: "3px 6px", maxWidth: 130 }}
      value={value ?? ""}
      disabled={Boolean(a.draft_locked_at) && (field === "team" || field === "division")}
      onChange={(e) => void patch(a.athlete_code, { [field]: e.target.value || null })}
      aria-label={`${placeholder} for ${a.display_name}`}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <Panel
        title="Roster & permission manager"
        subtitle={`${data.athletes.length} athlete profiles. Division, squad, line and tier save on change. Locked draft rows are read-only until the lock is released from the Drafting tab.`}
        actions={
          <input
            style={{ ...inputStyle, width: 220 }}
            placeholder="Search name or code…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search roster"
          />
        }
      >
        <StatRow>
          <Stat label="Athletes" value={data.athletes.length} />
          <Stat label="Seeded into a division" value={data.athletes.filter((a) => a.division).length} tone="good" />
          <Stat label="Assigned to a squad" value={data.counts.drafted} />
          <Stat label="Draft locked" value={data.counts.draftLocked} tone={locked ? "warn" : "neutral"} />
        </StatRow>

        <div style={{ marginTop: 14 }}>
          <DataTable
            rows={roster}
            rowKey={(a) => a.athlete_code}
            empty="No athletes match. Run the legacy ingest from the Onboarding tab if the registry is empty."
            columns={[
              {
                key: "athlete",
                header: "Athlete",
                render: (a) => (
                  <span>
                    {a.display_name}
                    <span style={{ color: theme.dim, marginLeft: 8, fontSize: 11.5 }}>
                      {a.athlete_code}
                      {a.legacy_code ? ` ← ${a.legacy_code}` : ""}
                    </span>
                  </span>
                ),
              },
              {
                key: "division",
                header: "Division",
                render: (a) => inlineSelect(a, "division", a.division, data.divisions, "Unseeded"),
              },
              {
                key: "team",
                header: "Squad",
                render: (a) => inlineSelect(a, "team", a.team, teams, "Undrafted"),
              },
              {
                key: "line",
                header: "Line",
                render: (a) => inlineSelect(a, "lineAssignment", a.line_assignment, LINE_SLOTS, "—"),
              },
              {
                key: "tier",
                header: "Age tier",
                render: (a) => inlineSelect(a, "ageTier", a.age_tier, AGE_TIERS, "Unknown"),
              },
              {
                key: "level",
                header: "Level",
                render: (a) => inlineSelect(a, "studentLevel", a.student_level, STUDENT_LEVELS, "—"),
              },
              {
                key: "flags",
                header: "Flags",
                render: (a) => (
                  <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {a.draft_locked_at && <Badge tone="warn">locked</Badge>}
                    {a.identity_note && <Badge tone="bad">identity</Badge>}
                    {a.conduct_cases > 0 && <Badge tone="warn">{a.conduct_cases} conduct</Badge>}
                  </span>
                ),
              },
              {
                key: "edit",
                header: "",
                render: (a) => (
                  <button
                    type="button"
                    onClick={() => setSelected(selected === a.athlete_code ? null : a.athlete_code)}
                    style={{
                      background: "none",
                      border: `1px solid ${theme.border}`,
                      borderRadius: 6,
                      color: theme.muted,
                      cursor: "pointer",
                      fontSize: 12,
                      padding: "3px 8px",
                    }}
                  >
                    {selected === a.athlete_code ? "Close" : "Details"}
                  </button>
                ),
              },
            ]}
          />
        </div>
        <Notice text={notice?.text ?? null} tone={notice?.tone ?? "good"} />
      </Panel>

      {selected && (
        <AthleteEditor
          athlete={data.athletes.find((a) => a.athlete_code === selected)!}
          onSaved={(text, tone) => setNotice({ text, tone })}
        />
      )}

      <Panel
        title="Head coach control panel"
        subtitle="Line combinations, tier-change visibility, and access grants."
      >
        <h3 style={sectionHeading}>Line sheet</h3>
        {teams.length === 0 ? (
          <p style={{ fontSize: 13, color: theme.dim, margin: "0 0 12px" }}>
            No squads exist yet. Assign squads on the Drafting tab, then set a line slot per athlete
            above.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
            {teams.map((team) => (
              <div
                key={team}
                style={{
                  background: theme.panelAlt,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 8 }}>{team}</div>
                {LINE_SLOTS.map((slot) => {
                  const members = data.athletes.filter((a) => a.team === team && a.line_assignment === slot);
                  return (
                    <div key={slot} style={{ display: "flex", gap: 8, fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: theme.dim, minWidth: 26 }}>{slot}</span>
                      <span style={{ color: members.length ? theme.text : theme.dim }}>
                        {members.map((m) => m.display_name).join(", ") || "unassigned"}
                      </span>
                    </div>
                  );
                })}
                {data.athletes.some((a) => a.team === team && !a.line_assignment) && (
                  <p style={{ margin: "8px 0 0", fontSize: 11.5, color: theme.warn }}>
                    {data.athletes.filter((a) => a.team === team && !a.line_assignment).length} without
                    a line slot
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <h3 style={sectionHeading}>Coach & manager access</h3>
        <p style={{ fontSize: 13, color: theme.muted, margin: "0 0 8px", lineHeight: 1.7 }}>
          Workspace access is granted from the single permission matrix in the Athlytica HQ
          workspace — there is one grant table (<code>workspace_roles</code>) and duplicating an
          editor here would mean two ways to grant the same right. Switch to{" "}
          <strong>Athlytica HQ → User &amp; Permission Matrix</strong> and grant{" "}
          <code>HEAD_COACH</code> in <code>nrhl</code>. A HEAD_COACH sees every tab in this module;
          financial surfaces stay hidden.
        </p>

        <h3 style={sectionHeading}>Identity overrides</h3>
        <DataTable
          rows={data.athletes.filter((a) => a.identity_note)}
          rowKey={(a) => a.athlete_code}
          empty="No identity collisions recorded."
          columns={[
            { key: "athlete", header: "Athlete", render: (a) => a.display_name },
            { key: "code", header: "Code", render: (a) => a.athlete_code },
            { key: "legacy", header: "Legacy", render: (a) => a.legacy_code ?? "—" },
            {
              key: "note",
              header: "Resolution",
              render: (a) => <span style={{ whiteSpace: "normal", color: theme.muted }}>{a.identity_note}</span>,
            },
          ]}
        />
      </Panel>

      <ParentSync data={data} />
    </div>
  );
}

const sectionHeading = {
  fontSize: 12,
  color: theme.dim,
  margin: "18px 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.14em",
};

// ---------------------------------------------------------------------
// Athlete detail editor
// ---------------------------------------------------------------------

function AthleteEditor({
  athlete,
  onSaved,
}: {
  athlete: LeagueAthlete;
  onSaved: (text: string, tone: "good" | "bad") => void;
}) {
  const { act } = useLeague();
  const [name, setName] = useState(athlete.display_name);
  const [guardianName, setGuardianName] = useState(athlete.guardian_name ?? "");
  const [guardianEmail, setGuardianEmail] = useState(athlete.guardian_email ?? "");
  const [phone, setPhone] = useState(athlete.guardian_phone_e164 ?? "");
  const [consent, setConsent] = useState(athlete.consent_media ?? "");
  const [note, setNote] = useState(athlete.identity_note ?? "");
  const [busy, setBusy] = useState(false);

  const normalised = toE164(phone);
  const phoneInvalid = phone.trim() !== "" && normalised === null;

  const save = async () => {
    setBusy(true);
    const res = await act({
      action: "update-athlete",
      athleteCode: athlete.athlete_code,
      patch: {
        displayName: name.trim(),
        guardianName: guardianName.trim() || null,
        guardianEmail: guardianEmail.trim() || null,
        guardianPhone: normalised,
        consentMedia: (consent || null) as never,
        identityNote: note.trim() || null,
      },
    } as never);
    setBusy(false);
    onSaved(
      res.success ? `${athlete.athlete_code} saved.` : res.error ?? "Save failed.",
      res.success ? "good" : "bad",
    );
  };

  return (
    <Panel
      title={`Edit — ${athlete.display_name}`}
      subtitle={`${athlete.athlete_code}${athlete.legacy_code ? ` · migrated from ${athlete.legacy_code}` : ""}`}
      actions={
        <ActionButton onClick={save} tone="primary" disabled={busy || phoneInvalid}>
          {busy ? "Saving…" : "Save changes"}
        </ActionButton>
      }
    >
      <FormGrid min={190}>
        <Field label="Display name">
          <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Guardian name">
          <input style={inputStyle} value={guardianName} onChange={(e) => setGuardianName(e.target.value)} />
        </Field>
        <Field label="Guardian email">
          <input type="email" style={inputStyle} value={guardianEmail} onChange={(e) => setGuardianEmail(e.target.value)} />
        </Field>
        <Field
          label="Guardian mobile"
          hint={phoneInvalid ? "Not a Kenyan mobile (07…, 01…, +2547…)" : normalised ? `Stored as ${normalised}` : "07XX XXX XXX"}
        >
          <input
            inputMode="tel"
            style={{ ...inputStyle, borderColor: phoneInvalid ? theme.bad : theme.border }}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Media consent" hint="Explicit election — never defaulted">
          <select style={{ ...selectStyle, width: "100%" }} value={consent} onChange={(e) => setConsent(e.target.value)}>
            <option value="">Not recorded</option>
            <option value="GRANTS">GRANTS marketing use</option>
            <option value="DENIES">DENIES — analysis only</option>
          </select>
        </Field>
        <Field label="Identity note">
          <input style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </FormGrid>

      <div style={{ marginTop: 14 }}>
        <StatRow>
          <Stat label="Games played" value={fmt.int(athlete.games_played)} />
          <Stat label="Weighted points" value={fmt.int(athlete.legacy_points)} />
          <Stat label="Attendance" value={athlete.attendance_rate_pct === null ? "—" : `${fmt.num(athlete.attendance_rate_pct, 1)}%`} />
          <Stat label="Conduct cases" value={athlete.conduct_cases} tone={athlete.conduct_cases > 1 ? "warn" : "neutral"} />
        </StatRow>
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------
// Parent identity sync
// ---------------------------------------------------------------------

function ParentSync({ data }: { data: LeaguePayload }) {
  const { act } = useLeague();
  const [notice, setNotice] = useState<{ text: string; tone: "good" | "bad" } | null>(null);

  const toggle = async (athleteCode: string, verified: boolean) => {
    const res = await act({ action: "verify-guardian", athleteCode, verified });
    setNotice(
      res.success
        ? { text: `${athleteCode} guardian ${verified ? "verified" : "unverified"}.`, tone: "good" }
        : { text: res.error ?? "Failed.", tone: "bad" },
    );
  };

  const linked = data.athletes.filter((a) => a.guardian_name || a.guardian_phone_e164);
  const missing = data.athletes.length - linked.length;

  return (
    <Panel
      title="Parent identity sync"
      subtitle="Linked guardian accounts, phone verification state, and the consent log. Numbers are stored E.164 and transformed to 2547XXXXXXXX only at the M-Pesa boundary."
    >
      <StatRow>
        <Stat label="Guardians linked" value={linked.length} />
        <Stat label="Verified" value={data.counts.guardiansVerified} tone={data.counts.guardiansVerified === linked.length && linked.length > 0 ? "good" : "warn"} />
        <Stat label="Consent recorded" value={data.athletes.filter((a) => a.consent_media).length} tone={data.athletes.some((a) => !a.consent_media) ? "warn" : "good"} />
        <Stat label="No guardian on file" value={missing} tone={missing > 0 ? "bad" : "good"} />
      </StatRow>

      <div style={{ marginTop: 14 }}>
        <DataTable
          rows={linked}
          rowKey={(a) => a.athlete_code}
          empty="No guardian records yet. The legacy corpus carries no parent contact data — guardians land here as registrations settle, or through the athlete editor above."
          columns={[
            { key: "athlete", header: "Athlete", render: (a) => a.display_name },
            { key: "guardian", header: "Guardian", render: (a) => a.guardian_name ?? "—" },
            {
              key: "phone",
              header: "Mobile",
              render: (a) =>
                a.guardian_phone_e164 ? (
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{a.guardian_phone_e164}</span>
                ) : (
                  <Badge tone="bad">missing</Badge>
                ),
            },
            { key: "email", header: "Email", render: (a) => a.guardian_email ?? "—" },
            {
              key: "verified",
              header: "Verification",
              render: (a) =>
                a.guardian_verified_at ? (
                  <Badge tone="good">verified {fmt.date(a.guardian_verified_at)}</Badge>
                ) : (
                  <Badge tone="warn">unverified</Badge>
                ),
            },
            {
              key: "consent",
              header: "Media consent",
              render: (a) =>
                a.consent_media === "GRANTS" ? (
                  <Badge tone="good">grants</Badge>
                ) : a.consent_media === "DENIES" ? (
                  <Badge>denies</Badge>
                ) : (
                  <Badge tone="bad">not recorded</Badge>
                ),
            },
            {
              key: "action",
              header: "",
              render: (a) => (
                <ActionButton
                  onClick={() => void toggle(a.athlete_code, !a.guardian_verified_at)}
                  disabled={!a.guardian_phone_e164}
                  title={a.guardian_phone_e164 ? undefined : "Record a mobile number first"}
                >
                  {a.guardian_verified_at ? "Unverify" : "Mark verified"}
                </ActionButton>
              ),
            },
          ]}
        />
      </div>
      <Notice text={notice?.text ?? null} tone={notice?.tone ?? "good"} />
    </Panel>
  );
}
