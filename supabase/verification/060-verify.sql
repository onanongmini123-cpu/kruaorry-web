-- READ-ONLY verification for migration 060. After applying 060 every row must return ok = true.
-- After a ROLLBACK of 060 every row returns ok = false (it never raises an error), which is the
-- expected proof that the objects are gone.
select check_name, ok, detail
from (
  select 1 as sort, 'resource_view_daily exists with RLS on and no browser privilege' as check_name,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.resource_view_daily')), false)
    and not coalesce(pg_catalog.has_table_privilege('anon', pg_catalog.to_regclass('public.resource_view_daily'), 'select'), false)
    and not coalesce(pg_catalog.has_table_privilege('anon', pg_catalog.to_regclass('public.resource_view_daily'), 'insert'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.resource_view_daily'), 'select'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.resource_view_daily'), 'insert'), false) as ok,
    'table' as detail

  union all
  select 2, 'view table has only resource_id, viewer_key, view_date (no user id, IP or user agent)',
    coalesce((select array_agg(a.attname order by a.attnum) = array['resource_id', 'viewer_key', 'view_date']::name[]
     from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.to_regclass('public.resource_view_daily') and a.attnum > 0 and not a.attisdropped), false),
    'columns'

  union all
  select 3, 'both functions are SECURITY DEFINER with an empty search_path and executable by anon and authenticated',
    coalesce(bool_and(
      p.prosecdef
      and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
      and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ), false),
    count(*)::text || ' functions (expect 2)'
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('record_resource_view', 'get_homepage_rankings')

  union all
  select 4, 'ranking answer has hearts, popular, newest and heart_counts and never an id of a person',
    -- After a rollback the function is gone: report false instead of failing with
    -- "function does not exist". The CASE keeps the call from being evaluated then.
    case
      when pg_catalog.to_regprocedure('public.get_homepage_rankings(integer)') is null then false
      else coalesce((
        select (r ?& array['hearts', 'popular', 'newest', 'heart_counts'])
           and not (r::text ~ '"(user_id|email|full_name|viewer_key)"')
        from (
          select (xpath('/row/r/text()',
                   pg_catalog.query_to_xml('select public.get_homepage_rankings(10)::text as r', false, true, '')))[1]::text::jsonb as r
        ) x
      ), false)
    end,
    'shape'
) checks
order by sort;
