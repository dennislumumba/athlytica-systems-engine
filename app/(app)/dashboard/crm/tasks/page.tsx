"use client";

// =====================================================================
// TAB 4 — TASKS
//
// Overdue first, always. Grouping is by urgency rather than by contact,
// because the question this tab answers is "what now", not "who".
// =====================================================================

import { useMemo, useState } from "react";
import {
  CrmGate,
  Field,
  dueLabel,
  indexes,
  inputStyle,
  labelOf,
  todayNairobi,
  useCrm,
  type CrmPayload,
  type Task,
} from "@/components/workspace/crm";
import { PRIORITIES, PRIORITY_IDS, type Priority } from "@/config/crm";
import { Badge, Empty, Panel, Stat, StatRow, buttonStyle, theme } from "@/components/workspace/ui";

export default function CrmTasksTab() {
  return <CrmGate>{(data) => <Tasks data={data} />}</CrmGate>;
}

function Tasks({ data }: { data: CrmPayload }) {
  const [showDone, setShowDone] = useState(false);
  const today = todayNairobi();
  const idx = indexes(data);

  const groups = useMemo(() => {
    const pending = data.tasks.filter((t) => t.status === "pending");
    const byDue = (a: Task, b: Task) => a.due_date.localeCompare(b.due_date);
    return {
      overdue: pending.filter((t) => t.due_date < today).sort(byDue),
      today: pending.filter((t) => t.due_date === today).sort(byDue),
      upcoming: pending.filter((t) => t.due_date > today).sort(byDue),
      done: data.tasks
        .filter((t) => t.status !== "pending")
        .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at)),
    };
  }, [data.tasks, today]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel title="Workload">
        <StatRow>
          <Stat label="Overdue" value={groups.overdue.length} tone={groups.overdue.length > 0 ? "bad" : "good"} />
          <Stat label="Due today" value={groups.today.length} tone={groups.today.length > 0 ? "warn" : "neutral"} />
          <Stat label="Upcoming" value={groups.upcoming.length} />
          <Stat label="Closed" value={groups.done.length} />
        </StatRow>
      </Panel>

      <NewTaskForm data={data} />

      <Panel title="Overdue" subtitle="Oldest first.">
        <TaskRows tasks={groups.overdue} data={data} idx={idx} empty="Nothing overdue." />
      </Panel>
      <Panel title="Due today">
        <TaskRows tasks={groups.today} data={data} idx={idx} empty="Nothing due today." />
      </Panel>
      <Panel title="Upcoming">
        <TaskRows tasks={groups.upcoming} data={data} idx={idx} empty="Nothing scheduled." />
      </Panel>

      <Panel
        title="Closed"
        actions={
          <button type="button" style={buttonStyle} onClick={() => setShowDone((v) => !v)}>
            {showDone ? "Hide" : `Show ${groups.done.length}`}
          </button>
        }
      >
        {showDone ? (
          <TaskRows tasks={groups.done} data={data} idx={idx} empty="Nothing closed yet." />
        ) : (
          <p style={{ margin: 0, fontSize: 13, color: theme.dim }}>
            {groups.done.length} completed or cancelled.
          </p>
        )}
      </Panel>
    </div>
  );
}

