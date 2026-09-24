-- Batch 2: structured discovery metadata and durable, isolated favorites.
-- This migration is additive: existing grade data is not guessed from titles,
-- descriptions, or free-form tags, and existing saved rows are not rewritten.

alter table public.resources
  add column if not exists grade_levels text[] not null default '{}';

alter table public.resources
  add constraint resources_grade_levels_allowed
  check (
    array_position(grade_levels, null) is null
    and grade_levels <@ array[
      'kindergarten',
      'p1', 'p2', 'p3', 'p4', 'p5', 'p6',
      'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
      'vocational',
      'all'
    ]::text[]
    and not ('all' = any(grade_levels) and cardinality(grade_levels) > 1)
  );

create index if not exists idx_resources_grade_levels
  on public.resources using gin (grade_levels);

-- Migration 023 converted resource reads to column-level grants. Grade levels
-- are public display metadata too, so grant this new column explicitly.
grant select (grade_levels) on public.resources to anon, authenticated;

-- Preserve every safety predicate from migration 023. Private destinations
-- remain absent from the view; grade levels and current public plan
-- names are safe discovery metadata only.
create or replace view public.resource_catalog
with (security_barrier = true) as
select
  r.id,
  r.title,
  r.meta,
  r.description,
  r.category,
  r.delivery_mode,
  r.cover_image_url,
  r.tags,
  r.is_free,
  r.file_size,
  r.status,
  r.published_at,
  r.created_at,
  r.grade_levels,
  case
    when r.is_free then '{}'::text[]
    else coalesce(
      (
        select array_agg(p.name order by p.sort_order, p.id)
        from public.plans p
        join public.plan_features pf
          on pf.plan_id = p.id
         and pf.feature_id = 'download.premium'
         and pf.enabled = true
        where p.lifecycle_status = 'active'
          and p.is_public = true
      ),
      '{}'::text[]
    )
  end as required_plan_names
from public.resources r
where r.status = 'published'
  and (
    (
      r.delivery_mode = 'file_download'
      and nullif(btrim(r.file_path), '') is not null
      and r.file_path like r.id::text || '/%'
      and position('placeholder' in lower(r.file_path)) = 0
    )
    or
    (
      r.delivery_mode <> 'file_download'
      and nullif(btrim(r.cta_url), '') is not null
      and position('placeholder' in lower(r.cta_url)) = 0
      and (
        r.cta_url ~ '^/[a-zA-Z0-9]'
        or (
          r.cta_url ~* '^https?://[a-z0-9][a-z0-9.-]+(:[0-9]{1,5})?(/|$)'
          and lower(substring(r.cta_url from '^https?://([^/:?#]+)')) !~
            '^(localhost$|0[.]0[.]0[.]0$|127[.]|10[.]|192[.]168[.]|169[.]254[.]|172[.](1[6-9]|2[0-9]|3[01])[.]|(.+[.])?(example[.](com|org|net)|local|invalid|test)$)'
        )
      )
    )
  );

revoke all on public.resource_catalog from public;
grant select on public.resource_catalog to anon, authenticated;

-- Existing members retain every saved row. New writes remain isolated to the
-- caller and may reference only a published, usable catalog resource. Locked
-- premium resources deliberately remain saveable for later consideration.
drop policy if exists "saved_resources_own" on public.saved_resources;
drop policy if exists "saved_resources_select_own" on public.saved_resources;
drop policy if exists "saved_resources_insert_own_published" on public.saved_resources;
drop policy if exists "saved_resources_update_own_published" on public.saved_resources;
drop policy if exists "saved_resources_delete_own" on public.saved_resources;

create policy "saved_resources_select_own"
  on public.saved_resources for select
  using ((select auth.uid()) = user_id);

create policy "saved_resources_insert_own_published"
  on public.saved_resources for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.resource_catalog catalog
      where catalog.id = resource_id
    )
  );

create policy "saved_resources_update_own_published"
  on public.saved_resources for update
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and public.has_feature('favorites.enabled')
    and exists (
      select 1 from public.resource_catalog catalog
      where catalog.id = resource_id
    )
  );

create policy "saved_resources_delete_own"
  on public.saved_resources for delete
  using ((select auth.uid()) = user_id);

create index if not exists idx_saved_resources_user_created
  on public.saved_resources (user_id, created_at desc, resource_id);

-- An idempotent browser API avoids duplicate-key races across tabs/devices.
-- It never accepts a user id from the caller and therefore cannot read or
-- mutate another member's favorites. The existing entitlement trigger still
-- enforces favorites.enabled and favorites.limit for each real insert.
create function public.set_my_resource_saved(
  p_resource_id uuid,
  p_saved boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saved-resources:' || v_user_id::text, 0)
  );

  if p_saved then
    if not exists (
      select 1
      from public.resource_catalog catalog
      where catalog.id = p_resource_id
    ) then
      raise exception 'Published resource not found' using errcode = 'P0002';
    end if;

    if not exists (
      select 1
      from public.saved_resources saved
      where saved.user_id = v_user_id
        and saved.resource_id = p_resource_id
    ) then
      insert into public.saved_resources (user_id, resource_id)
      values (v_user_id, p_resource_id);
    end if;

    return true;
  end if;

  delete from public.saved_resources
  where user_id = v_user_id
    and resource_id = p_resource_id;

  return false;
end;
$$;

revoke all on function public.set_my_resource_saved(uuid, boolean)
  from public, anon;
grant execute on function public.set_my_resource_saved(uuid, boolean)
  to authenticated;
