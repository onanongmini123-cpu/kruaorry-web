-- READ-ONLY verification for migration 066. After applying 066 every row must return ok = true.
-- Before 066, or after its ROLLBACK, every row returns ok = false (never an error).
with
  t as (
    select c.oid, c.relname, c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid in (
      pg_catalog.to_regclass('public.owner_manual_finance_entries'),
      pg_catalog.to_regclass('public.owner_recurring_expenses'),
      pg_catalog.to_regclass('public.owner_finance_audit')
    )
  ),
  f as (
    select p.oid, p.proname, p.prosecdef, p.proconfig, p.prosrc
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'owner_add_finance_entry', 'owner_void_finance_entry', 'owner_attach_finance_receipt',
      'owner_save_recurring_expense', 'owner_mark_recurring_expense_paid', 'owner_recurring_expenses_due'
    )
  )
select check_name, ok, detail
from (
  select 1 as sort, 'three finance tables exist with RLS on' as check_name,
    ((select count(*) from t) = 3 and (select bool_and(relrowsecurity) from t)) is true as ok,
    'tables' as detail

  union all
  select 2, 'each table has exactly one policy: SELECT for the owner (is_owner)',
    ((select count(*) from t) = 3 and not exists (
      select 1 from t
      where (select count(*) from pg_catalog.pg_policy p where p.polrelid = t.oid) <> 1
         or not exists (
           select 1 from pg_catalog.pg_policy p
           where p.polrelid = t.oid and p.polcmd = 'r'
             and pg_catalog.pg_get_expr(p.polqual, p.polrelid) ilike '%is_owner()%')
    )) is true,
    'policies'

  union all
  select 3, 'anon has no privilege; authenticated may only SELECT',
    ((select count(*) from t) = 3 and not exists (
      select 1 from t
      where pg_catalog.has_table_privilege('anon', t.oid, 'SELECT, INSERT, UPDATE, DELETE')
         or pg_catalog.has_table_privilege('authenticated', t.oid, 'INSERT, UPDATE, DELETE')
         or not pg_catalog.has_table_privilege('authenticated', t.oid, 'SELECT')
    )) is true,
    'grants'

  union all
  select 4, 'six owner functions: SECURITY DEFINER, empty search_path, is_owner() gate, authenticated not anon',
    ((select count(*) from f) = 6 and not exists (
      select 1 from f
      where not f.prosecdef
         or not exists (select 1 from pg_catalog.unnest(f.proconfig) s where s = 'search_path=""')
         or f.prosrc not ilike '%public.is_owner()%'
         or not pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE')
         or pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE')
    )) is true,
    'functions'

  union all
  select 5, 'entries cannot be edited or deleted; audit is append-only (triggers)',
    (select count(*) = 2 from pg_catalog.pg_trigger g
     where not g.tgisinternal and g.tgname in ('owner_finance_entries_guard', 'owner_finance_audit_append_only')
       and g.tgrelid in (select oid from t)) is true,
    'triggers'

  union all
  select 6, 'bucket owner-expense-receipts: private, 5 MB, JPEG/PNG/WebP/PDF',
    coalesce((select not b.public and b.file_size_limit = 5242880
        and b.allowed_mime_types @> array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
        and pg_catalog.cardinality(b.allowed_mime_types) = 4
      from storage.buckets b where b.id = 'owner-expense-receipts'), false)
      -- the rollback leaves the bucket in place, so also require the tables
      and (select count(*) from t) = 3,
    'storage bucket'

  union all
  select 7, 'receipt policies: owner select / insert / delete-unused, no update',
    (select count(*) = 3 and bool_and(pg_catalog.pg_get_expr(coalesce(p.polqual, p.polwithcheck), p.polrelid) ilike '%is_owner()%')
       and not bool_or(p.polcmd = 'w')
     from pg_catalog.pg_policy p
     where p.polrelid = pg_catalog.to_regclass('storage.objects') and p.polname like 'owner_expense_receipts_%') is true,
    'storage policies'

  union all
  select 8, 'one live entry per reference and per recurring month (unique indexes)',
    (select count(*) = 2 from pg_catalog.pg_index i
     join pg_catalog.pg_class c on c.oid = i.indexrelid
     where i.indisunique and c.relname in ('owner_finance_entries_reference_once', 'owner_finance_entries_recurring_once')
       and i.indrelid = pg_catalog.to_regclass('public.owner_manual_finance_entries')) is true,
    'indexes'
) checks
order by sort;
