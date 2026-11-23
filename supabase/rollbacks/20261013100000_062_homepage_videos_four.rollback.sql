-- Rollback for 20261013100000_062_homepage_videos_four.sql
--
-- Deletes a 4th homepage video if one exists (it cannot exist under the old
-- 1..3 rule), restores the 1..3 check and the 3-item admin function, in one
-- transaction. Videos 1..3 are kept. Export the 4th first if it matters:
--   select * from public.homepage_videos where position = 4;
begin;
set local lock_timeout = '5s';

delete from public.homepage_videos where position > 3;

alter table public.homepage_videos drop constraint if exists homepage_videos_position_check;
alter table public.homepage_videos
  add constraint homepage_videos_position_check check (position between 1 and 3);

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
  if pg_catalog.jsonb_array_length(p_videos) > 3 then
    raise exception 'At most 3 homepage videos' using errcode = '22023';
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

commit;
