-- =====================================================================
-- SELF-SERVICE PROFILES — the step between "has an account" and "has a
-- dashboard" (founder directive 2026-07-28).
--
-- Signing in proves an email address. It does not say who the person is,
-- which venture they belong to, or what they are asking for. Before this
-- table a grantless account hit a dead-end screen and the founder had to
-- guess from an email address who was asking. Now they declare it.
--
-- A PROFILE IS A CLAIM, NOT A GRANT. Nothing here gives access to
-- anything. Access still comes from public.workspace_roles, written only
-- by the root founder via the HQ permission matrix. This is deliberate:
--   * the workspace API returns a venture's FULL payload to any role
--     that holds a grant (panel filtering is client-side), so a
--     self-granted ATHLETE row would expose the Paybill stream and the
--     registration ledger to anyone who signed up;
--   * therefore requested_workspace/requested_role are what the user
--     ASKED for, and are never read as authorisation.
--
-- RLS: a user reads and writes exactly their own row; the root founder
-- reads every row (that is the queue they grant from). Nobody deletes.
-- =====================================================================

create table if not exists public.user_profiles (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  full_name           text not null check (length(btrim(full_name)) between 2 and 120),
  phone               text check (phone is null or length(btrim(phone)) between 7 and 20),
  -- Mirrors config/workspaces.ts. Widen both together or neither.
  requested_workspace text not null check (requested_workspace in ('nrhl', 'big_ice', 'athlytica_hq', 'tta')),
  -- What they say they are. NOT a role: see the header.
  requested_role      text not null check (requested_role in ('ATHLETE', 'PARENT', 'COACH', 'SCOUT')),
  -- Free-text context for the founder reviewing the queue.
  note                text check (note is null or length(note) <= 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- The founder's review queue is "oldest unhandled first".
create index if not exists user_profiles_created_idx
  on public.user_profiles (created_at desc);

create index if not exists user_profiles_requested_workspace_idx
  on public.user_profiles (requested_workspace);

-- ---------------------------------------------------------------------
-- updated_at is maintained by the database, not by whoever remembers.
-- ---------------------------------------------------------------------
create or replace function public.touch_user_profiles_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  -- user_id is the identity of the row; a rewrite would let someone
  -- move their profile onto another account.
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists user_profiles_touch on public.user_profiles;
create trigger user_profiles_touch
  before update on public.user_profiles
  for each row execute function public.touch_user_profiles_updated_at();

-- ---------------------------------------------------------------------
-- RLS. is_global_founder() already exists (20260726140000) and reads
-- only the request JWT, so there is no recursion risk here.
-- ---------------------------------------------------------------------
alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_read_own on public.user_profiles;
create policy user_profiles_read_own on public.user_profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_global_founder());

drop policy if exists user_profiles_insert_own on public.user_profiles;
create policy user_profiles_insert_own on public.user_profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_profiles_update_own on public.user_profiles;
create policy user_profiles_update_own on public.user_profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- No delete policy: RLS denies by default, so a profile cannot be
-- removed through the API. Account deletion cascades from auth.users.

revoke all on public.user_profiles from anon;
grant select, insert, update on public.user_profiles to authenticated;