function TaskRows({
  tasks,
  data,
  idx,
  empty,
}: {
  tasks: Task[];
  data: CrmPayload;
  idx: ReturnType<typeof indexes>;
  empty: string;
}) {
  const { act } = useCrm();
  const [busy, setBusy] = useState<string | null>(null);

  if (tasks.length === 0) return <Empty>{empty}</Empty>;

  async function set(taskId: string, status: "completed" | "cancelled" | "pending") {
    setBusy(taskId);
    await act({ action: "update-task", taskId, patch: { status } });
    setBusy(null);
  }

  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
      {tasks.map((t) => {
        const due = dueLabel(t.due_date);
        const contact = idx.contactById.get(t.contact_id);
        const deal = t.opportunity_id ? idx.opportunityById.get(t.opportunity_id) : null;
        const closed = t.status !== "pending";

        return (
          <li
            key={t.task_id}
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              background: theme.panelAlt,
              border: `1px solid ${!closed && due.tone === "bad" ? `${theme.bad}66` : theme.border}`,
              borderLeft: `3px solid ${closed ? theme.border : due.tone === "bad" ? theme.bad : due.tone === "warn" ? theme.warn : theme.accent}`,
              borderRadius: 10,
              padding: "10px 12px",
              opacity: busy === t.task_id ? 0.5 : closed ? 0.65 : 1,
            }}
          >
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: t.status === "cancelled" ? "line-through" : "none" }}>
                {t.title}
              </div>
              <div style={{ fontSize: 12, color: theme.muted, marginTop: 2 }}>
                {contact?.full_name ?? "Unknown"}
                {deal && <> · {labelOf.product(deal.product)}</>} · {t.due_date}
              </div>
              {t.description && (
                <div style={{ fontSize: 12, color: theme.dim, marginTop: 3 }}>{t.description}</div>
              )}
            </div>

            <Badge tone={PRIORITY_TONE_MAP[t.priority] ?? "neutral"}>
              {PRIORITIES[t.priority as Priority] ?? t.priority}
            </Badge>
            {!closed && (
              <Badge tone={due.tone === "bad" ? "bad" : due.tone === "warn" ? "warn" : "neutral"}>{due.text}</Badge>
            )}
            {closed && <Badge tone={t.status === "completed" ? "good" : "neutral"}>{t.status}</Badge>}

            {closed ? (
              <button type="button" style={{ ...buttonStyle, minHeight: 40 }} onClick={() => void set(t.task_id, "pending")}>
                Reopen
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void set(t.task_id, "completed")}
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
                <button type="button" style={{ ...buttonStyle, minHeight: 40 }} onClick={() => void set(t.task_id, "cancelled")}>
                  Cancel
                </button>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const PRIORITY_TONE_MAP: Record<string, "bad" | "warn" | "good" | "neutral"> = {
  urgent: "bad",
  high: "warn",
  medium: "neutral",
  low: "neutral",
};

function NewTaskForm({ data }: { data: CrmPayload }) {
  const { act } = useCrm();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState(todayNairobi());
  const [priority, setPriority] = useState<Priority>("medium");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const dealsForContact = data.opportunities.filter((o) => o.contact_id === contactId);

  async function submit() {
    if (!contactId) return setError("Pick a contact.");
    if (!title.trim()) return setError("What is the action?");
    setBusy(true);
    setError(null);
    const result = await act({
      action: "create-task",
      contactId,
      opportunityId: opportunityId || undefined,
      title: title.trim(),
      dueDate,
      priority,
    });
    setBusy(false);
    if (!result.success) return setError(result.error ?? "Could not create that task.");
    setTitle("");
    setOpportunityId("");
    setOpen(false);
  }

  if (!open) {
    return (
      <div>
        <button type="button" style={{ ...buttonStyle, minHeight: 42 }} onClick={() => setOpen(true)}>
          + New task
        </button>
      </div>
    );
  }

  if (data.contacts.length === 0) {
    return (
      <Panel title="New task">
        <Empty>Add a contact first — every task belongs to someone.</Empty>
      </Panel>
    );
  }

  return (
    <Panel
      title="New task"
      actions={
        <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
          Cancel
        </button>
      }
    >
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Field label="Contact">
          <select
            style={inputStyle}
            value={contactId}
            onChange={(e) => {
              setContactId(e.target.value);
              setOpportunityId("");
            }}
          >
            <option value="">Choose…</option>
            {data.contacts.map((c) => (
              <option key={c.contact_id} value={c.contact_id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </Field>
        {dealsForContact.length > 0 && (
          <Field label="Deal">
            <select style={inputStyle} value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
              <option value="">Not deal-specific</option>
              {dealsForContact.map((o) => (
                <option key={o.opportunity_id} value={o.opportunity_id}>
                  {labelOf.product(o.product)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Action">
          <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Call about the payment plan" />
        </Field>
        <Field label="Due">
          <input style={inputStyle} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Priority">
          <select style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            {PRIORITY_IDS.map((p) => (
              <option key={p} value={p}>
                {PRIORITIES[p]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: theme.bad }}>{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        style={{ ...buttonStyle, marginTop: 12, minHeight: 42, borderColor: theme.accent, color: theme.accent }}
      >
        {busy ? "Saving…" : "Create task"}
      </button>
    </Panel>
  );
}
