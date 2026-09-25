-- Batch 4: isolate teacher requests, add entitlement-gated reviews, and add
-- private issue reports. Browser callers never supply an authoritative user
-- id; every write RPC derives it from auth.uid().

-- Requests are no longer a shared member message board. A member can read only
-- their own submission; admins/owners can triage every row.
drop policy if exists "requests_read_all_members" on public.requests;
drop policy if exists "requests_select_own_or_admin" on public.requests;
create policy "requests_select_own_or_admin"
  on public.requests for select
  to authenticated
  using ((select auth.uid()) = requested_by or public.is_admin());

drop policy if exists "requests_insert_own" on public.requests;
drop policy if exists "requests_admin_update" on public.requests;
create policy "requests_admin_update"
  on public.requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke select, insert, update, delete on public.requests from public, anon, authenticated;
grant select, update on public.requests to authenticated;

create or replace function public.submit_my_request(p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_title text := btrim(coalesce(p_title, ''));
  v_request_id uuid;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;
  if char_length(v_title) < 3 or char_length(v_title) > 200 then
    raise exception 'Request title must contain 3 to 200 characters' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('teacher-request:' || v_user_id::text, 0)
  );
  if (
    select count(*) from public.requests request
    where request.requested_by = v_user_id
      and request.created_at >= current_timestamp - interval '24 hours'
  ) >= 5 then
    raise exception 'Request rate limit reached' using errcode = 'P0001';
  end if;

  insert into public.requests (title, requested_by, votes, status)
  values (v_title, v_user_id, 0, 'pending')
  returning id into v_request_id;
  return v_request_id;
end;
$$;

revoke all on function public.submit_my_request(text) from public, anon;
grant execute on function public.submit_my_request(text) to authenticated;

create table if not exists public.resource_reviews (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 3 and 1000),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending', 'visible', 'hidden')),
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, resource_id)
);

create index if not exists idx_resource_reviews_resource_visible
  on public.resource_reviews(resource_id, updated_at desc)
  where moderation_status = 'visible';
create index if not exists idx_resource_reviews_user
  on public.resource_reviews(user_id, updated_at desc);

alter table public.resource_reviews enable row level security;
revoke all on public.resource_reviews from public, anon, authenticated;
grant select on public.resource_reviews to authenticated;

drop policy if exists "resource_reviews_own_or_admin_read" on public.resource_reviews;
drop policy if exists "resource_reviews_admin_read" on public.resource_reviews;
create policy "resource_reviews_admin_read"
  on public.resource_reviews for select
  to authenticated
  using (public.is_admin());

-- Members read only their own safe fields through this caller-derived RPC.
-- The base row includes internal moderation actor metadata and is therefore
-- deliberately admin-only.
create or replace function public.get_my_resource_review(p_resource_id uuid)
returns table (rating integer, body text, moderation_status text)
language plpgsql
stable
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
  return query
  select review.rating::integer, review.body, review.moderation_status
  from public.resource_reviews review
  where review.resource_id = p_resource_id
    and review.user_id = v_user_id;
end;
$$;

create or replace function public.upsert_my_resource_review(
  p_resource_id uuid,
  p_rating integer,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_body text := btrim(coalesce(p_body, ''));
  v_review_id uuid;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be between 1 and 5' using errcode = '22023';
  end if;
  if char_length(v_body) < 3 or char_length(v_body) > 1000 then
    raise exception 'Review must contain 3 to 1000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resources resource
    where resource.id = p_resource_id
      and resource.status = 'published'
  ) or not public.can_access_resource(p_resource_id) then
    raise exception 'Published entitled resource required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'resource-review:' || v_user_id::text || ':' || p_resource_id::text,
      0
    )
  );

  insert into public.resource_reviews (resource_id, user_id, rating, body)
  values (p_resource_id, v_user_id, p_rating, v_body)
  on conflict (user_id, resource_id) do update set
    rating = excluded.rating,
    body = excluded.body,
    moderation_status = 'pending',
    moderated_by = null,
    moderated_at = null,
    updated_at = current_timestamp
  returning id into v_review_id;
  return v_review_id;
end;
$$;

create or replace function public.delete_my_resource_review(p_resource_id uuid)
returns void
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
  delete from public.resource_reviews
  where resource_id = p_resource_id and user_id = v_user_id;
end;
$$;

