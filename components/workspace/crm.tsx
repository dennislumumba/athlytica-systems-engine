"use client";

// =====================================================================
// CRM CLIENT — one fetch, five tabs.
//
// The provider lives in the CRM layout, which Next keeps mounted across
// the nested tab routes, so switching tabs re-renders from state instead
// of re-fetching. Every mutation goes through act(), which refetches on
// success — no optimistic local state to drift out of sync with the
// pipeline totals the server computes.
//
// Auth: the access token comes from the Supabase browser session
// directly, exactly as the NRHL league module does, so the CRM works on
// its own routes without widening the workspace context's surface.
//
// Form primitives (Field, inputStyle) are imported from nrhl-league
// rather than redefined — there is one set of inputs in this app.
// =====================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabaseClient } from "@/utils/supabaseClient";
import type { CrmAction } from "@/lib/validation/crm-schemas";
import type {
  ActivityRow,
  CrmMetrics,
  LinkedRegistrationRow,
  OpportunityRow,
  TaskRow,
} from "@/lib/services/crm-metrics";
import { PRODUCTS, SOURCES, STAGES, type Product, type Source, type Stage } from "@/config/crm";
import { theme } from "./ui";

export { Field, inputStyle } from "./nrhl-league";

// ---------------------------------------------------------------------
// Payload — mirror of the GET response in app/api/v1/crm
// ---------------------------------------------------------------------

export interface Contact {
  contact_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  contact_type: string;
  organization_id: string | null;
  athlete_id: string | null;
  user_id: string | null;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  org_id: string;
  name: string;
  org_type: string;
  phone: string | null;
  email: string | null;
  location: string | null;
  tenant_id: string | null;
  club_id: string | null;
  notes: string | null;
  created_at: string;
}

// Rows the metrics service already defines. Re-exported rather than
// restated: one definition per CRM row, so a new column cannot exist on
// the client's idea of a deal and not on the server's.
export type Opportunity = OpportunityRow;
export type Task = TaskRow;
export type Activity = ActivityRow;

export interface OpportunityEvent {
  opportunity_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  changed_by: string | null;
  changed_at: string;
}

export type LinkedRegistration = LinkedRegistrationRow;

export interface AthleteOption {
  athlete_id: string;
  legal_name: string;
  preferred_name: string | null;
  date_of_birth: string | null;
  current_status: string | null;
  parent_email: string | null;
}

export interface AcademyTier {
  tier_id: string;
  tier_name: string;
  price_amount: number;
  is_active: boolean;
}

export interface DuplicateWarning {
  reason: "phone" | "email" | "name";
  value: string;
  contactIds: string[];
}

export interface CrmPayload {
  contacts: Contact[];
  organizations: Organization[];
  opportunities: Opportunity[];
  tasks: Task[];
  activities: Activity[];
  events: OpportunityEvent[];
  registrations: LinkedRegistration[];
  athletes: AthleteOption[];
  academyTiers: AcademyTier[];
  metrics: CrmMetrics;
  duplicates: DuplicateWarning[];
  productionReceiptCount: number;
}

export interface ActResult {
  success: boolean;
  error?: string;
  warning?: string;
  matches?: Array<{ contact_id?: string; org_id?: string; full_name?: string; name?: string }>;
  contactId?: string;
  orgId?: string;
  opportunityId?: string;
}

