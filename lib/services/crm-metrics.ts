// =====================================================================
// CRM METRICS — every number the pipeline, dashboard and reports show.
//
// Pure functions over plain rows: no supabase import, no next/server, so
// the money arithmetic is unit-testable without a database. Same shape
// as lib/services/command-metrics.ts.
//
// THE ONE LAW OF THIS FILE: booked ≠ collected.
//
//   wonKes       what the founder believes closed  (crm_opportunity.stage)
//   collectedKes what actually arrived             (registrations settled
//                by a receipt that is NOT classified TEST/AUDIT/DEMO)
//
// A won opportunity with no settled registration is a forecast. Reporting
// them as one number is how a business believes it has money it does not
// have — and this database already contains KES 658,000 of synthetic
// settlements that would say exactly that.
// =====================================================================

// Relative, with the extension: this module is loaded directly by
// node --test, which has no "@/" bundler alias. Same rule as
// lib/services/command-metrics.ts.
import {
  PRODUCTS,
  SOURCES,
  STAGES,
  STALE_AFTER_DAYS,
  type Product,
  type Source,
  type Stage,
} from "../../config/crm.ts";

// ---------------------------------------------------------------------
// Row shapes — the subset of each table the maths needs.
// ---------------------------------------------------------------------

// These are the full row shapes, not a subset the maths happens to need.
// The client re-exports them as its payload types (components/workspace
// /crm.tsx), so there is one definition of a CRM row in the codebase and
// no chance of the two drifting a column apart.

export interface OpportunityRow {
  opportunity_id: string;
  contact_id: string;
  organization_id: string | null;
  athlete_id: string | null;
  product: string;
  source: string;
  stage: string;
  temperature: string;
  value_kes: number;
  list_price_kes: number | null;
  probability_pct: number;
  expected_value_kes: number;
  expected_close_date: string | null;
  assigned_to: string | null;
  registration_id: string | null;
  lost_reason: string | null;
  converted_at: string | null;
  updated_at: string;
  created_at: string;
}

export interface TaskRow {
  task_id: string;
  contact_id: string;
  opportunity_id: string | null;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface ActivityRow {
  activity_id: string;
  contact_id: string;
  opportunity_id: string | null;
  activity_type: string;
  subject: string;
  notes: string | null;
  outcome: string | null;
  occurred_at: string;
  created_by: string | null;
  created_at: string;
}

/** The registration rows linked from opportunities — the money record. */
export interface LinkedRegistrationRow {
  id: string;
  payment_status: string;
  amount_expected_kes: number | null;
  settled_receipt: string | null;
  settled_at: string | null;
  venture_context: string | null;
}

export interface StageEventRow {
  opportunity_id: string;
  field: string;
  new_value: string | null;
  changed_at: string;
}

export interface CrmInput {
  opportunities: OpportunityRow[];
  tasks: TaskRow[];
  activities: ActivityRow[];
  registrations: LinkedRegistrationRow[];
  stageEvents: StageEventRow[];
  /**
   * M-Pesa receipts that survived the record_classification filter, read
   * from the payment_events_production view. A registration settled by a
   * receipt outside this set is a test settlement and is not cash.
   */
  productionReceipts: Set<string>;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0) || 0);
const DAY_MS = 86_400_000;

/** Local calendar day in Nairobi (UTC+3) — the founder's "today". */
export function nairobiDay(ms: number): string {
  return new Date(ms + 3 * 3_600_000).toISOString().slice(0, 10);
}

const isOpen = (stage: string) => stage in STAGES && STAGES[stage as Stage].state === "open";
const isWon = (stage: string) => stage === "won";

/** Funnel ordinals. 'lost' and 'nurture' are not progression states. */
const FUNNEL_ORDER: Partial<Record<string, number>> = {
  new: 1,
  contacted: 2,
  qualified: 3,
  meeting: 4,
  proposal: 5,
  payment_pending: 6,
  won: 7,
};

// ---------------------------------------------------------------------
// Cash — the only place "collected" is defined.
// ---------------------------------------------------------------------

/**
 * Registration ids whose money genuinely arrived: settled AND settled by
 * a production-classified receipt. A settled registration carrying a
 * TEST receipt is excluded, which is why this takes the receipt set
 * rather than trusting payment_status alone.
 */
