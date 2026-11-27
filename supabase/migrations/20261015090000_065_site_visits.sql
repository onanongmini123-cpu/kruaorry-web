-- 065: approximate daily visitors for the owner's "บัญชีและเป้าหมาย" page. ADDITIVE ONLY.
--
-- WHAT THIS ADDS (nothing existing is changed)
--   public.site_visit_daily (visit_date, viewer_day_key): one row per viewer per Thai day.
--     viewer_day_key is HMAC-SHA256(secret, random cookie id + Thai date) computed by the
--     web server (POST /api/visit). It holds no IP, e-mail, user id or user agent, and the
--     same person gets a different key every day, so days cannot be linked to each other.
--     RLS is on and there is NO policy: anon and authenticated cannot read or write it.
--   public.site_visit_bangkok_date(timestamptz): the Thai calendar day of a moment.
--   public.record_site_visit(p_viewer_day_key text): insert ... on conflict do nothing.
--     service_role only (called from the server route, never from a browser).
--     The FIRST visit of each Thai day also prunes rows older than 90 days, so no
--     scheduled job is needed.
--   public.prune_site_visits(): DELETE ... WHERE visit_date < today - 90. service_role only.
--   public.owner_site_visit_summary(p_days int default 30): owner only (public.is_owner()
--     checked first, error 42501 otherwise). Returns today, last_7_days, last_30_days and
--     one row per day (days with no visits = 0). The 7/30-day figures are sums of daily
--     visitors: the same person on two days counts twice (keys change daily by design).
--
-- pg_safeupdate: every DELETE/UPDATE here has a WHERE clause.
--
-- ROLLBACK
--   supabase/rollbacks/20261015090000_065_site_visits.rollback.sql (drops the table and
--   the four functions; visit counts are lost).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; staging first; then
--   supabase/verification/065-verify.sql (every row ok = true).

set local lock_timeout = '5s';

create table if not exists public.site_visit_daily (
  visit_date date not null,
  viewer_day_key text not null check (viewer_day_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  primary key (visit_date, viewer_day_key)
);

comment on table public.site_visit_daily is
  'Approximate daily visitors (065). One row per viewer per Thai day; the key is a daily HMAC from the server, no personal data. Read through owner_site_visit_summary only.';

alter table public.site_visit_daily enable row level security;
-- No policies on purpose: only SECURITY DEFINER functions below touch the table.
revoke all on table public.site_visit_daily from public, anon, authenticated;

create or replace function public.site_visit_bangkok_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'Asia/Bangkok')::date;
$$;

create or replace function public.prune_site_visits()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.site_visit_daily
  where visit_date < public.site_visit_bangkok_date(pg_catalog.now()) - 90;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.record_site_visit(p_viewer_day_key text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.site_visit_bangkok_date(pg_catalog.now());
  v_inserted integer;
begin
  if p_viewer_day_key is null or p_viewer_day_key !~ '^[0-9a-f]{64}$' then
    raise exception 'viewer_day_key must be 64 lowercase hex characters' using errcode = '22023';
  end if;

  insert into public.site_visit_daily (visit_date, viewer_day_key)
  values (v_today, p_viewer_day_key)
  on conflict do nothing;
  get diagnostics v_inserted = row_count;

  -- First visitor of a new Thai day: drop rows older than 90 days (cheap, once a day).
  if v_inserted = 1 and not exists (
    select 1 from public.site_visit_daily
    where visit_date = v_today and viewer_day_key <> p_viewer_day_key
  ) then
    perform public.prune_site_visits();
  end if;

  return v_inserted = 1;
end;
$$;

create or replace function public.owner_site_visit_summary(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_today date;
  v_result jsonb;
begin
  if not coalesce(public.is_owner(), false) then
    raise exception 'Only the site owner can read visitor numbers' using errcode = '42501';
  end if;

  v_days := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today := public.site_visit_bangkok_date(pg_catalog.now());

  with daily as (
    select d::date as day,
      (select count(*) from public.site_visit_daily v where v.visit_date = d::date)::integer as visitors
    from pg_catalog.generate_series(v_today - (v_days - 1), v_today, interval '1 day') as d
  )
  select jsonb_build_object(
    'timezone', 'Asia/Bangkok',
    'today', (select count(*) from public.site_visit_daily where visit_date = v_today)::integer,
    'last_7_days', (select count(*) from public.site_visit_daily where visit_date > v_today - 7 and visit_date <= v_today)::integer,
    'last_30_days', (select count(*) from public.site_visit_daily where visit_date > v_today - 30 and visit_date <= v_today)::integer,
    'days', coalesce((select jsonb_agg(jsonb_build_object('date', day, 'visitors', visitors) order by day) from daily), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.site_visit_bangkok_date(timestamptz) from public, anon, authenticated;
revoke all on function public.prune_site_visits() from public, anon, authenticated;
revoke all on function public.record_site_visit(text) from public, anon, authenticated;
revoke all on function public.owner_site_visit_summary(integer) from public, anon;
grant execute on function public.site_visit_bangkok_date(timestamptz) to service_role;
grant execute on function public.prune_site_visits() to service_role;
grant execute on function public.record_site_visit(text) to service_role;
grant execute on function public.owner_site_visit_summary(integer) to authenticated;
