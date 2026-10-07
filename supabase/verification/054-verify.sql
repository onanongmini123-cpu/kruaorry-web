-- READ-ONLY check after migration 054. Every row must say ok = true.
-- Exercised against the real migration chain by `npm run test:migration-chain-sql`.
select check_name, ok, detail
from (
  select 1 as sort, 'resource_issue_reports.context is a nullable jsonb column' as check_name,
    exists (
      select 1 from pg_attribute a
      where a.attrelid = to_regclass('public.resource_issue_reports') and a.attname = 'context'
        and not a.attisdropped and a.atttypid = 'jsonb'::regtype and not a.attnotnull
    ) as ok,
    '' as detail

  union all
  select 2, 'context must be an object of at most 1 KB',
    exists (
      select 1 from pg_constraint c
      where c.conrelid = to_regclass('public.resource_issue_reports')
        and c.conname = 'resource_issue_reports_context_shape' and c.contype = 'c' and c.convalidated
    ),
    ''

  union all
  select 3, 'exactly one CHECK on category, allowing all ten values',
    count(*) = 1
      and bool_and(
        (select bool_and(pg_get_constraintdef(c.oid) like '%''' || v.value || '''%')
         from (values ('cannot_open'), ('broken_link'), ('cannot_download'), ('wrong_content'), ('other'),
                      ('wrong_answer'), ('cannot_play'), ('no_sound'), ('camera_issue'), ('mobile_layout')) v(value))),
    coalesce(string_agg(c.conname::text, ', '), 'none')
  from pg_constraint c
  where c.conrelid = to_regclass('public.resource_issue_reports')
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%category%'

  union all
  select 4, 'only the 4-argument submit_resource_issue exists',
    count(*) = 1 and bool_and(p.oid = to_regprocedure('public.submit_resource_issue(uuid,text,text,jsonb)')),
    coalesce(string_agg(p.oid::regprocedure::text, ' | '), 'not found')
  from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'submit_resource_issue'

  union all
  select 5, 'submit_resource_issue runs as its owner with an empty search_path',
    coalesce(p.prosecdef and 'search_path=""' = any (p.proconfig), false),
    coalesce(p.proconfig::text, 'function not found')
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.submit_resource_issue(uuid,text,text,jsonb)')

  union all
  select 6, 'only signed-in members can execute it (not anon, not PUBLIC)',
    p.oid is not null
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
      and not has_function_privilege('anon', p.oid, 'EXECUTE')
      and not exists (
        select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
        where acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
      ),
    coalesce(p.proacl::text, 'default privileges')
  from (select 1) one
  left join pg_proc p on p.oid = to_regprocedure('public.submit_resource_issue(uuid,text,text,jsonb)')

  union all
  select 7, 'readiness marker system.resource_issue_context_v1_ready is published',
    exists (select 1 from public.features where id = 'system.resource_issue_context_v1_ready'),
    ''
) checks
order by sort, check_name;