export function collectedRegistrations(
  registrations: LinkedRegistrationRow[],
  productionReceipts: Set<string>,
): Map<string, LinkedRegistrationRow> {
  const out = new Map<string, LinkedRegistrationRow>();
  for (const r of registrations) {
    if (r.payment_status !== "PAYMENT_SETTLED") continue;
    if (!r.settled_receipt || !productionReceipts.has(r.settled_receipt)) continue;
    out.set(r.id, r);
  }
  return out;
}

// ---------------------------------------------------------------------
// Today — the founder's first screen (§9)
// ---------------------------------------------------------------------

export interface TodayBlock {
  overdue: TaskRow[];
  dueToday: TaskRow[];
  hotLeads: OpportunityRow[];
  paymentPending: OpportunityRow[];
  meetingsToday: ActivityRow[];
}

export function todayFrom(input: CrmInput, nowMs: number): TodayBlock {
  const today = nairobiDay(nowMs);
  const pending = input.tasks.filter((t) => t.status === "pending");
  const byUrgency = (a: TaskRow, b: TaskRow) => a.due_date.localeCompare(b.due_date);

  return {
    overdue: pending.filter((t) => t.due_date < today).sort(byUrgency),
    dueToday: pending.filter((t) => t.due_date === today).sort(byUrgency),
    hotLeads: input.opportunities
      .filter((o) => o.temperature === "hot" && isOpen(o.stage))
      .sort((a, b) => num(b.value_kes) - num(a.value_kes)),
    paymentPending: input.opportunities
      .filter((o) => o.stage === "payment_pending")
      .sort((a, b) => num(b.value_kes) - num(a.value_kes)),
    meetingsToday: input.activities.filter(
      (a) => a.activity_type === "meeting" && nairobiDay(Date.parse(a.occurred_at)) === today,
    ),
  };
}

// ---------------------------------------------------------------------
// Pipeline (§8)
// ---------------------------------------------------------------------

export interface StageBucket {
  stage: Stage;
  label: string;
  count: number;
  valueKes: number;
  weightedKes: number;
}

export interface PipelineBlock {
  openCount: number;
  totalValueKes: number;
  weightedValueKes: number;
  byStage: StageBucket[];
}

export function pipelineFrom(opportunities: OpportunityRow[]): PipelineBlock {
  const buckets = new Map<string, StageBucket>();
  let totalValueKes = 0;
  let weightedValueKes = 0;
  let openCount = 0;

  for (const o of opportunities) {
    const stage = o.stage as Stage;
    const bucket = buckets.get(stage) ?? {
      stage,
      label: STAGES[stage]?.label ?? stage,
      count: 0,
      valueKes: 0,
      weightedKes: 0,
    };
    bucket.count += 1;
    bucket.valueKes += num(o.value_kes);
    bucket.weightedKes += num(o.expected_value_kes);
    buckets.set(stage, bucket);

    // Pipeline means live deals only. Won is revenue, lost is history,
    // nurture is parked — none of the three is money in play.
    if (isOpen(o.stage)) {
      openCount += 1;
      totalValueKes += num(o.value_kes);
      weightedValueKes += num(o.expected_value_kes);
    }
  }

  return {
    openCount,
    totalValueKes,
    weightedValueKes,
    byStage: [...buckets.values()].sort(
      (a, b) => (STAGES[a.stage]?.order ?? 99) - (STAGES[b.stage]?.order ?? 99),
    ),
  };
}

// ---------------------------------------------------------------------
// Revenue (§9, §21)
// ---------------------------------------------------------------------

export interface SplitRow {
  key: string;
  label: string;
  wonKes: number;
  collectedKes: number;
  deals: number;
}

export interface RevenueBlock {
  wonKes: number;
  collectedKes: number;
  outstandingKes: number;
  byProduct: SplitRow[];
  bySource: SplitRow[];
  byMonth: Array<{ month: string; wonKes: number; collectedKes: number }>;
  /** Deals whose money landed but which are still not marked won. */
  settledNotWon: OpportunityRow[];
}

