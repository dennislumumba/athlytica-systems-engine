-- =====================================================================
-- BIG ICE BEGINNER PACKAGE — the missing first rung
--
-- bigice.co.ke sells a KSh 16,500 Beginner Skating Programme (6 × 1-hour
-- sessions) as the entry point into the academy pathway. It had no row in
-- commercial_price_tier, so /register could not offer it and
-- /api/v1/biz/stk-push could not charge it: the CTA had to fall back to an
-- enquiry. Every other published Big Ice price is purchasable; this one
-- was published and unbuyable.
--
-- tier_group='academy' is what makes it visible to
-- GET /api/v1/public/packages and chargeable by the STK route — both
-- filter on that group and on is_active. Nothing else needs to change.
--
-- The uuid continues the seeded academy block
-- (b1e1a1c0-2222-4a10-8a01-0000000000{04,05,06}). It is fixed rather than
-- generated because it ends up inside 'academy_<tier_id>' session tier
-- ids on settled payment rows — a regenerated id would orphan history.
--
-- Idempotent on tier_name, which carries the table's UNIQUE constraint.
-- =====================================================================

insert into public.commercial_price_tier
  (tier_id, tier_name, tier_group, price_amount, currency, is_active)
values
  (
    'b1e1a1c0-2222-4a10-8a01-000000000007',
    'Beginner Skating Programme',
    'academy',
    16500.00,
    'KES',
    true
  )
on conflict (tier_name) do update
  set tier_group   = excluded.tier_group,
      price_amount = excluded.price_amount,
      currency     = excluded.currency,
      is_active    = excluded.is_active,
      updated_at   = now();

-- ---------------------------------------------------------------------
-- NAME PARITY WITH THE PUBLIC SITE
--
-- tier_name is what /register renders as the choice label, so it is what
-- a parent reads immediately before entering their M-Pesa PIN. The Big
-- Ice site now sells these as "3 / 6 / 12-Month Development"; the table
-- still said "Quarterly" / "Semi-Annual" / "Annual Master". One name on
-- the page and a different one at checkout is exactly the mismatch
-- CLAUDE.md forbids — it reads as the wrong item in the basket.
--
-- Only the label moves. tier_id is untouched, so settled rows carrying
-- 'academy_<tier_id>' keep resolving to the same product.
-- ---------------------------------------------------------------------

update public.commercial_price_tier
   set tier_name = '3-Month Development', updated_at = now()
 where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000004';

update public.commercial_price_tier
   set tier_name = '6-Month Development', updated_at = now()
 where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000005';

update public.commercial_price_tier
   set tier_name = '12-Month Development', updated_at = now()
 where tier_id = 'b1e1a1c0-2222-4a10-8a01-000000000006';
