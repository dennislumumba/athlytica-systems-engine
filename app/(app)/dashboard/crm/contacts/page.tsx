"use client";

// =====================================================================
// TAB 3 — CONTACTS
//
// Search, a list, and one detail pane carrying the whole relationship:
// deals, timeline, and the athlete link.
//
// THE ATHLETE LINK IS THE ANTI-DUPLICATION MECHANISM (§2, §12). When a
// parent converts, the contact POINTS AT the existing public.athlete row
// rather than a second person being typed in. Creating an athlete is not
// offered here at all — that happens on the payment-authorised
// onboarding path, and inventing a second door into the athlete table is
// exactly what this module exists to avoid.
// =====================================================================

import { useMemo, useState } from "react";
import {
  CrmGate,
  Field,
  indexes,
  inputStyle,
  labelOf,
  searchContacts,
  useCrm,
  type Contact,
  type CrmPayload,
} from "@/components/workspace/crm";
import {
  ACTIVITY_TYPES,
  ACTIVITY_TYPE_IDS,
  CONTACT_TYPES,
  CONTACT_TYPE_IDS,
  SOURCE_IDS,
  STAGES,
  type ActivityType,
  type ContactType,
  type Stage,
} from "@/config/crm";
import { Badge, DataTable, Empty, Panel, buttonStyle, kes, selectStyle, theme, whenLocal } from "@/components/workspace/ui";
import type { Column } from "@/components/workspace/ui";

export default function CrmContactsTab() {
  return <CrmGate>{(data) => <Contacts data={data} />}</CrmGate>;
}

