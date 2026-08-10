# 06 — CONTENT FACTORY: 30-Day Multi-Channel Production OS

**Status:** ACTIVE PRODUCTION MANDATE — **Revision 2** (2026-07-20, COO session; supersedes Rev 1 of 2026-07-13 in full).
**Authority chain:** per `01_PROJECT_PLANNER.md` — this manual < observed repository state < live production endpoints. When this manual and a live site disagree, the live site is the published truth; update this manual, then reconcile the site against founder-ratified pricing/dates.
**Scope:** All social, video, and funnel content across the five-brand ecosystem (Personal, Athlytica, NRHL, BIIF, Kiko & Friends TV) for the window **Mon 2026-07-20 (Day 1) → Tue 2026-08-18 (Day 30)**.
**Numbering note (binding):** Manual number 04 is allocated to `04_NOTION_SYNC_MAP.md` and cross-referenced from live code (`config/payment-rail.ts` → "manual 04 §5", `config/registration-fees.ts` → "04 §4.2(3)"). This manual is ratified as **06**. Do not create a second `04_*` file.

> **AMENDMENT 2026-08-11 — read before using any naming or payment string below.**
>
> | This manual says | Current truth |
> |---|---|
> | Tier 1 / Tech Profile Track | **Athlete Performance Assessment** — KES 7,500 (`baseline_7500`) |
> | Tier 2 / Clinic Track / Fall Combine | **Performance Hockey Program** — KES 27,500 (`combine_27500`) |
> | Tier 3 / Acceleration Track, "up to 3 weekly sessions" | **Elite Individual Development** — KES 45,000, 12 × 90-min private sessions (`acceleration_45000`) |
> | Paybill 880100, account = registration reference | **Paybill 4325935, account = athlete's name** |
> | D-7: no asset may claim automated/STK payment is live | **STK push is live.** The registration flow sends an M-Pesa prompt; the Paybill above is the manual fallback. |
> | D-8: site stale, shows Aug 2026 launch + July 31 lockout | **Closed.** `www.nairobihockey.com` was rebuilt 2026-08-10/11 to the January 2027 roadmap and the programme architecture above. |
>
> Also retired in public copy: "Scouting Passport" (→ Digital Athlete
> Performance Profile), "data fidelity" as the reason for the 3–8 cap (→ so
> coaches can properly coach each athlete), and any framing that a
> development phase guarantees a draft position or league selection.
> Canonical offer definition: `brand-nrhl/league-prospectus.md` §4.

---

## 0. Ingestion Audit & Honesty Contract (read before producing any asset)

### 0.1 Verified live endpoints (last verified 2026-07-20)

| Endpoint | Status | Funnel primitives |
|---|---|---|
| `www.athlyticahq.com` | ✅ LIVE | "End the Invisibility Tax" · Verified Scouting Passport · Physical Credit Score · Gold Seal (90% GPS integrity × 90 days) · published aggregates: 1,500+ verified sessions, 310+ athletes, 12 Gold Seals, 93.4% GPS integrity · CTA `https://nairobihockey.com/register?tier=baseline_7500&source=athlytica` · investor data-room via email/DM |
| `app.athlyticahq.com` | ✅ LIVE | Platform shell; screen-capture source only |
| `www.nairobihockey.com` | ⚠️ LIVE BUT **CONTRADICTS CURRENT TRUTH (D-8)** | Site still publishes Aug 2026 launch + July 31 Lockout. Founder decision 2026-07-20 (04 §4.4): match-play re-anchored to **January 2027**, Fall Combine tracks (7,500 / 27,500 / 45,000 KES flat one-time) open now. Site must be updated + announcement posted before combine sales content runs. Tiers 35k/55k/85k KES **per season** (D-2 closed) · CTA `https://nairobihockey.com/register?tier=combine_27500&source=nrhl` · +254 724 324 529 |
| **X `https://x.com/AthlyticaOS`** | ⚠️ FOUNDER-ASSERTED | Fetch returned no readable content (login-walled/client-rendered), 2026-07-20. Standardized Athlytica X destination; verify handle renders publicly before linking in paid assets. |
| **LinkedIn `https://www.linkedin.com/company/athlytica-performance-intelligence/`** | ⚠️ FOUNDER-ASSERTED | Fetch returned no readable content (login-walled), 2026-07-20. Standardized Athlytica LinkedIn entity — company page, not personal profile. |
| `www.bigice.co.ke` | ✅ LIVE | Tiers 320k/180k/75k · TAL formula · CTA `https://nairobihockey.com/register?tier=combine_27500&source=bigice` · WhatsApp +254 724 324 529 |
| **YouTube `https://www.youtube.com/@kikofriendsTV`** | ✅ **VERIFIED 2026-07-20** | Channel ID `UC3b-K64INQYAtK1R2PGREvg` · "Kiko & Friends TV" · toddler/preschool positioning live · COPPA-safe stated in About. This is the permanent tracking destination for all Kiko rows. |

### 0.2 Source-asset register (gaps CLOSED 2026-07-20)

| Asset | Status | Path |
|---|---|---|
| Kiko Master script pack | ✅ **ON DISK** | `content/kiko-master-scripts.md` — 25 production-ready episodes, 5-part structure, Sunday compilation map (materialized from founder-supplied pack) |
| Shoot List matrix | ✅ **ON DISK** | `content/shoot-list.md` — 4-week vertical batch-filming playbook (Ice Mastery / Inline Fitness / Founder Logs) with shot IDs referenced by §4 |
| BIIF lead magnet copy | ✅ **ON DISK** | `content/lead-magnets/biif-balance-manual.md` — complete 3-Step Living Room Balance Blueprint copy |
| Athlytica audit schema | ✅ **ON DISK** | `content/lead-magnets/athlytica-b2b-schema.md` — Performance Leak Audit documentation schema + copy blocks |
| Keywords/SEO pack | ✅ INGESTED (founder upload, 2026-07-20) | Title patterns, tag strategy, posting-time data, and retention mechanics folded into `content/kiko-master-scripts.md` and §5.2 |
| CapCut blueprint / Catchy phrases | ✅ CODIFIED | §5.1 of this manual + hook corpus in §4 (Rev 1 + Rev 2 rows) |

