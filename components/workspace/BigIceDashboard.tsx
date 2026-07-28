"use client";

// =====================================================================
// BIG ICE WORKSPACE — academy package billing, rink scheduling, skill
// development, client roster.
//
// Packages are priced from public.commercial_price_tier (tier_group =
// 'academy') — the same founder-set table the rest of the commercial
// stack reads. On-site checkout reuses the live /api/v1/biz/stk-push
// rail (Paybill 4325935); prices are re-derived server-side from the
// tier id, never trusted from this form.
// =====================================================================

import { useState } from "react";
import { visibleNav } from "@/config/workspaces";
import { useWorkspace } from "./WorkspaceProvider";
import {
  Badge,
  Column,
  DataTable,
  Empty,
  Panel,
  Stat,
  StatRow,
  buttonStyle,
  kes,
  selectStyle,
  theme,
  whenLocal,
} from "./ui";

interface PackageRow {
  tier_id: string;
  tier_name: string | null;
  price_amount: number | string | null;
  currency: string | null;
}

interface ScheduleRow {
  registry_id: string;
  track_type: string | null;
  cohort_label: string | null;
  session_slot: number | null;
  session_day_of_week: number | null;
  window_start_time: string | null;
  window_end_time: string | null;
  capacity: number | null;
  student_athlete_id: string | null;
  price_tier_id: string | null;
  enrollment_status: string | null;
  season_start_date: string | null;
  season_end_date: string | null;
}

interface BalanceRow {
  athleteId: string;
  athleteName: string;
  enrolled: number;
  completed: number;
  remaining: number;
}

interface ClientRow {
  id: string;
  account_reference: string | null;
  athlete_name: string | null;
  full_name: string | null;
  email: string | null;
  tier: string | null;
  payment_status: string | null;
  amount_expected_kes: number | string | null;
  created_at: string | null;
}

interface AthleteRow {
  athlete_id: string;
  legal_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  current_status: string | null;
  parent_email: string | null;
}

interface GuardianRow {
  guardian_id: string;
  athlete_id: string | null;
  legal_name: string | null;
  relationship: string | null;
  contact_info: unknown;
  consent_on_file: boolean | null;
}

interface PerfRow {
  id: string;
  athlete_id: string | null;
  speed: number | null;
  agility: number | null;
  stamina: number | null;
  technical: number | null;
  cognitive: number | null;
  composite_score: number | null;
  created_at: string | null;
}

interface PriceDriftRow {
  label: string;
  publishedKes: number;
  chargedKes: number | null;
}

