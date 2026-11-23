-- READ-ONLY verification for migration 062. After applying 062 every row must
-- return ok = true. After a ROLLBACK of 062 the first two rows return ok = false.
select check_name, ok, detail
from (
  select 1 as sort, 'homepage_videos position check allows 1..4' as check_name,
    coalesce((select bool_or(pg_get_constraintdef(c.oid) ~ '<= 4')
      from pg_catalog.pg_constraint c
      where c.conrelid = pg_catalog.to_regclass('public.homepage_videos') and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%position%'), false) as ok,
    'check' as detail

  union all
  select 2, 'admin_set_homepage_videos accepts 4 items',
    coalesce((select p.prosrc ilike '%> 4%' from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure('public.admin_set_homepage_videos(jsonb)')), false),
    'function'

  union all
  select 3, 'admin function is SECURITY DEFINER, empty search_path, not executable by anon',
    coalesce((select p.prosecdef
        and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
        and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure('public.admin_set_homepage_videos(jsonb)')), false),
    'function'

  union all
  select 4, 'homepage_videos stays read-only for browser roles',
    not coalesce(pg_catalog.has_table_privilege('anon', pg_catalog.to_regclass('public.homepage_videos'), 'insert'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.homepage_videos'), 'update'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.homepage_videos'), 'delete'), false),
    'privileges'
) checks
order by sort;
