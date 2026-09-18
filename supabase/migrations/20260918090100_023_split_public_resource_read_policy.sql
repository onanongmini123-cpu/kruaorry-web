-- A public SELECT policy must not invoke is_admin(): migration 006 correctly
-- revoked EXECUTE on that function from anon. PostgreSQL checks function
-- privileges in the RLS expression even for published rows, so the former
-- (status = 'published' OR is_admin()) policy denied anonymous catalog reads.
-- Keep the public predicate independent of privileged functions, while a
-- second policy lets authenticated admins/owners preview unpublished rows.
alter policy "resources_public_read_published" on public.resources
  to anon, authenticated
  using (status = 'published');

create policy "resources_admin_read"
  on public.resources for select
  to authenticated
  using (public.is_admin());

-- RLS controls rows, not columns. A published premium row was previously
-- queryable with cta_url/file_path via PostgREST by both anon and Free users.
-- Remove table-wide SELECT before granting only the display metadata back.
-- Administrators use resolve_resource_target for the private fields.
revoke select on public.resources from public, anon, authenticated;
revoke select (cta_url, file_path, file_name) on public.resources from public, anon, authenticated;
grant select (
  id, title, meta, description, category, delivery_mode, cover_image_url,
  status, published_at, created_at, tags, is_free,
  file_size, file_mime_type
) on public.resources to anon, authenticated;

-- A definer-owned view can inspect the private target to decide whether a
-- published row is usable, but exposes only safe metadata. The explicit
-- published predicate is essential: definer views bypass the source RLS.
create view public.resource_catalog with (security_barrier = true) as
select
  r.id, r.title, r.meta, r.description, r.category, r.delivery_mode,
  r.cover_image_url, r.tags, r.is_free, r.file_size,
  r.status, r.published_at, r.created_at
from public.resources r
where r.status = 'published'
  and (
    (r.delivery_mode = 'file_download'
      and nullif(btrim(r.file_path), '') is not null
      and r.file_path like r.id::text || '/%'
      and position('placeholder' in lower(r.file_path)) = 0)
    or
    (r.delivery_mode <> 'file_download'
      and nullif(btrim(r.cta_url), '') is not null
      and position('placeholder' in lower(r.cta_url)) = 0
      and (
        r.cta_url ~ '^/[a-zA-Z0-9]'
        or (
          r.cta_url ~* '^https?://[a-z0-9][a-z0-9.-]+(:[0-9]{1,5})?(/|$)'
          and lower(substring(r.cta_url from '^https?://([^/:?#]+)')) !~
            '^(localhost$|0[.]0[.]0[.]0$|127[.]|10[.]|192[.]168[.]|169[.]254[.]|172[.](1[6-9]|2[0-9]|3[01])[.]|(.+[.])?(example[.](com|org|net)|local|invalid|test)$)'
        )
      ))
  );
revoke all on public.resource_catalog from public;
grant select on public.resource_catalog to anon, authenticated;

-- The only way a browser may receive a destination is through this
-- authenticated, entitlement-checked function. A Free user may resolve a
-- free sample after signup; a premium destination requires the paid feature.
create function public.resolve_resource_target(p_resource_id uuid)
returns table (delivery_mode text, cta_url text, file_path text, file_name text)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
  then
    return;
  end if;

  return query
    select r.delivery_mode, r.cta_url, r.file_path, r.file_name
    from public.resources r
    where r.id = p_resource_id
      and (
        public.is_admin()
        or (r.status = 'published'
          and (r.is_free or public.has_feature('download.premium')))
      );
end;
$$;
revoke all on function public.resolve_resource_target(uuid) from public, anon;
grant execute on function public.resolve_resource_target(uuid) to authenticated;

-- Storage's policy previously SELECTed resources.file_path directly as the
-- caller. After column revocation, a narrow boolean definer function keeps
-- the exact-object check while revealing neither the path nor the row.
create function public.resource_file_read_allowed(p_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (
      public.is_admin()
      or exists (
        select 1 from public.resources r
        where r.file_path = p_path
          and r.id::text = (regexp_match(p_path, '^([^/]+)/'))[1]
          and r.status = 'published'
          and (r.is_free or public.has_feature('download.premium'))
      )
    );
$$;
revoke all on function public.resource_file_read_allowed(text) from public, anon;
grant execute on function public.resource_file_read_allowed(text) to authenticated;

alter policy resource_files_entitled_read on storage.objects
  to authenticated
  using (
    bucket_id = 'resource-files'
    and public.resource_file_read_allowed(name)
  );
