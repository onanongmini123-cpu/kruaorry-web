-- 056: aggregate-only business insights for the admin overview.
--
-- This function is read-only and returns no member identity, email, payment
-- reference or other row-level detail. Calendar windows use Asia/Bangkok:
-- "this month" begins at local midnight on day 1, while 7/30-day member
-- windows begin at local midnight 6/29 calendar days before the report date.
-- Revenue comes only from the immutable payment-confirmation audit introduced
-- by 048. That audit has no refund/void status, so the result explicitly says
-- refunds are not represented instead of guessing from subscription state.
--
-- SECURITY: authenticated may execute, but the first operation is the
-- is_admin() gate. PUBLIC and anon cannot execute. search_path is empty and
-- every relation/function is schema-qualified.

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.membership_payment_confirmations') is null
    or pg_catalog.to_regclass('public.subscriptions') is null
    or pg_catalog.to_regclass('public.founder_seat_ledger') is null
    or pg_catalog.to_regclass('public.saved_resources') is null
    or pg_catalog.to_regclass('public.resource_reviews') is null
    or pg_catalog.to_regclass('public.upgrade_requests') is null
    or pg_catalog.to_regclass('public.resources') is null
  then
    raise exception '056: required membership and resource tables are missing. Apply the preceding migration chain first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception '056: public.is_admin() is missing.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_admin_overview_insights'
      and procedure.oid <> coalesce(
        pg_catalog.to_regprocedure('public.get_admin_overview_insights(timestamp with time zone)'),
        0::oid
      )
  ) then
    raise exception '056: public.get_admin_overview_insights has an unexpected overload. Review it before applying.';
  end if;
end
$$;

