"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * ATHLYTICA — LGE-NRHL Adaptive Onboarding Funnel
 * -----------------------------------------------
 * 3-step client funnel. All division/entitlement logic rendered here is
 * DISPLAY-ONLY prediction; the authoritative computation happens server-side
 * in convex/onboarding.ts:validateAndOnboardAthlete. The client never posts
 * feature flags — only raw intent (DOB, gender, zone, tier).
 */

// ---------------------------------------------------------------------------
// Domain types (mirror convex/schema.ts literal unions)
// ---------------------------------------------------------------------------

type UnitType = "individual_draft_hopeful" | "external_team_unit";
type GeographicZone = "the_summit" | "the_ridge" | "the_plateau" | "the_savannah";
type Gender = "male" | "female";
type Division = "u8" | "u12" | "u16" | "open_men" | "open_women";
type PodTier = "tier1" | "tier2" | "tier3";

interface FunnelState {
  unitType: UnitType;
  teamName: string; // external unit path only
  geographicZone: GeographicZone | null;
  dateOfBirth: string; // ISO YYYY-MM-DD
  gender: Gender;
  selectedTier: PodTier | null;
  mpesaPhone: string; // E.164, e.g. +2547XXXXXXXX
}

type CheckoutStatus =
  | { phase: "idle" }
  | { phase: "registering" }
  | { phase: "awaiting_mpesa_pin"; athleteId: string; amountKes: number }
  | { phase: "error"; message: string };

const ZONES: { id: GeographicZone; label: string; descriptor: string }[] = [
  { id: "the_summit", label: "The Summit", descriptor: "Northern conference block" },
  { id: "the_ridge", label: "The Ridge", descriptor: "Eastern conference block" },
  { id: "the_plateau", label: "The Plateau", descriptor: "Central conference block" },
  { id: "the_savannah", label: "The Savannah", descriptor: "Southern conference block" },
];

interface PodCard {
  tier: PodTier;
  name: string;
  priceKes: number;
  inclusions: string[];
  exclusions: string[];
  accent: string;
  featured: boolean;
}

const POD_MATRIX: PodCard[] = [
  {
    tier: "tier1",
    name: "Scrimmage Core Pod",
    priceKes: 25_000,
    inclusions: ["1 basic metric node (scorecard)", "Full scrimmage access"],
    exclusions: ["No video tagging", "No tactical lab modules"],
    accent: "border-slate-400",
    featured: false,
  },
  {
    tier: "tier2",
    name: "Showcase Performance Pod",
    priceKes: 48_000,
    inclusions: [
      "All 5 metric taxonomy nodes",
      "Biometrics · Technical · Tactical IQ · Speed & Power · Psychological",
      "True video-tagging access",
      "Priority scrimmage access",
    ],
    exclusions: [],
    accent: "border-emerald-500",
    featured: true,
  },
  {
    tier: "tier3",
    name: "Foundational Development Pod",
    priceKes: 32_000,
    inclusions: ["2 metric nodes: Technical Skill & Biometrics"],
    exclusions: ["Strictly NO scrimmage access", "Off-peak hours only"],
    accent: "border-amber-500",
    featured: false,
  },
];

// ---------------------------------------------------------------------------
// Client-side division prediction (display-only mirror of the server guard)
// ---------------------------------------------------------------------------

function computeAge(dateOfBirth: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const dob = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dob.getTime()) || dob.getTime() > Date.now()) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - y;
  if (
    now.getUTCMonth() < m - 1 ||
    (now.getUTCMonth() === m - 1 && now.getUTCDate() < d)
  ) {
    age -= 1;
  }
  return age;
}

function predictDivision(age: number | null, gender: Gender): Division | null {
  if (age === null || age < 6) return null;
  if (age <= 8) return "u8";
  if (age <= 12) return "u12";
  if (age <= 16) return "u16";
  return gender === "male" ? "open_men" : "open_women";
}

const DIVISION_BADGE: Record<Division, { label: string; classes: string }> = {
  u8: { label: "Under 8 · Mixed", classes: "bg-sky-100 text-sky-800" },
  u12: { label: "Under 12 · Mixed", classes: "bg-indigo-100 text-indigo-800" },
  u16: { label: "Under 16 · Mixed", classes: "bg-violet-100 text-violet-800" },
  open_men: { label: "Open League · Men", classes: "bg-emerald-100 text-emerald-800" },
  open_women: { label: "Open League · Women", classes: "bg-rose-100 text-rose-800" },
};

const kes = (n: number) => `${n.toLocaleString("en-KE")} KES`;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface NRHLFunnelProps {
  /** Authenticated identity anchor of the registrant (users table). */
  userId: Id<"users">;
  /** Guardian anchor — required by the backend for u8/u12/u16 divisions. */
  parentId?: Id<"users">;
  /** Athlete display name captured upstream (account creation). */
  athleteName: string;
  /**
   * Payment initiation hook. In production this posts to the Daraja STK-push
   * proxy (Convex action) which fires the M-Pesa PIN prompt on the handset.
   */
  onInitiateMpesaPush?: (payload: {
    athleteId: string;
    phone: string;
    amountKes: number;
    tier: PodTier;
  }) => Promise<void>;
}

