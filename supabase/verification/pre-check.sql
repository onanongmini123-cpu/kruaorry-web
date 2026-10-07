-- READ-ONLY pre-flight for migrations 052, 053 and 054.
--
-- Run in the SQL editor of the Preview database first, then production,
-- BEFORE applying anything. It changes nothing. Every row must say ok = true;
-- the "state:" rows only report which migrations are already in place.
-- Exercised against the real migration chain by `npm run test:migration-chain-sql`.
--
-- Also run (Supabase only, the ledger is not part of this repository):
--   select version, name from supabase_migrations.schema_migrations order by version desc limit 8;
-- and confirm the last applied version is 20261004110000 (051) or later.
select check_name, ok, detail
from (
  select 1 as sort, 'resource_catalog is the 029 view (21 columns, plus slug once 053 ran)' as check_name,
    coalesce(columns.names in (
      'id,title,meta,description,category,delivery_mode,cover_image_url,tags,is_free,file_size,status,published_at,created_at,grade_levels,required_plan_names,is_new,access_mode,required_plan_ids,featured_rank,review_average,review_count',
      'id,title,meta,description,category,delivery_mode,cover_image_url,tags,is_free,file_size,status,published_at,created_at,grade_levels,required_plan_names,is_new,access_mode,required_plan_ids,featured_rank,review_average,review_count,slug'
    ), false) as ok,
    coalesce(columns.names, 'view not found') as detail
  from (
    select string_agg(a.attname::text, ',' order by a.attnum) as names
    from pg_attribute a
    where a.attrelid = to_regclass('public.resource_catalog') and a.attnum > 0 and not a.attisdropped
  ) columns

  union all
  select 2, 'resource_catalog is a security_barrier view',
    coalesce('security_barrier=true' = any (c.reloptions), false),
    coalesce(c.reloptions::text, 'no options')
  from (select 1) one
  left join pg_class c on c.oid = to_regclass('public.resource_catalog')

  union all
  select 3, 'submit_resource_issue has exactly one overload',
    count(*) = 1,
    coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'not found')
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_resource_issue'

  union all
  select 4, 'resource_issue_reports has exactly one CHECK on category',
    count(*) = 1,
    coalesce(string_agg(c.conname::text, ', '), 'none')
  from pg_constraint c
  where c.conrelid = to_regclass('public.resource_issue_reports')
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%category%'

  union all
  select 5, 'the ten objects 052 changes all exist',
    count(*) filter (where to_regclass('public.' || t.name) is null) = 0,
    coalesce(nullif(string_agg(t.name, ', ') filter (where to_regclass('public.' || t.name) is null), ''), 'all present')
  from (values ('resource_catalog'), ('plan_benefit_catalog'), ('resource_review_feed'),
               ('resource_review_summary'), ('subscriptions'), ('subscription_events'),
               ('plans'), ('features'), ('plan_features'), ('admin_audit_log')) t(name)

  union all
  select 6, 'the reads the app depends on are granted (052 stops otherwise)',
    count(*) filter (where not coalesce(has_table_privilege(g.role, to_regclass('public.' || g.name), 'SELECT'), false)) = 0,
    coalesce(nullif(string_agg(g.role || ' on ' || g.name, ', ')
      filter (where not coalesce(has_table_privilege(g.role, to_regclass('public.' || g.name), 'SELECT'), false)), ''), 'all granted')
  from (values ('anon', 'resource_catalog'), ('anon', 'plan_benefit_catalog'), ('anon', 'plans'),
               ('anon', 'features'), ('anon', 'plan_features'),
               ('authenticated', 'resource_review_feed'), ('authenticated', 'resource_review_summary'),
               ('authenticated', 'subscriptions'), ('authenticated', 'subscription_events')) g(role, name)

  union all
  select 7, 'resources.slug can be added (the name is free or already the 053 column)',
    not exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.resources') and a.attname = 'slug' and not a.attisdropped
        and (a.atttypid <> 'text'::regtype or a.attnotnull)
    ),
    'slug column absent or already nullable text'

  union all
  select 8, 'state: 052 write-privilege cleanup',
    true,
    case when coalesce(has_table_privilege('authenticated', to_regclass('public.plans'), 'UPDATE'), false)
      then 'not applied yet' else 'already in place' end

  union all
  select 9, 'state: 053 resources.slug',
    true,
    case when exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.resources') and a.attname = 'slug' and not a.attisdropped
    ) then 'already in place' else 'not applied yet' end

  union all
  select 10, 'state: 054 problem-report context',
    true,
    case when exists (select 1 from public.features where id = 'system.resource_issue_context_v1_ready')
      then 'already in place' else 'not applied yet' end

  union all
  select 11, 'state: saved_resources policies that read resource_catalog (never drop that view by hand)',
    true,
    count(*)::text || ' polic' || case when count(*) = 1 then 'y' else 'ies' end
  from pg_policy pol
  where pol.polrelid = to_regclass('public.saved_resources')
    and (pg_get_expr(pol.polqual, pol.polrelid) ilike '%resource_catalog%'
      or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%resource_catalog%')
) checks
order by sort;