create or replace function public.admin_set_review_visibility(
  p_review_id uuid,
  p_visible boolean
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
  update public.resource_reviews
  set moderation_status = case when p_visible then 'visible' else 'hidden' end,
      moderated_by = (select auth.uid()),
      moderated_at = current_timestamp
  where id = p_review_id;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.admin_delete_resource_review(p_review_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  delete from public.resource_reviews where id = p_review_id;
  if not found then
    raise exception 'Review not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.upsert_my_resource_review(uuid, integer, text) from public, anon;
revoke all on function public.delete_my_resource_review(uuid) from public, anon;
revoke all on function public.admin_set_review_visibility(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_resource_review(uuid) from public, anon;
revoke all on function public.get_my_resource_review(uuid) from public, anon;
grant execute on function public.upsert_my_resource_review(uuid, integer, text) to authenticated;
grant execute on function public.delete_my_resource_review(uuid) to authenticated;
grant execute on function public.admin_set_review_visibility(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_resource_review(uuid) to authenticated;
grant execute on function public.get_my_resource_review(uuid) to authenticated;

-- A sanitized public feed. Reviews are intentionally anonymous: profile
-- changes cannot bypass review moderation and no auth/profile identifier or
-- avatar path is disclosed to anonymous readers.
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

create or replace view public.resource_review_summary
with (security_barrier = true) as
select
  resource.id as resource_id,
  round(avg(review.rating)::numeric, 1) as review_average,
  count(review.id)::bigint as review_count
from public.resources resource
left join public.resource_reviews review
  on review.resource_id = resource.id
 and review.moderation_status = 'visible'
where resource.status = 'published'
group by resource.id;

revoke all on public.resource_review_feed from public;
revoke all on public.resource_review_summary from public;
grant select on public.resource_review_feed to anon, authenticated;
grant select on public.resource_review_summary to anon, authenticated;

create table if not exists public.resource_issue_reports (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  category text not null
    check (category in ('cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other')),
  details text not null check (char_length(btrim(details)) between 5 and 1000),
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'resolved')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists resource_issue_reports_one_unresolved_kind
  on public.resource_issue_reports(reporter_id, resource_id, category)
  where status <> 'resolved';
create index if not exists idx_resource_issue_reports_admin_queue
  on public.resource_issue_reports(status, created_at desc);
create index if not exists idx_resource_issue_reports_rate_limit
  on public.resource_issue_reports(reporter_id, created_at desc);

alter table public.resource_issue_reports enable row level security;
revoke all on public.resource_issue_reports from public, anon, authenticated;
grant select on public.resource_issue_reports to authenticated;

drop policy if exists "resource_issue_reports_admin_read" on public.resource_issue_reports;
create policy "resource_issue_reports_admin_read"
  on public.resource_issue_reports for select
  to authenticated
  using (public.is_admin());

create or replace function public.submit_resource_issue(
  p_resource_id uuid,
  p_category text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_details text := btrim(coalesce(p_details, ''));
  v_report_id uuid;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;
  if p_category not in ('cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other') then
    raise exception 'Invalid issue category' using errcode = '22023';
  end if;
  if char_length(v_details) < 5 or char_length(v_details) > 1000 then
    raise exception 'Issue details must contain 5 to 1000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resources resource
    where resource.id = p_resource_id
      and resource.status = 'published'
  ) or not public.can_access_resource(p_resource_id) then
    raise exception 'Published entitled resource required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resource-report:' || v_user_id::text, 0)
  );
  if (
    select count(*) from public.resource_issue_reports report
    where report.reporter_id = v_user_id
      and report.created_at >= current_timestamp - interval '1 hour'
  ) >= 5 then
    raise exception 'Issue report rate limit reached' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.resource_issue_reports report
    where report.reporter_id = v_user_id
      and report.resource_id = p_resource_id
      and report.category = p_category
      and report.status <> 'resolved'
  ) then
    raise exception 'An unresolved report of this type already exists' using errcode = '23505';
  end if;

  insert into public.resource_issue_reports (
    resource_id, reporter_id, category, details, status
  ) values (
    p_resource_id, v_user_id, p_category, v_details, 'pending'
  ) returning id into v_report_id;
  return v_report_id;
end;
$$;

create or replace function public.admin_set_resource_issue_status(
  p_report_id uuid,
  p_status text
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
  if p_status not in ('pending', 'in_progress', 'resolved') then
    raise exception 'Invalid issue status' using errcode = '22023';
  end if;
  update public.resource_issue_reports
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then current_timestamp else null end,
      updated_at = current_timestamp
  where id = p_report_id;
  if not found then
    raise exception 'Issue report not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.submit_resource_issue(uuid, text, text) from public, anon;
revoke all on function public.admin_set_resource_issue_status(uuid, text) from public, anon;
grant execute on function public.submit_resource_issue(uuid, text, text) to authenticated;
grant execute on function public.admin_set_resource_issue_status(uuid, text) to authenticated;

-- Append aggregate review data to the safe catalogue without exposing reviewer
-- identity or private resource destinations.
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
  featured.position as featured_rank,
  review_stats.review_average,
  review_stats.review_count
from public.resources r
left join public.featured_resources featured on featured.resource_id = r.id
left join lateral (
  select
    round(avg(review.rating)::numeric, 1) as review_average,
    count(review.id)::bigint as review_count
  from public.resource_reviews review
  where review.resource_id = r.id
    and review.moderation_status = 'visible'
) review_stats on true
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
