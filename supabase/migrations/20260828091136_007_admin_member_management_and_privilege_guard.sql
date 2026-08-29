-- Admins can update any profile (needed for the members-management UI).
create policy "profiles_admin_update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- profiles_update_own has no column restriction, so a member could otherwise
-- PATCH their own role/plan directly via the API (bypassing the UI) to grant
-- themselves admin. Silently pin role/plan back to their prior value on any
-- update performed by a non-admin, regardless of which policy let it through.
create function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    new.role := old.role;
    new.plan := old.plan;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_self_privilege_escalation
  before update on public.profiles
  for each row execute function public.prevent_self_privilege_escalation();
