-- Phase 1B: make subscription activation server-authoritative and atomic,
-- enforce the Founder 100 cap under a transaction-level advisory lock, and
-- replace broad `plan <> free` checks with centralized capabilities.

create function public.current_user_plan_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select s.plan_id
      from public.subscriptions s
      where s.user_id = (select auth.uid())
        and s.status in ('active', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.created_at desc
      limit 1
    ),
    'free'
  );
$$;

create function public.has_feature(p_feature_id text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.plan_features pf
    where pf.plan_id = public.current_user_plan_id()
      and pf.feature_id = p_feature_id
      and pf.enabled = true
  );
$$;

create function public.get_my_entitlements()
returns table (
  plan_id text,
  feature_id text,
  enabled boolean,
  limit_value bigint
)
language sql
security definer
set search_path = public
stable
as $$
  with effective_plan as (
    select public.current_user_plan_id() as id
  )
  select
    ep.id,
    f.id,
    coalesce(pf.enabled, false),
    pf.limit_value
  from effective_plan ep
  cross join public.features f
  left join public.plan_features pf
    on pf.plan_id = ep.id and pf.feature_id = f.id
  order by f.id;
$$;

revoke execute on function public.current_user_plan_id() from public, anon;
revoke execute on function public.has_feature(text) from public, anon;
revoke execute on function public.get_my_entitlements() from public, anon;
grant execute on function public.current_user_plan_id() to authenticated;
grant execute on function public.has_feature(text) to authenticated;
grant execute on function public.get_my_entitlements() to authenticated;

create function public.activate_membership_internal(
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

  if v_plan.lifecycle_status = 'legacy' and p_source <> 'upgrade_request' then
    raise exception 'Legacy plans cannot be assigned to new memberships';
  end if;

  if p_plan_id = 'founder' then
    perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

    if exists (
      select 1
      from public.subscriptions s
      where s.user_id = p_user_id
        and s.plan_id = 'founder'
    ) then
      raise exception 'Founder price lock cannot be claimed again; use the renewal flow while continuity is active';
    end if;

    select count(*) into v_founder_count
    from public.subscriptions s
    where s.plan_id = 'founder'
      and s.status in ('active', 'past_due')
      and s.founder_status = 'active'
      and s.founder_price_lock = true
      and s.current_period_end > v_now;

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
      subscription_id,
      user_id,
      plan_id,
      event_type,
      previous_status,
      new_status,
      actor_id,
      metadata
    ) values (
      v_previous.id,
      p_user_id,
      v_previous.plan_id,
      case when v_previous.plan_id = 'founder' then 'founder_price_lock_lost' else 'plan_changed' end,
      v_previous.status,
      'cancelled',
      p_actor_id,
      jsonb_build_object('reason', coalesce(p_reason, 'membership_replaced'))
    );
  end loop;

  v_period_end := case
    when v_plan.billing_interval = 'year' then v_now + interval '1 year'
    else null
  end;

  insert into public.subscriptions (
    user_id,
    plan_id,
    status,
    source,
    approved_from_request_id,
    price_amount_thb,
    billing_interval,
    started_at,
    current_period_start,
    current_period_end,
    founder_started_at,
    founder_status,
    founder_price_lock,
    created_by
  ) values (
    p_user_id,
    p_plan_id,
    'active',
    p_source,
    p_request_id,
    v_plan.price_amount_thb,
    v_plan.billing_interval,
    v_now,
    v_now,
    v_period_end,
    case when p_plan_id = 'founder' then v_now else null end,
    case when p_plan_id = 'founder' then 'active' else null end,
    p_plan_id = 'founder',
    p_actor_id
  )
  returning id into v_subscription_id;

  insert into public.subscription_events (
    subscription_id,
    user_id,
    plan_id,
    event_type,
    previous_status,
    new_status,
    actor_id,
    metadata
  ) values (
    v_subscription_id,
    p_user_id,
    p_plan_id,
    'activated',
    null,
    'active',
    p_actor_id,
    jsonb_build_object('source', p_source, 'reason', coalesce(p_reason, 'activation'))
  );

  perform set_config('app.membership_plan_change_allowed', 'on', true);
  update public.profiles set plan = p_plan_id where id = p_user_id;

  return v_subscription_id;
end;
$$;

revoke execute on function public.activate_membership_internal(uuid, text, text, uuid, uuid, text) from public, anon, authenticated;

create function public.approve_upgrade_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.upgrade_requests%rowtype;
  v_subscription_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_request
  from public.upgrade_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Upgrade request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Upgrade request is no longer pending';
  end if;

  v_subscription_id := public.activate_membership_internal(
    v_request.user_id,
    v_request.plan_id,
    'upgrade_request',
    v_request.id,
    (select auth.uid()),
    'upgrade_request_approved'
  );

  update public.upgrade_requests
  set status = 'approved', resolved_at = now()
  where id = v_request.id;

  return v_subscription_id;
end;
$$;

create function public.decline_upgrade_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  update public.upgrade_requests
  set status = 'declined', resolved_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Pending upgrade request not found';
  end if;
end;
$$;

