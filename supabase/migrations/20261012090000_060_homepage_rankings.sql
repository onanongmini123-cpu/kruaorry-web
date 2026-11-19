-- 060: homepage rankings (most hearted, most viewed in 30 days, newest).
-- ADDITIVE ONLY.
--
-- PURPOSE
--   * resource_view_daily: at most ONE row per (resource, anonymous viewer, day),
--     the raw material for "ยอดนิยม". The viewer key is a random id from a
--     first-party cookie: no IP address, no user id, no name, no user agent.
--   * record_resource_view(uuid, text): called by the application server after it
--     skipped admins and bots; counts a view of a PUBLISHED resource once per
--     viewer per Bangkok calendar day.
--   * get_homepage_rankings(int): one JSON answer for the homepage with the three
--     top lists. It returns resource ids and COUNTS only (hearts as a number per
--     resource, also in `heart_counts`; never who pressed a heart), only for resources that appear in the
--     public catalogue (published, usable destination).
--
-- WHAT IT DOES NOT TOUCH
--   saved_resources (existing favourites), resources, resource_catalog, plans,
--   prices and access rules are only READ by the new function; no row is changed.
--
-- PRIVACY / LIMITS
--   The table has RLS on and no browser privilege at all; only the two SECURITY
--   DEFINER functions touch it. Counting is indicative, not tamper-proof: anyone
--   could call the public function with fresh random keys. Do not use these
--   counts for payments or rewards. Rows are never needed beyond 30 days for the
--   ranking; prune with: delete from public.resource_view_daily where view_date < current_date - 90;
--
-- DEPLOY-SAFE ORDER
--   The application reads the rankings defensively: without this migration the
--   homepage simply shows no ranking rows (each row is hidden below 3 items), and
--   views are not recorded. It can be deployed before or after this file.
--
-- ROLLBACK
--   supabase/rollbacks/20261012090000_060_homepage_rankings.rollback.sql
--   (drops both functions and the table; collected view rows are discarded).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; apply to a Preview or
--   staging database first; then run supabase/verification/060-verify.sql.

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.resources') is null
     or pg_catalog.to_regclass('public.saved_resources') is null
     or pg_catalog.to_regclass('public.resource_catalog') is null then
    raise exception '060: resources, saved_resources and resource_catalog are required.';
  end if;
end
$$;

create table if not exists public.resource_view_daily (
  resource_id uuid not null references public.resources(id) on delete cascade,
  viewer_key text not null check (viewer_key ~ '^[0-9a-f]{32}$'),
  view_date date not null,
  primary key (resource_id, viewer_key, view_date)
);

create index if not exists resource_view_daily_date_idx
  on public.resource_view_daily (view_date, resource_id);

alter table public.resource_view_daily enable row level security;
revoke all on public.resource_view_daily from public, anon, authenticated;

create or replace function public.record_resource_view(
  p_resource_id uuid,
  p_viewer_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_resource_id is null or p_viewer_key is null or p_viewer_key !~ '^[0-9a-f]{32}$' then
    return;
  end if;
  -- Only a published resource that the public catalogue shows can be counted.
  if not exists (select 1 from public.resource_catalog c where c.id = p_resource_id) then
    return;
  end if;
  insert into public.resource_view_daily (resource_id, viewer_key, view_date)
  values (p_resource_id, p_viewer_key, (pg_catalog.now() at time zone 'Asia/Bangkok')::date)
  on conflict do nothing;
end;
$$;

revoke all on function public.record_resource_view(uuid, text) from public;
grant execute on function public.record_resource_view(uuid, text) to anon, authenticated;

create or replace function public.get_homepage_rankings(p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 10));
  v_today date := (pg_catalog.now() at time zone 'Asia/Bangkok')::date;
  v_hearts jsonb;
  v_popular jsonb;
  v_basis text := '30d';
  v_newest jsonb;
  v_counts jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', t.id, 'count', t.n) order by t.n desc, t.published_at desc nulls last, t.id), '[]'::jsonb)
    into v_hearts
  from (
    select c.id, c.published_at, pg_catalog.count(*)::integer as n
    from public.saved_resources s
    join public.resource_catalog c on c.id = s.resource_id
    group by c.id, c.published_at
    order by n desc, c.published_at desc nulls last, c.id
    limit v_limit
  ) t;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', t.id) order by t.n desc, t.published_at desc nulls last, t.id), '[]'::jsonb)
    into v_popular
  from (
    select c.id, c.published_at, pg_catalog.count(*)::integer as n
    from public.resource_view_daily v
    join public.resource_catalog c on c.id = v.resource_id
    where v.view_date >= v_today - 29
    group by c.id, c.published_at
    order by n desc, c.published_at desc nulls last, c.id
    limit v_limit
  ) t;

  -- Not enough recent data: fall back to all-time views.
  if pg_catalog.jsonb_array_length(v_popular) < 3 then
    v_basis := 'all_time';
    select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', t.id) order by t.n desc, t.published_at desc nulls last, t.id), '[]'::jsonb)
      into v_popular
    from (
      select c.id, c.published_at, pg_catalog.count(*)::integer as n
      from public.resource_view_daily v
      join public.resource_catalog c on c.id = v.resource_id
      group by c.id, c.published_at
      order by n desc, c.published_at desc nulls last, c.id
      limit v_limit
    ) t;
  end if;

  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', t.id) order by t.published_at desc nulls last, t.id), '[]'::jsonb)
    into v_newest
  from (
    select c.id, c.published_at
    from public.resource_catalog c
    where c.published_at is not null
    order by c.published_at desc, c.id
    limit v_limit
  ) t;

  -- Heart COUNT per listed resource (so every card can show it); never who.
  select coalesce(pg_catalog.jsonb_object_agg(x.id, x.n), '{}'::jsonb)
    into v_counts
  from (
    select s.resource_id::text as id, pg_catalog.count(*)::integer as n
    from public.saved_resources s
    where s.resource_id in (
      select (e ->> 'id')::uuid
      from pg_catalog.jsonb_array_elements(v_hearts || v_popular || v_newest) e
    )
    group by s.resource_id
  ) x;

  return pg_catalog.jsonb_build_object(
    'hearts', v_hearts,
    'popular', pg_catalog.jsonb_build_object('basis', v_basis, 'items', v_popular),
    'newest', v_newest,
    'heart_counts', v_counts
  );
end;
$$;

revoke all on function public.get_homepage_rankings(integer) from public;
grant execute on function public.get_homepage_rankings(integer) to anon, authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.resource_view_daily', 'select')
     or has_table_privilege('authenticated', 'public.resource_view_daily', 'select')
     or has_table_privilege('anon', 'public.resource_view_daily', 'insert')
     or has_table_privilege('authenticated', 'public.resource_view_daily', 'insert') then
    raise exception '060: resource_view_daily must have no browser privilege';
  end if;
  if not has_function_privilege('anon', 'public.get_homepage_rankings(integer)', 'execute')
     or not has_function_privilege('authenticated', 'public.record_resource_view(uuid, text)', 'execute') then
    raise exception '060: the ranking and view functions must be executable by the browser roles';
  end if;
end
$$;