export default function NRHLFunnel({
  userId,
  parentId,
  athleteName,
  onInitiateMpesaPush,
}: NRHLFunnelProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [status, setStatus] = useState<CheckoutStatus>({ phase: "idle" });
  const [form, setForm] = useState<FunnelState>({
    unitType: "individual_draft_hopeful",
    teamName: "",
    geographicZone: null,
    dateOfBirth: "",
    gender: "male",
    selectedTier: null,
    mpesaPhone: "",
  });

  const onboardAthlete = useMutation(api.onboarding.validateAndOnboardAthlete);

  const age = useMemo(() => computeAge(form.dateOfBirth), [form.dateOfBirth]);
  const division = useMemo(
    () => predictDivision(age, form.gender),
    [age, form.gender],
  );
  const isMinor = division === "u8" || division === "u12" || division === "u16";

  const step2Valid =
    form.geographicZone !== null &&
    division !== null &&
    (!isMinor || parentId !== undefined) &&
    (form.unitType === "individual_draft_hopeful" || form.teamName.trim().length >= 2);

  async function handleCheckout(tier: PodTier) {
    if (!form.geographicZone || !division) return;
    setForm((f) => ({ ...f, selectedTier: tier }));
    setStatus({ phase: "registering" });
    try {
      const result = await onboardAthlete({
        userId,
        parentId: isMinor ? parentId : undefined,
        name: athleteName,
        dateOfBirth: form.dateOfBirth,
        gender: form.gender,
        geographicZone: form.geographicZone,
        podTier: tier,
      });
      const amountKes = POD_MATRIX.find((p) => p.tier === tier)!.priceKes;
      await onInitiateMpesaPush?.({
        athleteId: result.athleteId,
        phone: form.mpesaPhone,
        amountKes,
        tier,
      });
      setStatus({ phase: "awaiting_mpesa_pin", athleteId: result.athleteId, amountKes });
    } catch (err) {
      setStatus({
        phase: "error",
        message: err instanceof Error ? err.message : "Registration failed.",
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      {/* Progress rail */}
      <ol className="mb-8 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
        {(["Unit", "Context", "Pod Checkout"] as const).map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          return (
            <li key={label} className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full ${
                  step >= n ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
                }`}
              >
                {n}
              </span>
              <span className={step >= n ? "text-slate-900" : "text-slate-400"}>
                {label}
              </span>
              {n < 3 && <span className="mx-1 h-px w-8 bg-slate-300" />}
            </li>
          );
        })}
      </ol>

      {/* ------------------------------------------------------------- */}
      {/* STEP 1 — Unit Selection                                        */}
      {/* ------------------------------------------------------------- */}
      {step === 1 && (
        <section aria-label="Unit selection">
          <h2 className="mb-1 text-xl font-bold text-slate-900">
            How are you entering the league?
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            LGE-NRHL · Registration window open for the August 2026 tournament cycle.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                {
                  id: "individual_draft_hopeful",
                  title: "Individual Draft Hopeful",
                  body: "Enter the evaluation pods solo. Athlytica passport created; drafted into a conference roster on merit.",
                },
                {
                  id: "external_team_unit",
                  title: "Full External Team Unit",
                  body: "Register an existing club or academy squad as a complete unit into one geographic conference.",
                },
              ] as { id: UnitType; title: string; body: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setForm((f) => ({ ...f, unitType: opt.id }))}
                className={`rounded-xl border-2 p-5 text-left transition ${
                  form.unitType === opt.id
                    ? "border-emerald-600 bg-emerald-50"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
                aria-pressed={form.unitType === opt.id}
              >
                <span className="block font-semibold text-slate-900">{opt.title}</span>
                <span className="mt-1 block text-sm text-slate-500">{opt.body}</span>
              </button>
            ))}
          </div>

          {form.unitType === "external_team_unit" && (
            <label className="mt-5 block">
              <span className="text-sm font-medium text-slate-700">Team unit name</span>
              <input
                type="text"
                value={form.teamName}
                onChange={(e) => setForm((f) => ({ ...f, teamName: e.target.value }))}
                placeholder="e.g. Eastlands Blades RHC"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
          )}

          <div className="mt-8 flex justify-end">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 2 — Conference + Age Context                              */}
      {/* ------------------------------------------------------------- */}
      {step === 2 && (
        <section aria-label="Conference and division context">
          <h2 className="mb-6 text-xl font-bold text-slate-900">
            Conference &amp; division placement
          </h2>

          <fieldset className="mb-6">
            <legend className="mb-2 text-sm font-medium text-slate-700">
              Geographic conference
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {ZONES.map((zone) => (
                <label
                  key={zone.id}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border-2 p-4 transition ${
                    form.geographicZone === zone.id
                      ? "border-emerald-600 bg-emerald-50"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="geographicZone"
                    value={zone.id}
                    checked={form.geographicZone === zone.id}
                    onChange={() => setForm((f) => ({ ...f, geographicZone: zone.id }))}
                    className="mt-1 accent-emerald-600"
                  />
                  <span>
                    <span className="block font-semibold text-slate-900">
                      {zone.label}
                    </span>
                    <span className="block text-xs text-slate-500">{zone.descriptor}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Date of birth</span>
              <input
                type="date"
                value={form.dateOfBirth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </label>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">Gender</legend>
              <div className="mt-1 flex gap-3">
                {(["male", "female"] as Gender[]).map((g) => (
                  <label
                    key={g}
                    className={`flex-1 cursor-pointer rounded-lg border-2 px-3 py-2 text-center text-sm capitalize ${
                      form.gender === g
                        ? "border-emerald-600 bg-emerald-50 font-semibold"
                        : "border-slate-200"
                    }`}
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={form.gender === g}
                      onChange={() => setForm((f) => ({ ...f, gender: g }))}
                      className="sr-only"
                    />
                    {g}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                Open League (17+) is gender-segregated; U8–U16 divisions are mixed.
              </p>
            </fieldset>
          </div>

          {/* Live computed division badge */}
          <div className="mt-6 flex min-h-[2.5rem] items-center gap-3">
            <span className="text-sm text-slate-600">Computed division:</span>
            {division ? (
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${DIVISION_BADGE[division].classes}`}
              >
                {DIVISION_BADGE[division].label}
                {age !== null && <span className="ml-1 font-normal">(age {age})</span>}
              </span>
            ) : (
              <span className="text-sm italic text-slate-400">
                {form.dateOfBirth && age !== null && age < 6
                  ? "Below minimum league entry age (6)."
                  : "Enter a valid birthdate."}
              </span>
            )}
          </div>

          {isMinor && parentId === undefined && (
            <p className="mt-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This division requires a linked parent/guardian account before checkout.
            </p>
          )}

          <div className="mt-8 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!step2Valid}
              onClick={() => setStep(3)}
              className="rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------- */}
      {/* STEP 3 — Pod Checkout Matrix                                   */}
      {/* ------------------------------------------------------------- */}
      {step === 3 && (
        <section aria-label="Pod checkout matrix">
          <h2 className="mb-1 text-xl font-bold text-slate-900">Select your pod tier</h2>
          <p className="mb-6 text-sm text-slate-500">
            Entitlements are locked server-side to the tier you confirm — payment via
            M-Pesa STK push.
          </p>

          <div className="grid gap-5 md:grid-cols-3">
            {POD_MATRIX.map((pod) => (
              <article
                key={pod.tier}
                className={`flex flex-col rounded-2xl border-2 bg-white p-5 ${pod.accent} ${
                  pod.featured ? "shadow-lg ring-1 ring-emerald-200" : ""
                }`}
              >
                {pod.featured && (
                  <span className="mb-2 w-fit rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                    FULL TAXONOMY
                  </span>
                )}
                <h3 className="font-bold text-slate-900">{pod.name}</h3>
                <p className="mt-1 text-2xl font-extrabold text-slate-900">
                  {kes(pod.priceKes)}
                </p>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {pod.inclusions.map((line) => (
                    <li key={line} className="flex gap-2 text-slate-700">
                      <span aria-hidden className="text-emerald-600">✓</span>
                      {line}
                    </li>
                  ))}
                  {pod.exclusions.map((line) => (
                    <li key={line} className="flex gap-2 text-slate-400">
                      <span aria-hidden className="text-rose-400">✕</span>
                      {line}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  disabled={status.phase === "registering"}
                  onClick={() => handleCheckout(pod.tier)}
                  className={`mt-5 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                    pod.featured
                      ? "bg-emerald-600 text-white hover:bg-emerald-500"
                      : "bg-slate-900 text-white hover:bg-slate-700"
                  }`}
                >
                  {status.phase === "registering" && form.selectedTier === pod.tier
                    ? "Registering…"
                    : `Pay ${kes(pod.priceKes)} via M-Pesa`}
                </button>
              </article>
            ))}
          </div>

          <label className="mt-6 block max-w-sm">
            <span className="text-sm font-medium text-slate-700">
              M-Pesa phone number (STK push target)
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={form.mpesaPhone}
              onChange={(e) => setForm((f) => ({ ...f, mpesaPhone: e.target.value }))}
              placeholder="+2547XXXXXXXX"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </label>

          {status.phase === "awaiting_mpesa_pin" && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"
            >
              <strong>Passport created.</strong> An M-Pesa prompt for{" "}
              {kes(status.amountKes)} has been pushed to {form.mpesaPhone || "your handset"}.
              Enter your PIN to confirm. Athlete ID:{" "}
              <code className="font-mono">{status.athleteId}</code>
            </div>
          )}
          {status.phase === "error" && (
            <div
              role="alert"
              className="mt-6 rounded-xl border border-rose-300 bg-rose-50 px-5 py-4 text-sm text-rose-900"
            >
              <strong>Registration rejected:</strong> {status.message}
            </div>
          )}

          <div className="mt-8">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              ← Back
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
