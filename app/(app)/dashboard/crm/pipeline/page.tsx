"use client";

// =====================================================================
// TAB 2 — PIPELINE
//
// Eight columns, one card per deal, and a <select> to move a card.
//
// WHY NOT DRAG AND DROP: the founder opens this on a phone. Dragging a
// card across eight horizontally-scrolling columns on a touch screen is
// slower than picking from a list and fails silently when it misses.
// The select is two taps and works everywhere.
// =====================================================================

import { useMemo, useState } from "react";
import {
  CrmGate,
  Field,
  dueLabel,
  indexes,
  inputStyle,
  labelOf,
  shortKes,
  useCrm,
  type CrmPayload,
  type Opportunity,
} from "@/components/workspace/crm";
import {
  BOARD_STAGES,
  PRODUCT_IDS,
  SOURCE_IDS,
  STAGES,
  STAGE_PROBABILITY,
  TEMPERATURE_IDS,
  TEMPERATURES,
  listedPriceKes,
  type Product,
  type Stage,
} from "@/config/crm";
import { Badge, Empty, Panel, Stat, StatRow, buttonStyle, kes, selectStyle, theme } from "@/components/workspace/ui";

const BOARD_CSS = `
.crm-board { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; scroll-snap-type: x proximity; }
.crm-col { flex: 0 0 268px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 8px; }
@media (max-width: 900px) { .crm-col { flex-basis: 82vw; } }
`;

export default function CrmPipelineTab() {
  return <CrmGate>{(data) => <Pipeline data={data} />}</CrmGate>;
}

