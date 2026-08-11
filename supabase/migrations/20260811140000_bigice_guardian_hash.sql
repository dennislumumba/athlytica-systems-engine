-- =====================================================================
-- 20260811140000_bigice_guardian_hash.sql
-- CORRECTION to 20260811120000_bigice_athlete_plane.sql.
--
-- That migration made (name_key, guardian_phone_e164) the natural key.
-- It cannot be, on the path that matters most: the settlement pipeline
-- NEVER PERSISTS A RAW PHONE NUMBER. /api/v1/biz/mpesa-callback hashes
-- the MSISDN (HMAC-SHA256, MSISDN_HASH_KEY) at the DPA barrier before
-- anything touches a table, so a Big Ice athlete minted from a paid
-- registration would have arrived with guardian_phone_e164 NULL — and
-- the key would have silently degraded to name-only, which is precisely
-- the collision that bound ATH-047 to two different children.
--
-- The hash is a better household discriminator anyway: it is stable
-- across registrations from the same handset, and it is not PII.
--
-- guardian_phone_e164 STAYS. The NRHL webhook and the legacy CSV import
-- both carry a real number, and it is a contact detail worth holding.
-- Those paths hash it on the way in, so every path converges on the same
-- household key regardless of which one the record came from.
--
-- NULLS NOT DISTINCT is retained deliberately. Two same-named children
-- with no household hash between them now raise a unique violation
-- instead of merging into one record. An error routes to admin review;
-- a silent merge loses a child's history. The onboarding service treats
-- that violation as REVIEW_REQUIRED rather than a failure.
--
-- Safe to replace the index outright: the table has no rows.
-- =====================================================================

alter table public.bigice_athlete
  add column if not exists guardian_msisdn_hash text;

drop index if exists public.uq_bigice_athlete_identity;

create unique index if not exists uq_bigice_athlete_identity
  on public.bigice_athlete (name_key, guardian_msisdn_hash) nulls not distinct;

create index if not exists idx_bigice_athlete_msisdn_hash
  on public.bigice_athlete (guardian_msisdn_hash)
  where guardian_msisdn_hash is not null;
