-- auth.uid() in a policy's USING/CHECK is otherwise re-evaluated per row;
-- wrapping it in a scalar subquery lets Postgres evaluate it once per query.
drop policy "profiles_select_own_or_admin" on public.profiles;
drop policy "profiles_update_own" on public.profiles;
drop policy "profiles_admin_update" on public.profiles;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using ((select auth.uid()) = id or public.is_admin());

-- Combines the former separate self-update and admin-update policies into one,
-- which also clears the "multiple permissive policies" advisory (Postgres was
-- evaluating both on every UPDATE regardless of which one actually applied).
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using ((select auth.uid()) = id or public.is_admin())
  with check ((select auth.uid()) = id or public.is_admin());

drop policy "requests_read_all_members" on public.requests;
create policy "requests_read_all_members"
  on public.requests for select
  using ((select auth.uid()) is not null);

drop policy "requests_insert_own" on public.requests;
create policy "requests_insert_own"
  on public.requests for insert
  with check ((select auth.uid()) = requested_by);

drop policy "saved_resources_own" on public.saved_resources;
create policy "saved_resources_own"
  on public.saved_resources for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- resources_admin_write was FOR ALL, which implicitly includes SELECT and
-- overlapped with resources_public_read_published's SELECT policy (both
-- permissive, both evaluated on every read). Split into non-SELECT actions.
drop policy "resources_admin_write" on public.resources;
create policy "resources_admin_insert"
  on public.resources for insert
  with check (public.is_admin());
create policy "resources_admin_update"
  on public.resources for update
  using (public.is_admin())
  with check (public.is_admin());
create policy "resources_admin_delete"
  on public.resources for delete
  using (public.is_admin());

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'admin'
  );
$$;

create index if not exists idx_requests_requested_by on public.requests(requested_by);
create index if not exists idx_resources_created_by on public.resources(created_by);
create index if not exists idx_saved_resources_resource_id on public.saved_resources(resource_id);
