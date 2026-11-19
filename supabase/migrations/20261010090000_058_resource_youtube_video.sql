-- 058: optional "how to play" YouTube video per resource, and up to three
-- videos for the homepage. ADDITIVE ONLY.
--
-- PURPOSE
--   * public.resources.youtube_video_id: the 11-character YouTube video id of a
--     how-to-play video (nullable; most resources never have one).
--   * public.homepage_videos: at most three admin-chosen videos for the
--     homepage section "วิดีโอแนะนำ" (empty table = the section is hidden).
--
-- WHAT IT DOES NOT TOUCH
--   No existing row, column, policy, price, plan or access rule is changed.
--   Existing resources keep youtube_video_id = NULL and render exactly as before.
--   admin_save_resource is NOT modified (no new overload); the video is saved by
--   its own small admin RPC.
--
-- FORWARD BEHAVIOUR
--   * resources.youtube_video_id text null, CHECK ^[A-Za-z0-9_-]{11}$.
--   * resource_catalog gains youtube_video_id as its LAST column (after slug).
--     The definition is migration 053's, unchanged apart from that column.
--   * authenticated may SELECT the new column (like slug in 055) so the admin
--     list can read it; anon cannot read it from the table (the public reads it
--     through resource_catalog, as it does every other public field).
--   * admin_set_resource_video(uuid, text): SECURITY DEFINER, first statement is
--     the is_admin() gate, validates the id, updates one column of one row.
--   * homepage_videos(position 1..3, youtube_video_id, title): RLS on, public
--     SELECT only, no browser write privilege. admin_set_homepage_videos(jsonb)
--     (admin only) replaces the whole list atomically.
--
-- DEPLOY-SAFE ORDER
--   The application reads youtube_video_id and homepage_videos defensively: if
--   either is missing it behaves as before (no video, no homepage section). So
--   the application can be deployed before or after this file.
--
-- LOCKING
--   One transaction. ADD COLUMN (nullable, no default) and the CHECK hold a short
--   lock on public.resources and never rewrite it. lock_timeout makes the file
--   stop and be retried instead of queueing readers behind it.
--
-- ROLLBACK
--   supabase/rollbacks/20261010090000_058_resource_youtube_video.rollback.sql
--   (one transaction; keeps resource_catalog compatible by leaving an always-NULL
--   youtube_video_id column, because two saved_resources policies depend on the
--   view). Do NOT drop and recreate resource_catalog by hand.
--
-- APPLY (not applied by this repository; run by the project owner)
--   1. supabase migration list; confirm 057 is applied.
--   2. Compare the live view: select pg_get_viewdef('public.resource_catalog'::regclass, true);
--      (this file also stops with a message if the column list differs).
--   3. supabase db push --dry-run, apply to a Preview/staging database first.
--   4. Apply to production, then run supabase/verification/058-verify.sql.

set local lock_timeout = '5s';

do $$
declare
  v_expected text[] := array[
    'id', 'title', 'meta', 'description', 'category', 'delivery_mode',
    'cover_image_url', 'tags', 'is_free', 'file_size', 'status', 'published_at',
    'created_at', 'grade_levels', 'required_plan_names', 'is_new', 'access_mode',
    'required_plan_ids', 'featured_rank', 'review_average', 'review_count', 'slug'
  ];
  v_actual text[];
  v_barrier boolean;
begin
  if pg_catalog.to_regprocedure('public.is_admin()') is null then
    raise exception '058: public.is_admin() is missing.';
  end if;
  select array_agg(attribute.attname order by attribute.attnum)
    into v_actual
  from pg_attribute attribute
  where attribute.attrelid = 'public.resource_catalog'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped;
  if v_actual is distinct from v_expected and v_actual is distinct from v_expected || array['youtube_video_id'] then
    raise exception '058: public.resource_catalog has columns % but this file was written against % (migration 053). Compare pg_get_viewdef before applying.',
      v_actual, v_expected;
  end if;
  select coalesce('security_barrier=true' = any (class.reloptions), false)
    into v_barrier
  from pg_class class
  where class.oid = 'public.resource_catalog'::regclass;
  if not v_barrier then
    raise exception '058: public.resource_catalog is not a security_barrier view as in migration 053';
  end if;
end
$$;

