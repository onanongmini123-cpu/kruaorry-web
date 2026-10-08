-- 055: let an admin set a resource's readable address (slug) when saving it.
--
-- PURPOSE
--   Migration 053 added resources.slug, but nothing in the admin console could
--   set it: a resource published after 053 kept its UUID address until someone
--   ran an UPDATE by hand. This file adds an optional `p_slug` parameter to the
--   admin save function so the admin form can set it, with the same rules the
--   database enforces on the column.
--
-- FORWARD BEHAVIOUR (public.admin_save_resource, SECURITY DEFINER)
--   * New last parameter `p_slug text default null`.
--       null or blank  -> keep the slug the row already has (create: no slug)
--       a value        -> trimmed, then it must be 3 to 80 characters of
--                         lowercase ASCII letters and digits joined by single
--                         hyphens and must not look like a UUID; it must also
--                         be free (another row using it is refused). Setting
--                         the same slug a row already has is accepted.
--     A slug can not be cleared through this function (blank means "no
--     change"); clear one with SQL if that is ever needed.
--   * Errors the admin form shows in Thai:
--       'Resource slug is invalid'     errcode 22023
--       'Resource slug is already in use'  errcode 23505
--   * Everything else in the function is migration 028's, unchanged: the
--     is_admin() gate, id and title checks, the create/update paths, the row
--     lock on update and the access-policy call.
--
-- SECURITY
--   * Still SECURITY DEFINER with search_path = '' and fully qualified names.
--   * Privileges are exactly 028's: EXECUTE for authenticated only (revoked
--     from PUBLIC and anon), and the first statement is the is_admin() check,
--     so a signed-in non-admin is refused with 42501 before anything is read.
--   * The slug format and the unique index from 053 remain the last line of
--     defence; the checks here only give a readable error first.
--
-- BACKWARD COMPATIBILITY
--   * Adding a parameter creates a NEW signature. PostgREST can not choose
--     between two overloads when the optional argument is omitted, so the old
--     16-argument function is dropped in the same transaction and nothing is
--     ever left with two. Callers that omit p_slug (the admin console before
--     this change) keep working through the default.
--   * Application order: apply this file BEFORE deploying an admin console that
--     sends p_slug. The new console only sends p_slug when the field was
--     changed, so an older database still saves everything else.
--
-- LOCKING
--   One transaction. DROP FUNCTION and CREATE FUNCTION take brief catalogue
--   locks; no table is locked or rewritten. lock_timeout is set so this file
--   stops and can be retried instead of waiting behind a long transaction.
--
-- DATA RISK
--   None. No row is read or written. Only the function definition changes.
--
-- DEPLOYMENT ORDER
--   1. Migration 053 must already be applied (this file stops otherwise).
--   2. Compare the live function with migration 028 before replacing it:
--        select pg_get_functiondef(
--          'public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[])'::regprocedure);
--   3. Apply to the staging database first; run supabase/verification/055-verify.sql
--      and save a resource with and without a slug from the admin console.
--   4. Apply to production, run 055-verify.sql, then deploy the admin console.
--
-- ROLLBACK
--   supabase/rollbacks/20261008090000_055_admin_save_resource_slug.rollback.sql
--   puts migration 028's 16-argument function back (one transaction, tested by
--   `npm run test:admin-save-slug-sql`). No slug already saved is touched. Roll
--   the admin console back first or stop editing the slug field: an older
--   database refuses a p_slug argument.

set local lock_timeout = '5s';

-- Stop, changing nothing, unless the database is the one this file was written
-- for: slug column present (053) and exactly one admin_save_resource (028 or
-- this file's own result on a re-run).
do $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from pg_attribute attribute
    where attribute.attrelid = to_regclass('public.resources')
      and attribute.attname = 'slug'
      and not attribute.attisdropped
  ) then
    raise exception '055: public.resources.slug does not exist. Apply migration 053 first.';
  end if;

  select count(*) into v_count
  from pg_proc proc
  join pg_namespace nsp on nsp.oid = proc.pronamespace
  where nsp.nspname = 'public' and proc.proname = 'admin_save_resource';

  if v_count <> 1 then
    raise exception '055: expected exactly one public.admin_save_resource (migration 028), found %. Compare the live database with the migrations before applying.', v_count;
  end if;

  if to_regprocedure('public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[])') is null
     and to_regprocedure('public.admin_save_resource(uuid, boolean, text, text, text, text, text[], text, text, text, text, text, bigint, text, text, text[], text)') is null then
    raise exception '055: public.admin_save_resource has a signature this file does not recognise. Compare the live database with migration 028 before applying.';
  end if;