Continuing on-disk business sources: `core-engine/athlytica-spec.md`, `brand-nrhl/league-prospectus.md` (pricing ratified per season 2026-07-20), `brand-big-ice/coaching-ops.md`, `business-brief.md`, `config/brand-voice.md`, `config/business-model.md`, `config/payment-rail.ts`, `config/registration-fees.ts`, `runbooks/.claude/agent-memory/content-angle-strategist/project_athlytica_pipeline.md`, `.agentic-os/04_NOTION_SYNC_MAP.md` §4.3.

### 0.3 Defect register (Rev 2 state)

| # | Defect | Severity | State |
|---|---|---|---|
| D-1 | Public payment-reference misuse: `1010539223` is the NCBA bank-plane settlement identity, NOT a payer reference. | 🔴 | **STANDING LAW.** Sanctioned verbatim string only (§2.4). Never print 1010539223 in any public asset. |
| D-2 | Per-month vs per-season pricing conflict. | — | ✅ **CLOSED 2026-07-20.** Per-season ratified; `brand-nrhl/league-prospectus.md` corrected to match `nairobihockey.com`. |
| D-3 | Athlytica traction guardrails: pre-revenue; no fabricated case studies; "pseudonymized"/"tamper-evident" vocabulary. | 🟠 | OPEN — site aggregates quotable verbatim; named-athlete feed entries still need founder confirmation before paid boost. |
| D-4 | Minors on camera: written parental media consent before any child appears; consent logged pre-shoot (see `content/shoot-list.md`). | 🟠 | STANDING LAW. |
| D-5 | Aug 22 Draft Day publication gap. | — | ✅ **SUPERSEDED 2026-07-20** — Draft Day retired entirely; match-play re-anchored to January 2027 (04 §4.4). All Aug-22/lockout urgency copy is banned. |
| D-6 | "21-day balance transformation" testimonial claim lacks an evidence artifact. | 🟡 | OPEN — demonstration format only until Day-1/Day-21 footage of a consented student exists. The Blueprint's 21-Day Protocol (`content/lead-magnets/biif-balance-manual.md`) is the evidence-generation mechanism. |
| **D-7** | **`G-W6-PAY` still BREACHED (zero settlement evidence in production — 04 §4.3).** Now blocks **Fall Combine revenue** (Tech Profile sales open today) instead of draft registration. | 🔴 | **CONTENT LAW:** ① no asset may claim automated/STK payment is live ② registration CTAs drive to forms; §2.4 verbatim manual M-Pesa string only ③ escalation unchanged — combine cash cannot settle at scale until the gate closes. |
| **D-8** | **`nairobihockey.com` contradicts the ratified timeline.** Site advertises Aug 2026 launch + July 31 Lockout; truth is January 2027 match-play + Fall Combine (04 §4.4/§4.5). Selling combine packages while the site says the league launches next month destroys trust with upfront-paying premium families. | 🔴 | **GATING:** the Strategic Evolution announcement (`content/announcements/nrhl-strategic-evolution.md`) must be posted AND the site's timeline/pricing sections updated before any Fall Combine sales row (D4 onward) publishes. Matrix rows are written assuming this clears by 2026-07-22. |
| **D-9** | Insurance underwriting and Joker Floors surfacing are announced as "finalizing/advancing" — neither contract is signed. C-SEP clinic sales are gated on the unsigned Hub Karen venue contract (04 §4.5). | 🟠 | OPEN — "finalizing/advancing" phrasing only; no completion claims; no dated Clinic Track session sales until the Hub Karen contract executes. Tech Profile (Tier 1) has no venue dependency and sells immediately. |

---

## 1. The Digital Ecosystem Map (master reference)

| Brand node | Role | Endpoints | Channels | Positioning | Monetization loop | Primary conversion asset |
|---|---|---|---|---|---|---|
| **Dennis Lumumba (Personal)** | Authority engine — credibility umbrella | LinkedIn + venture domains | IG `bigman_fr` · TikTok `@bigman_fr` · FB `dennis.lumumba.75` · LinkedIn `dennis-lumumba-030226143` | Kenya Ice Lions national-team athlete × LTAD Systems Architect × sports-tech founder (never "skating instructor") | Angel/investor pipeline · B2B consulting leads · credibility transfer | Founder logs → DM 'DATA ROOM' |
| **Athlytica** (The Brain) | Venture-scale equity asset — Verifiable Athlete Infrastructure | `athlyticahq.com` · `app.athlyticahq.com` | IG `@athlyticahq` · **X `x.com/AthlyticaOS`** · **LinkedIn `/company/athlytica-performance-intelligence/`** (both founder-asserted, §0.1) · FB node initializing | "End the Invisibility Tax" — GPS-verified passports, Physical Credit Score, Gold Seal | Free schema → Performance Leak Audit ($2,000–5,000) → Athlytica Core SaaS · powers combine Tech Profiles | `nairobihockey.com/register?tier=baseline_7500&source=athlytica` · `content/lead-magnets/athlytica-b2b-schema.md` |
| **NRHL** (The Sandbox) | Proprietary data generator + institutional sports property | `nairobihockey.com` (site update pending, D-8) | IG `@nairobihockey` · FB `61591193578897` | Data-governed league; four conferences; **match-play January 2027**; 2026 = Fall Combine phase | **Fall Combine one-time packages:** Tech Profile 7,500 · Clinic 27,500 · Acceleration 45,000 (all flat, never monthly) · seasonal tiers Jan 2027 (per season) · After-School Development League (fee-per-student B2B) | `nairobihockey.com/register?tier=combine_27500&source=nrhl` + Paybill 880100/issued reference · `content/announcements/nrhl-strategic-evolution.md` |
| **BIIF** (The Hardware) | Cash-flow engine + athlete pipeline | `bigice.co.ke` | IG `@bigiceinlinefitness` · FB `big.iceinlinefitness` | Kenya's first high-performance skating academy; anti-screen-time D2C wedge | Tier enrollments · club packages · premium retail (mall/rink only) | `nairobihockey.com/register?tier=combine_27500&source=bigice` · WhatsApp keyword "BALANCE" → `content/lead-magnets/biif-balance-manual.md` |
| **Kiko & Friends TV** | Top-of-funnel youth attention + licensing option | `youtube.com/@kikofriendsTV` (✅ verified) | YouTube Kids | Chibi skating-locomotion education, ages 2–6, COPPA-safe | AdSense (1K subs + 4K watch-hrs target) · print-on-demand · licensing · parent-routed BIIF funnel | 25-episode catalog: `content/kiko-master-scripts.md` |

