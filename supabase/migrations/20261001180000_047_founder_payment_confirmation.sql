-- Make the Founder offer a one-time first-year promotion for the first 100
-- people whose payments are confirmed by an admin. Applications never reserve
-- a place. Founder paid activation and every paid renewal go through
-- idempotent, audited RPCs; no payment slip image is stored in KruAorry.

-- Migration 025 temporarily treated the limit as 100 concurrent active
-- memberships. Stop rather than silently choosing winners if that behavior has
-- already admitted more than 100 historical Founder grants on the live project.
do $$
declare
  v_grants integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  select count(*)::integer into v_grants
  from public.founder_seat_ledger;

  if v_grants > 100 then
    raise exception 'Founder payment migration blocked: founder_seat_ledger already contains % grants (maximum 100)', v_grants;
  end if;
end;
$$;

-- A structural slot invariant makes it impossible for the durable promotion
-- ledger to contain more than 100 rows, even if a later code path forgets to
-- count first. Existing grants keep deterministic slots ordered by grant time.
alter table public.founder_seat_ledger
  add column slot_number smallint;

with ranked as (
  select id, row_number() over (order by granted_at, id)::smallint as slot_number
  from public.founder_seat_ledger
)
update public.founder_seat_ledger ledger
set slot_number = ranked.slot_number
from ranked
where ranked.id = ledger.id;

alter table public.founder_seat_ledger
  alter column slot_number set not null,
  add constraint founder_seat_ledger_slot_range
    check (slot_number between 1 and 100),
  add constraint founder_seat_ledger_slot_unique unique (slot_number);

-- Acquisition and renewal prices are separate facts. `price_amount_thb`
-- remains the first-period quote; renewals read the new catalogue column.
alter table public.plans
  add column renewal_price_amount_thb integer;

alter table public.plans
  add constraint plans_renewal_price_amount_nonnegative
    check (renewal_price_amount_thb is null or renewal_price_amount_thb >= 0);

update public.plans
set renewal_price_amount_thb = case
  when id in ('founder', 'teacher') then 599
  when billing_interval = 'year' then price_amount_thb
  else null
end;

update public.plans
set
  price_label = '299 บาท (เฉพาะปีแรก)',
  note = 'เฉพาะ 100 คนแรกที่ครูอรรี่ยืนยันชำระเงินจริง การส่งคำขอยังไม่จองสิทธิ์ และต่ออายุปีถัดไป 599 บาท/ปี',
  price_amount_thb = 299,
  renewal_price_amount_thb = 599
where id = 'founder';

update public.plans
set renewal_price_amount_thb = 599
where id = 'teacher';

alter table public.plans
  add constraint plans_founder_offer_price
    check (
      id <> 'founder'
      or (
        price_amount_thb is not distinct from 299
        and renewal_price_amount_thb is not distinct from 599
      )
    ),
  add constraint plans_founder_teacher_renewal_price
    check (
      id not in ('founder', 'teacher')
      or renewal_price_amount_thb is not distinct from 599
    );

-- User-visible references are generated server-side. The full sequence value
-- is used so an admin can identify an application without exposing a user id.
alter table public.upgrade_requests
  add column reference_code text,
  add column quoted_amount_thb integer,
  add column payment_paid_at timestamptz,
  add column payment_confirmed_at timestamptz,
  add column payment_confirmed_by uuid references public.profiles(id) on delete set null,
  add column payment_confirmed_amount_thb integer,
  add column payment_reference text,
  add column resolved_by uuid references public.profiles(id) on delete set null;

create sequence public.membership_application_reference_seq as bigint;
alter sequence public.membership_application_reference_seq
  owned by public.upgrade_requests.reference_code;
revoke all on sequence public.membership_application_reference_seq from public, anon, authenticated;

update public.upgrade_requests
set reference_code = 'KA-' || lpad(nextval('public.membership_application_reference_seq')::text, 8, '0')
where reference_code is null;

update public.upgrade_requests request
set quoted_amount_thb = coalesce(plan.price_amount_thb, 0)
from public.plans plan
where plan.id = request.plan_id
  and request.quoted_amount_thb is null;