end
$$;

drop function if exists public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[]
);

-- Save the resource row and its access policy in one database transaction.
-- Storage uploads are intentionally orchestrated by the browser, but a failed
-- access validation must never leave newly edited content under stale access.
create or replace function public.admin_save_resource(
  p_resource_id uuid,
  p_create boolean,
  p_title text,
  p_meta text,
  p_description text,
  p_category text,
  p_grade_levels text[],
  p_delivery_mode text,
  p_cta_url text,
  p_cover_image_url text,
  p_file_path text,
  p_file_name text,
  p_file_size bigint,
  p_file_mime_type text,
  p_access_mode text,
  p_plan_ids text[],
  p_slug text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_slug text := nullif(btrim(coalesce(p_slug, '')), '');
  v_constraint text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_resource_id is null then
    raise exception 'Resource id is required' using errcode = '22023';
  end if;
  if char_length(v_title) < 1 or char_length(v_title) > 200 then
    raise exception 'Resource title must contain 1 to 200 characters' using errcode = '22023';
  end if;

  if v_slug is not null then
    -- Same rules as resources_slug_format (053) and src/lib/resourceSlug.ts.
    if char_length(v_slug) not between 3 and 80
       or v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
       or v_slug ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'Resource slug is invalid' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.resources
      where slug = v_slug and id <> p_resource_id
    ) then
      raise exception 'Resource slug is already in use' using errcode = '23505';
    end if;
  end if;

  begin
    if p_create then
      if exists (select 1 from public.resources where id = p_resource_id) then
        raise exception 'Resource already exists' using errcode = '23505';
      end if;
      insert into public.resources (
        id, title, meta, description, category, grade_levels, delivery_mode,
        cta_url, cover_image_url, file_path, file_name, file_size,
        file_mime_type, status, access_mode, created_by, slug
      ) values (
        p_resource_id, v_title, nullif(btrim(coalesce(p_meta, '')), ''),
        nullif(btrim(coalesce(p_description, '')), ''),
        nullif(btrim(coalesce(p_category, '')), ''),
        coalesce(p_grade_levels, '{}'::text[]), p_delivery_mode,
        nullif(btrim(coalesce(p_cta_url, '')), ''),
        nullif(btrim(coalesce(p_cover_image_url, '')), ''),
        nullif(btrim(coalesce(p_file_path, '')), ''),
        nullif(btrim(coalesce(p_file_name, '')), ''), p_file_size,
        nullif(btrim(coalesce(p_file_mime_type, '')), ''),
        'draft', 'locked', (select auth.uid()), v_slug
      );
    else
      perform 1 from public.resources where id = p_resource_id for update;
      if not found then
        raise exception 'Resource not found' using errcode = 'P0002';
      end if;
      update public.resources
      set title = v_title,
          meta = nullif(btrim(coalesce(p_meta, '')), ''),
          description = nullif(btrim(coalesce(p_description, '')), ''),
          category = nullif(btrim(coalesce(p_category, '')), ''),
          grade_levels = coalesce(p_grade_levels, '{}'::text[]),
          delivery_mode = p_delivery_mode,
          cta_url = nullif(btrim(coalesce(p_cta_url, '')), ''),
          cover_image_url = nullif(btrim(coalesce(p_cover_image_url, '')), ''),
          file_path = nullif(btrim(coalesce(p_file_path, '')), ''),
          file_name = nullif(btrim(coalesce(p_file_name, '')), ''),
          file_size = p_file_size,
          file_mime_type = nullif(btrim(coalesce(p_file_mime_type, '')), ''),
          slug = coalesce(v_slug, slug)
      where id = p_resource_id;
    end if;
  exception
    when unique_violation then
      -- Two admins saving the same slug at once: the unique index decides.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'resources_slug_key' then
        raise exception 'Resource slug is already in use' using errcode = '23505';
      end if;
      raise;
  end;

  perform public.set_resource_access(p_resource_id, p_access_mode, p_plan_ids);
end;
$$;

revoke all on function public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[], text
) from public, anon;
grant execute on function public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[], text
) to authenticated;
