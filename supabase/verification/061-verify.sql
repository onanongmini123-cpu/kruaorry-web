-- READ-ONLY verification for migration 061. After applying 061 every row must
-- return ok = true. After a ROLLBACK of 061 every row returns ok = false (never an error).
select check_name, ok, detail
from (
  select 1 as sort, 'promo_banners exists with RLS on and no browser write privilege' as check_name,
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = pg_catalog.to_regclass('public.promo_banners')), false)
    and not coalesce(pg_catalog.has_table_privilege('anon', pg_catalog.to_regclass('public.promo_banners'), 'insert'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.promo_banners'), 'insert'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.promo_banners'), 'update'), false)
    and not coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.promo_banners'), 'delete'), false) as ok,
    'table' as detail

  union all
  select 2, 'anon and signed-in visitors can read (RLS limits them to active rows in their date window)',
    coalesce(pg_catalog.has_table_privilege('anon', pg_catalog.to_regclass('public.promo_banners'), 'select'), false)
    and coalesce(pg_catalog.has_table_privilege('authenticated', pg_catalog.to_regclass('public.promo_banners'), 'select'), false),
    'select grant'

  union all
  select 3, 'exactly two read policies: public (active, in window) and admin',
    coalesce((select count(*) = 2
        and bool_or(policyname = 'promo_banners_public_read' and qual ilike '%is_active%' and qual ilike '%starts_at%' and qual ilike '%ends_at%')
        and bool_or(policyname = 'promo_banners_admin_read' and qual ilike '%is_admin%')
      from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'promo_banners'), false),
    'policies'

  union all
  select 4, 'admin_set_promo_banners is SECURITY DEFINER, empty search_path, not executable by anon',
    coalesce((select p.prosecdef
        and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
        and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
        and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      from pg_catalog.pg_proc p
      where p.oid = pg_catalog.to_regprocedure('public.admin_set_promo_banners(jsonb)')), false),
    'function'

  union all
  select 5, 'picture and link CHECK constraints are present (no javascript: or http: links)',
    coalesce((select count(*) filter (where pg_get_constraintdef(c.oid) ilike '%resource-covers/banners/%') >= 2
        and count(*) filter (where pg_get_constraintdef(c.oid) ilike '%link_url%https%') >= 1
      from pg_catalog.pg_constraint c where c.conrelid = pg_catalog.to_regclass('public.promo_banners') and c.contype = 'c'), false),
    'constraints'
) checks
order by sort;
