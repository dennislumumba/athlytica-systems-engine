"use client";

// =====================================================================
// ATHLETE DASHBOARD STATE HYDRATION
// Subscribes to Realtime INSERTs on performance_logs (enabled in
// migration 20260711130000) so the athlete profile view updates the
// moment the Edge Function commits a calculation — no polling, no
// manual refresh. Immutable append upstream means this feed only ever
// prepends; existing rows never change under the user.
//
// Requires public env vars (browser-safe, anon key only):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// NOTE: anon read access to performance_logs requires an RLS policy
// scoped to the viewer's tenant — see README ops notes. Service-role
// keys must never reach this file.
// =====================================================================

import { useEffect, useState } from "react";
import { supabaseClient } from "@/utils/supabaseClient";

export interface PerformanceLogRow {
  id: string;
  athlete_id: string;
  session_id: string;
  tenant_id: string;
  speed: number;
  agility: number;
  stamina: number;
  technical: number;
  cognitive: number;
  composite_score: number;
  stream_type: string;
  venue_verified: boolean;
  engine_version: string;
  created_at: string;
}

export function usePerformanceFeed(athleteId: string, initialLimit = 50) {
  const supabase = supabaseClient;

  const [logs, setLogs] = useState<PerformanceLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Initial hydration
    supabase
      .from("performance_logs")
      .select("*")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(initialLimit)
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setLogs((data as PerformanceLogRow[]) ?? []);
        setLoading(false);
      });

    // Live prepend on every committed calculation
    const channel = supabase
      .channel(`perf-feed-${athleteId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "performance_logs",
          filter: `athlete_id=eq.${athleteId}`,
        },
        (payload) => {
          setLogs((prev) => [payload.new as PerformanceLogRow, ...prev]);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase, athleteId, initialLimit]);

  return { logs, loading, error };
}
