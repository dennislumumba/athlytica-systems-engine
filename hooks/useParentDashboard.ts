"use client";

// =====================================================================
// PARENT PORTAL LIVE FEED
//
// Realtime WebSocket subscription on public.athlete_metrics_log,
// filtered to the parent's assigned student. The instant a coach
// commits a metric via POST /api/v1/sessions/evaluate, the INSERT is
// pushed over supabase.channel() and prepended here — dashboard charts
// re-render live, no polling, no manual refresh.
//
// Infrastructure prerequisites:
//   - athlete_metrics_log must be in the supabase_realtime publication
//     (migration 20260714090000).
//   - Anon read access requires an RLS policy scoping parents to their
//     own student's rows.
//
// Browser-safe env vars only:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// =====================================================================

import { useEffect, useState } from "react";
import { supabaseClient } from "@/utils/supabaseClient";

export interface MetricLogRow {
  metric_log_id: number;
  athlete_id: string;
  metric_code: string;
  metric_timestamp: string;
  metric_payload: Record<string, unknown>;
  metric_version: number;
  created_at: string;
}

export type FeedConnectionStatus = "connecting" | "live" | "error" | "closed";

export interface ParentDashboardState {
  /** Newest-first metric history for the student. */
  metrics: MetricLogRow[];
  /** The most recently received live row — key chart animations off this. */
  latestMetric: MetricLogRow | null;
  loading: boolean;
  error: string | null;
  /** WebSocket channel health for a connection badge in the portal UI. */
  connectionStatus: FeedConnectionStatus;
}

export function useParentDashboard(
  studentAthleteId: string,
  initialLimit = 100,
): ParentDashboardState {
  const supabase = supabaseClient;

  const [metrics, setMetrics] = useState<MetricLogRow[]>([]);
  const [latestMetric, setLatestMetric] = useState<MetricLogRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<FeedConnectionStatus>("connecting");

  useEffect(() => {
    if (!studentAthleteId) {
      setError("No student athlete_id assigned to this parent session.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setConnectionStatus("connecting");

    // 1. Initial hydration — newest first.
    supabase
      .from("athlete_metrics_log")
      .select(
        "metric_log_id, athlete_id, metric_code, metric_timestamp, metric_payload, metric_version, created_at",
      )
      .eq("athlete_id", studentAthleteId)
      .order("metric_timestamp", { ascending: false })
      .limit(initialLimit)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setMetrics((data as MetricLogRow[]) ?? []);
        setLoading(false);
      });

    // 2. Live prepend on every committed coach evaluation.
    const channel = supabase
      .channel(`parent-dashboard-${studentAthleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "athlete_metrics_log",
          filter: `athlete_id=eq.${studentAthleteId}`,
        },
        (payload) => {
          if (cancelled) return;
          const row = payload.new as MetricLogRow;
          setLatestMetric(row);
          setMetrics((prev) => {
            // Idempotency guard: realtime can redeliver after reconnects.
            if (prev.some((m) => m.metric_log_id === row.metric_log_id)) return prev;
            return [row, ...prev];
          });
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") setConnectionStatus("live");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnectionStatus("error");
          setError(`Realtime channel degraded: ${status}`);
        } else if (status === "CLOSED") setConnectionStatus("closed");
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [supabase, studentAthleteId, initialLimit]);

  return { metrics, latestMetric, loading, error, connectionStatus };
}
