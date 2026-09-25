-- Batch 4: editable member display names and private, isolated avatars.
-- Avatar objects are optimized WebP files stored under an opaque random path.
-- Access is always authorized from storage.objects.owner_id; neither the path
-- nor the public review feed reveals a member's auth UUID or profile identity.

alter table public.profiles
  add column if not exists avatar_path text;

alter table public.profiles
  drop constraint if exists profiles_avatar_path_owned;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_avatar_path_format'
  ) then
    alter table public.profiles
      add constraint profiles_avatar_path_format
      check (
        avatar_path is null
        or avatar_path ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
      );
  end if;
end;
$$;

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

drop policy if exists "profile_avatars_public_read" on storage.objects;
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
    and name ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
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
    and name ~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
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

-- Preserve the owner-concurrency guard introduced by migration 017 while
-- reducing ordinary members to the intended editable profile fields. Admins
-- retain their existing member-management behaviour; the independent plan
-- trigger still requires membership RPCs for plan changes.
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
      new.avatar_path !~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
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
  v_full_name text := nullif(pg_catalog.btrim(coalesce(p_full_name, '')), '');
  v_avatar_path text := nullif(pg_catalog.btrim(coalesce(p_avatar_path, '')), '');
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
  if v_avatar_path is not null
    and (
      v_avatar_path !~ '^avatars/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$'
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
  set full_name = v_full_name,
      avatar_path = v_avatar_path
  where profile.id = v_user_id
  returning profile.full_name, profile.avatar_path;

  if not found then
    raise exception 'Member profile not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_my_profile(text, text) from public, anon;
grant execute on function public.update_my_profile(text, text) to authenticated;

-- Public reviews are deliberately anonymous. Member display names, auth UUIDs,
-- and private avatar paths never cross this public view boundary.
create or replace view public.resource_review_feed
with (security_barrier = true) as
select
  review.id,
  review.resource_id,
  review.rating,
  review.body,
  'สมาชิก KruAorry'::text as reviewer_name,
  null::text as reviewer_avatar_path,
  review.updated_at
from public.resource_reviews review
join public.resources resource on resource.id = review.resource_id
where resource.status = 'published'
  and review.moderation_status = 'visible';

revoke all on public.resource_review_feed from public;
grant select on public.resource_review_feed to anon, authenticated;
