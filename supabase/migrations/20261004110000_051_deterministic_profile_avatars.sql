-- Bound member avatar storage to one deterministic object per permanent user
-- and separate display-name writes from avatar writes. Existing opaque v4
-- avatar paths remain readable/deletable so rollout never breaks a saved
-- profile; they cannot be newly inserted or reattached after this migration.

alter table public.profiles
  drop constraint if exists profiles_avatar_path_format;

alter table public.profiles
  add constraint profiles_avatar_path_format
  check (
    avatar_path is null
    or avatar_path ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
    or avatar_path ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/avatar[.]webp$'
  );

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'profile-avatars',
  'profile-avatars',
  false,
  5242880,
  array['image/webp']
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Reads and deletes retain owner-only access to both the legacy object and the
-- deterministic object. New writes can address exactly one key per auth user.
drop policy if exists "profile_avatars_owner_select" on storage.objects;
create policy "profile_avatars_owner_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and owner_id = (select auth.uid())::text
  );

drop policy if exists "profile_avatars_owner_insert" on storage.objects;
create policy "profile_avatars_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and owner_id = (select auth.uid())::text
    and name = 'avatars/' || (select auth.uid())::text || '/avatar.webp'
  );

drop policy if exists "profile_avatars_owner_update" on storage.objects;
create policy "profile_avatars_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and owner_id = (select auth.uid())::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and owner_id = (select auth.uid())::text
    and name = 'avatars/' || (select auth.uid())::text || '/avatar.webp'
  );

drop policy if exists "profile_avatars_owner_delete" on storage.objects;
create policy "profile_avatars_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'profile-avatars'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and owner_id = (select auth.uid())::text
  );

-- Keep all earlier role/identity/plan protections. A changed non-null avatar
-- must now be the exact deterministic key owned by that profile.
create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and old.role = 'owner' then
    perform pg_catalog.pg_advisory_xact_lock(729310001);
    if not exists (select 1 from public.profiles where role = 'owner' and id <> old.id) then
      raise exception 'Cannot demote the last remaining owner';
    end if;
  end if;

  if new.role is distinct from old.role and not public.is_owner() then
    new.role := old.role;
  end if;

  if not public.is_admin() then
    new.id := old.id;
    new.email := old.email;
    new.plan := old.plan;
    new.created_at := old.created_at;
  end if;

  if new.full_name is distinct from old.full_name and (
    new.full_name is not null
    and (
      nullif(pg_catalog.btrim(new.full_name), '') is null
      or pg_catalog.char_length(pg_catalog.btrim(new.full_name)) < 2
      or pg_catalog.char_length(pg_catalog.btrim(new.full_name)) > 80
    )
  ) then
    raise exception 'Display name must contain 2 to 80 characters' using errcode = '22023';
  end if;

  if new.avatar_path is distinct from old.avatar_path
    and new.avatar_path is not null
    and (
      new.avatar_path <> 'avatars/' || new.id::text || '/avatar.webp'
      or not exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'profile-avatars'
          and object.name = new.avatar_path
          and object.owner_id = new.id::text
      )
    )
  then
    raise exception 'Avatar object does not belong to this member' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_self_privilege_escalation() from public, anon, authenticated;

