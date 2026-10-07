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
--   The backfill is an explicit, reviewable list keyed by resource id (the ids
--   are fixed by the seed migrations 031-047), so renamed, duplicated or
--   re-typed titles cannot change which row is mapped. A row is updated only
--   when it has no slug yet and the slug is not already taken; anything else is
--   skipped (the row stays UUID-only), so this file cannot fail on a duplicate.
--   Published rows left without a slug are listed in a WARNING when it finishes.
--   New resources are NOT given a slug automatically: neither admin_save_resource
--   nor the admin console sets one yet, so a resource published after this file
--   keeps its UUID address until a slug is set by hand:
--     update public.resources set slug = 'my-slug' where id = '...';
--   (the format check and the unique index reject a bad or duplicate value).
--
-- LOCKING
--   One transaction. ADD COLUMN (nullable, no default), the CHECK and the unique
--   index hold a short exclusive lock on public.resources (about 15 ms at 50
--   rows, under a second at 100k rows) and never rewrite the table. lock_timeout
--   is set so a long-running read makes this file stop and be retried instead of
--   queueing every other reader behind it.
--
-- DATA RISK
--   Low. Only the new column is written. No row is deleted, no existing column
--   changes. A resource whose id is not in the list keeps its UUID URL.
--
-- DEPLOYMENT ORDER
--   1. Deploy the application containing Phase A (no database change needed).
--   2. Check the live view still equals migration 029 (this file also stops with
--      a message if the column list or security_barrier differ):
--        select pg_get_viewdef('public.resource_catalog'::regclass, true);
--   3. Apply to a Preview database first, open /resources and a detail page.
--   4. Apply to production. Within ~5 minutes (catalogue cache) URLs switch.
--
-- ROLLBACK
--   Link-neutral and always safe (the application falls back to UUID addresses
--   within about five minutes; slug addresses then answer 404):
--     update public.resources set slug = null;
--   Schema rollback: supabase/rollbacks/20261006100000_053_resource_slugs.rollback.sql
--   (one transaction, tested by `npm run test:migration-chain-sql`). It leaves
--   resource_catalog with an always-NULL `slug` column, which both application
--   builds accept. Do NOT drop and recreate resource_catalog by hand: two
--   saved_resources policies depend on it. Once slug addresses are indexed or
--   shared, fix a slug forward instead of rolling back.

set local lock_timeout = '5s';

-- Stop, changing nothing, if the live view is not the one this file was written
-- against (it is replaced as a whole below, so a hand-edited view would be lost).
do $$
declare
  v_expected text[] := array[
    'id', 'title', 'meta', 'description', 'category', 'delivery_mode',
    'cover_image_url', 'tags', 'is_free', 'file_size', 'status', 'published_at',
    'created_at', 'grade_levels', 'required_plan_names', 'is_new', 'access_mode',
    'required_plan_ids', 'featured_rank', 'review_average', 'review_count'
  ];
  v_actual text[];
  v_barrier boolean;
begin
  select array_agg(attribute.attname order by attribute.attnum)
    into v_actual
  from pg_attribute attribute
  where attribute.attrelid = 'public.resource_catalog'::regclass
    and attribute.attnum > 0
    and not attribute.attisdropped;
  if v_actual is distinct from v_expected and v_actual is distinct from v_expected || array['slug'] then
    raise exception '053: public.resource_catalog has columns % but this file was written against % (migration 029). Compare pg_get_viewdef before applying.',
      v_actual, v_expected;
  end if;
  select coalesce('security_barrier=true' = any (class.reloptions), false)
    into v_barrier
  from pg_class class
  where class.oid = 'public.resource_catalog'::regclass;
  if not v_barrier then
    raise exception '053: public.resource_catalog is not a security_barrier view as in migration 029';
  end if;
end
$$;

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

-- Seeded resources only, keyed by id. Review these English slugs before
-- applying; any resource not listed keeps its UUID address.
with mapping(id, slug) as (
  values
    ('6cc12b2d-5ebc-4533-85d0-13038a0dc189'::uuid, 'vocabulary-defuse'),       -- กู้ระเบิดคำศัพท์
    ('4c1203ce-6e4f-40bd-8dc2-01713e88dcdd'::uuid, 'treasure-chest'),          -- เปิดหีบสมบัติ
    ('03ae013c-1409-4cb1-aa7c-ce264a94312a'::uuid, 'bingo-fun'),               -- บิงโกหรรษา
    ('fa15179e-9937-4d25-951c-7af9ab466589'::uuid, 'picture-word-match'),      -- จับคู่ภาพกับคำ
    ('a7266b9c-3539-423b-9119-dbf019b887cb'::uuid, 'mission-wheel'),           -- วงล้อพิชิตภารกิจ
    ('2fd4da60-b60a-43ea-b382-5b2065e15241'::uuid, 'vocab-fishing'),           -- ตกปลาคำศัพท์
    ('427fb64e-34e0-4f8b-be0e-ee5131e78060'::uuid, 'sentence-train-basic'),    -- รถไฟเรียงประโยค
    ('a6bdbe60-2672-45ba-8773-bab8cd700ef4'::uuid, 'ice-cream-math'),          -- ไอศกรีมคิดเลข
    ('ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8'::uuid, 'word-squad'),              -- Word Squad — รวมแก๊งคำศัพท์
    ('4136ab94-76c8-43c7-a622-37ed9f41b167'::uuid, 'daily-word-detective'),    -- Daily Word Detective
    ('df55f95a-b307-4aec-8b42-e6b9a1244a6e'::uuid, 'listening-detective'),     -- Listening Detective
    ('86afb9c3-20f2-4ab6-9ebc-9a454b36692b'::uuid, 'sentence-train'),          -- Sentence Train
    ('f14855b7-3a39-4f59-85b9-06dde698d4d4'::uuid, 'grammar-boss-battle'),     -- Grammar Boss Battle — ศึกบอสไวยากรณ์
    ('18e463f4-0117-4f0e-9fbf-921be97e5c14'::uuid, 'kaokham'),                 -- ก้าวคำ — ฟัง อ่าน สะกด เขียน
    ('898fa4ab-4db0-4ec0-9c9b-1ba1d4150972'::uuid, 'ar-phonics-quest'),        -- AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร
    ('c3a21758-8338-4f8f-a77e-42e7a6cf3eca'::uuid, 'electric-circuit-lab'),    -- ห้องทดลองวงจรไฟฟ้า
    ('a7b13975-7244-4a8a-8b33-efc8f04bca89'::uuid, 'ecosystem-guardians')      -- ผู้พิทักษ์ระบบนิเวศ — Ecosystem Guardians
)
update public.resources r
set slug = m.slug
from mapping m
where r.id = m.id
  and r.slug is null
  and not exists (select 1 from public.resources o where o.slug = m.slug);

do $$
declare
  v_unmapped text;
begin
  select string_agg(r.title, ', ' order by r.title)
    into v_unmapped
  from public.resources r
  where r.status = 'published' and r.slug is null;
  if v_unmapped is not null then
    raise warning '053: published resources without a slug keep their UUID address (set one by hand when wanted): %', v_unmapped;
  end if;
end
$$;

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
