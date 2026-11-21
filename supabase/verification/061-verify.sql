-- READ-ONLY check after migration 061. Every row must say ok = true. It changes
-- nothing. Exercised against the real migration chain by
-- `npm run test:resource-demo-sql`.
select check_name, ok, detail
from (
  select 1 as sort, 'resources.demo_url exists (text)' as check_name,
    coalesce(a.atttypid = 'text'::regtype, false) as ok,
    coalesce(format_type(a.atttypid, a.atttypmod), 'column not found') as detail
  from (select 1) one
  left join pg_attribute a on a.attrelid = to_regclass('public.resources') and a.attname = 'demo_url' and not a.attisdropped

  union all
  select 2, 'both demo CHECK constraints exist',
    count(*) = 2, count(*)::text || ' of 2 found'
  from pg_constraint
  where conrelid = to_regclass('public.resources')
    and conname in ('resources_demo_url_safe', 'resources_demo_differs_from_full')

  union all
  select 3, 'resource_demo_catalog is a read-only security_barrier view of published demos only',
    coalesce('security_barrier=true' = any (c.reloptions), false)
      and not has_table_privilege('anon', 'public.resource_demo_catalog', 'insert')
      and not has_table_privilege('authenticated', 'public.resource_demo_catalog', 'update')
      and has_table_privilege('anon', 'public.resource_demo_catalog', 'select')
      and pg_get_viewdef(c.oid, true) ilike '%published%',
    coalesce(c.reloptions::text, 'view not found')
  from (select 1) one
  left join pg_class c on c.oid = to_regclass('public.resource_demo_catalog')

  union all
  select 4, 'resource_catalog has no demo column (untouched by this migration)',
    not exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.resource_catalog') and a.attname = 'demo_url' and not a.attisdropped
    ),
    'column list'

  union all
  select 5, 'demo_url is readable by authenticated only (anon uses the view); the full-version targets are not',
    case when exists (select 1 from pg_attribute a where a.attrelid = to_regclass('public.resources') and a.attname = 'demo_url' and not a.attisdropped)
      then not has_column_privilege('anon', 'public.resources', 'demo_url', 'select')
        and has_column_privilege('authenticated', 'public.resources', 'demo_url', 'select')
      else false end
      and not has_column_privilege('anon', 'public.resources', 'cta_url', 'select')
      and not has_column_privilege('authenticated', 'public.resources', 'cta_url', 'select')
      and not has_column_privilege('anon', 'public.resources', 'file_path', 'select')
      and not has_column_privilege('authenticated', 'public.resources', 'file_path', 'select'),
    'column privileges'

  union all
  select 6, 'admin_set_resource_demo is SECURITY DEFINER, empty search_path, authenticated only',
    coalesce(
      p.prosecdef
      and exists (select 1 from unnest(p.proconfig) setting where setting = 'search_path=""')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ),
      false),
    coalesce(p.proconfig::text, 'function not found')
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.admin_set_resource_demo(uuid, text)')

  union all
  select 7, 'admin_save_resource is unchanged: exactly one, still 17 arguments',
    count(*) = 1 and coalesce(max(p.pronargs), 0) = 17,
    count(*)::text || ' found'
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_save_resource'

  union all
  select 8, 'no storage policy or bucket mentions a demo (no new Storage surface)',
    not exists (select 1 from pg_policies where schemaname = 'storage' and (policyname ilike '%demo%' or qual ilike '%demo%'))
      and not exists (select 1 from storage.buckets where id ilike '%demo%'),
    'storage.objects policies and buckets'

  union all
  select 9, 'no published resource has a demo equal to its full-version URL',
    not exists (
      select 1 from public.resources r
      where to_jsonb(r)->>'demo_url' is not null and r.cta_url is not null
        and lower(rtrim(to_jsonb(r)->>'demo_url', '/')) = lower(rtrim(btrim(r.cta_url), '/'))
    ),
    'resources_demo_differs_from_full holds'

  union all
  select 10, 'info: resources with a demo', true,
    (select count(*) from public.resources r where to_jsonb(r)->>'demo_url' is not null)::text
) checks
order by sort;
