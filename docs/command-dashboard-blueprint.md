# Command Canvas — visual component blueprint, state hierarchy, JSON contract

Re-architecture of the main dashboard, 2026-07-28. Replaces the per-venture
dashboard that used to sit at `/dashboard`; that surface still exists, one
click deeper, at `/dashboard/venture`.

---

## 1. Routes and ownership

| Route | Renders | Auth |
|---|---|---|
| `/dashboard` | `CommandDashboard` → `CommandCanvas` | founder or head coach; athletes are redirected |
| `/dashboard/venture` | existing TTA / NRHL / Big Ice / HQ dashboards | any workspace grant |
| `/dashboard/leagues/nrhl/*` | NRHL league command centre (unchanged) | workspace grant |
| `/command-preview` | `CommandCanvas` against a fixture | none — **404 in production builds** |
| `GET /api/v1/workspace/dashboard?scope=command` | aggregate payload | founder or head coach |
| `POST /api/v1/workspace/dashboard` `{action:"approve_provenance"}` | staging promotion | **root founder only** |

---

## 2. Visual component blueprint

```
AppShell                                    (top bar: identity · workspace · MODE · profile)
└── CommandDashboard                        container: fetch, mode resolution, approval
    └── CommandCanvas                       pure presenter — everything below is props
        ├── ScopeBar          .cmd-scope    lens chips · region chips · hub select · edge pill · refresh
        ├── HeroKpis          .cmd-kpis     exactly 4 <Kpi> cards, mode-dependent
        │     founder: hubs+tenants · verified passports · verification ratio · scout+ARR
        │     coach:   athletes · readiness index · log compliance · league & next window
        ├── ShadowAudit       #shadow-audit LAYER 1 — staging queue, provenance, anomaly flags,
        │                                   batch approve, critical-override switch
        ├── Mode modules                    LAYER 2
        │   ├── founder
        │   │   ├── HubHealth        #hub-health      region → hub cards, live pulse, verified meter
        │   │   ├── ScoutPipeline    #scout-pipeline  ticker of views / exports / shortlists
        │   │   └── Tenancy          #tenancy         consent, telemetry, sync, billing status
        │   └── coach
        │       ├── VelocityMatrix   #velocity        4 tier cards, 90-day in/out movement
        │       ├── RosterReadiness  #readiness       composite, Δ90d, staleness, flag count
        │       ├── Leaderboard                       top 8 composites + strongest axis
        │       ├── CoachTracker     #coach-logs      who logged today, who went quiet
        │       ├── SessionWindows                    next occurrence per cohort slot
        │       └── Standings                         league table when the ETL has run
        ├── Pan-African engines             LAYER 3
        │   ├── EdgeBuffer      #edge-buffer   buffered / failed / dead letters / venue-unverified
        │   ├── IntegrityEngine #integrity     duplicates, dob anomalies, ID documents, consent
        │   ├── Benchmark       #benchmark     athlete ↔ cohort ↔ regional / national / international
        │   └── ExportLedger    #export-ledger hash-chained export & verification trail
        ├── QuickActions        #quick-actions LAYER 4 — exactly 4 tier-1 destinations per mode
        └── DevDrawer           Ctrl+Shift+D   session JSON, emulation (inert), probes, raw payload
```

Primitives live in `components/workspace/ui.tsx` and are shared with the
venture dashboards: `Panel`, `DataTable`, `Badge`, `Stat`, `Empty`, plus the
two added here — `Kpi` (hero card with meter and delta) and `Meter`
(0–100 bar with labelled reference marks).

### Visual language

- Dark slate stack: `#0b1220` page, `#111a2c` panel, `#0e1626` inset, `#24334d` hairline.
- One accent per lens: amber `#f6c443` for Founder Command, blue `#2f81f7` for Head Coach Hub.
- Status colours are semantic only: `#4ade80` good, `#f6c443` warn, `#ff6b8b` critical.
- Live hubs and the edge pill carry a 2.4 s pulse; suppressed under
  `prefers-reduced-motion`.
- No dense prose in panels — badges, meters, tables.

### Responsive contract (verified in-browser)

| Width | Hero | Modules | Actions | Shell nav |
|---|---|---|---|---|
| ≥ 1101 px | 4 columns | 2-up | 4 columns | 232 px sticky rail |
| 901–1100 px | 2 columns | 2-up | 4 columns | sticky rail |
| ≤ 900 px | 2 columns | stacked | 1 column | horizontal scroll strip, scope bar unsticks |
| ≤ 560 px | 1 column | stacked | 1 column | strip |

Tap targets are ≥ 40 px, ≥ 44 px below 900 px. Every table scrolls inside its
own panel; the page itself never scrolls horizontally (grid children are
pinned to `min-width: 0`).

