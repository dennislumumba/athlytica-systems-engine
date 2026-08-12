-- =====================================================================
-- M4 — PAYMENT AUTHORIZATION BOUNDARY (F-1, F-5)
--
-- Phase 0.3E. Follows M2 (record_classification) and M3 (replay
-- integrity). Depends on both.
--
-- ─────────────────────────────────────────────────────────────────────
-- THE DEFECT (F-1)
--
-- settle_payment_transaction checks record_classification AFTER
-- inserting the ledger row, and can therefore only match a
-- classification that already exists. A receipt number is minted by
-- Safaricom and first observed IN the callback, so for any genuinely
-- new TEST/AUDIT/DEMO payment there is nothing to match: v_is_production
-- reads true, the gate flips, users/athletes/athlete_tenant_links are
-- created, the registration settles, and Big Ice onboarding mints a
-- permanent Athlete ID and issues documents. Classifying it afterwards
-- removes it from revenue ONLY.
--
-- ─────────────────────────────────────────────────────────────────────
-- WHY THIS IS NOT FIXED BY CLASSIFYING EARLIER
--
-- It cannot be. The receipt does not exist before the callback. Any
-- scheme that asks "has someone marked this receipt as a test?" is
-- unanswerable on first arrival, by construction.
--
-- The question is inverted instead. M2 asks:
--
--     is this payment NOT production?          (default: PRODUCTION)
--
-- which is the correct default for REVENUE — a forgotten classification
-- over-counts money rather than hiding a real payment.
--
-- Service authorization asks the opposite question with the opposite
-- default:
--
--     is this payment POSITIVELY authorized?   (default: NOT_AUTHORIZED)
--
-- and that IS answerable on first arrival, from server-side facts only.
--
-- ─────────────────────────────────────────────────────────────────────
-- THE POSITIVE EVIDENCE, AND WHY IT IS SOUND
--
-- A production payment is one that MATCHED A REGISTRATION CREATED BY THE
-- PRODUCTION INTAKE FUNNEL. registrations rows are written only by
-- /api/v1/biz/stk-push and /api/v1/auth/register, whose venture_context
-- and amount_expected_kes are derived server-side from the tier table —
-- never from a client field.
--
-- This is not a theory. Measured against production on 2026-08-12, all
-- five synthetic payment_events match ZERO registrations:
--
--   receipt        amount      account_reference  ref_match  hash_match
--   AUDITTEST001   180000.00   ATH-SZTV                   0           0
--   AUDITTEST002   350000.00   ATH-TRKK                   0           0
--   AUDITTEST003    16500.00   ATH-BF9V                   0           0
--   AUDITTEST004    95000.00   ATH-R7K2                   0           0
--   SGX7HQ2LM9      16500.00   ATH-9GG9                   0           0
--
-- Every one of them fails this rule naturally, with no classification
-- row required. The rule would have blocked all five on first arrival.
--
-- ─────────────────────────────────────────────────────────────────────
-- TRUSTED CLASSIFICATION SOURCES, IN PRECEDENCE ORDER
--
-- Every one is server-side. NONE is settable by a caller.
--
--   1. record_classification   — the owner's explicit decision. Outranks
--                                everything below it, so a payment that
--                                matched a real registration can still be
--                                demoted to TEST after the fact (F-2).
--   2. payment_reconciliation_exception, unresolved — disputed evidence
--                                is never authorization.
--   3. rail environment        — DARAJA_ENV. Sandbox Daraja accepts every
--                                well-formed STK request and calls back;
--                                nothing arriving on that rail is money.
--                                Read from process.env by the ONE
--                                TypeScript caller and passed in, because
--                                Postgres cannot see the app's env.
--   4. matched registration    — the intent record described above.
--   5. nothing matched         — NOT_AUTHORIZED. The default.
--
-- ─────────────────────────────────────────────────────────────────────
-- VENTURE ISOLATION (F-5)
--
-- The old fallback matched a household's open registrations by
-- msisdn_hash with NO venture predicate, using amount only as an ORDER BY
-- preference. A Big Ice payment could settle an NRHL registration
-- whenever amounts tied or amount_expected_kes was null.
--
-- Amount is now a HARD FILTER and it is applied WITHIN a venture, never
-- across one. A household whose open registrations span more than one
-- venture is not guessed at: it is RECONCILIATION_REQUIRED, and the
-- evidence is preserved.
--
-- payment_events is NOT modified by this migration. No row is updated,
-- deleted or reclassified. The append-only trigger is untouched.
-- =====================================================================


