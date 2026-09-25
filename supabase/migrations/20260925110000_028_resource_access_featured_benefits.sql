-- Batch 4: resource-specific access, curated featured resources, and truthful
-- plan-benefit copy. Existing rows keep their current behaviour: the old
-- `is_free = true` meant "free after signup", so it becomes `authenticated`;
-- existing paid rows become `plans` and retain every plan that currently has
-- the premium-download capability.

alter table public.resources
  add column if not exists access_mode text;

update public.resources
set access_mode = case when is_free then 'authenticated' else 'plans' end
where access_mode is null;

alter table public.resources
  alter column access_mode set default 'authenticated',
  alter column access_mode set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.resources'::regclass
      and conname = 'resources_access_mode_check'
  ) then
    alter table public.resources
      add constraint resources_access_mode_check
      check (access_mode in ('public', 'authenticated', 'plans', 'locked'));
  end if;
end;
$$;

create table if not exists public.resource_plan_access (
  resource_id uuid not null references public.resources(id) on delete cascade,
  plan_id text not null references public.plans(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (resource_id, plan_id)
);

create index if not exists idx_resource_plan_access_plan
  on public.resource_plan_access(plan_id, resource_id);

alter table public.resource_plan_access enable row level security;
revoke all on public.resource_plan_access from public, anon, authenticated;
grant select on public.resource_plan_access to authenticated;

drop policy if exists "resource_plan_access_admin_read" on public.resource_plan_access;
create policy "resource_plan_access_admin_read"
  on public.resource_plan_access for select
  to authenticated
  using (public.is_admin());

-- Preserve access for every existing premium row, including hidden legacy
-- plans. Future admin changes use the atomic RPC below instead of this broad
-- capability backfill.
insert into public.resource_plan_access (resource_id, plan_id)
select r.id, pf.plan_id
from public.resources r
join public.plan_features pf
  on pf.feature_id = 'download.premium'
 and pf.enabled = true
where r.access_mode = 'plans'
on conflict (resource_id, plan_id) do nothing;

-- Compatibility for an older admin tab during a rolling deployment. New code
-- writes access_mode through set_resource_access(); old code may still write
-- only is_free. The two representations therefore fail closed and stay in
-- sync until is_free can be removed in a later, separately reviewed release.
create or replace function public.sync_resource_access_compat()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.access_mode is null then
      new.access_mode := case when new.is_free then 'authenticated' else 'plans' end;
    elsif new.is_free = false and new.access_mode = 'authenticated' then
      new.access_mode := 'plans';
    else
      new.is_free := new.access_mode in ('public', 'authenticated');
    end if;
  elsif new.access_mode is distinct from old.access_mode then
    new.is_free := new.access_mode in ('public', 'authenticated');
  elsif new.is_free is distinct from old.is_free then
    new.access_mode := case when new.is_free then 'authenticated' else 'plans' end;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_resource_access_compat on public.resources;
create trigger trg_sync_resource_access_compat
  before insert or update of access_mode, is_free on public.resources
  for each row execute function public.sync_resource_access_compat();

create or replace function public.ensure_legacy_resource_plan_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.access_mode = 'plans' and not exists (
    select 1 from public.resource_plan_access access
    where access.resource_id = new.id
  ) then
    insert into public.resource_plan_access (resource_id, plan_id)
    select new.id, pf.plan_id
    from public.plan_features pf
    where pf.feature_id = 'download.premium' and pf.enabled = true
    on conflict (resource_id, plan_id) do nothing;
  elsif new.access_mode <> 'plans' then
    delete from public.resource_plan_access where resource_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_ensure_legacy_resource_plan_access on public.resources;
create trigger trg_ensure_legacy_resource_plan_access
  after insert or update of access_mode, is_free on public.resources
  for each row execute function public.ensure_legacy_resource_plan_access();

revoke execute on function public.sync_resource_access_compat() from public, anon, authenticated;
revoke execute on function public.ensure_legacy_resource_plan_access() from public, anon, authenticated;

-- This is the one server-side access predicate used by destinations, private
-- Storage objects, reviews, and reports. It reads current subscription state
-- from the database, never a caller-supplied plan or stale JWT claim.
create or replace function public.can_access_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.resources r
    where r.id = p_resource_id
      and (
        public.is_admin()
        or (
          r.status = 'published'
          and case r.access_mode
            when 'public' then true
            when 'authenticated' then
              (select auth.uid()) is not null
              and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
            when 'plans' then
              (select auth.uid()) is not null
              and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
              and exists (
                select 1
                from public.resource_plan_access access
                where access.resource_id = r.id
                  and access.plan_id = public.membership_plan_for_user((select auth.uid()))
              )
            else false
          end
        )
      )
  );