function Contacts({ data }: { data: CrmPayload }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const results = useMemo(() => searchContacts(data, query), [data, query]);
  const idx = indexes(data);
  const contact = selected ? idx.contactById.get(selected) : null;

  const duplicateIds = new Set(data.duplicates.flatMap((d) => d.contactIds));

  const columns: Column<Contact>[] = [
    {
      key: "name",
      header: "Name",
      render: (c) => (
        <button
          type="button"
          onClick={() => setSelected(c.contact_id)}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: selected === c.contact_id ? theme.accent : theme.text,
            font: "inherit",
            fontWeight: 600,
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          {c.full_name}
        </button>
      ),
    },
    { key: "type", header: "Type", render: (c) => CONTACT_TYPES[c.contact_type as ContactType] ?? c.contact_type },
    { key: "phone", header: "Phone", render: (c) => c.phone ?? "—" },
    { key: "email", header: "Email", render: (c) => c.email ?? "—" },
    {
      key: "org",
      header: "Organization",
      render: (c) => (c.organization_id ? (idx.orgById.get(c.organization_id)?.name ?? "—") : "—"),
    },
    { key: "source", header: "Source", render: (c) => labelOf.source(c.source) },
    {
      key: "flags",
      header: "",
      render: (c) => (
        <span style={{ display: "flex", gap: 4 }}>
          {c.athlete_id && <Badge tone="good">athlete</Badge>}
          {duplicateIds.has(c.contact_id) && <Badge tone="warn">dup?</Badge>}
        </span>
      ),
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <NewContactForm data={data} onCreated={(id) => setSelected(id)} />

      {data.duplicates.length > 0 && (
        <Panel
          title="Possible duplicates"
          subtitle="Detected, never merged automatically. Two parents at one school legitimately share a phone."
        >
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
            {data.duplicates.map((d) => (
              <li key={`${d.reason}-${d.value}`} style={{ fontSize: 13 }}>
                <Badge tone="warn">{d.reason}</Badge>{" "}
                <span style={{ color: theme.muted }}>{d.value} — </span>
                {d.contactIds
                  .map((id) => idx.contactById.get(id)?.full_name ?? id.slice(0, 8))
                  .join(", ")}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Contacts"
        subtitle={`${results.length} of ${data.contacts.length}. Search matches name, phone, email, organization, athlete, product and stage.`}
        actions={
          <input
            style={{ ...inputStyle, width: 220 }}
            value={query}
            placeholder="Search…"
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search contacts"
          />
        }
      >
        <DataTable rows={results} columns={columns} rowKey={(c) => c.contact_id} empty="No contacts yet." />
      </Panel>

      {contact && <ContactDetail contact={contact} data={data} idx={idx} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Detail: deals, timeline, athlete link
// ---------------------------------------------------------------------

function ContactDetail({
  contact,
  data,
  idx,
  onClose,
}: {
  contact: Contact;
  data: CrmPayload;
  idx: ReturnType<typeof indexes>;
  onClose: () => void;
}) {
  const { act } = useCrm();
  const deals = data.opportunities.filter((o) => o.contact_id === contact.contact_id);
  const activities = data.activities
    .filter((a) => a.contact_id === contact.contact_id)
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const athlete = contact.athlete_id ? idx.athleteById.get(contact.athlete_id) : null;

  return (
    <Panel
      title={contact.full_name}
      subtitle={`${CONTACT_TYPES[contact.contact_type as ContactType] ?? contact.contact_type} · ${contact.phone ?? "no phone"} · ${contact.email ?? "no email"}`}
      actions={
        <button type="button" style={buttonStyle} onClick={onClose}>
          Close
        </button>
      }
    >
      <div style={{ display: "grid", gap: 16 }}>
        {/* ------------------------------------------------- athlete link */}
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.dim }}>
            Linked athlete
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select
              style={{ ...selectStyle, minWidth: 240 }}
              value={contact.athlete_id ?? ""}
              onChange={(e) =>
                void act({
                  action: "link-athlete",
                  contactId: contact.contact_id,
                  athleteId: e.target.value || null,
                })
              }
              aria-label="Link an existing athlete"
            >
              <option value="">Not linked</option>
              {data.athletes.map((a) => (
                <option key={a.athlete_id} value={a.athlete_id}>
                  {a.preferred_name ? `${a.legal_name} (${a.preferred_name})` : a.legal_name}
                  {a.date_of_birth ? ` · ${a.date_of_birth}` : ""}
                </option>
              ))}
            </select>
            {athlete && <Badge tone="good">{athlete.current_status ?? "linked"}</Badge>}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: theme.dim, lineHeight: 1.6 }}>
            Links to an athlete that already exists. New athletes are created only by the paid onboarding
            path — the CRM never opens a second door into the athlete table.
          </p>
        </div>

        {/* --------------------------------------------------------- deals */}
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.dim }}>
            Opportunities ({deals.length})
          </p>
          {deals.length === 0 ? (
            <Empty>No deals yet. Create one from the Pipeline tab.</Empty>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
              {deals.map((o) => (
                <li
                  key={o.opportunity_id}
                  style={{
                    display: "flex",
                    gap: 10,
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    fontSize: 13,
                    padding: "8px 10px",
                    background: theme.panelAlt,
                    border: `1px solid ${theme.border}`,
                    borderRadius: 8,
                  }}
                >
                  <span>
                    <strong>{labelOf.product(o.product)}</strong>
                    <span style={{ color: theme.muted }}> · {kes(o.value_kes)}</span>
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <Badge
                      tone={
                        o.stage === "won" ? "good" : o.stage === "lost" ? "bad" : o.stage === "payment_pending" ? "warn" : "neutral"
                      }
                    >
                      {STAGES[o.stage as Stage]?.label ?? o.stage}
                    </Badge>
                    {o.registration_id && <Badge tone="good">payment linked</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ------------------------------------------------------ timeline */}
        <div>
          <p style={{ margin: "0 0 6px", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: theme.dim }}>
            Timeline
          </p>
          <LogActivityForm contactId={contact.contact_id} deals={deals.map((d) => d.opportunity_id)} data={data} />
          {activities.length === 0 ? (
            <Empty>Nothing logged yet.</Empty>
          ) : (
            <ol style={{ margin: "10px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 0 }}>
              {activities.map((a) => (
                <li
                  key={a.activity_id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(120px, auto) 1fr",
                    gap: 12,
                    padding: "9px 0",
                    borderBottom: `1px solid ${theme.border}55`,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: theme.dim, fontSize: 12 }}>{whenLocal(a.occurred_at)}</span>
                  <span>
                    <Badge>{ACTIVITY_TYPES[a.activity_type as ActivityType] ?? a.activity_type}</Badge>{" "}
                    <strong>{a.subject}</strong>
                    {a.outcome && <span style={{ color: theme.good }}> — {a.outcome}</span>}
                    {a.notes && (
                      <div style={{ color: theme.muted, fontSize: 12.5, marginTop: 3, lineHeight: 1.6 }}>{a.notes}</div>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Panel>
  );
}

function LogActivityForm({
  contactId,
  deals,
  data,
}: {
  contactId: string;
  deals: string[];
  data: CrmPayload;
}) {
  const { act } = useCrm();
  const [type, setType] = useState<ActivityType>("whatsapp");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!subject.trim()) return setError("What happened?");
    setBusy(true);
    setError(null);
    const result = await act({
      action: "log-activity",
      contactId,
      opportunityId: opportunityId || undefined,
      activityType: type,
      subject: subject.trim(),
      outcome: outcome.trim() || undefined,
    });
    setBusy(false);
    if (!result.success) return setError(result.error ?? "Could not log that.");
    setSubject("");
    setOutcome("");
  }

  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", alignItems: "end" }}>
      <Field label="Type">
        <select style={inputStyle} value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
          {ACTIVITY_TYPE_IDS.map((t) => (
            <option key={t} value={t}>
              {ACTIVITY_TYPES[t]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="What happened">
        <input style={inputStyle} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Asked about payment plan" />
      </Field>
      <Field label="Outcome">
        <input style={inputStyle} value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="optional" />
      </Field>
      {deals.length > 0 && (
        <Field label="Deal">
          <select style={inputStyle} value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
            <option value="">Not deal-specific</option>
            {deals.map((id) => {
              const deal = data.opportunities.find((o) => o.opportunity_id === id);
              return (
                <option key={id} value={id}>
                  {deal ? labelOf.product(deal.product) : id.slice(0, 8)}
                </option>
              );
            })}
          </select>
        </Field>
      )}
      <button type="button" style={{ ...buttonStyle, minHeight: 40 }} disabled={busy} onClick={() => void submit()}>
        {busy ? "Logging…" : "Log"}
      </button>
      {error && <p style={{ margin: 0, gridColumn: "1 / -1", fontSize: 12, color: theme.bad }}>{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------
// New contact — with the duplicate warning loop (§17)
// ---------------------------------------------------------------------

function NewContactForm({ data, onCreated }: { data: CrmPayload; onCreated: (id: string) => void }) {
  const { act } = useCrm();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [contactType, setContactType] = useState<ContactType>("parent");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [source, setSource] = useState("instagram");
  const [organizationId, setOrganizationId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [duplicatePrompt, setDuplicatePrompt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(confirmDuplicate: boolean) {
    if (!fullName.trim()) return setError("A name is required.");
    setBusy(true);
    setError(null);
    const result = await act({
      action: "create-contact",
      fullName: fullName.trim(),
      contactType,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      source: source as never,
      organizationId: organizationId || undefined,
      confirmDuplicate,
    });
    setBusy(false);

    if (!result.success) {
      // The server warns rather than blocks: it returns 409 with the
      // matches, and re-sending with confirmDuplicate creates anyway.
      if (result.warning === "POSSIBLE_DUPLICATE") return setDuplicatePrompt(result.error ?? "Possible duplicate.");
      return setError(result.error ?? "Could not create that contact.");
    }

    setFullName("");
    setPhone("");
    setEmail("");
    setOrganizationId("");
    setDuplicatePrompt(null);
    setOpen(false);
    if (result.contactId) onCreated(result.contactId);
  }

  if (!open) {
    return (
      <div>
        <button type="button" style={{ ...buttonStyle, minHeight: 42 }} onClick={() => setOpen(true)}>
          + New contact
        </button>
      </div>
    );
  }

  return (
    <Panel
      title="New contact"
      subtitle="Phone numbers are normalised to 254… so the same parent typed two ways is one person."
      actions={
        <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
          Cancel
        </button>
      }
    >
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}>
        <Field label="Full name">
          <input style={inputStyle} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </Field>
        <Field label="Type">
          <select style={inputStyle} value={contactType} onChange={(e) => setContactType(e.target.value as ContactType)}>
            {CONTACT_TYPE_IDS.map((t) => (
              <option key={t} value={t}>
                {CONTACT_TYPES[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Phone" hint="07…, 01…, +254… all accepted">
          <input style={inputStyle} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
        </Field>
        <Field label="Email">
          <input style={inputStyle} value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
        </Field>
        <Field label="Source">
          <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
            {SOURCE_IDS.map((s) => (
              <option key={s} value={s}>
                {labelOf.source(s)}
              </option>
            ))}
          </select>
        </Field>
        {data.organizations.length > 0 && (
          <Field label="Organization">
            <select style={inputStyle} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
              <option value="">None</option>
              {data.organizations.map((o) => (
                <option key={o.org_id} value={o.org_id}>
                  {o.name}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      {duplicatePrompt && (
        <div
          style={{
            marginTop: 12,
            padding: "10px 12px",
            background: "#2a2013",
            border: `1px solid ${theme.warn}55`,
            borderRadius: 8,
            fontSize: 12.5,
            color: theme.warn,
          }}
        >
          {duplicatePrompt}
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button type="button" style={buttonStyle} onClick={() => void submit(true)}>
              Create anyway
            </button>
            <button type="button" style={buttonStyle} onClick={() => setDuplicatePrompt(null)}>
              Let me check
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: theme.bad }}>{error}</p>}

      <button
        type="button"
        disabled={busy}
        onClick={() => void submit(false)}
        style={{ ...buttonStyle, marginTop: 12, minHeight: 42, borderColor: theme.accent, color: theme.accent }}
      >
        {busy ? "Saving…" : "Create contact"}
      </button>
    </Panel>
  );
}
