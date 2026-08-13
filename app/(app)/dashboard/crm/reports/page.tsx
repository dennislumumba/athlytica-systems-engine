"use client";

// =====================================================================
// TAB 5 — REPORTS
//
// Every table here separates three numbers that are routinely confused:
//
//   PIPELINE  what might close      (open deals, weighted)
//   WON       what you believe closed
//   COLLECTED what actually arrived (settled, production receipts only)
//
// The gap between the last two is the report worth reading.
// =====================================================================

import { useMemo } from "react";
import {
  CrmGate,
  indexes,
  labelOf,
  type CrmPayload,
} from "@/components/workspace/crm";
import { STAGES, type Stage } from "@/config/crm";
import { Badge, Column, DataTable, Empty, Panel, Stat, StatRow, kes, theme } from "@/components/workspace/ui";

export default function CrmReportsTab() {
  return <CrmGate>{(data) => <Reports data={data} />}</CrmGate>;
}

function Reports({ data }: { data: CrmPayload }) {
  const { revenue, pipeline, conversion } = data.metrics;
  const idx = indexes(data);

  // Lost reasons — free text, grouped case-insensitively. The point is
  // spotting "too expensive" five times, not a taxonomy.
  const lostReasons = useMemo(() => {
    const map = new Map<string, { reason: string; count: number; valueKes: number }>();
    for (const o of data.opportunities) {
      if (o.stage !== "lost" || !o.lost_reason) continue;
      const key = o.lost_reason.trim().toLowerCase();
      const row = map.get(key) ?? { reason: o.lost_reason.trim(), count: 0, valueKes: 0 };
      row.count += 1;
      row.valueKes += o.value_kes;
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [data.opportunities]);

  // Revenue by organization — institutional deals only have one.
  const byOrg = useMemo(() => {
    const map = new Map<string, { name: string; wonKes: number; collectedKes: number; deals: number }>();
    const collectedIds = new Set(
      data.registrations.filter((r) => r.payment_status === "PAYMENT_SETTLED").map((r) => r.id),
    );
    for (const o of data.opportunities) {
      if (!o.organization_id) continue;
      const name = idx.orgById.get(o.organization_id)?.name ?? "Unknown organization";
      const row = map.get(o.organization_id) ?? { name, wonKes: 0, collectedKes: 0, deals: 0 };
      if (o.stage === "won") {
        row.wonKes += o.value_kes;
        row.deals += 1;
      }
      if (o.registration_id && collectedIds.has(o.registration_id)) {
        const reg = idx.registrationById.get(o.registration_id);
        row.collectedKes += reg?.amount_expected_kes ?? 0;
      }
      map.set(o.organization_id, row);
    }
    return [...map.values()].filter((r) => r.deals > 0 || r.collectedKes > 0);
  }, [data.opportunities, data.registrations, idx]);

  // Outstanding: won, but the money has not landed.
  const outstanding = useMemo(
    () =>
      data.opportunities
        .filter((o) => {
          if (o.stage !== "won") return false;
          if (!o.registration_id) return true;
          const reg = idx.registrationById.get(o.registration_id);
          return reg?.payment_status !== "PAYMENT_SETTLED";
        })
        .sort((a, b) => b.value_kes - a.value_kes),
    [data.opportunities, idx],
  );

  const splitColumns = (unit: string): Column<{ label: string; wonKes: number; collectedKes: number; deals: number }>[] => [
    { key: "label", header: unit, render: (r) => r.label },
    { key: "deals", header: "Deals won", align: "right", render: (r) => r.deals },
    { key: "won", header: "Won", align: "right", render: (r) => kes(r.wonKes) },
    {
      key: "collected",
      header: "Collected",
      align: "right",
      render: (r) => (
        <span style={{ color: r.collectedKes > 0 ? theme.good : theme.dim }}>{kes(r.collectedKes)}</span>
      ),
    },
    {
      key: "gap",
      header: "Uncollected",
      align: "right",
      render: (r) => {
        const gap = r.wonKes - r.collectedKes;
        return <span style={{ color: gap > 0 ? theme.warn : theme.dim }}>{gap > 0 ? kes(gap) : "—"}</span>;
      },
    },
  ];

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Panel
        title="The three numbers"
        subtitle="Pipeline is a forecast. Won is a judgement. Collected is a bank statement. Only the last one is money."
      >
        <StatRow>
          <Stat label="Weighted pipeline" value={kes(pipeline.weightedValueKes)} tone="warn" />
          <Stat label="Pipeline value" value={kes(pipeline.totalValueKes)} />
          <Stat label="Won" value={kes(revenue.wonKes)} tone="good" />
          <Stat
            label="Collected"
            value={kes(revenue.collectedKes)}
            tone={revenue.collectedKes > 0 ? "good" : "neutral"}
            hint={data.productionReceiptCount === 0 ? "no production settlement exists yet" : undefined}
          />
          <Stat
            label="Won, uncollected"
            value={kes(revenue.outstandingKes)}
            tone={revenue.outstandingKes > 0 ? "warn" : "neutral"}
          />
        </StatRow>
      </Panel>

      <Panel title="By product" subtitle="Which offer actually sells.">
        <DataTable
          rows={revenue.byProduct.map((r) => ({ ...r, label: r.label }))}
          rowKey={(r) => r.key}
          empty="No won or collected revenue yet."
          columns={splitColumns("Product")}
        />
      </Panel>

      <Panel title="By acquisition channel" subtitle="Which channel produces cash, not which produces leads.">
        <DataTable
          rows={revenue.bySource.map((r) => ({ ...r, label: r.label }))}
          rowKey={(r) => r.key}
          empty="No won or collected revenue yet."
          columns={splitColumns("Source")}
        />
      </Panel>

      <Panel
        title="By month"
        subtitle="Won lands in the month it closed; cash in the month it arrived. They are often different months."
      >
        <DataTable
          rows={revenue.byMonth}
          rowKey={(r) => r.month}
          empty="Nothing closed or collected yet."
          columns={[
            { key: "month", header: "Month", render: (r) => r.month },
            { key: "won", header: "Won", align: "right", render: (r) => kes(r.wonKes) },
            {
              key: "collected",
              header: "Collected",
              align: "right",
              render: (r) => (
                <span style={{ color: r.collectedKes > 0 ? theme.good : theme.dim }}>{kes(r.collectedKes)}</span>
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Pipeline by stage">
        <DataTable
          rows={pipeline.byStage}
          rowKey={(r) => r.stage}
          empty="No deals yet."
          columns={[
            {
              key: "stage",
              header: "Stage",
              render: (r) => (
                <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {r.label}
                  {STAGES[r.stage as Stage]?.state !== "open" && <Badge>{STAGES[r.stage as Stage]?.state}</Badge>}
                </span>
              ),
            },
            { key: "count", header: "Deals", align: "right", render: (r) => r.count },
            { key: "value", header: "Value", align: "right", render: (r) => kes(r.valueKes) },
            { key: "weighted", header: "Weighted", align: "right", render: (r) => kes(r.weightedKes) },
          ]}
        />
      </Panel>

      <Panel title="Conversion by stage" subtitle="Read from the stage history in crm_opportunity_event.">
        <DataTable
          rows={conversion.steps}
          rowKey={(r) => `${r.from}-${r.to}`}
          empty="Not enough history yet."
          columns={[
            { key: "step", header: "Step", render: (r) => `${r.from} → ${r.to}` },
            {
              key: "rate",
              header: "Rate",
              align: "right",
              render: (r) => (r.ratePct === null ? "—" : `${r.ratePct}%`),
            },
            { key: "n", header: "Of", align: "right", render: (r) => `${r.numerator} / ${r.denominator}` },
          ]}
        />
      </Panel>

      <Panel title="Why deals were lost">
        <DataTable
          rows={lostReasons}
          rowKey={(r) => r.reason}
          empty="Nothing lost yet."
          columns={[
            { key: "reason", header: "Reason", render: (r) => r.reason },
            { key: "count", header: "Deals", align: "right", render: (r) => r.count },
            { key: "value", header: "Value lost", align: "right", render: (r) => kes(r.valueKes) },
          ]}
        />
      </Panel>

      <Panel title="Revenue by organization" subtitle="Schools, academies, clubs and corporates.">
        <DataTable
          rows={byOrg}
          rowKey={(r) => r.name}
          empty="No organization-linked deals yet."
          columns={[
            { key: "name", header: "Organization", render: (r) => r.name },
            { key: "deals", header: "Deals won", align: "right", render: (r) => r.deals },
            { key: "won", header: "Won", align: "right", render: (r) => kes(r.wonKes) },
            { key: "collected", header: "Collected", align: "right", render: (r) => kes(r.collectedKes) },
          ]}
        />
      </Panel>

      <Panel
        title="Outstanding balances"
        subtitle="Marked won, but no settled registration is linked. Either the money is late or the win was optimistic."
      >
        {outstanding.length === 0 ? (
          <Empty>Nothing outstanding.</Empty>
        ) : (
          <DataTable
            rows={outstanding}
            rowKey={(o) => o.opportunity_id}
            empty="Nothing outstanding."
            columns={[
              {
                key: "contact",
                header: "Contact",
                render: (o) => idx.contactById.get(o.contact_id)?.full_name ?? "Unknown",
              },
              { key: "product", header: "Product", render: (o) => labelOf.product(o.product) },
              { key: "value", header: "Value", align: "right", render: (o) => kes(o.value_kes) },
              {
                key: "state",
                header: "Payment",
                render: (o) =>
                  o.registration_id ? (
                    <Badge tone="warn">
                      {idx.registrationById.get(o.registration_id)?.payment_status.toLowerCase().replace("_", " ") ??
                        "linked"}
                    </Badge>
                  ) : (
                    <Badge tone="bad">no registration linked</Badge>
                  ),
              },
              { key: "closed", header: "Won on", render: (o) => o.converted_at?.slice(0, 10) ?? "—" },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}
