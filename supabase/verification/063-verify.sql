-- READ-ONLY verification for migration 063. After applying 063 every row must
-- return ok = true. After a ROLLBACK of 063 every row returns ok = false (never an error).
select check_name, ok, detail
from (
  select 1 as sort, 'admin_set_resource_cover(uuid, text) exists, SECURITY DEFINER, empty search_path' as check_name,
    coalesce((select p.prosecdef and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.admin_set_resource_cover(uuid, text)')), false) as ok,
    'function' as detail

  union all
  select 2, 'signed-in users can call it (the admin gate is inside) and anon cannot',
    coalesce((select pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.admin_set_resource_cover(uuid, text)')), false),
    'privileges'

  union all
  select 3, 'it updates only cover_image_url (source never mentions status, published_at, slug or access)',
    coalesce((select p.prosrc ilike '%set cover_image_url = p_cover_url%'
        and p.prosrc not ilike '%published_at%' and p.prosrc not ilike '%status%'
        and p.prosrc not ilike '%slug%' and p.prosrc not ilike '%access_mode%'
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.admin_set_resource_cover(uuid, text)')), false),
    'source'

  union all
  select 4, 'it checks the admin gate first and the bucket file exists',
    coalesce((select p.prosrc ilike '%is_admin()%' and p.prosrc ilike '%storage.objects%' and p.prosrc ilike '%resource-covers%'
      from pg_catalog.pg_proc p where p.oid = pg_catalog.to_regprocedure('public.admin_set_resource_cover(uuid, text)')), false),
    'source'
) checks
order by sort;
