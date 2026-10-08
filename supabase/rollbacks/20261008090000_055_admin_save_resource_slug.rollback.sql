-- Rollback for 20261008090000_055_admin_save_resource_slug.sql
--
-- Puts migration 028's 16-argument public.admin_save_resource back (same text,
-- same grants) and removes the 17-argument one, in one transaction. No slug
-- that was already saved is touched; the unique index and format check from 053
-- stay. Stop editing the slug field in the admin console (or roll the console
-- back) first: with this file applied the database refuses a p_slug argument.
-- Re-applying migration 055 afterwards works.
begin;
set local lock_timeout = '5s';

drop function if exists public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[], text
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
  p_plan_ids text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
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

  if p_create then
    if exists (select 1 from public.resources where id = p_resource_id) then
      raise exception 'Resource already exists' using errcode = '23505';
    end if;
    insert into public.resources (
      id, title, meta, description, category, grade_levels, delivery_mode,
      cta_url, cover_image_url, file_path, file_name, file_size,
      file_mime_type, status, access_mode, created_by
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
      'draft', 'locked', (select auth.uid())
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
        file_mime_type = nullif(btrim(coalesce(p_file_mime_type, '')), '')
    where id = p_resource_id;
  end if;

  perform public.set_resource_access(p_resource_id, p_access_mode, p_plan_ids);
end;
$$;

revoke all on function public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[]
) from public, anon;
grant execute on function public.admin_save_resource(
  uuid, boolean, text, text, text, text, text[], text, text, text,
  text, text, bigint, text, text, text[]
) to authenticated;

commit;