$$;

revoke all on function public.can_access_resource(uuid) from public;
grant execute on function public.can_access_resource(uuid) to anon, authenticated;

create or replace function public.set_resource_access(
  p_resource_id uuid,
  p_access_mode text,
  p_plan_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_ids text[];
  v_resource_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_access_mode not in ('public', 'authenticated', 'plans', 'locked') then
    raise exception 'Invalid resource access mode' using errcode = '22023';
  end if;

  select array_agg(value order by value)
  into v_plan_ids
  from (
    select distinct btrim(item) as value
    from unnest(coalesce(p_plan_ids, '{}'::text[])) item
    where item is not null and btrim(item) <> ''
  ) normalized;
  v_plan_ids := coalesce(v_plan_ids, '{}'::text[]);

  if p_access_mode = 'plans' and cardinality(v_plan_ids) = 0 then
    raise exception 'At least one plan is required for plan access' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_plan_ids) requested
    where not exists (select 1 from public.plans p where p.id = requested)
  ) then
    raise exception 'Unknown plan in resource access list' using errcode = '22023';
  end if;

  select id into v_resource_id
  from public.resources
  where id = p_resource_id
  for update;
  if v_resource_id is null then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;

  update public.resources
  set access_mode = p_access_mode,
      is_free = p_access_mode in ('public', 'authenticated')
  where id = p_resource_id;

  delete from public.resource_plan_access where resource_id = p_resource_id;
  if p_access_mode = 'plans' then
    insert into public.resource_plan_access (resource_id, plan_id)
    select p_resource_id, plan_id from unnest(v_plan_ids) plan_id;
  end if;
end;
$$;

revoke all on function public.set_resource_access(uuid, text, text[]) from public, anon;
grant execute on function public.set_resource_access(uuid, text, text[]) to authenticated;

