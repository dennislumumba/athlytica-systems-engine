-- =====================================================================
-- ROLLBACK for M3 — payment replay integrity (D-23)
--
-- STATUS: written before the forward migration was applied, per change
-- control. Not executed.
--
-- WHAT THIS UNDOES
--   1. Restores settle_payment_transaction to its pre-M3 body, in which
--      ANY repeat of a known receipt returns DUPLICATE without comparing
--      amount, MSISDN, account reference or transaction timestamp.
--   2. Restores the gate to live=true / evidence='AUDITTEST001'.
--   3. Drops the production-only view and the reconciliation ledger.
--
-- CONSEQUENCE OF RUNNING IT
--   Conflicting financial evidence is silently discarded again, and the
--   NRHL critical-path gate reads as met on a receipt confirmed absent
--   from the Safaricom statement. Prefer rolling FORWARD.
--
-- SAFETY
--   payment_events is never touched by M3 or by this rollback. No
--   settlement is reversed. The only data removed is reconciliation
--   metadata that M3 itself created.
-- =====================================================================

begin;

-- Refuse if unresolved conflicts exist: dropping the table would destroy
-- the only record that a payment discrepancy was ever detected.
do $$
declare n_open bigint;
begin
  if to_regclass('public.payment_reconciliation_exception') is null then
    raise notice 'payment_reconciliation_exception absent; nothing to roll back there.';
    return;
  end if;
  select count(*) into n_open
    from public.payment_reconciliation_exception where resolved_at is null;
  if n_open > 0 then
    raise exception
      'ROLLBACK REFUSED: % unresolved reconciliation exception(s). Resolve or export them before dropping the evidence.', n_open;
  end if;
end $$;

-- 1. Restore the pre-M3 settlement function verbatim.
create or replace function public.settle_payment_transaction(
  p_receipt text, p_amount_kes numeric, p_msisdn_hash text,
  p_account_reference text, p_result_code integer, p_tx_ts timestamptz
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_ledger_id uuid; v_reg public.registrations%rowtype; v_matched boolean := false;
  v_user_id uuid; v_athlete_id uuid;
begin
  if p_result_code <> 0 then
    raise exception 'settle_payment_transaction: result_code % is not settlement evidence', p_result_code;
  end if;

  insert into public.payment_events
    (gate_id, mpesa_receipt_number, amount_kes, msisdn_hash,
     account_reference, result_code, transaction_timestamp)
  values
    ('G-W6-PAY', p_receipt, p_amount_kes, p_msisdn_hash,
     p_account_reference, p_result_code, p_tx_ts)
  on conflict (mpesa_receipt_number) do nothing
  returning id into v_ledger_id;

  if v_ledger_id is null then
    return jsonb_build_object('outcome', 'DUPLICATE', 'receipt', p_receipt);
  end if;

  insert into public.gate_states (gate_id, live, live_at, evidence)
  values ('G-W6-PAY', true, p_tx_ts, p_receipt)
  on conflict (gate_id) do nothing;

  select * into v_reg from public.registrations
   where account_reference = p_account_reference and payment_status <> 'PAYMENT_SETTLED' limit 1;
  v_matched := found;

  if not v_matched then
    select * into v_reg from public.registrations
     where msisdn_hash = p_msisdn_hash and payment_status <> 'PAYMENT_SETTLED'
     order by (amount_expected_kes is not null and amount_expected_kes = p_amount_kes) desc,
              stk_pushed_at desc nulls last, created_at desc
     limit 1;
    v_matched := found;
  end if;

  if not v_matched then
    return jsonb_build_object('outcome','SETTLED_UNMATCHED','receipt',p_receipt,
      'ledger_id',v_ledger_id,'registration_id',null);
  end if;

  if v_reg.amount_expected_kes is not null and p_amount_kes < v_reg.amount_expected_kes then
    return jsonb_build_object('outcome','SETTLED_UNDERPAID','receipt',p_receipt,
      'ledger_id',v_ledger_id,'registration_id',v_reg.id,
      'amount_expected_kes',v_reg.amount_expected_kes,'amount_received_kes',p_amount_kes);
  end if;

  if v_reg.email is not null and v_reg.tenant_id is not null then
    insert into public.users (email, role, tenant_id)
    values (lower(v_reg.email), 'ATHLETE', v_reg.tenant_id)
    on conflict (email) do update set updated_at = now() returning id into v_user_id;
    insert into public.athletes (user_id) values (v_user_id) on conflict (user_id) do nothing;
    select id into v_athlete_id from public.athletes where user_id = v_user_id;
    insert into public.athlete_tenant_links (athlete_id, tenant_id)
    values (v_athlete_id, v_reg.tenant_id) on conflict (athlete_id, tenant_id) do nothing;
  end if;

  update public.registrations
     set payment_status='PAYMENT_SETTLED', settled_receipt=p_receipt,
         settled_at=p_tx_ts, athlete_id=coalesce(v_athlete_id, athlete_id)
   where id = v_reg.id;

  return jsonb_build_object('outcome','SETTLED','receipt',p_receipt,'ledger_id',v_ledger_id,
    'registration_id',v_reg.id,'user_id',v_user_id,'athlete_id',v_athlete_id);
end;
$function$;

-- 2. Restore the gate to its pre-M3 (synthetic) state.
update public.gate_states
   set live = true, live_at = '2026-08-11 22:20:23+00', evidence = 'AUDITTEST001'
 where gate_id = 'G-W6-PAY';

-- 3. Drop M3's structures.
drop view  if exists public.payment_events_production;
drop function if exists public._payment_replay_verdict(
  public.payment_events, text, numeric, text, text, integer, timestamptz);
drop table if exists public.payment_reconciliation_exception;

do $$
begin
  raise warning
    'ROLLBACK COMPLETE. Conflicting payment replays are once again reported as DUPLICATE and discarded, and G-W6-PAY reads live on a synthetic receipt.';
end $$;

commit;

-- =====================================================================
-- VERIFY AFTER ROLLBACK
--   select count(*) from public.payment_events;                        -- 5, unchanged
--   select live, evidence from public.gate_states where gate_id='G-W6-PAY';
--   select pg_get_functiondef(oid) ~ '_payment_replay_verdict'
--     from pg_proc where proname='settle_payment_transaction';         -- false
-- =====================================================================