interface CrmContextValue {
  data: CrmPayload | null;
  role: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  act: (command: CrmAction) => Promise<ActResult>;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function useCrm(): CrmContextValue {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used inside <CrmProvider>.");
  return ctx;
}

async function authedFetch(path: string, init?: RequestInit) {
  const { data } = await supabaseClient.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated.");
  return fetch(path, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

export function CrmProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CrmPayload | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    authedFetch("/api/v1/crm")
      .then(async (res) => {
        const body = (await res.json()) as {
          success?: boolean;
          error?: string;
          role?: string;
          data?: CrmPayload;
        };
        if (cancelled) return;
        if (!res.ok || !body.success || !body.data) {
          setError(body.error ?? `Request failed (${res.status}).`);
        } else {
          setError(null);
          setRole(body.role ?? null);
          setData(body.data);
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  const act = useCallback(async (command: CrmAction): Promise<ActResult> => {
    try {
      const res = await authedFetch("/api/v1/crm", {
        method: "POST",
        body: JSON.stringify(command),
      });
      const body = (await res.json()) as ActResult & { success?: boolean };
      if (res.ok && body.success) {
        setNonce((n) => n + 1);
        return { ...body, success: true };
      }
      return { ...body, success: false, error: body.error ?? `Request failed (${res.status}).` };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }, []);

  const value = useMemo<CrmContextValue>(
    () => ({ data, role, loading, error, refresh, act }),
    [data, role, loading, error, refresh, act],
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

/** Standard gate for a tab body: loading / error / empty handled once. */
export function CrmGate({ children }: { children: (data: CrmPayload) => ReactNode }) {
  const { data, loading, error } = useCrm();
  if (error) {
    return (
      <p
        role="alert"
        style={{
          background: "#2c1520",
          border: "1px solid #7f2b45",
          borderRadius: 8,
          padding: "12px 14px",
          fontSize: 13,
          color: "#ffb3c6",
        }}
      >
        {error}
      </p>
    );
  }
  if (!data) {
    return <p style={{ color: theme.muted }}>{loading ? "Loading pipeline…" : "No pipeline data."}</p>;
  }
  return <>{children(data)}</>;
}

// ---------------------------------------------------------------------
// Shared lookups and formatting
// ---------------------------------------------------------------------

export const labelOf = {
  stage: (s: string) => STAGES[s as Stage]?.label ?? s,
  product: (p: string) => PRODUCTS[p as Product]?.label ?? p,
  source: (s: string) => SOURCES[s as Source] ?? s,
};

/** Compact money. The board shows dozens of these; "KES 27,500" is long. */
export function shortKes(value: number): string {
  const n = Math.round(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return String(n);
}

/** Nairobi calendar day — the same clock lib/services/crm-metrics uses. */
export function todayNairobi(): string {
  return new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
}

export function daysUntil(date: string): number {
  return Math.round((Date.parse(`${date}T00:00:00+03:00`) - Date.now()) / 86_400_000);
}

/** "3 days overdue" / "due today" / "in 4 days" — the only date phrasing. */
export function dueLabel(date: string): { text: string; tone: "bad" | "warn" | "neutral" } {
  const days = daysUntil(date);
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "bad" };
  if (days === 0) return { text: "due today", tone: "warn" };
  if (days === 1) return { text: "due tomorrow", tone: "warn" };
  return { text: `in ${days}d`, tone: "neutral" };
}

export const TEMPERATURE_TONE: Record<string, "bad" | "warn" | "neutral"> = {
  hot: "bad",
  warm: "warn",
  cold: "neutral",
};

export const PRIORITY_TONE: Record<string, "bad" | "warn" | "good" | "neutral"> = {
  urgent: "bad",
  high: "warn",
  medium: "neutral",
  low: "neutral",
};

/** Index helpers every tab needs, built once per render of a tab body. */
export function indexes(data: CrmPayload) {
  return {
    contactById: new Map(data.contacts.map((c) => [c.contact_id, c])),
    orgById: new Map(data.organizations.map((o) => [o.org_id, o])),
    athleteById: new Map(data.athletes.map((a) => [a.athlete_id, a])),
    registrationById: new Map(data.registrations.map((r) => [r.id, r])),
    opportunityById: new Map(data.opportunities.map((o) => [o.opportunity_id, o])),
    /** Open tasks per opportunity — the "next action" on every card. */
    nextTaskFor: data.tasks
      .filter((t) => t.status === "pending" && t.opportunity_id)
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .reduce((map, t) => {
        if (!map.has(t.opportunity_id!)) map.set(t.opportunity_id!, t);
        return map;
      }, new Map<string, Task>()),
  };
}

/**
 * Global search (§13). One pass over the four searchable tables; at
 * founder scale this is a few thousand rows and runs in under a
 * millisecond, so there is no index to maintain and no debounce to tune.
 *
 * ponytail: linear scan client-side. Move to a server-side query when
 * the payload stops fitting in one fetch — that is the same threshold.
 */
export function searchContacts(data: CrmPayload, query: string): Contact[] {
  const q = query.trim().toLowerCase();
  if (!q) return data.contacts;

  const orgById = new Map(data.organizations.map((o) => [o.org_id, o.name.toLowerCase()]));
  const athleteById = new Map(
    data.athletes.map((a) => [a.athlete_id, `${a.legal_name} ${a.preferred_name ?? ""}`.toLowerCase()]),
  );
  const productsByContact = new Map<string, string>();
  for (const o of data.opportunities) {
    productsByContact.set(
      o.contact_id,
      `${productsByContact.get(o.contact_id) ?? ""} ${labelOf.product(o.product).toLowerCase()} ${o.stage}`,
    );
  }

  // Digits-only so "0712 345 678" finds a contact stored as 254712345678.
  const digits = q.replace(/\D/g, "");

  return data.contacts.filter((c) => {
    const haystack = [
      c.full_name,
      c.email ?? "",
      c.contact_type,
      c.source,
      c.notes ?? "",
      c.organization_id ? (orgById.get(c.organization_id) ?? "") : "",
      c.athlete_id ? (athleteById.get(c.athlete_id) ?? "") : "",
      productsByContact.get(c.contact_id) ?? "",
    ]
      .join(" ")
      .toLowerCase();
    if (haystack.includes(q)) return true;
    return Boolean(digits.length >= 3 && c.phone && c.phone.includes(digits));
  });
}
