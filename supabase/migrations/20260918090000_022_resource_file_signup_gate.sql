-- A free sample is free for registered teachers, not anonymously downloadable.
-- The previous policy allowed anon to satisfy r.is_free and create a signed
-- Storage URL directly with the public key, bypassing the website's login.
-- Keep the existing exact-file, published-status, premium, and admin checks.
-- ALTER POLICY replaces the roles/predicate atomically; no objects are moved
-- or deleted. Existing signed URLs remain usable until their short TTL ends.
alter policy resource_files_entitled_read on storage.objects
  to authenticated
  using (
    bucket_id = 'resource-files'
    and (select auth.uid()) is not null
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and (
      public.is_admin()
      or exists (
        select 1 from public.resources r
        where r.file_path = storage.objects.name
          and r.id::text = (regexp_match(storage.objects.name, '^([^/]+)/'))[1]
          and r.status = 'published'
          and (r.is_free or public.has_feature('download.premium'))
      )
    )
  );
