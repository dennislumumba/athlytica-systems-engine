-- =====================================================================
-- 20260713100000_registration_sessions_v2.sql
-- WORKFLOW INVERSION PATTERN — pre-payment registration session layer
-- (G-W6-PAY, due 2026-07-19; manuals 02/04/05)
--
-- ADDITIVE-ONLY DDL. Extends public.registrations into the full
-- RegistrationSession topology (profile capture BEFORE money moves) and
-- upgrades settle_payment_transaction into the polymorphic resolution
-- router + atomic account constructor.
--
-- DESIGN LAWS ENFORCED HERE:
--   1. DPA 2019 — raw MSISDN is NEVER persisted. The "phone number
--      unique lookup index" rides on msisdn_hash (HMAC-SHA256, 64 hex).
--      The customer-facing fallback account string "REG-<phone>" exists
--      only in the payer's M-Pesa app and in our HTTP response to the
--      registrant; it is canonicalized to a hash-derived reference
--      before any persistence.
--   2. Settled registration rows are RETAINED, not deleted. Paid
--      registration count is the G-W5-REG primary KPI, the row carries
--      the settled_receipt audit edge into the append-only ledger, and
--      G-W4-ROSTER links athletes from it. "Data bloat" at league scale
--      (hundreds of rows/season) is zero; destroyed audit trail is not.
--   3. Account construction (users/athletes/athlete_tenant_links +
--      ledger append + session flip) is ONE atomic function. Route
--      handlers never multi-statement write.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. RegistrationSession topology expansion (additive columns)
-- ---------------------------------------------------------------------
alter table public.registrations
  add column if not exists full_name           text,
  add column if not exists email               text,
  add column if not exists venture_context     text,
  add column if not exists tenant_id           uuid references public.tenants(id),
  add column if not exists amount_expected_kes numeric(12, 2),
  add column if not exists msisdn_hash         text,
  add column if not exists stk_pushed_at       timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'registrations_venture_context_check') then
    alter table public.registrations add constraint registrations_venture_context_check
      check (venture_context is null or venture_context in ('NRHL', 'BIG_ICE', 'ATHLYTICA'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'registrations_amount_expected_check') then
    alter table public.registrations add constraint registrations_amount_expected_check
      check (amount_expected_kes is null or amount_expected_kes > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'registrations_msisdn_hash_check') then
    alter table public.registrations add constraint registrations_msisdn_hash_check
      check (msisdn_hash is null or char_length(msisdn_hash) = 64);
  end if;
end $$;

-- One live session per phone identity (partial: legacy rows carry null).
create unique index if not exists registrations_msisdn_hash_key
  on public.registrations (msisdn_hash)
  where msisdn_hash is not null;

-- §5 extension law: composite index led by tenant_id.
create index if not exists registrations_tenant_status_idx
  on public.registrations (tenant_id, payment_status);

-- ---------------------------------------------------------------------
-- 2. settle_payment_transaction v2 — resolution router + atomic
--    account construction. Same signature (route contract unchanged).
--
-- Matching precedence:
--   a. account_reference equality (canonical REG-#<hash16> refs AND
--      legacy per-registrant references — backward compatible)
--   b. msisdn_hash equality (transaction MSISDN — covers STK callbacks,
--      which do not echo AccountReference, and fat-fingered manual refs)
--
-- Outcomes:
--   DUPLICATE          receipt already in ledger; ZERO state changes.
--   SETTLED            ledger + gate evidence + accounts constructed
--                      (users/athletes/athlete_tenant_links) + session
--                      flipped to PAYMENT_SETTLED with athlete linkage.
--   SETTLED_UNDERPAID  ledger + gate evidence appended, but paid amount
--                      < amount_expected_kes: session NOT flipped, no
--                      accounts constructed. Money is never dropped;
--                      manual reconciliation required.
--   SETTLED_UNMATCHED  ledger + gate evidence appended; no session
--                      matched either key. Manual reconciliation.
-- ---------------------------------------------------------------------
create or replace function public.settle_payment_transaction(
  p_receipt            text,
  p_amount_kes         numeric,
  p_msisdn_hash        text,
  p_account_reference  text,
  p_result_code        integer,
  p_tx_ts              timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  -- Idempotent ledger append (UNIQUE barrier, no TOCTOU window).
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

  -- First validated settlement is the G-W6-PAY evidence (nrhl-gates law).
  insert into public.gate_states (gate_id, live, live_at, evidence)
  values ('G-W6-PAY', true, p_tx_ts, p_receipt)
  on conflict (gate_id) do nothing;

  -- RESOLUTION ROUTER --------------------------------------------------
  select * into v_reg from public.registrations
   where account_reference = p_account_reference
     and payment_status <> 'PAYMENT_SETTLED'
   limit 1;
  v_matched := found;

  if not v_matched then
    select * into v_reg from public.registrations
     where msisdn_hash = p_msisdn_hash
       and payment_status <> 'PAYMENT_SETTLED'
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

  -- Underpayment guard: ledger retains the money trail; the session does
  -- not flip and no account is constructed on partial consideration.
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

  -- ATOMIC ACCOUNT CONSTRUCTION ----------------------------------------
  -- Only when the session carries a full profile (v2 sessions). Legacy
  -- pre-v2 rows without email/tenant flip status only, as before.
  if v_reg.email is not null and v_reg.tenant_id is not null then
    insert into public.users (email, role, tenant_id)
    values (lower(v_reg.email), 'ATHLETE', v_reg.tenant_id)
    on conflict (email) do update set updated_at = now()
    returning id into v_user_id;

    insert into public.athletes (user_id)
    values (v_user_id)
    on conflict (user_id) do nothing;

    select id into v_athlete_id from public.athletes where user_id = v_user_id;

    -- THE BOUNDARY TABLE (02 §1): the only legitimate tenant↔athlete edge.
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
$$;