update public.upgrade_requests
set quoted_amount_thb = 0
where quoted_amount_thb is null;

alter table public.upgrade_requests
  alter column reference_code set default
    ('KA-' || lpad(nextval('public.membership_application_reference_seq')::text, 8, '0')),
  alter column reference_code set not null,
  alter column quoted_amount_thb set not null,
  add constraint upgrade_requests_reference_code_nonempty
    check (btrim(reference_code) <> ''),
  add constraint upgrade_requests_quoted_amount_nonnegative
    check (quoted_amount_thb >= 0),
  add constraint upgrade_requests_confirmed_amount_positive
    check (payment_confirmed_amount_thb is null or payment_confirmed_amount_thb > 0),
  add constraint upgrade_requests_payment_reference_nonempty
    check (payment_reference is null or btrim(payment_reference) <> ''),
  add constraint upgrade_requests_payment_confirmation_complete
    check (
      (payment_paid_at is null
        and payment_confirmed_at is null
        and payment_confirmed_by is null
        and payment_confirmed_amount_thb is null
        and payment_reference is null)
      or
      (payment_paid_at is not null
        and payment_confirmed_at is not null
        and payment_confirmed_amount_thb is not null
        and payment_reference is not null)
    );

create unique index upgrade_requests_reference_code_unique
  on public.upgrade_requests(reference_code);

create index upgrade_requests_status_created
  on public.upgrade_requests(status, created_at desc);

-- This is the durable financial-operation audit. It stores only confirmation
-- metadata, never a slip image or bank credentials. Foreign keys become null
-- on account/application deletion while the non-identifying audit facts and
-- application reference remain available for reconciliation.
create table public.membership_payment_confirmations (
  id uuid primary key default gen_random_uuid(),
  idempotency_key uuid not null unique,
  operation text not null check (operation in ('activation', 'renewal')),
  request_id uuid references public.upgrade_requests(id) on delete set null,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  application_reference_code text,
  plan_id text not null references public.plans(id),
  amount_thb integer not null check (amount_thb > 0),
  payment_reference text not null check (btrim(payment_reference) <> '' and char_length(payment_reference) <= 200),
  paid_at timestamptz not null,
  confirmed_at timestamptz not null default now(),
  confirmed_by uuid references public.profiles(id) on delete set null,
  result_period_end timestamptz,
  created_at timestamptz not null default now(),
  constraint membership_payment_activation_reference
    check (operation <> 'activation' or application_reference_code is not null)
);

create unique index membership_payment_reference_unique
  on public.membership_payment_confirmations(lower(btrim(payment_reference)));

create unique index membership_payment_activation_request_once
  on public.membership_payment_confirmations(request_id)
  where operation = 'activation' and request_id is not null;

create index membership_payment_subscription_created
  on public.membership_payment_confirmations(subscription_id, created_at desc);

create index membership_payment_user_created
  on public.membership_payment_confirmations(user_id, created_at desc);

alter table public.membership_payment_confirmations enable row level security;

create policy "membership_payment_confirmations_admin_read"
  on public.membership_payment_confirmations for select
  using (public.is_admin());

revoke all on table public.membership_payment_confirmations from anon, authenticated;
grant select on table public.membership_payment_confirmations to authenticated;

-- Audit facts are immutable even for privileged application clients. Foreign
-- key anonymization may only clear identifying links after a related row is
-- deleted; it cannot change the financial facts or reattach an identity.
create function public.protect_membership_payment_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Membership payment confirmations are append-only';
  end if;

  if new.id is distinct from old.id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.operation is distinct from old.operation
    or new.application_reference_code is distinct from old.application_reference_code
    or new.plan_id is distinct from old.plan_id
    or new.amount_thb is distinct from old.amount_thb
    or new.payment_reference is distinct from old.payment_reference
    or new.paid_at is distinct from old.paid_at
    or new.confirmed_at is distinct from old.confirmed_at
    or new.result_period_end is distinct from old.result_period_end
    or new.created_at is distinct from old.created_at
    or (
      new.request_id is distinct from old.request_id
      and not (old.request_id is not null and new.request_id is null)
    )
    or (
      new.subscription_id is distinct from old.subscription_id
      and not (old.subscription_id is not null and new.subscription_id is null)
    )
    or (
      new.user_id is distinct from old.user_id
      and not (old.user_id is not null and new.user_id is null)
    )
    or (
      new.confirmed_by is distinct from old.confirmed_by
      and not (old.confirmed_by is not null and new.confirmed_by is null)
    )
  then
    raise exception 'Membership payment confirmation facts cannot be changed';
  end if;

  return new;
