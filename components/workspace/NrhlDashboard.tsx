"use client";

// =====================================================================
// NRHL WORKSPACE — combine intakes, league registrations, Paybill
// telemetry. Every figure comes from the gated dashboard endpoint;
// nothing here is illustrative.
// =====================================================================

import { visibleNav } from "@/config/workspaces";
import { useWorkspace } from "./WorkspaceProvider";
import { Badge, Column, DataTable, Empty, Panel, Stat, StatRow, kes, theme, whenLocal } from "./ui";

interface PaymentRow {
  id: string;
  mpesa_receipt_number: string | null;
  amount_kes: number | string | null;
  account_reference: string | null;
  result_code: number | null;
  transaction_timestamp: string | null;
}

interface RegistrationRow {
  id: string;
  account_reference: string | null;
  athlete_name: string | null;
  full_name: string | null;
  email: string | null;
  tier: string | null;
  payment_status: string | null;
  amount_expected_kes: number | string | null;
  preferred_campus: string | null;
  settled_receipt: string | null;
  settled_at: string | null;
  created_at: string | null;
}

interface FunnelRow {
  tier: string;
  started: number;
  paid: number;
  settledKes: number;
}

interface AthleteRow {
  athlete_id: string;
  legal_name: string | null;
  preferred_name: string | null;
  date_of_birth: string | null;
  current_status: string | null;
  primary_sport_code: string | null;
}

interface VenueRow {
  id: string;
  name: string | null;
}

interface SessionRow {
  id: string;
  venue_id: string | null;
  start_time: string | null;
  end_time: string | null;
}

interface NrhlPayload {
  paybill: string;
  stkStream: PaymentRow[];
  funnel: FunnelRow[];
  roster: RegistrationRow[];
  pending: RegistrationRow[];
  playerDatabase: AthleteRow[];
  venues: VenueRow[];
  sessions: SessionRow[];
}

const TIER_LABELS: Record<string, string> = {
  baseline_7500: "Baseline Tech Profiling · KES 7,500",
  combine_27500: "Fall Combine · KES 27,500",
  acceleration_45000: "Acceleration Program · KES 45,000",
  enterprise_150k: "Institutional License · KES 150,000",
};

const num = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0) || 0);