export function revenueFrom(input: CrmInput): RevenueBlock {
  const collected = collectedRegistrations(input.registrations, input.productionReceipts);

  const products = new Map<string, SplitRow>();
  const sources = new Map<string, SplitRow>();
  const months = new Map<string, { month: string; wonKes: number; collectedKes: number }>();

  let wonKes = 0;
  let collectedKes = 0;
  const settledNotWon: OpportunityRow[] = [];

  const bump = (
    map: Map<string, SplitRow>,
    key: string,
    label: string,
    won: number,
    cash: number,
    deal: number,
  ) => {
    const row = map.get(key) ?? { key, label, wonKes: 0, collectedKes: 0, deals: 0 };
    row.wonKes += won;
    row.collectedKes += cash;
    row.deals += deal;
    map.set(key, row);
  };

  for (const o of input.opportunities) {
    const reg = o.registration_id ? collected.get(o.registration_id) : undefined;
    const cash = reg ? num(reg.amount_expected_kes) : 0;
    const won = isWon(o.stage) ? num(o.value_kes) : 0;

    if (cash > 0 && !isWon(o.stage)) settledNotWon.push(o);
    if (won === 0 && cash === 0) continue;

    wonKes += won;
    collectedKes += cash;

    bump(
      products,
      o.product,
      PRODUCTS[o.product as Product]?.label ?? o.product,
      won,
      cash,
      isWon(o.stage) ? 1 : 0,
    );
    bump(
      sources,
      o.source,
      SOURCES[o.source as Source] ?? o.source,
      won,
      cash,
      isWon(o.stage) ? 1 : 0,
    );

    // Won lands in the month it converted; cash in the month it arrived.
    // They are frequently different months, and that gap is the story.
    const wonMonth = o.converted_at ? o.converted_at.slice(0, 7) : null;
    const cashMonth = reg?.settled_at ? reg.settled_at.slice(0, 7) : null;
    for (const [month, w, c] of [
      [wonMonth, won, 0],
      [cashMonth, 0, cash],
    ] as Array<[string | null, number, number]>) {
      if (!month || (w === 0 && c === 0)) continue;
      const row = months.get(month) ?? { month, wonKes: 0, collectedKes: 0 };
      row.wonKes += w;
      row.collectedKes += c;
      months.set(month, row);
    }
  }

  const bySplit = (m: Map<string, SplitRow>) =>
    [...m.values()].sort((a, b) => b.wonKes + b.collectedKes - (a.wonKes + a.collectedKes));

  return {
    wonKes,
    collectedKes,
    outstandingKes: Math.max(0, wonKes - collectedKes),
    byProduct: bySplit(products),
    bySource: bySplit(sources),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
    settledNotWon,
  };
}

// ---------------------------------------------------------------------
// Conversion (§9) — measured from the audit trail, not from the current
// stage. A deal now sitting in 'lost' still passed through 'qualified',
// and a funnel that forgets that flatters itself.
// ---------------------------------------------------------------------

export interface ConversionBlock {
  reached: Record<string, number>;
  steps: Array<{ from: string; to: string; ratePct: number | null; numerator: number; denominator: number }>;
}

export function conversionFrom(input: CrmInput): ConversionBlock {
  const reachedRank = new Map<string, number>();

  const note = (id: string, stage: string | null) => {
    const rank = stage ? FUNNEL_ORDER[stage] : undefined;
    if (rank === undefined) return;
    reachedRank.set(id, Math.max(reachedRank.get(id) ?? 0, rank));
  };

  for (const o of input.opportunities) note(o.opportunity_id, o.stage);
  for (const e of input.stageEvents) {
    if (e.field === "stage") note(e.opportunity_id, e.new_value);
  }

  const atLeast = (rank: number) =>
    [...reachedRank.values()].filter((r) => r >= rank).length;

  const total = input.opportunities.length;
  const reached = {
    lead: total,
    qualified: atLeast(3),
    meeting: atLeast(4),
    proposal: atLeast(5),
    won: atLeast(7),
  };

  const step = (from: string, to: string, numerator: number, denominator: number) => ({
    from,
    to,
    numerator,
    denominator,
    ratePct: denominator === 0 ? null : Math.round((numerator / denominator) * 1000) / 10,
  });

  return {
    reached,
    steps: [
      step("Leads", "Qualified", reached.qualified, reached.lead),
      step("Qualified", "Meeting", reached.meeting, reached.qualified),
      step("Meeting", "Proposal", reached.proposal, reached.meeting),
      step("Proposal", "Won", reached.won, reached.proposal),
    ],
  };
}

// ---------------------------------------------------------------------
// Founder KPI — this week's actual selling activity (§9)
// ---------------------------------------------------------------------

export interface KpiBlock {
  newLeads: number;
  followUpsCompleted: number;
  salesCalls: number;
  proposalsSent: number;
  dealsWon: number;
  cashCollectedKes: number;
  /** Cash per logged selling action. Null until there is any action. */
  kesPerActivity: number | null;
}