-- ── 1. Widen the exception vocabulary ───────────────────────────────
-- Two new kinds, both meaning "we refused to guess". Existing rows and
-- kinds are unaffected.
alter table public.payment_reconciliation_exception
  drop constraint if exists payment_reconciliation_exception_kind_check;

alter table public.payment_reconciliation_exception
  add constraint payment_reconciliation_exception_kind_check
  check (kind in ('CONFLICTING_REPLAY','UNMATCHED_SETTLEMENT','AMOUNT_MISMATCH',
                  'AMBIGUOUS_VENTURE','AMBIGUOUS_REGISTRATION'));


-- ── 2. THE AUTHORIZATION RULE — one authoritative source ────────────
-- Every path that can create production customer value calls this, via
-- lib/services/payment-authorization.ts. Nothing re-implements it.
--
-- Returns exactly one of:
--   AUTHORIZED              — may create an athlete, enrollment, documents
--   NOT_AUTHORIZED          — may not, and this is a settled fact
--   RECONCILIATION_REQUIRED — may not, and a human must look at it
--
-- p_rail_is_production is supplied by the caller because it lives in the
-- application environment (DARAJA_ENV), not the database. It is read from
-- process.env in one place and is not reachable from any request body.
-- Passing false is always the safe direction; passing null denies.
create or replace function public.payment_service_authorization(
  p_receipt            text,
  p_venture            text,
  p_rail_is_production boolean
) returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_event        public.payment_events%rowtype;
  v_class        text;
  v_open_excs    integer;
  v_reg          public.registrations%rowtype;
  v_reg_count    integer;
begin
  -- Deny before anything else is examined.
  if p_receipt is null or btrim(p_receipt) = '' then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','RECEIPT_ABSENT');
  end if;
  if p_venture is null or btrim(p_venture) = '' then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','VENTURE_NOT_SPECIFIED');
  end if;

  -- (a) The payment must exist in the ledger. A receipt string supplied
  --     by any caller is an identifier, never proof (F-3).
  select * into v_event from public.payment_events
   where mpesa_receipt_number = p_receipt;
  if not found then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','NO_PAYMENT_EVENT',
                              'receipt', p_receipt);
  end if;

  if v_event.result_code is distinct from 0 then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','NOT_SETTLEMENT_EVIDENCE',
                              'receipt', p_receipt);
  end if;

  -- (b) The owner's explicit classification outranks every inference
  --     below. This is what makes a post-hoc TEST marking actually stop
  --     service, which is the whole of F-2.
  select c.classification into v_class
    from public.record_classification c
   where c.record_table = 'payment_events'
     and c.record_id    = p_receipt;
  if v_class is not null and v_class <> 'PRODUCTION' then
    return jsonb_build_object('status','NOT_AUTHORIZED',
                              'reason','CLASSIFIED_' || v_class,
                              'receipt', p_receipt);
  end if;

  -- (c) Disputed evidence is never authorization.
  select count(*) into v_open_excs
    from public.payment_reconciliation_exception e
   where e.mpesa_receipt_number = p_receipt
     and e.resolved_at is null;
  if v_open_excs > 0 then
    return jsonb_build_object('status','RECONCILIATION_REQUIRED',
                              'reason','OPEN_RECONCILIATION_EXCEPTION',
                              'receipt', p_receipt,
                              'open_exceptions', v_open_excs);
  end if;

  -- (d) The rail must be the real one. Sandbox Daraja calls back for
  --     every well-formed request; that is a test harness, not money.
  if p_rail_is_production is distinct from true then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','NON_PRODUCTION_RAIL',
                              'receipt', p_receipt);
  end if;

  -- (e) POSITIVE EVIDENCE: a settled registration from the production
  --     intake funnel names this receipt. Absence denies.
  select count(*) into v_reg_count
    from public.registrations r
   where r.settled_receipt = p_receipt
     and r.payment_status  = 'PAYMENT_SETTLED';

  if v_reg_count = 0 then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','NO_SETTLED_REGISTRATION',
                              'receipt', p_receipt);
  end if;
  if v_reg_count > 1 then
    return jsonb_build_object('status','RECONCILIATION_REQUIRED',
                              'reason','MULTIPLE_SETTLED_REGISTRATIONS',
                              'receipt', p_receipt, 'registrations', v_reg_count);
  end if;

  select * into v_reg from public.registrations r
   where r.settled_receipt = p_receipt and r.payment_status = 'PAYMENT_SETTLED';

  -- (f) Venture identity must be explicit and must match. Never inferred
  --     from amount, phone, receipt shape or price.
  if v_reg.venture_context is null then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','VENTURE_UNKNOWN',
                              'receipt', p_receipt, 'registration_id', v_reg.id);
  end if;
  if v_reg.venture_context <> p_venture then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','VENTURE_MISMATCH',
                              'receipt', p_receipt, 'registration_id', v_reg.id,
                              'venture_context', v_reg.venture_context,
                              'requested_venture', p_venture);
  end if;

  -- (g) What was paid must cover what was asked.
  if v_reg.amount_expected_kes is not null
     and v_event.amount_kes < v_reg.amount_expected_kes then
    return jsonb_build_object('status','NOT_AUTHORIZED','reason','UNDERPAID',
                              'receipt', p_receipt, 'registration_id', v_reg.id,
                              'amount_expected_kes', v_reg.amount_expected_kes,
                              'amount_received_kes', v_event.amount_kes);
  end if;

  return jsonb_build_object('status','AUTHORIZED','reason','MATCHED_PRODUCTION_REGISTRATION',
                            'receipt', p_receipt, 'registration_id', v_reg.id,
                            'venture_context', v_reg.venture_context);