create or replace function public.get_admin_overview_insights(
  p_as_of timestamp with time zone default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_as_of timestamp with time zone := coalesce(p_as_of, pg_catalog.statement_timestamp());
  v_local_date date;
  v_month_start timestamp with time zone;
  v_seven_day_start timestamp with time zone;
  v_thirty_day_start timestamp with time zone;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  v_local_date := (v_as_of at time zone 'Asia/Bangkok')::date;
  v_month_start := pg_catalog.date_trunc('month', v_as_of at time zone 'Asia/Bangkok')
    at time zone 'Asia/Bangkok';
  v_seven_day_start := (v_local_date - 6)::timestamp at time zone 'Asia/Bangkok';
  v_thirty_day_start := (v_local_date - 29)::timestamp at time zone 'Asia/Bangkok';

  return (
    with premium_plans as (
      select feature.plan_id
      from public.plan_features feature
      where feature.feature_id = 'library.premium'
        and feature.enabled = true
    ),
    member_profiles as (
      select profile.id, profile.created_at
      from public.profiles profile
      where profile.role = 'member'
    ),
    premium_subscriptions as (
      select distinct subscription.user_id, subscription.current_period_end
      from public.subscriptions subscription
      join member_profiles member on member.id = subscription.user_id
      join premium_plans premium on premium.plan_id = subscription.plan_id
      where subscription.status in ('active', 'past_due')
        and (
          subscription.current_period_end is null
          or subscription.current_period_end > v_as_of
        )
    )
    select pg_catalog.jsonb_build_object(
      'as_of', v_as_of,
      'timezone', 'Asia/Bangkok',
      'periods', pg_catalog.jsonb_build_object(
        'month_start', v_month_start,
        'new_members_7_days_start', v_seven_day_start,
        'new_members_30_days_start', v_thirty_day_start
      ),
      'revenue', pg_catalog.jsonb_build_object(
        'month_confirmed_thb', coalesce((
          select sum(confirmation.amount_thb)::bigint
          from public.membership_payment_confirmations confirmation
          where confirmation.confirmed_at >= v_month_start
            and confirmation.confirmed_at <= v_as_of
        ), 0::bigint),
        'all_time_confirmed_thb', coalesce((
          select sum(confirmation.amount_thb)::bigint
          from public.membership_payment_confirmations confirmation
          where confirmation.confirmed_at <= v_as_of
        ), 0::bigint),
        'first_confirmed_at', (
          select min(confirmation.confirmed_at)
          from public.membership_payment_confirmations confirmation
          where confirmation.confirmed_at <= v_as_of
        ),
        'refunds_supported', false
      ),
      'premium_memberships', pg_catalog.jsonb_build_object(
        'active_count', (select count(*)::integer from premium_subscriptions),
        'expiring_within_30_days_count', (
          select count(*)::integer
          from premium_subscriptions subscription
          where subscription.current_period_end > v_as_of
            and subscription.current_period_end <= v_as_of + interval '30 days'
        )
      ),
      'new_members', pg_catalog.jsonb_build_object(
        'last_7_days_count', (
          select count(*)::integer
          from member_profiles member
          where member.created_at >= v_seven_day_start
            and member.created_at <= v_as_of
        ),
        'last_30_days_count', (
          select count(*)::integer
          from member_profiles member
          where member.created_at >= v_thirty_day_start
            and member.created_at <= v_as_of
        )
      ),
      'founder_seats', pg_catalog.jsonb_build_object(
        'used', (select count(*)::integer from public.founder_seat_ledger),
        'capacity', 100
      ),
      'application_funnel', pg_catalog.jsonb_build_object(
        'total_members', (select count(*)::integer from member_profiles),
        'requested_premium', (
          select count(distinct request.user_id)::integer
          from public.upgrade_requests request
          join member_profiles member on member.id = request.user_id
          join premium_plans premium on premium.plan_id = request.plan_id
        ),
        'approved_premium', (
          select count(distinct request.user_id)::integer
          from public.upgrade_requests request
          join member_profiles member on member.id = request.user_id
          join premium_plans premium on premium.plan_id = request.plan_id
          where request.status = 'approved'
        )
      ),
      'favorites', pg_catalog.jsonb_build_object(
        'top_published_resources', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'title', ranked.title,
            'heart_count', ranked.heart_count
          ) order by ranked.heart_count desc, ranked.title, ranked.resource_id)
          from (
            select resource.id as resource_id, resource.title,
              count(saved.resource_id)::integer as heart_count
            from public.resources resource
            join public.saved_resources saved on saved.resource_id = resource.id
            where resource.status = 'published'
            group by resource.id, resource.title
            order by count(saved.resource_id) desc, resource.title, resource.id
            limit 5
          ) ranked
        ), '[]'::jsonb),
        'published_without_hearts_count', (
          select count(*)::integer
          from public.resources resource
          where resource.status = 'published'
            and not exists (
              select 1 from public.saved_resources saved
              where saved.resource_id = resource.id
            )
        )
      ),
      'reviews', pg_catalog.jsonb_build_object(
        'minimum_review_count', 3,
        'top_published_resources', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'title', ranked.title,
            'average_rating', ranked.average_rating,
            'review_count', ranked.review_count
          ) order by ranked.average_rating desc, ranked.review_count desc, ranked.title, ranked.resource_id)
          from (
            select resource.id as resource_id, resource.title,
              pg_catalog.round(avg(review.rating)::numeric, 2) as average_rating,
              count(*)::integer as review_count
            from public.resources resource
            join public.resource_reviews review on review.resource_id = resource.id
            where resource.status = 'published'
              and review.moderation_status = 'visible'
            group by resource.id, resource.title
            having count(*) >= 3
            order by avg(review.rating) desc, count(*) desc, resource.title, resource.id
            limit 3
          ) ranked
        ), '[]'::jsonb)
      ),
      'content_breakdown', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'grade_level', grouped.grade_level,
          'category', grouped.category,
          'resource_count', grouped.resource_count
        ) order by grouped.grade_level, grouped.category)
        from (
          select grade.grade_level,
            coalesce(nullif(pg_catalog.btrim(resource.category), ''), 'ไม่ระบุหมวดหมู่') as category,
            count(distinct resource.id)::integer as resource_count
          from public.resources resource
          cross join lateral pg_catalog.unnest(
            case
              when pg_catalog.cardinality(resource.grade_levels) = 0 then array['unspecified']::text[]
              else resource.grade_levels
            end
          ) as grade(grade_level)
          where resource.status = 'published'
          group by grade.grade_level,
            coalesce(nullif(pg_catalog.btrim(resource.category), ''), 'ไม่ระบุหมวดหมู่')
        ) grouped
      ), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.get_admin_overview_insights(timestamp with time zone)
  from public, anon;
grant execute on function public.get_admin_overview_insights(timestamp with time zone)
  to authenticated;
