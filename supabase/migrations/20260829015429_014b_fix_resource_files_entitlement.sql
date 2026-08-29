drop policy if exists resource_files_entitled_read on storage.objects;

-- Entitlement mirrors the app's free/paid gate: a resource is accessible when
-- it is marked free, or the requester's profile plan is anything other than 'free'.
create policy resource_files_entitled_read on storage.objects
  for select
  using (
    bucket_id = 'resource-files'
    and (
      is_admin()
      or exists (
        select 1
        from public.resources r
        where r.id::text = (regexp_match(storage.objects.name, '^([^/]+)/'))[1]
          and r.status = 'published'
          and (
            r.is_free
            or exists (
              select 1 from public.profiles p
              where p.id = (select auth.uid())
                and p.plan <> 'free'
            )
          )
      )
    )
  );
