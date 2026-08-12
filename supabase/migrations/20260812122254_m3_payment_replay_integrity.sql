-- =====================================================================
-- M3 — PAYMENT REPLAY INTEGRITY (D-23)
--
-- APPLIED to production as version 20260812122254. Filename matches the
-- applied version deliberately (D-16 pattern, second file to do so).
--
-- TESTED BEFORE APPLY: 19/19 assertions passed inside a rolled-back
-- transaction against this exact schema. See docs/phase0/M3_TEST_RESULTS.md.
-- One real bug was caught by that test and fixed before apply:
-- `v_diff := v_diff || 'literal'` resolves to array||array and raised
-- 22P02 malformed array literal — it would have thrown on the FIRST
-- conflicting replay. Replaced with array_append().
--
-- ─────────────────────────────────────────────────────────────────────
-- WHAT THIS FIXES
--
-- The previous settle_payment_transaction wrote:
--
--     insert into payment_events (…) on conflict (mpesa_receipt_number)
--       do nothing returning id into v_ledger_id;
--     if v_ledger_id is null then return 'DUPLICATE'; end if;
--
-- It never compared the incoming amount, MSISDN, account reference or
-- transaction timestamp to the stored row. A replay of receipt X with a
-- DIFFERENT amount was reported as an exact duplicate and discarded.
-- That is a silent loss of conflicting financial evidence.
--
-- ─────────────────────────────────────────────────────────────────────
-- IMMUTABLE TRANSACTION ATTRIBUTES (duplicate equivalence set)
--
-- Established by inspecting public.payment_events, not invented:
--
--   gate_id                 -- which gate the settlement belongs to
--   amount_kes              -- what was paid
--   msisdn_hash             -- who paid (HMAC-SHA256, never the raw MSISDN)
--   account_reference       -- what it was paid for
--   transaction_timestamp   -- when Safaricom says it happened
--   result_code             -- CHECK-constrained to 0, included for completeness
--
-- DELIBERATELY EXCLUDED:
--   id          -- our surrogate key, assigned by us, never by the payer
--   created_at  -- when WE recorded it. A genuine retry legitimately has a
--                  LATER created_at; including it would make every retry a
--                  false conflict.
--
-- account_reference is safe to compare because the callback derives it
-- deterministically (app/api/v1/biz/mpesa-callback/route.ts:241-243):
-- a phone-bearing reference is canonicalised through HMAC with a fixed
-- key, and an opaque reference passes through untouched. The same input
-- always yields the same output. (If MSISDN_HASH_KEY were ever rotated
-- this would break — but utils/msisdn.ts already documents rotation as
-- catastrophic for settlement matching, so M3 introduces no new exposure.)
--
-- ─────────────────────────────────────────────────────────────────────
-- STATE MACHINE
--
--   receipt not seen                → record event, then:
--                                       classified non-PRODUCTION → TEST_CLASSIFIED
--                                       otherwise                 → settle, flip gate
--   receipt seen, all attrs equal   → DUPLICATE                (idempotent no-op)
--   receipt seen, any attr differs  → RECONCILIATION_REQUIRED  (evidence preserved,
--                                                               NO settlement)
--
-- payment_events remains APPEND-ONLY. No existing row is ever modified.
-- A conflicting replay is recorded in payment_reconciliation_exception,
-- never merged into the original event.
--
-- NO RESERVED-PREFIX GUARD. An earlier design rejected receipts matching
-- '^(AUDITTEST|TEST|DEMO)'. It is deliberately omitted: an M-Pesa receipt
-- is alphanumeric and could legitimately begin with those letters, and
-- silently rejecting a real customer payment is a worse failure than
-- recording a test one. Classification is explicit and reversible; a
-- prefix guess is neither.
-- =====================================================================

-- ── 1. Reconciliation exception ledger ──────────────────────────────
create table if not exists public.payment_reconciliation_exception (
  exception_id     uuid primary key default gen_random_uuid(),
  mpesa_receipt_number text not null,
  kind             text not null check (kind in
                     ('CONFLICTING_REPLAY','UNMATCHED_SETTLEMENT','AMOUNT_MISMATCH')),
  stored           jsonb not null,
  incoming         jsonb not null,
  differing_fields text[] not null,
  detected_at      timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by      text,
  resolution_note  text
);

