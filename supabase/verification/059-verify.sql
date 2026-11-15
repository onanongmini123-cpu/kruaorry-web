-- READ-ONLY verification for migrations 058 + 059. Every row must be ok = true.
select check_name, ok from (
  select 1 as s, 'RLS forced on all 14 accounting tables' as check_name,
    (select count(*) = 14 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'accounting' and c.relkind = 'r' and c.relrowsecurity and c.relforcerowsecurity) as ok
  union all select 2, 'anon and authenticated have no write privilege on any accounting table',
    not exists (select 1 from information_schema.role_table_grants
      where table_schema = 'accounting' and grantee in ('anon','authenticated')
        and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE'))
  union all select 3, 'anon has no privilege at all on the accounting schema tables',
    not exists (select 1 from information_schema.role_table_grants
      where table_schema = 'accounting' and grantee = 'anon')
  union all select 4, 'private evidence bucket exists',
    exists (select 1 from storage.buckets where id = 'accounting-evidence' and public = false)
  union all select 5, 'chart of accounts seeded',
    (select count(*) >= 17 from accounting.accounts)
  union all select 6, 'dashboard/approval functions are SECURITY DEFINER with empty search_path',
    (select count(*) = 5 and bool_and(p.prosecdef) and bool_and(exists (select 1 from unnest(p.proconfig) c where c = 'search_path=""'))
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'accounting'
        and p.proname in ('_decide','approve_transaction','approve_transaction_service','void_transaction','dashboard_summary'))
) q order by s;
