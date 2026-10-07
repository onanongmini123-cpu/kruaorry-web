-- Rollback for 20261006110000_054_resource_issue_context.sql
--
-- One transaction. Restores migration 029's 3-argument submit_resource_issue and
-- its grants. The five-category CHECK is put back and `context` is dropped only
-- when no report uses the newer categories; otherwise both are kept (nothing is
-- deleted) and a NOTICE says so.
begin;
set local lock_timeout = '5s';

delete from public.features where id = 'system.resource_issue_context_v1_ready';

drop function if exists public.submit_resource_issue(uuid, text, text, jsonb);

create or replace function public.submit_resource_issue(
  p_resource_id uuid,
  p_category text,
  p_details text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_details text := btrim(coalesce(p_details, ''));
  v_report_id uuid;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;
  if p_category not in ('cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other') then
    raise exception 'Invalid issue category' using errcode = '22023';
  end if;
  if char_length(v_details) < 5 or char_length(v_details) > 1000 then
    raise exception 'Issue details must contain 5 to 1000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resources resource
    where resource.id = p_resource_id
      and resource.status = 'published'
  ) or not public.can_access_resource(p_resource_id) then
    raise exception 'Published entitled resource required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('resource-report:' || v_user_id::text, 0)
  );
  if (
    select count(*) from public.resource_issue_reports report
    where report.reporter_id = v_user_id
      and report.created_at >= current_timestamp - interval '1 hour'
  ) >= 5 then
    raise exception 'Issue report rate limit reached' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.resource_issue_reports report
    where report.reporter_id = v_user_id
      and report.resource_id = p_resource_id
      and report.category = p_category
      and report.status <> 'resolved'
  ) then
    raise exception 'An unresolved report of this type already exists' using errcode = '23505';
  end if;

  insert into public.resource_issue_reports (
    resource_id, reporter_id, category, details, status
  ) values (
    p_resource_id, v_user_id, p_category, v_details, 'pending'
  ) returning id into v_report_id;
  return v_report_id;
end;
$$;

revoke all on function public.submit_resource_issue(uuid, text, text) from public, anon;
grant execute on function public.submit_resource_issue(uuid, text, text) to authenticated;

do $$
declare
  v_constraint record;
begin
  if exists (
    select 1 from public.resource_issue_reports
    where category not in ('cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other')
  ) then
    raise notice '054 rollback: some reports use the newer categories, so the widened category CHECK and the context column were kept (no report was deleted).';
    return;
  end if;
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.resource_issue_reports'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%category%'
  loop
    execute format('alter table public.resource_issue_reports drop constraint %I', v_constraint.conname);
  end loop;
  alter table public.resource_issue_reports
    add constraint resource_issue_reports_category_check
    check (category in ('cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other'));
  alter table public.resource_issue_reports drop constraint if exists resource_issue_reports_context_shape;
  alter table public.resource_issue_reports drop column if exists context;
end
$$;

commit;
