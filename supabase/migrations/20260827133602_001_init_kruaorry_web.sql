-- Profiles: one row per authenticated user, created automatically on signup.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('member', 'admin')),
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (
    auth.uid() = id
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Plans: pricing tiers shown on the landing page. Public read.
create table public.plans (
  id text primary key,
  name text not null,
  price_label text not null,
  note text,
  features text[] not null default '{}',
  sort_order int not null default 0
);

alter table public.plans enable row level security;

create policy "plans_public_read"
  on public.plans for select
  using (true);

-- Resources: the innovations members can open. draft/published/archived per delivery mode.
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  meta text,
  description text,
  category text,
  delivery_mode text not null check (delivery_mode in ('web_app', 'google_template', 'google_form')),
  cta_url text,
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.resources enable row level security;

create policy "resources_public_read_published"
  on public.resources for select
  using (
    status = 'published'
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "resources_admin_write"
  on public.resources for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Requests: feature/content requests teachers can raise, admins triage.
create table public.requests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  requested_by uuid references public.profiles(id),
  votes int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  created_at timestamptz not null default now()
);

alter table public.requests enable row level security;

create policy "requests_read_all_members"
  on public.requests for select
  using (auth.uid() is not null);

create policy "requests_insert_own"
  on public.requests for insert
  with check (auth.uid() = requested_by);

create policy "requests_admin_update"
  on public.requests for update
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
