-- READ-ONLY verification for migration 058. Every row must return ok = true.
select check_name, ok, detail
from (
  select 1 as sort, 'resources.youtube_video_id exists and is nullable text' as check_name,
    coalesce(bool_and(c.data_type = 'text' and c.is_nullable = 'YES'), false) as ok,
    count(*)::text || ' column' as detail
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'resources' and c.column_name = 'youtube_video_id'

  union all
  select 2, 'format CHECK exists',
    exists (select 1 from pg_catalog.pg_constraint where conname = 'resources_youtube_video_id_format'
            and conrelid = 'public.resources'::pg_catalog.regclass),
    'resources_youtube_video_id_format'

  union all
  select 3, 'resource_catalog exposes youtube_video_id as its last column',
    (select a.attname = 'youtube_video_id'
     from pg_catalog.pg_attribute a
     where a.attrelid = 'public.resource_catalog'::pg_catalog.regclass and a.attnum > 0 and not a.attisdropped
     order by a.attnum desc limit 1),
    'last column'

  union all
  select 4, 'resource_catalog is still read-only for browser roles',
    not pg_catalog.has_table_privilege('anon', 'public.resource_catalog', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.resource_catalog', 'update'),
    'anon/authenticated'

  union all
  select 5, 'homepage_videos has RLS and is read-only for browser roles',
    coalesce((select c.relrowsecurity from pg_catalog.pg_class c where c.oid = 'public.homepage_videos'::pg_catalog.regclass), false)
    and not pg_catalog.has_table_privilege('anon', 'public.homepage_videos', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.homepage_videos', 'insert')
    and not pg_catalog.has_table_privilege('authenticated', 'public.homepage_videos', 'update')
    and not pg_catalog.has_table_privilege('authenticated', 'public.homepage_videos', 'delete'),
    'rls + grants'

  union all
  select 6, 'admin RPCs are SECURITY DEFINER, empty search_path, authenticated only',
    coalesce(bool_and(
      p.prosecdef
      and exists (select 1 from pg_catalog.unnest(p.proconfig) s where s = 'search_path=""')
      and pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    ), false),
    count(*)::text || ' functions (expect 2)'
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('admin_set_resource_video', 'admin_set_homepage_videos')

) checks
order by sort;
