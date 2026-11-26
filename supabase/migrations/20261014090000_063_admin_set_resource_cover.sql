-- 063: admin_set_resource_cover(resource_id, cover_url) changes ONE column of ONE
-- resource: cover_image_url. ADDITIVE ONLY (one new function).
--
-- WHY
--   The admin tool "บีบอัดรูปปกเดิม" must swap about 65 cover links. Doing that with
--   admin_save_resource would re-send every field of every resource and rewrite
--   each resource's plan-access rows. This function touches nothing else.
--
-- WHAT IT CHECKS (in this order)
--   1. caller is an admin or owner (is_admin());
--   2. the resource exists;
--   3. the URL is https://<host>/storage/v1/object/public/resource-covers/<path>
--      with no spaces, at most 500 characters, <path> made of letters, digits . _ - /;
--   4. an object with exactly that <path> exists in THIS project's resource-covers
--      bucket (storage.objects). This is what ties the link to this project.
--
-- WHAT IT NEVER TOUCHES
--   status, published_at, slug, access mode/plans, featured order, file fields,
--   title/description, any other row. resources has no updated_at column and no
--   trigger (checked in the migrations and read-only on staging), so nothing else
--   changes as a side effect.
--
-- A published resource must keep a cover (resources_publish_requires_type_target),
-- so an empty URL is refused; use the resource form to remove a cover.
--
-- ROLLBACK
--   supabase/rollbacks/20261014090000_063_admin_set_resource_cover.rollback.sql
--   (drops the function; covers already changed keep their new links, which is
--   what the tool's own "ย้อนกลับ" button / CSV backup is for).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; staging first; then
--   supabase/verification/063-verify.sql.

set local lock_timeout = '5s';

create or replace function public.admin_set_resource_cover(p_resource_id uuid, p_cover_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_path text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_resource_id is null then
    raise exception 'Resource id is required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.resources where id = p_resource_id) then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;
  if p_cover_url is null
     or pg_catalog.char_length(p_cover_url) > 500
     or p_cover_url !~ '^https://[^/[:space:]]+/storage/v1/object/public/resource-covers/[^[:space:]]+$' then
    raise exception 'Cover must be a public resource-covers link' using errcode = '22023';
  end if;

  v_path := (pg_catalog.regexp_match(p_cover_url, '/storage/v1/object/public/resource-covers/(.*)$'))[1];
  -- Object names uploaded by the admin console only use letters, digits, "." "_" "-" and "/".
  -- Anything else (for example a percent-encoded name) is refused rather than guessed at.
  if v_path is null or v_path !~ '^[A-Za-z0-9._/-]+$' or v_path like '%..%' or not exists (
    select 1 from storage.objects o where o.bucket_id = 'resource-covers' and o.name = v_path
  ) then
    raise exception 'Cover file not found in resource-covers' using errcode = '22023';
  end if;

  update public.resources set cover_image_url = p_cover_url where id = p_resource_id;
end;
$$;

revoke all on function public.admin_set_resource_cover(uuid, text) from public, anon;
grant execute on function public.admin_set_resource_cover(uuid, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.admin_set_resource_cover(uuid, text)', 'execute') then
    raise exception '063: anon must not execute admin_set_resource_cover';
  end if;
end
$$;