**Flywheel (canonical):** Kiko captures toddler attention → parents route to BIIF → BIIF athletes feed NRHL pods → NRHL generates Athlytica telemetry → Athlytica passports raise athlete value → Personal brand monetizes the stack with investors. Every §4 row attributes to exactly one edge.

---

## 2. Conversion Logic & Pain Audit (copy-block law)

### 2.1 Urgency

| Brand | Urgent pain | Deadline weaponized |
|---|---|---|
| NRHL | No Tech Profile = no January 2027 draft-board seed; late entrants start the season data-invisible | **C-AUG milestone Aug 15** (first combine cohort) + strict 3–8 cohort caps + "selection window" scarcity. Lockout/Aug-22 copy permanently banned (D-5). |
| BIIF | Screen-time guilt; school-holiday idle window | Rolling cohort scarcity + "build the baseline before January" combine feeder framing |
| Athlytica (B2B) | Court time burned with zero verifiable output | Honest capacity scarcity (solo-architect engagement slots) |
| Personal | Investors miss a data monopoly in formation | "310+ athletes, +38 sessions/day" (site aggregates) |
| Kiko | None — evergreen retention play | No urgency copy; algorithm mechanics only |

### 2.2 Believability
Founder national-team authority (always true) → site-published aggregates quoted verbatim (D-3) → demonstration over testimonial until D-6 evidence exists → vocabulary law: "pseudonymized," "tamper-evident," "GPS-verified."

### 2.3 Lead magnets (all copy now on disk)
BIIF: **3-Step Living Room Balance Blueprint** (`content/lead-magnets/biif-balance-manual.md`) — WhatsApp keyword "BALANCE". Athlytica: **B2B Academy Performance Leak Audit** (`content/lead-magnets/athlytica-b2b-schema.md`) — institutional-email-gated schema → paid audit. NRHL: live Drive proposals via `nairobihockey.com`. Personal: data-room one-pager on DM.

### 2.4 Payment track (verbatim, non-negotiable)

> **"Lipa na M-Pesa → Paybill → Business No. 880100 → Account No. = YOUR unique registration reference."**

All payment copy routes users to the application forms first — the registration reference is issued server-side and shown on the registration receipt. Never print `1010539223` in any public asset (D-1). Never claim automated collection is live while D-7 stands.

---

## 3. Cadence Law & Format Specs

### 3.1 Weekly cadence (binding; Day 1 = Monday 2026-07-20)

| Weekday | Mandated theme | Rotation |
|---|---|---|
| **Monday** | Ice mastery + analytics telemetry tracking | Personal (ice) ↔ Athlytica (telemetry) |
| Tuesday | B2B authority block | Athlytica LinkedIn/X (D30 close-out) |
| **Wednesday** | Inline sport, timed agility drills, evaluation pod countdown pressure | BIIF ↔ NRHL |
| Thursday | NRHL recruitment/draft countdown | NRHL |
| **Friday** | Honest founder logs, hybrid-entrepreneur discipline, ecosystem flywheel strategy | Personal |
| Saturday | Kiko feature + community block | Kiko & Friends |
| **Sunday** | Direct D2C booking paths + Kiko long-form compilations at exactly 11:00 EAT | **Dual-asset day:** BIIF booking reel + Kiko compilation |

**Standing daily track (parallel to matrix):** Kiko Daily Short Mon–Sat **09:00 EAT**, sequential from the 25-episode catalog (Ep1 = Mon Jul 20 … Ep25 = Mon Aug 17), per `content/kiko-master-scripts.md`. §4 lists Kiko only where it is the day's primary production asset.

### 3.2 Format specs
9:16 Vertical = 1080×1920, ≤60s, captions burned per §5.1 · 16:9 Landscape = 1920×1080 (YouTube/LinkedIn native) · LinkedIn Text = hook in line 1, ≤1,300 chars visible, link in first comment.

---

## 4. 30-Day Metricool Production Matrix (Mon 2026-07-20 → Tue 2026-08-18)

Hashtag sets — **BIIF-SET:** `#skatinglessonskenya #kidsgetfit #screenfreekids #nairobiparents #inlineskatingkenya` · **ATH-SET:** `#aiinsportsperformance #sportstech #sportsanalytics #africanathletes #scoutingpassport` · **NRHL-SET:** `#nairobihockey #inlinehockey #rollerhockeykenya #youthsportskenya #nrhl` · **PB-SET:** `#kenyaicelions #sportstechfounder #buildinpublic #nairobifounders` · **KIKO-SET (descriptions only):** `#kidscartoon #skatingforkids #kidsgetfit`. Shot IDs reference `content/shoot-list.md`.

### Week 1 — Evolution Week (Jul 20–26: announce the pivot, open Tech Profile sales)

**DAY-1 FLAGSHIP DROP (unscheduled row, posts TODAY 18:00 EAT):** the Strategic Evolution announcement (`content/announcements/nrhl-strategic-evolution.md`) publishes across NRHL IG + FB and founder LinkedIn, **after** the site timeline is corrected (D-8 gating). Every NRHL matrix row below assumes this announcement is live.