export function kpiFrom(input: CrmInput, nowMs: number): KpiBlock {
  const since = nowMs - 7 * DAY_MS;
  const after = (iso: string | null) => Boolean(iso && Date.parse(iso) >= since);

  const activities = input.activities.filter((a) => after(a.occurred_at));
  const collected = collectedRegistrations(input.registrations, input.productionReceipts);

  let cashCollectedKes = 0;
  for (const reg of collected.values()) {
    if (after(reg.settled_at)) cashCollectedKes += num(reg.amount_expected_kes);
  }

  const salesCalls = activities.filter((a) => a.activity_type === "call").length;
  const followUpsCompleted = input.tasks.filter(
    (t) => t.status === "completed" && after(t.completed_at),
  ).length;

  return {
    newLeads: input.opportunities.filter((o) => after(o.created_at)).length,
    followUpsCompleted,
    salesCalls,
    proposalsSent: activities.filter((a) => a.activity_type === "proposal").length,
    dealsWon: input.opportunities.filter((o) => isWon(o.stage) && after(o.converted_at)).length,
    cashCollectedKes,
    kesPerActivity: activities.length === 0 ? null : Math.round(cashCollectedKes / activities.length),
  };
}

// ---------------------------------------------------------------------
// Data-quality and attention alerts (§17, §24.8-9). Warn, never block.
// ---------------------------------------------------------------------

export interface AlertsBlock {
  stale: OpportunityRow[];
  withoutNextAction: OpportunityRow[];
  neverContacted: OpportunityRow[];
}

export function alertsFrom(input: CrmInput, nowMs: number): AlertsBlock {
  const openTaskOwners = new Set(
    input.tasks.filter((t) => t.status === "pending" && t.opportunity_id).map((t) => t.opportunity_id!),
  );
  const touched = new Set(input.activities.map((a) => a.opportunity_id).filter(Boolean) as string[]);
  const open = input.opportunities.filter((o) => isOpen(o.stage));

  return {
    stale: open
      .filter((o) => nowMs - Date.parse(o.updated_at) > STALE_AFTER_DAYS * DAY_MS)
      .sort((a, b) => Date.parse(a.updated_at) - Date.parse(b.updated_at)),
    withoutNextAction: open.filter((o) => !openTaskOwners.has(o.opportunity_id)),
    neverContacted: open.filter((o) => !touched.has(o.opportunity_id)),
  };
}

/**
 * Potential duplicate contacts — same normalised phone, same email, or
 * the same name. Detection only: the brief says warn, and two campuses
 * of one school are legitimately two rows.
 */
export function duplicateContacts(
  contacts: Array<{ contact_id: string; full_name: string; phone: string | null; email: string | null }>,
): Array<{ reason: "phone" | "email" | "name"; value: string; contactIds: string[] }> {
  const groups: Array<{ reason: "phone" | "email" | "name"; map: Map<string, string[]> }> = [
    { reason: "phone", map: new Map() },
    { reason: "email", map: new Map() },
    { reason: "name", map: new Map() },
  ];

  for (const c of contacts) {
    const keys: Array<[number, string | null]> = [
      [0, c.phone],
      [1, c.email?.toLowerCase() ?? null],
      [2, c.full_name.trim().toLowerCase().replace(/\s+/g, " ")],
    ];
    for (const [i, key] of keys) {
      if (!key) continue;
      const group = groups[i]!;
      group.map.set(key, [...(group.map.get(key) ?? []), c.contact_id]);
    }
  }

  return groups.flatMap(({ reason, map }) =>
    [...map.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([value, contactIds]) => ({ reason, value, contactIds })),
  );
}

// ---------------------------------------------------------------------
// One call for the whole dashboard.
// ---------------------------------------------------------------------

export interface CrmMetrics {
  today: TodayBlock;
  pipeline: PipelineBlock;
  revenue: RevenueBlock;
  conversion: ConversionBlock;
  kpi: KpiBlock;
  alerts: AlertsBlock;
}

export function buildCrmMetrics(input: CrmInput, now: Date): CrmMetrics {
  const nowMs = now.getTime();
  return {
    today: todayFrom(input, nowMs),
    pipeline: pipelineFrom(input.opportunities),
    revenue: revenueFrom(input),
    conversion: conversionFrom(input),
    kpi: kpiFrom(input, nowMs),
    alerts: alertsFrom(input, nowMs),
  };
}
