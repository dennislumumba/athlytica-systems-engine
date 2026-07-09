# Athlytica / Big Ice / NRHL — Investor-Ready Venture Asset Package
### Consolidated output of the 10-Agent Revenue Orchestration Pipeline
**Founder:** Dennis Lumumba Mukhavani | **Date compiled:** 2026-07-08 | **Status:** Pre-revenue, early-stage

---

## HOW TO READ THIS DOCUMENT

This is the full, consolidated output of a 10-agent sequential pipeline that took Athlytica from a one-page business brief to a complete venture package: market research → pricing model → positioning → production-ready data schema → legal/compliance framework → video script → conversion funnel copy → independent technical audit → infrastructure audit → operational launch runbook.

**Two corrections have been applied directly to the customer-facing copy below**, per the Agent 8 (technical-critic) audit in Section 7:
- Email 1's subject line was changed from *"The $6,250 that never got claimed"* (an unverified factual claim about a specific unrecovered sum) to **"The 1.25% most academies never calculate"** (a claim about a rate, not an implied real case).
- The landing page's DPA/GDPR qualifier was restored to the full two-sentence, controller-responsibility-explicit form the legal-ip-steward's compliance rule requires, rather than the shortened version that reintroduced overclaim risk.

**Everything else flagged by the technical-critic (Section 7) and the infra audit (Section 8) is preserved as an open item, not silently fixed** — several of them are business decisions (agency pricing model, conflict-of-interest policy, unit-economics gaps) that only the founder can resolve, and they are listed explicitly in Section 10 so nothing gets lost in a wall of text. **Do not treat any "download," "watch," or "capture email" language below as live — none of this funnel is deployed yet.** See Section 8 and Section 9 for exactly what has to be built before it's real.

---

## TABLE OF CONTENTS

1. Market Signal Research
2. Unit Economics & B2B Pricing Model
3. Unified B2B Positioning Framework
4. Athlytica Scouting Passport Schema (JSON Schema + PostgreSQL DDL)
5. Kenya DPA Compliance & IP Isolation Framework
6. Video Blueprint & Retention Map
7. Landing Page Copy & 5-Step Email Nurture Sequence
8. Independent Technical Critique (Agent 8 Findings)
9. Infrastructure & Deployment Readiness Audit (Agent 9 Findings)
10. Operational Execution Runbook (Agent 10 Synthesis)
11. Founder Action Summary — Open Decisions & Next 30 Days

---

# 1. MARKET SIGNAL RESEARCH

### Data Void Analysis — Specific Regional/Emerging-Market Gaps

