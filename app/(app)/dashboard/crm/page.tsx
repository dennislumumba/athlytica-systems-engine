"use client";

// =====================================================================
// TAB 1 — TODAY
//
// The answer to "who do I need to contact today?", above the fold, on a
// phone. Overdue work is first and loud; everything else is context.
//
// No figure here is decorative. Where a number cannot be computed
// honestly the tile says so instead of showing a zero — a zero and an
// unknown look identical and only one of them is a sales result.
// =====================================================================

import Link from "next/link";
import {
  CrmGate,
  dueLabel,
  indexes,
  labelOf,
  shortKes,
  useCrm,
  type CrmPayload,
  type Opportunity,
  type Task,
} from "@/components/workspace/crm";
import { Badge, Empty, Kpi, Panel, Stat, StatRow, kes, theme } from "@/components/workspace/ui";

export default function CrmTodayTab() {
  return <CrmGate>{(data) => <Today data={data} />}</CrmGate>;
}

function Today({ data }: { data: CrmPayload }) {
  const { today, pipeline, revenue, kpi, alerts, conversion } = data.metrics;
  const idx = indexes(data);
  const nameOf = (id: string) => idx.contactById.get(id)?.full_name ?? "Unknown contact";

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {data.productionReceiptCount === 0 && (
        <p
          role="status"
          style={{
            margin: 0,
            background: "#2a2013",
            border: `1px solid ${theme.warn}55`,
            borderRadius: 10,
            padding: "11px 14px",
            fontSize: 12.5,
            color: theme.warn,
            lineHeight: 1.6,
          }}
        >
          <strong>No production payment has ever settled.</strong> Every settlement in this database is
          classified TEST, so <em>cash collected</em> is structurally KES 0 — it is not a sales result.
          Pipeline and won figures below are real; collected figures start counting at the first live
          M-Pesa settlement.
        </p>
      )}

      {/* ------------------------------------------------ the four numbers */}
      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
        }}
      >
        <Kpi
          label="Pipeline value"
          value={shortKes(pipeline.totalValueKes)}
          unit="KES"
          hint={`${pipeline.openCount} open ${pipeline.openCount === 1 ? "deal" : "deals"}`}
        />
        <Kpi
          label="Weighted pipeline"
          value={shortKes(pipeline.weightedValueKes)}
          unit="KES"
          tone="warn"
          hint="value × probability"
        />
        <Kpi
          label="Won"
          value={shortKes(revenue.wonKes)}
          unit="KES"
          tone="good"
          hint="believed closed — not yet cash"
        />
        <Kpi
          label="Cash collected"
          value={shortKes(revenue.collectedKes)}
          unit="KES"
          tone={revenue.collectedKes > 0 ? "good" : "neutral"}
          hint={
            revenue.outstandingKes > 0
              ? `${kes(revenue.outstandingKes)} won but unpaid`
              : "settled, production receipts only"
          }
        />
      </div>

      {/* ----------------------------------------------------- priorities */}
      <Panel
        title="Overdue"
        subtitle="Past their due date. This is the only list that should ever be empty."
      >
        <TaskList tasks={today.overdue} nameOf={nameOf} empty="Nothing overdue. " />
      </Panel>

      <Panel title="Due today" subtitle="Today in Nairobi.">
        <TaskList tasks={today.dueToday} nameOf={nameOf} empty="Nothing due today." />
      </Panel>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        }}
      >
        <Panel title="Hot leads" subtitle="Marked hot and still open, biggest first.">
          <DealList deals={today.hotLeads} nameOf={nameOf} empty="No leads marked hot." />
        </Panel>

        <Panel
          title="Awaiting payment"
          subtitle="Closest to cash. An STK push has been asked for but the money has not landed."
        >
          <DealList deals={today.paymentPending} nameOf={nameOf} empty="Nothing awaiting payment." />
        </Panel>
      </div>

      {today.meetingsToday.length > 0 && (
        <Panel title="Meetings today">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {today.meetingsToday.map((m) => (
              <li key={m.activity_id} style={{ fontSize: 13 }}>
                <strong>{nameOf(m.contact_id)}</strong>
                <span style={{ color: theme.muted }}> — {m.subject}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {/* -------------------------------------------------- this week's work */}
      <Panel
        title="This week"
        subtitle="Selling activity over the last seven days — what you did, not what you hope for."
      >
        <StatRow>
          <Stat label="New leads" value={kpi.newLeads} />
          <Stat label="Follow-ups done" value={kpi.followUpsCompleted} />
          <Stat label="Calls" value={kpi.salesCalls} />
          <Stat label="Proposals sent" value={kpi.proposalsSent} />
          <Stat label="Deals won" value={kpi.dealsWon} tone={kpi.dealsWon > 0 ? "good" : "neutral"} />
          <Stat
            label="Cash collected"
            value={kpi.cashCollectedKes > 0 ? kes(kpi.cashCollectedKes) : "—"}
            tone={kpi.cashCollectedKes > 0 ? "good" : "neutral"}
          />
          <Stat
            label="KES per activity"
            value={kpi.kesPerActivity === null ? "—" : kes(kpi.kesPerActivity)}
            hint={kpi.kesPerActivity === null ? "no logged activity yet" : "cash ÷ logged actions"}
          />
        </StatRow>
      </Panel>

      {/* ------------------------------------------------------- conversion */}
      <Panel
        title="Conversion"
        subtitle="Measured from the stage history, so a deal that later went cold still counts as having reached qualified."
      >
        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          }}
        >
          {conversion.steps.map((s) => (
            <div
              key={`${s.from}-${s.to}`}
              style={{
                background: theme.panelAlt,
                border: `1px solid ${theme.border}`,
                borderRadius: 10,
                padding: "11px 13px",
              }}
            >
              <div style={{ fontSize: 11, color: theme.dim, letterSpacing: "0.1em" }}>
                {s.from} → {s.to}
              </div>
              <div style={{ fontSize: 21, fontWeight: 700, marginTop: 5 }}>
                {s.ratePct === null ? "—" : `${s.ratePct}%`}
              </div>
              <div style={{ fontSize: 11.5, color: theme.muted, marginTop: 3 }}>
                {s.denominator === 0 ? "nothing has reached this step" : `${s.numerator} of ${s.denominator}`}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ----------------------------------------------------------- alerts */}
      <Panel
        title="Needs attention"
        subtitle="Warnings, not errors. Every one of these is a judgement call the system will not make for you."
      >
        <div style={{ display: "grid", gap: 12 }}>
          <AlertRow
            label="Money landed, deal not marked won"
            deals={revenue.settledNotWon}
            nameOf={nameOf}
            tone="good"
            note="A settlement arrived against the linked registration. Confirm the win."
          />
          <AlertRow
            label={`No contact in ${14} days`}
            deals={alerts.stale}
            nameOf={nameOf}
            tone="warn"
            note="Open deals nobody has touched. These are how a pipeline quietly dies."
          />
          <AlertRow
            label="Open with no next action"
            deals={alerts.withoutNextAction}
            nameOf={nameOf}
            tone="warn"
            note="An active deal with nothing scheduled is a deal you will forget."
          />
          {data.duplicates.length > 0 && (
            <div style={{ fontSize: 13 }}>
              <Badge tone="warn">{data.duplicates.length} possible duplicate contacts</Badge>{" "}
              <Link href="/dashboard/crm/contacts" style={{ color: theme.accent, fontSize: 12.5 }}>
                review in Contacts →
              </Link>
            </div>
          )}
          {revenue.settledNotWon.length === 0 &&
            alerts.stale.length === 0 &&
            alerts.withoutNextAction.length === 0 &&
            data.duplicates.length === 0 && <Empty>Nothing needs attention.</Empty>}
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------

function TaskList({
  tasks,
  nameOf,
  empty,
}: {
  tasks: Task[];
  nameOf: (id: string) => string;
  empty: string;
}) {
  const { act } = useCrm();
  if (tasks.length === 0) return <Empty>{empty}</Empty>;

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {tasks.map((t) => {
        const due = dueLabel(t.due_date);
        return (
          <li
            key={t.task_id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
              background: theme.panelAlt,
              border: `1px solid ${due.tone === "bad" ? `${theme.bad}66` : theme.border}`,
              borderLeft: `3px solid ${due.tone === "bad" ? theme.bad : theme.border}`,
              borderRadius: 10,
              padding: "10px 12px",
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{t.title}</div>
              <div style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
                {nameOf(t.contact_id)} · {t.due_date}
              </div>
            </div>
            <Badge tone={due.tone === "bad" ? "bad" : due.tone === "warn" ? "warn" : "neutral"}>
              {due.text}
            </Badge>
            <button
              type="button"
              onClick={() => void act({ action: "update-task", taskId: t.task_id, patch: { status: "completed" } })}
              style={{
                minHeight: 40,
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${theme.good}55`,
                background: `${theme.good}18`,
                color: theme.good,
                fontSize: 12.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Done
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function DealList({
  deals,
  nameOf,
  empty,
}: {
  deals: Opportunity[];
  nameOf: (id: string) => string;
  empty: string;
}) {
  if (deals.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {deals.slice(0, 8).map((o) => (
        <li
          key={o.opportunity_id}
          style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}
        >
          <span>
            <strong>{nameOf(o.contact_id)}</strong>
            <span style={{ color: theme.muted }}> · {labelOf.product(o.product)}</span>
          </span>
          <strong style={{ whiteSpace: "nowrap" }}>{kes(o.value_kes)}</strong>
        </li>
      ))}
    </ul>
  );
}

function AlertRow({
  label,
  deals,
  nameOf,
  tone,
  note,
}: {
  label: string;
  deals: Opportunity[];
  nameOf: (id: string) => string;
  tone: "good" | "warn";
  note: string;
}) {
  if (deals.length === 0) return null;
  return (
    <div>
      <Badge tone={tone}>
        {deals.length} {label}
      </Badge>
      <p style={{ margin: "6px 0 4px", fontSize: 12, color: theme.dim }}>{note}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 4 }}>
        {deals.slice(0, 5).map((o) => (
          <li key={o.opportunity_id} style={{ fontSize: 13 }}>
            {nameOf(o.contact_id)}
            <span style={{ color: theme.muted }}>
              {" "}
              · {labelOf.product(o.product)} · {kes(o.value_kes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
