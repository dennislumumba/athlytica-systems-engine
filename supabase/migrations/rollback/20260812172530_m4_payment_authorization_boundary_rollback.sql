-- =====================================================================
-- ROLLBACK — M4 PAYMENT AUTHORIZATION BOUNDARY
--
-- Restores settle_payment_transaction to its M3 body verbatim and drops
-- the authorization function. Touches NO data: payment_events,
-- record_classification, registrations and gate_states are all left
-- exactly as they are.
--
-- ⚠ ORDER OF OPERATIONS. Roll back the APPLICATION FIRST. M4's consumers
-- (mpesa-callback, retry-onboarding, onboard-paid-athlete, via
-- lib/services/payment-authorization.ts) call
-- payment_service_authorization; if the function disappears while they
-- are deployed, the RPC returns 42883 and those routes fail closed —
-- which is the safe direction, but it stops Big Ice onboarding entirely.
--
-- ⚠ THE KIND CHECK. Step 3 narrows payment_reconciliation_exception.kind
-- back to the M3 vocabulary. It will FAIL if any AMBIGUOUS_VENTURE or
-- AMBIGUOUS_REGISTRATION row has been written — which is correct: those
-- rows are evidence of a refused cross-venture settlement and must not
-- be deleted to make a rollback tidy. Resolve them, or leave the widened
-- CHECK in place (it is permissive and harmless under M3).
-- =====================================================================

-- ── 1. Drop the authorization rule ──────────────────────────────────
drop function if exists public.payment_service_authorization(text,text,boolean);


-- ── 2. Restore the M3 settlement function verbatim ──────────────────
-- Fallback matching returns to msisdn_hash with amount as an ORDER BY
-- preference and NO venture predicate, and the gate flip returns to
-- before matching. This reinstates F-5.
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

  select * into v_existing from public.payment_events
   where mpesa_receipt_number = p_receipt;

  if found then
    return public._payment_replay_verdict(v_existing, p_receipt, p_amount_kes,
                                          p_msisdn_hash, p_account_reference,
                                          p_result_code, p_tx_ts);
  end if;

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

  insert into public.gate_states (gate_id, live, live_at, evidence)
  values ('G-W6-PAY', true, p_tx_ts, p_receipt)
  on conflict (gate_id) do nothing;

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


-- ── 3. Narrow the exception vocabulary back to M3 ───────────────────
-- Fails if refusal evidence exists. See the header — that is deliberate.
alter table public.payment_reconciliation_exception
  drop constraint if exists payment_reconciliation_exception_kind_check;

alter table public.payment_reconciliation_exception
  add constraint payment_reconciliation_exception_kind_check
  check (kind in ('CONFLICTING_REPLAY','UNMATCHED_SETTLEMENT','AMOUNT_MISMATCH'));
