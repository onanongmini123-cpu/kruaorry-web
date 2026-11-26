-- 062: allow up to FOUR homepage videos (058 allowed three). ADDITIVE / RELAXING ONLY.
--
-- WHAT IT DOES
--   * homepage_videos.position check: 1..3  ->  1..4.
--   * admin_set_homepage_videos(jsonb): accepts up to 4 items (same validation).
--
-- WHAT IT DOES NOT TOUCH
--   Existing rows stay as they are (positions 1..3 remain valid). 058 is not edited.
--   Privileges are re-stated unchanged: admin-only function, public read-only table.
--
-- REQUIRES: 058 applied.
--
-- ROLLBACK
--   supabase/rollbacks/20261013100000_062_homepage_videos_four.rollback.sql
--   (deletes a 4th video if one exists, restores the 1..3 check and the 3-item function).
--
-- APPLY (not applied by this repository; run by the project owner)
--   supabase migration list; supabase db push --dry-run; staging first; then
--   supabase/verification/062-verify.sql.

set local lock_timeout = '5s';

do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_catalog.pg_constraint c
    where c.conrelid = 'public.homepage_videos'::regclass and c.contype = 'c'
      and pg_catalog.pg_get_constraintdef(c.oid) ilike '%position%'
  loop
    execute pg_catalog.format('alter table public.homepage_videos drop constraint %I', v_name);
  end loop;
end
$$;

alter table public.homepage_videos
  add constraint homepage_videos_position_check check (position between 1 and 4);

create or replace function public.admin_set_homepage_videos(p_videos jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_index integer := 0;
  v_video text;
  v_title text;
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if p_videos is null or pg_catalog.jsonb_typeof(p_videos) <> 'array' then
    raise exception 'Videos must be a JSON array' using errcode = '22023';
  end if;
  if pg_catalog.jsonb_array_length(p_videos) > 4 then
    raise exception 'At most 4 homepage videos' using errcode = '22023';
  end if;

  delete from public.homepage_videos where true;
  for v_item in select value from pg_catalog.jsonb_array_elements(p_videos) loop
    v_index := v_index + 1;
    v_video := pg_catalog.btrim(coalesce(v_item ->> 'videoId', ''));
    v_title := nullif(pg_catalog.btrim(coalesce(v_item ->> 'title', '')), '');
    if v_video !~ '^[A-Za-z0-9_-]{11}$' then
      raise exception 'Invalid YouTube video id at position %', v_index using errcode = '22023';
    end if;
    insert into public.homepage_videos (position, youtube_video_id, title)
    values (v_index, v_video, v_title);
  end loop;
end;
$$;

revoke all on function public.admin_set_homepage_videos(jsonb) from public, anon;
grant execute on function public.admin_set_homepage_videos(jsonb) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.admin_set_homepage_videos(jsonb)', 'execute') then
    raise exception '062: anon must not execute admin_set_homepage_videos';
  end if;
  if has_table_privilege('anon', 'public.homepage_videos', 'insert')
     or has_table_privilege('authenticated', 'public.homepage_videos', 'update')
     or has_table_privilege('authenticated', 'public.homepage_videos', 'delete') then
    raise exception '062: homepage_videos must stay read-only for browser roles';
  end if;
end
$$;
