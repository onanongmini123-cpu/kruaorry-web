-- READ-ONLY verification for migration 064. After applying 064 every row must return ok = true.
-- After a ROLLBACK of 064 rows 1 and 2 return ok = false (never an error).
select check_name, ok, detail
from (
  select 1 as sort, 'set_featured_resources deletes with an explicit WHERE (pg_safeupdate safe)' as check_name,
    coalesce((select p.prosrc ilike '%delete from public.featured_resources where true%'
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.set_featured_resources(uuid[])')), false) as ok,
    'source' as detail

  union all
  select 2, 'no DELETE or UPDATE without WHERE remains in the function',
    coalesce((select not exists (
        select 1 from pg_catalog.regexp_matches(p.prosrc, '(delete\s+from\s+[a-z_.]+|update\s+[a-z_.]+\s+set[^;]*)\s*;', 'gi') m
        where m[1] !~* '\mwhere\M')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.set_featured_resources(uuid[])')), false),
    'source'

  union all
  select 3, 'still SECURITY DEFINER, empty search_path, admin gate first, not executable by anon',
    coalesce((select p.prosecdef
        and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
        and p.prosrc ilike '%is_admin()%'
        and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.set_featured_resources(uuid[])')), false),
    'function'
) checks
order by sort;
