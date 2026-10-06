-- 053: stable, readable resource URLs (slug). PHASE B of a two-stage rollout.
--
-- PURPOSE
--   Give every public resource an address like /resources/sentence-train that
--   survives title edits and reads well in search results and shared links.
--
-- TWO-STAGE ROLLOUT
--   Phase A (already in the application, deploy first, safe without this file):
--     the app reads the slug column when it exists and falls back to the old
--     query when it does not; /resources/{uuid} and /resources/{slug} both
--     work; a UUID address redirects (308) to the slug only once one is set.
--   Phase B (this file): add the column, constrain it, make it unique, fill it
--     for the seeded resources, and expose it through the catalogue view.
--     After it is applied the app switches canonical URLs to slugs by itself.
--
-- FORWARD BEHAVIOUR
--   * public.resources.slug (nullable text); no existing row is rewritten
--     except the explicit title -> slug backfill below.
--   * format check: lowercase ASCII words joined by single hyphens, 3 to 80
--     characters, and never UUID-shaped (so a slug can not shadow a UUID URL).
--   * unique index on slug (nulls allowed, many rows may stay UUID-only).
--   * resource_catalog gains `slug` as its LAST column. The definition is
--     migration 029's, unchanged apart from that column.
--
-- BACKWARD COMPATIBILITY
--   * Old links /resources/{uuid} keep working forever (redirect once a slug
--     exists). API routes (/api/resources/{uuid}/open and download) are
--     untouched and still take UUIDs.
--   * Older application builds select explicit columns and ignore `slug`.
--   * A new column added last does not disturb `create or replace view`.
--
-- COLLISIONS
--   The backfill is an explicit, reviewable list. A row is updated only when
--   its title matches exactly ONE resource, it has no slug yet, and the slug is
--   not already taken; anything else is skipped (stays UUID-only), so this file
--   can not fail on a duplicate. New resources get a slug with the helper
--   rules in src/lib/resourceSlug.ts (first free of base, base-2, base-3 ...).
--
-- DATA RISK
--   Low. Only the new column is written. No row is deleted, no existing column
--   changes. Titles edited in production simply do not match and keep a UUID URL.
--
-- DEPLOYMENT ORDER
--   1. Deploy the application containing Phase A (no database change needed).
--   2. Check the live view still equals migration 029:
--        select pg_get_viewdef('public.resource_catalog'::regclass, true);
--   3. Apply to a Preview database first, open /resources and a detail page.
--   4. Apply to production. Within ~5 minutes (catalogue cache) URLs switch.
--
-- ROLLBACK
--   Safe at any time; the application falls back to UUID URLs by itself:
--     create or replace view public.resource_catalog ... (migration 029 text);
--       -- dropping a column from a view needs drop + recreate, see 029
--     drop index if exists public.resources_slug_key;
--     alter table public.resources drop constraint if exists resources_slug_format;
--     alter table public.resources drop column if exists slug;
--   If you only want the URLs to revert, `update public.resources set slug = null;`
--   is enough.

alter table public.resources
  add column if not exists slug text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'resources_slug_format'
      and conrelid = 'public.resources'::regclass
  ) then
    alter table public.resources
      add constraint resources_slug_format
      check (
        slug is null
        or (
          slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
          and char_length(slug) between 3 and 80
          and slug !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      );
  end if;
end
$$;

create unique index if not exists resources_slug_key
  on public.resources (slug)
  where slug is not null;

-- Seeded resources only. Review these English slugs before applying; any
-- resource not listed (or renamed in production) keeps its UUID address.
with mapping(title, slug) as (
  values
    ('กู้ระเบิดคำศัพท์', 'vocabulary-defuse'),
    ('เปิดหีบสมบัติ', 'treasure-chest'),
    ('บิงโกหรรษา', 'bingo-fun'),
    ('จับคู่ภาพกับคำ', 'picture-word-match'),
    ('วงล้อพิชิตภารกิจ', 'mission-wheel'),
    ('ตกปลาคำศัพท์', 'vocab-fishing'),
    ('รถไฟเรียงประโยค', 'sentence-train-basic'),
    ('ไอศกรีมคิดเลข', 'ice-cream-math'),
    ('Word Squad — รวมแก๊งคำศัพท์', 'word-squad'),
    ('Daily Word Detective', 'daily-word-detective'),
    ('Listening Detective', 'listening-detective'),
    ('Sentence Train', 'sentence-train'),
    ('Grammar Boss Battle — ศึกบอสไวยากรณ์', 'grammar-boss-battle'),
    ('ก้าวคำ — ฟัง อ่าน สะกด เขียน', 'kaokham'),
    ('AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร', 'ar-phonics-quest'),
    ('ห้องทดลองวงจรไฟฟ้า', 'electric-circuit-lab'),
    ('ผู้พิทักษ์ระบบนิเวศ — Ecosystem Guardians', 'ecosystem-guardians')
)
update public.resources r
set slug = m.slug
from mapping m
where r.slug is null
  and r.title = m.title
  and (select count(*) from public.resources x where x.title = m.title) = 1
  and not exists (select 1 from public.resources o where o.slug = m.slug);

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
  r.slug
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
-- Read-only for browser roles regardless of whether migration 052 ran first.
revoke insert, update, delete, truncate on public.resource_catalog from anon, authenticated;
grant select on public.resource_catalog to anon, authenticated;

-- Fail the whole migration, rolling it back, if the outcome is not as designed.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'resource_catalog' and column_name = 'slug'
  ) then
    raise exception '053: resource_catalog does not expose slug';
  end if;
  if has_table_privilege('anon', 'public.resource_catalog', 'insert')
     or has_table_privilege('authenticated', 'public.resource_catalog', 'update') then
    raise exception '053: resource_catalog must stay read-only for browser roles';
  end if;
end
$$;
