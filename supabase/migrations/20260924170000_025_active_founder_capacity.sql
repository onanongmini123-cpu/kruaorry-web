-- Founder 100 capacity is the number of approved memberships that are active
-- right now. Historical grants remain in founder_seat_ledger so a lapsed
-- member cannot reclaim the introductory price, but inactive/expired grants
-- no longer consume one of the 100 concurrent active places.

create function public.active_founder_seat_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct s.user_id)::integer
  from public.subscriptions s
  where s.plan_id = 'founder'
    and s.status = 'active'
    and s.founder_status = 'active'
    and s.founder_price_lock = true
    and (s.current_period_end is null or s.current_period_end > now());
$$;

revoke execute on function public.active_founder_seat_count() from public, anon, authenticated;

-- Public, aggregate-only availability. No member IDs or subscription rows are
-- exposed, and the count is computed under the function owner's RLS context.
create function public.get_founder_capacity()
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
    active_count as used,
    100 as capacity,
    greatest(0, 100 - active_count) as remaining,
    active_count >= 100 as is_full
  from (select public.active_founder_seat_count() as active_count) counts;
$$;

revoke execute on function public.get_founder_capacity() from public;
grant execute on function public.get_founder_capacity() to anon, authenticated;

-- Keep the existing admin RPC name compatible, but make it report the same
-- active source of truth shown on the public/member plan cards.
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

-- The trigger is the final server-side guard, including privileged/direct
-- writes. The advisory lock serializes every transition into an active
-- Founder seat so two concurrent approvals cannot create seat 101.
create or replace function public.enforce_founder_100_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_is_active boolean;
  v_old_was_active boolean := false;
  v_founder_count integer;
begin
  v_new_is_active := new.plan_id = 'founder'
    and new.status = 'active'
    and new.founder_status = 'active'
    and new.founder_price_lock = true
    and (new.current_period_end is null or new.current_period_end > now());

  if not v_new_is_active then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_old_was_active := old.plan_id = 'founder'
      and old.status = 'active'
      and old.founder_status = 'active'
      and old.founder_price_lock = true
      and (old.current_period_end is null or old.current_period_end > now());
  end if;

  if v_old_was_active then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  if exists (select 1 from public.founder_seat_ledger where user_id = new.user_id) then
    raise exception 'Founder membership cannot be claimed twice';
  end if;

  select count(distinct s.user_id)::integer into v_founder_count
  from public.subscriptions s
  where s.id <> new.id
    and s.plan_id = 'founder'
    and s.status = 'active'
    and s.founder_status = 'active'
    and s.founder_price_lock = true
    and (s.current_period_end is null or s.current_period_end > now());

  if v_founder_count >= 100 then
    raise exception 'Founder 100 is full';
  end if;

  insert into public.founder_seat_ledger (user_id, granted_at)
  values (new.user_id, coalesce(new.founder_started_at, now()));
  return new;
end;
$$;

drop trigger if exists trg_enforce_founder_100_cap on public.subscriptions;
create trigger trg_enforce_founder_100_cap
  before insert or update on public.subscriptions
  for each row execute function public.enforce_founder_100_cap();

-- Keep the atomic approval path aligned with the trigger's active-seat
-- semantics. This function still refuses to reissue a lapsed Founder price
-- lock to anyone already present in the durable ledger.
create or replace function public.activate_membership_internal(
  p_user_id uuid,
  p_plan_id text,
  p_source text,
  p_request_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_previous record;
  v_subscription_id uuid;
  v_now timestamptz := now();
  v_period_end timestamptz;
  v_founder_count integer;
begin
  if p_plan_id = 'free' then
    raise exception 'Use set_member_plan for the free plan';
  end if;

  select * into v_plan
  from public.plans
  where id = p_plan_id
  for share;

  if not found or v_plan.lifecycle_status = 'retired' then
    raise exception 'Plan is not available';
  end if;

  if v_plan.id <> 'free'
    and not v_plan.is_upgradeable
    and not (v_plan.lifecycle_status = 'legacy' and p_source = 'upgrade_request')
  then
    raise exception 'Plan is not available for new memberships';
  end if;

  if v_plan.lifecycle_status = 'legacy' and p_source <> 'upgrade_request' then
    raise exception 'Legacy plans cannot be assigned to new memberships';
  end if;

  if p_plan_id = 'founder' then
    perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

    if exists (select 1 from public.founder_seat_ledger where user_id = p_user_id) then
      raise exception 'Founder price lock cannot be claimed again; use the renewal flow while continuity is active';
    end if;

    v_founder_count := public.active_founder_seat_count();
    if v_founder_count >= 100 then
      raise exception 'Founder 100 is full';
    end if;
  end if;

  for v_previous in
    select s.id, s.plan_id, s.status
    from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'past_due')
    for update
  loop
    update public.subscriptions
    set
      status = 'cancelled',
      cancelled_at = v_now,
      founder_status = case when plan_id = 'founder' then 'lost_price_lock' else founder_status end,
      founder_price_lock = case when plan_id = 'founder' then false else founder_price_lock end
    where id = v_previous.id;

    insert into public.subscription_events (
      subscription_id, user_id, plan_id, event_type,
      previous_status, new_status, actor_id, metadata
    ) values (
      v_previous.id, p_user_id, v_previous.plan_id,
      case when v_previous.plan_id = 'founder' then 'founder_price_lock_lost' else 'plan_changed' end,
      v_previous.status, 'cancelled', p_actor_id,
      jsonb_build_object('reason', coalesce(p_reason, 'membership_replaced'))
    );
  end loop;

  v_period_end := case
    when v_plan.billing_interval = 'year' then v_now + interval '1 year'
    else null
  end;

  insert into public.subscriptions (
    user_id, plan_id, status, source, approved_from_request_id,
    price_amount_thb, billing_interval, started_at,
    current_period_start, current_period_end, founder_started_at,
    founder_status, founder_price_lock, created_by
  ) values (
    p_user_id, p_plan_id, 'active', p_source, p_request_id,
    v_plan.price_amount_thb, v_plan.billing_interval, v_now,
    v_now, v_period_end,
    case when p_plan_id = 'founder' then v_now else null end,
    case when p_plan_id = 'founder' then 'active' else null end,
    p_plan_id = 'founder', p_actor_id
  )
  returning id into v_subscription_id;

  insert into public.subscription_events (
    subscription_id, user_id, plan_id, event_type,
    previous_status, new_status, actor_id, metadata
  ) values (
    v_subscription_id, p_user_id, p_plan_id, 'activated',
    null, 'active', p_actor_id,
    jsonb_build_object('source', p_source, 'reason', coalesce(p_reason, 'activation'))
  );

  perform set_config('app.membership_plan_change_allowed', 'on', true);
  update public.profiles set plan = p_plan_id where id = p_user_id;
  return v_subscription_id;
end;
$$;

revoke execute on function public.activate_membership_internal(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;

-- Do not accept new pending Founder requests while capacity is full. The
-- approval RPC and subscription trigger repeat the check under a transaction
-- lock, so a request created earlier can never overbook the active cap.
drop policy if exists "upgrade_requests_insert_own" on public.upgrade_requests;
create policy "upgrade_requests_insert_own"
  on public.upgrade_requests for insert
  with check (
    (select auth.uid()) = user_id
    and status = 'pending'
    and resolved_at is null
    and exists (
      select 1 from public.plans p
      where p.id = plan_id
        and p.lifecycle_status = 'active'
        and p.is_public = true
        and p.is_upgradeable = true
    )
    and (
      plan_id <> 'founder'
      or not (select capacity.is_full from public.get_founder_capacity() capacity)
    )
  );
