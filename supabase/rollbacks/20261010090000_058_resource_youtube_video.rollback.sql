-- Rollback for 20261010090000_058_resource_youtube_video.sql
--
-- Removes the new functions, the homepage_videos table and the real
-- resources.youtube_video_id column in one transaction. resource_catalog keeps
-- an always-NULL youtube_video_id column (a view cannot lose a column with
-- CREATE OR REPLACE, and two saved_resources policies depend on the view), which
-- both application builds accept. Re-applying migration 058 afterwards works.
-- Stored video ids are discarded; export them first if they matter:
--   select id, youtube_video_id from public.resources where youtube_video_id is not null;
--   select * from public.homepage_videos;
begin;
set local lock_timeout = '5s';

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
  null::text as youtube_video_id
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

drop function if exists public.admin_set_homepage_videos(jsonb);
drop function if exists public.admin_set_resource_video(uuid, text);
drop table if exists public.homepage_videos;

alter table public.resources drop constraint if exists resources_youtube_video_id_format;
alter table public.resources drop column if exists youtube_video_id;

commit;
