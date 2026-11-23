-- 061: homepage promo banners that staff manage from the admin console.
-- ADDITIVE ONLY.
--
-- PURPOSE
--   public.promo_banners: up to 6 slides for the banner carousel above the
--   featured resources on the homepage. Each slide is a desktop picture, an
--   optional phone picture, an optional link, a required alt text, an on/off
--   switch and an optional start/end date. No row = the homepage hides the section.
--
-- WHAT IT DOES NOT TOUCH
--   No existing table, view, policy, price, plan or access rule changes.
--
-- SECURITY
--   * RLS on. Everyone (anon and signed in) can read ONLY rows that are switched
--     on and inside their date window. Staff (is_admin) can read every row.
--   * No browser role has INSERT/UPDATE/DELETE. Staff write through
--     admin_set_promo_banners(jsonb), SECURITY DEFINER, first statement is the
--     is_admin() gate, replaces the whole list in one transaction.
--   * Pictures must live in the public resource-covers bucket under banners/.
--     A link is a site path that starts with "/" or an https:// address.
--     javascript:, data: and http:// are refused by CHECK constraints.
--
-- DEPLOY-SAFE ORDER
--   The application reads this table defensively: before this migration (or on
--   any failure) there are simply no banners and the section is hidden.
--
-- ROLLBACK
--   supabase/rollbacks/20261013090000_061_promo_banners.rollback.sql
--   (drops the function and the table; stored banner rows are discarded, the
--   picture files in Storage are not touched).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; apply to a Preview or
--   staging database first; then run supabase/verification/061-verify.sql.

set local lock_timeout = '5s';

create table if not exists public.promo_banners (
  position smallint primary key check (position between 1 and 6),
  image_url text not null
    check (char_length(image_url) <= 500
      and image_url ~ '^https://[^/\s]+/storage/v1/object/public/resource-covers/banners/\S+$'),
  image_mobile_url text
    check (image_mobile_url is null
      or (char_length(image_mobile_url) <= 500
        and image_mobile_url ~ '^https://[^/\s]+/storage/v1/object/public/resource-covers/banners/\S+$')),
  link_url text
    check (link_url is null
      or (char_length(link_url) <= 500
        and (link_url ~ '^/[A-Za-z0-9]\S*$' or link_url ~ '^https://[A-Za-z0-9]\S*$'))),
  alt_text text not null check (char_length(btrim(alt_text)) between 1 and 160),
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint promo_banners_window_order check (starts_at is null or ends_at is null or ends_at > starts_at)
);

alter table public.promo_banners enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promo_banners' and policyname = 'promo_banners_public_read') then
    create policy promo_banners_public_read
      on public.promo_banners for select
      to anon, authenticated
      using (
        is_active
        and (starts_at is null or starts_at <= now())
        and (ends_at is null or ends_at > now())
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'promo_banners' and policyname = 'promo_banners_admin_read') then
    create policy promo_banners_admin_read
      on public.promo_banners for select
      to authenticated
      using (public.is_admin());
  end if;
end
$$;

revoke all on public.promo_banners from public, anon, authenticated;
grant select on public.promo_banners to anon, authenticated;

-- Replaces the whole list in one transaction. p_banners is a JSON array of at
-- most 6 objects: {"imageUrl","imageMobileUrl","linkUrl","altText","isActive","startsAt","endsAt"}.
-- Order in the array = position 1, 2, 3 ...
create or replace function public.admin_set_promo_banners(p_banners jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_index integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_banners is null or pg_catalog.jsonb_typeof(p_banners) <> 'array' then
    raise exception 'Banners must be a JSON array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_banners) > 6 then
    raise exception 'At most 6 banners' using errcode = '22023';
  end if;

  delete from public.promo_banners where true;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_banners) loop
    v_index := v_index + 1;
    insert into public.promo_banners (position, image_url, image_mobile_url, link_url, alt_text, is_active, starts_at, ends_at)
    values (
      v_index,
      pg_catalog.btrim(coalesce(v_item ->> 'imageUrl', '')),
      nullif(pg_catalog.btrim(coalesce(v_item ->> 'imageMobileUrl', '')), ''),
      nullif(pg_catalog.btrim(coalesce(v_item ->> 'linkUrl', '')), ''),
      pg_catalog.btrim(coalesce(v_item ->> 'altText', '')),
      coalesce((v_item ->> 'isActive')::boolean, true),
      nullif(v_item ->> 'startsAt', '')::timestamptz,
      nullif(v_item ->> 'endsAt', '')::timestamptz
    );
  end loop;
end;
$$;

revoke all on function public.admin_set_promo_banners(jsonb) from public, anon;
grant execute on function public.admin_set_promo_banners(jsonb) to authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.promo_banners', 'insert')
     or has_table_privilege('authenticated', 'public.promo_banners', 'insert')
     or has_table_privilege('authenticated', 'public.promo_banners', 'update')
     or has_table_privilege('authenticated', 'public.promo_banners', 'delete') then
    raise exception '061: promo_banners must be read-only for browser roles';
  end if;
  if has_function_privilege('anon', 'public.admin_set_promo_banners(jsonb)', 'execute') then
    raise exception '061: anon must not execute admin_set_promo_banners';
  end if;
end
$$;
