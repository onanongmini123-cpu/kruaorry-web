-- READ-ONLY verification for migration 057. Every row must return ok = true.
select check_name, ok, detail
from (
  select 1 as sort,
    'exactly one no-argument jsonb RPC exists' as check_name,
    count(*) = 1
      and bool_and(p.oid = pg_catalog.to_regprocedure(
        'public.get_admin_plan_resource_summary()'
      ))
      and bool_and(p.pronargs = 0)
      and bool_and(p.prorettype = 'jsonb'::pg_catalog.regtype) as ok,
    count(*)::text || ' found' as detail
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_plan_resource_summary'

  union all
  select 2, 'RPC is STABLE SECURITY DEFINER with an empty search_path',
    coalesce(
      p.prosecdef
      and p.provolatile = 's'
      and exists (
        select 1 from pg_catalog.unnest(p.proconfig) setting
        where setting = 'search_path=""'
      ),
      false
    ),
    coalesce(p.proconfig::text, 'function not found')
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 3, 'only authenticated can execute the RPC before its admin gate',
    coalesce(
      pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(
          p.proacl,
          pg_catalog.acldefault('f', p.proowner)
        )) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ),
      false
    ),
    coalesce(p.proacl::text, 'function not found')
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 4, 'admin gate with 42501 occurs before any aggregate relation read',
    coalesce(
      pg_catalog.strpos(p.prosrc, 'public.is_admin()') > 0
      and pg_catalog.strpos(p.prosrc, 'public.is_admin()')
        < pg_catalog.strpos(p.prosrc, 'public.resources')
      and p.prosrc like '%errcode = ''42501''%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 5, 'access buckets mirror the four published resource modes',
    coalesce(
      p.prosrc like '%status = ''published''%'
      and p.prosrc like '%access_mode = ''public''%'
      and p.prosrc like '%access_mode = ''authenticated''%'
      and p.prosrc like '%access_mode = ''plans''%'
      and p.prosrc like '%access_mode = ''locked''%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 6, 'per-plan counts and latest five resources use resource_plan_access',
    coalesce(
      p.prosrc like '%public.resource_plan_access%'
      and p.prosrc like '%resource_count%'
      and p.prosrc like '%latest_resources%'
      and p.prosrc like '%limit 5%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 7, 'unassigned plan resources use NOT EXISTS and expose at most ten titles',
    coalesce(
      p.prosrc like '%not exists%'
      and p.prosrc like '%unassigned_plan_resources%'
      and p.prosrc like '%limit 10%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 8, 'result contains no member identity field or member relation',
    coalesce(
      p.prosrc not like '%public.profiles%'
      and p.prosrc not like '%public.subscriptions%'
      and p.prosrc not like '%''email''%'
      and p.prosrc not like '%''full_name''%'
      and p.prosrc not like '%''user_id''%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )

  union all
  select 9, 'RPC body is read-only',
    coalesce(
      p.prosrc !~* '\m(insert|update|delete|truncate)\M'
      and p.prosrc !~* '\m(nextval|setval)\M',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_plan_resource_summary()'
  )
) checks
order by sort;
