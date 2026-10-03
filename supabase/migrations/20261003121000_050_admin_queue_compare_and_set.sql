-- Forward-only concurrency guards for every mutable admin work queue.
--
-- Each RPC mutates a row only when the workflow facts rendered to the admin
-- still match. A false result means another session changed the row first;
-- callers must refresh instead of overwriting that newer decision. The only
-- row-shape change is an additive request revision initialized to the constant
-- value 1; no existing business value is deleted or rewritten.

-- Requests must no longer be mutable through PostgREST UPDATE, which would
-- bypass compare-and-set even though RLS limits the caller to admins.
alter table public.requests
  add column admin_revision integer not null default 1,
  add constraint requests_admin_revision_positive check (admin_revision > 0);

revoke update on table public.requests from authenticated;

create or replace function public.admin_compare_set_request_status(
  p_request_id uuid,
  p_expected_status text,
  p_expected_revision integer,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_expected_status not in ('pending', 'in_progress', 'done')
    or p_status not in ('pending', 'in_progress', 'done')
    or p_expected_revision is null
    or p_expected_revision < 1
  then
    raise exception 'Invalid request transition snapshot' using errcode = '22023';
  end if;

  update public.requests
  set status = p_status,
      admin_revision = admin_revision + 1
  where id = p_request_id
    and status = p_expected_status
    and admin_revision = p_expected_revision;

  return found;
end;
$$;

create or replace function public.admin_compare_set_review_visibility(
  p_review_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_visible boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_expected_status not in ('pending', 'visible', 'hidden') then
    raise exception 'Invalid expected review status' using errcode = '22023';
  end if;

  update public.resource_reviews
  set moderation_status = case when p_visible then 'visible' else 'hidden' end,
      moderated_by = (select auth.uid()),
      moderated_at = current_timestamp,
      updated_at = current_timestamp
  where id = p_review_id
    and moderation_status = p_expected_status
    and updated_at is not distinct from p_expected_updated_at;

  return found;
end;
$$;

create or replace function public.admin_compare_delete_resource_review(
  p_review_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_expected_status not in ('pending', 'visible', 'hidden') then
    raise exception 'Invalid expected review status' using errcode = '22023';
  end if;

  delete from public.resource_reviews
  where id = p_review_id
    and moderation_status = p_expected_status
    and updated_at is not distinct from p_expected_updated_at;

  return found;
end;
$$;

create or replace function public.admin_compare_set_resource_issue_status(
  p_report_id uuid,
  p_expected_status text,
  p_expected_updated_at timestamptz,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_expected_status not in ('pending', 'in_progress', 'resolved')
    or p_status not in ('pending', 'in_progress', 'resolved')
  then
    raise exception 'Invalid issue status' using errcode = '22023';
  end if;

  update public.resource_issue_reports
  set status = p_status,
      resolved_at = case when p_status = 'resolved' then current_timestamp else null end,
      updated_at = current_timestamp
  where id = p_report_id
    and status = p_expected_status
    and updated_at is not distinct from p_expected_updated_at;

  return found;
end;
$$;

-- A member may report payment or convert Founder to Teacher while an admin
-- still has the pending row open. Lock and compare the rendered payment time,
-- plan and quote before declining, then preserve migration 048's exact
-- append-only audit behavior.
create or replace function public.admin_compare_decline_upgrade_request(
  p_request_id uuid,
  p_expected_payment_reported_at timestamptz,
  p_expected_plan_id text,
  p_expected_quoted_amount_thb integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_user_id uuid;
  v_plan_id text;
  v_quoted_amount_thb integer;
  v_reference_code text;
  v_payment_reported_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if btrim(coalesce(p_expected_plan_id, '')) = ''
    or p_expected_quoted_amount_thb is null
    or p_expected_quoted_amount_thb < 0
  then
    raise exception 'Invalid expected membership application snapshot' using errcode = '22023';
  end if;

  select
    request.user_id,
    request.plan_id,
    request.quoted_amount_thb,
    request.reference_code,
    request.payment_reported_at
  into
    v_user_id,
    v_plan_id,
    v_quoted_amount_thb,
    v_reference_code,
    v_payment_reported_at
  from public.upgrade_requests request
  where request.id = p_request_id
    and request.status = 'pending'
    and request.payment_reported_at is not distinct from p_expected_payment_reported_at
    and request.plan_id = p_expected_plan_id
    and request.quoted_amount_thb = p_expected_quoted_amount_thb
  for update;

  if not found then
    return false;
  end if;

  update public.upgrade_requests request
  set
    status = 'declined',
    resolved_at = current_timestamp,
    resolved_by = v_actor_id,
    resolution_reason_code = 'admin_declined'
  where request.id = p_request_id
    and request.status = 'pending'
    and request.payment_reported_at is not distinct from v_payment_reported_at
    and request.plan_id = v_plan_id
    and request.quoted_amount_thb = v_quoted_amount_thb;

  if not found then
    return false;
  end if;

  insert into public.membership_application_resolution_audit (
    request_id, application_reference_code, user_id, plan_id,
    previous_status, new_status, reason_code, resolved_at, resolved_by
  )
  select
    request.id, v_reference_code, v_user_id, v_plan_id,
    'pending', 'declined', 'admin_declined', request.resolved_at, v_actor_id
  from public.upgrade_requests request
  where request.id = p_request_id;

  return true;
end;
$$;

-- Remove every older unconditional admin mutation path. The historical
-- functions remain defined for migration compatibility but authenticated
-- callers can only execute the compare-and-set replacements below.
revoke execute on function public.admin_set_review_visibility(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.admin_delete_resource_review(uuid) from public, anon, authenticated;
revoke execute on function public.admin_set_resource_issue_status(uuid, text) from public, anon, authenticated;
revoke execute on function public.decline_upgrade_request(uuid) from public, anon, authenticated;

revoke all on function public.admin_compare_set_request_status(uuid, text, integer, text) from public, anon;
revoke all on function public.admin_compare_set_review_visibility(uuid, text, timestamptz, boolean) from public, anon;
revoke all on function public.admin_compare_delete_resource_review(uuid, text, timestamptz) from public, anon;
revoke all on function public.admin_compare_set_resource_issue_status(uuid, text, timestamptz, text) from public, anon;
revoke all on function public.admin_compare_decline_upgrade_request(uuid, timestamptz, text, integer) from public, anon;

grant execute on function public.admin_compare_set_request_status(uuid, text, integer, text) to authenticated;
grant execute on function public.admin_compare_set_review_visibility(uuid, text, timestamptz, boolean) to authenticated;
grant execute on function public.admin_compare_delete_resource_review(uuid, text, timestamptz) to authenticated;
grant execute on function public.admin_compare_set_resource_issue_status(uuid, text, timestamptz, text) to authenticated;
grant execute on function public.admin_compare_decline_upgrade_request(uuid, timestamptz, text, integer) to authenticated;
