-- Avoid infinite recursion: policies on `profiles` that queried `profiles`
-- again (even via a subquery in another table's policy) re-triggered the
-- same RLS check recursively. A SECURITY DEFINER function owned by the
-- migration role bypasses RLS internally, breaking the cycle.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

drop policy if exists "resources_public_read_published" on public.resources;
create policy "resources_public_read_published"
  on public.resources for select
  using (status = 'published' or public.is_admin());

drop policy if exists "resources_admin_write" on public.resources;
create policy "resources_admin_write"
  on public.resources for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "requests_admin_update" on public.requests;
create policy "requests_admin_update"
  on public.requests for update
  using (public.is_admin())
  with check (public.is_admin());