| Day | Calendar Date | Venture Context | Platform Target | Format & Aspect Ratio | Ingested File Source | Word-for-Word Script Hook & Caption Copy | Target CTA |
|---|---|---|---|---|---|---|---|
| 1 | Mon Jul 20 | Personal | IG Reel + TikTok | 9:16 Vertical | `content/shoot-list.md` ICE-01 + `brand-big-ice/coaching-ops.md` | **VO HOOK (0–3s):** "Your edges decide the game before your stick ever touches the puck." **CAPTIONS:** "EDGE CONTROL = THE FIRST METRIC WE SCORE" → "Watch the ankle, not the skate." **SCENES:** low-angle edge-load follow; 0.5x slow-mo at 4s beat on inside-edge compression; freeze-frame angle overlay. **AUDIO:** cinematic drill/phonk, drop at 4s. **TAGS:** PB-SET + `#edgework` | "Full breakdowns every Monday — follow. Your athlete's version starts at **bigice.co.ke**" |
| 2 | Tue Jul 21 | Athlytica | LinkedIn | LinkedIn Text | `core-engine/athlytica-spec.md` §1 | **LINE 1:** "Africa has a $17B sports market running on zero verified data." **BEATS:** ① 99% of grassroots sessions unrecorded → athletes statistically invisible ② a coach's 9/10 is worth $0 to an insurer ③ GPS-verified, tamper-evident session data reprices the athlete ④ we call this ending the Invisibility Tax. **CLOSE:** "1,500+ verified sessions and counting." **TAGS:** ATH-SET | "Academy directors: the free Scouting Passport Schema + Performance Leak Audit → **athlyticahq.com** (first comment)" |
| 3 | Wed Jul 22 | BIIF | TikTok + IG Reel | 9:16 Vertical | `content/lead-magnets/biif-balance-manual.md` + shot INL-05 | **VO HOOK:** "Your kid has watched 4 hours of screens today. This drill takes 7 minutes and zero equipment." **CAPTIONS:** "STEP 1: SINGLE-LEG CLOCK REACH" → "STEP 2: ANKLE STABILIZATION HOLD" → "STEP 3: LINE-WALK TURNAROUNDS." **SCENES:** living-room demo (consented child, D-4); slow-mo ankle stabilization at 4s; split-screen wobble vs hold. **AUDIO:** upbeat family trend. **TAGS:** BIIF-SET | "Comment **BALANCE** or WhatsApp **+254 724 324 529** for the free Blueprint → baseline assessment at **bigice.co.ke**" |
| 4 | Thu Jul 23 | NRHL | IG Reel | 9:16 Vertical | `content/announcements/nrhl-strategic-evolution.md` + 04 §4.5 | **VO HOOK:** "The league isn't launching late. It's launching right. January 2027 — and your athlete's file starts NOW." **CAPTIONS:** "MATCH-PLAY: JANUARY 2027" → "FALL COMBINE TRACKS: OPEN TODAY" → "KES 7,500 — PERMANENT PERFORMANCE PASSPORT." **SCENES:** announcement pillars as motion cards (Athlytica OS / risk underwriting / Joker Floors "advancing"), then Tech Profile dispatch footage (shot INL-04). **AUDIO:** stadium hype. **TAGS:** NRHL-SET | "Initialize your athlete's Athlytica profile → **nairobihockey.com** (form in bio)" |
| 5 | Fri Jul 24 | Personal | IG Reel + LinkedIn native | 9:16 Vertical | `business-brief.md` + `config/business-model.md` + shot FDR-01 | **VO HOOK:** "I play for Kenya's national ice hockey team. I'm also building the data layer that proves African athletes exist." **CAPTIONS:** "THE BRAIN: Athlytica" → "THE SANDBOX: NRHL" → "THE HARDWARE: Big Ice" → "One flywheel." **SCENES:** rink B-roll → dashboards → pod coaching → talking head. **AUDIO:** motivational build. **TAGS:** PB-SET | "Following the build? Start at **athlyticahq.com**. Investors: DM 'DATA ROOM'." |
| 6 | Sat Jul 25 | Kiko & Friends | YouTube Kids | 16:9 Landscape (3–5 min) | `content/kiko-master-scripts.md` Ep 6 | **Ep 6 — Bus Song on Ice** ships as the 09:00 daily short (Ep1–5 ran Mon–Fri). **COLD OPEN:** "Wheels on the bus… go WHOOSH!" Loops per script: RED BUS scrape pickup → BLUE WHEELS edge turn → "1 2 3 FRIENDS" honk finale. **COMMUNITY POST:** poll "Ice or Inline?" **TAGS (description):** KIKO-SET | No in-video CTA (COPPA). Description: "Parents: real-world lessons at bigice.co.ke" + "Watch the full marathon Sunday!" |
| 7 | Sun Jul 26 | BIIF (+ Kiko compilation 11:00 EAT) | IG Reel + FB (+ YouTube) | 9:16 + 16:9 (20 min) | `coaching-ops.md` §3 + `content/kiko-master-scripts.md` compilation map | **VO HOOK:** "Sunday at the academy: zero screens, every rep measured — and every athlete now leaves with a combine-ready baseline." **CAPTIONS:** "FAMILY SESSION DAY" → "TECH PROFILE: KES 7,500 FLAT — YOUR ATHLETE'S PERMANENT FILE." **SCENES:** family session montage → passport screen reveal. **AUDIO:** warm. **PLUS:** Kiko **"Kiko's Big Week One Marathon"** (Ep1–6 + loops) at exactly 11:00 EAT. **TAGS:** BIIF-SET | "Book → **bigice.co.ke** · Combine track → **nairobihockey.com**. On registration: *Lipa na M-Pesa → Paybill → Business No. 880100 → Account No. = YOUR unique registration reference.*" |

### Week 2 — Combine Ignition (Jul 27–Aug 2: Tech Profile volume week)