comment on table public.payment_reconciliation_exception is
  'Conflicting or unmatched settlement evidence. Append-only in practice: rows are '
  'resolved by setting resolved_at/resolved_by, never deleted. payment_events is '
  'never modified to accommodate a conflict.';

create index if not exists idx_payment_recon_exception_open
  on public.payment_reconciliation_exception (mpesa_receipt_number)
  where resolved_at is null;

-- Same privilege posture as record_classification (M2). Default privileges
-- on `public` grant arwdDxtm to `authenticated`; left alone, any signed-in
-- user could delete evidence of a financial conflict.
alter table public.payment_reconciliation_exception enable row level security;
revoke all on public.payment_reconciliation_exception from anon, authenticated;
grant  all on public.payment_reconciliation_exception to   service_role;


-- ── 2. Production-only payment view (M2 consumer) ───────────────────
-- The classification table from M2 gains its first enforced consumer.
-- Absence of a classification row means PRODUCTION, so this view is the
-- full ledger minus anything explicitly marked otherwise.
create or replace view public.payment_events_production as
  select pe.*
    from public.payment_events pe
   where not exists (
     select 1 from public.record_classification c
      where c.record_table = 'payment_events'
        and c.record_id    = pe.mpesa_receipt_number
        and c.classification <> 'PRODUCTION'
   );

comment on view public.payment_events_production is
  'payment_events excluding anything classified TEST/AUDIT/DEMO. Financial and '
  'revenue aggregates MUST read this, not payment_events. See D-22/D-23.';

revoke all on public.payment_events_production from anon, authenticated;
grant  select on public.payment_events_production to service_role;


-- ── 3. Settlement with replay integrity ─────────────────────────────
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
  v_ledger_id    uuid;
  v_reg          public.registrations%rowtype;
  v_matched      boolean := false;
  v_user_id      uuid;
  v_athlete_id   uuid;
  v_existing     public.payment_events%rowtype;
  v_is_production boolean;
begin
  if p_result_code <> 0 then
    raise exception 'settle_payment_transaction: result_code % is not settlement evidence', p_result_code;
  end if;

  -- ── REPLAY CHECK ──────────────────────────────────────────────────
  select * into v_existing from public.payment_events
   where mpesa_receipt_number = p_receipt;

  if found then
    return public._payment_replay_verdict(v_existing, p_receipt, p_amount_kes,
                                          p_msisdn_hash, p_account_reference,
                                          p_result_code, p_tx_ts);
  end if;

  -- ── NEW RECEIPT ───────────────────────────────────────────────────
  begin
    insert into public.payment_events
      (gate_id, mpesa_receipt_number, amount_kes, msisdn_hash,
       account_reference, result_code, transaction_timestamp)
    values
      ('G-W6-PAY', p_receipt, p_amount_kes, p_msisdn_hash,
       p_account_reference, p_result_code, p_tx_ts)
    returning id into v_ledger_id;
  exception when unique_violation then
    -- A concurrent callback committed this receipt between our SELECT and
    -- our INSERT. Re-read the now-committed row and apply the same verdict
    -- logic: identical data is a duplicate, differing data is a conflict.
    -- This is what guarantees exactly one settlement under concurrency.
    select * into v_existing from public.payment_events
     where mpesa_receipt_number = p_receipt;
    return public._payment_replay_verdict(v_existing, p_receipt, p_amount_kes,
                                          p_msisdn_hash, p_account_reference,
                                          p_result_code, p_tx_ts);
  end;

  -- ── CLASSIFICATION GATE (D-22 consumer) ───────────────────────────
  -- The event is recorded either way: the ledger records what arrived.
  -- Classification governs INTERPRETATION — whether it settles anything
  -- and whether it constitutes gate evidence.
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

  -- ── GATE: only a PRODUCTION settlement is evidence ────────────────
  insert into public.gate_states (gate_id, live, live_at, evidence)
  values ('G-W6-PAY', true, p_tx_ts, p_receipt)
  on conflict (gate_id) do nothing;

  -- ── SESSION MATCHING (unchanged from the previous version) ────────
  select * into v_reg from public.registrations
   where account_reference = p_account_reference
     and payment_status <> 'PAYMENT_SETTLED'
   limit 1;
  v_matched := found;

  if not v_matched then
    select * into v_reg from public.registrations
     where msisdn_hash = p_msisdn_hash
       and payment_status <> 'PAYMENT_SETTLED'
     order by
       (amount_expected_kes is not null and amount_expected_kes = p_amount_kes) desc,
       stk_pushed_at desc nulls last,
       created_at desc
     limit 1;
    v_matched := found;
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
    'registration_id', v_reg.id, 'user_id', v_user_id, 'athlete_id', v_athlete_id
  );