---

## 3. State hierarchy

```
WorkspaceProvider  (session-scoped, localStorage-backed)
├── token          string | null              Supabase access token
├── actor          { userId, email, isFounder, roles }
├── workspace      WorkspaceId                → drives /dashboard/venture only
├── perspective    "executive" | "coach"      ← THE LENS. Persisted.
└── data           per-workspace payload

CommandDashboard  (container)
├── payload        CommandPayload | null      ← GET ?scope=command
├── modes          CommandMode[]              server-declared, from grants
├── loading / error / nonce                   nonce re-fetches after approval
└── mode           = modeFromPerspective(perspective), clamped to `modes`

CommandCanvas  (presenter)
├── region         RegionId | "all"           sub-filter, canvas-local
├── hubId          string | "all"             sub-filter, canvas-local
├── drawer         boolean                    Ctrl+Shift+D
└── online         boolean                    navigator.onLine (client-only truth)

ShadowAudit  (panel-local)
├── selected       Set<provenanceId>
├── override       boolean                    unlocks critical rows
└── busy / message

Benchmark: athleteId ("cohort" | id) · DevDrawer: emulated (render hint only)
```

**Why the lens is not new state.** The shell already had an
Executive/Coach toggle wired to `visibleNav`. Founder Command / Head Coach Hub
is that toggle, renamed — so the sidebar filter, the canvas modules and the
persisted preference can never disagree.

Derived, never stored: scoped hub list, filtered queue / cases / roster,
scoped verification ratio. All `useMemo` over `payload` + scope.

---

## 4. JSON contract

`GET /api/v1/workspace/dashboard?scope=command`

```jsonc
{
  "success": true,
  "actor":  { "userId": "…", "email": "…", "isFounder": true, "roles": { "tta": "GLOBAL_FOUNDER" } },
  "scope":  "command",
  "modes":  ["founder", "coach"],
  "data": {
    "generatedAt": "2026-07-28T09:00:00.000Z",

    "hubs": [{
      "hubId": "club:…", "name": "Big Ice Panari", "kind": "club|federation|tenant",
      "countryCode": "KEN", "region": "east|west|south|north|central|unassigned",
      "workspace": "big_ice|null", "status": "live|onboarding|dormant",
      "athletes": 2, "verified": 0, "sessions": 2, "venues": 0, "lastActivityAt": "…"
    }],

    "tenancy": [{
      "tenantId": "…", "name": "…", "workspace": "tta|null",
      "athletes": 3, "venues": 1, "telemetry": 24,
      "consentCoverage": 66, "verifiedRatio": 100, "syncFailures": 0,
      "status": "healthy|attention|blocked", "flags": ["no venue registered"], "createdAt": "…"
    }],

    "passports": { "total": 9, "verified": 3, "pending": 2, "unverified": 3,
                   "disputed": 1, "revoked": 0, "ratioPct": 33,
                   "estimatedDob": 1, "legacy": 3 },

    "revenue":   { "settledKes": 267500, "railKes": 117500, "last30Kes": 90000,
                   "trailing12Kes": 117500, "arrRunRateKes": 1080000,
                   "paidRegistrations": 4,
                   "byVenture": [{ "venture": "BIG_ICE", "settledKes": 90000, "paid": 2 }] },

    "scout":     { "engagementScore": 56, "formula": "min(100, exports×10 + views×2 + scouts×15) over 90 days",
                   "exportsWindow": 2, "viewsWindow": 3, "activeScouts": 2,
                   "ticker": [{ "when": "…", "actor": "…", "action": "DOSSIER_EXPORT",
                                "subject": "Neema Achieng", "hubName": "…" }] },

    "audit": {
      "queue": [{
        "id": "passport:…|biometric:…|telemetry:…",
        "provenanceId": "…|null",
        "recordKind": "passport|biometric|telemetry",
        "subject": "Grace", "athleteId": "…",
        "hubId": "club:…", "hubName": "…", "region": "east",
        "submittedBy": "federation_admin", "submittedAt": "…",
        "dataSource": "self_reported|club_official|…", "verificationStatus": "unverified|pending|disputed",
        "confidence": 0.88,
        "flags": [{ "code": "DUPLICATE_IDENTITY", "label": "…", "severity": "critical|warn|info", "detail": "…" }],
        "approvable": true, "blockedReason": null
      }],
      "counts": { "total": 9, "blocked": 8, "approvable": 1, "critical": 6 }
    },

    "integrity": { "cases": [{ "code": "…", "label": "…", "severity": "…", "detail": "…",
                               "athleteIds": ["…"], "subjects": ["…"], "hubName": "…", "region": "…" }],
                   "counts": { "critical": 5, "warn": 5, "info": 2 } },

    "edge": { "online": null, "bufferedRecords": 2, "failedRecords": 1, "deadLetters": 1,
              "oldestBufferedAt": "…", "lastIngestAt": "…", "unverifiedVenueLogs": 1,
              "deadLetterRows": [{ "id": "…", "record_type": "…", "last_error": "…", "failed_at": "…" }] },

    "ledger": [{ "eventId": "…", "kind": "export|verification|transfer|other",
                 "eventType": "DOSSIER_EXPORT", "recordType": "athlete", "recordId": "…",
                 "actorId": "…", "occurredAt": "…", "hashPrefix": "9f2b71c4aa01" }],

    "coach": {
      "athletes":   [{ "athleteId": "…", "name": "…", "hubId": "…", "hubName": "…", "region": "…",
                       "position": null, "composite": 67.8, "tier": "advanced",
                       "delta90d": 16, "lastAssessedAt": "…", "staleDays": 2,
                       "status": "active", "flagCount": 0 }],
      "readiness":  { "index": 55, "sampleSize": 4, "windowDays": 30, "basis": "30-day rolling mean" },
      "compliance": { "sessions": 5, "complete": 4, "pct": 80, "windowDays": 90 },
      "velocity":   [{ "tier": "advanced", "label": "Advanced", "count": 1, "movedIn": 1, "movedOut": 0 }],
      "leaderboard":[{ "athleteId": "…", "name": "…", "composite": 80.2,
                       "best": "technical", "bestValue": 86, "percentile": 100, "tier": "pro" }],
      "coachLogs":  [{ "coachId": "coach_njoroge", "roleLabel": "…", "athletes": 3,
                       "lastLogAt": "…", "loggedToday": false, "staleDays": 2 }],
      "windows":    [{ "registryId": "…", "cohort": "…", "track": "basic_skating",
                       "nextAt": "…", "capacity": 20, "enrolled": 2 }],
      "standings":  [{ "team": "Panari Penguins", "division": "U16", "players": 2, "points": 25,
                       "attendancePct": 90, "compositeAvg": 63.8, "conductCases": 1 }]
    },

    "benchmark": {
      "source": "Athlytica internal baseline v1 · not federation-published",
      "axes":     [{ "axis": "speed", "cohort": 56.5, "regional": 55, "national": 68, "international": 82 }],
      "athletes": [{ "athleteId": "…", "name": "…", "values": { "speed": 68, "agility": 66, "…": 0 } }]
    }
  }
}
```