**A. West/Central African Football Academies (Nigeria, Ghana, Senegal, Côte d'Ivoire, Cameroon)**
- **Age verification failure**: MRI-based bone-age testing at CAF/FIFA U-17 tournaments has produced recurring, publicized failure/withdrawal incidents. No academy below Tier-1 (non-Right to Dream, non-Aspire) maintains a verifiable growth-curve/biometric passport from age 10-11 onward that would make age disputes moot.
- **Training compensation / solidarity payment leakage**: FIFA's Clearing House pays training compensation and solidarity mechanism fees to boyhood clubs on international transfers — but only if the club can produce documented, verifiable registration and development history. CIES Football Observatory and FIFPro research documents that emerging-market academies systematically fail to claim large shares of money they are legally owed, purely due to lack of digitized proof of custody over the player's development years.
- **Agent-driven information asymmetry**: African-based agents negotiating with European buying clubs are structurally disadvantaged because they cannot produce standardized, third-party-verifiable performance histories — this suppresses transfer valuations and agent commissions.

**B. East African Distance Running (Kenya — Rift Valley; Ethiopia — Oromia/Arsi)**
- World Athletics' Athlete Biological Passport is a doping-control tool for internationally registered elites, not a scouting/valuation tool — it doesn't touch the developmental pipeline (district cross-country circuits, informal training camps).
- No standardized data layer connects a district-level result to a verifiable, portable record a European management group or NCAA program can trust without an in-person scouting trip.
- Documented pattern of exploitative management contracts in this population — a direct consequence of athletes having no independent, portable record of their own market value before a manager makes first contact.

**C. Caribbean Sprinting (Jamaica — ISSA/"Champs" circuit, Trinidad)**
- One of the most heavily NCAA/shoe-company-scouted grassroots circuits in the world, yet results live in fragmented, non-standardized formats (PDF heat sheets, informal spreadsheets) — no queryable, verifiable athlete-level historical record exists outside manual scouting trips.

**D. Ice/Inline Hockey in Non-Traditional Markets — NRHL / Big Ice Vertical**
- A **total void**, not a partial one. IIHF development federations in non-traditional markets have essentially zero standardized athlete tracking or performance-taxonomy infrastructure. There is no "Wyscout for inline hockey" anywhere. This is the cleanest wedge in the portfolio — no incumbent to displace, only the absence of a category.

**E. Insurance / Risk Layer (Cross-Sport, Cross-Region)**
- Catastrophic injury and career-disruption insurance for academy-age athletes in these regions is unpriceable or unavailable, because underwriters require an actuarial baseline (historical injury incidence, workload data, medical screening trail) that doesn't exist for this population. The athlete's future earning potential is real and often worth six to seven figures at the point of a European transfer, but functionally uninsurable.

### Institutional Buyer Psychology (Fear-Driven, Not Aspiration-Driven)

- **Academy directors** fear reputational/financial catastrophe from an age-fraud finding, and fear losing training-compensation/solidarity claims they don't know they're entitled to.
- **Agents** fear losing a transfer deal — or negotiating from a weaker position — because a buying club's recruitment analytics department discounts an "unverifiable" player. They also fear losing a first-contact claim to a rival agent with no documented, dated record to defend it.
- **Federations** fear losing FIFA Forward Programme or Olympic Solidarity funding tranches, which increasingly require demonstrable athlete pathway and data-governance evidence.
- **Player agencies** fear regulatory/reputational exposure from operating in a legal gray zone around minor-athlete representation without documented, consent-based data trails.
- **Regional operators (Big Ice/NRHL)** fear permanent lockout from IIHF/international recognition and sponsorship for lacking a standardized development pipeline.

**What buyers distrust about existing tools**: Wyscout/InStat/Hudl/Catapult are built video-first or wearable-first for well-funded professional/collegiate markets — the pricing, connectivity assumptions, and taxonomy don't map onto grassroots/academy reality in these regions. There is also live distrust of foreign-owned platforms extracting athlete data without local institutional control — which makes an **open-source schema** a genuine trust-building wedge, not just a lead-magnet gimmick.

### Competitive/Adjacent Landscape

| Player | What they do | Why the gap exists for this venture |
|---|---|---|
| Wyscout / InStat | Video-based match analytics, football only | Requires pro-grade footage; no grassroots/academy coverage, no age-verification layer |
| Hudl | Video + stats, broad sport coverage | Subscription/bandwidth assumptions incompatible with regional academy budgets |
| Catapult / StatSports | GPS/wearable tracking | Per-athlete hardware cost (thousands of dollars) prohibitive at academy scale |
| FIFA Clearing House | Pays solidarity/training compensation on verified transfers | Requires documentation these clubs structurally can't produce — a distribution rail to plug into, not compete with |
| World Athletics Bio Passport | Anti-doping monitoring, elite internationals only | Doesn't extend to developmental/scouting economic value |
| Specialty sports insurers | Career/injury insurance for pros | No actuarial product exists for this population — a data-licensing opportunity, not a competitor |
| IIHF & regional hockey federations | Sport governance, no data infra in non-traditional markets | Pure white space — first-mover schema-setting opportunity |

**The wedge**: Athlytica occupies the layer beneath Wyscout/Catapult — the verifiable data-capture and taxonomy layer for populations those platforms structurally cannot serve — and becomes the feeder/compliance layer that FIFA's Clearing House, federation grant programs, and insurers plug into.

### Demand Signals (Investor-Credible)
- Recurring, publicized age-fraud incidents at CAF/FIFA youth tournaments.
- CIES Football Observatory / FIFPro research quantifying systemic solidarity/training-compensation underclaiming.
- Rising Africa-to-Europe transfer benchmarks (e.g., the Osimhen transfer-value trajectory) showing the economic stakes are large and growing.
- Documented exploitative-contract patterns among East African distance runners.
- FIFA Forward Programme / IOC Olympic Solidarity funding cycles increasingly tying disbursement to demonstrable data governance.
- Total absence of any inline/ice hockey data-infrastructure vendor in non-traditional IIHF markets — no competitor to price against.

### Opportunity Scoring

| Metric | Score (1-5) | Rationale |
|---|---|---|
| Institutional Urgency | 4 | Age-fraud sanctions, solidarity leakage, funding compliance are active, recurring pain points |
| Data Monetization Value | 5 | Directly tied to transfer valuation, training-comp recovery, insurance underwriting |
| Sub-15-Min Technical Viability | 4 | The schema is a concrete, demonstrable artifact; full agent-engine automation is heavier but the schema layer alone demos well |
| **Total** | **13/15** | |

### Strategic Guardrails
No generic "AI will change sports" framing. No consumer/fan framing (fantasy, betting) — strictly B2B institutional. No claims of replacing Wyscout/Catapult/Hudl head-on. No vague "underserved markets" language without naming sport/region/buyer. No overstating current build status — this is early-stage infrastructure, not a deployed platform with live customers.

---

# 2. UNIT ECONOMICS & B2B PRICING MODEL

*Status caveat, carried through this entire section: pre-revenue, forward-looking projection framework. No live customer actuals exist. All figures are modeled assumptions anchored to named benchmarks, not fabricated traction.*

### B2B Tier Structure

| Tier | Segment | Price Point | Model | Anchor Reasoning |
|---|---|---|---|---|
| Tier 0 — Schema Access | All (top of funnel) | $0, institutional email gate | Lead qualification | Open-source schema; institutional domain = firmographic qualifying signal |
| Tier 1 — Academy/Club SaaS | African football academies | $2,000–$8,000/yr flat, or $50–$150/athlete/yr | Recurring SaaS + optional success-fee add-on | 90–95% below Catapult's per-athlete hardware cost; sits below Wyscout/InStat's $10K–$40K enterprise contracts to read as complementary, not competitive |
| Tier 2 — Agent/Agency | Player agents | $200–$500/athlete profile/yr | Recurring, per-profile | **Flagged weak** — see below |
| Tier 3 — Federation/Enterprise | Federations/NGBs | $25,000–$75,000/yr | Enterprise license, grant-disbursed | Below Wyscout's federation contracts (~$50K–150K/yr); small line item against $250K–1M+/yr FIFA Forward disbursements |
| Tier 4 — Insurer/Underwriter | Insurers | $40,000–$150,000/yr base + 8–15% rev-share on **new incremental premium only** | Data-licensing partnership | Benchmarked to niche actuarial/alt-data licensing deals ($50K–$250K/yr typical); never touches the existing book |
| Tier 5 — League (NRHL/Big Ice pilot) | League/facility operators | $1,000–$5,000/season | Platform enrollment | No competitor to price against; strategic/category-definition pricing, not a revenue driver |

> **Open item flagged by the technical-critic (Section 7):** this tier was originally labeled "NRHL" rather than "League" in the working model — renamed here to avoid conflating a specific design-partner prospect with the product tier itself. NRHL is the pilot design partner for the League edition, not its namesake.

**⚠️ Known gap, not yet fixed in this model:** the **Data Void Audit ($2,000–$5,000, one-time)** — the actual first paid product in the offer ladder (Section 3) and the entire near-term revenue engine per the operational runbook (Section 10) — does not appear as its own line item here with CAC/conversion math. See Section 11 for why this needs to be resolved before the Year 1 revenue target is treated as derived rather than asserted.

### Unit Economics (CAC = loaded relationship-sales cost, not paid-acquisition CAC)

| Tier | CAC (loaded) | ARPU | Avg. Lifetime | Gross Margin | LTV (contribution) | Payback Period |
|---|---|---|---|---|---|---|
| Academy/Club | $500–$1,500 (mid $1,000) | $4,000/yr | 3 yrs | 65% | ~$7,800 | ~4.6 months |
| Agent/Agency | $1,000–$3,000 (mid $2,000) | $1,750/yr | 2 yrs | 65% | ~$2,275 | **~21 months ⚠️** |
| Federation | $8,000–$20,000 (mid $14,000) | $50,000/yr | 4 yrs | 70% | ~$140,000 | ~4.8 months |
| Insurer | $15,000–$35,000 (mid $25,000) | $95,000/yr | 3 yrs | 70% | ~$199,500 | ~4.5 months |
| League | $300–$1,000 (mid $650) | $3,000/season | 3 seasons | 45% | ~$4,050 | ~5.9 months |

**⚠️ Open decision, not yet made (flagged by technical-critic, Section 7):** the Agent/Agency tier has structurally weak unit economics (~21-month CAC payback) under the flat per-profile model. The original recommendation was to reposition toward a **1–2% valuation-uplift success fee** stacked on top of the agent's own commission, rather than a flat SaaS fee. **This recommendation was never adopted downstream** — the positioning framework (Section 3), video script (Section 6), and email copy (Section 7) still reference the flat-fee framing in places. This needs to be decided by the founder before real agency outbound begins (see Section 10, Week 5-6, Step 19).

### Success-Fee / Revenue-Share Model Math

**Solidarity Payment Recovery (Academy Tier):** FIFA Article 21/Annex 5 — solidarity contribution = 5% of transfer fee, distributed pro-rata across ages 12–23 (0.25%/yr ages 12–15; 0.5%/yr ages 16–23). Proposed success fee: **20% of recovered amount**, contingency-based (benchmarked to collections/recovery-services norms of 15–30%).

*⚠️ Precondition, added per technical-critic finding (Section 7): this mechanism only triggers on an **international** transfer occurring **during contract** — it is legally distinct from training compensation (Article 20/Annex 4), which uses club-category benchmarks rather than a flat percentage. This precondition must be stated explicitly everywhere the worked example below is used.*

**Worked example — modal/typical case (this is the number that should anchor all Year 1–2 messaging — always illustrative/hypothetical, never a completed real transaction):**
- Transfer fee: $500,000 (international, mid-contract)
- Solidarity pool (5%): $25,000
- Academy registration ages 15–17 (3 yrs): 0.25% + 0.5% + 0.5% = 1.25% of transfer fee = **$6,250 recoverable**
- Athlytica success fee (20%): **$1,250**
- Net to academy: **$5,000**

*(Verified arithmetically correct: 1.25% × $500,000 = $6,250; 20% × $6,250 = $1,250; $6,250 − $1,250 = $5,000.)*

**Worked example — headline case (proof-of-category marketing anchor ONLY, never a base-rate assumption):** an $8,000,000 transfer with a 5-year (ages 14–18) registration span yields a $160,000 solidarity claim, a $32,000 Athlytica fee, and a $128,000 net to the academy.

**Insurance Premium Unlock (Insurer Tier):** base license ($40K–$150K/yr) + 8–15% rev-share on new premium volume only. Worked example: $2,000,000 in new premium enabled by Athlytica risk data → 10% rev-share → $200,000 in Year 1, on top of the base license fee.

### Conversion Funnel Modeling

Funnel: Schema Download (institutional email) → Paid Data Void Audit → Athlytica Core Enrollment. Benchmark class: enterprise infrastructure / gated-technical-content B2B funnels, not consumer/ad funnels.

| Stage | Conversion Rate | Reasoning |
|---|---|---|
| Institutional download → Qualified inquiry | 5–8% | Institutional-domain gate = firmographic filter, above generic unfiltered OSS-download rates (1–3%) |
| Qualified inquiry → Paid consult booked | 25–40% | Matches boutique B2B/technical-consulting discovery-call-to-paid-engagement benchmarks |
| Paid consult → Enterprise enrollment | 30–50% | Matches paid-pilot/audit-to-full-contract conversion in enterprise software/consulting |

**⚠️ Precision flag from technical-critic (Section 7):** multiplying the stated bands gives a range of **0.375%–1.6%**, a 4.3x spread — the previously reported single-point "~0.7%" blended estimate collapses this into false precision. Treat the honest range as **0.4%–1.6%, blended base case ~0.8–1.0%**, and recompute Year 1–3 targets at the low end before presenting them externally.

### Staged Monetization Targets (Projection Framework, Not Traction)

| Period | Focus | Revenue Target | Composition |
|---|---|---|---|
| Year 1 | Validate pricing, build 2–3 reference cases | $15,000–$40,000 | Handful of paid Data Void Audits ($2K–$5K each) + 1–2 League enrollments + possibly 1 academy pilot |
| Year 2 | Early traction, first success-fee proof point | $150,000–$350,000 | 10–15 academy/club enrollments, 1–2 agent relationships, 1–2 modal-case solidarity recoveries, first federation conversation opened |
| Year 3 | Enterprise-tier proof, scaling base | $600,000–$1,200,000 | Academy base to ~30–50, agent tier restructured toward success-fee model, first federation contract, first insurer data-license |

**⚠️ Not yet derived bottom-up** (flagged by technical-critic) — these bands are asserted, not built from downloads × conversion × deal size in a way that's independently checkable. See Section 11.

---

# 3. UNIFIED B2B POSITIONING FRAMEWORK

### Master Positioning Statement / Category Definition

**Category owned: Verifiable Athlete Infrastructure (VAI)** — not "sports analytics." Athlytica creates and owns the taxonomy and provenance layer that sits *beneath* video/wearable tools (Wyscout, InStat, Hudl, Catapult) and *feeds into* the financial/regulatory systems that actually move money and eligibility decisions: the FIFA Clearing House, federation grant compliance, and insurance underwriting.

**Category explainer (reuse verbatim across all downstream content):** *"What KYC did for finance, Athlytica does for sport."*

**Master tagline (verbatim, unaltered across all assets):** *"We eliminate data voids."*

**Master positioning statement:**
> "We help emerging-market sports institutions — academies, agencies, federations, insurers, and non-traditional league operators — achieve verifiable, monetizable athlete data assets (provable age, provable performance history, provable valuation, provable risk) without the manual tracking chaos, disputed bone-age scans, leaking solidarity payments, and unqueryable results archives that plague grassroots-to-professional pipelines, by deploying the Athlytica Scouting Passport — an open-source, multi-sport athlete data taxonomy that plugs beneath existing scouting/tracking tools and feeds directly into FIFA Clearing House claims, federation grant compliance, and insurance underwriting."

### Segment-Specific Value Propositions

**Academy Directors:** "We help West and Central African football academies achieve court-proof age verification and full recovery of forfeited FIFA Article 21 solidarity payments, without manual tracking chaos, CAF/FIFA bone-age dispute exposure, and years of unclaimed training-compensation money, by deploying the Athlytica Scouting Passport." *Mechanism: Tier 1 SaaS + 20% contingency solidarity-recovery fee, anchored on the $500K→$5,000-net modal case.*

**Agents/Agencies:** "We help agents and agencies achieve defensible, timestamp-verified valuation leverage, without losing negotiating position to data-equipped European buying clubs or losing first-contact claims to rival scouts, by deploying a verifiable Scouting Passport record — monetized only through a success fee stacked on top of your existing commission, never competing with it." *Note: pricing mechanism per this segment is one of the open decisions in Section 11.*

**Federations:** "We help national federations achieve demonstrable data-governance compliance required to secure and renew FIFA Forward Programme and Olympic Solidarity funding tranches, without building or procuring costly bespoke IT systems, by deploying the Athlytica multi-sport taxonomy as a single line item against your existing grant budget."

**Insurers/Underwriters:** "We help insurers and underwriters achieve a priceable, defensible actuarial baseline for developmental-athlete catastrophic injury and career insurance products, without guessing at risk in markets with zero historical claims data, by deploying the Athlytica performance-and-injury-history taxonomy — licensed against new incremental premium volume only, never your existing book."

**League Operators (NRHL/Big Ice design partner):** "We help inline and non-traditional-market ice hockey league operators achieve the first standardized, league-wide athlete tracking infrastructure in their sport's history, without stitching together spreadsheets, coach notes, and disconnected local scoring systems, by deploying the Athlytica multi-sport taxonomy as the de facto data standard for the league — before any competitor defines the category."

### The Offer Stack

1. **Athlytica Scouting Passport Schema** (Free, Open-Source Release) — institutional-email gated. Positioning: not a lead-magnet gimmick, it's the direct answer to documented distrust of foreign platforms extracting athlete data without local control. "You keep the schema, you keep the data, you keep control" *(see Section 5 for the exact legally-qualified version of this claim — the bare version is not compliance-safe).*
2. **The Data Void Audit** ($2,000–$5,000, one-time, paid) — a diagnostic, not a sales call. Deliverable: a quantified, institution-specific dollar figure (unclaimed solidarity payments, grant-compliance exposure, unpriced-book exposure). Paid, not free, because a free audit invites scope-creep and fails to filter serious buyers.
3. **Athlytica Core** (Recurring Enterprise Enrollment) — segment-differentiated: Academy Edition (budget-recovery framing), Federation Edition (grant-compliance framing), Agency Edition (valuation-intelligence framing), Insurer Edition (actuarial-incremental-value framing), League Edition (category-definition framing).

**Sequencing logic:** free schema builds category authority and trust → paid audit converts trust into a quantified, buyer-specific ROI case → enrollment is the obvious next step because the buyer has already seen their own number.

### Objection Handling (Summary — full detail preserved in agent working notes)

- *"We can't afford another SaaS tool"* (Academy) → Pricing sits 90–95% below Catapult's hardware capex; the solidarity fee is pure contingency.
- *"We tried a foreign platform before and they took our data"* (Academy/Federation) → Schema is open-source; institution retains ownership and control.
- *"Why not just use Wyscout/InStat?"* (all segments) → Those are video-first tools for funded pro/collegiate budgets; Athlytica sits beneath them as the verification layer, complementary not competitive.
- *"There's no track record — too risky to underwrite against"* (Insurer) → That absence is precisely the void being closed; the insurer pays nothing against the existing book, only shares upside on volume the data itself unlocks.
- *"No one else tracks this, why start now?"* (League) → That's the point — category-definition pricing lets you own "we were first" before a better-funded vendor defines the standard for you later.

### Positioning Assets (Required for Downstream Consistency)

- **Category name:** Verifiable Athlete Infrastructure (VAI)
- **Category explainer:** "What KYC did for finance, Athlytica does for sport."
- **Master tagline:** "We eliminate data voids."
- **Offer stage names:** Athlytica Scouting Passport Schema (free) → The Data Void Audit ($2K–$5K) → Athlytica Core (recurring, segment editions)
- **Anchor proof point for financial claims:** $500K transfer → $6,250 recoverable solidarity → $1,250 Athlytica fee → $5,000 net to academy (always illustrative, always with the international/mid-contract precondition stated)
- **Hard rule for all downstream content:** pre-revenue/early-stage status — no existing-customer or completed-deal claims may appear anywhere.

---

# 4. ATHLYTICA SCOUTING PASSPORT SCHEMA (Production Artifact)

**Artifact type:** Open-source top-of-funnel schema (institutional-email-gated download). **This IS the product** — the literal deliverable buyers download.

**⚠️ Deployment status (see Section 8/9): this schema exists as a designed specification below. It has not yet been saved to disk as real files, has not been committed to any git repository, and is not hosted anywhere. It is not currently downloadable by anyone.**

### 4.1 JSON Schema (2020-12) — `passport.schema.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://schema.athlytica.io/scouting-passport/v1.0.0/passport.schema.json",
  "title": "Athlytica Scouting Passport",
  "description": "Verifiable Athlete Infrastructure (VAI) canonical record. Sport-agnostic core; sport-specific data enters via the extensible metrics plugin point (see SportProfile.metrics), not via schema forks.",
  "type": "object",
  "required": ["passport_id", "schema_version", "athlete", "audit_trail"],
  "additionalProperties": false,
  "properties": {
    "passport_id": { "type": "string", "format": "uuid", "description": "Primary portable athlete identifier. Immutable." },
    "schema_version": { "type": "string", "const": "1.0.0" },
    "issued_by": { "type": "string", "description": "Org (club/federation/Athlytica) that instantiated this passport export." },
    "issued_at": { "type": "string", "format": "date-time" },
    "athlete": { "$ref": "#/$defs/Athlete" },
    "sport_profiles": {
      "type": "array",
      "description": "One entry per sport the athlete competes in. Sole extensibility surface for adding new sports (e.g. NRHL inline hockey) without modifying core schema.",
      "items": { "$ref": "#/$defs/SportProfile" },
      "minItems": 0
    },
    "biometric_records": {
      "type": "array",
      "description": "Longitudinal growth-curve series. USE CASE: CAF/FIFA bone-age dispute defense requires a continuous series from age ~10-11 onward. PII/SENSITIVE: minor biometric/medical-adjacent data, flagged for DPA special-category review.",
      "items": { "$ref": "#/$defs/BiometricRecord" }
    },
    "custody_history": {
      "type": "array",
      "description": "Club/federation registration history by age-band. USE CASE: direct input to FIFA Article 21 / Annex 5 solidarity claims.",
      "items": { "$ref": "#/$defs/CustodyRecord" }
    },
    "performance_records": {
      "type": "array",
      "description": "Meet/match-level results, queryable at metric granularity. USE CASE: standardizes fragmented PDF result sheets for Caribbean sprint / East African distance running.",
      "items": { "$ref": "#/$defs/PerformanceRecord" }
    },
    "injury_medical_history": {
      "type": "array",
      "description": "USE CASE: insurer actuarial baseline for catastrophic injury/career insurance. PII/SENSITIVE: special-category medical data.",
      "items": { "$ref": "#/$defs/InjuryRecord" }
    },
    "representation_claims": {
      "type": "array",
      "description": "USE CASE: agent/agency defense of first-contact and representation claims.",
      "items": { "$ref": "#/$defs/RepresentationClaim" }
    },
    "audit_trail": {
      "type": "array",
      "description": "Append-only, hash-chained event log. Tamper-evidence mechanism — not immutability.",
      "items": { "$ref": "#/$defs/AuditEvent" },
      "minItems": 1
    }
  },
  "$defs": {
    "Provenance": {
      "type": "object",
      "description": "Attached at record level as a first-class concept. Every mutable record carries one.",
      "required": ["provenance_id", "data_source", "entered_by", "entered_at", "verification_status"],
      "properties": {
        "provenance_id": { "type": "string", "format": "uuid" },
        "data_source": { "type": "string", "enum": ["self_reported", "club_official", "federation_official", "independent_clinic", "agent_submission", "witness_attestation", "video_verified", "insurer_medical_exam", "government_id_registry"] },
        "entered_by": { "type": "object", "required": ["actor_id", "actor_role"], "properties": { "actor_id": { "type": "string", "format": "uuid" }, "actor_role": { "type": "string", "enum": ["club_admin", "federation_admin", "agent", "clinician", "athlete", "guardian", "athlytica_ops", "insurer_underwriter"] } } },
        "entered_at": { "type": "string", "format": "date-time" },
        "verified_by": { "type": ["object", "null"], "properties": { "verifier_id": { "type": "string", "format": "uuid" }, "verifier_org": { "type": "string" }, "verified_at": { "type": "string", "format": "date-time" } } },
        "verification_method": { "type": "string", "enum": ["document_check", "biometric_lab_cross_reference", "witness_corroboration", "federation_registry_match", "hash_anchor_confirmation", "government_id_check", "none"] },
        "verification_status": { "type": "string", "enum": ["unverified", "pending", "verified", "disputed", "revoked"], "description": "Downstream consumers should treat 'verified' as minimum admissible status for financial/legal claims." },
        "confidence_score": { "type": "number", "minimum": 0, "maximum": 1 },
        "source_document_hash": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$", "description": "SHA-256 of the underlying source document — tamper-evidence anchor, not the document itself." },
        "witness_ids": { "type": "array", "items": { "type": "string", "format": "uuid" } }
      }
    },
    "Athlete": {
      "type": "object",
      "required": ["athlete_id", "date_of_birth", "primary_sport_code", "provenance"],
      "properties": {
        "athlete_id": { "type": "string", "format": "uuid" },
        "legal_name": { "type": "string", "description": "PII: direct identifier. Encrypt at rest / mask in public schema samples." },
        "preferred_name": { "type": "string" },
        "date_of_birth": { "type": "string", "format": "date", "description": "PII: especially sensitive when athlete is a minor at record-creation (common case, ages 10-11 entry)." },
        "sex_at_birth": { "type": "string", "enum": ["male", "female", "intersex", "undisclosed"] },
        "nationalities": { "type": "array", "items": { "type": "string", "pattern": "^[A-Z]{3}$" } },
        "national_id_reference": { "type": ["string", "null"], "description": "PII/SENSITIVE: salted hash reference only, never raw national ID." },
        "guardian_contacts": {
          "type": "array",
          "description": "Required for minors under most youth-sport safeguarding/DPA parental-consent regimes.",
          "items": { "type": "object", "properties": { "guardian_id": { "type": "string", "format": "uuid" }, "relationship": { "type": "string", "enum": ["parent", "legal_guardian", "club_appointed_guardian"] }, "consent_on_file": { "type": "boolean" }, "consent_date": { "type": "string", "format": "date" } }, "required": ["guardian_id", "relationship", "consent_on_file"] }
        },
        "current_status": { "type": "string", "enum": ["active", "inactive", "retired", "suspended", "deceased"] },
        "primary_sport_code": { "type": "string", "pattern": "^[a-z0-9_]+$", "description": "References sport_taxonomy.sport_code — the extensibility hook that lets NRHL/ice-hockey and any future sport register without a schema version bump." },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "MetricValue": {
      "type": "object",
      "description": "Generic typed metric container — THE plugin mechanism for multi-sport extensibility.",
      "required": ["metric_code", "value", "unit", "measured_at"],
      "properties": {
        "metric_code": { "type": "string", "pattern": "^[a-z0-9_]+\\.[a-z0-9_]+$", "description": "Namespaced '{sport_code}.{metric_name}', e.g. 'ice_hockey.shot_speed_kmh'. Validated against metric_registry, not against this schema." },
        "value": { "type": "number" },
        "unit": { "type": "string" },
        "measured_at": { "type": "string", "format": "date-time" },
        "context": { "type": "string", "enum": ["in_competition", "combine_test", "training_session", "medical_exam"] },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "SportProfile": {
      "type": "object",
      "required": ["sport_code", "provenance"],
      "properties": {
        "sport_profile_id": { "type": "string", "format": "uuid" },
        "sport_code": { "type": "string", "pattern": "^[a-z0-9_]+$", "examples": ["football", "ice_hockey", "inline_hockey", "athletics_sprint", "athletics_distance"] },
        "discipline_code": { "type": ["string", "null"] },
        "role_position": { "type": "string" },
        "dominant_side": { "type": ["string", "null"], "enum": ["left", "right", "ambidextrous", null] },
        "metrics": { "type": "array", "items": { "$ref": "#/$defs/MetricValue" } },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "BiometricRecord": {
      "type": "object",
      "required": ["record_id", "measured_at", "age_at_measurement_years", "provenance"],
      "properties": {
        "record_id": { "type": "string", "format": "uuid" },
        "measured_at": { "type": "string", "format": "date" },
        "age_at_measurement_years": { "type": "number", "minimum": 0, "maximum": 60 },
        "height_cm": { "type": "number" },
        "weight_kg": { "type": "number" },
        "bone_age_estimate_years": { "type": ["number", "null"], "description": "A single value is weak evidence; the longitudinal array is the actual defense artifact." },
        "bone_age_method": { "type": ["string", "null"], "enum": ["greulich_pyle", "tw3", "tw2", "other", null] },
        "tanner_stage": { "type": ["integer", "null"], "minimum": 1, "maximum": 5, "description": "PII/SENSITIVE: pubertal-development marker. Highest-sensitivity field in the schema for minor athletes; must be access-scoped to medical/verification roles only. Never foreground as a marketing feature." },
        "measurement_method": { "type": "string", "enum": ["self_reported", "club_medical_staff", "independent_clinic", "federation_medical_panel"] },
        "examiner_id": { "type": ["string", "null"], "format": "uuid" },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "CustodyRecord": {
      "type": "object",
      "required": ["custody_id", "club_id", "registration_type", "start_date", "provenance"],
      "properties": {
        "custody_id": { "type": "string", "format": "uuid" },
        "club_id": { "type": "string", "format": "uuid" },
        "federation_id": { "type": ["string", "null"], "format": "uuid" },
        "registration_type": { "type": "string", "enum": ["first_registration", "amateur", "professional", "loan", "transfer_permanent", "transfer_temporary"] },
        "start_date": { "type": "string", "format": "date" },
        "end_date": { "type": ["string", "null"], "format": "date" },
        "age_band": { "type": ["string", "null"], "enum": ["under_12_ineligible", "12_15", "16_23", "over_23_ineligible", null], "description": "Directly determines FIFA Annex 5 solidarity rate — 0.25%/yr for 12_15, 0.5%/yr for 16_23. Computed server-side." },
        "is_training_club": { "type": "boolean", "description": "Annex 5 eligibility flag." },
        "transfer_id": { "type": ["string", "null"], "format": "uuid" },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "PerformanceRecord": {
      "type": "object",
      "required": ["record_id", "event_date", "sport_code", "metrics", "provenance"],
      "properties": {
        "record_id": { "type": "string", "format": "uuid" },
        "competition_event_id": { "type": ["string", "null"], "format": "uuid" },
        "competition_name": { "type": "string" },
        "competition_level": { "type": "string", "enum": ["club", "regional", "national", "continental", "international"] },
        "event_date": { "type": "string", "format": "date" },
        "sport_code": { "type": "string", "pattern": "^[a-z0-9_]+$" },
        "discipline_code": { "type": ["string", "null"] },
        "placement": { "type": ["integer", "null"] },
        "metrics": { "type": "array", "items": { "$ref": "#/$defs/MetricValue" } },
        "video_evidence_hash": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "InjuryRecord": {
      "type": "object",
      "required": ["record_id", "injury_date", "severity", "provenance"],
      "properties": {
        "record_id": { "type": "string", "format": "uuid" },
        "injury_date": { "type": "string", "format": "date" },
        "injury_type": { "type": "string" },
        "icd10_code": { "type": ["string", "null"] },
        "body_region": { "type": "string" },
        "severity": { "type": "string", "enum": ["minor", "moderate", "severe", "career_threatening"] },
        "mechanism": { "type": ["string", "null"] },
        "days_lost": { "type": ["integer", "null"] },
        "return_to_play_date": { "type": ["string", "null"], "format": "date" },
        "recurrence_flag": { "type": "boolean" },
        "treating_clinician_id": { "type": ["string", "null"], "format": "uuid" },
        "workload_context": { "type": "object", "properties": { "training_hours_last_4wk": { "type": "number" }, "match_count_last_90d": { "type": "integer" } } },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "RepresentationClaim": {
      "type": "object",
      "required": ["claim_id", "agent_id", "claim_type", "claimed_at", "provenance"],
      "properties": {
        "claim_id": { "type": "string", "format": "uuid" },
        "agent_id": { "type": "string", "format": "uuid" },
        "agency_id": { "type": ["string", "null"], "format": "uuid" },
        "claim_type": { "type": "string", "enum": ["first_contact", "representation_agreement", "negotiation_mandate", "termination"] },
        "claimed_at": { "type": "string", "format": "date-time", "description": "Timestamp is the entire evidentiary value — defends priority against a rival agent's competing claim." },
        "effective_from": { "type": ["string", "null"], "format": "date" },
        "effective_to": { "type": ["string", "null"], "format": "date" },
        "contract_reference_hash": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$", "description": "Hash of underlying contract; raw contract stored off-schema." },
        "dispute_status": { "type": "string", "enum": ["none", "contested", "resolved_upheld", "resolved_overturned"] },
        "provenance": { "$ref": "#/$defs/Provenance" }
      }
    },
    "AuditEvent": {
      "type": "object",
      "description": "Hash-chained append-only ledger entry. event_hash = SHA256(prev_event_hash || canonical_json(event_payload)).",
      "required": ["event_id", "event_type", "actor_id", "occurred_at", "record_type", "record_id", "prev_event_hash", "event_hash"],
      "properties": {
        "event_id": { "type": "string", "format": "uuid" },
        "event_type": { "type": "string", "enum": ["record_created", "record_updated", "record_verified", "record_disputed", "record_revoked"] },
        "actor_id": { "type": "string", "format": "uuid" },
        "occurred_at": { "type": "string", "format": "date-time" },
        "record_type": { "type": "string", "enum": ["athlete", "sport_profile", "biometric_record", "custody_record", "performance_record", "injury_record", "representation_claim"] },
        "record_id": { "type": "string", "format": "uuid" },
        "prev_event_hash": { "type": ["string", "null"], "pattern": "^[a-f0-9]{64}$" },
        "event_hash": { "type": "string", "pattern": "^[a-f0-9]{64}$" }
      }
    }
  }
}
```

### 4.2 PostgreSQL Relational Backing — `athlytica_passport_schema.sql`

```sql
-- =====================================================================
-- ATHLYTICA SCOUTING PASSPORT — RELATIONAL BACKING (PostgreSQL 15+)
-- Backs Academy / Federation / Insurer / League enterprise tiers.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid(); required before any table/trigger below

-- ENUM TYPES
CREATE TYPE verification_status AS ENUM ('unverified','pending','verified','disputed','revoked');
CREATE TYPE data_source_type AS ENUM (
  'self_reported','club_official','federation_official','independent_clinic',
  'agent_submission','witness_attestation','video_verified',
  'insurer_medical_exam','government_id_registry'
);
CREATE TYPE verification_method_type AS ENUM (
  'document_check','biometric_lab_cross_reference','witness_corroboration',
  'federation_registry_match','hash_anchor_confirmation','government_id_check','none'
);
CREATE TYPE actor_role_type AS ENUM (
  'club_admin','federation_admin','agent','clinician','athlete',
  'guardian','athlytica_ops','insurer_underwriter'
);
CREATE TYPE registration_type_enum AS ENUM (
  'first_registration','amateur','professional','loan','transfer_permanent','transfer_temporary'
);
CREATE TYPE age_band_enum AS ENUM ('under_12_ineligible','12_15','16_23','over_23_ineligible');
CREATE TYPE injury_severity_enum AS ENUM ('minor','moderate','severe','career_threatening');
CREATE TYPE claim_type_enum AS ENUM ('first_contact','representation_agreement','negotiation_mandate','termination');
CREATE TYPE dispute_status_enum AS ENUM ('none','contested','resolved_upheld','resolved_overturned');
CREATE TYPE bone_age_method_enum AS ENUM ('greulich_pyle','tw3','tw2','other');

-- PROVENANCE (shared, referenced by FK from every domain table)
CREATE TABLE provenance (
  provenance_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source             data_source_type NOT NULL,
  entered_by_actor_id     UUID NOT NULL,
  entered_by_actor_role   actor_role_type NOT NULL,
  entered_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_by_actor_id    UUID,
  verified_by_org         TEXT,
  verified_at             TIMESTAMPTZ,
  verification_method     verification_method_type NOT NULL DEFAULT 'none',
  verification_status     verification_status NOT NULL DEFAULT 'unverified',
  confidence_score        NUMERIC(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  source_document_hash    CHAR(64),
  witness_ids             UUID[] DEFAULT '{}'
);
CREATE INDEX idx_provenance_status ON provenance (verification_status);

-- TAXONOMY / EXTENSIBILITY BACKBONE
-- Adding a new sport (e.g. NRHL inline hockey) = INSERT rows here. No DDL change, no JSON Schema version bump.
CREATE TABLE sport_taxonomy (
  sport_code       TEXT PRIMARY KEY,
  display_name     TEXT NOT NULL,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE discipline_taxonomy (
  discipline_code  TEXT NOT NULL,
  sport_code       TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  display_name     TEXT NOT NULL,
  PRIMARY KEY (sport_code, discipline_code)
);

CREATE TABLE metric_registry (
  metric_code      TEXT PRIMARY KEY,
  sport_code       TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  discipline_code  TEXT,
  display_name     TEXT NOT NULL,
  unit             TEXT NOT NULL,
  data_type        TEXT NOT NULL DEFAULT 'numeric' CHECK (data_type IN ('numeric','integer','boolean','text')),
  is_active        BOOLEAN NOT NULL DEFAULT true,
  registered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_discipline FOREIGN KEY (sport_code, discipline_code)
    REFERENCES discipline_taxonomy(sport_code, discipline_code) DEFERRABLE INITIALLY DEFERRED
);
-- metric_code values are validated against this registry at ingestion time, not against a hard JSON Schema enum.

-- ORG ENTITIES
CREATE TABLE federation (
  federation_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  country_code     CHAR(3),
  sport_code       TEXT REFERENCES sport_taxonomy(sport_code)
);

CREATE TABLE club (
  club_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  federation_id    UUID REFERENCES federation(federation_id),
  country_code     CHAR(3),
  is_training_club BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE agency (
  agency_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  fifa_licence_ref TEXT
);

CREATE TABLE agent (
  agent_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id        UUID REFERENCES agency(agency_id),
  legal_name       TEXT NOT NULL,
  fifa_licence_ref TEXT
);

-- ATHLETE CORE (PII-dense — see Section 5 compliance flags)
CREATE TABLE athlete (
  athlete_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name             TEXT NOT NULL,
  preferred_name         TEXT,
  date_of_birth          DATE NOT NULL,
  sex_at_birth           TEXT CHECK (sex_at_birth IN ('male','female','intersex','undisclosed')),
  nationalities          CHAR(3)[] DEFAULT '{}',
  national_id_hash       CHAR(64),
  current_status         TEXT NOT NULL DEFAULT 'active'
                            CHECK (current_status IN ('active','inactive','retired','suspended','deceased')),
  primary_sport_code     TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  provenance_id          UUID NOT NULL REFERENCES provenance(provenance_id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_athlete_dob ON athlete (date_of_birth);
CREATE INDEX idx_athlete_sport ON athlete (primary_sport_code);

CREATE TABLE guardian_contact (
  guardian_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  legal_name       TEXT NOT NULL,
  relationship     TEXT NOT NULL CHECK (relationship IN ('parent','legal_guardian','club_appointed_guardian')),
  contact_info     TEXT,
  consent_on_file  BOOLEAN NOT NULL DEFAULT false,
  consent_date     DATE
  -- NOTE: expand per Section 5 consent architecture (consent_scope, consent_method, tanner_stage-specific
  -- consent, cross_border_transfer_consent, withdrawal tracking) before any real minor's data is stored.
);

-- SPORT PROFILE + METRIC VALUES (EAV pattern, driven by metric_registry)
CREATE TABLE sport_profile (
  sport_profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id       UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  sport_code       TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  discipline_code  TEXT,
  role_position    TEXT,
  dominant_side    TEXT CHECK (dominant_side IN ('left','right','ambidextrous')),
  provenance_id    UUID NOT NULL REFERENCES provenance(provenance_id),
  UNIQUE (athlete_id, sport_code, discipline_code)
);

CREATE TABLE metric_value (
  metric_value_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_profile_id UUID REFERENCES sport_profile(sport_profile_id) ON DELETE CASCADE,
  performance_record_id UUID,
  metric_code      TEXT NOT NULL REFERENCES metric_registry(metric_code),
  value_numeric    NUMERIC,
  value_text       TEXT,
  value_boolean    BOOLEAN,
  measured_at      TIMESTAMPTZ NOT NULL,
  context          TEXT CHECK (context IN ('in_competition','combine_test','training_session','medical_exam')),
  provenance_id    UUID NOT NULL REFERENCES provenance(provenance_id),
  CHECK (sport_profile_id IS NOT NULL OR performance_record_id IS NOT NULL)
);
CREATE INDEX idx_metric_value_code ON metric_value (metric_code, measured_at);

-- BIOMETRIC RECORDS (growth curve / bone-age dispute defense)
CREATE TABLE biometric_record (
  record_id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id                UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  measured_at                DATE NOT NULL,
  age_at_measurement_years   NUMERIC(4,2) NOT NULL,
  height_cm                  NUMERIC(5,2),
  weight_kg                  NUMERIC(5,2),
  bone_age_estimate_years    NUMERIC(4,2),
  bone_age_method            bone_age_method_enum,
  chronological_bone_age_delta NUMERIC(4,2)
    GENERATED ALWAYS AS (age_at_measurement_years - bone_age_estimate_years) STORED,
  tanner_stage                SMALLINT CHECK (tanner_stage BETWEEN 1 AND 5),  -- SENSITIVE: field-level access control required, not just table-level RLS
  measurement_method          TEXT NOT NULL CHECK (measurement_method IN
    ('self_reported','club_medical_staff','independent_clinic','federation_medical_panel')),
  examiner_id                 UUID,
  provenance_id                UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_biometric_athlete_date ON biometric_record (athlete_id, measured_at);

CREATE VIEW bone_age_dispute_evidence AS
SELECT b.athlete_id, a.legal_name, a.date_of_birth, b.measured_at, b.age_at_measurement_years,
       b.bone_age_estimate_years, b.bone_age_method, b.chronological_bone_age_delta,
       p.verification_status, p.verification_method
FROM biometric_record b
JOIN athlete a ON a.athlete_id = b.athlete_id
JOIN provenance p ON p.provenance_id = b.provenance_id
WHERE p.verification_status = 'verified'
ORDER BY b.athlete_id, b.measured_at;

-- CUSTODY / REGISTRATION HISTORY (FIFA Article 21 / Annex 5 solidarity)
CREATE TABLE transfer_event (
  transfer_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id           UUID NOT NULL REFERENCES athlete(athlete_id),
  transfer_date         DATE NOT NULL,
  transfer_fee_amount   NUMERIC(14,2),
  transfer_fee_currency CHAR(3) DEFAULT 'USD',
  transferring_club_id  UUID REFERENCES club(club_id),
  receiving_club_id     UUID REFERENCES club(club_id),
  provenance_id          UUID NOT NULL REFERENCES provenance(provenance_id)
);

CREATE TABLE custody_record (
  custody_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id            UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  club_id                UUID NOT NULL REFERENCES club(club_id),
  federation_id           UUID REFERENCES federation(federation_id),
  registration_type       registration_type_enum NOT NULL,
  start_date               DATE NOT NULL,
  end_date                 DATE,
  age_at_start_years       NUMERIC(4,2),
  age_band                 age_band_enum,
  is_training_club_flag    BOOLEAN NOT NULL DEFAULT false,
  transfer_id               UUID REFERENCES transfer_event(transfer_id),
  provenance_id              UUID NOT NULL REFERENCES provenance(provenance_id),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX idx_custody_athlete ON custody_record (athlete_id, start_date);

CREATE OR REPLACE FUNCTION trg_custody_age_band() RETURNS TRIGGER AS $$
DECLARE
  dob DATE;
  age_years NUMERIC;
BEGIN
  SELECT date_of_birth INTO dob FROM athlete WHERE athlete_id = NEW.athlete_id;
  age_years := EXTRACT(YEAR FROM AGE(NEW.start_date, dob))
             + EXTRACT(MONTH FROM AGE(NEW.start_date, dob)) / 12.0;
  NEW.age_at_start_years := ROUND(age_years, 2);
  NEW.age_band := CASE
    WHEN age_years < 12 THEN 'under_12_ineligible'
    WHEN age_years >= 12 AND age_years < 16 THEN '12_15'
    WHEN age_years >= 16 AND age_years <= 23 THEN '16_23'
    ELSE 'over_23_ineligible'
  END::age_band_enum;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custody_age_band_trigger
  BEFORE INSERT OR UPDATE ON custody_record
  FOR EACH ROW EXECUTE FUNCTION trg_custody_age_band();

-- Rate: 0.25%/yr in age_band '12_15', 0.5%/yr in age_band '16_23'.
CREATE VIEW solidarity_claim_input AS
SELECT c.athlete_id, c.club_id, cl.name AS club_name, cl.is_training_club, c.age_band,
       c.start_date, c.end_date,
       GREATEST(0, LEAST(COALESCE(c.end_date, CURRENT_DATE), t.transfer_date) - c.start_date) / 365.25 AS years_in_band,
       CASE c.age_band WHEN '12_15' THEN 0.0025 WHEN '16_23' THEN 0.0050 ELSE 0 END AS annual_rate,
       t.transfer_id, t.transfer_fee_amount, t.transfer_fee_currency, p.verification_status
FROM custody_record c
JOIN club cl ON cl.club_id = c.club_id
JOIN transfer_event t ON t.transfer_id = c.transfer_id
JOIN provenance p ON p.provenance_id = c.provenance_id
WHERE c.is_training_club_flag = true AND c.age_band IN ('12_15','16_23');

-- PERFORMANCE / RESULTS (queryable meet data)
CREATE TABLE competition_event (
  competition_event_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  competition_level       TEXT CHECK (competition_level IN ('club','regional','national','continental','international')),
  sport_code               TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  event_date                DATE NOT NULL,
  location_country_code     CHAR(3)
);

CREATE TABLE performance_record (
  performance_record_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  competition_event_id     UUID REFERENCES competition_event(competition_event_id),
  sport_code                TEXT NOT NULL REFERENCES sport_taxonomy(sport_code),
  discipline_code            TEXT,
  placement                  INTEGER,
  video_evidence_hash         CHAR(64),
  provenance_id                 UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_perf_athlete ON performance_record (athlete_id);

ALTER TABLE metric_value
  ADD CONSTRAINT fk_metric_value_perf
  FOREIGN KEY (performance_record_id) REFERENCES performance_record(performance_record_id) ON DELETE CASCADE;

-- INJURY / MEDICAL HISTORY (insurer actuarial baseline)
CREATE TABLE injury_record (
  injury_record_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id             UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  injury_date              DATE NOT NULL,
  injury_type                TEXT,
  icd10_code                  TEXT,
  body_region                  TEXT,
  severity                      injury_severity_enum NOT NULL,
  mechanism                      TEXT,
  days_lost                       INTEGER,
  return_to_play_date              DATE,
  recurrence_flag                   BOOLEAN NOT NULL DEFAULT false,
  treating_clinician_id               UUID,
  training_hours_last_4wk              NUMERIC(5,2),
  match_count_last_90d                  INTEGER,
  provenance_id                          UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_injury_athlete ON injury_record (athlete_id, injury_date);

CREATE VIEW actuarial_injury_exposure_summary AS
SELECT a.athlete_id, a.primary_sport_code, a.date_of_birth,
       COUNT(i.injury_record_id) AS total_injuries,
       SUM(CASE WHEN i.severity IN ('severe','career_threatening') THEN 1 ELSE 0 END) AS severe_or_worse_count,
       SUM(i.days_lost) AS total_days_lost,
       AVG(i.training_hours_last_4wk) AS avg_recent_training_load,
       MAX(i.injury_date) AS most_recent_injury_date
FROM athlete a
LEFT JOIN injury_record i ON i.athlete_id = a.athlete_id
GROUP BY a.athlete_id, a.primary_sport_code, a.date_of_birth;

-- REPRESENTATION / AGENT CLAIMS
CREATE TABLE representation_claim (
  claim_id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id               UUID NOT NULL REFERENCES athlete(athlete_id) ON DELETE CASCADE,
  agent_id                   UUID NOT NULL REFERENCES agent(agent_id),
  agency_id                    UUID REFERENCES agency(agency_id),
  claim_type                     claim_type_enum NOT NULL,
  claimed_at                       TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_from                     DATE,
  effective_to                        DATE,
  contract_reference_hash              CHAR(64),
  dispute_status                        dispute_status_enum NOT NULL DEFAULT 'none',
  provenance_id                          UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_representation_athlete_time ON representation_claim (athlete_id, claimed_at);

-- AUDIT LOG (append-only, hash-chained — tamper-evidence backbone; must be created LAST, after all
-- tables it can reference via record_type/record_id)
CREATE TABLE audit_log (
  event_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type            TEXT NOT NULL CHECK (event_type IN
    ('record_created','record_updated','record_verified','record_disputed','record_revoked')),
  actor_id                UUID NOT NULL,
  occurred_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  record_type                 TEXT NOT NULL,
  record_id                     UUID NOT NULL,
  prev_event_hash                 CHAR(64),
  event_hash                        CHAR(64) NOT NULL,
  payload_snapshot                    JSONB
);
CREATE INDEX idx_audit_record ON audit_log (record_type, record_id, occurred_at);
-- No UPDATE/DELETE grants issued on this table in production roles; INSERT-only (must be enforced via
-- REVOKE or a blocking trigger — see Section 9 structural readiness note).
-- event_hash = sha256(prev_event_hash || canonical_json(payload_snapshot)) computed at application layer.
```

### 4.3 Field-to-Downstream-System Mapping

| Downstream System | Schema Fields | Notes |
|---|---|---|
| FIFA Article 21/Annex 5 solidarity claim | `custody_record.age_band/.age_at_start_years/.is_training_club_flag`, `transfer_event.transfer_fee_amount`, view `solidarity_claim_input` | `age_band` and `annual_rate` pre-computed so a claim engine only sums `years_in_band × annual_rate × transfer_fee_amount` |
| CAF/FIFA bone-age dispute resolution | `biometric_record.bone_age_estimate_years` (longitudinal), `.bone_age_method`, `.chronological_bone_age_delta`, view `bone_age_dispute_evidence` | Defense strength comes from series continuity from age ~10-11, not a single reading |
| Federation grant-compliance reporting | Aggregates across `athlete`, `sport_profile`, `custody_record`, `provenance.verification_status` | `verification_status='verified'` filter is the compliance-grade cut |
| Insurer actuarial baseline | `injury_record.*`, view `actuarial_injury_exposure_summary` | Exposure (workload) + outcome (injury) pairing makes this actuarially usable |
| Agent/agency claim defense | `representation_claim.claimed_at/.contract_reference_hash/.dispute_status`, `provenance.witness_ids` | Timestamp priority + hash-anchored reference + witness attestation = full evidentiary bundle |
| NRHL/hockey onboarding | `sport_taxonomy`, `discipline_taxonomy`, `metric_registry`, `sport_profile.metrics[]` | Zero core-schema change required |
| Caribbean sprint / East African distance | `performance_record`, `competition_event`, `metric_value` (namespace `athletics_sprint.*`/`athletics_distance.*`) | Converts PDF start-lists into queryable rows |

### 4.4 Extensibility Mechanism

New sport onboarding (e.g., NRHL inline hockey) requires **zero JSON Schema changes and zero DDL migration**:
1. `INSERT INTO sport_taxonomy (sport_code, display_name) VALUES ('inline_hockey', 'Inline Hockey (NRHL)');`
2. `INSERT INTO discipline_taxonomy (...)` for sub-disciplines.
3. `INSERT INTO metric_registry (...)` for each hockey-specific metric, e.g. `inline_hockey.shot_speed_kmh`.
4. Downstream ingestion validates `metric_code` against `metric_registry` at write-time.

Core schema stays sport-agnostic because metric containers are generic typed (`metric_code` + `value` + `unit`), never hardcoded per sport — the literal technical substance behind the "first-mover category-definition" claim to non-football verticals.

---

# 5. KENYA DPA COMPLIANCE & IP ISOLATION FRAMEWORK

*This is a structured compliance framework for internal decisions, not a substitute for sign-off by licensed Kenyan advocate counsel (DPA matters) and EU counsel where cross-border transfer to Europe is contemplated. Verify every cited section number against current gazetted text before it appears in a public compliance statement.*

### 5.1 Data Classification

`tanner_stage`, `bone_age_estimate_years`, and `injury_record.*` are **sensitive personal data** under Kenya DPA Section 2 (health-adjacent/biometric), and the data subjects are frequently children as young as ~10-11. This sits at the intersection of the two categories the DPA subjects to strictest processing conditions — the structural center of the product, not an edge case. `national_id_hash` remains **personal data** (pseudonymized, not anonymized — still re-identifiable, still in scope of the Act). The `audit_trail.entered_by`/`witness_ids` fields also contain personal data about scouts/verifiers/agents, an obligation frequently overlooked.

### 5.2 Lawful Basis (mapped per record type — a single blanket consent flag is insufficient)

- **Core identity:** consent (parental, for minors) or contractual necessity (club registration) — contractual necessity recommended as primary where a registration contract exists.
- **`guardian_contact`:** consent of the guardian as an independent data subject — cannot be inherited from the athlete's registration consent.
- **`tanner_stage`/`bone_age_estimate_years`:** explicit, specific, separately-captured consent — must not be bundled into a general checkbox.
- **`injury_record`:** split by consumer — club operational use (legitimate interest/contractual necessity) vs. insurer actuarial use (a separate contractual basis, requiring its own disclosure event).
- **`representation_claim`:** consent of both parties to the representation relationship.
- **`audit_trail.entered_by`:** legitimate interest — separate privacy notice obligation to the scout/verifier/agent themselves.

### 5.3 Children's Data (minors as young as ~10-11)

Requires: (1) verifiable parental/guardian consent, not just a checkbox; (2) best-interests-of-the-child consideration built into processing design (does the academy actually need `tanner_stage` at intake, or only at a specific decision stage — minimization-by-design is a best-interests argument, not just a Section 25 argument); (3) enhanced protection where sensitive-category + child-data compound, which `tanner_stage`/`bone_age_estimate_years` do.

### 5.4 Data Subject Rights vs. the Hash-Chained Audit Trail

**The tension:** DPA grants access/correction/deletion rights; a hash-chained, append-only audit trail resists mutation by design. **Resolution pattern:** separate the append-only ledger (hashes + provenance metadata only) from the mutable data store (raw personal data, encrypted). Rectification = correct the mutable record, generate a new hash, append a new provenance event (the old hash stays as historical proof-of-what-was-claimed-when). Erasure = **cryptographic tombstoning** — destroy the encryption key for that record; the hash pointer remains in the chain as an inert, non-reversible marker. This preserves tamper-evidence without retaining erased personal data, and must be disclosed to data subjects explicitly (itself a Section 25 fairness/transparency requirement). `verification_status: revoked` is a data-integrity/dispute state, distinct from an actual erasure fulfillment — keep the two concepts architecturally separate.

### 5.5 Cross-Border Data Transfer (DPA Section 48)

Directly triggered by Kenyan/Nigerian academies as data sources and European buying clubs/insurers/federations as recipients. Requires appropriate safeguards (contractual clauses recognized by the Data Commissioner), an adequacy determination, or specific informed consent to *that transfer*. Consent to collection ≠ consent to cross-border transfer — these must be captured as distinct events. This is a **two-sided** compliance question: a transfer from Kenya to a European club also engages EU GDPR on the receiving end (Kenya is a third country without an adequacy decision, so the European recipient needs its own GDPR Article 46 safeguard, typically SCCs). Athlytica should not represent itself as having solved this unilaterally. **Insurer data-licensing is the highest-risk transfer scenario** — most sensitive fields, most likely cross-jurisdiction, recurring commercial basis — and needs its own transfer impact assessment. **ODPC registration** (Kenya's Office of the Data Protection Commissioner) should be treated as pre-launch, not post-scale, given biometric/children's data is core to the business model.

### 5.6 IP Isolation Model — Three-Layer Boundary

- **Layer 1 — Schema (OPEN SOURCE, public repo):** JSON Schema, PostgreSQL DDL, field documentation, record-type taxonomy. The *shape* of verifiable athlete data, not any workflow implementation or populated data.
- **Layer 2 — Platform (PROPRIETARY, "Athlytica Core"):** verification workflow engine, matching/deduplication logic, actuarial/risk-scoring models, access-control implementation, UI/UX, multi-tenant hosting. None of this belongs in the OSS repo.
- **Layer 3 — Data (CUSTOMER-CONTROLLED, never open):** actual populated athlete records, governed entirely by contract.

**The "you keep the schema, you keep the data, you keep control" claim is legally coherent only if this boundary is contractually enforced, not just an architecture diagram.**

**License recommendation: Apache 2.0** for the schema+DDL (not CC-BY — no patent provision; not GPL/AGPL — copyleft would suppress the adoption behavior the funnel depends on). Apache 2.0's express patent grant matters specifically because Athlytica is inviting a category to form around its taxonomy. A separate `TRADEMARKS.md` carve-out is mandatory — the license does not grant rights to the "Athlytica Scouting Passport Schema" name or branding.

**What must never appear in the OSS repo, under any license:** real/populated athlete data, Layer 2 platform code, customer-specific extensions. Example payloads must be clearly synthetic (`SYN-` prefixed IDs, explicit disclaimer, ideally generated via a committed synthetic-data script).

### 5.7 Controller/Processor Structuring

**Default:** the enterprise customer (academy/federation/insurer) is **Data Controller** for data they input for their own purposes. Athlytica is **Data Processor** for the hosting/platform layer. **Exception:** Athlytica is likely a **joint controller** specifically for the verification/provenance layer and cross-customer portability (the actual value proposition — a verified record both a Kenyan academy and a Portuguese buying club rely on) — this should be acknowledged explicitly in contracts, not papered over as pure-processor framing.

**Contractual instruments needed:** Master Services Agreement (per edition) + Data Processing Agreement addendum (role, sub-processors, security measures, retention/deletion tied to crypto-shredding, audit rights, breach notification) + cross-border transfer clauses schedule + a **"no resale of underlying data" clause** (the specific mechanism that makes "you keep control" contractually true — insurer data-licensing must be structured as the controller authorizing a specific disclosure, with Athlytica facilitating as processor, not Athlytica independently monetizing customer data) + a contractual data export/portability guarantee.

### 5.8 Consent Architecture for Minors

Default: the **academy/club is Data Controller**; the guardian is consent-giver for the child and independent data subject for their own contact data; Athlytica is Data Processor (with the joint-controller carve-out above). Expand `guardian_contact` beyond `consent_on_file`/`consent_date` to include: `consent_scope` (per data category, not blanket), `consent_method`, `guardian_relationship_verified`, `guardian_id_verification_hash`, `consent_review_date` (sensitive-category consent on a developing child should not be a one-time permanent event), `consent_withdrawal_date`/`withdrawal_status` (distinct from `verification_status: revoked`), `cross_border_transfer_consent` (distinct scope, naming recipient class), and a separate **`tanner_stage_specific_consent`** given it's the single most sensitive field in the schema.

### 5.9 Prioritized Remediation Punch-List

**Gate A — before OSS schema publish:** (1) audit every OSS repo file for real athlete data, synthetic-only enforced and independently verified; (2) add Apache 2.0 LICENSE + TRADEMARKS.md; (3) add README describing the 3-layer IP boundary; (4) annotate `tanner_stage`/`injury_record`/`guardian_contact` inline with sensitivity flags so adopters inherit compliance context.

**Gate B — before any paying enterprise customer onboards:** (5) document/implement `national_id_hash` salting spec, reviewed by Kenyan counsel; (6) field-level access control + dedicated access-audit logging for `tanner_stage`; (7) expand `guardian_contact` per Section 5.8; (8) draft the Data Processing Agreement with cross-border clauses; (9) per-purpose lawful-basis tagging on `injury_record`; (10) confirm ODPC registration; (11) implement crypto-shredding/tombstone pattern for the audit trail before any real erasure request could occur.

**Gate C — before insurer/data-licensing revenue line goes live:** (12) insurer-specific transfer impact assessment and consent capture, separate from academy-level consent; (13) formal joint-controller acknowledgment in the Processing Agreement; (14) "no resale" clause finalized across all editions, data-export mechanism actually built and tested.

### 5.10 Compliance Guardrails for Marketing/Content (binding on Sections 6 and 7 below)

**CAN say:** "The Athlytica Scouting Passport Schema is open source"; "you can inspect, fork, and build on the schema under Apache 2.0"; "the schema contains no real athlete data — every example is synthetic" (only once independently verified true); "we don't sell your athlete data" (framed as a contractual commitment).

**CANNOT say / must qualify:**
- NOT "you keep control of your data" bare → *"Your organization stays in control of your athletes' data — we process it on your instructions and never resell it."*
- NOT "fully DPA-compliant"/"GDPR-compliant" as unqualified absolute claims → *"Built with Kenya's Data Protection Act 2019 as the reference framework. This is a design commitment, not a certification — compliance with your jurisdiction's laws (including GDPR where applicable) remains your organization's responsibility as data controller."*
- NOT "anonymized" for hashed fields — these are **pseudonymized**, not anonymized.
- Do NOT foreground `tanner_stage`/pubertal-development tracking as a headline feature, and never let a persuasive/value-prop section imply the product's bone-age/tanner_stage capture *is* the CAF-dispute solution being sold — that capability belongs only in the gated technical/data-dictionary section, already consent-framed.
- Do NOT call the audit trail "immutable"/"tamper-proof" unqualified → *"tamper-evident record-keeping, with full support for correction and deletion requests."*
- Do NOT claim to solve cross-border compliance unilaterally → *"Built with cross-border transfer safeguards — your legal team will still need to confirm requirements specific to your jurisdiction."*
- "KYC for sport" is a positioning analogy only, never implying regulatory endorsement.
- No existing-customer, completed-deal, or fabricated case-study claims anywhere (pre-revenue status) — this rule must hold in every email and every section of the video, not just a single disclaimer buried in the last email of a sequence.

---

# 6. VIDEO BLUEPRINT & RETENTION MAP

**Title (recommended primary):** *"The $6,250 Your Academy Never Claims (And the Schema That Fixes It)"* — with the "add a new sport via SQL" demo promise folded into the description/thumbnail.

*(Alternative options considered: "I Open-Sourced the Athlete Data Infrastructure African Academies Don't Have"; "Stop Losing Solidarity Payments to a Spreadsheet"; "Add a New Sport to a Scouting Database With One SQL Line"; "What KYC Did for Banking, This Schema Does for Youth Sport.")*

> **⚠️ Per Section 5.10 and the Section 8 technical-critic audit: every use of the $500K/$6,250 example in this script must be spoken with the "illustrative example, international transfer, mid-contract only" framing — not just the on-screen "ILLUSTRATIVE EXAMPLE" label. This precondition was flagged as missing and must be added to the spoken script before recording.**

### Minute-by-Minute Script Outline (0:00–15:00)

**0:00–0:30 — Cold Open.** No intro, no logo sting. *"A player your academy trained leaves at sixteen. Two years later he's transferred for half a million dollars. In an illustrative example — not a real case — FIFA's rules say a training academy in that situation would be owed $6,250 of that, automatically. Most academies in this pipeline never see a cent of it. Not because the rule doesn't apply. Because nobody built the system that tracks the paperwork it takes to prove it."* **On-screen:** split screen — broken spreadsheet vs. idle terminal.

**0:30–1:30 — Stakes/Audience.** Names academy directors, agents, federation administrators, insurers, NRHL/league operators directly. **On-screen:** category card, held 4 seconds: *"Verifiable Athlete Infrastructure — what KYC did for finance, we do for sport."*

**1:30–3:30 — Data Void Problem, Part 1 (bone-age disputes).** Factual, non-sensationalized framing of CAF/FIFA U-17 bone-age dispute patterns. **On-screen:** lower-third factual citation caption.

**3:30–5:00 — Data Void Problem, Part 2 (solidarity payments).** The $500K worked example, **with the international/mid-contract precondition stated aloud**, clearly labeled "ILLUSTRATIVE WORKED EXAMPLE — NOT AN ACTUAL COMPLETED TRANSACTION." **Pattern Interrupt #1 (~4:30):** camera-angle change, direct-to-camera: *"That $5,000 isn't the point. The point is it was already owed to them. The system just couldn't prove it."*

**5:00–5:45 — The Third Void (hockey/NRHL).** Sets up why the schema is multi-sport, not football-only.

**5:45–6:15 — Transition to Build.** *"Everything you're about to see is open source. Every example is synthetic — no real athlete's data is in this schema, anywhere."* **On-screen:** terminal, file tree (`schema.json`, `ddl.sql`, `seed_synthetic.sql`, `LICENSE`).

**6:15–8:00 — Live Demo Part 1: schema walkthrough.** Scroll through the JSON Schema, pause on `biometric_records` and `custody_history`. **Pattern Interrupt #2 (~7:30):** zoom on `national_id_hash`, on-screen caption: *"Pseudonymized — not anonymized. Reversible only under your organization's access controls."*

**8:00–9:15 — Live Demo Part 2: solidarity claim view.** Run `solidarity_claim_input` live against synthetic seed data (`SYN-` prefixed IDs). **⚠️ Per Section 8 audit: verify before recording that the synthetic seed data actually reproduces $6,250 on screen, or add an explicit script line decoupling the demo numbers from the cold-open example.**

**9:15–11:30 — Live Demo Part 3: the centerpiece.** Add inline hockey via 4 live SQL `INSERT`s into `sport_taxonomy`/`discipline_taxonomy`/`metric_registry`, then query it back immediately. *"That's it. That's the entire migration. No schema change, no downtime, no engineering ticket."* **Pattern Interrupt #3:** hold 3 seconds of silence on the query result before continuing.

**11:30–12:15 — Live Demo Part 4: audit trail.** *"Every write to this system lands in a hash-chained audit trail. That doesn't mean nothing can ever be corrected — organizations still have full rights to correction and deletion requests."* (Compliant phrasing per Section 5.10 — never "immutable"/"tamper-proof.")

**12:15–13:00 — Zoom Out.** *"This is the difference between an institution that can say 'trust us' and one that can say 'here's the query.' We eliminate data voids."*

**13:00–14:00 — Offer Reveal.** Three-card ladder: Free Schema Download → Data Void Audit ($2K–$5K range, never a fixed number) → Athlytica Core.

**14:00–14:45 — CTA** (exact script below).

**14:45–15:00 — Close.** Download link, low-key subscribe prompt.

### CTA Script (Exact Wording)

> "If you want the schema, the link is in the description. It's the Athlytica Scouting Passport Schema — open source, Apache 2.0 licensed, so you can inspect it, fork it, and build on it however you want. To download the full package, we ask for an institutional email — this is built for academies, agencies, federations, insurers, and league operators, not for casual browsing. We don't sell your data. Your organization stays in control of your athletes' data — we process it on your instructions and never resell it. Everything in the schema you just watched is synthetic; there's no real athlete information in this release. Download it, run it against your own records, and if you find you're sitting on a data void, that's exactly what a Data Void Audit is for."

### Retention Map (Drop-off Risk → Interrupt Tactic)

| Time | Risk | Tactic |
|---|---|---|
| 0:30–1:00 | High (generic intro skip zone) | Kept to 60s max, followed by bold text-card claim |
| 3:00–4:30 | **Highest single drop-off risk** — dense financial/legal explainer | Pattern Interrupt #1 — camera change + human reframe |
| 6:00–7:00 | Moderate — narrative-to-code transition | Cursor lands immediately on the tables that answer the two problems just raised |
| 8:30–9:00 | Moderate — SQL query can read as filler | Result columns labeled in plain English |
| 10:00–11:00 | Critical retention-*save* moment, not drop-off | Pattern Interrupt #3 — silence after the payoff |
| 12:00–13:00 | Moderate — offer-reveal fatigue | Offer shown as a visual ladder, not spoken ramble |

### Content-to-Conversion Handoff (Binding on Section 7)

1. Artifact name, exact: "Athlytica Scouting Passport Schema" — never renamed downstream.
2. License claim: inspection of the license/repo structure must NOT be gated — only the full packaged download is gated.
3. Synthetic-data claim must be visibly confirmed on the landing page (SYN- prefixes, disclaimer).
4. Gate justification ("institutional email... not casual browsing") → landing page form needs a role/org-type field, not a generic email box.
5. Privacy commitment — exact two-sentence structure required near the opt-in form.
6. Offer ladder — exactly 3 stages, in order; email sequence must not skip the Data Void Audit step.
7. Email 1 must open with one of the two specific proof points (the $6,250 mechanism or the zero-migration SQL demo), never a generic thank-you.
8. Compliance carry-forward: illustrative labeling, "pseudonymized" not "anonymized," "tamper-evident" not "immutable," no fabricated customers anywhere.

---

# 7. LANDING PAGE COPY & 5-STEP EMAIL NURTURE SEQUENCE

*Corrections applied per the Section 8 technical-critic audit are marked inline.*

## 7.1 Landing Page Copy

**HEADLINE:** The Athlytica Scouting Passport Schema — Open-source data infrastructure for verifiable athlete records, built for academies, agencies, federations, insurers, and league operators.

**SUBHEADLINE:** What KYC did for finance, Athlytica does for sport. This is the schema layer: fork it, inspect it, run it against your own data before you talk to us about anything else. **We eliminate data voids.**

**HERO CTA:** `Get the Full Schema Package →`

**Section — What This Is:** JSON Schema definitions, PostgreSQL DDL templates (zero-migration extension pattern for new sports), and a data dictionary mapping every field to its use case. References the same SQL demo and the $6,250-on-a-$500,000-transfer scenario shown in the walkthrough video — *("That transfer example is illustrative and hypothetical, based on an international transfer occurring during contract — it is not a real transaction or client outcome.")*

**Section — Open Source, By Design:** Apache 2.0. *"You do not need to give us an email address to inspect it."* `[View License & Repo Structure →]` (no form required). The gated form is for the complete packaged kit, not the code itself.

**Section — Synthetic Data, Every Time:** Every example record is synthetic, `SYN-` prefixed throughout. Hashed identity fields are **pseudonymized, not anonymized** — documented in the data dictionary. The audit trail is **tamper-evident** (hash-chained), not immutable — also documented.

**Section — Request the Full Package.** Form fields: Full Name, Institutional Email, Organization Name, Organization Type (Academy/Agency/Federation/Insurer/League Operator/Other), Role/Title, Country.

**Privacy commitment block (exact required wording, restored to the full compliant form — ✅ CORRECTED per Section 8 finding):**
> We don't sell your data. Your organization stays in control of your athletes' data — we process it on your instructions and never resell it.
>
> Built with Kenya's Data Protection Act 2019 as the reference framework. This is a design commitment, not a certification — compliance with your jurisdiction's laws (including GDPR where applicable) remains your organization's responsibility as data controller.

*(The previously drafted shortened version — "designed around Kenya's DPA 2019 and international data protection standards" — read as implying certified compliance-by-association and has been replaced with the full two-sentence, controller-responsibility-explicit form per Section 5.10's exact guardrail.)*

**Section — Why This Matters, By Role:** one paragraph each for Academy Directors, Agents/Agencies, Federations, Insurers, League Operators — each tied to the specific named fear from Section 3 (bone-age disputes/unclaimed solidarity, first-contact claim defense, FIFA Forward/Olympic Solidarity funding risk, unpriceable actuarial risk, category-definition urgency).

## 7.2 Five-Step Executive Nurture Sequence

Offer ladder discipline: Free Schema (E1) → Data Void Audit, $2,000–$5,000 range (introduced E2, explicit ask E3–E4) → Athlytica Core (teased only in E5, after the audit step is fully established).

---

**EMAIL 1 — Day 0**
**Subject (✅ CORRECTED per Section 8 finding):** ~~"The $6,250 that never got claimed"~~ → **"The 1.25% most academies never calculate"**

*(The original subject line asserted a specific unrecovered sum as if it were a completed, factual event — read in an inbox, isolated from the body's "illustrative" disclaimer, this is exactly the kind of unfounded specific-outcome claim a pre-revenue company cannot make. The corrected subject makes a claim about a rate/mechanism, not an implied real case.)*

Opens with the $6,250-on-a-$500K-transfer mechanism, explicitly hypothetical, explicitly noting it's an international/mid-contract transfer. Delivers the schema package. Suggests the reader try adding a second sport via the zero-migration SQL pattern as a first exercise. Apache 2.0, synthetic data only, `SYN-` prefixes throughout.

**EMAIL 2 — Day 3, "What your spreadsheet can't prove"**
Segment-specific blind-spot framing (academy bone-age/solidarity, agent first-contact defense, federation funding-compliance). Soft-introduces the Data Void Audit concept, no pricing yet.

**EMAIL 3 — Day 7, "'We already use Wyscout' — and why that's a different problem"**
Explicit Wyscout objection handling — positions Athlytica as the verifiable system-of-record layer beneath scouting/video tools, not a competitor to them. First explicit mention of Data Void Audit pricing ($2,000–$5,000 range). First direct CTA to book it.

**EMAIL 4 — Day 12, "Who else has access to your athletes' data right now?"**
Data-sovereignty/insurer-risk framing. Restates the exact required privacy commitment plus the corrected Kenya DPA qualifier (Section 7.1) plus the tamper-evident/not-immutable distinction. CTA to book the audit.

**EMAIL 5 — Day 18, "The corporate integration audit — last note in this series"**
Explicitly states pre-revenue status and "no fabricated case studies" directly. Defines the audit precisely (what it is / isn't). Introduces Athlytica Core only now, as the destination *after* the audit — never pitched ahead of it. Final CTA is to book the audit, not Core.

---

**Objection-handling coverage:** "Why not just use Wyscout" → Email 3. Data-sovereignty/trust → Email 4.

**⚠️ Open item flagged by Section 8, not yet actioned:** the "no fabricated case studies" discipline is explicit in Email 5 but was not independently verified across Emails 1–4's literal text for stray phrases like "our customers," "clients," or "results we've seen." Before this sequence is loaded into a real ESP, grep the final literal copy for exactly that list.

---

# 8. INDEPENDENT TECHNICAL CRITIQUE (Agent 8 Findings)

**Overall verdict from the independent audit: conditional pass, contingent on the fixes below.** The strategic architecture across Sections 1–4 is coherent and the FIFA solidarity math is genuinely sound — verified independently: 1.25% × $500,000 = $6,250; 20% × $6,250 = $1,250; $6,250 − $1,250 = $5,000. All arithmetically correct.

### Fixes already applied directly to Sections 6–7 above:
- ✅ E1 subject line corrected to remove the unverified-factual-claim phrasing.
- ✅ Landing page DPA/GDPR qualifier restored to the full two-sentence, non-overclaiming form.
- ✅ International-transfer/mid-contract precondition added to the worked example wherever it appears.

### Open items — business decisions the founder must make, not copy fixes:

1. **Agency-tier pricing model undecided.** Section 2 flags the flat $200–500/athlete/yr model as economically weak (~21-month CAC payback) and recommends a 1–2% valuation-uplift fee instead — but this recommendation was never adopted in the positioning (Section 3), video (Section 6), or email copy (Section 7), which still reference the flat-fee framing in places. **Decide before real agency outbound begins.**
2. **Potential undisclosed conflict of interest**, not previously flagged by any other agent: Federation-tier subscription sales ($25K–$75K/yr) and the 20% success fee on academy-side solidarity claims may put Athlytica on both sides of a claims process routed through the same federation. **Needs an explicit written conflict-of-interest policy, reviewed by Kenyan counsel, before any Federation-tier or success-fee contract is signed.**
3. **Possible double-charge exposure**: if the agency tier moves to a valuation-uplift fee while a separate 20% solidarity success fee also applies to the same underlying transfer, a sophisticated agent-buyer will ask whether they're being charged twice for one transaction. **Needs explicit disclosure of how the two fees interact (mutually exclusive by scope, stacked-but-disclosed, or credited against each other) before either is quoted to a real prospect.**
4. **Live SQL demo risk**: confirm before recording that the video's synthetic seed dataset actually reproduces $6,250 when the `solidarity_claim_input` view is queried live — otherwise the cold-open number and the live demo number visibly mismatch on camera.
5. **Conversion-rate false precision**: the previously-reported single-point "~0.7%" blended conversion estimate collapses a 0.375%–1.6% range (a 4.3x spread) into false precision. Section 2 has been updated to show the honest range — **recompute Year 1–3 revenue targets at the low end before quoting them externally.**
6. **Missing revenue line item**: the Data Void Audit ($2,000–$5,000) — the actual near-term revenue engine per Section 10 — has no CAC/conversion math of its own anywhere in the unit economics model. **Add it as an explicit 7th tier line item.**
7. **Year 1–3 revenue bands are asserted, not derived bottom-up.** Cannot currently be reproduced from stated funnel rates × stated deal sizes — **publish the derivation before citing these numbers to an investor.**
8. **Tier-naming drift**: the pricing model's original "NRHL" tier label has been renamed "League" in Section 2 above, with NRHL called out separately as the design-partner prospect — confirm this rename is carried through consistently in any future materials.

### Generic-filler audit
Phrases actually used ("What KYC did for finance, Athlytica does for sport"; "We eliminate data voids"; "Athlytica Scouting Passport Schema") are load-bearing and specific, not filler — they trace to named research and named mechanisms. **Before the literal video script and email copy are finalized for production, run a manual pass for standard AI-filler patterns** ("unlock," "seamless," "cutting-edge," "revolutionize," "leverage" as a verb, unsupported superlatives like "industry-leading") — this audience (federation officials, insurer actuaries, academy directors who've been burned by vendor overpromising) will discount the schema's technical credibility the moment they hit one generic marketing phrase.

---

# 9. INFRASTRUCTURE & DEPLOYMENT READINESS AUDIT (Agent 9 Findings)

**Repo root:** `C:\Users\User Profile\athlytica-systems-engine` — confirmed NOT a git repository. `outputs\` exists and is the correct location for this document. No `schema\` directory exists yet anywhere in the tree.

### The core finding: everything in Sections 4, 6, and 7 above is a specification, not deployed infrastructure.

No schema/DDL files are saved to disk. No git repository exists, locally or publicly. No LICENSE file exists. No landing page backend exists. No ESP/email system is configured. No video has been produced or uploaded. **If this document's marketing copy is published as-is without first building the infrastructure below, every "download" and "watch" call-to-action in the funnel is a broken link on day one.**

### Recommended File Structure (New Directory)

```
C:\Users\User Profile\athlytica-systems-engine\
├── business-brief.md                          (existing)
├── outputs\
│   └── revenue-agent-demo.md                   (this document)
├── runbooks\
│   └── revenue-agent-runbook.md                (existing)
├── .claude\agents\                             (existing)
└── schema\                                     (NEW — does not yet exist)
    ├── passport.schema.json
    ├── athlytica_passport_schema.sql
    ├── seed\synthetic_seed_data.sql
    ├── README.md                                (3-layer IP boundary explainer)
    └── LICENSE                                  (Apache 2.0)
```

Kept separate from `outputs\` deliberately: `schema\` is meant to become its own public git repo eventually, and must never accidentally carry pricing models or legal notes into public git history.

### Structural Code Readiness Concerns (Design-Level, Verify Once DDL Is Actually Written)

1. `CREATE EXTENSION IF NOT EXISTS pgcrypto;` must be the first statement — the audit-log hash chain depends on it; deployment fails immediately on a fresh database otherwise.
2. Trigger functions must be defined before the `CREATE TRIGGER` statement that references them, and the target table must already exist.
3. Append-only enforcement on `audit_log` needs an actual mechanism (a blocking `BEFORE UPDATE OR DELETE` trigger, or role-level `REVOKE UPDATE, DELETE`) — "append-only" in prose alone is not append-only in practice.
4. The hash-chain trigger must handle the genesis-row case (no previous hash) without erroring on NULL.
5. `solidarity_claim_input` must be the last object created, after every table it selects from; recommend a post-deploy smoke test (`SELECT * FROM solidarity_claim_input LIMIT 1;`).
6. Any JSON Schema validator tooling must use relative/local `$ref`s internally, reserving the absolute `schema.athlytica.io` URL for the top-level `$id` only — otherwise validation fails or hangs in any environment without live DNS/hosting for that domain.

### Deployment Readiness Checklist (Ordered, Founder-Actionable)

1. `git init` the repo.
2. Create `schema\` directory per the structure above.
3. Save the actual schema/DDL files to disk (they currently exist only as this document's prose).
4. Add `pgcrypto` extension statement; verify trigger/view creation order.
5. Add append-only enforcement to `audit_log`.
6. Run the DDL against a scratch PostgreSQL instance end-to-end before treating it as release-ready.
7. Add `README.md` and Apache 2.0 `LICENSE` + `TRADEMARKS.md`.
8. Add synthetic seed data — confirm zero real athlete PII.
9. Create the public GitHub/GitLab repo; push `schema\`.
10. Tag a `v1.0.0` release; use the release/raw-file URL as the literal marketing link — **not** `schema.athlytica.io`, until that domain is actually registered and hosted.
11. Build the landing page form backend.
12. Configure the ESP with the 5-email sequence.
13. Produce and upload the video.
14. Only after steps 1–13, treat this document's funnel copy as an accurate description of a live system.

---

# 10. OPERATIONAL EXECUTION RUNBOOK (Agent 10 Synthesis)

### Master Sequence (merges Sections 8's copy fixes, Section 9's infra checklist, and Section 5's compliance gates into one timeline)

**Week 1 — Foundation.** Create `schema\`, save real schema/DDL files, audit for zero real athlete data, add LICENSE/TRADEMARKS/README, test DDL on scratch Postgres. Stay in a private repo — do not go public yet.

**Week 2 — Copy Remediation (Gate A).** Apply the E1 subject line fix and DPA qualifier fix (✅ already reflected in Sections 6–7 above). Draft the Federation/Agency conflict-of-interest policy (founder-drafted; do not use externally until counsel-reviewed — see Checkpoint 2 below).

**Week 3 — Compliance Gate A + Public Repo Launch.** Final cross-check against Section 5.9 Gate A. Create the public GitHub repo, push, tag `v1.0.0`. **This is the first point at which the "Free Schema" rung of the offer ladder becomes real.**

**Week 4 — Landing Page + Email Infrastructure.** Build the form backend with the Section 7 copy. Configure the ESP and load the 5-email sequence. Do not activate the sequence yet.

**Weeks 5–6 — Gate B Fixes.** Make the Agency pricing decision (Section 8, item 1). Resolve the fee-interaction disclosure (item 3). Verify the live SQL demo reproduces the stated numbers (item 4).

**Week 7 — Video Production.** Produce and upload using the Gate-B-corrected script. Activate the email sequence. **This is Launch** — target end of Week 7.

**Weeks 8–16 (Post-Launch Month 1–2) — Gate C, in parallel with early BD.** Recompute the funnel-conversion range and Year 1–3 targets against real logged data (Section 8, items 5–7). Add the Data Void Audit as its own tier line item (item 6).

### Roles (Solo-Founder-Executable Today)

| Function | Owner | Note |
|---|---|---|
| Schema/DDL, repo, landing page, ESP | Founder (non-deferrable near-term) | Cheapest and most context-rich to build now |
| Kenyan DPA/legal review | **Outside counsel — not founder self-certified** | The one place founder judgment is explicitly insufficient |
| Video script → production | Founder writes; production/editing safely outsourced once script is Gate-B-clean | |
| First Data Void Audit sales calls | Founder-led, non-deferrable | Founder's own domain credibility is currently the strongest sales asset |

### First 90 Days — Who to Target First, and Why

**Target African football academies first** for the Data Void Audit, specifically ones with a recent (past 24 months) international senior transfer of a player who came through their youth system in the qualifying registration window. Reasoning: shortest sales cycle (the pain point — unclaimed money — is concrete and self-interested, unlike federations' slower-burning funding-compliance risk or insurers' longer actuarial-partnership cycle); the free-schema-to-audit funnel is purpose-built around exactly this segment's pain point; and unlike Agency outreach (blocked on the pricing decision above) or Federation outreach (blocked on the conflict-of-interest policy), Academy outreach has no unresolved internal dependency once Gate A/B copy fixes are done.

**Do not start Insurer outbound in the first 90 days** — that's explicitly Gate C territory (Section 5.9) and should wait until Academy/Agency revenue motions produce signal.

### Risk Checkpoints — Stop and Get External Sign-Off

1. **Before the public repo push (Week 3):** informal technical second-read on the DDL/pgcrypto/trigger behavior.
2. **Before the conflict-of-interest policy is used in any real Federation or Agency conversation:** must go to Kenyan counsel, not stay founder-drafted.
3. **Before any paying enterprise customer onboards, triggered by deal readiness not calendar time:** national_id_hash salting spec reviewed by counsel, field-level access control on `tanner_stage` implemented, expanded consent architecture actually built (not just designed), DPA template finalized, ODPC registration complete.
4. **Before the insurer/data-licensing line goes live at all:** the full Gate C prerequisite list (Section 5.9), and only after Academy/Agency motions are already producing signal.
5. **Any time a revenue number leaves the building** (investor call, board update, partner pitch): do not cite Year 1–3 targets or the conversion-rate estimate until Section 8 items 5–7 are resolved — quote a range and say explicitly it's provisional if a number must be given before that work is done.

---

# 11. FOUNDER ACTION SUMMARY — OPEN DECISIONS & NEXT 30 DAYS

### If you only do 5 things this month:

1. **Save the schema files to disk and get them into a private git repo** with LICENSE, TRADEMARKS.md, and README (Section 9, Week 1). This is the single largest gap in the venture right now, and it's pure founder execution time with no external dependency.
2. **The three Gate A copy fixes are already applied in this document** (Sections 6–7) — carry them into whatever tool actually sends the emails and hosts the landing page; don't let the corrected version get silently reverted to an earlier draft.
3. **Decide the Agency pricing model** — flat fee vs. valuation-uplift fee (Section 8, item 1). This has been open since the unit-economics pass and now actively blocks the second-highest-value BD motion.
4. **Push the public repo and tag v1.0.0** once an informal technical sanity-check is done (Checkpoint 1). This converts the funnel from "described" to "real, linkable."
5. **Build the Academy outbound target list** (15–20 names, per Section 10) in parallel — nothing blocks this, so it should be running concurrently with 1–4.

### Decisions that require the founder, not another agent pass:

- Agency tier: flat per-athlete fee, or 1–2% valuation-uplift fee? (Section 8, item 1)
- How do the solidarity success fee and any valuation-uplift fee interact if both could apply to one transaction? (Section 8, item 3)
- Federation-subscription vs. academy-success-fee conflict of interest — draft a policy, then get it in front of Kenyan counsel before it's used externally. (Section 8, item 2)

### Decisions that require external sign-off before proceeding, not founder self-certification:

- Any Kenya DPA/ODPC matter (Section 5, Section 10 Checkpoint 3).
- The conflict-of-interest policy, before it's shown to any real prospect (Checkpoint 2).
- Any revenue number quoted externally, until the funnel-conversion range and bottom-up Year 1–3 derivation are actually published (Checkpoint 5).

**Bottom line:** the strategic architecture is coherent, the core financial mechanism is arithmetically sound, and the wedge (verifiable data infrastructure beneath the incumbents, feeding FIFA/insurer/federation systems that don't yet have a vendor) is real and well-evidenced. Nothing in this package is customer-facing-ready until the Section 9 infrastructure checklist is executed, and nothing should be presented as revenue-modeled-with-confidence until the Section 8 unit-economics gaps are closed. Both are solvable by one founder in the next 4–7 weeks, in the order laid out in Section 10.