end;
$$;

create trigger trg_protect_membership_payment_confirmation
  before update or delete on public.membership_payment_confirmations
  for each row execute function public.protect_membership_payment_confirmation();

revoke execute on function public.protect_membership_payment_confirmation()
  from public, anon, authenticated;

-- Founder grants are permanent financial history. The only allowed update is
-- the FK-driven anonymization from a member id to NULL when an account is
-- deleted; neither a privileged client nor a future maintenance path may
-- delete a grant or recycle/reassign its slot.
create function public.protect_founder_seat_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Founder promotion grants are append-only';
  end if;

  if new.id is distinct from old.id
    or new.granted_at is distinct from old.granted_at
    or new.slot_number is distinct from old.slot_number
    or (
      new.user_id is distinct from old.user_id
      and not (old.user_id is not null and new.user_id is null)
    )
  then
    raise exception 'Founder promotion grants cannot be changed or reassigned';
  end if;

  return new;
end;
$$;

create trigger trg_protect_founder_seat_ledger
  before update or delete on public.founder_seat_ledger
  for each row execute function public.protect_founder_seat_ledger();

revoke execute on function public.protect_founder_seat_ledger() from public, anon, authenticated;

-- Compatibility name retained because activation code from migration 025
-- calls it. Its meaning is now the number of promotion grants ever confirmed,
-- not the number of currently active subscriptions.
create or replace function public.active_founder_seat_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.founder_seat_ledger;
$$;

revoke execute on function public.active_founder_seat_count() from public, anon, authenticated;

