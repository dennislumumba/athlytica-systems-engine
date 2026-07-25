-- =====================================================================
-- 20260712210000_registrations_and_settlement_rpc.sql
-- G-W6-PAY settlement infrastructure (manuals 04 §4 / 05 §2):
--   * public.registrations       — registrant records keyed by account_reference
--   * public.gate_states         — persisted NRHL gate ledger state
--   * append-only trigger on public.payment_events  (clears SKL-001)
--   * public.settle_payment_transaction() — THE single-transaction path
--     for settlement: ledger append + registration flip + gate evidence
--     in one atomic function. Route handlers call this RPC and nothing
--     else; multi-statement writes from the app layer are prohibited.
--
-- MATCHING LAW: registrations are matched on their UNIQUE per-registrant
-- account_reference. The NCBA settlement account (1010539223) is the
-- bank-side collection identity, NOT a matching key — see 04 §5 WARNING.
-- =====================================================================

-- ---------------------------------------------------------------------
-- registrations
-- ---------------------------------------------------------------------
create table if not exists public.registrations (
  id                 uuid primary key default gen_random_uuid(),
  account_reference  text not null unique
                       check (char_length(account_reference) between 1 and 64),
  athlete_id         uuid references public.athletes(id), -- nullable; linked at G-W4-ROSTER
  payment_status     text not null default 'PENDING_PAYMENT'
                       check (payment_status in ('PENDING_PAYMENT', 'PAYMENT_SETTLED')),
  settled_receipt    text references public.payment_events(mpesa_receipt_number),
  settled_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists registrations_payment_status_idx
  on public.registrations (payment_status);

drop trigger if exists registrations_touch on public.registrations;
create trigger registrations_touch
  before update on public.registrations
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- gate_states — persisted counterpart of config/nrhl-gates.ts GateState.
-- Rows flip live ONLY through settle_payment_transaction (G-W6-PAY) or
-- a founder-authored migration for operational gates. Never from app
-- code directly.
-- ---------------------------------------------------------------------
create table if not exists public.gate_states (
  gate_id     text primary key,
  live        boolean not null default false,
  live_at     timestamptz,
  evidence    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists gate_states_touch on public.gate_states;
create trigger gate_states_touch
  before update on public.gate_states
  for each row execute function public.trg_touch_updated_at();

-- ---------------------------------------------------------------------
-- payment_events append-only enforcement (clears SKL-001).
-- Mirrors the performance_logs pattern in 20260711120000_hercules_core_merge.sql.
-- ---------------------------------------------------------------------
create or replace function public.trg_payment_events_immutable() returns trigger as $$
begin
  raise exception 'payment_events is append-only: % blocked', TG_OP;
end;
$$ language plpgsql;

drop trigger if exists payment_events_immutable on public.payment_events;
create trigger payment_events_immutable
  before update or delete on public.payment_events
  for each row execute function public.trg_payment_events_immutable();

-- ---------------------------------------------------------------------
-- settle_payment_transaction — atomic settlement path.
-- Outcomes:
--   DUPLICATE          receipt already in ledger; ZERO state changes.
--   SETTLED            ledger appended + registration flipped + gate evidence recorded.
--   SETTLED_UNMATCHED  ledger appended + gate evidence recorded, but no
--                      registration matched account_reference — manual
--                      reconciliation required (money is never dropped).
-- Idempotency is enforced by the UNIQUE constraint, not a read-then-write
-- (no TOCTOU window).
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
  v_registration_id uuid;
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

  update public.registrations
     set payment_status  = 'PAYMENT_SETTLED',
         settled_receipt = p_receipt,
         settled_at      = p_tx_ts
   where account_reference = p_account_reference
     and payment_status <> 'PAYMENT_SETTLED'
  returning id into v_registration_id;

  -- First validated settlement is the G-W6-PAY evidence (nrhl-gates law);
  -- later settlements never overwrite the original evidence row.
  insert into public.gate_states (gate_id, live, live_at, evidence)
  values ('G-W6-PAY', true, p_tx_ts, p_receipt)
  on conflict (gate_id) do nothing;

  return jsonb_build_object(
    'outcome', case when v_registration_id is null then 'SETTLED_UNMATCHED' else 'SETTLED' end,
    'receipt', p_receipt,
    'ledger_id', v_ledger_id,
    'registration_id', v_registration_id
  );
end;
$$;
