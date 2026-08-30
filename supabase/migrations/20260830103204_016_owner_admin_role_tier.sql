-- Adds a strictly-higher "owner" role above "admin": owners can add/remove
-- admins and manage everything; admins manage content/members/requests/
-- upgrades but cannot touch anyone's role. Bootstraps the existing sole
-- admin as the first owner so the system never starts with zero owners.

alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('member', 'admin', 'owner'));

update public.profiles set role = 'owner' where role = 'admin';

-- is_admin() now covers owner too, so every existing admin-gated RLS policy
-- (resources, requests, upgrade_requests, resource-files storage, etc.)
-- extends to owners automatically with no per-policy changes.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role in ('admin', 'owner')
  );
$$;

-- Strictly-higher tier check, for role-management specifically.
create function public.is_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles where id = (select auth.uid()) and role = 'owner'
  );
$$;

revoke execute on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Role changes now require owner (was admin); plan changes still just need
-- admin. Also refuses any update that would demote the last remaining
-- owner, instead of silently pinning it back like a plain unauthorized
-- change — this must be loud, not swallowed.
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and old.role = 'owner' then
    if not exists (select 1 from public.profiles where role = 'owner' and id <> old.id) then
      raise exception 'Cannot demote the last remaining owner';
    end if;
  end if;

  if new.role is distinct from old.role and not public.is_owner() then
    new.role := old.role;
  end if;

  if new.plan is distinct from old.plan and not public.is_admin() then
    new.plan := old.plan;
  end if;

  return new;
end;
$$;

-- Defense in depth: this app never issues a profiles delete itself (no
-- delete RLS policy exists), but a profile row cascades away if its
-- auth.users row is deleted (e.g. via the Supabase dashboard or Admin API
-- outside this app) — block that for the last remaining owner too.
create function public.prevent_last_owner_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' and not exists (select 1 from public.profiles where role = 'owner' and id <> old.id) then
    raise exception 'Cannot delete the last remaining owner';
  end if;
  return old;
end;
$$;

create trigger trg_prevent_last_owner_delete
  before delete on public.profiles
  for each row execute function public.prevent_last_owner_delete();

revoke execute on function public.prevent_last_owner_delete() from public, anon, authenticated;

-- Audit trail: who changed a role or plan, from what, to what, and when.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  target_id uuid not null references auth.users(id) on delete cascade,
  field text not null check (field in ('role', 'plan')),
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;

create policy "admin_audit_log_owner_read"
  on public.admin_audit_log for select
  using (public.is_owner());

create index idx_admin_audit_log_target on public.admin_audit_log(target_id);
create index idx_admin_audit_log_created_at on public.admin_audit_log(created_at desc);

-- Writes the audit trail. Runs AFTER the privilege-escalation guard above,
-- so it only ever logs changes that actually took effect (an unauthorized
-- attempt that got silently pinned back never reaches here as a diff).
create function public.log_profile_role_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    insert into public.admin_audit_log (actor_id, target_id, field, old_value, new_value)
    values ((select auth.uid()), new.id, 'role', old.role, new.role);
  end if;
  if new.plan is distinct from old.plan then
    insert into public.admin_audit_log (actor_id, target_id, field, old_value, new_value)
    values ((select auth.uid()), new.id, 'plan', old.plan, new.plan);
  end if;
  return new;
end;
$$;

create trigger trg_log_profile_role_plan_change
  after update on public.profiles
  for each row execute function public.log_profile_role_plan_change();

revoke execute on function public.log_profile_role_plan_change() from public, anon, authenticated;
