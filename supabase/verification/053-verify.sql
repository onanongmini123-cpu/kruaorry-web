-- READ-ONLY check after migration 053. Every row must say ok = true; the
-- "info:" rows only report. Exercised against the real migration chain by
-- `npm run test:migration-chain-sql`.
select check_name, ok, detail
from (
  select 1 as sort, 'resources.slug is a nullable text column' as check_name,
    exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.resources') and a.attname = 'slug'
        and not a.attisdropped and a.atttypid = 'text'::regtype and not a.attnotnull
    ) as ok,
    '' as detail

  union all
  select 2, 'format check resources_slug_format is in place and validated',
    exists (
      select 1 from pg_constraint c
      where c.conrelid = to_regclass('public.resources') and c.conname = 'resources_slug_format'
        and c.contype = 'c' and c.convalidated
    ),
    ''

  union all
  select 3, 'unique partial index resources_slug_key covers slug',
    exists (
      select 1
      from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      where i.indrelid = to_regclass('public.resources') and ic.relname = 'resources_slug_key'
        and i.indisunique and i.indisvalid and i.indpred is not null
    ),
    ''

  union all
  select 4, 'resource_catalog exposes slug as its last column',
    coalesce(last_column.name = 'slug' and last_column.type = 'text', false),
    coalesce(last_column.name || ' ' || last_column.type, 'view not found')
  from (select 1) one
  left join lateral (
    select a.attname::text as name, format_type(a.atttypid, a.atttypmod) as type
    from pg_attribute a
    where a.attrelid = to_regclass('public.resource_catalog') and a.attnum > 0 and not a.attisdropped
    order by a.attnum desc
    limit 1
  ) last_column on true

  union all
  select 5, 'resource_catalog is still a security_barrier view',
    coalesce('security_barrier=true' = any (c.reloptions), false),
    coalesce(c.reloptions::text, 'no options')
  from (select 1) one
  left join pg_class c on c.oid = to_regclass('public.resource_catalog')

  union all
  select 6, format('%s on resource_catalog: read yes, write no', roles.name),
    coalesce(has_table_privilege(roles.name, to_regclass('public.resource_catalog'), 'SELECT'), false)
      and not coalesce(has_table_privilege(roles.name, to_regclass('public.resource_catalog'), 'INSERT, UPDATE, DELETE, TRUNCATE'), false),
    ''
  from (values ('anon'), ('authenticated')) roles(name)

  union all
  select 7, 'saved_resources policies still read resource_catalog',
    count(*) >= 1,
    count(*)::text || ' polic' || case when count(*) = 1 then 'y' else 'ies' end
  from pg_policy pol
  where pol.polrelid = to_regclass('public.saved_resources')
    and (pg_get_expr(pol.polqual, pol.polrelid) ilike '%resource_catalog%'
      or pg_get_expr(pol.polwithcheck, pol.polrelid) ilike '%resource_catalog%')

  union all
  select 8, 'info: resources that have a slug', true,
    count(*) filter (where to_jsonb(r) ->> 'slug' is not null)::text || ' of ' || count(*)::text
  from public.resources r

  union all
  select 9, 'info: published resources still on their UUID address (set a slug by hand when wanted)', true,
    coalesce(string_agg(r.title, ', ' order by r.title), 'none')
  from public.resources r
  where r.status = 'published' and to_jsonb(r) ->> 'slug' is null
) checks
order by sort, check_name;