end;
$function$;

comment on function public.payment_service_authorization(text,text,boolean) is
  'THE authorization rule. AUTHORIZED / NOT_AUTHORIZED / RECONCILIATION_REQUIRED. '
  'Default is NOT_AUTHORIZED: service authorization requires positive server-derived '
  'evidence, unlike revenue classification which is PRODUCTION by absence. No path may '
  'create an athlete, enrollment, document or portal entitlement without AUTHORIZED. '
  'See docs/phase0/PAYMENT_AUTHORIZATION_BOUNDARY.md.';

revoke all on function public.payment_service_authorization(text,text,boolean)
  from public, anon, authenticated;
grant execute on function public.payment_service_authorization(text,text,boolean)
  to service_role;


-- ── 3. Venture-constrained settlement matching (F-5) ────────────────
-- Only the matching block changes. The replay check, the classification
-- gate, the account-construction block and the append-only posture are
-- carried over from M3 verbatim.
create or replace function public.settle_payment_transaction(
  p_receipt           text,
  p_amount_kes        numeric,
  p_msisdn_hash       text,
  p_account_reference text,
  p_result_code       integer,
  p_tx_ts             timestamptz
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ledger_id     uuid;
  v_reg           public.registrations%rowtype;
  v_matched       boolean := false;
  v_user_id       uuid;
  v_athlete_id    uuid;
  v_existing      public.payment_events%rowtype;
  v_is_production boolean;
  v_ventures      text[];
  v_candidates    integer;
begin
  if p_result_code <> 0 then
    raise exception 'settle_payment_transaction: result_code % is not settlement evidence', p_result_code;
  end if;

  -- ── REPLAY CHECK (M3, unchanged) ──────────────────────────────────
  select * into v_existing from public.payment_events
   where mpesa_receipt_number = p_receipt;

  if found then
    return public._payment_replay_verdict(v_existing, p_receipt, p_amount_kes,
                                          p_msisdn_hash, p_account_reference,
                                          p_result_code, p_tx_ts);
  end if;

  -- ── NEW RECEIPT: the ledger records what arrived, always ──────────
  begin
    insert into public.payment_events
      (gate_id, mpesa_receipt_number, amount_kes, msisdn_hash,
       account_reference, result_code, transaction_timestamp)
    values
      ('G-W6-PAY', p_receipt, p_amount_kes, p_msisdn_hash,
       p_account_reference, p_result_code, p_tx_ts)
    returning id into v_ledger_id;
  exception when unique_violation then
    select * into v_existing from public.payment_events
     where mpesa_receipt_number = p_receipt;
    return public._payment_replay_verdict(v_existing, p_receipt, p_amount_kes,
                                          p_msisdn_hash, p_account_reference,
                                          p_result_code, p_tx_ts);
  end;

  -- ── CLASSIFICATION GATE (M2/M3, unchanged) ────────────────────────
  -- Still only fires for a PRE-EXISTING classification, which is exactly
  -- why it is no longer the boundary. It is retained because a receipt
  -- classified in advance (a known synthetic replayed by ops) should not
  -- even reach matching. The real boundary is
  -- payment_service_authorization, enforced by every consumer.
  v_is_production := not exists (
    select 1 from public.record_classification c
     where c.record_table = 'payment_events'
       and c.record_id    = p_receipt
       and c.classification <> 'PRODUCTION'
  );

  if not v_is_production then
    return jsonb_build_object(
      'outcome',   'TEST_CLASSIFIED',
      'receipt',   p_receipt,
      'ledger_id', v_ledger_id,
      'registration_id', null,
      'note', 'Recorded in the ledger but excluded from settlement, revenue and gate evidence by record_classification.'
    );
  end if;

  -- ── MATCH 1: account reference equality ───────────────────────────
  -- registrations.account_reference is UNIQUE, so this resolves to at
  -- most one row and carries its own venture with it. Safe as-is.
  select * into v_reg from public.registrations
   where account_reference = p_account_reference
     and payment_status <> 'PAYMENT_SETTLED'
   limit 1;
  v_matched := found;

  -- ── MATCH 2: household fallback, VENTURE-CONSTRAINED (F-5) ────────
  -- STK callbacks do not echo AccountReference, so real Daraja
  -- settlements routinely land here. It must not guess across ventures.
  if not v_matched then
    select array_agg(distinct coalesce(r.venture_context,'__NULL__'))
      into v_ventures
      from public.registrations r
     where r.msisdn_hash = p_msisdn_hash
       and r.payment_status <> 'PAYMENT_SETTLED';

    if v_ventures is not null and cardinality(v_ventures) > 1 then
      -- The household holds open registrations in more than one venture.
      -- Amount is NOT allowed to break this tie: it is not venture
      -- identity. Refuse, preserve the evidence, settle nothing.
      insert into public.payment_reconciliation_exception
        (mpesa_receipt_number, kind, stored, incoming, differing_fields)
      values
        (p_receipt, 'AMBIGUOUS_VENTURE',
         jsonb_build_object('open_ventures', to_jsonb(v_ventures)),
         jsonb_build_object('amount_kes', p_amount_kes,
                            'account_reference', p_account_reference,
                            'transaction_timestamp', p_tx_ts),
         v_ventures);

      return jsonb_build_object(
        'outcome', 'RECONCILIATION_REQUIRED', 'receipt', p_receipt,
        'ledger_id', v_ledger_id, 'registration_id', null,
        'reason', 'AMBIGUOUS_VENTURE', 'open_ventures', to_jsonb(v_ventures)
      );
    end if;

    -- Exactly one venture (or none open). Amount may now disambiguate
    -- BETWEEN SIBLINGS IN THAT VENTURE — and only there. It is never an
    -- exclusion filter, because excluding on amount would turn a genuine
    -- underpayment into an unmatched settlement and lose the
    -- SETTLED_UNDERPAID signal that ops needs.
    select count(*) into v_candidates
      from public.registrations r
     where r.msisdn_hash = p_msisdn_hash
       and r.payment_status <> 'PAYMENT_SETTLED';

    if v_candidates = 1 then
      select * into v_reg from public.registrations r
       where r.msisdn_hash = p_msisdn_hash
         and r.payment_status <> 'PAYMENT_SETTLED';
      v_matched := found;

    elsif v_candidates > 1 then
      -- Several open registrations, one venture. An exact amount match is
      -- allowed to pick between them, but only if it picks exactly one.
      select count(*) into v_candidates
        from public.registrations r
       where r.msisdn_hash = p_msisdn_hash
         and r.payment_status <> 'PAYMENT_SETTLED'
         and r.amount_expected_kes = p_amount_kes;

      if v_candidates = 1 then
        select * into v_reg from public.registrations r
         where r.msisdn_hash = p_msisdn_hash
           and r.payment_status <> 'PAYMENT_SETTLED'
           and r.amount_expected_kes = p_amount_kes;
        v_matched := found;
      else
        insert into public.payment_reconciliation_exception
          (mpesa_receipt_number, kind, stored, incoming, differing_fields)
        values
          (p_receipt, 'AMBIGUOUS_REGISTRATION',
           jsonb_build_object('amount_matches', v_candidates,
                              'venture', to_jsonb(v_ventures)),
           jsonb_build_object('amount_kes', p_amount_kes,
                              'account_reference', p_account_reference,
                              'transaction_timestamp', p_tx_ts),
           array[]::text[]);

        return jsonb_build_object(
          'outcome', 'RECONCILIATION_REQUIRED', 'receipt', p_receipt,
          'ledger_id', v_ledger_id, 'registration_id', null,
          'reason', 'AMBIGUOUS_REGISTRATION', 'amount_matches', v_candidates
        );
      end if;
    end if;
  end if;

  if not v_matched then
    insert into public.payment_reconciliation_exception
      (mpesa_receipt_number, kind, stored, incoming, differing_fields)
    values
      (p_receipt, 'UNMATCHED_SETTLEMENT',
       '{}'::jsonb,
       jsonb_build_object('amount_kes', p_amount_kes,
                          'account_reference', p_account_reference,
                          'transaction_timestamp', p_tx_ts),
       array[]::text[]);

    return jsonb_build_object(
      'outcome', 'SETTLED_UNMATCHED', 'receipt', p_receipt,
      'ledger_id', v_ledger_id, 'registration_id', null
    );
  end if;

  -- ── GATE: evidence is a settlement that MATCHED A PURCHASE ────────
  -- Moved below matching (M3 flipped it before). G-W6-PAY's KPI is
  -- "first validated M-Pesa settlement event logged", and a settlement
  -- matching no registration is precisely the AUDITTEST001 situation
  -- that flipped this gate falsely in the first place.
  --
  -- A SECOND BUG, CAUGHT BY THE PRE-APPLY TEST: this was
  -- `on conflict (gate_id) do nothing`, and M3 step 5 left the row in
  -- place with live=false. DO NOTHING against an existing row does
  -- nothing, so G-W6-PAY could never flip again — the gate was
  -- permanently stuck false and M3's reset was therefore irreversible by
  -- any real payment. Zero impact today (nothing reads gate_states), and
  -- it would have been discovered the day the draft engine was wired up.
  --
  -- The WHERE clause makes this flip exactly once: the first matched
  -- production settlement becomes the evidence and no later payment
  -- overwrites it.
  insert into public.gate_states (gate_id, live, live_at, evidence)
  values ('G-W6-PAY', true, p_tx_ts, p_receipt)
  on conflict (gate_id) do update
    set live     = true,
        live_at  = excluded.live_at,
        evidence = excluded.evidence
  where public.gate_states.live is distinct from true;

  if v_reg.amount_expected_kes is not null and p_amount_kes < v_reg.amount_expected_kes then
    return jsonb_build_object(
      'outcome', 'SETTLED_UNDERPAID', 'receipt', p_receipt,
      'ledger_id', v_ledger_id, 'registration_id', v_reg.id,
      'amount_expected_kes', v_reg.amount_expected_kes,
      'amount_received_kes', p_amount_kes
    );
  end if;

  if v_reg.email is not null and v_reg.tenant_id is not null then
    insert into public.users (email, role, tenant_id)
    values (lower(v_reg.email), 'ATHLETE', v_reg.tenant_id)
    on conflict (email) do update set updated_at = now()
    returning id into v_user_id;

    insert into public.athletes (user_id) values (v_user_id)
    on conflict (user_id) do nothing;

    select id into v_athlete_id from public.athletes where user_id = v_user_id;

    insert into public.athlete_tenant_links (athlete_id, tenant_id)
    values (v_athlete_id, v_reg.tenant_id)
    on conflict (athlete_id, tenant_id) do nothing;
  end if;

  update public.registrations
     set payment_status  = 'PAYMENT_SETTLED',
         settled_receipt = p_receipt,
         settled_at      = p_tx_ts,
         athlete_id      = coalesce(v_athlete_id, athlete_id)
   where id = v_reg.id;

  return jsonb_build_object(
    'outcome', 'SETTLED', 'receipt', p_receipt, 'ledger_id', v_ledger_id,
    'registration_id', v_reg.id, 'user_id', v_user_id, 'athlete_id', v_athlete_id,
    'venture_context', v_reg.venture_context
  );
end;
$function$;