-- Save the resource row and its access policy in one database transaction.
-- Storage uploads are intentionally orchestrated by the browser, but a failed
-- access validation must never leave newly edited content under stale access.
create or replace function public.admin_save_resource(
  p_resource_id uuid,
  p_create boolean,
  p_title text,
  p_meta text,
  p_description text,
  p_category text,
  p_grade_levels text[],
  p_delivery_mode text,
  p_cta_url text,
  p_cover_image_url text,
  p_file_path text,
  p_file_name text,
  p_file_size bigint,
  p_file_mime_type text,
  p_access_mode text,
  p_plan_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_resource_id is null then
    raise exception 'Resource id is required' using errcode = '22023';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'Resource title must contain 1 to 200 characters' using errcode = '22023';
  end if;

  if p_create then
    if exists (select 1 from public.resources where id = p_resource_id) then
      raise exception 'Resource already exists' using errcode = '23505';
    end if;
    insert into public.resources (
      id, title, meta, description, category, grade_levels, delivery_mode,
      cta_url, cover_image_url, file_path, file_name, file_size,
      file_mime_type, status, access_mode, created_by
    ) values (
      p_resource_id, v_title, nullif(btrim(coalesce(p_meta, '')), ''),
      nullif(btrim(coalesce(p_description, '')), ''),
      nullif(btrim(coalesce(p_category, '')), ''),
      coalesce(p_grade_levels, '{}'::text[]), p_delivery_mode,
      nullif(btrim(coalesce(p_cta_url, '')), ''),
      nullif(btrim(coalesce(p_cover_image_url, '')), ''),
      nullif(btrim(coalesce(p_file_path, '')), ''),
      nullif(btrim(coalesce(p_file_name, '')), ''), p_file_size,
      nullif(btrim(coalesce(p_file_mime_type, '')), ''),
      'draft', 'locked', (select auth.uid())
    );
  else
    perform 1 from public.resources where id = p_resource_id for update;
    if not found then
      raise exception 'Resource not found' using errcode = 'P0002';
    end if;
    update public.resources
    set title = v_title,
        meta = nullif(btrim(coalesce(p_meta, '')), ''),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        category = nullif(btrim(coalesce(p_category, '')), ''),
        grade_levels = coalesce(p_grade_levels, '{}'::text[]),
        delivery_mode = p_delivery_mode,
        cta_url = nullif(btrim(coalesce(p_cta_url, '')), ''),
        cover_image_url = nullif(btrim(coalesce(p_cover_image_url, '')), ''),
        file_path = nullif(btrim(coalesce(p_file_path, '')), ''),
        file_name = nullif(btrim(coalesce(p_file_name, '')), ''),
        file_size = p_file_size,
        file_mime_type = nullif(btrim(coalesce(p_file_mime_type, '')), '')
    where id = p_resource_id;
  end if;

  perform public.set_resource_access(p_resource_id, p_access_mode, p_plan_ids);
end;
$$;

revoke all on function public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[]
) from public, anon;
grant execute on function public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[]
) to authenticated;

create table if not exists public.featured_resources (
  resource_id uuid primary key references public.resources(id) on delete cascade,
  position integer not null unique check (position between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.featured_resources enable row level security;
revoke all on public.featured_resources from public, anon, authenticated;
grant select on public.featured_resources to authenticated;

drop policy if exists "featured_resources_admin_read" on public.featured_resources;
create policy "featured_resources_admin_read"
  on public.featured_resources for select
  to authenticated
  using (public.is_admin());

create or replace function public.set_featured_resources(p_resource_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_ids uuid[] := coalesce(p_resource_ids, '{}'::uuid[]);
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if cardinality(v_resource_ids) > 5 then
    raise exception 'At most five featured resources are allowed' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_resource_ids) item where item is null) then
    raise exception 'Featured resource ids cannot be null' using errcode = '22023';
  end if;
  if (select count(distinct item) from unnest(v_resource_ids) item) <> cardinality(v_resource_ids) then
    raise exception 'Featured resources cannot contain duplicates' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_resource_ids) item
    where not exists (
      select 1
      from public.resources r
      where r.id = item
        and r.status = 'published'
    )
  ) then
    raise exception 'Featured resource must exist and be published' using errcode = '22023';
  end if;

  delete from public.featured_resources;
  insert into public.featured_resources (resource_id, position)
  select resource_id, position::integer
  from unnest(v_resource_ids) with ordinality as selected(resource_id, position);
end;
$$;

revoke all on function public.set_featured_resources(uuid[]) from public, anon;
grant execute on function public.set_featured_resources(uuid[]) to authenticated;

-- Feature copy remains coupled to real capabilities. Admins can improve the
-- wording, but cannot advertise a benefit for a plan unless its plan_features
-- row is enabled; the safe view enforces that join.
alter table public.features
  add column if not exists sort_order integer not null default 0;

update public.features
set sort_order = case id
  when 'library.premium' then 10
  when 'download.premium' then 20
  when 'favorites.enabled' then 30
  when 'favorites.limit' then 40
  when 'membership.founder_badge' then 50
  when 'membership.early_access' then 60
  when 'workspace.enabled' then 70
  when 'history.download' then 80
  when 'generator.basic' then 90
  when 'generator.advanced' then 100
  when 'templates.personal' then 110
  when 'ai.enabled' then 120
  when 'ai.monthly_quota' then 130
  when 'school.admin' then 140
  when 'school.shared_library' then 150
  when 'analytics.school' then 160
  else sort_order
