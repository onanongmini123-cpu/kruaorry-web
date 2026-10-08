-- READ-ONLY check after migration 055. Every row must say ok = true; the
-- "info:" rows only report. Exercised against the real migration chain by
-- `npm run test:admin-save-slug-sql`.
select check_name, ok, detail
from (
  select 1 as sort, 'exactly one public.admin_save_resource exists (no overload left behind)' as check_name,
    count(*) = 1 as ok,
    count(*)::text || ' found' as detail
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_save_resource'

  union all
  select 2, 'it takes 17 arguments and the last one is p_slug text with a default',
    coalesce(
      p.pronargs = 17
      and p.proargnames[17] = 'p_slug'
      and p.proargtypes[16] = 'text'::regtype
      and p.pronargdefaults = 1,
      false),
    coalesce(p.pronargs::text || ' arguments', 'function not found')
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[], text)')

  union all
  select 3, 'it is SECURITY DEFINER with an empty search_path',
    coalesce(p.prosecdef and exists (select 1 from unnest(p.proconfig) setting where setting = 'search_path=""'), false),
    coalesce(p.proconfig::text, 'function not found')
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[], text)')

  union all
  select 4, 'EXECUTE is granted to authenticated and to nobody who is signed out',
    coalesce(
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ),
      false),
    coalesce(p.proacl::text, 'function not found')
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[], text)')

  union all
  select 5, 'the body still starts with the admin gate and validates the slug',
    coalesce(
      position('public.is_admin()' in p.prosrc) > 0
      and position('public.is_admin()' in p.prosrc) < position('public.resources' in p.prosrc)
      and position('Resource slug is invalid' in p.prosrc) > 0
      and position('Resource slug is already in use' in p.prosrc) > 0,
      false),
    ''
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[], text)')

  union all
  select 6, 'the slug format check and unique index from 053 are still in place',
    exists (
      select 1 from pg_constraint c
      where c.conrelid = to_regclass('public.resources') and c.conname = 'resources_slug_format' and c.convalidated
    ) and exists (
      select 1 from pg_index i join pg_class ic on ic.oid = i.indexrelid
      where i.indrelid = to_regclass('public.resources') and ic.relname = 'resources_slug_key' and i.indisunique
    ),
    ''

  union all
  select 7, 'info: published resources still on their UUID address (set a slug in the admin console)', true,
    coalesce(string_agg(r.title, ', ' order by r.title), 'none')
  from public.resources r
  where r.status = 'published' and to_jsonb(r) ->> 'slug' is null
) checks
order by sort, check_name;