create or replace function public.get_founder_capacity()
returns table (
  used integer,
  capacity integer,
  remaining integer,
  is_full boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    grant_count as used,
    100 as capacity,
    greatest(0, 100 - grant_count) as remaining,
    grant_count >= 100 as is_full
  from (select public.active_founder_seat_count() as grant_count) counts;
$$;

revoke execute on function public.get_founder_capacity() from public;
grant execute on function public.get_founder_capacity() to anon, authenticated;

create or replace function public.get_founder_seat_count()
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  return public.active_founder_seat_count();
end;
$$;

-- Every new Founder grant must originate from a request whose payment fields
-- were set by the atomic confirmation RPC below. Existing Founder rows may be
-- renewed in place and never consume a second slot.
create or replace function public.enforce_founder_100_cap()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot smallint;
begin
  if tg_op = 'UPDATE'
    and old.user_id is distinct from new.user_id
    and (old.plan_id = 'founder' or new.plan_id = 'founder')
  then
    raise exception 'Founder subscription owner cannot be changed';
  end if;

  if new.plan_id <> 'founder' then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.plan_id = 'founder' then
    if not exists (
      select 1 from public.founder_seat_ledger ledger
      where ledger.user_id = new.user_id
    ) then
      raise exception 'Founder promotion grant ledger is missing';
    end if;

    if (
      (old.status not in ('active', 'past_due') and new.status in ('active', 'past_due'))
      or (
        new.current_period_end is not null
        and (
          old.current_period_end is null
          or new.current_period_end > old.current_period_end
        )
      )
    ) and not exists (
      select 1
      from public.membership_payment_confirmations confirmation
      where confirmation.id = nullif(
          current_setting('app.membership_founder_renewal_confirmation_id', true),
          ''
        )::uuid
        and confirmation.operation = 'renewal'
        and confirmation.subscription_id = new.id
        and confirmation.plan_id = 'founder'
        and confirmation.amount_thb = 599
        and confirmation.confirmed_at = transaction_timestamp()
        and confirmation.result_period_end = new.current_period_end
    ) then
      raise exception 'Founder renewal requires an audited 599 THB payment confirmation';
    end if;

    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  if exists (
    select 1 from public.founder_seat_ledger ledger
    where ledger.user_id = new.user_id
  ) then
    raise exception 'Founder membership cannot be claimed twice';
  end if;

  if new.source <> 'upgrade_request'
    or new.approved_from_request_id is null
    or new.price_amount_thb is distinct from 299
    or not exists (
      select 1
      from public.upgrade_requests request
      where request.id = new.approved_from_request_id
        and request.user_id = new.user_id
        and request.plan_id = 'founder'
        and request.quoted_amount_thb = 299
        and request.payment_confirmed_amount_thb = 299
        and request.payment_paid_at is not null
        and request.payment_confirmed_at is not null
        and request.payment_confirmed_by is not null
        and request.payment_reference is not null
    )
  then
    raise exception 'Founder activation requires an admin-confirmed 299 THB payment application';
  end if;

  select candidate.slot_number::smallint into v_slot
  from generate_series(1, 100) as candidate(slot_number)
  where not exists (
    select 1
    from public.founder_seat_ledger ledger
    where ledger.slot_number = candidate.slot_number
  )
  order by candidate.slot_number
  limit 1;

  if v_slot is null then
    raise exception 'Founder 100 is full';
  end if;

  insert into public.founder_seat_ledger (user_id, granted_at, slot_number)
  values (new.user_id, coalesce(new.founder_started_at, now()), v_slot);
  return new;
end;
$$;

revoke execute on function public.enforce_founder_100_cap() from public, anon, authenticated;

-- Direct browser inserts are replaced by an authenticated, idempotent RPC so
-- the quoted amount and reference always come from the database catalogue.
drop policy if exists "upgrade_requests_insert_own" on public.upgrade_requests;
revoke insert on table public.upgrade_requests from anon, authenticated;

create function public.create_membership_application(p_plan_id text)
returns table (
  id uuid,
  reference_code text,
  plan_id text,
  status text,
  quoted_amount_thb integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan public.plans%rowtype;
  v_request public.upgrade_requests%rowtype;
begin
  if v_user_id is null then
    raise exception 'Authenticated member required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles profile where profile.id = v_user_id) then
    raise exception 'Member profile not found';
  end if;

  select * into v_plan
  from public.plans plan
  where plan.id = p_plan_id;

  if not found
    or v_plan.lifecycle_status <> 'active'
    or not v_plan.is_public
    or not v_plan.is_upgradeable
    or v_plan.price_amount_thb is null
    or v_plan.price_amount_thb <= 0
  then
    raise exception 'Plan is not available for membership applications';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-application:' || v_user_id::text || ':' || p_plan_id, 0)
  );

  select * into v_request
  from public.upgrade_requests request
  where request.user_id = v_user_id
    and request.plan_id = p_plan_id
    and request.status = 'pending'
  order by request.created_at desc
  limit 1
  for update;

  if not found then
    if p_plan_id = 'founder'
      and (select capacity.is_full from public.get_founder_capacity() capacity)
    then
      raise exception 'Founder 100 is full';
    end if;

    insert into public.upgrade_requests (
      user_id, plan_id, status, quoted_amount_thb
    ) values (
      v_user_id, p_plan_id, 'pending', v_plan.price_amount_thb
    )
    returning * into v_request;
  end if;

  id := v_request.id;
  reference_code := v_request.reference_code;
  plan_id := v_request.plan_id;
  status := v_request.status;
  quoted_amount_thb := v_request.quoted_amount_thb;
  created_at := v_request.created_at;
  return next;
end;
$$;

revoke execute on function public.create_membership_application(text) from public, anon;
grant execute on function public.create_membership_application(text) to authenticated;

-- Old RPCs must not remain as payment-free back doors, including for callers
-- that cached their PostgREST signatures.
create or replace function public.approve_upgrade_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'approve_upgrade_request is disabled; use confirm_membership_payment';
end;
$$;

revoke execute on function public.approve_upgrade_request(uuid) from public, anon, authenticated;

create or replace function public.renew_subscription(p_subscription_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'renew_subscription is disabled; use confirm_subscription_renewal';
end;
$$;

revoke execute on function public.renew_subscription(uuid) from public, anon, authenticated;

-- Manual plan administration remains available for ordinary plans and Free,
-- but a Founder grant can only be created by a confirmed payment application.
create or replace function public.set_member_plan(
  p_user_id uuid,
  p_plan_id text,
  p_reason text default 'admin_manual_change'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous record;
  v_subscription_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_plan_id = 'founder' then
    raise exception 'Founder grants require confirm_membership_payment';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Member profile not found';
  end if;

  if p_plan_id = 'free' then
    for v_previous in
      select subscription.id, subscription.plan_id, subscription.status
      from public.subscriptions subscription
      where subscription.user_id = p_user_id
        and subscription.status in ('active', 'past_due')
      for update
    loop
      update public.subscriptions
      set
        status = 'cancelled',
        cancelled_at = now(),
        founder_status = case when plan_id = 'founder' then 'lost_price_lock' else founder_status end,
        founder_price_lock = case when plan_id = 'founder' then false else founder_price_lock end
      where id = v_previous.id;

      insert into public.subscription_events (
        subscription_id, user_id, plan_id, event_type,
        previous_status, new_status, actor_id, metadata
      ) values (
        v_previous.id, p_user_id, v_previous.plan_id,
        case when v_previous.plan_id = 'founder' then 'founder_price_lock_lost' else 'cancelled' end,
        v_previous.status, 'cancelled', (select auth.uid()),
        jsonb_build_object('reason', p_reason)
      );
    end loop;

    perform set_config('app.membership_plan_change_allowed', 'on', true);
    update public.profiles set plan = 'free' where id = p_user_id;
    perform set_config('app.membership_plan_change_allowed', 'off', true);
    return null;
  end if;

  v_subscription_id := public.activate_membership_internal(
    p_user_id,
    p_plan_id,
    'admin',
    null,
    (select auth.uid()),
    p_reason
  );

  return v_subscription_id;
end;
$$;

-- The inherited activation helper already qualifies every relation. Harden
-- its execution environment before the payment-confirmation RPC calls it.
alter function public.activate_membership_internal(uuid, text, text, uuid, uuid, text)
  set search_path = '';

-- One transaction records the payment facts, consumes a Founder slot when
-- applicable, activates access, and resolves the application. The idempotency
-- advisory lock makes a retry return the first subscription rather than error
-- or duplicate history.
create function public.confirm_membership_payment(
  p_request_id uuid,
  p_amount_thb integer,
  p_payment_reference text,
  p_paid_at timestamptz,
  p_idempotency_key uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_request public.upgrade_requests%rowtype;
  v_existing public.membership_payment_confirmations%rowtype;
  v_subscription_id uuid;
  v_confirmation_id uuid := gen_random_uuid();
  v_payment_reference text := btrim(p_payment_reference);
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key is required';
  end if;
  if p_amount_thb is null or p_amount_thb <= 0 then
    raise exception 'Confirmed payment amount must be positive';
  end if;
  if v_payment_reference is null or v_payment_reference = '' or char_length(v_payment_reference) > 200 then
    raise exception 'Payment reference is required and must not exceed 200 characters';
  end if;
  if p_paid_at is null then
    raise exception 'Paid timestamp is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-payment:' || p_idempotency_key::text, 0)
  );

  select * into v_existing
  from public.membership_payment_confirmations confirmation
  where confirmation.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operation = 'activation'
      and v_existing.request_id = p_request_id
      and v_existing.amount_thb = p_amount_thb
      and lower(btrim(v_existing.payment_reference)) = lower(v_payment_reference)
      and v_existing.paid_at = p_paid_at
      and v_existing.subscription_id is not null
    then
      return v_existing.subscription_id;
    end if;
    raise exception 'Idempotency key was already used for a different payment operation';
  end if;

  -- Use one global lock order for activation and renewal before row locks.
  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  select * into v_request
  from public.upgrade_requests request
  where request.id = p_request_id
  for update;

  if not found then
    raise exception 'Membership application not found';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Membership application is no longer pending';
  end if;
  if p_amount_thb <> v_request.quoted_amount_thb then
    raise exception 'Confirmed amount % does not match quoted amount %', p_amount_thb, v_request.quoted_amount_thb;
  end if;
  if v_request.plan_id = 'founder' and p_amount_thb <> 299 then
    raise exception 'Founder first-year payment must be 299 THB';
  end if;

  update public.upgrade_requests
  set
    payment_paid_at = p_paid_at,
    payment_confirmed_at = now(),
    payment_confirmed_by = v_actor_id,
    payment_confirmed_amount_thb = p_amount_thb,
    payment_reference = v_payment_reference
  where id = v_request.id;

  v_subscription_id := public.activate_membership_internal(
    v_request.user_id,
    v_request.plan_id,
    'upgrade_request',
    v_request.id,
    v_actor_id,
    'payment_confirmed'
  );

  insert into public.membership_payment_confirmations (
    id, idempotency_key, operation, request_id, subscription_id, user_id,
    application_reference_code, plan_id, amount_thb, payment_reference,
    paid_at, confirmed_at, confirmed_by, result_period_end
  )
  select
    v_confirmation_id, p_idempotency_key, 'activation', v_request.id,
    v_subscription_id, v_request.user_id, v_request.reference_code,
    v_request.plan_id, p_amount_thb, v_payment_reference, p_paid_at, now(),
    v_actor_id, subscription.current_period_end
  from public.subscriptions subscription
  where subscription.id = v_subscription_id;

  if not found then
    raise exception 'Activated subscription could not be audited';
  end if;

  update public.upgrade_requests
  set status = 'approved', resolved_at = now(), resolved_by = v_actor_id
  where id = v_request.id;

  return v_subscription_id;
end;
$$;

revoke execute on function public.confirm_membership_payment(uuid, integer, text, timestamptz, uuid) from public, anon;
grant execute on function public.confirm_membership_payment(uuid, integer, text, timestamptz, uuid) to authenticated;

-- Renewal uses the catalogue renewal price (599 THB for Founder and Teacher),
-- records an immutable payment row, and returns the already-recorded period end
-- for safe retries of the same idempotency key.
create function public.confirm_subscription_renewal(
  p_subscription_id uuid,
  p_amount_thb integer,
  p_payment_reference text,
  p_paid_at timestamptz,
  p_idempotency_key uuid
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_subscription public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_existing public.membership_payment_confirmations%rowtype;
  v_expected_amount integer;
  v_confirmed_at timestamptz := now();
  v_new_period_end timestamptz;
  v_confirmation_id uuid := gen_random_uuid();
  v_payment_reference text := btrim(p_payment_reference);
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'Idempotency key is required';
  end if;
  if p_amount_thb is null or p_amount_thb <= 0 then
    raise exception 'Confirmed payment amount must be positive';
  end if;
  if v_payment_reference is null or v_payment_reference = '' or char_length(v_payment_reference) > 200 then
    raise exception 'Payment reference is required and must not exceed 200 characters';
  end if;
  if p_paid_at is null then
    raise exception 'Paid timestamp is required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('membership-payment:' || p_idempotency_key::text, 0)
  );

  select * into v_existing
  from public.membership_payment_confirmations confirmation
  where confirmation.idempotency_key = p_idempotency_key;

  if found then
    if v_existing.operation = 'renewal'
      and v_existing.subscription_id = p_subscription_id
      and v_existing.amount_thb = p_amount_thb
      and lower(btrim(v_existing.payment_reference)) = lower(v_payment_reference)
      and v_existing.paid_at = p_paid_at
      and v_existing.result_period_end is not null
    then
      return v_existing.result_period_end;
    end if;
    raise exception 'Idempotency key was already used for a different payment operation';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  select * into v_subscription
  from public.subscriptions subscription
  where subscription.id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;
  if v_subscription.status not in ('active', 'past_due', 'expired') then
    raise exception 'Cancelled or revoked subscriptions cannot be renewed';
  end if;
  if v_subscription.billing_interval <> 'year'
    or v_subscription.source = 'legacy'
    or v_subscription.current_period_end is null
  then
    raise exception 'Preserved or non-annual memberships cannot be renewed';
  end if;

  select * into v_plan
  from public.plans plan
  where plan.id = v_subscription.plan_id
  for share;

  if not found or v_plan.lifecycle_status <> 'active' then
    raise exception 'This plan cannot be renewed; choose a current plan';
  end if;

  v_expected_amount := case
    when v_plan.id in ('founder', 'teacher') then 599
    else coalesce(v_plan.renewal_price_amount_thb, v_plan.price_amount_thb)
  end;
  if v_expected_amount is null or v_expected_amount <= 0 then
    raise exception 'This plan has no valid renewal price';
  end if;
  if p_amount_thb <> v_expected_amount then
    raise exception 'Confirmed amount % does not match renewal amount %', p_amount_thb, v_expected_amount;
  end if;

  -- Early renewals extend the paid-through date. Late or explicitly expired
  -- memberships start a fresh annual period at confirmation time.
  v_new_period_end := case
    when v_subscription.status = 'expired'
      or v_subscription.current_period_end <= v_confirmed_at
    then v_confirmed_at + interval '1 year'
    else v_subscription.current_period_end + interval '1 year'
  end;

  -- Insert the immutable audit fact first so the subscription trigger can
  -- verify the exact confirmation that authorizes a Founder period extension.
  -- Any later failure rolls this row back with the rest of the transaction.
  insert into public.membership_payment_confirmations (
    id, idempotency_key, operation, subscription_id, user_id, plan_id,
    amount_thb, payment_reference, paid_at, confirmed_at, confirmed_by,
    result_period_end
  ) values (
    v_confirmation_id, p_idempotency_key, 'renewal', v_subscription.id,
    v_subscription.user_id, v_subscription.plan_id, p_amount_thb,
    v_payment_reference, p_paid_at, v_confirmed_at, v_actor_id, v_new_period_end
  );

  if v_subscription.plan_id = 'founder' then
    perform set_config(
      'app.membership_founder_renewal_confirmation_id',
      v_confirmation_id::text,
      true
    );
  end if;

  update public.subscriptions
  set
    status = 'active',
    current_period_start = case
      when v_subscription.status = 'expired'
        or v_subscription.current_period_end <= v_confirmed_at
      then v_confirmed_at
      else v_subscription.current_period_start
    end,
    current_period_end = v_new_period_end,
    price_amount_thb = v_expected_amount,
    founder_status = case when plan_id = 'founder' then 'active' else founder_status end,
    founder_price_lock = case when plan_id = 'founder' then false else founder_price_lock end
  where id = v_subscription.id;

  if v_subscription.plan_id = 'founder' then
    perform set_config('app.membership_founder_renewal_confirmation_id', '', true);
  end if;

  insert into public.subscription_events (
    subscription_id, user_id, plan_id, event_type,
    previous_status, new_status, actor_id, metadata
  ) values (
    v_subscription.id, v_subscription.user_id, v_subscription.plan_id,
    'renewed', v_subscription.status, 'active', v_actor_id,
    jsonb_build_object(
      'new_period_end', v_new_period_end,
      'price_amount_thb', v_expected_amount,
      'payment_confirmation_id', v_confirmation_id
    )
  );

  perform set_config('app.membership_plan_change_allowed', 'on', true);
  update public.profiles
  set plan = v_subscription.plan_id
  where id = v_subscription.user_id
    and plan in ('free', v_subscription.plan_id);
  if not found then
    raise exception 'Profile plan conflicts with the subscription being renewed';
  end if;
  perform set_config('app.membership_plan_change_allowed', 'off', true);

  return v_new_period_end;
end;
$$;

revoke execute on function public.confirm_subscription_renewal(uuid, integer, text, timestamptz, uuid) from public, anon;
grant execute on function public.confirm_subscription_renewal(uuid, integer, text, timestamptz, uuid) to authenticated;

-- Declines now record the resolver as well; existing pending data is preserved.
create or replace function public.decline_upgrade_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.upgrade_requests
  set status = 'declined', resolved_at = now(), resolved_by = (select auth.uid())
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Pending membership application not found';
  end if;
end;
$$;

revoke execute on function public.decline_upgrade_request(uuid) from public, anon;
grant execute on function public.decline_upgrade_request(uuid) to authenticated;
