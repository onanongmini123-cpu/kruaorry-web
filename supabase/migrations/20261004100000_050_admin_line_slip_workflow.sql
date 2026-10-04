-- The website no longer asks members to duplicate their LINE conversation by
-- self-reporting a slip. Keep 048's payment_reported_at as legacy compatibility
-- state, but use distinct columns for admin-observed LINE receipt provenance.
-- Adding nullable columns changes no existing application, subscription,
-- payment, or Founder-ledger row and is intentionally ordered after 049.

alter table public.upgrade_requests
  add column line_slip_received_at timestamptz,
  add column line_slip_received_by uuid references public.profiles(id) on delete set null,
  add constraint upgrade_requests_line_slip_received_by_requires_timestamp
    check (line_slip_received_by is null or line_slip_received_at is not null);

comment on column public.upgrade_requests.payment_reported_at is
  'Legacy member self-attested payment-report timestamp. Migration 050 also fills it for compatibility, but it is never sufficient proof of an admin-observed LINE slip.';
comment on column public.upgrade_requests.line_slip_received_at is
  'Timestamp when an admin recorded receiving this application slip in LINE.';
comment on column public.upgrade_requests.line_slip_received_by is
  'Admin profile that recorded receiving this application slip in LINE; nullable after profile deletion.';

-- Old browser bundles must not be able to keep writing the self-attested
-- marker after the new read-only member experience is deployed. The function
-- remains present so migration 048's historical contract is not rewritten.
revoke execute on function public.report_membership_payment(uuid)
  from public, anon, authenticated;

-- A plan/quote change invalidates receipt evidence for the old amount. Payment
-- confirmation itself must transition through an admin-recorded receipt, while
-- completed confirmations and their idempotent retries remain untouched.
create function public.enforce_admin_line_slip_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.plan_id is distinct from old.plan_id
    or new.quoted_amount_thb is distinct from old.quoted_amount_thb
  then
    new.line_slip_received_at := null;
    new.line_slip_received_by := null;
  end if;

  if old.payment_confirmed_at is null
    and new.payment_confirmed_at is not null
    and new.line_slip_received_at is null
  then
    raise exception 'Admin-recorded LINE slip is required before payment confirmation';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_admin_line_slip_workflow()
  from public, anon, authenticated;

create trigger trg_enforce_admin_line_slip_workflow
  before update of plan_id, quoted_amount_thb, payment_confirmed_at
  on public.upgrade_requests
  for each row execute function public.enforce_admin_line_slip_workflow();

-- Recording receipt of a slip is workflow evidence only. It never confirms a
-- payment, activates access, or consumes/reserves a Founder place. Repeating
-- the call returns the original admin timestamp, including when a first
-- response was lost and another admin resolved the application before retry.
create function public.record_membership_line_slip_received(p_request_id uuid)
returns table (
  id uuid,
  reference_code text,
  plan_id text,
  status text,
  quoted_amount_thb integer,
  payment_reported_at timestamptz,
  line_slip_received_at timestamptz,
  line_slip_received_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_request public.upgrade_requests%rowtype;
  v_received_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  -- Match confirmation/conversion lock order. The receipt itself does not
  -- inspect or change capacity; confirm_membership_payment remains the sole
  -- atomic authority for the permanent 1..100 Founder allocation.
  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  select * into v_request
  from public.upgrade_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Membership application not found';
  end if;

  if v_request.line_slip_received_at is null then
    if v_request.status <> 'pending' then
      raise exception 'Membership application is no longer pending';
    end if;

    v_received_at := now();
    update public.upgrade_requests request
    set
      line_slip_received_at = v_received_at,
      line_slip_received_by = v_actor_id,
      -- Keep old readers functional without treating their value as proof of
      -- provenance. A legacy member timestamp is deliberately preserved.
      payment_reported_at = coalesce(request.payment_reported_at, v_received_at)
    where request.id = v_request.id
    returning * into v_request;
  end if;

  id := v_request.id;
  reference_code := v_request.reference_code;
  plan_id := v_request.plan_id;
  status := v_request.status;
  quoted_amount_thb := v_request.quoted_amount_thb;
  payment_reported_at := v_request.payment_reported_at;
  line_slip_received_at := v_request.line_slip_received_at;
  line_slip_received_by := v_request.line_slip_received_by;
  created_at := v_request.created_at;
  return next;
end;
$$;

revoke execute on function public.record_membership_line_slip_received(uuid)
  from public, anon;
grant execute on function public.record_membership_line_slip_received(uuid)
  to authenticated;

-- Fail closed if either the existing 048/049 payment guarantees or this
-- migration's privilege boundary are missing. The admin UI probes only the
-- marker inserted after these checks; the broader membership page continues
-- to use the 048 readiness marker during a staggered rollout.
do $$
begin
  if pg_catalog.to_regprocedure('public.confirm_membership_payment(uuid,integer,text,timestamp with time zone,uuid)') is null
    or pg_catalog.to_regprocedure('public.record_membership_line_slip_received(uuid)') is null
    or pg_catalog.to_regprocedure('public.enforce_admin_line_slip_workflow()') is null
    or pg_catalog.to_regprocedure('public.has_my_founder_history()') is null
    or pg_catalog.to_regprocedure('public.prevent_repeat_founder_application()') is null
  then
    raise exception 'LINE slip workflow migration assertion failed: required 048/049 functions are missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.upgrade_requests'::regclass
      and trigger_row.tgname = 'trg_prevent_repeat_founder_application'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'LINE slip workflow migration assertion failed: the 049 Founder history trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.subscriptions'::regclass
      and trigger_row.tgname = 'trg_enforce_founder_100_cap'
      and trigger_row.tgenabled <> 'D'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'LINE slip workflow migration assertion failed: the Founder 100 allocation trigger is missing or disabled';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'upgrade_requests'
      and column_name = 'line_slip_received_at'
  ) or not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'upgrade_requests'
      and column_name = 'line_slip_received_by'
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.upgrade_requests'::regclass
      and trigger_row.tgname = 'trg_enforce_admin_line_slip_workflow'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'LINE slip workflow migration assertion failed: receipt provenance guard is missing';
  end if;

  if has_function_privilege('anon', 'public.report_membership_payment(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.report_membership_payment(uuid)', 'execute')
  then
    raise exception 'LINE slip workflow migration assertion failed: member payment reporting is still executable';
  end if;

  if has_function_privilege('anon', 'public.record_membership_line_slip_received(uuid)', 'execute')
    or not has_function_privilege('authenticated', 'public.record_membership_line_slip_received(uuid)', 'execute')
  then
    raise exception 'LINE slip workflow migration assertion failed: admin receipt RPC grants are incorrect';
  end if;
end;
$$;

insert into public.features (id, name, description, value_type)
values (
  'system.membership_line_slip_workflow_v1_ready',
  'System: admin LINE slip workflow v1 ready',
  'Internal admin-only workflow marker; never display as a member benefit.',
  'boolean'
);
