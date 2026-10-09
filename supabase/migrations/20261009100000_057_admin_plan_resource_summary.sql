-- 057: aggregate-only resource coverage for the admin "plans and benefits" view.
--
-- Only published resources are counted. Access buckets intentionally mirror
-- src/lib/resourceAccess.ts: public = free, authenticated = free member,
-- plans = plan-specific Pro, locked = unavailable. A published plans resource
-- with no resource_plan_access row is called out because no customer can open
-- it through can_access_resource().
--
-- SECURITY: authenticated may execute, but the first operation is the
-- is_admin() gate. PUBLIC and anon cannot execute. search_path is empty and
-- every relation/function is schema-qualified. The result contains resource
-- titles and aggregate counts only; it never reads or returns member data.

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.resources') is null
    or pg_catalog.to_regclass('public.resource_plan_access') is null
    or pg_catalog.to_regclass('public.plans') is null
  then
    raise exception '057: required resource and plan tables are missing. Apply the preceding migration chain first.';
  end if;

  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception '057: public.is_admin() is missing.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc procedure
    join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'get_admin_plan_resource_summary'
      and procedure.oid <> coalesce(
        pg_catalog.to_regprocedure('public.get_admin_plan_resource_summary()'),
        0::oid
      )
  ) then
    raise exception '057: public.get_admin_plan_resource_summary has an unexpected overload. Review it before applying.';
  end if;
end
$$;

create or replace function public.get_admin_plan_resource_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  return (
    with published_resources as (
      select resource.id, resource.title, resource.access_mode, resource.created_at
      from public.resources resource
      where resource.status = 'published'
    ),
    plan_summary as (
      select
        plan.id as plan_id,
        plan.name as plan_name,
        plan.sort_order,
        count(distinct resource.id)::integer as resource_count,
        coalesce((
          select pg_catalog.jsonb_agg(latest.title order by latest.created_at desc, latest.resource_id)
          from (
            select linked_resource.id as resource_id,
              linked_resource.title,
              linked_resource.created_at
            from published_resources linked_resource
            join public.resource_plan_access linked_access
              on linked_access.resource_id = linked_resource.id
             and linked_access.plan_id = plan.id
            where linked_resource.access_mode = 'plans'
            order by linked_resource.created_at desc, linked_resource.id
            limit 5
          ) latest
        ), '[]'::jsonb) as latest_resources
      from public.plans plan
      left join public.resource_plan_access access on access.plan_id = plan.id
      left join published_resources resource
        on resource.id = access.resource_id
       and resource.access_mode = 'plans'
      group by plan.id, plan.name, plan.sort_order
    ),
    unassigned as (
      select resource.id, resource.title, resource.created_at
      from published_resources resource
      where resource.access_mode = 'plans'
        and not exists (
          select 1
          from public.resource_plan_access access
          where access.resource_id = resource.id
        )
    )
    select pg_catalog.jsonb_build_object(
      'access_counts', pg_catalog.jsonb_build_object(
        'free', count(*) filter (where published.access_mode = 'public')::integer,
        'member', count(*) filter (where published.access_mode = 'authenticated')::integer,
        'pro', count(*) filter (where published.access_mode = 'plans')::integer,
        'locked', count(*) filter (where published.access_mode = 'locked')::integer,
        'total', count(*)::integer
      ),
      'plans', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'plan_id', summary.plan_id,
          'plan_name', summary.plan_name,
          'resource_count', summary.resource_count,
          'latest_resources', summary.latest_resources
        ) order by summary.sort_order, summary.plan_id)
        from plan_summary summary
      ), '[]'::jsonb),
      'unassigned_plan_resources', pg_catalog.jsonb_build_object(
        'count', (select count(*)::integer from unassigned),
        'resources', coalesce((
          select pg_catalog.jsonb_agg(recent.title order by recent.created_at desc, recent.resource_id)
          from (
            select orphan.id as resource_id, orphan.title, orphan.created_at
            from unassigned orphan
            order by orphan.created_at desc, orphan.id
            limit 10
          ) recent
        ), '[]'::jsonb)
      )
    )
    from published_resources published
  );
end;
$$;

revoke all on function public.get_admin_plan_resource_summary()
  from public, anon, authenticated;
grant execute on function public.get_admin_plan_resource_summary()
  to authenticated;