export function NrhlDashboard() {
  const { data, role, perspective } = useWorkspace();
  if (!role) return null;
  const shown = new Set(visibleNav("nrhl", role, perspective).map((n) => n.id));

  const payload = (data ?? {}) as Partial<NrhlPayload>;
  const stkStream = payload.stkStream ?? [];
  const funnel = payload.funnel ?? [];
  const roster = payload.roster ?? [];
  const pending = payload.pending ?? [];
  const players = payload.playerDatabase ?? [];
  const venues = payload.venues ?? [];
  const sessions = payload.sessions ?? [];

  const settledTotal = funnel.reduce((s, f) => s + f.settledKes, 0);
  const venueName = new Map(venues.map((v) => [v.id, v.name ?? "Unnamed venue"]));

  const paymentColumns: Column<PaymentRow>[] = [
    { key: "when", header: "When", render: (r) => whenLocal(r.transaction_timestamp) },
    { key: "ref", header: "Account ref", render: (r) => r.account_reference ?? "—" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (r) => kes(num(r.amount_kes)),
    },
    { key: "receipt", header: "Receipt", render: (r) => r.mpesa_receipt_number ?? "—" },
    {
      key: "status",
      header: "Result",
      render: (r) =>
        num(r.result_code) === 0 ? <Badge tone="good">settled</Badge> : <Badge tone="bad">code {r.result_code}</Badge>,
    },
  ];

  const registrantColumns: Column<RegistrationRow>[] = [
    { key: "athlete", header: "Athlete", render: (r) => r.athlete_name ?? "—" },
    { key: "guardian", header: "Guardian", render: (r) => r.full_name ?? "—" },
    { key: "tier", header: "Tier", render: (r) => (r.tier ? TIER_LABELS[r.tier] ?? r.tier : "—") },
    { key: "campus", header: "Campus", render: (r) => r.preferred_campus ?? "—" },
    { key: "ref", header: "Ref", render: (r) => r.account_reference ?? "—" },
    {
      key: "status",
      header: "Verification",
      render: (r) =>
        r.payment_status === "PAYMENT_SETTLED" ? (
          <Badge tone="good">verified</Badge>
        ) : (
          <Badge tone="warn">{(r.payment_status ?? "pending").toLowerCase()}</Badge>
        ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {shown.has("stk-stream") && (
        <Panel
          id="stk-stream"
          title="STK Push Financial Stream"
          subtitle={`Live settlement feed for M-Pesa Paybill ${payload.paybill ?? "4325935"} — newest first.`}
        >
          <StatRow>
            <Stat label="Transactions" value={stkStream.length} hint="last 25 callbacks" />
            <Stat
              label="Rail value"
              value={kes(stkStream.filter((p) => num(p.result_code) === 0).reduce((s, p) => s + num(p.amount_kes), 0))}
              tone="good"
            />
            <Stat label="Last callback" value={whenLocal(stkStream[0]?.transaction_timestamp)} />
          </StatRow>
          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={stkStream}
              columns={paymentColumns}
              rowKey={(r) => r.id}
              empty="No Paybill callbacks recorded yet. Transactions appear here the moment Daraja posts to /api/v1/biz/mpesa-callback."
            />
          </div>
        </Panel>
      )}

      {shown.has("combine-funnel") && (
        <Panel
          id="combine-funnel"
          title="Combine Funnel"
          subtitle="Registrants per tier from the /register intake, with settled value."
        >
          <StatRow>
            <Stat label="Total registrants" value={roster.length + pending.length} />
            <Stat label="Paid" value={roster.length} tone="good" />
            <Stat label="Awaiting payment" value={pending.length} tone="warn" />
            <Stat label="Settled value" value={kes(settledTotal)} tone="good" />
          </StatRow>

          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={funnel}
              rowKey={(r) => r.tier}
              empty="No NRHL registrations captured yet."
              columns={[
                {
                  key: "tier",
                  header: "Tier",
                  render: (r) => TIER_LABELS[r.tier] ?? r.tier,
                },
                { key: "started", header: "Started", align: "right", render: (r) => r.started },
                { key: "paid", header: "Paid", align: "right", render: (r) => r.paid },
                {
                  key: "conv",
                  header: "Conversion",
                  align: "right",
                  render: (r) => (r.started ? `${Math.round((r.paid / r.started) * 100)}%` : "—"),
                },
                {
                  key: "value",
                  header: "Settled",
                  align: "right",
                  render: (r) => kes(r.settledKes),
                },
              ]}
            />
          </div>

          <p style={{ marginTop: 14, marginBottom: 0, fontSize: 13, color: theme.muted }}>
            Share links:{" "}
            <a href="/register?tier=combine_27500&source=nrhl" style={{ color: theme.accent }}>
              Fall Combine (KES 27,500)
            </a>{" "}
            ·{" "}
            <a href="/register?tier=acceleration_45000&source=nrhl" style={{ color: theme.accent }}>
              Acceleration (KES 45,000)
            </a>
          </p>
        </Panel>
      )}

      {shown.has("roster") && (
        <Panel
          id="roster"
          title="Roster & Player Database"
          subtitle="Draft list of verified registrants, plus the passport athlete registry."
        >
          <h3 style={{ fontSize: 13, color: theme.dim, margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Verified draft list
          </h3>
          <DataTable
            rows={roster}
            columns={registrantColumns}
            rowKey={(r) => r.id}
            empty="No verified registrations yet — the draft list fills as payments settle."
          />

          <h3 style={{ fontSize: 13, color: theme.dim, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: "0.14em" }}>
            Passport athlete registry ({players.length})
          </h3>
          <DataTable
            rows={players}
            rowKey={(r) => r.athlete_id}
            empty="No athletes in the passport registry."
            columns={[
              {
                key: "name",
                header: "Athlete",
                render: (r) => r.preferred_name ?? r.legal_name ?? "—",
              },
              { key: "dob", header: "DOB", render: (r) => r.date_of_birth ?? "—" },
              { key: "sport", header: "Sport", render: (r) => r.primary_sport_code ?? "—" },
              {
                key: "status",
                header: "Status",
                render: (r) => <Badge>{r.current_status ?? "unknown"}</Badge>,
              },
            ]}
          />

          {pending.length > 0 && (
            <>
              <h3 style={{ fontSize: 13, color: theme.dim, margin: "20px 0 8px", textTransform: "uppercase", letterSpacing: "0.14em" }}>
                Unverified registrations ({pending.length})
              </h3>
              <DataTable
                rows={pending}
                columns={registrantColumns}
                rowKey={(r) => r.id}
                empty=""
              />
            </>
          )}
        </Panel>
      )}

      {shown.has("league-ops") && (
        <Panel
          id="league-ops"
          title="League Standings & Operations"
          subtitle="Venue allocations, scheduled sessions, and roster-lock state."
        >
          <StatRow>
            <Stat label="Venues" value={venues.length} />
            <Stat label="Scheduled sessions" value={sessions.length} />
            <Stat
              label="Roster lock"
              value={roster.length > 0 ? "Open" : "Awaiting entries"}
              tone={roster.length > 0 ? "good" : "warn"}
            />
          </StatRow>

          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={sessions}
              rowKey={(r) => r.id}
              empty="No sessions scheduled. Fixtures and standings populate once league play is recorded."
              columns={[
                { key: "start", header: "Start", render: (r) => whenLocal(r.start_time) },
                { key: "end", header: "End", render: (r) => whenLocal(r.end_time) },
                {
                  key: "venue",
                  header: "Venue",
                  render: (r) => (r.venue_id ? venueName.get(r.venue_id) ?? r.venue_id : "—"),
                },
              ]}
            />
          </div>

          {venues.length === 0 && (
            <div style={{ marginTop: 12 }}>
              <Empty>
                No venues registered. Standings tables activate once fixtures and results are being
                recorded against venues.
              </Empty>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