interface BigIcePayload {
  packages: PackageRow[];
  priceDrift: PriceDriftRow[];
  publishedPricing: { live: boolean; source: string };
  schedule: ScheduleRow[];
  balances: BalanceRow[];
  clients: ClientRow[];
  athletes: AthleteRow[];
  guardians: GuardianRow[];
  performance: PerfRow[];
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const metric = (v: number | null) => (v === null ? "—" : v.toFixed(1));

export function BigIceDashboard() {
  const { data, role, perspective } = useWorkspace();
  if (!role) return null;
  const shown = new Set(visibleNav("big_ice", role, perspective).map((n) => n.id));

  const payload = (data ?? {}) as Partial<BigIcePayload>;
  const packages = payload.packages ?? [];
  const priceDrift = payload.priceDrift ?? [];
  const schedule = payload.schedule ?? [];
  const balances = payload.balances ?? [];
  const clients = payload.clients ?? [];
  const athletes = payload.athletes ?? [];
  const guardians = payload.guardians ?? [];
  const performance = payload.performance ?? [];

  const athleteName = new Map(
    athletes.map((a) => [a.athlete_id, a.preferred_name ?? a.legal_name ?? a.athlete_id]),
  );
  const guardianFor = new Map(guardians.map((g) => [g.athlete_id ?? "", g]));
  const packageName = new Map(packages.map((p) => [p.tier_id, p.tier_name ?? "Package"]));

  const clientColumns: Column<ClientRow>[] = [
    { key: "athlete", header: "Athlete", render: (r) => r.athlete_name ?? "—" },
    { key: "guardian", header: "Parent / guardian", render: (r) => r.full_name ?? "—" },
    { key: "email", header: "Contact", render: (r) => r.email ?? "—" },
    {
      key: "amount",
      header: "Package",
      align: "right",
      render: (r) => kes(num(r.amount_expected_kes)),
    },
    {
      key: "status",
      header: "Status",
      render: (r) =>
        r.payment_status === "PAYMENT_SETTLED" ? (
          <Badge tone="good">active</Badge>
        ) : (
          <Badge tone="warn">{(r.payment_status ?? "pending").toLowerCase()}</Badge>
        ),
    },
    { key: "joined", header: "Joined", render: (r) => whenLocal(r.created_at) },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {shown.has("billing") && (
        <Panel
          id="billing"
          title="Big Ice Package Billing Engine"
          subtitle="Active academy packages, on-site M-Pesa checkout, and session-pack balances."
        >
          {/* A parent quoted one number on bigice.co.ke and charged
              another at the Paybill is a dispute, not a rounding issue.
              The rail charges the tier table; this says when the two
              have drifted apart, and refuses to guess which is right. */}
          {priceDrift.length > 0 && (
            <div
              role="alert"
              style={{
                background: "#2c2415",
                border: "1px solid #7f6b2b",
                borderRadius: 8,
                padding: "12px 14px",
                marginBottom: 14,
                fontSize: 13,
                lineHeight: 1.7,
                color: "#f6c443",
              }}
            >
              <strong>Published price does not match the charging table.</strong>
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {priceDrift.map((d) => (
                  <li key={d.label}>
                    {d.label}: bigice.co.ke shows <strong>{kes(d.publishedKes)}</strong>, the
                    M-Pesa rail would charge{" "}
                    <strong>{d.chargedKes === null ? "—" : kes(d.chargedKes)}</strong>.
                  </li>
                ))}
              </ul>
              <span style={{ display: "block", marginTop: 8, color: theme.muted }}>
                Update whichever is wrong — the site copy, or
                commercial_price_tier. Checkout charges the table.
              </span>
            </div>
          )}

          <StatRow>
            <Stat label="Active packages" value={packages.length} />
            <Stat label="Enrolled clients" value={clients.filter((c) => c.payment_status === "PAYMENT_SETTLED").length} tone="good" />
            <Stat
              label="Recurring value"
              value={kes(
                clients
                  .filter((c) => c.payment_status === "PAYMENT_SETTLED")
                  .reduce((s, c) => s + num(c.amount_expected_kes), 0),
              )}
              tone="good"
            />
          </StatRow>

          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={packages}
              rowKey={(p) => p.tier_id}
              empty="No active academy packages in commercial_price_tier."
              columns={[
                { key: "name", header: "Package", render: (p) => p.tier_name ?? "—" },
                {
                  key: "price",
                  header: "Price",
                  align: "right",
                  render: (p) => `${p.currency ?? "KES"} ${num(p.price_amount).toLocaleString("en-KE")}`,
                },
                {
                  key: "enrolled",
                  header: "Enrolled",
                  align: "right",
                  render: (p) =>
                    schedule.filter((s) => s.price_tier_id === p.tier_id && s.enrollment_status === "enrolled")
                      .length,
                },
              ]}
            />
          </div>

          <QuickCheckout packages={packages} />

          <h3
            style={{
              fontSize: 13,
              color: theme.dim,
              margin: "20px 0 8px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            Session-pack balances
          </h3>
          <DataTable
            rows={balances}
            rowKey={(b) => b.athleteId}
            empty="No session packs enrolled this season."
            columns={[
              { key: "athlete", header: "Client", render: (b) => b.athleteName },
              {
                key: "remaining",
                header: "Remaining",
                align: "right",
                render: (b) => (
                  <strong style={{ color: b.remaining > 0 ? theme.good : theme.warn }}>
                    {b.remaining} session{b.remaining === 1 ? "" : "s"}
                  </strong>
                ),
              },
              { key: "completed", header: "Completed", align: "right", render: (b) => b.completed },
            ]}
          />
        </Panel>
      )}

      {shown.has("schedule") && (
        <Panel
          id="schedule"
          title="Training Schedule & Rink Allocations"
          subtitle="Ice and inline slots for the current season, grouped by weekday."
        >
          {schedule.length === 0 ? (
            <Empty>No session slots registered in cohort_session_registry.</Empty>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {DAYS.map((day, index) => {
                const slots = schedule.filter((s) => s.session_day_of_week === index);
                if (slots.length === 0) return null;
                return (
                  <div
                    key={day}
                    style={{
                      border: `1px solid ${theme.border}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      background: theme.panelAlt,
                    }}
                  >
                    <strong style={{ fontSize: 13 }}>{day}</strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: 13, color: theme.muted, lineHeight: 1.8 }}>
                      {slots.map((s) => (
                        <li key={s.registry_id}>
                          {(s.window_start_time ?? "--:--").slice(0, 5)}–
                          {(s.window_end_time ?? "--:--").slice(0, 5)} · {s.cohort_label ?? "Cohort"} ·{" "}
                          {(s.track_type ?? "track").replace(/_/g, " ")}
                          {s.capacity ? ` · capacity ${s.capacity}` : ""}
                          {s.price_tier_id ? ` · ${packageName.get(s.price_tier_id) ?? ""}` : ""}{" "}
                          <Badge tone={s.enrollment_status === "enrolled" ? "good" : "neutral"}>
                            {s.enrollment_status ?? "open"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {shown.has("development") && (
        <Panel
          id="development"
          title="Developmental Session Metrics"
          subtitle="Skill progression from committed coach evaluations (performance_logs)."
        >
          <DataTable
            rows={performance}
            rowKey={(p) => p.id}
            empty="No evaluations committed yet. Rows appear as coaches submit POST /api/v1/sessions/evaluate."
            columns={[
              { key: "when", header: "Logged", render: (p) => whenLocal(p.created_at) },
              {
                key: "athlete",
                header: "Athlete",
                render: (p) => (p.athlete_id ? athleteName.get(p.athlete_id) ?? p.athlete_id : "—"),
              },
              { key: "speed", header: "Speed", align: "right", render: (p) => metric(p.speed) },
              { key: "agility", header: "Agility", align: "right", render: (p) => metric(p.agility) },
              { key: "stamina", header: "Stamina", align: "right", render: (p) => metric(p.stamina) },
              { key: "technical", header: "Technical", align: "right", render: (p) => metric(p.technical) },
              { key: "cognitive", header: "Cognitive", align: "right", render: (p) => metric(p.cognitive) },
              {
                key: "composite",
                header: "Composite",
                align: "right",
                render: (p) => (
                  <strong style={{ color: theme.accent }}>{metric(p.composite_score)}</strong>
                ),
              },
            ]}
          />
        </Panel>
      )}

      {shown.has("clients") && (
        <Panel
          id="clients"
          title="Client Roster"
          subtitle="Enrolled athletes with attendance history and guardian emergency contacts."
        >
          <DataTable
            rows={clients}
            columns={clientColumns}
            rowKey={(c) => c.id}
            empty="No Big Ice registrations recorded yet."
          />

          <h3
            style={{
              fontSize: 13,
              color: theme.dim,
              margin: "20px 0 8px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            Emergency contact cards
          </h3>
          <DataTable
            rows={athletes}
            rowKey={(a) => a.athlete_id}
            empty="No athletes on file."
            columns={[
              {
                key: "athlete",
                header: "Athlete",
                render: (a) => a.preferred_name ?? a.legal_name ?? "—",
              },
              { key: "dob", header: "DOB", render: (a) => a.date_of_birth ?? "—" },
              {
                key: "guardian",
                header: "Guardian",
                render: (a) => guardianFor.get(a.athlete_id)?.legal_name ?? "—",
              },
              {
                key: "relationship",
                header: "Relationship",
                render: (a) => guardianFor.get(a.athlete_id)?.relationship ?? "—",
              },
              { key: "contact", header: "Contact", render: (a) => a.parent_email ?? "—" },
              {
                key: "consent",
                header: "Consent",
                render: (a) =>
                  guardianFor.get(a.athlete_id)?.consent_on_file ? (
                    <Badge tone="good">on file</Badge>
                  ) : (
                    <Badge tone="warn">missing</Badge>
                  ),
              },
            ]}
          />
        </Panel>
      )}
    </div>
  );
}

/**
 * On-site STK checkout. Sends only the package id — the route re-reads
 * the price from commercial_price_tier, so a tampered form cannot
 * under-charge a package.
 */
function QuickCheckout({ packages }: { packages: PackageRow[] }) {
  const [open, setOpen] = useState(false);
  const [tierId, setTierId] = useState("");
  const [phone, setPhone] = useState("");
  const [athlete, setAthlete] = useState("");
  const [parent, setParent] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const selected = packages.find((p) => p.tier_id === (tierId || packages[0]?.tier_id));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/v1/biz/stk-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceTierId: selected.tier_id,
          phoneNumber: phone,
          athleteName: athlete,
          parentName: parent || undefined,
          parentEmail: email,
          source: "bigice",
        }),
      });
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        accountReference?: string;
        amountKes?: number;
        stkPush?: { dispatched?: boolean };
      };
      if (!res.ok || !body.success) {
        setResult({ ok: false, message: body.error ?? `Checkout failed (${res.status}).` });
      } else {
        setResult({
          ok: true,
          message: body.stkPush?.dispatched
            ? `Prompt sent for ${kes(body.amountKes ?? 0)} — reference ${body.accountReference}.`
            : `STK unavailable. Ask the client to pay Paybill 4325935, account ${body.accountReference}, ${kes(body.amountKes ?? 0)}.`,
        });
      }
    } catch {
      setResult({ ok: false, message: "Network error contacting the checkout service." });
    } finally {
      setBusy(false);
    }
  }

  if (packages.length === 0) return null;

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" style={buttonStyle} onClick={() => setOpen((v) => !v)}>
        {open ? "Close checkout" : "On-site checkout (STK push)"}
      </button>

      {open && (
        <form
          onSubmit={submit}
          style={{
            marginTop: 12,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            border: `1px solid ${theme.border}`,
            borderRadius: 10,
            padding: 14,
            background: theme.panelAlt,
          }}
        >
          <label style={{ fontSize: 12, color: theme.muted }}>
            Package
            <select
              style={{ ...selectStyle, width: "100%", marginTop: 4 }}
              value={tierId || packages[0]?.tier_id || ""}
              onChange={(e) => setTierId(e.target.value)}
            >
              {packages.map((p) => (
                <option key={p.tier_id} value={p.tier_id}>
                  {p.tier_name} — {kes(num(p.price_amount))}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: 12, color: theme.muted }}>
            M-Pesa phone
            <input
              required
              type="tel"
              placeholder="07XXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ ...selectStyle, width: "100%", marginTop: 4, boxSizing: "border-box" }}
            />
          </label>
          <label style={{ fontSize: 12, color: theme.muted }}>
            Athlete name
            <input
              required
              minLength={2}
              value={athlete}
              onChange={(e) => setAthlete(e.target.value)}
              style={{ ...selectStyle, width: "100%", marginTop: 4, boxSizing: "border-box" }}
            />
          </label>
          <label style={{ fontSize: 12, color: theme.muted }}>
            Parent / guardian
            <input
              value={parent}
              onChange={(e) => setParent(e.target.value)}
              style={{ ...selectStyle, width: "100%", marginTop: 4, boxSizing: "border-box" }}
            />
          </label>
          <label style={{ fontSize: 12, color: theme.muted }}>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...selectStyle, width: "100%", marginTop: 4, boxSizing: "border-box" }}
            />
          </label>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="submit"
              disabled={busy}
              style={{
                ...buttonStyle,
                width: "100%",
                background: busy ? "#1d4e33" : "#16a34a",
                borderColor: "transparent",
                color: "#fff",
              }}
            >
              {busy ? "Sending…" : `Charge ${kes(num(selected?.price_amount))}`}
            </button>
          </div>

          {result && (
            <p
              role="status"
              style={{
                gridColumn: "1 / -1",
                margin: 0,
                fontSize: 13,
                color: result.ok ? theme.good : theme.bad,
              }}
            >
              {result.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
