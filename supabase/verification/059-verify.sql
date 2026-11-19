-- READ-ONLY verification for migration 059. Every row must return ok = true.
select check_name, ok, detail
from (
  select 1 as sort, 'resource_previews exists with RLS on' as check_name,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.resource_previews')), false) as ok,
    'table + rls' as detail

  union all
  select 2, 'browser roles cannot read or write resource_previews directly (admins read through RLS)',
    not pg_catalog.has_table_privilege('anon', 'public.resource_previews', 'select')
    and not pg_catalog.has_table_privilege('anon', 'public.resource_previews', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.resource_previews', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.resource_previews', 'update')
    and not pg_catalog.has_table_privilege('authenticated', 'public.resource_previews', 'delete'),
    'grants'

  union all
  select 3, 'resource_preview_catalog exposes exactly resource_id, position, image_url',
    (select array_agg(a.attname order by a.attnum) = array['resource_id', 'position', 'image_url']::name[]
     from pg_catalog.pg_attribute a
     where a.attrelid = pg_catalog.to_regclass('public.resource_preview_catalog') and a.attnum > 0 and not a.attisdropped),
    'columns'

  union all
  select 4, 'resource_preview_catalog is a read-only security_barrier view',
    coalesce(pg_catalog.array_position((select c.reloptions from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.resource_preview_catalog')), 'security_barrier=true') is not null, false)
    and pg_catalog.has_table_privilege('anon', 'public.resource_preview_catalog', 'select')
    and not pg_catalog.has_table_privilege('anon', 'public.resource_preview_catalog', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.resource_preview_catalog', 'update'),
    'view'

  union all
  select 5, 'admin_set_resource_previews is SECURITY DEFINER, empty search_path, authenticated only',
    coalesce(p.prosecdef
      and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE'), false),
    coalesce(p.proconfig::text, 'function not found')
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure('public.admin_set_resource_previews(uuid, jsonb)')
) checks
order by sort;
