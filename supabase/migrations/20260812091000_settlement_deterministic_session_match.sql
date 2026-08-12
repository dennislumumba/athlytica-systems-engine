-- =====================================================================
-- DETERMINISTIC SESSION MATCHING IN settle_payment_transaction
--
-- The msisdn_hash fallback was `select ... where msisdn_hash = $1 and
-- payment_status <> 'PAYMENT_SETTLED' limit 1` with NO ORDER BY. That was
-- harmless only while registrations.msisdn_hash was UNIQUE — at most one
-- row could match. 20260812090000 lifted that constraint so a household
-- can register a second child and can renew, which means the fallback can
-- now see several open rows for one phone and `limit 1` would pick
-- whichever the planner happened to return.
--
-- Getting it wrong credits one child's payment to their sibling's
-- registration, which then drives the athlete match, the enrollment, the
-- receipt and the welcome pack. So the fallback is ordered, and the
-- ordering is the amount:
--
--   1. Rows whose expected amount EQUALS the amount actually received.
--      Two open registrations for one household are almost always for
--      different programmes, so the money identifies the intent.
--   2. Then the most recently STK-pushed row — the checkout the parent
--      had open when they entered their PIN.
--   3. Then most recently created, so the ordering is total.
--
-- The account_reference branch above it is unchanged and still wins: a
-- manual Paybill payment keyed to ATH-XXXX names its registration exactly
-- and never reaches this fallback.
-- =====================================================================

create or replace function public.settle_payment_transaction(
  p_receipt text,
  p_amount_kes numeric,
  p_msisdn_hash text,
  p_account_reference text,
  p_result_code integer,
  p_tx_ts timestamp with time zone
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_ledger_id       uuid;
  v_reg             public.registrations%rowtype;
  v_matched         boolean := false;
  v_user_id         uuid;
  v_athlete_id      uuid;
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

  -- 1. Exact reference. A manual Paybill payment names its registration.
  select * into v_reg from public.registrations
   where account_reference = p_account_reference
     and payment_status <> 'PAYMENT_SETTLED'
   limit 1;
  v_matched := found;

  -- 2. Phone fallback — STK callbacks do not echo AccountReference.
  --    Ordered, because a household may now hold several open rows.
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
    return jsonb_build_object(
      'outcome', 'SETTLED_UNMATCHED',
      'receipt', p_receipt,
      'ledger_id', v_ledger_id,
      'registration_id', null
    );
  end if;

  if v_reg.amount_expected_kes is not null and p_amount_kes < v_reg.amount_expected_kes then
    return jsonb_build_object(
      'outcome', 'SETTLED_UNDERPAID',
      'receipt', p_receipt,
      'ledger_id', v_ledger_id,
      'registration_id', v_reg.id,
      'amount_expected_kes', v_reg.amount_expected_kes,
      'amount_received_kes', p_amount_kes
    );
  end if;

  if v_reg.email is not null and v_reg.tenant_id is not null then
    insert into public.users (email, role, tenant_id)
    values (lower(v_reg.email), 'ATHLETE', v_reg.tenant_id)
    on conflict (email) do update set updated_at = now()
    returning id into v_user_id;

    insert into public.athletes (user_id)
    values (v_user_id)
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
    'outcome', 'SETTLED',
    'receipt', p_receipt,
    'ledger_id', v_ledger_id,
    'registration_id', v_reg.id,
    'user_id', v_user_id,
    'athlete_id', v_athlete_id
  );
end;
$function$;
