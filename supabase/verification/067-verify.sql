-- All eight rows must return ok=true after 067. Safe before apply or after rollback.
with checks as (
  select 'two owner goal tables exist'::text as check_name,
    pg_catalog.to_regclass('public.owner_monthly_goals') is not null
    and pg_catalog.to_regclass('public.owner_monthly_goal_audit') is not null as ok
  union all
  select 'RLS enabled on both tables', count(*) = 2
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('owner_monthly_goals','owner_monthly_goal_audit')
      and c.relrowsecurity
  union all
  select 'owner-only SELECT policies', count(*) = 2
    from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('owner_monthly_goals','owner_monthly_goal_audit')
      and cmd = 'SELECT' and qual like '%is_owner%'
  union all
  select 'no direct table writes for authenticated or anon',
    pg_catalog.to_regclass('public.owner_monthly_goals') is not null and count(*) = 0
    from information_schema.role_table_grants
    where table_schema = 'public' and table_name in ('owner_monthly_goals','owner_monthly_goal_audit')
      and grantee in ('authenticated','anon') and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
  union all
  select 'three owner RPCs exist',
    pg_catalog.to_regprocedure('public.owner_save_monthly_goal(date,bigint,integer)') is not null
    and pg_catalog.to_regprocedure('public.owner_finance_report(date)') is not null
    and pg_catalog.to_regprocedure('public.owner_finance_csv(date)') is not null
  union all
  select 'RPCs are definer with empty search path and owner guard', count(*) = 3
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('owner_save_monthly_goal','owner_finance_report','owner_finance_csv')
      and p.prosecdef and 'search_path=""' = any(p.proconfig)
      and p.prosrc like '%public.is_owner()%'
  union all
  select 'goal audit is append-only', count(*) = 1
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid
    where c.relname = 'owner_monthly_goal_audit' and t.tgname = 'owner_goal_audit_append_only'
      and not t.tgisinternal
  union all
  select 'no member revenue from upgrade_requests',
    case when pg_catalog.to_regprocedure('public.owner_finance_report(date)') is null then false
      else (select pg_catalog.pg_get_functiondef(p.oid) like '%membership_payment_confirmations%'
              and pg_catalog.pg_get_functiondef(p.oid) not like '%sum(r.%'
            from pg_catalog.pg_proc p
            where p.oid = pg_catalog.to_regprocedure('public.owner_finance_report(date)')) end
)
select check_name, coalesce(ok, false) as ok from checks;
