-- =====================================================================
-- BIG ICE CATALOG METADATA + SIBLING/RENEWAL REGISTRATIONS
--
-- TWO DEFECTS, ONE MIGRATION, because they are the same defect seen from
-- two ends: the checkout could not describe what it was selling, and it
-- could not sell twice to the same household.
--
-- 1. registrations.msisdn_hash was UNIQUE. One phone number could hold
--    exactly one registration, forever. Consequences, both live:
--      * A parent registering a SECOND CHILD reused the first child's
--        open row and OVERWROTE athlete_name — the first registration
--        was destroyed before it settled.
--      * Once one registration settled, the same phone got
--        409 ALREADY_SETTLED. A parent with two children could not
--        register the second, and no family could ever renew.
--    bigice-athlete.ts has a carefully-built "known household, unseen
--    name — sibling" branch that the registration path could never
--    reach, because the row never got created.
--
--    The idempotency key was never the phone. It is the CHECKOUT INTENT:
--    this household, this child, this programme, not yet paid. Refreshing
--    the browser collapses onto the same row; a different child or a
--    different programme opens a new one; a settled row is closed and a
--    renewal opens another.
--
-- 2. commercial_price_tier carried a name and a price and nothing else,
--    so the registration card could not answer "how long", "what does my
--    child actually do", "what do we receive". The copy below is
--    transcribed VERBATIM from bigice.co.ke's data.js — the page the
--    parent read before arriving. Nothing here is invented, and the
--    fields bigice.co.ke marks [VERIFY] (age range, venue list) are left
--    NULL so the card omits the row rather than publishing a guess.
-- =====================================================================

begin;

-- ---------------------------------------------------------------- 1 --

alter table public.registrations
  drop constraint if exists registrations_msisdn_hash_key;
drop index if exists public.registrations_msisdn_hash_key;

-- Still indexed: the settlement RPC falls back to hash matching when a
-- callback carries no AccountReference, and that lookup stays hot.
create index if not exists registrations_msisdn_hash_idx
  on public.registrations (msisdn_hash)
  where msisdn_hash is not null;

-- The checkout-intent key. Normalisation mirrors normaliseName() in
-- lib/services/bigice-athlete.ts — change one, change both, or the route
-- and the index disagree about what counts as the same child.
create unique index if not exists registrations_open_checkout_key
  on public.registrations (
    msisdn_hash,
    lower(regexp_replace(coalesce(athlete_name, ''), '[^a-zA-Z0-9]+', ' ', 'g')),
    coalesce(tier, '')
  )
  where msisdn_hash is not null and payment_status <> 'PAYMENT_SETTLED';

-- ---------------------------------------------------------------- 2 --

alter table public.commercial_price_tier
  add column if not exists description       text,
  add column if not exists best_for          text,
  add column if not exists age_range         text,
  add column if not exists duration_label    text,
  add column if not exists session_format    text,
  add column if not exists sessions_included text,
  add column if not exists location          text,
  add column if not exists inclusions        text[] not null default '{}',
  add column if not exists display_order     integer not null default 0,
  add column if not exists is_featured       boolean not null default false;

comment on column public.commercial_price_tier.sessions_included is
  'NULL is a real answer for the open-ended development programmes: '
  'bigice.co.ke states training frequency is set with the coach and there '
  'is no fixed weekly number. The card says so rather than showing a blank.';
comment on column public.commercial_price_tier.age_range is
  'NULL until Big Ice confirms it — bigice.co.ke still carries a [VERIFY] '
  'marker on the age range. The card omits the row rather than guessing.';

-- Beginner Skating Programme — KSh 16,500
update public.commercial_price_tier set
  description = 'For first-time skaters, or athletes who need to establish fundamental skating skills before progressing into specialised training.',
  best_for = 'Children starting from zero, or athletes who need the fundamentals in place before specialising.',
  duration_label = '6 × 1-hour beginner sessions',
  session_format = 'Coached beginner sessions',
  sessions_included = '6 sessions of 1 hour',
  inclusions = array[
    'Balance and body control on skates',
    'Correct skating posture and a controlled forward glide',
    'Safe falling and recovery technique',
    'Basic obstacle manoeuvres',
    'Light tricks appropriate to the athlete''s ability',
    'Hops and controlled small turns'
  ],
  display_order = 10
where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000007';

-- 3-Month Development — KSh 95,000
update public.commercial_price_tier set
  description = 'Structured development in a chosen discipline, with an initial assessment, progression tracking and an end-of-programme report.',
  best_for = 'Athletes who want to begin structured development, explore a discipline, or test their commitment before a longer-term investment.',
  duration_label = '3-month development programme',
  session_format = 'Coached training, scheduled with your coach around booked rink time',
  inclusions = array[
    'Structured training tailored to the selected discipline',
    'Initial skill assessment',
    'Progression tracking against discipline-specific metrics',
    'Video analysis where appropriate',
    'Technical coaching feedback',
    'Fitness / performance assessment where relevant',
    'Progress report at the end of the programme',
    'Parent portal with the athlete''s Big Ice record'
  ],
  display_order = 20
where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000004';

-- 6-Month Development — KSh 180,000  (Most Popular on bigice.co.ke)
update public.commercial_price_tier set
  description = 'Everything in the 3-month programme, across a longer development window with assessments throughout rather than only at the end.',
  best_for = 'Athletes who want enough time to develop meaningful technical progression and build consistency in their chosen discipline.',
  duration_label = '6-month development programme',
  session_format = 'Coached training, scheduled with your coach around booked rink time',
  inclusions = array[
    'Structured training tailored to the selected discipline',
    'Initial skill assessment',
    'Ongoing skill assessments through the programme',
    'Video analysis and movement feedback where appropriate',
    'Targeted technical coaching',
    'Fitness / performance assessment where relevant',
    'Progress reports tailored to the athlete''s discipline',
    'Technical milestones set for the athlete',
    'Competition / event preparation for competitive disciplines',
    'Parent portal with the athlete''s Big Ice record'
  ],
  display_order = 30,
  is_featured = true
where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000005';

-- 12-Month Development — KSh 350,000
update public.commercial_price_tier set
  description = 'A long-term development pathway with a structured roadmap, regular assessment and progression through multiple stages of technical development.',
  best_for = 'Athletes committing to a discipline who want a full year of structured development and ongoing performance feedback.',
  duration_label = '12-month development programme',
  session_format = 'Coached training, scheduled with your coach around booked rink time',
  inclusions = array[
    'Long-term development plan for the selected discipline',
    'Regular skill assessments through the year',
    'Video and technical analysis',
    'Fitness / performance assessment tailored to the discipline',
    'Discipline-specific reporting — a hockey athlete and a slalom athlete are not assessed the same way',
    'Progress reviews showing where the athlete started and what comes next',
    'Competition / event preparation where the discipline involves competition',
    'Parent portal with the athlete''s Big Ice record'
  ],
  display_order = 40
where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000006';

commit;
