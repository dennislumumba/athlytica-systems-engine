# Athlytica Systems Engine — Master Venture Monorepo

Welcome to the central engineering and operational nervous system for the unified sports-technology and performance infrastructure ecosystem. This repository functions as a high-velocity monorepo containing the proprietary software architectures, data schemas, database layers, and strategic venture roadmaps governing three deeply synchronized corporate entities.

---

## 🏢 The 3-Brand Ecosystem Matrix

### 1. Athlytica Core Engine (`/core-engine`)
* **The Role:** The central algorithmic ledger, verifiable athlete infrastructure layer, and centralized data vault.
* **The Objective:** Eliminating the historical sports data void for emerging-market youth athletes, breaking the grassroots sports data monopoly, and structuring portable, immutable Athlete Passports for international scouting portability.
* **Tech Baseline:** Canonical JSON schemas, PostgreSQL relational database structures, and REST API contract boundaries designed to ingest multi-sport biometric telemetry and video-performance analytics.

### 2. Big Ice Inline Fitness (`/brand-big-ice`)
* **The Role:** The premium multi-sport performance academy engine, elite instructional operations platform, and lifestyle streetwear distributor.
* **The Objective:** Monetizing recurring youth consumer pipelines across elite ice and inline skating disciplines, scaling coach recruitment frameworks, and orchestrating the long-term master planning and capital construction of integrated dual-surface ice and inline arena facilities.
* **Operational Boundary:** Explicitly decoupled from routine, decentralized equipment logistics, focusing entirely on high-status coaching infrastructure and product scaling.

### 3. Nairobi Regional Hockey League (`/brand-nrhl`)
* **The Role:** A high-margin, disciplined, school-aligned sports property engineered for East Africa's premium institutional education market.
* **The Objective:** Operating a highly structured, data-governed 4-conference youth hockey ecosystem.
* **Logistical Gates:** Enforces absolute deadline gating (July 31, 2026 Application Lock) and tiered, data-dense membership models to scale cash-flow and asset deployment velocity.

---

## � Convex Bridge Layer — Hercules Frontend Integration

This backend system operates as a **hybrid partner** to the Hercules frontend, which uses Convex for real-time data synchronization. The bridge layer automates bidirectional athlete data synchronization:

### Architecture Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **Data Adapter** | `lib/converters/convexAdapter.ts` | Translates Postgres schemas → Convex documents; serializes athlete IDs (ATH-YYYY-NNNN), normalizes sport codes, formats sizing metrics |
| **Sync Queue** | `lib/sync/convexSyncQueue.ts` | Asynchronous FIFO queue with exponential backoff (3 retries), dead-letter persistence on final failure |
| **Webhook Gateway** | `app/api/v1/sync/convex/route.ts` | POST endpoint receiving Supabase trigger payloads; validates signatures (HMAC-SHA256); dispatches to queue |
| **Schema Migration** | `supabase/migrations/20260714_sync_monitoring.sql` | Adds `sync_dead_letter_queue` table for durable failure capture; adds `passport_id` column to athlete table |
| **ID Normalization** | `scripts/normalize-legacy-ids.js` | Reconciles legacy athlete IDs; supports dry-run and execute modes; exports JSON audit trail |

### Data Flow

```
Supabase Database Write Event
  ↓
pg_net Outbound Webhook (Postgres Trigger)
  ↓
POST /api/v1/sync/convex
  ↓ (HMAC verification)
convexAdapter (row → document)
  ↓
enqueueSyncJob (non-blocking)
  ↓
Convex HTTP Endpoint OR Dead-Letter Queue
  ↓
Hercules Frontend (Real-Time Dashboard)
```

### Environment Configuration

```bash
# Required for bridge operation
SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGc..."
GOOGLE_FORMS_WEBHOOK_SECRET="your-shared-secret"
CONVEX_SYNC_ENDPOINT="https://outstanding-platypus-738.convex.site/api/sync-athlete"
```

### Deployment Checklist

```bash
# 1. Apply database migrations
supabase migration up --linked

# 2. Normalize legacy athlete IDs (dry-run first)
node scripts/normalize-legacy-ids.js --dry-run
node scripts/normalize-legacy-ids.js --execute

# 3. Verify typecheck and build
npm run typecheck
npm run build

# 4. Configure database triggers in Supabase (pg_net webhooks)
# See BRIDGE_LAYER_DEPLOYMENT.md for trigger SQL
```

**For complete operational documentation, see [BRIDGE_LAYER_DEPLOYMENT.md](BRIDGE_LAYER_DEPLOYMENT.md).**

---

## 📁 Repository Directory Architecture

```text
athlytica-systems-engine/
├── README.md                           <-- This Master Architectural Manifest
├── BRIDGE_LAYER_DEPLOYMENT.md          <-- Convex Bridge Layer Complete Documentation
├── business-brief.md                   <-- Core Foundational Venture Goals
├── core-engine/                        <-- Central Data Engine & Infrastructure Moat
│   ├── athlytica-spec.md               <-- Data Monopoly & International Scaling Strategy
│   └── schemas/                        <-- Relational Database DDL & JSON Schema Definitions
├── brand-big-ice/                      <-- Academy Coaching Operations & Facility Strategy
│   └── coaching-ops.md                 <-- Performance Training Metrics & Rink Objectives
├── brand-nrhl/                         <-- Competitive League Property Operations
│   └── league-prospectus.md            <-- Institutional Pricing, Timelines & Conference Architecture
├── lib/
│   ├── converters/
│   │   └── convexAdapter.ts            <-- Postgres → Convex data transformation
│   └── sync/
│       └── convexSyncQueue.ts          <-- Resilient async job queue with retry logic
├── app/api/v1/sync/convex/
│   └── route.ts                        <-- Supabase trigger webhook gateway (POST)
├── supabase/migrations/
│   └── 20260714_sync_monitoring.sql    <-- Dead-letter queue + passport_id schema
├── scripts/
│   └── normalize-legacy-ids.js         <-- Legacy athlete ID reconciliation tool
└── outputs/                            <-- Automated Agent Multi-Pipeline Orchestrations
    └── revenue-agent-demo.md           <-- 10-Agent Venture Execution Blueprint
```