alter table public.resources
  add column if not exists youtube_video_id text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'resources_youtube_video_id_format'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_youtube_video_id_format
      check (youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$');
  end if;
end
$$;

-- Migration 023 replaced table-wide SELECT with column-level grants; a column
-- added later does not inherit them (see 055 for slug). The id is public
-- information (it is shown on the public page), but keep anon closed on the
-- table and let only the authenticated admin list read it directly.
revoke select (youtube_video_id) on public.resources from public, anon;
grant select (youtube_video_id) on public.resources to authenticated;

create or replace view public.resource_catalog
with (security_barrier = true) as
select
  r.id,
  r.title,
  r.meta,
  r.description,
  r.category,
  r.delivery_mode,
  r.cover_image_url,
  r.tags,
  r.is_free,
  r.file_size,
  r.status,
  r.published_at,
  r.created_at,
  r.grade_levels,
  case
    when r.access_mode = 'plans' then coalesce(
      (
        select array_agg(p.name order by p.sort_order, p.id)
        from public.resource_plan_access access
        join public.plans p on p.id = access.plan_id
        where access.resource_id = r.id
          and p.lifecycle_status = 'active'
          and p.is_public = true
      ),
      '{}'::text[]
    )
    else '{}'::text[]
  end as required_plan_names,
  (
    r.published_at is not null
    and current_timestamp >= r.published_at
    and current_timestamp < r.published_at + interval '7 days'
  ) as is_new,
  r.access_mode,
  case
    when r.access_mode = 'plans' then coalesce(
      (
        select array_agg(access.plan_id order by p.sort_order, access.plan_id)
        from public.resource_plan_access access
        join public.plans p on p.id = access.plan_id
        where access.resource_id = r.id
      ),
      '{}'::text[]
    )
    else '{}'::text[]
  end as required_plan_ids,
  featured.position as featured_rank,
  review_stats.review_average,
  review_stats.review_count,
  r.slug,
  r.youtube_video_id
from public.resources r
left join public.featured_resources featured on featured.resource_id = r.id
left join lateral (
  select
    round(avg(review.rating)::numeric, 1) as review_average,
    count(review.id)::bigint as review_count
  from public.resource_reviews review
  where review.resource_id = r.id
    and review.moderation_status = 'visible'
) review_stats on true
where r.status = 'published'
  and (
    (
      r.delivery_mode = 'file_download'
      and nullif(btrim(r.file_path), '') is not null
      and r.file_path like r.id::text || '/%'
      and position('placeholder' in lower(r.file_path)) = 0
    )
    or
    (
      r.delivery_mode <> 'file_download'
      and nullif(btrim(r.cta_url), '') is not null
      and position('placeholder' in lower(r.cta_url)) = 0
      and (
        r.cta_url ~ '^/[a-zA-Z0-9]'
        or (
          r.cta_url ~* '^https?://[a-z0-9][a-z0-9.-]+(:[0-9]{1,5})?(/|$)'
          and lower(substring(r.cta_url from '^https?://([^/:?#]+)')) !~
            '^(localhost$|0[.]0[.]0[.]0$|127[.]|10[.]|192[.]168[.]|169[.]254[.]|172[.](1[6-9]|2[0-9]|3[01])[.]|(.+[.])?(example[.](com|org|net)|local|invalid|test)$)'
        )
      )
    )
  );

revoke all on public.resource_catalog from public;
revoke insert, update, delete, truncate on public.resource_catalog from anon, authenticated;
grant select on public.resource_catalog to anon, authenticated;

create or replace function public.admin_set_resource_video(
  p_resource_id uuid,
  p_video_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_video text := nullif(pg_catalog.btrim(p_video_id), '');
begin
  if not public.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if v_video is not null and v_video !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Invalid YouTube video id' using errcode = '22023';
  end if;
  update public.resources
  set youtube_video_id = v_video
  where id = p_resource_id;
  if not found then
    raise exception 'Resource not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_set_resource_video(uuid, text) from public, anon;
grant execute on function public.admin_set_resource_video(uuid, text) to authenticated;

create table if not exists public.homepage_videos (
  position smallint primary key check (position between 1 and 3),
  youtube_video_id text not null check (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text check (title is null or char_length(title) between 1 and 80),
  updated_at timestamptz not null default now()
);

alter table public.homepage_videos enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'homepage_videos'
      and policyname = 'homepage_videos_public_read'
  ) then
    create policy homepage_videos_public_read
      on public.homepage_videos for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

revoke all on public.homepage_videos from public, anon, authenticated;
grant select on public.homepage_videos to anon, authenticated;

-- Replaces the whole homepage list in one transaction. p_videos is a JSON array
-- of at most 3 objects: {"videoId": "...", "title": "..."} (title optional).
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

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'resource_catalog' and column_name = 'youtube_video_id'
  ) then
    raise exception '058: resource_catalog does not expose youtube_video_id';
  end if;
  if has_table_privilege('anon', 'public.resource_catalog', 'insert')
     or has_table_privilege('authenticated', 'public.resource_catalog', 'update') then
    raise exception '058: resource_catalog must stay read-only for browser roles';
  end if;
  if has_table_privilege('anon', 'public.homepage_videos', 'insert')
     or has_table_privilege('authenticated', 'public.homepage_videos', 'update')
     or has_table_privilege('authenticated', 'public.homepage_videos', 'delete') then
    raise exception '058: homepage_videos must be read-only for browser roles';
  end if;
  if has_function_privilege('anon', 'public.admin_set_resource_video(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.admin_set_homepage_videos(jsonb)', 'execute') then
    raise exception '058: anon must not execute the admin video functions';
  end if;
end
$$;
