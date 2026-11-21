-- 061: optional "try it / preview" link (demo) for a resource, kept apart from the full version.
--
-- PURPOSE
--   Let the owner attach a public demo URL (for example on games.kruaorry.com)
--   to any resource. The public detail page shows a "ทดลองเล่น" button to
--   everybody when a demo exists. The full version is NOT affected: cta_url,
--   file_path, access_mode, plan access, resolve_resource_target, the open and
--   download routes and the resource-files Storage policy are all untouched.
--
-- WHAT IT DOES
--   * public.resources.demo_url (nullable text), a format CHECK, and a CHECK that
--     the demo is never the full version's own address (human-error guard so a
--     Pro link cannot be pasted into the public field).
--   * public.resource_demo_url_is_safe(text): the single rule set, mirrored by
--     src/lib/resourceDemoUrl.ts (both are run against demo-url-corpus.json).
--     https only; no userinfo or port; a real dotted public host; no localhost,
--     IP, *.local/*.internal/*.test, example.*, or Preview/tunnel hosts
--     (vercel.app, pages.dev, workers.dev, trycloudflare.com, ngrok, loca.lt).
--   * public.admin_set_resource_demo(uuid, text): admin-only setter (blank clears).
--     A separate function on purpose: admin_save_resource keeps its signature, so
--     there is no overload to manage and an older database still saves everything
--     else.
--   * public.resource_demo_catalog (security_barrier view): (resource_id,
--     demo_url) of PUBLISHED resources only. resource_catalog is NOT touched.
--   * SELECT on the demo_url column for authenticated only (admin console).
--
-- NUMBERING / ORDER
--   Written against main (057). origin has unmerged 058 (youtube video), 059
--   (previews), 060 (homepage rankings) on release/pro-features-batch-1, and a
--   different 058/059 (accounting) on claude/wonderful-planck-dixufx. This file is
--   numbered 061 and touches none of their objects, so it can be applied before or
--   after any of them. The owner must still renumber whichever file loses the
--   race for 058/059 before merging.
--
-- WHAT IT DOES NOT DO
--   * No new Storage bucket or policy. A downloadable sample file is NOT part of
--     this migration: resource-files is private and entitlement-gated, and
--     reusing it publicly would loosen that gate. See docs/resource-demo-preview.md.
--   * No change to plans, prices, memberships or any existing function/policy.
--
-- APPLY (not applied by this repository; run by the project owner)
--   Preview/staging database first, run supabase/verification/061-verify.sql, then
--   production. Apply BEFORE deploying an admin console that sends the demo; the
--   console and the public page both work (without a demo) on a database without it.
--
-- ROLLBACK
--   supabase/rollbacks/20261010090000_061_resource_demo_url.rollback.sql
--   (drops the view, function, constraints and column; any saved
--   demo URLs are lost - they are not part of the full version).

set local lock_timeout = '5s';

do $$
begin
  if pg_catalog.to_regclass('public.resources') is null then
    raise exception '061: public.resources is missing. Apply the preceding migration chain first.';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = pg_catalog.to_regclass('public.resources') and a.attname = 'slug' and not a.attisdropped
  ) then
    raise exception '061: public.resources.slug is missing. Apply migration 053 first.';
  end if;
  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception '061: public.is_admin() is missing.';
  end if;
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('admin_set_resource_demo', 'resource_demo_url_is_safe')
      and p.oid not in (
        coalesce(pg_catalog.to_regprocedure('public.admin_set_resource_demo(uuid, text)'), 0::oid),
        coalesce(pg_catalog.to_regprocedure('public.resource_demo_url_is_safe(text)'), 0::oid)
      )
  ) then
    raise exception '061: an unexpected overload of the demo functions exists. Review it before applying.';
  end if;
end
$$;

alter table public.resources add column if not exists demo_url text;

create or replace function public.resource_demo_url_is_safe(p_url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_url is not null
    and pg_catalog.char_length(p_url) <= 2048
    and pg_catalog.strpos(pg_catalog.lower(p_url), 'placeholder') = 0
    and p_url ~ '^https://((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:[/?#][^\s\\]*)?$'
    and pg_catalog.lower((pg_catalog.regexp_match(p_url, '^https://([^/?#]+)'))[1]) !~
      '(^|\.)(example\.(com|org|net)|vercel\.app|pages\.dev|workers\.dev|trycloudflare\.com|ngrok\.io|ngrok-free\.app|loca\.lt)$|\.(local|localhost|internal|invalid|test|example|lan|home|corp|intranet)$';
$$;

-- Pure function over its argument: it reads no table and grants no data access,
-- so the default PUBLIC execute (needed to evaluate the CHECK for any writer) is kept.

alter table public.resources drop constraint if exists resources_demo_url_safe;
alter table public.resources add constraint resources_demo_url_safe
  check (demo_url is null or public.resource_demo_url_is_safe(demo_url));

alter table public.resources drop constraint if exists resources_demo_differs_from_full;
alter table public.resources add constraint resources_demo_differs_from_full
  check (
    demo_url is null
    or cta_url is null
    or pg_catalog.lower(pg_catalog.rtrim(demo_url, '/')) <> pg_catalog.lower(pg_catalog.rtrim(btrim(cta_url), '/'))
  );

create or replace function public.admin_set_resource_demo(p_resource_id uuid, p_demo_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text := nullif(btrim(coalesce(p_demo_url, '')), '');
  v_cta text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_resource_id is null then
    raise exception 'Resource id is required' using errcode = '22023';
  end if;
  if v_url is not null and not public.resource_demo_url_is_safe(v_url) then
    raise exception 'Resource demo URL is invalid' using errcode = '22023';
  end if;

  select r.cta_url into v_cta from public.resources r where r.id = p_resource_id for update;
  if not found then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;
  if v_url is not null and v_cta is not null
     and pg_catalog.lower(pg_catalog.rtrim(v_url, '/')) = pg_catalog.lower(pg_catalog.rtrim(btrim(v_cta), '/')) then
    raise exception 'Resource demo URL must differ from the full version URL' using errcode = '22023';
  end if;

  update public.resources set demo_url = v_url where id = p_resource_id;
end;
$$;

revoke all on function public.admin_set_resource_demo(uuid, text) from public, anon;
grant execute on function public.admin_set_resource_demo(uuid, text) to authenticated;

-- Migration 023 replaced table-wide SELECT with column grants; a new column does
-- not inherit them. Only signed-in users get the column on the table itself (the
-- admin console reads it; RLS still limits non-admins to published rows). The
-- public reads demos through resource_demo_catalog below.
revoke select (demo_url) on public.resources from public, anon;
grant select (demo_url) on public.resources to authenticated;

-- A separate, tiny public view instead of a new column on resource_catalog:
-- other unmerged work (061-060) also changes resource_catalog, and two files
-- that each CREATE OR REPLACE that view cannot be applied in both orders.
-- The page joins the two reads by resource id in the application.
create or replace view public.resource_demo_catalog
with (security_barrier = true) as
select r.id as resource_id, r.demo_url
from public.resources r
where r.status = 'published'
  and r.demo_url is not null;

revoke all on public.resource_demo_catalog from public;
revoke insert, update, delete, truncate on public.resource_demo_catalog from anon, authenticated;
grant select on public.resource_demo_catalog to anon, authenticated;

do $$
begin
  if has_table_privilege('anon', 'public.resource_demo_catalog', 'insert')
     or has_table_privilege('authenticated', 'public.resource_demo_catalog', 'update') then
    raise exception '061: resource_demo_catalog must stay read-only for browser roles';
  end if;
  if has_column_privilege('anon', 'public.resources', 'cta_url', 'select')
     or has_column_privilege('authenticated', 'public.resources', 'cta_url', 'select')
     or has_column_privilege('anon', 'public.resources', 'file_path', 'select')
     or has_column_privilege('authenticated', 'public.resources', 'file_path', 'select') then
    raise exception '061: cta_url/file_path must stay unreadable for browser roles';
  end if;
end
$$;

