-- 064: fix "DELETE requires a WHERE clause" when the admin console saves the
-- hero featured resources (set_featured_resources). RELAXING / BUGFIX ONLY.
--
-- CAUSE
--   Migration 028 wrote `delete from public.featured_resources;` with no WHERE.
--   Every request that comes through the API (PostgREST role "authenticator") loads
--   the pg_safeupdate extension (session_preload_libraries = 'supautils, safeupdate'),
--   which refuses any DELETE/UPDATE without a WHERE clause, EVEN INSIDE a
--   SECURITY DEFINER function. The save therefore fails and nothing changes.
--   (058 and 060 already write `where true` for the same reason.)
--
-- WHAT THIS CHANGES
--   Only that one statement: `delete from public.featured_resources where true;`.
--   Same checks, same arguments, same privileges. The whole function is one
--   transaction: if the insert fails, the delete is rolled back and the previous
--   list stays. A bad list (unpublished, duplicate, more than 5) is refused BEFORE
--   the delete, so the list is never left empty by a rejected save.
--
-- ROLLBACK
--   supabase/rollbacks/20261014100000_064_set_featured_resources_where.rollback.sql
--   (restores the 028 text, i.e. the bug; only useful to undo this file exactly).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; staging first; then
--   supabase/verification/064-verify.sql, then save the featured list once in the admin console.

set local lock_timeout = '5s';

create or replace function public.set_featured_resources(p_resource_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resource_ids uuid[] := coalesce(p_resource_ids, '{}'::uuid[]);
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if cardinality(v_resource_ids) > 5 then
    raise exception 'At most five featured resources are allowed' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_resource_ids) item where item is null) then
    raise exception 'Featured resource ids cannot be null' using errcode = '22023';
  end if;
  if (select count(distinct item) from unnest(v_resource_ids) item) <> cardinality(v_resource_ids) then
    raise exception 'Featured resources cannot contain duplicates' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_resource_ids) item
    where not exists (
      select 1
      from public.resources r
      where r.id = item
        and r.status = 'published'
    )
  ) then
    raise exception 'Featured resource must exist and be published' using errcode = '22023';
  end if;

  -- "where true": pg_safeupdate (active for API requests) rejects a DELETE without WHERE.
  delete from public.featured_resources where true;
  insert into public.featured_resources (resource_id, position)
  select resource_id, position::integer
  from unnest(v_resource_ids) with ordinality as selected(resource_id, position);
end;
$$;

revoke all on function public.set_featured_resources(uuid[]) from public, anon;
grant execute on function public.set_featured_resources(uuid[]) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.set_featured_resources(uuid[])', 'execute') then
    raise exception '064: anon must not execute set_featured_resources';
  end if;
end
$$;