| Day | Calendar Date | Venture Context | Platform Target | Format & Aspect Ratio | Ingested File Source | Word-for-Word Script Hook & Caption Copy | Target CTA |
|---|---|---|---|---|---|---|---|
| 8 | Mon Jul 27 | Athlytica | LinkedIn native video | 16:9 Landscape | athlyticahq.com (verified) + `athlytica-spec.md` §2 | **VO HOOK:** "This credential cannot be purchased. 12 athletes on our platform hold it." **CAPTIONS:** "GOLD SEAL = 90% GPS INTEGRITY × 90 CONSECUTIVE DAYS" → "System-awarded. Never manual." **SCENES:** screen capture of integrity formula + passport on app.athlyticahq.com; founder VO. **AUDIO:** minimal institutional. **TAGS:** ATH-SET | "How the Integrity Score computes → **athlyticahq.com** (first comment)" |
| 9 | Tue Jul 28 | Athlytica | LinkedIn + X | LinkedIn Text + screen clip | `project_athlytica_pipeline.md` (core demo proof) | **LINE 1:** "We added an entire new sport to our athlete database with one SQL INSERT. Zero migrations." **BODY:** the Multi-Sport Taxonomy Engine treats sports, event classes, and metrics as data rows, not code — inline hockey went live without a deploy. That's infrastructure-grade. **TAGS:** ATH-SET + `#dataengineering` | "Academy on spreadsheets? Book the **Performance Leak Audit** → **athlyticahq.com**" |
| 10 | Wed Jul 29 | NRHL | TikTok + IG Reel | 9:16 Vertical | `league-prospectus.md` §4 Track 1 + shot INL-04 | **VO HOOK:** "This is not a skating class. This is a mobile evaluation dispatch with cameras on every stride." **CAPTIONS:** "TECH PROFILE TRACK — KES 7,500 FLAT" → "EVALUATION LOOPS · PLYOMETRICS BASELINE · EDGE-CONTROL PROFILE" → "OUTPUT: A PERMANENT DIGITAL PASSPORT." **SCENES:** dispatch hype cut, camera rigs, 3–8 cohort cone metrics, dashboard reveal; 0.5x slow-mo at 4s on a transition. **AUDIO:** hard sports edit. **TAGS:** NRHL-SET | "First combine cohort closes **August 15** → **nairobihockey.com**" |
| 11 | Thu Jul 30 | NRHL | IG Reel + FB + TikTok (tri-post) | 9:16 Vertical | `league-prospectus.md` §4 Track 2 + 04 §4.5 (C-SEP gate) | **VO HOOK:** "Three months. One flat fee. Three to eight athletes per coach — never more." **CAPTIONS:** "CLINIC TRACK — KES 27,500, FULL 3-MONTH PACKAGE, ONE-TIME" → "STRIDE SYNC · EDGE TRANSITIONS · MONTH-END SCRIMMAGES" → "COHORTS STRICTLY CAPPED." **SCENES:** progressive drill montage, cap-counter graphic 3→8, scrimmage finale clip. **AUDIO:** tension build. **NOTE (D-9):** waitlist language only — no dated session sales until The Hub Karen contract signs. **TAGS:** NRHL-SET | "Join the Clinic Track waitlist → **nairobihockey.com**. *Lipa na M-Pesa → Paybill → Business No. 880100 → Account No. = YOUR unique registration reference.*" |
| 12 | Fri Jul 31 | Personal × NRHL | LinkedIn + IG Reel | LinkedIn Text + 9:16 | `content/announcements/nrhl-strategic-evolution.md` + shot FDR-01 | **FOUNDER HOOK:** "I just moved my own league's season by five months. Here's why that's the strongest move on the board." **BODY:** launching August meant match-play on infrastructure I wasn't proud of; January 2027 means insured athletes, professional Joker Floors surfaces (in progress), and every draft pick backed by a real combine baseline — a league built to standard, not to deadline. Honest, no spin: this is a postponement, and the combine is how we earn the trust it costs. **REEL:** one-take founder to-camera, rink background. **TAGS:** PB-SET + NRHL-SET | "The 2026 combine phase is open now → **nairobihockey.com**" |
| 13 | Sat Aug 1 | Kiko & Friends | YouTube Kids | 16:9 Landscape (3–5 min) | `content/kiko-master-scripts.md` Ep 12 | **Ep 12 — Animal Parade on Skates** (09:00 short; Ep7–11 ran Mon–Fri). **COLD OPEN:** "Parade… wheel line-up!" Loops: 1-2-3 sync whirr → 4-5-6 weave chirps → 7-8-9-10 finale wave. **END-CARD ART:** Kiko sticker-sheet merch teaser frame, no verbal push (COPPA). **TAGS (description):** KIKO-SET | Description only: subscribe + playlists + bigice.co.ke (parents) |
| 14 | Sun Aug 2 | BIIF (+ Kiko compilation 11:00 EAT) | IG Reel + FB (+ YouTube, 25 min) | 9:16 + 16:9 | bigice.co.ke tiers (verified) + `kiko-master-scripts.md` map | **VO HOOK:** "The season moved to January. Your athlete's development didn't move an inch." **CAPTIONS:** "ACADEMY INTAKE OPEN" → "BUILD THE BASELINE BEFORE THE JANUARY DRAFT" → "COMBINE-READY BY OCTOBER." **SCENES:** family montage → tier cards → WhatsApp screen. **AUDIO:** warm motivational. **PLUS:** Kiko **"Numbers & Parade Blast"** (Ep 4, 9, 11, 12 + count loops) at 11:00 EAT. **TAGS:** BIIF-SET | "Apply → **bigice.co.ke** · WhatsApp **+254 724 324 529**" |

### Week 3 — C-AUG Sprint (Aug 3–9: 40 Tech Profiles by Aug 15)

