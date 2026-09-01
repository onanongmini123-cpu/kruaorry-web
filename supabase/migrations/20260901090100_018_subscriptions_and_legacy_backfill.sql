-- Phase 1B: introduce subscription lifecycle/history while preserving every
-- existing non-free profile as an active, non-expiring legacy subscription.

do $$
begin
  if exists (
    select 1
    from public.profiles p
    left join public.plans pl on pl.id = p.plan
    where pl.id is null
  ) then
    raise exception 'Unknown legacy profiles.plan value found; add an explicit mapping before continuing';
  end if;
end;
$$;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null
    check (status in ('active', 'past_due', 'expired', 'cancelled', 'revoked')),
  source text not null
    check (source in ('legacy', 'upgrade_request', 'admin', 'renewal')),
  approved_from_request_id uuid unique references public.upgrade_requests(id) on delete set null,
  price_amount_thb integer,
  billing_interval text not null
    check (billing_interval in ('none', 'year', 'one_time')),
  started_at timestamptz not null default now(),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancelled_at timestamptz,
  founder_started_at timestamptz,
  founder_status text
    check (founder_status is null or founder_status in ('active', 'expired', 'lost_price_lock')),
  founder_price_lock boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_price_nonnegative
    check (price_amount_thb is null or price_amount_thb >= 0),
  constraint subscriptions_period_order
    check (current_period_end is null or current_period_end > current_period_start),
  constraint subscriptions_founder_fields
    check (
      (plan_id = 'founder' and founder_started_at is not null and founder_status is not null)
      or
      (plan_id <> 'founder' and founder_started_at is null and founder_status is null and founder_price_lock = false)
    ),
  constraint subscriptions_founder_lock_active
    check (founder_price_lock = false or (plan_id = 'founder' and founder_status = 'active'))
);

create unique index subscriptions_one_current_per_user
  on public.subscriptions(user_id)
  where status in ('active', 'past_due');

create index idx_subscriptions_user_created
  on public.subscriptions(user_id, created_at desc);

create index idx_subscriptions_founder_capacity
  on public.subscriptions(plan_id, founder_status, current_period_end)
  where plan_id = 'founder' and founder_price_lock = true;

create table public.subscription_events (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  event_type text not null
    check (event_type in ('activated', 'renewed', 'plan_changed', 'expired', 'cancelled', 'revoked', 'founder_price_lock_lost')),
  previous_status text,
  new_status text,
  actor_id uuid references public.profiles(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_subscription_events_subscription_created
  on public.subscription_events(subscription_id, created_at desc);

create index idx_subscription_events_user_created
  on public.subscription_events(user_id, created_at desc);

alter table public.subscriptions enable row level security;
alter table public.subscription_events enable row level security;

create policy "subscriptions_select_own_or_admin"
  on public.subscriptions for select
  using ((select auth.uid()) = user_id or public.is_admin());

create policy "subscription_events_select_own_or_admin"
  on public.subscription_events for select
  using ((select auth.uid()) = user_id or public.is_admin());

create function public.set_membership_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_membership_updated_at();

create trigger trg_plan_features_updated_at
  before update on public.plan_features
  for each row execute function public.set_membership_updated_at();

revoke execute on function public.set_membership_updated_at() from public, anon, authenticated;

-- Preserve paid access without guessing an expiry. These rows intentionally
-- have no current_period_end; an owner can normalize them later through an
-- explicit reviewed migration or admin workflow.
insert into public.subscriptions (
  user_id,
  plan_id,
  status,
  source,
  price_amount_thb,
  billing_interval,
  started_at,
  current_period_start,
  current_period_end
)
select
  p.id,
  p.plan,
  'active',
  'legacy',
  pl.price_amount_thb,
  pl.billing_interval,
  p.created_at,
  p.created_at,
  null
from public.profiles p
join public.plans pl on pl.id = p.plan
where p.plan <> 'free'
  and not exists (
    select 1 from public.subscriptions s
    where s.user_id = p.id and s.status in ('active', 'past_due')
  );

insert into public.subscription_events (
  subscription_id,
  user_id,
  plan_id,
  event_type,
  previous_status,
  new_status,
  metadata
)
select
  s.id,
  s.user_id,
  s.plan_id,
  'activated',
  null,
  'active',
  jsonb_build_object('source', 'legacy_backfill', 'preserved_without_expiry', true)
from public.subscriptions s
where s.source = 'legacy'
  and not exists (
    select 1 from public.subscription_events e
    where e.subscription_id = s.id and e.event_type = 'activated'
  );

alter table public.profiles
  add constraint profiles_plan_fkey
  foreign key (plan) references public.plans(id)
  not valid;

alter table public.profiles validate constraint profiles_plan_fkey;
