"use client";

// =====================================================================
// ACTIVE SESSION CONTEXT (Hercules coach console)
//
// Manages the coach's live field state: currentVenue, currentSport,
// and activeRoster. The roster is hydrated from public.athlete_coaches
// filtered by the currently authenticated coach's Supabase uid
// (athlete_coaches.coach_id is TEXT and carries the auth uid).
//
// Requires browser-safe env vars only:
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
// Service-role keys must never reach this file. Anon read access to
// athlete_coaches requires an RLS policy scoped to coach_id = auth.uid().
// =====================================================================

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/utils/supabaseClient";

export interface RosterEntry {
  athlete_coach_id: number;
  athlete_id: string;
  coach_id: string;
  role_label: string | null;
  created_at: string;
}

export interface ActiveSessionState {
  /** Authenticated coach uid, null until the session resolves. */
  coachId: string | null;
  currentVenue: string | null;
  currentSport: string | null;
  activeRoster: RosterEntry[];
  loading: boolean;
  error: string | null;
  setCurrentVenue: (venue: string | null) => void;
  setCurrentSport: (sport: string | null) => void;
  /** Manual re-pull of the roster (e.g. after assigning a new athlete). */
  refreshRoster: () => Promise<void>;
}

export function useActiveSession(): ActiveSessionState {
  const supabase = supabaseClient;

  const [coachId, setCoachId] = useState<string | null>(null);
  const [currentVenue, setCurrentVenue] = useState<string | null>(null);
  const [currentSport, setCurrentSport] = useState<string | null>(null);
  const [activeRoster, setActiveRoster] = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRoster = useCallback(
    async (uid: string) => {
      const { data, error: rosterError } = await supabase
        .from("athlete_coaches")
        .select("athlete_coach_id, athlete_id, coach_id, role_label, created_at")
        .eq("coach_id", uid)
        .order("created_at", { ascending: true });

      if (rosterError) {
        setError(rosterError.message);
        setActiveRoster([]);
        return;
      }
      setError(null);
      setActiveRoster((data as RosterEntry[]) ?? []);
    },
    [supabase],
  );

  const refreshRoster = useCallback(async () => {
    if (!coachId) return;
    setLoading(true);
    await loadRoster(coachId);
    setLoading(false);
  }, [coachId, loadRoster]);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async (uid: string | null) => {
      if (cancelled) return;
      setCoachId(uid);
      if (!uid) {
        setActiveRoster([]);
        setError("No authenticated coach session.");
        setLoading(false);
        return;
      }
      setLoading(true);
      await loadRoster(uid);
      if (!cancelled) setLoading(false);
    };

    // Initial identity resolution.
    supabase.auth.getUser().then(({ data, error: authError }) => {
      if (cancelled) return;
      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }
      void hydrate(data.user?.id ?? null);
    });

    // Roster follows auth state deterministically (login/logout/switch).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void hydrate(session?.user?.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase, loadRoster]);

  return {
    coachId,
    currentVenue,
    currentSport,
    activeRoster,
    loading,
    error,
    setCurrentVenue,
    setCurrentSport,
    refreshRoster,
  };
}
