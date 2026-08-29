create table public.upgrade_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.upgrade_requests enable row level security;

create policy "upgrade_requests_select_own_or_admin"
  on public.upgrade_requests for select
  using ((select auth.uid()) = user_id or public.is_admin());

create policy "upgrade_requests_insert_own"
  on public.upgrade_requests for insert
  with check ((select auth.uid()) = user_id);

create policy "upgrade_requests_admin_update"
  on public.upgrade_requests for update
  using (public.is_admin())
  with check (public.is_admin());

create index idx_upgrade_requests_user_id on public.upgrade_requests(user_id);
