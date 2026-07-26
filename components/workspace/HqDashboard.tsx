"use client";

// =====================================================================
// ATHLYTICA HQ WORKSPACE — executive telemetry across both ventures,
// system health for the Daraja/Supabase/Convex rails, and the live
// user × workspace permission matrix.
//
// Matrix writes go through POST /api/v1/workspace/dashboard, which is
// root-founder-only on the server. The controls below are a convenience,
// never the authorisation boundary.
// =====================================================================

import { useState } from "react";
import {
  WORKSPACES,
  WORKSPACE_IDS,
  WORKSPACE_ROLES,
  visibleNav,
  type WorkspaceId,
  type WorkspaceRole,
} from "@/config/workspaces";
import { useWorkspace } from "./WorkspaceProvider";
import { Badge, DataTable, Empty, Panel, Stat, StatRow, kes, selectStyle, theme, whenLocal } from "./ui";

interface VentureRevenue {
  venture: string;
  settledKes: number;
  paid: number;
}

interface DeadLetter {
  id: string;
  record_type: string | null;
  last_error: string | null;
  failed_at: string | null;
}

interface Grant {
  id: string;
  user_id: string;
  workspace: WorkspaceId;
  role: WorkspaceRole;
  created_at: string | null;
}

interface DirectoryUser {
  id: string;
  email: string;
  lastSignInAt: string | null;
}

interface HqPayload {
  revenue: {
    byVenture: VentureRevenue[];
    totalSettledKes: number;
    railTotalKes: number;
    railTransactions: number;
  };
  health: {
    supabase: string;
    darajaLastCallbackAt: string | null;
    darajaCallbackConfigured: boolean;
    darajaEnv: string;
    stkCredentialsConfigured: boolean;
    msisdnHashKeySet: boolean;
    convexConfigured: boolean;
    telemetryQueueReachable: boolean;
    deadLetterCount: number;
    deadLetters: DeadLetter[];
  };
  matrix: { grants: Grant[]; directory: DirectoryUser[] };
}

const VENTURE_LABEL: Record<string, string> = {
  NRHL: "Nairobi Regional Hockey League",
  BIG_ICE: "Big Ice Academy",
  ATHLYTICA: "Athlytica direct",
};

export function HqDashboard() {
  const { data, role, perspective, actor } = useWorkspace();
  if (!role) return null;
  const shown = new Set(visibleNav("athlytica_hq", role, perspective).map((n) => n.id));

  const payload = (data ?? {}) as Partial<HqPayload>;
  const revenue = payload.revenue;
  const health = payload.health;
  const matrix = payload.matrix;

  if (shown.size === 0) {
    return (
      <Empty>
        Athlytica HQ has no tactical panels — switch back to Executive view to see financials,
        telemetry, and administration.
      </Empty>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {shown.has("revenue") && (
        <Panel
          id="revenue"
          title="Cross-Tenant Revenue Aggregator"
          subtitle="Settled registration value across NRHL combine intakes and Big Ice packages."
        >
          <StatRow>
            <Stat
              label="Total settled"
              value={kes(revenue?.totalSettledKes ?? 0)}
              tone="good"
              hint="audited registrations"
            />
            <Stat
              label="Rail total"
              value={kes(revenue?.railTotalKes ?? 0)}
              hint={`${revenue?.railTransactions ?? 0} Paybill transactions`}
            />
            <Stat
              label="Unmatched"
              value={kes(Math.max(0, (revenue?.railTotalKes ?? 0) - (revenue?.totalSettledKes ?? 0)))}
              tone={
                (revenue?.railTotalKes ?? 0) - (revenue?.totalSettledKes ?? 0) > 0 ? "warn" : "neutral"
              }
              hint="rail minus reconciled"
            />
          </StatRow>

          <div style={{ marginTop: 14 }}>
            <DataTable
              rows={revenue?.byVenture ?? []}
              rowKey={(r) => r.venture}
              empty="No settled revenue recorded across either venture yet."
              columns={[
                {
                  key: "venture",
                  header: "Venture",
                  render: (r) => VENTURE_LABEL[r.venture] ?? r.venture,
                },
                { key: "paid", header: "Paid registrations", align: "right", render: (r) => r.paid },
                {
                  key: "value",
                  header: "Settled value",
                  align: "right",
                  render: (r) => kes(r.settledKes),
                },
              ]}
            />
          </div>
        </Panel>
      )}

      {shown.has("health") && health && (
        <Panel
          id="health"
          title="System Health & Logs"
          subtitle="Safaricom Daraja callbacks, Supabase connectivity, Convex sync state."
        >
          <StatRow>
            <Stat label="Supabase" value="connected" tone="good" />
            <Stat
              label="Daraja rail"
              value={health.darajaEnv}
              tone={health.darajaEnv === "production" ? "good" : "warn"}
              hint={health.stkCredentialsConfigured ? "credentials set" : "credentials missing"}
            />
            <Stat
              label="Last callback"
              value={whenLocal(health.darajaLastCallbackAt)}
              tone={health.darajaLastCallbackAt ? "good" : "warn"}
            />
            <Stat
              label="Convex sync"
              value={health.convexConfigured ? "configured" : "unset"}
              tone={health.convexConfigured ? "good" : "warn"}
            />
            <Stat
              label="Dead letters"
              value={health.deadLetterCount}
              tone={health.deadLetterCount > 0 ? "bad" : "good"}
            />
            <Stat
              label="MSISDN hash key"
              value={health.msisdnHashKeySet ? "provisioned" : "missing"}
              tone={health.msisdnHashKeySet ? "good" : "bad"}
              hint="unset seals checkout"
            />
          </StatRow>

          <h3
            style={{
              fontSize: 13,
              color: theme.dim,
              margin: "20px 0 8px",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
            }}
          >
            Convex bridge dead-letter queue
          </h3>
          <DataTable
            rows={health.deadLetters}
            rowKey={(d) => d.id}
            empty="No failed sync jobs — the Convex bridge is clean."
            columns={[
              { key: "when", header: "Failed", render: (d) => whenLocal(d.failed_at) },
              { key: "type", header: "Record", render: (d) => d.record_type ?? "—" },
              {
                key: "error",
                header: "Last error",
                render: (d) => (
                  <span style={{ color: theme.bad, whiteSpace: "normal" }}>{d.last_error ?? "—"}</span>
                ),
              },
            ]}
          />

          {!health.darajaCallbackConfigured && (
            <p style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: theme.warn }}>
              DARAJA_CALLBACK_URL is unset — STK settlements cannot post back and every payment will
              require manual reconciliation.
            </p>
          )}
        </Panel>
      )}

      {shown.has("matrix") && (
        <Panel
          id="matrix"
          title="User & Permission Matrix"
          subtitle="Assign or revoke workspace roles. Root founder access is hardcoded and cannot be revoked here."
        >
          <PermissionMatrix
            directory={matrix?.directory ?? []}
            grants={matrix?.grants ?? []}
            founderEmail={actor?.email ?? ""}
            editable={Boolean(actor?.isFounder)}
          />
        </Panel>
      )}
    </div>
  );
}

