-- READ-ONLY verification for migration 065. After applying 065 every row must return ok = true.
-- After a ROLLBACK of 065 every row returns ok = false (never an error).
select check_name, ok, detail
from (
  select 1 as sort, 'site_visit_daily exists with RLS on and no policies' as check_name,
    coalesce((select c.relrowsecurity
        and not exists (select 1 from pg_catalog.pg_policy p where p.polrelid = c.oid)
      from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.site_visit_daily')), false) as ok,
    'table' as detail

  union all
  select 2, 'anon and authenticated have no privilege on site_visit_daily',
    coalesce((select not pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
        and not pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE')
      from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.site_visit_daily')), false),
    'grants'

  union all
  select 3, 'record_site_visit: SECURITY DEFINER, empty search_path, service_role only',
    coalesce((select p.prosecdef
        and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
        and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.record_site_visit(text)')), false),
    'function'

  union all
  select 4, 'prune_site_visits: SECURITY DEFINER, service_role only, DELETE has a WHERE',
    coalesce((select p.prosecdef
        and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
        and p.prosrc ~* 'delete\s+from\s+public\.site_visit_daily\s+where'
        and pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.prune_site_visits()')), false),
    'function'

  union all
  select 5, 'owner_site_visit_summary: SECURITY DEFINER, empty search_path, is_owner() gate, authenticated not anon',
    coalesce((select p.prosecdef
        and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
        and p.prosrc ilike '%public.is_owner()%'
        and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.owner_site_visit_summary(integer)')), false),
    'function'

  union all
  select 6, 'site_visit_bangkok_date: Thai day, not executable by anon or authenticated',
    coalesce((select p.prosrc ilike '%Asia/Bangkok%'
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.site_visit_bangkok_date(timestamptz)')), false),
    'function'
) checks
order by sort;
