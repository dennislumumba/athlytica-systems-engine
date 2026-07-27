-- =====================================================================
-- MIGRATION 002 — PASSPORT LEDGER & INSTANT SPLIT ENGINE (PostgreSQL 15+)
-- Extends: athlytica_passport_schema.sql (001)
-- Governs: KES 1,500 Passport Maintenance Fee, 10% coach split (KES 150),
--          dual-state hold/release ledger, instant M-Pesa B2C liquidity.
-- Conventions inherited from 001: UUID PKs via pgcrypto, snake_case,
-- provenance FK on domain rows, append-only audit trail.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 0. MATHEMATICAL PARAMETERS (single source of truth, versioned)
--    F = 1500 KES gross | C = 0.10 * F = 150 | P = 0.90 * F = 1350
--    Stored as config rows, not hardcoded literals, so a future fee
--    change is a data migration — not a code deploy.
-- ---------------------------------------------------------------------
CREATE TABLE fee_schedule (
  fee_schedule_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from      DATE NOT NULL,
  effective_to        DATE,
  gross_fee_kes       BIGINT NOT NULL CHECK (gross_fee_kes > 0),
  coach_share_bps     INTEGER NOT NULL CHECK (coach_share_bps BETWEEN 0 AND 10000),
  -- derived, stored for auditability (no float math anywhere):
  coach_share_kes     BIGINT GENERATED ALWAYS AS ((gross_fee_kes * coach_share_bps) / 10000) STORED,
  platform_share_kes  BIGINT GENERATED ALWAYS AS (gross_fee_kes - (gross_fee_kes * coach_share_bps) / 10000) STORED,
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

INSERT INTO fee_schedule (effective_from, gross_fee_kes, coach_share_bps)
VALUES (CURRENT_DATE, 1500, 1000);  -- KES 1,500 @ 10% => 150 / 1,350

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE origin_framework_enum AS ENUM ('NRHL', 'BIIF', 'INDEPENDENT');
CREATE TYPE subscription_status_enum AS ENUM ('active', 'delinquent', 'suspended', 'cancelled');
CREATE TYPE payment_channel_enum AS ENUM ('mpesa_c2b', 'card_gateway', 'bundle_invoice');
CREATE TYPE split_status_enum AS ENUM ('pending_verification', 'released', 'clawed_back', 'expired');
CREATE TYPE wallet_txn_type_enum AS ENUM (
  'split_hold',          -- KES 150 allocated, conditional (State A)
  'split_release',       -- data gate passed -> withdrawable (State B)
  'withdrawal_request',  -- coach-initiated debit
  'withdrawal_settled',  -- M-Pesa B2C confirmed
  'withdrawal_reversed', -- B2C failure/refund
  'clawback'             -- subscription refunded before release
);
CREATE TYPE payout_status_enum AS ENUM ('requested', 'processing', 'settled', 'failed', 'reversed');

-- ---------------------------------------------------------------------
-- 2. COACH NODE (001 has no coach entity — this is the platform actor)
-- ---------------------------------------------------------------------
CREATE TABLE coach_node (
  coach_node_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name          TEXT NOT NULL,
  phone_msisdn        TEXT NOT NULL,          -- E.164; M-Pesa B2C destination
  mpesa_verified      BOOLEAN NOT NULL DEFAULT false,
  certification_level TEXT NOT NULL DEFAULT 'node_certified'
                        CHECK (certification_level IN ('node_certified','specialist','lead_assessor')),
  status              TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','suspended','offboarded')),
  club_id             UUID REFERENCES club(club_id),
  provenance_id       UUID NOT NULL REFERENCES provenance(provenance_id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_coach_node_msisdn ON coach_node (phone_msisdn);

-- ---------------------------------------------------------------------
-- 3. PASSPORT SUBSCRIPTION (the KES 1,500 token, 30-day validity)
-- ---------------------------------------------------------------------
CREATE TABLE passport_subscription (
  subscription_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id          UUID NOT NULL REFERENCES athlete(athlete_id),
  coach_node_id       UUID NOT NULL REFERENCES coach_node(coach_node_id),
  origin_framework    origin_framework_enum NOT NULL,
  fee_schedule_id     UUID NOT NULL REFERENCES fee_schedule(fee_schedule_id),
  status              subscription_status_enum NOT NULL DEFAULT 'active',
  payment_channel     payment_channel_enum NOT NULL,
  payment_reference   TEXT NOT NULL,          -- M-Pesa TransID / gateway charge id / bundle invoice ref
  cycle_start         DATE NOT NULL,
  cycle_end           DATE NOT NULL,          -- cycle_start + 30 days, set by controller
  amount_paid_kes     BIGINT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cycle_end > cycle_start)
);
-- Idempotency: one subscription row per external payment event.
CREATE UNIQUE INDEX uq_subscription_payment_ref ON passport_subscription (payment_channel, payment_reference);
CREATE INDEX idx_subscription_coach_cycle ON passport_subscription (coach_node_id, cycle_start);
CREATE INDEX idx_subscription_status ON passport_subscription (status) WHERE status <> 'cancelled';

-- ---------------------------------------------------------------------
-- 4. COACH WALLET (balances are DERIVED-BUT-MATERIALIZED; the immutable
--    wallet_transaction ledger is the source of truth. A nightly job
--    re-derives balances from the ledger and alarms on drift.)
-- ---------------------------------------------------------------------
CREATE TABLE coach_wallet (
  wallet_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_node_id       UUID NOT NULL UNIQUE REFERENCES coach_node(coach_node_id),
  pending_balance_kes   BIGINT NOT NULL DEFAULT 0 CHECK (pending_balance_kes >= 0),
  available_balance_kes BIGINT NOT NULL DEFAULT 0 CHECK (available_balance_kes >= 0),
  withdrawn_total_kes   BIGINT NOT NULL DEFAULT 0 CHECK (withdrawn_total_kes >= 0),
  total_earned_kes      BIGINT NOT NULL DEFAULT 0 CHECK (total_earned_kes >= 0),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. SPLIT ALLOCATION (dual-state object: the KES 150 hold itself)
-- ---------------------------------------------------------------------
CREATE TABLE split_allocation (
  split_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     UUID NOT NULL REFERENCES passport_subscription(subscription_id),
  coach_node_id       UUID NOT NULL REFERENCES coach_node(coach_node_id),
  amount_kes          BIGINT NOT NULL CHECK (amount_kes > 0),
  status              split_status_enum NOT NULL DEFAULT 'pending_verification',
  held_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at         TIMESTAMPTZ,
  release_payload_id  UUID,                   -- FK to the data packet that opened the gate
  CHECK ( (status = 'released') = (released_at IS NOT NULL) )
);
-- Exactly ONE split per subscription cycle. This is the invariant that
-- prevents double-crediting on webhook replays.
CREATE UNIQUE INDEX uq_split_per_subscription ON split_allocation (subscription_id);
CREATE INDEX idx_split_coach_status ON split_allocation (coach_node_id, status);

-- ---------------------------------------------------------------------
-- 6. DATA GATE (the release trigger record — State B evidence)
-- ---------------------------------------------------------------------
CREATE TABLE data_gate_payload (
  payload_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id     UUID NOT NULL REFERENCES passport_subscription(subscription_id),
  coach_node_id       UUID NOT NULL REFERENCES coach_node(coach_node_id),
  payload_kind        TEXT NOT NULL CHECK (payload_kind IN
                        ('baseline_metrics','attendance_initialization','weekly_training_log')),
  payload_snapshot    JSONB NOT NULL,
  syntax_valid        BOOLEAN NOT NULL,
  timestamp_valid     BOOLEAN NOT NULL,       -- measured_at within the subscription cycle window
  submitted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  provenance_id       UUID NOT NULL REFERENCES provenance(provenance_id)
);
CREATE INDEX idx_gate_subscription ON data_gate_payload (subscription_id, submitted_at);

ALTER TABLE split_allocation
  ADD CONSTRAINT fk_split_release_payload
  FOREIGN KEY (release_payload_id) REFERENCES data_gate_payload(payload_id);

-- ---------------------------------------------------------------------
-- 7. WALLET TRANSACTION (immutable ledger — INSERT-only)
-- ---------------------------------------------------------------------
CREATE TABLE wallet_transaction (
  txn_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           UUID NOT NULL REFERENCES coach_wallet(wallet_id),
  txn_type            wallet_txn_type_enum NOT NULL,
  amount_kes          BIGINT NOT NULL CHECK (amount_kes > 0),   -- direction encoded by txn_type
  split_id            UUID REFERENCES split_allocation(split_id),
  payout_id           UUID,                   -- FK added after payout_request below
  idempotency_key     TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_wallet_txn_idem ON wallet_transaction (idempotency_key);
CREATE INDEX idx_wallet_txn_wallet ON wallet_transaction (wallet_id, created_at);

-- Enforce immutability at the engine level, not just by GRANT policy:
CREATE OR REPLACE FUNCTION trg_block_ledger_mutation() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transaction is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_txn_immutable
  BEFORE UPDATE OR DELETE ON wallet_transaction
  FOR EACH ROW EXECUTE FUNCTION trg_block_ledger_mutation();

-- ---------------------------------------------------------------------
-- 8. PAYOUT REQUEST (M-Pesa B2C lifecycle)
-- ---------------------------------------------------------------------
CREATE TABLE payout_request (
  payout_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id           UUID NOT NULL REFERENCES coach_wallet(wallet_id),
  amount_kes          BIGINT NOT NULL CHECK (amount_kes > 0),
  destination_msisdn  TEXT NOT NULL,
  status              payout_status_enum NOT NULL DEFAULT 'requested',
  b2c_conversation_id TEXT,                   -- Daraja OriginatorConversationID
  b2c_receipt         TEXT,                   -- TransactionReceipt on settlement
  failure_reason      TEXT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at          TIMESTAMPTZ
);
CREATE UNIQUE INDEX uq_payout_b2c_conv ON payout_request (b2c_conversation_id)
  WHERE b2c_conversation_id IS NOT NULL;

ALTER TABLE wallet_transaction
  ADD CONSTRAINT fk_wallet_txn_payout
  FOREIGN KEY (payout_id) REFERENCES payout_request(payout_id);

-- =====================================================================
-- 9. TRANSACTIONAL CONTROLLER FUNCTIONS
--    All money movement happens inside these functions ONLY. Application
--    code calls them; it never writes balances directly.
-- =====================================================================

-- STATE A — THE HOLD. Called by the payment webhook controller after the
-- external payment (M-Pesa C2B confirmation / gateway capture) is trusted.
CREATE OR REPLACE FUNCTION fn_open_subscription_and_hold(
  p_athlete_id        UUID,
  p_coach_node_id     UUID,
  p_origin            origin_framework_enum,
  p_channel           payment_channel_enum,
  p_payment_reference TEXT,
  p_amount_paid_kes   BIGINT
) RETURNS UUID AS $$
DECLARE
  v_fee        fee_schedule%ROWTYPE;
  v_sub_id     UUID;
  v_wallet_id  UUID;
BEGIN
  SELECT * INTO v_fee FROM fee_schedule
   WHERE effective_from <= CURRENT_DATE
     AND (effective_to IS NULL OR effective_to > CURRENT_DATE)
   ORDER BY effective_from DESC LIMIT 1;

  IF p_amount_paid_kes <> v_fee.gross_fee_kes THEN
    RAISE EXCEPTION 'Payment % KES does not match scheduled fee % KES',
      p_amount_paid_kes, v_fee.gross_fee_kes;
  END IF;

  -- Idempotent: webhook replay hits uq_subscription_payment_ref and exits cleanly.
  INSERT INTO passport_subscription
    (athlete_id, coach_node_id, origin_framework, fee_schedule_id, payment_channel,
     payment_reference, cycle_start, cycle_end, amount_paid_kes)
  VALUES
    (p_athlete_id, p_coach_node_id, p_origin, v_fee.fee_schedule_id, p_channel,
     p_payment_reference, CURRENT_DATE, CURRENT_DATE + 30, p_amount_paid_kes)
  ON CONFLICT (payment_channel, payment_reference) DO NOTHING
  RETURNING subscription_id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    RETURN NULL;  -- replay; hold already exists via uq_split_per_subscription
  END IF;

  -- Lock the wallet row, allocate the conditional KES 150.
  SELECT wallet_id INTO v_wallet_id FROM coach_wallet
   WHERE coach_node_id = p_coach_node_id FOR UPDATE;
  IF v_wallet_id IS NULL THEN
    INSERT INTO coach_wallet (coach_node_id) VALUES (p_coach_node_id)
    RETURNING wallet_id INTO v_wallet_id;
  END IF;

  INSERT INTO split_allocation (subscription_id, coach_node_id, amount_kes)
  VALUES (v_sub_id, p_coach_node_id, v_fee.coach_share_kes);

  INSERT INTO wallet_transaction (wallet_id, txn_type, amount_kes, split_id, idempotency_key)
  SELECT v_wallet_id, 'split_hold', v_fee.coach_share_kes, s.split_id,
         'hold:' || v_sub_id::text
  FROM split_allocation s WHERE s.subscription_id = v_sub_id;

  UPDATE coach_wallet
     SET pending_balance_kes = pending_balance_kes + v_fee.coach_share_kes,
         updated_at = now()
   WHERE wallet_id = v_wallet_id;

  RETURN v_sub_id;
END;
$$ LANGUAGE plpgsql;

-- STATE B — THE INSTANT RELEASE. Called by the ingestion controller after a
-- data payload passes syntax + timestamp validation. First valid payload of
-- the billing cycle flips the split to withdrawable, in the same transaction
-- as the payload insert.
CREATE OR REPLACE FUNCTION fn_release_split_on_data_gate(
  p_subscription_id UUID,
  p_payload_id      UUID
) RETURNS BOOLEAN AS $$
DECLARE
  v_split     split_allocation%ROWTYPE;
  v_wallet_id UUID;
  v_valid     BOOLEAN;
BEGIN
  SELECT (syntax_valid AND timestamp_valid) INTO v_valid
    FROM data_gate_payload WHERE payload_id = p_payload_id;
  IF NOT COALESCE(v_valid, false) THEN
    RETURN false;  -- invalid packet never releases funds
  END IF;

  -- Row lock the split; only pending holds are releasable, exactly once.
  SELECT * INTO v_split FROM split_allocation
   WHERE subscription_id = p_subscription_id
     AND status = 'pending_verification'
   FOR UPDATE SKIP LOCKED;
  IF v_split.split_id IS NULL THEN
    RETURN false;  -- already released, clawed back, or being processed
  END IF;

  UPDATE split_allocation
     SET status = 'released', released_at = now(), release_payload_id = p_payload_id
   WHERE split_id = v_split.split_id;

  SELECT wallet_id INTO v_wallet_id FROM coach_wallet
   WHERE coach_node_id = v_split.coach_node_id FOR UPDATE;

  INSERT INTO wallet_transaction (wallet_id, txn_type, amount_kes, split_id, idempotency_key)
  VALUES (v_wallet_id, 'split_release', v_split.amount_kes, v_split.split_id,
          'release:' || v_split.split_id::text);

  UPDATE coach_wallet
     SET pending_balance_kes   = pending_balance_kes - v_split.amount_kes,
         available_balance_kes = available_balance_kes + v_split.amount_kes,
         total_earned_kes      = total_earned_kes + v_split.amount_kes,
         updated_at            = now()
   WHERE wallet_id = v_wallet_id;

  RETURN true;
END;
$$ LANGUAGE plpgsql;

-- WITHDRAWAL — reserve funds and open the B2C payout. The debit happens at
-- request time (pessimistic), so a slow M-Pesa callback can never allow a
-- double-spend of available balance.
CREATE OR REPLACE FUNCTION fn_request_withdrawal(
  p_coach_node_id UUID,
  p_amount_kes    BIGINT
) RETURNS UUID AS $$
DECLARE
  v_wallet    coach_wallet%ROWTYPE;
  v_msisdn    TEXT;
  v_payout_id UUID;
BEGIN
  SELECT * INTO v_wallet FROM coach_wallet
   WHERE coach_node_id = p_coach_node_id FOR UPDATE;

  IF v_wallet.wallet_id IS NULL THEN
    RAISE EXCEPTION 'No wallet for coach node %', p_coach_node_id;
  END IF;
  IF p_amount_kes <= 0 OR p_amount_kes > v_wallet.available_balance_kes THEN
    RAISE EXCEPTION 'Requested % KES exceeds available balance % KES',
      p_amount_kes, v_wallet.available_balance_kes;
  END IF;

  SELECT phone_msisdn INTO v_msisdn FROM coach_node
   WHERE coach_node_id = p_coach_node_id AND status = 'active' AND mpesa_verified;
  IF v_msisdn IS NULL THEN
    RAISE EXCEPTION 'Coach node % not active/M-Pesa-verified', p_coach_node_id;
  END IF;

  INSERT INTO payout_request (wallet_id, amount_kes, destination_msisdn)
  VALUES (v_wallet.wallet_id, p_amount_kes, v_msisdn)
  RETURNING payout_id INTO v_payout_id;

  INSERT INTO wallet_transaction (wallet_id, txn_type, amount_kes, payout_id, idempotency_key)
  VALUES (v_wallet.wallet_id, 'withdrawal_request', p_amount_kes, v_payout_id,
          'wd-req:' || v_payout_id::text);

  UPDATE coach_wallet
     SET available_balance_kes = available_balance_kes - p_amount_kes,
         updated_at = now()
   WHERE wallet_id = v_wallet.wallet_id;

  RETURN v_payout_id;  -- controller now fires Daraja B2C with this id as correlation key
END;
$$ LANGUAGE plpgsql;

-- B2C CALLBACK SETTLEMENT — idempotent via payout state machine.
CREATE OR REPLACE FUNCTION fn_settle_withdrawal(
  p_payout_id   UUID,
  p_success     BOOLEAN,
  p_b2c_receipt TEXT,
  p_failure     TEXT DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_payout payout_request%ROWTYPE;
BEGIN
  SELECT * INTO v_payout FROM payout_request
   WHERE payout_id = p_payout_id AND status IN ('requested','processing')
   FOR UPDATE;
  IF v_payout.payout_id IS NULL THEN
    RETURN;  -- duplicate callback; already terminal
  END IF;

  IF p_success THEN
    UPDATE payout_request
       SET status = 'settled', b2c_receipt = p_b2c_receipt, settled_at = now()
     WHERE payout_id = p_payout_id;

    INSERT INTO wallet_transaction (wallet_id, txn_type, amount_kes, payout_id, idempotency_key)
    VALUES (v_payout.wallet_id, 'withdrawal_settled', v_payout.amount_kes, p_payout_id,
            'wd-settle:' || p_payout_id::text);

    UPDATE coach_wallet
       SET withdrawn_total_kes = withdrawn_total_kes + v_payout.amount_kes,
           updated_at = now()
     WHERE wallet_id = v_payout.wallet_id;
  ELSE
    UPDATE payout_request
       SET status = 'failed', failure_reason = p_failure
     WHERE payout_id = p_payout_id;

    INSERT INTO wallet_transaction (wallet_id, txn_type, amount_kes, payout_id, idempotency_key)
    VALUES (v_payout.wallet_id, 'withdrawal_reversed', v_payout.amount_kes, p_payout_id,
            'wd-reverse:' || p_payout_id::text);

    UPDATE coach_wallet  -- restore reserved funds
       SET available_balance_kes = available_balance_kes + v_payout.amount_kes,
           updated_at = now()
     WHERE wallet_id = v_payout.wallet_id;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- 10. NODE YIELD VIEW (backs GET /api/v1/engine/metrics/node-yield)
-- ---------------------------------------------------------------------
CREATE VIEW coach_node_yield AS
SELECT
  cn.coach_node_id,
  cn.legal_name,
  COUNT(DISTINCT ps.subscription_id) FILTER (WHERE ps.status = 'active'
        AND ps.cycle_end >= CURRENT_DATE)                          AS active_passports,
  COUNT(DISTINCT sa.split_id) FILTER (WHERE sa.status = 'pending_verification') AS splits_awaiting_data,
  COALESCE(w.pending_balance_kes, 0)                               AS pending_kes,
  COALESCE(w.available_balance_kes, 0)                             AS withdrawable_now_kes,
  COALESCE(w.total_earned_kes, 0)                                  AS lifetime_earned_kes,
  COALESCE(w.withdrawn_total_kes, 0)                               AS lifetime_withdrawn_kes,
  (SELECT fs.coach_share_kes FROM fee_schedule fs
    WHERE fs.effective_from <= CURRENT_DATE
      AND (fs.effective_to IS NULL OR fs.effective_to > CURRENT_DATE)
    ORDER BY fs.effective_from DESC LIMIT 1)
    * COUNT(DISTINCT ps.subscription_id) FILTER (WHERE ps.status = 'active'
        AND ps.cycle_end >= CURRENT_DATE)                          AS projected_monthly_yield_kes
FROM coach_node cn
LEFT JOIN coach_wallet w  ON w.coach_node_id = cn.coach_node_id
LEFT JOIN passport_subscription ps ON ps.coach_node_id = cn.coach_node_id
LEFT JOIN split_allocation sa ON sa.coach_node_id = cn.coach_node_id
GROUP BY cn.coach_node_id, cn.legal_name, w.pending_balance_kes,
         w.available_balance_kes, w.total_earned_kes, w.withdrawn_total_kes;

COMMIT;

-- =====================================================================
-- INVARIANTS ENFORCED BY THIS MIGRATION (verify in CI):
--  I1. One split_allocation per subscription (uq_split_per_subscription).
--  I2. wallet_transaction is append-only (trigger + no UPDATE/DELETE grants).
--  I3. Release requires a syntax+timestamp-valid payload; invalid packets
--      cannot move money (fn_release_split_on_data_gate guard).
--  I4. available_balance can never go negative (CHECK + FOR UPDATE debit
--      at request time).
--  I5. Every balance change has exactly one ledger row (idempotency_key).
--  I6. Fee math is integer basis-points; no floating point in money paths.
-- =====================================================================
