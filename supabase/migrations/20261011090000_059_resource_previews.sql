-- 059: watermarked preview images for Pro resources ("try before you buy").
-- ADDITIVE ONLY.
--
-- PURPOSE
--   Let a visitor who cannot open a Pro file, template or game see a few
--   watermarked preview images (the watermark "KruAorry.com – ตัวอย่าง" is
--   burned into the picture by the admin console before upload). The real
--   destination (cta_url / file_path) is never part of any object created here.
--
-- WHAT IT ADDS
--   * public.resource_previews (resource_id, position 1..6, image_url): RLS on,
--     no browser write privilege, readable directly only by admins.
--   * public.resource_preview_catalog: security_barrier view for everyone, with
--     ONLY (resource_id, position, image_url) of PUBLISHED resources whose access
--     mode is 'plans'. A draft, a free resource or a locked one exposes nothing.
--   * public.admin_set_resource_previews(uuid, jsonb): admin-only; replaces the
--     preview list of one resource (at most 6 https URLs that live in the
--     previews folder of the public resource-covers bucket).
--
-- WHAT IT DOES NOT TOUCH
--   resource_catalog, admin_save_resource, plans, prices, access rules and every
--   existing row stay exactly as they are. Existing resources have no previews
--   and render as before. No existing column or policy is changed.
--
-- DEPLOY-SAFE ORDER
--   The application reads the view defensively: if it does not exist yet the app
--   shows no previews and no "ทดลองได้" badge, so it can be deployed before or
--   after this file.
--
-- ROLLBACK
--   supabase/rollbacks/20261011090000_059_resource_previews.rollback.sql
--   (drops the function, view and table; stored preview URLs are discarded, the
--   image files in Storage are not touched).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; apply to a Preview or
--   staging database first; then run supabase/verification/059-verify.sql.

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception '059: public.is_admin() is missing.';
  end if;
  if pg_catalog.to_regclass('public.resources') is null then
    raise exception '059: public.resources is missing.';
  end if;
end
$$;

create table if not exists public.resource_previews (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  position smallint not null check (position between 1 and 6),
  image_url text not null check (
    char_length(image_url) <= 500
    and image_url ~ '^https://[^/]+/storage/v1/object/public/resource-covers/previews/'
  ),
  created_at timestamptz not null default now(),
  unique (resource_id, position)
);

alter table public.resource_previews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'resource_previews'
      and policyname = 'resource_previews_admin_read'
  ) then
    create policy resource_previews_admin_read
      on public.resource_previews for select
      to authenticated
      using (public.is_admin());
  end if;
end
$$;

revoke all on public.resource_previews from public, anon, authenticated;
grant select on public.resource_previews to authenticated;

create or replace view public.resource_preview_catalog
with (security_barrier = true) as
select p.resource_id, p.position, p.image_url
from public.resource_previews p
join public.resources r on r.id = p.resource_id
where r.status = 'published'
  and r.access_mode = 'plans';

revoke all on public.resource_preview_catalog from public;
revoke insert, update, delete, truncate on public.resource_preview_catalog from anon, authenticated;
grant select on public.resource_preview_catalog to anon, authenticated;

create or replace function public.admin_set_resource_previews(
  p_resource_id uuid,
  p_urls jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_urls is null or pg_catalog.jsonb_typeof(p_urls) <> 'array' then
    raise exception 'Previews must be a JSON array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_urls) > 6 then
    raise exception 'At most 6 previews' using errcode = '22023';
  end if;
  if not exists (select 1 from public.resources where id = p_resource_id) then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;

  delete from public.resource_previews where resource_id = p_resource_id;
  for v_url in select pg_catalog.jsonb_array_elements_text(p_urls) loop
    v_index := v_index + 1;
    -- The table CHECK is the format authority; its error is the caller's answer.
    insert into public.resource_previews (resource_id, position, image_url)
    values (p_resource_id, v_index, v_url);
  end loop;
end;
$$;

revoke all on function public.admin_set_resource_previews(uuid, jsonb) from public, anon;
grant execute on function public.admin_set_resource_previews(uuid, jsonb) to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.resource_previews', 'select')
     or has_table_privilege('anon', 'public.resource_previews', 'insert')
     or has_table_privilege('authenticated', 'public.resource_previews', 'insert')
     or has_table_privilege('authenticated', 'public.resource_previews', 'update')
     or has_table_privilege('authenticated', 'public.resource_previews', 'delete') then
    raise exception '059: resource_previews must be read-only (admins only) for browser roles';
  end if;
  if has_table_privilege('anon', 'public.resource_preview_catalog', 'insert')
     or has_table_privilege('authenticated', 'public.resource_preview_catalog', 'update') then
    raise exception '059: resource_preview_catalog must be read-only';
  end if;
  if has_function_privilege('anon', 'public.admin_set_resource_previews(uuid, jsonb)', 'execute') then
    raise exception '059: anon must not execute admin_set_resource_previews';
  end if;
end
$$;
