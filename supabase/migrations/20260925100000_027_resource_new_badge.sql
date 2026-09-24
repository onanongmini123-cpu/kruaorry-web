-- Batch 3: derive the seven-day "new" badge from the original publication
-- timestamp and the database clock. Editing titles or other metadata does not
-- touch published_at, so those edits cannot restart the badge window.

-- Preserve every safety predicate and public column from migration 026.
-- is_new is derived metadata only; private destinations remain absent.
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
    when r.is_free then '{}'::text[]
    else coalesce(
      (
        select array_agg(p.name order by p.sort_order, p.id)
        from public.plans p
        join public.plan_features pf
          on pf.plan_id = p.id
         and pf.feature_id = 'download.premium'
         and pf.enabled = true
        where p.lifecycle_status = 'active'
          and p.is_public = true
      ),
      '{}'::text[]
    )
  end as required_plan_names,
  (
    r.published_at is not null
    and current_timestamp >= r.published_at
    and current_timestamp < r.published_at + interval '7 days'
  ) as is_new
from public.resources r
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
grant select on public.resource_catalog to anon, authenticated;
