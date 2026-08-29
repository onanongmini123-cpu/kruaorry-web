create table public.saved_resources (
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, resource_id)
);

alter table public.saved_resources enable row level security;

create policy "saved_resources_own"
  on public.saved_resources for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