function Pipeline({ data }: { data: CrmPayload }) {
  const [product, setProduct] = useState("");
  const [source, setSource] = useState("");
  const [temperature, setTemperature] = useState("");
  const [overdueOnly, setOverdueOnly] = useState(false);

  const idx = indexes(data);
  const { pipeline } = data.metrics;

  const filtered = useMemo(() => {
    return data.opportunities.filter((o) => {
      if (product && o.product !== product) return false;
      if (source && o.source !== source) return false;
      if (temperature && o.temperature !== temperature) return false;
      if (overdueOnly) {
        const next = idx.nextTaskFor.get(o.opportunity_id);
        if (!next || dueLabel(next.due_date).tone !== "bad") return false;
      }
      return true;
    });
  }, [data.opportunities, product, source, temperature, overdueOnly, idx.nextTaskFor]);

  const byStage = useMemo(() => {
    const map = new Map<string, Opportunity[]>();
    for (const stage of BOARD_STAGES) map.set(stage, []);
    for (const o of filtered) map.get(o.stage)?.push(o);
    for (const list of map.values()) list.sort((a, b) => b.value_kes - a.value_kes);
    return map;
  }, [filtered]);

  const nurtured = filtered.filter((o) => o.stage === "nurture");

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <style>{BOARD_CSS}</style>

      <Panel title="Pipeline totals" subtitle="Open deals only — won is revenue, lost is history.">
        <StatRow>
          <Stat label="Open deals" value={pipeline.openCount} />
          <Stat label="Pipeline value" value={kes(pipeline.totalValueKes)} />
          <Stat label="Weighted" value={kes(pipeline.weightedValueKes)} tone="warn" hint="value × probability" />
          <Stat
            label="Avg deal"
            value={pipeline.openCount === 0 ? "—" : kes(pipeline.totalValueKes / pipeline.openCount)}
          />
        </StatRow>
      </Panel>

      <NewDealForm data={data} />

      {/* --------------------------------------------------------- filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select style={selectStyle} value={product} onChange={(e) => setProduct(e.target.value)} aria-label="Filter by product">
          <option value="">All products</option>
          {PRODUCT_IDS.map((p) => (
            <option key={p} value={p}>
              {labelOf.product(p)}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={source} onChange={(e) => setSource(e.target.value)} aria-label="Filter by source">
          <option value="">All sources</option>
          {SOURCE_IDS.map((s) => (
            <option key={s} value={s}>
              {labelOf.source(s)}
            </option>
          ))}
        </select>
        <select
          style={selectStyle}
          value={temperature}
          onChange={(e) => setTemperature(e.target.value)}
          aria-label="Filter by temperature"
        >
          <option value="">Any temperature</option>
          {TEMPERATURE_IDS.map((t) => (
            <option key={t} value={t}>
              {TEMPERATURES[t]}
            </option>
          ))}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: theme.muted }}>
          <input type="checkbox" checked={overdueOnly} onChange={(e) => setOverdueOnly(e.target.checked)} />
          Overdue only
        </label>
        <span style={{ fontSize: 12, color: theme.dim, marginLeft: "auto" }}>
          {filtered.length} of {data.opportunities.length} shown
        </span>
      </div>

      {/* ----------------------------------------------------------- board */}
      <div className="crm-board">
        {BOARD_STAGES.map((stage) => {
          const deals = byStage.get(stage) ?? [];
          const value = deals.reduce((sum, o) => sum + o.value_kes, 0);
          return (
            <div key={stage} className="crm-col">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "8px 10px",
                  background: theme.panelAlt,
                  border: `1px solid ${theme.border}`,
                  borderTop: `2px solid ${stageAccent(stage)}`,
                  borderRadius: 10,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>
                  {STAGES[stage].label}
                </span>
                <span style={{ fontSize: 11.5, color: theme.dim }}>
                  {deals.length} · {shortKes(value)}
                </span>
              </div>
              {deals.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    padding: "14px 10px",
                    border: `1px dashed ${theme.border}`,
                    borderRadius: 10,
                    color: theme.dim,
                    fontSize: 12,
                    textAlign: "center",
                  }}
                >
                  Empty
                </p>
              ) : (
                deals.map((o) => <DealCard key={o.opportunity_id} deal={o} data={data} idx={idx} />)
              )}
            </div>
          );
        })}
      </div>

      {nurtured.length > 0 && (
        <Panel title="Nurture" subtitle="Parked, not dead. Excluded from pipeline totals and from the board.">
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 8 }}>
            {nurtured.map((o) => (
              <li key={o.opportunity_id}>
                <DealCard deal={o} data={data} idx={idx} />
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

const stageAccent = (stage: Stage) =>
  stage === "won" ? theme.good : stage === "lost" ? theme.bad : stage === "payment_pending" ? theme.warn : theme.accent;

// ---------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------

function DealCard({
  deal,
  data,
  idx,
}: {
  deal: Opportunity;
  data: CrmPayload;
  idx: ReturnType<typeof indexes>;
}) {
  const { act } = useCrm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contact = idx.contactById.get(deal.contact_id);
  const org = deal.organization_id ? idx.orgById.get(deal.organization_id) : null;
  const athlete = deal.athlete_id ? idx.athleteById.get(deal.athlete_id) : null;
  const next = idx.nextTaskFor.get(deal.opportunity_id);
  const due = next ? dueLabel(next.due_date) : null;
  const registration = deal.registration_id ? idx.registrationById.get(deal.registration_id) : null;
  const discount = deal.list_price_kes !== null && deal.list_price_kes > deal.value_kes;

  async function move(stage: string) {
    setError(null);
    // A lost deal needs a reason before the database will accept it, so
    // ask here rather than letting a CHECK bounce the founder.
    let lostReason: string | undefined;
    if (stage === "lost") {
      const answer = window.prompt("Why was this lost? (price, timing, competitor, went quiet…)");
      if (!answer || !answer.trim()) return;
      lostReason = answer.trim();
    }
    setBusy(true);
    const result = await act({
      action: "update-opportunity",
      opportunityId: deal.opportunity_id,
      patch: lostReason ? { stage, lostReason } : { stage },
    });
    setBusy(false);
    if (!result.success) setError(result.error ?? "Could not move this deal.");
  }

  return (
    <article
      style={{
        background: theme.panel,
        border: `1px solid ${due?.tone === "bad" ? `${theme.bad}77` : theme.border}`,
        borderLeft: `3px solid ${deal.temperature === "hot" ? theme.bad : deal.temperature === "warm" ? theme.warn : theme.border}`,
        borderRadius: 10,
        padding: "10px 12px",
        display: "grid",
        gap: 6,
        opacity: busy ? 0.55 : 1,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
        <strong style={{ fontSize: 13.5 }}>{contact?.full_name ?? "Unknown contact"}</strong>
        <span style={{ fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>{shortKes(deal.value_kes)}</span>
      </div>

      <div style={{ fontSize: 12, color: theme.muted, lineHeight: 1.5 }}>
        {labelOf.product(deal.product)}
        {org && <> · {org.name}</>}
        {athlete && <> · {athlete.preferred_name ?? athlete.legal_name}</>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11.5, color: theme.dim }}>
        <span>{deal.probability_pct}%</span>
        <span>·</span>
        <span>{shortKes(deal.expected_value_kes)} weighted</span>
        {deal.expected_close_date && (
          <>
            <span>·</span>
            <span>closes {deal.expected_close_date}</span>
          </>
        )}
        {discount && (
          <Badge tone="warn">−{shortKes((deal.list_price_kes ?? 0) - deal.value_kes)} off list</Badge>
        )}
      </div>

      {next ? (
        <div style={{ fontSize: 12, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <Badge tone={due!.tone === "bad" ? "bad" : due!.tone === "warn" ? "warn" : "neutral"}>{due!.text}</Badge>
          <span style={{ color: theme.muted }}>{next.title}</span>
        </div>
      ) : (
        STAGES[deal.stage as Stage]?.state === "open" && (
          <Badge tone="warn">no next action</Badge>
        )
      )}

      {registration && (
        <div style={{ fontSize: 11.5, color: registration.payment_status === "PAYMENT_SETTLED" ? theme.good : theme.dim }}>
          {registration.payment_status === "PAYMENT_SETTLED"
            ? `settled ${registration.settled_receipt ?? ""}`
            : `registration ${registration.payment_status.toLowerCase().replace("_", " ")}`}
        </div>
      )}

      {deal.stage === "lost" && deal.lost_reason && (
        <div style={{ fontSize: 11.5, color: theme.bad }}>lost: {deal.lost_reason}</div>
      )}

      <select
        style={{ ...selectStyle, width: "100%", minHeight: 38 }}
        value={deal.stage}
        disabled={busy}
        onChange={(e) => void move(e.target.value)}
        aria-label={`Move ${contact?.full_name ?? "deal"} to another stage`}
      >
        {Object.entries(STAGES).map(([id, s]) => (
          <option key={id} value={id}>
            {s.label}
          </option>
        ))}
      </select>

      {error && <p style={{ margin: 0, fontSize: 11.5, color: theme.bad }}>{error}</p>}
    </article>
  );
}

// ---------------------------------------------------------------------
// New deal
// ---------------------------------------------------------------------

function NewDealForm({ data }: { data: CrmPayload }) {
  const { act } = useCrm();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState("");
  const [product, setProduct] = useState<Product>("nrhl_standard");
  const [source, setSource] = useState("website");
  const [value, setValue] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Suggested price: the code tier table where it sets one, otherwise the
  // live Big Ice academy list. Never a third hardcoded copy.
  const suggested = listedPriceKes(product);
  const academyHint =
    product.startsWith("bigice") && data.academyTiers.length > 0
      ? data.academyTiers.map((t) => `${t.tier_name} ${kes(t.price_amount)}`).join(" · ")
      : null;

  async function submit() {
    setError(null);
    const numeric = Number(value);
    if (!contactId) return setError("Pick a contact first.");
    if (!Number.isFinite(numeric) || numeric < 0) return setError("Enter a deal value in KES.");

    setBusy(true);
    const result = await act({
      action: "create-opportunity",
      contactId,
      product,
      source: source as never,
      valueKes: numeric,
      probabilityPct: STAGE_PROBABILITY.new,
      temperature: "warm",
      expectedCloseDate: closeDate || undefined,
    });
    setBusy(false);
    if (!result.success) return setError(result.error ?? "Could not create the deal.");
    setContactId("");
    setValue("");
    setCloseDate("");
    setOpen(false);
  }

  if (!open) {
    return (
      <div>
        <button type="button" style={{ ...buttonStyle, minHeight: 42 }} onClick={() => setOpen(true)}>
          + New deal
        </button>
      </div>
    );
  }

  if (data.contacts.length === 0) {
    return (
      <Panel title="New deal">
        <Empty>Add a contact first — a deal always belongs to someone.</Empty>
      </Panel>
    );
  }

  return (
    <Panel
      title="New deal"
      subtitle="Creating a deal schedules its first follow-up automatically."
      actions={
        <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
          Cancel
        </button>
      }
    >
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <Field label="Contact">
          <select style={inputStyle} value={contactId} onChange={(e) => setContactId(e.target.value)}>
            <option value="">Choose…</option>
            {data.contacts.map((c) => (
              <option key={c.contact_id} value={c.contact_id}>
                {c.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Product" hint={suggested ? `list ${kes(suggested)}` : (academyHint ?? undefined)}>
          <select style={inputStyle} value={product} onChange={(e) => setProduct(e.target.value as Product)}>
            {PRODUCT_IDS.map((p) => (
              <option key={p} value={p}>
                {labelOf.product(p)}
              </option>
            ))}
          </select>
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
        <Field label="Value (KES)" hint={suggested ? "defaults to list if left blank" : undefined}>
          <input
            style={inputStyle}
            inputMode="numeric"
            value={value}
            placeholder={suggested ? String(suggested) : "0"}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => !value && suggested && setValue(String(suggested))}
          />
        </Field>
        <Field label="Expected close">
          <input style={inputStyle} type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
        </Field>
      </div>
      {error && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: theme.bad }}>{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        style={{ ...buttonStyle, marginTop: 12, minHeight: 42, borderColor: theme.accent, color: theme.accent }}
      >
        {busy ? "Creating…" : "Create deal"}
      </button>
    </Panel>
  );
}