`POST` promotion:

```jsonc
// request
{ "action": "approve_provenance", "provenanceIds": ["…"], "force": false }
// response
{ "success": true, "approved": 1,
  "skipped": [{ "provenanceId": "…", "reason": "Duplicate identity: 2 passports share this name and birth date" }],
  "ledgerWarning": null }
```

---

## 5. Rules the implementation enforces

1. **The queue is recomputed server-side on approval.** The client cannot
   promote a row it invented or one it was told was blocked.
2. **Critical anomalies block one-click approval** — duplicate identity,
   reused ID document, implausible birth date, missing guardian consent.
   The founder may override; the override is what lands in the ledger as
   `PASSPORT_VERIFICATION_APPROVED_OVERRIDE`.
3. **`verification_method` is never rewritten by a dashboard click.** A click
   is not a document check; claiming one in the passport would be a lie told
   by the UI.
4. **Approvals are hash-chained** into `audit_log`
   (`event_hash = sha256(prev_hash ‖ canonical_json(payload))`, the schema's
   documented contract), and a failed ledger write is surfaced, not swallowed.
5. **Telemetry is never one-click approvable** — it has no provenance row and
   is verified at the ingest source.
6. **Benchmark marks are configuration, not measurements**, and the panel says
   so on screen. Replace them in `config/command.ts` as federation data lands.
7. **Panels degrade independently.** A missing table empties one panel; the
   canvas still renders (`safeRows` in the route, `emptyCommand` in the module).

## 6. Where things live

| Concern | File |
|---|---|
| Taxonomy: modes, regions, tiers, flags, benchmarks, quick actions, panel index | `config/command.ts` |
| All arithmetic (pure, no I/O) | `lib/services/command-metrics.ts` |
| Fixture platform (dirty on purpose) | `lib/services/command-fixture.ts` |
| Queries + auth + promotion | `app/api/v1/workspace/dashboard/route.ts` |
| Canvas | `components/workspace/CommandDashboard.tsx` |
| Shared primitives | `components/workspace/ui.tsx` |
| Tests (17 cases) | `tests/command-metrics.test.mts` |