create or replace function public.update_my_display_name(p_full_name text)
returns table (full_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_full_name text := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;
  if v_full_name is null
    or pg_catalog.char_length(v_full_name) < 2
    or pg_catalog.char_length(v_full_name) > 80
  then
    raise exception 'Display name must contain 2 to 80 characters' using errcode = '22023';
  end if;

  return query
  update public.profiles profile
  set full_name = v_full_name
  where profile.id = v_user_id
  returning profile.full_name;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_my_display_name(text) from public, anon, authenticated;
grant execute on function public.update_my_display_name(text) to authenticated;

create or replace function public.update_my_avatar(p_avatar_path text)
returns table (avatar_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_avatar_path text := nullif(pg_catalog.btrim(coalesce(p_avatar_path, '')), '');
  v_expected_path text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;

  v_expected_path := 'avatars/' || v_user_id::text || '/avatar.webp';
  if v_avatar_path is not null
    and (
      v_avatar_path <> v_expected_path
      or not exists (
        select 1
        from storage.objects object
        where object.bucket_id = 'profile-avatars'
          and object.name = v_avatar_path
          and object.owner_id = v_user_id::text
      )
    )
  then
    raise exception 'Avatar object does not belong to this member' using errcode = '42501';
  end if;

  return query
  update public.profiles profile
  set avatar_path = v_avatar_path
  where profile.id = v_user_id
  returning profile.avatar_path;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_my_avatar(text) from public, anon, authenticated;
grant execute on function public.update_my_avatar(text) to authenticated;

-- Keep old clients able to save a name during a staggered rollout, but ignore
-- their avatar argument. Avatar persistence now has its own guarded RPC.
create or replace function public.update_my_profile(
  p_full_name text,
  p_avatar_path text
)
returns table (full_name text, avatar_path text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  perform public.update_my_display_name(p_full_name);

  return query
  select profile.full_name, profile.avatar_path
  from public.profiles profile
  where profile.id = v_user_id;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon, authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- Browser roles no longer receive table-wide profile UPDATE. Owners retain the
-- two existing admin-management columns. Their triggers still pin both values
-- for non-admin callers; members use the two self-targeting RPCs above.
revoke update on table public.profiles from anon, authenticated;
grant update (role, plan) on table public.profiles to authenticated;

-- Fail the transaction instead of publishing a partially hardened boundary.
do $$
begin
  if pg_catalog.to_regprocedure('public.update_my_display_name(text)') is null
    or pg_catalog.to_regprocedure('public.update_my_avatar(text)') is null
    or pg_catalog.to_regprocedure('public.update_my_profile(text,text)') is null
    or pg_catalog.to_regprocedure('public.prevent_self_privilege_escalation()') is null
  then
    raise exception 'Deterministic avatar migration assertion failed: required profile functions are missing';
  end if;

  if not exists (
    select 1
    from storage.buckets bucket
    where bucket.id = 'profile-avatars'
      and bucket.name = 'profile-avatars'
      and bucket.public = false
      and bucket.file_size_limit = 5242880
      and bucket.allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'Deterministic avatar migration assertion failed: private WebP bucket limits are incorrect';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = 'public.profiles'::regclass
      and constraint_row.conname = 'profiles_avatar_path_format'
      and pg_catalog.pg_get_constraintdef(constraint_row.oid) like '%/avatar%webp%'
  ) then
    raise exception 'Deterministic avatar migration assertion failed: profile path constraint is missing';
  end if;

  if (
    select pg_catalog.count(*)
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polname in (
        'profile_avatars_owner_select',
        'profile_avatars_owner_insert',
        'profile_avatars_owner_update',
        'profile_avatars_owner_delete'
      )
  ) <> 4 or exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polname = 'profile_avatars_public_read'
  ) or not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polname = 'profile_avatars_owner_insert'
      and policy_row.polcmd = 'a'
      and pg_catalog.pg_get_expr(policy_row.polwithcheck, policy_row.polrelid) like '%avatars/%/avatar.webp%'
  ) or not exists (
    select 1
    from pg_catalog.pg_policy policy_row
    where policy_row.polrelid = 'storage.objects'::regclass
      and policy_row.polname = 'profile_avatars_owner_update'
      and policy_row.polcmd = 'w'
      and pg_catalog.pg_get_expr(policy_row.polwithcheck, policy_row.polrelid) like '%avatars/%/avatar.webp%'
  ) then
    raise exception 'Deterministic avatar migration assertion failed: exact-key Storage policies are missing';
  end if;

  if has_function_privilege('anon', 'public.update_my_display_name(text)', 'execute')
    or has_function_privilege('anon', 'public.update_my_avatar(text)', 'execute')
    or has_function_privilege('anon', 'public.update_my_profile(text,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_my_display_name(text)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_my_avatar(text)', 'execute')
    or not has_function_privilege('authenticated', 'public.update_my_profile(text,text)', 'execute')
  then
    raise exception 'Deterministic avatar migration assertion failed: profile RPC grants are incorrect';
  end if;

  if has_column_privilege('anon', 'public.profiles', 'role', 'update')
    or not has_column_privilege('authenticated', 'public.profiles', 'role', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'full_name', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'avatar_path', 'update')
    or has_column_privilege('authenticated', 'public.profiles', 'email', 'update')
    or not has_column_privilege('authenticated', 'public.profiles', 'plan', 'update')
  then
    raise exception 'Deterministic avatar migration assertion failed: profile column grants are incorrect';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.profiles'::regclass
      and trigger_row.tgname = 'trg_prevent_self_privilege_escalation'
      and trigger_row.tgenabled <> 'D'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Deterministic avatar migration assertion failed: profile privilege trigger is missing or disabled';
  end if;
end;
$$;
