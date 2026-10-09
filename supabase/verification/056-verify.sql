-- READ-ONLY verification for migration 056. Every row must return ok = true.
select check_name, ok, detail
from (
  select 1 as sort,
    'exactly one aggregate RPC exists with one optional timestamptz argument' as check_name,
    count(*) = 1
      and bool_and(p.oid = pg_catalog.to_regprocedure(
        'public.get_admin_overview_insights(timestamp with time zone)'
      ))
      and bool_and(p.pronargdefaults = 1)
      and bool_and(p.prorettype = 'jsonb'::pg_catalog.regtype) as ok,
    count(*)::text || ' found' as detail
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'get_admin_overview_insights'

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
    'public.get_admin_overview_insights(timestamp with time zone)'
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
    'public.get_admin_overview_insights(timestamp with time zone)'
  )

  union all
  select 4, 'the admin check occurs before any aggregate relation is read',
    coalesce(
      pg_catalog.strpos(p.prosrc, 'public.is_admin()') > 0
      and pg_catalog.strpos(p.prosrc, 'public.is_admin()')
        < pg_catalog.strpos(p.prosrc, 'public.plan_features'),
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_overview_insights(timestamp with time zone)'
  )

  union all
  select 5, 'calendar windows are explicitly cut in Asia/Bangkok',
    coalesce(
      p.prosrc like '%Asia/Bangkok%'
      and p.prosrc like '%v_local_date - 6%'
      and p.prosrc like '%v_local_date - 29%'
      and p.prosrc like '%date_trunc(''month''%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_overview_insights(timestamp with time zone)'
  )

  union all
  select 6, 'revenue uses confirmed audit amounts and never catalogue prices',
    coalesce(
      p.prosrc like '%membership_payment_confirmations%'
      and p.prosrc like '%confirmation.amount_thb%'
      and p.prosrc not like '%price_amount_thb%'
      and p.prosrc not like '%quoted_amount_thb%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_overview_insights(timestamp with time zone)'
  )

  union all
  select 7, 'result construction contains no member identity or payment-reference field',
    coalesce(
      p.prosrc not like '%''email''%'
      and p.prosrc not like '%''full_name''%'
      and p.prosrc not like '%''user_id''%'
      and p.prosrc not like '%''payment_reference''%',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_overview_insights(timestamp with time zone)'
  )

  union all
  select 8, 'RPC body is read-only',
    coalesce(
      p.prosrc !~* '\m(insert|update|delete|truncate)\M'
      and p.prosrc !~* '\m(nextval|setval)\M',
      false
    ),
    ''
  from (select 1) one
  left join pg_catalog.pg_proc p on p.oid = pg_catalog.to_regprocedure(
    'public.get_admin_overview_insights(timestamp with time zone)'
  )
) checks
order by sort;
