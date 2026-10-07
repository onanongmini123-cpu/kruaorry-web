-- READ-ONLY check after migration 052. Every row must say ok = true.
-- Browser roles keep reading the ten objects and can no longer write to or
-- truncate any of them. Exercised against the real migration chain by
-- `npm run test:migration-chain-sql`.
select check_name, ok, detail
from (
  select 1 as sort,
    format('%s has no write privilege on %s', roles.name, objects.name) as check_name,
    to_regclass('public.' || objects.name) is not null
      and count(*) filter (where coalesce(has_table_privilege(roles.name, to_regclass('public.' || objects.name), privileges.name), false)) = 0 as ok,
    coalesce(nullif(string_agg(privileges.name, ', ')
      filter (where coalesce(has_table_privilege(roles.name, to_regclass('public.' || objects.name), privileges.name), false)), ''),
      case when to_regclass('public.' || objects.name) is null then 'object not found' else 'none' end) as detail
  from (values ('resource_catalog'), ('plan_benefit_catalog'), ('resource_review_feed'),
               ('resource_review_summary'), ('subscriptions'), ('subscription_events'),
               ('plans'), ('features'), ('plan_features'), ('admin_audit_log')) objects(name)
  cross join (values ('anon'), ('authenticated')) roles(name)
  cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) privileges(name)
  group by objects.name, roles.name

  union all
  select 2,
    format('%s can still read %s', grants.role, grants.name),
    coalesce(has_table_privilege(grants.role, to_regclass('public.' || grants.name), 'SELECT'), false),
    'SELECT'
  from (values ('anon', 'resource_catalog'), ('anon', 'plan_benefit_catalog'), ('anon', 'plans'),
               ('anon', 'features'), ('anon', 'plan_features'),
               ('authenticated', 'resource_review_feed'), ('authenticated', 'resource_review_summary'),
               ('authenticated', 'subscriptions'), ('authenticated', 'subscription_events')) grants(role, name)
) checks
order by sort, check_name;
