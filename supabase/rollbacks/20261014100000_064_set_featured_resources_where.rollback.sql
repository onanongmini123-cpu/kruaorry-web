-- Rollback for 20261014100000_064_set_featured_resources_where.sql
--
-- Restores the exact function text of migration 028 (DELETE without WHERE). NOTE: that
-- text fails with "DELETE requires a WHERE clause" for API requests, so saving the hero
-- featured list stops working again. Use only to undo this file exactly.
-- The current featured list is not touched. One transaction; re-applying 064 afterwards works.
begin;
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

  delete from public.featured_resources;
  insert into public.featured_resources (resource_id, position)
  select resource_id, position::integer
  from unnest(v_resource_ids) with ordinality as selected(resource_id, position);
end;
$$;

revoke all on function public.set_featured_resources(uuid[]) from public, anon;
grant execute on function public.set_featured_resources(uuid[]) to authenticated;

commit;