function PermissionMatrix({
  directory,
  grants,
  founderEmail,
  editable,
}: {
  directory: DirectoryUser[];
  grants: Grant[];
  founderEmail: string;
  editable: boolean;
}) {
  const { post } = useWorkspace();
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const grantFor = new Map(grants.map((g) => [`${g.user_id}:${g.workspace}`, g.role]));

  async function change(userId: string, workspace: WorkspaceId, value: string) {
    const key = `${userId}:${workspace}`;
    setPending(key);
    setMessage(null);
    const result = await post({
      userId,
      workspace,
      role: value === "" ? null : value,
    });
    setPending(null);
    setMessage(result.success ? "Permission matrix updated." : result.error ?? "Update failed.");
  }

  if (directory.length === 0) {
    return <Empty>No accounts in the identity directory yet.</Empty>;
  }

  return (
    <>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderBottom: `1px solid ${theme.border}`,
                  color: theme.dim,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Account
              </th>
              {WORKSPACE_IDS.map((id) => (
                <th
                  key={id}
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    borderBottom: `1px solid ${theme.border}`,
                    color: theme.dim,
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                  }}
                >
                  {WORKSPACES[id].short}
                </th>
              ))}
              <th
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderBottom: `1px solid ${theme.border}`,
                  color: theme.dim,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                }}
              >
                Last sign-in
              </th>
            </tr>
          </thead>
          <tbody>
            {directory.map((user) => {
              const isRoot = user.email.toLowerCase() === founderEmail.toLowerCase();
              return (
                <tr key={user.id}>
                  <td style={{ padding: "9px 10px", borderBottom: `1px solid ${theme.border}55` }}>
                    {user.email} {isRoot && <Badge tone="warn">root founder</Badge>}
                  </td>
                  {WORKSPACE_IDS.map((id) => (
                    <td
                      key={id}
                      style={{ padding: "9px 10px", borderBottom: `1px solid ${theme.border}55` }}
                    >
                      {isRoot ? (
                        <Badge tone="good">global founder</Badge>
                      ) : (
                        <select
                          style={selectStyle}
                          disabled={!editable || pending === `${user.id}:${id}`}
                          value={grantFor.get(`${user.id}:${id}`) ?? ""}
                          onChange={(e) => void change(user.id, id, e.target.value)}
                          aria-label={`${user.email} role in ${WORKSPACES[id].label}`}
                        >
                          <option value="">no access</option>
                          {WORKSPACE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r.replace(/_/g, " ").toLowerCase()}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                  ))}
                  <td
                    style={{
                      padding: "9px 10px",
                      borderBottom: `1px solid ${theme.border}55`,
                      color: theme.muted,
                    }}
                  >
                    {whenLocal(user.lastSignInAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {message && (
        <p role="status" style={{ marginTop: 12, marginBottom: 0, fontSize: 13, color: theme.muted }}>
          {message}
        </p>
      )}
    </>
  );
}