end;

create or replace view public.plan_benefit_catalog
with (security_barrier = true) as
select
  pf.plan_id,
  f.id as feature_id,
  f.name as feature_name,
  f.description as feature_description,
  f.value_type,
  pf.limit_value,
  f.sort_order
from public.plan_features pf
join public.features f on f.id = pf.feature_id
where pf.enabled = true;

revoke all on public.plan_benefit_catalog from public;
grant select on public.plan_benefit_catalog to anon, authenticated;

create or replace function public.admin_update_feature_copy(
  p_feature_id text,
  p_name text,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 100 then
    raise exception 'Feature name must contain 1 to 100 characters' using errcode = '22023';
  end if;
  if p_description is not null and char_length(btrim(p_description)) > 500 then
    raise exception 'Feature description is too long' using errcode = '22023';
  end if;

  update public.features
  set name = btrim(p_name),
      description = nullif(btrim(p_description), '')
  where id = p_feature_id;
  if not found then
    raise exception 'Feature not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_update_feature_copy(text, text, text) from public, anon;
grant execute on function public.admin_update_feature_copy(text, text, text) to authenticated;

-- Anonymous `public` resources can resolve their real destination; every other
-- mode remains protected by can_access_resource. The return columns stay
-- unchanged so existing clients remain compatible.
create or replace function public.resolve_resource_target(p_resource_id uuid)
returns table (delivery_mode text, cta_url text, file_path text, file_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.delivery_mode, r.cta_url, r.file_path, r.file_name
  from public.resources r
  where r.id = p_resource_id
    and public.can_access_resource(r.id);
$$;

revoke all on function public.resolve_resource_target(uuid) from public;
grant execute on function public.resolve_resource_target(uuid) to anon, authenticated;

create or replace function public.resource_file_read_allowed(p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.resources r
    where r.file_path = p_path
      and r.id::text = (pg_catalog.regexp_match(p_path, '^([^/]+)/'))[1]
      and public.can_access_resource(r.id)
  );
$$;

revoke all on function public.resource_file_read_allowed(text) from public;
grant execute on function public.resource_file_read_allowed(text) to anon, authenticated;

drop policy if exists resource_files_entitled_read on storage.objects;
create policy resource_files_entitled_read on storage.objects
  for select
  to anon, authenticated
  using (
    bucket_id = 'resource-files'
    and public.resource_file_read_allowed(name)
  );

-- access_mode is safe card metadata. Private destinations remain column-
-- revoked and absent from the catalogue.
grant select (access_mode) on public.resources to anon, authenticated;

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
    when r.access_mode = 'plans' then coalesce(
      (
        select array_agg(p.name order by p.sort_order, p.id)
        from public.resource_plan_access access
        join public.plans p on p.id = access.plan_id
        where access.resource_id = r.id
          and p.lifecycle_status = 'active'
          and p.is_public = true
      ),
      '{}'::text[]
    )
    else '{}'::text[]
  end as required_plan_names,
  (
    r.published_at is not null
    and current_timestamp >= r.published_at
    and current_timestamp < r.published_at + interval '7 days'
  ) as is_new,
  r.access_mode,
  case
    when r.access_mode = 'plans' then coalesce(
      (
        select array_agg(access.plan_id order by p.sort_order, access.plan_id)
        from public.resource_plan_access access
        join public.plans p on p.id = access.plan_id
        where access.resource_id = r.id
      ),
      '{}'::text[]
    )
    else '{}'::text[]
  end as required_plan_ids,
  featured.position as featured_rank
from public.resources r
left join public.featured_resources featured on featured.resource_id = r.id
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
