-- 054: richer problem reports: more categories and automatic context.
--
-- PURPOSE
--   Teachers can report what actually went wrong (wrong answer, cannot play,
--   no sound, camera not working, mobile layout) and every report carries the
--   app version, browser family, operating system and screen size so support
--   can reproduce it. Nothing personal is added: no user agent string, no IP,
--   no free text beyond the existing details.
--
-- FORWARD BEHAVIOUR
--   * resource_issue_reports.context (nullable jsonb, at most 1 KB).
--   * category check widened from 5 to 10 values (the 5 old values stay).
--   * submit_resource_issue gains an optional 4th argument, p_context. Only the
--     keys app_version, browser, os and viewport are kept, each cut to a few
--     characters; anything else is discarded.
--   * a readiness marker lets the application offer the new options only after
--     this file has been applied.
--
-- BACKWARD COMPATIBILITY
--   * The old 3-argument call still works (p_context defaults to null).
--   * The old function signature is dropped and recreated in this same
--     transaction, because two overloads would make a named-argument call
--     ambiguous for PostgREST. Grants are re-applied exactly as in 029.
--   * Older application builds keep offering the old 5 categories.
--
-- DATA RISK
--   Low. One nullable column is added; existing rows are untouched; the check
--   constraint is re-created with a superset of the old values.
--
-- LOCKING
--   The table is small and written only by this function, so the short
--   exclusive locks (add column, add constraint) are not noticeable. A 5 second
--   lock_timeout makes the file stop and be retried rather than wait behind a
--   long-running statement.
--
-- DEPLOYMENT ORDER
--   1. Deploy the application (it probes the marker; it is inert without it).
--   2. Apply this migration to a Preview database, submit one report of each
--      new category, then apply to production.
--
-- ROLLBACK
--   Run supabase/rollbacks/20261006110000_054_resource_issue_context.rollback.sql
--   (one transaction; tested by `npm run test:migration-chain-sql`). It removes
--   the marker, drops the 4-argument function, restores migration 029's
--   3-argument function and its grants, and puts the five-category CHECK and
--   drops `context` ONLY when no report uses the newer categories; otherwise it
--   keeps both so no report is lost, and says so. Browser tabs that are already
--   open remember that the new categories existed until they are reloaded.
--
-- RE-RUNNING
--   The file can be applied again: the function is `create or replace`, the
--   category CHECK is rebuilt whatever it was called, and the marker insert
--   ignores a duplicate.

set local lock_timeout = '5s';

alter table public.resource_issue_reports
  add column if not exists context jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'resource_issue_reports_context_shape'
      and conrelid = 'public.resource_issue_reports'::regclass
  ) then
    alter table public.resource_issue_reports
      add constraint resource_issue_reports_context_shape
      check (
        context is null
        or (jsonb_typeof(context) = 'object' and pg_column_size(context) <= 1024)
      );
  end if;
end
$$;

-- Drop whichever CHECK guards `category` (its generated name is an assumption
-- about how migration 029 was applied), then install the widened one.
do $$
declare
  v_constraint record;
begin
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
    check (category in (
      'cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other',
      'wrong_answer', 'cannot_play', 'no_sound', 'camera_issue', 'mobile_layout'
    ));
end
$$;

drop function if exists public.submit_resource_issue(uuid, text, text);

create or replace function public.submit_resource_issue(
  p_resource_id uuid,
  p_category text,
  p_details text,
  p_context jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_details text := btrim(coalesce(p_details, ''));
  v_context jsonb := null;
  v_report_id uuid;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;
  if p_category not in (
    'cannot_open', 'broken_link', 'cannot_download', 'wrong_content', 'other',
    'wrong_answer', 'cannot_play', 'no_sound', 'camera_issue', 'mobile_layout'
  ) then
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

  -- Keep four short, known keys; drop everything else.
  if p_context is not null and jsonb_typeof(p_context) = 'object' then
    v_context := jsonb_strip_nulls(jsonb_build_object(
      'app_version', left(p_context ->> 'app_version', 40),
      'browser', left(p_context ->> 'browser', 40),
      'os', left(p_context ->> 'os', 40),
      'viewport', left(p_context ->> 'viewport', 20)
    ));
    if v_context = '{}'::jsonb then v_context := null; end if;
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
    resource_id, reporter_id, category, details, status, context
  ) values (
    p_resource_id, v_user_id, p_category, v_details, 'pending', v_context
  ) returning id into v_report_id;
  return v_report_id;
end;
$$;

revoke all on function public.submit_resource_issue(uuid, text, text, jsonb) from public, anon;
grant execute on function public.submit_resource_issue(uuid, text, text, jsonb) to authenticated;

-- Published last, so a client that sees it can rely on everything above.
insert into public.features (id, name, description, value_type)
values (
  'system.resource_issue_context_v1_ready',
  'System: resource issue context v1 ready',
  'Internal problem-report marker; never display as a member benefit.',
  'boolean'
)
on conflict (id) do nothing;