create function public.set_member_plan(
  p_user_id uuid,
  p_plan_id text,
  p_reason text default 'admin_manual_change'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous record;
  v_subscription_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Member profile not found';
  end if;

  if p_plan_id = 'free' then
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
        cancelled_at = now(),
        founder_status = case when plan_id = 'founder' then 'lost_price_lock' else founder_status end,
        founder_price_lock = case when plan_id = 'founder' then false else founder_price_lock end
      where id = v_previous.id;

      insert into public.subscription_events (
        subscription_id,
        user_id,
        plan_id,
        event_type,
        previous_status,
        new_status,
        actor_id,
        metadata
      ) values (
        v_previous.id,
        p_user_id,
        v_previous.plan_id,
        case when v_previous.plan_id = 'founder' then 'founder_price_lock_lost' else 'cancelled' end,
        v_previous.status,
        'cancelled',
        (select auth.uid()),
        jsonb_build_object('reason', p_reason)
      );
    end loop;

    perform set_config('app.membership_plan_change_allowed', 'on', true);
    update public.profiles set plan = 'free' where id = p_user_id;
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

create function public.renew_subscription(p_subscription_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_new_period_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;

  if v_subscription.billing_interval <> 'year' then
    raise exception 'Only annual subscriptions can be renewed';
  end if;

  if v_subscription.plan_id = 'founder' then
    perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

    if v_subscription.founder_price_lock = false
      or v_subscription.founder_status <> 'active'
      or v_subscription.current_period_end is null
      or v_subscription.current_period_end <= now()
    then
      update public.subscriptions
      set status = 'expired', founder_status = 'lost_price_lock', founder_price_lock = false
      where id = v_subscription.id;

      insert into public.subscription_events (
        subscription_id,
        user_id,
        plan_id,
        event_type,
        previous_status,
        new_status,
        actor_id,
        metadata
      ) values (
        v_subscription.id,
        v_subscription.user_id,
        v_subscription.plan_id,
        'founder_price_lock_lost',
        v_subscription.status,
        'expired',
        (select auth.uid()),
        jsonb_build_object('reason', 'renewal_continuity_broken')
      );

      perform set_config('app.membership_plan_change_allowed', 'on', true);
      update public.profiles set plan = 'free' where id = v_subscription.user_id;
      return null;
    end if;
  end if;

  v_new_period_end := greatest(coalesce(v_subscription.current_period_end, now()), now()) + interval '1 year';

  update public.subscriptions
  set
    status = 'active',
    current_period_start = now(),
    current_period_end = v_new_period_end,
    price_amount_thb = case when plan_id = 'founder' then 299 else price_amount_thb end
  where id = v_subscription.id;

  insert into public.subscription_events (
    subscription_id,
    user_id,
    plan_id,
    event_type,
    previous_status,
    new_status,
    actor_id,
    metadata
  ) values (
    v_subscription.id,
    v_subscription.user_id,
    v_subscription.plan_id,
    'renewed',
    v_subscription.status,
    'active',
    (select auth.uid()),
    jsonb_build_object('new_period_end', v_new_period_end)
  );

  return v_new_period_end;
end;
$$;

revoke execute on function public.approve_upgrade_request(uuid) from public, anon;
revoke execute on function public.decline_upgrade_request(uuid) from public, anon;
revoke execute on function public.set_member_plan(uuid, text, text) from public, anon;
revoke execute on function public.renew_subscription(uuid) from public, anon;
grant execute on function public.approve_upgrade_request(uuid) to authenticated;
grant execute on function public.decline_upgrade_request(uuid) to authenticated;
grant execute on function public.set_member_plan(uuid, text, text) to authenticated;
grant execute on function public.renew_subscription(uuid) to authenticated;

-- All changes to the compatibility cache profiles.plan must now originate
-- from an atomic membership RPC. Role/full-name updates remain unaffected.
create function public.enforce_membership_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan is distinct from old.plan
    and coalesce(current_setting('app.membership_plan_change_allowed', true), 'off') <> 'on'
  then
    raise exception 'Plan changes must use a membership RPC';
  end if;
  return new;
end;
$$;

create trigger trg_enforce_membership_plan_change
  before update on public.profiles
  for each row execute function public.enforce_membership_plan_change();

revoke execute on function public.enforce_membership_plan_change() from public, anon, authenticated;

-- A member may request only a currently visible, upgradeable plan. Existing
-- pending `plus` requests remain untouched and can still be resolved by the
-- atomic approval RPC.
drop policy if exists "upgrade_requests_insert_own" on public.upgrade_requests;
create policy "upgrade_requests_insert_own"
  on public.upgrade_requests for insert
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.plans p
      where p.id = plan_id
        and p.lifecycle_status = 'active'
        and p.is_public = true
        and p.is_upgradeable = true
    )
  );

drop policy if exists "upgrade_requests_admin_update" on public.upgrade_requests;

create unique index upgrade_requests_one_pending_per_plan
  on public.upgrade_requests(user_id, plan_id)
  where status = 'pending';

drop policy if exists resource_files_entitled_read on storage.objects;
create policy resource_files_entitled_read on storage.objects
  for select
  using (
    bucket_id = 'resource-files'
    and (
      public.is_admin()
      or exists (
        select 1
        from public.resources r
        where r.id::text = (regexp_match(storage.objects.name, '^([^/]+)/'))[1]
          and r.status = 'published'
          and (
            r.is_free
            or public.has_feature('download.premium')
          )
      )
    )
  );