end;
$function$;


-- ── 4. Replay verdict helper ────────────────────────────────────────
-- Extracted so the pre-check and the concurrent-race path apply exactly
-- the same rule. Two copies of this logic would eventually disagree.
create or replace function public._payment_replay_verdict(
  p_existing          public.payment_events,
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
declare v_diff text[] := array[]::text[];
begin
  if p_existing.amount_kes            is distinct from p_amount_kes        then v_diff := array_append(v_diff, 'amount_kes'); end if;
  if p_existing.msisdn_hash           is distinct from p_msisdn_hash       then v_diff := array_append(v_diff, 'msisdn_hash'); end if;
  if p_existing.account_reference     is distinct from p_account_reference then v_diff := array_append(v_diff, 'account_reference'); end if;
  if p_existing.transaction_timestamp is distinct from p_tx_ts             then v_diff := array_append(v_diff, 'transaction_timestamp'); end if;
  if p_existing.result_code           is distinct from p_result_code       then v_diff := array_append(v_diff, 'result_code'); end if;

  if cardinality(v_diff) = 0 then
    return jsonb_build_object('outcome','DUPLICATE','receipt',p_receipt,'ledger_id',p_existing.id);
  end if;

  -- CONFLICT. The stored event is NOT touched. The incoming evidence is
  -- preserved beside it and a human resolves which is correct.
  insert into public.payment_reconciliation_exception
    (mpesa_receipt_number, kind, stored, incoming, differing_fields)
  values
    (p_receipt, 'CONFLICTING_REPLAY',
     jsonb_build_object('amount_kes', p_existing.amount_kes,
                        'msisdn_hash', p_existing.msisdn_hash,
                        'account_reference', p_existing.account_reference,
                        'transaction_timestamp', p_existing.transaction_timestamp,
                        'result_code', p_existing.result_code,
                        'recorded_at', p_existing.created_at),
     jsonb_build_object('amount_kes', p_amount_kes,
                        'msisdn_hash', p_msisdn_hash,
                        'account_reference', p_account_reference,
                        'transaction_timestamp', p_tx_ts,
                        'result_code', p_result_code),
     v_diff);

  return jsonb_build_object(
    'outcome','RECONCILIATION_REQUIRED',
    'receipt', p_receipt,
    'ledger_id', p_existing.id,
    'registration_id', null,
    'differing_fields', to_jsonb(v_diff)
  );
end;
$function$;

revoke all on function public._payment_replay_verdict(public.payment_events,text,numeric,text,text,integer,timestamptz)
  from public, anon, authenticated;
grant execute on function public._payment_replay_verdict(public.payment_events,text,numeric,text,text,integer,timestamptz)
  to service_role;


-- ── 5. Gate repair ──────────────────────────────────────────────────
-- G-W6-PAY currently reads live=true, evidence='AUDITTEST001' — a receipt
-- confirmed synthetic (owner checked the Safaricom statement 2026-08-12).
-- Its KPI is "First validated M-Pesa settlement event logged" and that has
-- never occurred. gate_states has no immutability trigger, so this is a
-- correction, not a rewrite of financial history.
--
-- BLAST RADIUS: verified zero at time of writing. assertDraftEngineUnblocked(),
-- blockedGates() and GateBlockedError have NO callers outside
-- config/nrhl-gates.ts, and no application code reads gate_states. The row
-- is currently write-only. It becomes load-bearing the moment the draft
-- engine is wired up — which is exactly why it must be true before then.
update public.gate_states
   set live     = false,
       live_at  = null,
       evidence = null
 where gate_id  = 'G-W6-PAY'
   and evidence = 'AUDITTEST001';