| Day | Calendar Date | Venture Context | Platform Target | Format & Aspect Ratio | Ingested File Source | Word-for-Word Script Hook & Caption Copy | Target CTA |
|---|---|---|---|---|---|---|---|
| 15 | Mon Aug 3 | Personal | IG Reel + TikTok | 9:16 Vertical | shot ICE-02 + athlyticahq.com Pentagon taxonomy | **VO HOOK:** "Crossover power isn't a feeling. It's a number — scored 1 to 10 on a standardized rubric." **CAPTIONS:** "TECHNICAL · POWER · AGILITY · IQ · DISCIPLINE" → "A 7 in Nairobi = a 7 in Kisumu." **SCENES:** founder crossover; Pentagon radar animates per pillar; 0.5x at 4s on push-off. **AUDIO:** cinematic drill. **TAGS:** PB-SET + ATH-SET | "Your athlete's five scores live at **athlyticahq.com** → Secure an Athlete ID" |
| 16 | Tue Aug 4 | Athlytica | LinkedIn | LinkedIn Text | `content/lead-magnets/athlytica-b2b-schema.md` | **LINE 1:** "Your academy is leaking value in three places you don't measure." **BEATS:** ① verification leaks — self-reported sessions weigh ~0.1× institutionally ② standardization leaks — a 7 that means nothing outside your gate ③ longitudinal leaks — no defensible 24-month growth curve for any athlete. "The Performance Leak Audit maps all three in one pass." **TAGS:** ATH-SET | "Institutional email → free Scouting Passport Schema; the audit ladder starts there → **athlyticahq.com**" |
| 17 | Wed Aug 5 | BIIF | TikTok + IG Reel | 9:16 Vertical | shot INL-02 + `coaching-ops.md` §2 | **VO HOOK:** "Timed agility circuit. Eight kids. One rule: beat your own Tuesday time." **CAPTIONS:** "AGILITY IS TRAINABLE" → "EVERY RUN TIMED. EVERY WEEK COMPARED." **SCENES:** ladder/cone relay, on-screen leaderboard, PB celebrations. **AUDIO:** viral challenge sound. **TAGS:** BIIF-SET + `#agilitychallenge` | "Want your athlete's runs timed and tracked? → **bigice.co.ke**" |
| 18 | Thu Aug 6 | NRHL | FB Page + IG Reel | LinkedIn Text-style FB post + 9:16 | `league-prospectus.md` §1+§4 + 04 §4.5 | **VO HOOK:** "9 days until the first combine cohort closes. Here's how the January 2027 draft actually gets built." **BODY/CAPTIONS:** Tech Profiles establish every athlete's verified baseline → combine data seeds the conference draft board → January picks are made on telemetry, not opinion → athletes without a fall profile enter the season data-invisible. **CLOSE:** "First cohort closes August 15." **TAGS:** NRHL-SET | "Secure the selection window → **nairobihockey.com** · Admissions +254 724 324 529" |
| 19 | Fri Aug 7 | Personal | IG Reel + LinkedIn | 9:16 Vertical | shot FDR-02 + `config/business-model.md` | **VO HOOK:** "Five brands. One flywheel. Let me draw you the machine." **CAPTIONS (over whiteboard):** "KIKO → attention" → "BIG ICE → athletes" → "NRHL → competition" → "ATHLYTICA → data" → "DATA → value → investors." **SCENES:** live whiteboard mapping walkthrough, overhead lens. **AUDIO:** minimal, VO-led. **TAGS:** PB-SET | "The machine is public → **athlyticahq.com**. Builders and backers: DM 'DATA ROOM'." |
| 20 | Sat Aug 8 | Kiko & Friends | YouTube Kids | 16:9 Landscape (3–5 min) | `content/kiko-master-scripts.md` Ep 18 | **Ep 18 — Kiko Helps Bunny Count Carrots** (09:00 short; Ep13–17 ran Mon–Fri). **COLD OPEN:** "Carrots… 1-2-3-10!" Loops: chirp pickups 1–3 → weave 4–7 → basket 8–10 sparkle finish. **COMMUNITY POST:** poll "Count with Kiko: carrots or stars?" **TAGS (description):** KIKO-SET | Description only: subscribe + "full marathon Sunday!" |
| 21 | Sun Aug 9 | BIIF (+ Kiko compilation 11:00 EAT) | IG Reel + FB (+ YouTube, 20 min) | 9:16 + 16:9 | bigice.co.ke admission flow + `kiko-master-scripts.md` map | **VO HOOK:** "New week, new baseline. This is what your child's first session actually looks like." **CAPTIONS:** "① APPLY ② BASELINE ASSESSMENT ③ PICK YOUR TIER ④ TRAIN MEASURED." **SCENES:** onboarding montage; clipboard → dashboard reveal. **AUDIO:** fresh-start trend. **PLUS:** Kiko **"Colors & ABC Skate Party"** (Ep 2, 13, 14, 16 + loops) at 11:00 EAT. **TAGS:** BIIF-SET | "August intake open → **bigice.co.ke** · WhatsApp **+254 724 324 529**" |

### Week 4 + Close (Aug 10–18: C-AUG milestone + September Clinic runway)

