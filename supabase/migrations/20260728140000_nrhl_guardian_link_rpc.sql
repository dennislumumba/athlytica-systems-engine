-- =====================================================================
-- 20260728140000_nrhl_guardian_link_rpc.sql
-- Guardian linking into athlytica_core.parents.
--
-- The brief asks the paid-onboarding webhook to "auto-generate an
-- initial parent account record in athlytica_core.parents". That table
-- is real (see 20260728130000), but athlytica_core is not exposed to
-- PostgREST, so the Supabase client cannot reach it directly. This
-- SECURITY DEFINER RPC in public is the bridge — the same pattern
-- settle_payment_transaction() already uses for privileged writes.
--
-- Idempotent on phone_number (which is UNIQUE): a webhook retry, or a
-- second child from the same family, resolves to the one parent row
-- rather than creating a duplicate household.
--
-- Phone is stored E.164 exactly as validated at the API boundary. The
-- format is asserted here too, because a definer function is a trust
-- boundary of its own and must not rely on its caller having checked.
-- =====================================================================

create or replace function public.nrhl_link_guardian(p_phone_e164 text)
returns uuid
language plpgsql
volatile
security definer
set search_path = athlytica_core, public
as $$
declare
  v_parent_id uuid;
begin
  if p_phone_e164 !~ '^\+254[17]\d{8}$' then
    raise exception 'guardian phone must be Kenyan E.164 (+2547XXXXXXXX or +2541XXXXXXXX), got %', p_phone_e164;
  end if;

  insert into athlytica_core.parents (phone_number)
  values (p_phone_e164)
  on conflict (phone_number) do update
    set phone_number = excluded.phone_number  -- no-op, forces RETURNING
  returning parent_id into v_parent_id;

  return v_parent_id;
end;
$$;

revoke all on function public.nrhl_link_guardian(text) from public, anon, authenticated;
grant execute on function public.nrhl_link_guardian(text) to service_role;
