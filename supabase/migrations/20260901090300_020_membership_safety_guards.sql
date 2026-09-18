-- Phase 1B hardening. This migration is additive to 017-019; it does not
-- rewrite any historical migration or existing membership data.

-- A Founder seat is one of the first 100 distinct people ever admitted, not
-- one of 100 reusable concurrent slots. Serialize even privileged/direct
-- inserts with the same lock used by activate_membership_internal().
create function public.enforce_founder_100_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_id <> 'founder' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  if exists (
    select 1 from public.subscriptions
    where user_id = new.user_id and plan_id = 'founder'
  ) then
    raise exception 'Founder membership cannot be claimed twice';
  end if;

  if (select count(distinct user_id) from public.subscriptions where plan_id = 'founder') >= 100 then
    raise exception 'Founder 100 is full';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_founder_100_cap
  before insert on public.subscriptions
  for each row execute function public.enforce_founder_100_cap();

revoke execute on function public.enforce_founder_100_cap() from public, anon, authenticated;

-- Resolve an arbitrary member's effective plan only inside trusted database
-- functions. It must not be callable from the browser with another user id.
create function public.membership_plan_for_user(p_user_id uuid)
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
      where s.user_id = p_user_id
        and s.status in ('active', 'past_due')
        and (s.current_period_end is null or s.current_period_end > now())
      order by s.created_at desc
      limit 1
    ),
    'free'
  );
$$;

revoke execute on function public.membership_plan_for_user(uuid) from public, anon, authenticated;

create or replace function public.current_user_plan_id()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select public.membership_plan_for_user((select auth.uid()));
$$;

-- The catalogue advertises 10 saved resources for Free. Enforce that on the
-- server under a per-member transaction lock, including concurrent inserts.
-- Existing rows are untouched even if a member already saved more than 10.
create function public.enforce_saved_resource_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id text;
  v_enabled boolean;
  v_limit bigint;
begin
  perform pg_advisory_xact_lock(hashtextextended('saved-resources:' || new.user_id::text, 0));
  v_plan_id := public.membership_plan_for_user(new.user_id);

  select pf.enabled into v_enabled
  from public.plan_features pf
  where pf.plan_id = v_plan_id and pf.feature_id = 'favorites.enabled';

  if not coalesce(v_enabled, false) then
    raise exception 'Saving resources is not available for this membership';
  end if;

  select pf.limit_value into v_limit
  from public.plan_features pf
  where pf.plan_id = v_plan_id and pf.feature_id = 'favorites.limit' and pf.enabled;

  if v_limit is not null and
    (select count(*) from public.saved_resources where user_id = new.user_id) >= v_limit
  then
    raise exception 'Saved resource limit reached for this membership';
  end if;

  return new;
end;
$$;

create trigger trg_enforce_saved_resource_entitlement
  before insert on public.saved_resources
  for each row execute function public.enforce_saved_resource_entitlement();

revoke execute on function public.enforce_saved_resource_entitlement() from public, anon, authenticated;

-- Browser inserts must remain requests, never forged completed approvals.
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
  );

-- Renew only an existing, still-current annual membership. Legacy perpetual
-- access is deliberately excluded so a manual click cannot add an expiry.
-- A lapsed normal annual membership may resume at the *current* plan price;
-- a lapsed Founder membership loses its price lock and cannot be renewed.
-- Take the Founder lock before the subscription row lock to avoid a deadlock
-- with a simultaneous Founder activation that locks in that order.
create or replace function public.renew_subscription(p_subscription_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_subscription public.subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_new_period_end timestamptz;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('founder-seat-allocation', 0));

  select * into v_subscription
  from public.subscriptions
  where id = p_subscription_id
  for update;

  if not found then
    raise exception 'Subscription not found';
  end if;

  if v_subscription.status not in ('active', 'past_due') then
    raise exception 'Cancelled, revoked, or expired subscriptions cannot be renewed';
  end if;

  if v_subscription.billing_interval <> 'year'
    or v_subscription.source = 'legacy'
    or v_subscription.current_period_end is null
  then
    raise exception 'Preserved or non-annual memberships cannot be renewed';
  end if;

  select * into v_plan from public.plans where id = v_subscription.plan_id for share;
  if not found or v_plan.lifecycle_status <> 'active' then
    raise exception 'This plan cannot be renewed; choose a current plan';
  end if;

  if v_subscription.plan_id = 'founder' and (
    not v_subscription.founder_price_lock
    or v_subscription.founder_status <> 'active'
    or v_subscription.current_period_end <= now()
  ) then
    update public.subscriptions
    set status = 'expired', founder_status = 'lost_price_lock', founder_price_lock = false
    where id = v_subscription.id;

    insert into public.subscription_events (
      subscription_id, user_id, plan_id, event_type,
      previous_status, new_status, actor_id, metadata
    ) values (
      v_subscription.id, v_subscription.user_id, v_subscription.plan_id,
      'founder_price_lock_lost', v_subscription.status, 'expired',
      (select auth.uid()), jsonb_build_object('reason', 'renewal_continuity_broken')
    );

    perform set_config('app.membership_plan_change_allowed', 'on', true);
    update public.profiles set plan = 'free'
    where id = v_subscription.user_id and plan = 'founder';
    perform set_config('app.membership_plan_change_allowed', 'off', true);
    return null;
  end if;

  v_new_period_end := greatest(v_subscription.current_period_end, now()) + interval '1 year';

  update public.subscriptions
  set status = 'active',
      current_period_start = case
        when v_subscription.current_period_end <= now() then now()
        else v_subscription.current_period_start
      end,
      current_period_end = v_new_period_end,
      price_amount_thb = v_plan.price_amount_thb
  where id = v_subscription.id;

  insert into public.subscription_events (
    subscription_id, user_id, plan_id, event_type,
    previous_status, new_status, actor_id, metadata
  ) values (
    v_subscription.id, v_subscription.user_id, v_subscription.plan_id,
    'renewed', v_subscription.status, 'active', (select auth.uid()),
    jsonb_build_object('new_period_end', v_new_period_end, 'price_amount_thb', v_plan.price_amount_thb)
  );

  perform set_config('app.membership_plan_change_allowed', 'on', true);
  update public.profiles set plan = v_subscription.plan_id
  where id = v_subscription.user_id and plan in ('free', v_subscription.plan_id);
  if not found then
    raise exception 'Profile plan conflicts with the subscription being renewed';
  end if;
  perform set_config('app.membership_plan_change_allowed', 'off', true);

  return v_new_period_end;
end;
$$;

-- A resource's folder may contain orphan or older files. Entitle only the
-- exact file that the published resource currently points to.
drop policy if exists resource_files_entitled_read on storage.objects;
create policy resource_files_entitled_read on storage.objects
  for select
  using (
    bucket_id = 'resource-files'
    and (
      public.is_admin()
      or exists (
        select 1 from public.resources r
        where r.file_path = storage.objects.name
          and r.id::text = (regexp_match(storage.objects.name, '^([^/]+)/'))[1]
          and r.status = 'published'
          and (r.is_free or public.has_feature('download.premium'))
      )
    )
  );