| Day | Calendar Date | Venture Context | Platform Target | Format & Aspect Ratio | Ingested File Source | Word-for-Word Script Hook & Caption Copy | Target CTA |
|---|---|---|---|---|---|---|---|
| 22 | Mon Aug 10 | Athlytica | LinkedIn native video | 16:9 Landscape | shot FDR-03 (app.athlyticahq.com capture) + `athlytica-spec.md` §2 | **VO HOOK:** "This is what a scout in Toronto sees when they open an Athlytica passport." **CAPTIONS:** "LIVE URL — NOT A PDF" → "PENTAGON · GROWTH CURVE · VERIFICATION LOG." **SCENES:** cursor-led passport walkthrough, no cut >2s. **AUDIO:** minimal. **TAGS:** ATH-SET | "Claim an Athlete ID → **athlyticahq.com** · Institutions: audit link in first comment" |
| 23 | Tue Aug 11 | Personal | LinkedIn | LinkedIn Text | `config/about-me.md` + PB positioning | **LINE 1:** "I've represented Kenya on ice. The hardest opponent was never on the rink — it was invisibility." **BODY:** national-team story → why African athletes get repriced as 'high-risk gambles' → why I build verification infrastructure instead of another training app. **TAGS:** PB-SET | "B2B consulting or investment → DM 'DATA ROOM' or **athlyticahq.com**" |
| 24 | Wed Aug 12 | NRHL | TikTok + IG Reel | 9:16 Vertical | `league-prospectus.md` §2 + §4 | **VO HOOK:** "Three days until the first combine cohort closes — and your postcode already picks your January rivals." **CAPTIONS:** "SUMMIT vs RIDGE" → "PLATEAU vs SAVANNAH" → "YOUR FALL BASELINE = YOUR JANUARY SEED." **SCENES:** conference crest animations, Nairobi corridor map sweep, per-territory combine highlight; 0.5x at 4s. **AUDIO:** rivalry edit. **TAGS:** NRHL-SET | "Cohort 1 closes Aug 15 → **nairobihockey.com**" |
| 25 | Thu Aug 13 | NRHL | FB Page + LinkedIn | Text Post + graphic | `league-prospectus.md` §5 (After-School Development League) | **HOOK (institution-facing):** "Head teachers: your after-school program, run turnkey by a data-governed league." **BODY:** NRHL operates the school's roller hockey program end-to-end — coaching staff, Athlytica tracking, equipment logistics, curriculum — billed per enrolled student, zero payroll or design risk for the institution, calendar-synced to the international school year, feeding pre-tracked athletes into January 2027 conference rosters. **TAGS:** NRHL-SET | "Book an institutional consultation → Admissions **+254 724 324 529** · **nairobihockey.com**" |
| 26 | Fri Aug 14 | Personal | IG Reel + LinkedIn | 9:16 Vertical | shot FDR-04 + `config/working-style.md` | **VO HOOK:** "Motivation is a consumable. Systems compound. Here's my actual day." **CAPTIONS:** "05:30 PLAN" → "TRAIN 4×/WEEK" → "VENTURE BLOCKS" → "FAMILY — NON-NEGOTIABLE." **SCENES:** day-in-life cut (household frames only with consent). **AUDIO:** disciplined-routine trend. **TAGS:** PB-SET | "The same discipline runs the whole stack → **athlyticahq.com**" |
| 27 | Sat Aug 15 | Kiko & Friends | YouTube Kids | 16:9 Landscape (3–5 min) | `content/kiko-master-scripts.md` Ep 24 | **Ep 24 — Zoo Skating Day** (09:00 short; Ep19–23 ran Mon–Fri). **COLD OPEN:** "Zoo animals… wheel parade!" Loops: 1-2-3 zoo joins → 4-5-6-7 animal turns → 8-9-10 roar finale. **TAGS (description):** KIKO-SET | Description only: subscribe + playlists + bigice.co.ke (parents) |
| 28 | Sun Aug 16 | BIIF (+ Kiko compilation 11:00 EAT) | IG Reel + FB (+ YouTube, 30 min) | 9:16 + 16:9 | `coaching-ops.md` + `kiko-master-scripts.md` map | **VO HOOK:** "Cohort one is in the books. The pipeline runs all fall — and Sunday is family session day." **CAPTIONS:** "THE PIPELINE: LIVING ROOM → ACADEMY → COMBINE → JANUARY DRAFT." **SCENES:** warm montage across all four rungs of the pipeline. **AUDIO:** feel-good acoustic. **PLUS:** Kiko **"Bedtime Mega Loop"** (Ep 5, 15 + 8× lullaby loops, 30 min) at 11:00 EAT. **TAGS:** BIIF-SET | "Start the pipeline → **bigice.co.ke** · WhatsApp **+254 724 324 529**" |
| 29 | Mon Aug 17 | Athlytica × Personal | IG Reel + LinkedIn native | 9:16 + 16:9 | athlyticahq.com aggregates (D-3 compliant) + shot ICE-04 | **VO HOOK:** "We've tracked 310+ athletes. The top cohort shares one trait — and it isn't talent." **CAPTIONS:** "IT'S VERIFIED CONSISTENCY" → "GOLD SEAL: 90 DAYS × 90% INTEGRITY — ONLY 12 HOLD IT." **SCENES:** founder to-camera + integrity dashboard; ice-mastery B-roll (frost-spray stop) under VO. **AUDIO:** authoritative build. **NOTE:** Kiko Ep 25 (Good Morning Skate Song) ships 09:00 — catalog complete. **TAGS:** ATH-SET + PB-SET | "Start a 90-day Gold Seal run → **athlyticahq.com**" |
| 30 | Tue Aug 18 | Athlytica | LinkedIn | LinkedIn Text | This manual §4 + Metricool exports + 04 §4.5 C-AUG result | **LINE 1:** "30 days of publishing the system in public. Here's the honest scorecard — including whether we hit 40 combine profiles by August 15." **BODY:** report measured numbers only — Tech Profiles sold vs the 40-profile / KES 300,000 C-AUG target (actual figure, hit or missed), follower Δ, watch time, form submissions, audit requests, Kiko subs/watch-hours vs 1K/4K monetization thresholds. No invented wins (D-3). **CLOSE:** next cycle = September Clinic Track launch (venue-gated, D-9) and the road to January 2027. **TAGS:** ATH-SET + PB-SET | "Fall Combine rolls on → **nairobihockey.com** + **athlyticahq.com**" |

---

## 5. Video Processing & Technical Directives

### 5.1 CapCut production blueprint — all BIIF + Personal clips

| Parameter | Spec (binding) |
|---|---|
| Aesthetic | Cinematic sports; high contrast, desaturated backgrounds, subject-lit |
| Output | 9:16 vertical, 1080×1920, 30fps minimum (shoot 60fps for slow-mo conform) |
| Typography | Bebas Neue or Anton, bold, WHITE fill + high-contrast BLACK outline stroke |
| Captions | Auto-generated, burned in, max 2 lines on screen |
| Signature edit | 0.5x slow-motion compression drop at the **4-second beat drop**, framed on **ankle alignment and blade/wheel edge angles** |
| Hook discipline | VO hook inside 0–3s; no logos or intro cards before the hook |
| Scheduling | All posts staged through Metricool, EAT timezone |

### 5.2 Kiko & Friends TV automation spec (upgraded with SEO pack, 2026-07-20)

| Parameter | Spec (binding) |
|---|---|
| Channel | `https://www.youtube.com/@kikofriendsTV` (ID `UC3b-K64INQYAtK1R2PGREvg`) — verified destination for all tracking |
| Daily Short | 3–5 min, **Mon–Sat 09:00 EAT**, sequential Ep1→Ep25 from `content/kiko-master-scripts.md` (Ep1 = 2026-07-20; Ep25 = 2026-08-17) |
| Sunday compilation | **Exactly 11:00 EAT**, 20–30 min, stitched per the retimed compilation map in `content/kiko-master-scripts.md` (only released episodes compile) |
| Voice | ElevenLabs "Lily Child" on all narration |
| Titles/thumbnails | SEO pack patterns: "Learn Colors ICE Skating! Kiko & Penguin (Toddlers)" · thumbnail = Kiko face + big number/color + skate close-up · description first 100 chars = hook + timestamps |
| Playlists | "Ice Only," "Inline Only," "Colors Master," "Numbers Master" |
| Retention loop | Every short ends "Watch the full marathon Sunday!" · end screens last 20s on all videos · daily community poll |
| Compliance | **Every upload flagged "Made for Kids" (COPPA)**; comments off, no personalization, no in-video CTAs; public-domain songs only; generic vehicles only. Parent-facing links live in descriptions exclusively. |
| Week-1 analytics gate | If average watch time <40% by 2026-07-27: shorten loops, add whoosh density (SEO pack rule) before continuing the catalog |

---

## 6. Conversion Path Verification Ledger

| CTA destination | Verified | Notes |
|---|---|---|
| `www.bigice.co.ke` + `nairobihockey.com/register?tier=combine_27500&source=bigice` | ✅ 2026-07-20 | Lead magnet copy live on disk: `content/lead-magnets/biif-balance-manual.md` (WhatsApp keyword "BALANCE") |
| WhatsApp `+254 724 324 529` | ✅ | Serves BIIF + NRHL admissions; split before scale |
| `www.nairobihockey.com` + `nairobihockey.com/register?tier=combine_27500&source=nrhl` | ⚠️ FORM LIVE / **SITE STALE (D-8)** | Site still shows Aug 2026 launch + July 31 Lockout — must be rewritten to January 2027 + Fall Combine tracks BEFORE any combine sales row posts |
| X `https://x.com/AthlyticaOS` | ⚠️ founder-asserted | Login-walled to fetch; confirm public render before linking in paid assets |
| LinkedIn `https://www.linkedin.com/company/athlytica-performance-intelligence/` | ⚠️ founder-asserted | Login-walled to fetch; company entity is the standardized Athlytica B2B destination |
| The Hub Karen venue (C-SEP dependency) | ❌ NOT CONTRACTED | No dated Clinic Track session may be sold until the recurring venue contract signs (04 §4.5, D-9) |
| `www.athlyticahq.com` + `nairobihockey.com/register?tier=baseline_7500&source=athlytica` | ✅ 2026-07-20 | Audit schema on disk: `content/lead-magnets/athlytica-b2b-schema.md` |
| `app.athlyticahq.com` | ✅ | Screen-capture source only; not a public CTA |
| M-Pesa Paybill **880100** + issued registration reference | ✅ `config/payment-rail.ts` | Verbatim string per §2.4 only. **1010539223 never appears publicly (D-1).** ⚠️ D-7: automated settlement NOT live — no STK/automation claims until `G-W6-PAY` settles (`04_NOTION_SYNC_MAP.md` §4.3) |
| `youtube.com/@kikofriendsTV` | ✅ **verified 2026-07-20** | Channel ID `UC3b-K64INQYAtK1R2PGREvg` — permanent tracking record |

---

## 7. Standing Orders for Downstream Models

1. Authority chain holds: this manual < repository state < live endpoints. Reconcile, don't assume.
2. **Never** publish `1010539223` as a payment reference (D-1). §2.4's verbatim string is the only sanctioned payment wording.
3. **Never** claim automated payment collection is live while D-7 stands. Check `04_NOTION_SYNC_MAP.md` §4.3/§4.5 gate state before producing any NRHL payment-adjacent asset — combine revenue is now the blocked cash flow.
3a. **Timeline law:** league match-play is **January 2027** (04 §4.4). Any asset referencing an August 2026 launch, the July 31 Lockout, or Aug 22 Draft Day is a defect, not a draft. Combine fees (7,500 / 27,500 / 45,000 KES) are always stated as **flat one-time full-phase packages — never monthly**.
3b. **Sequencing law (D-8/D-9):** Strategic Evolution announcement + site update precede all combine sales content; The Hub Karen contract precedes any dated Clinic Track sale; insurance/Joker Floors are "finalizing/advancing" until signed.
4. **Never** fabricate traction or named case studies for Athlytica (D-3). Site aggregates only, quoted exactly.
5. Kiko uploads without the "Made for Kids" flag are a compliance breach, not a growth hack. Episode order and Sunday compilation contents come from `content/kiko-master-scripts.md` — do not improvise the catalog.
6. Shot IDs in §4 resolve to `content/shoot-list.md`. A missed shoot block falls back to the footage bank — a matrix row is never skipped for lack of new footage.
7. Metricool is the single scheduling plane; recap assets (D30 pattern) report measured numbers only.
8. Rev 1's matrix (2026-07-13 → 2026-08-11) is retired; its hooks remain valid corpus for reuse.

*End of manual 06 Rev 2. Compiled from verified repository state, live endpoints, production database evidence, and founder-supplied asset packs — 2026-07-20.*
