-- Private storage bucket for member resource files (PDF/DOCX/PPTX/XLSX/ZIP, max 50MB).
-- Must stay non-public: files are gated by plan entitlement via RLS below.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resource-files',
  'resource-files',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-zip-compressed'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- File metadata on resources. Storage object path convention: {resource_id}/{filename}
alter table public.resources
  add column if not exists file_path text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists file_mime_type text;

-- Allow the new delivery mode.
alter table public.resources drop constraint if exists resources_delivery_mode_check;
alter table public.resources add constraint resources_delivery_mode_check
  check (delivery_mode = any (array['web_app', 'google_template', 'google_form', 'file_download']));

-- Publishing requires a cover image and at least one real destination (file or link).
-- Verified against live data first: all currently-published rows already satisfy this.
alter table public.resources drop constraint if exists resources_publish_requires_content;
alter table public.resources add constraint resources_publish_requires_content
  check (
    status <> 'published'
    or (cover_image_url is not null and (file_path is not null or cta_url is not null))
  );

-- Storage RLS for the private bucket. Admin write is split into per-action policies
-- (not FOR ALL) to avoid overlapping with the SELECT policy below.
create policy resource_files_admin_insert on storage.objects
  for insert
  with check (bucket_id = 'resource-files' and is_admin());

create policy resource_files_admin_update on storage.objects
  for update
  using (bucket_id = 'resource-files' and is_admin())
  with check (bucket_id = 'resource-files' and is_admin());

create policy resource_files_admin_delete on storage.objects
  for delete
  using (bucket_id = 'resource-files' and is_admin());

-- Read access: admin always; otherwise only when the owning resource is published
-- and the requester's plan is entitled (free resource, or plan matches).
-- Path prefix is compared as text (never cast to uuid) so a malformed path fails
-- the match instead of throwing.
--
-- NOTE: this policy shipped with a bug — the entitlement subquery compared
-- p.plan to r.id::text (a leftover placeholder) instead of checking the
-- requester's plan tier, which made every non-free file inaccessible to
-- everyone but admins. Corrected by the very next migration,
-- 20260829015429_014b_fix_resource_files_entitlement.sql. Left as originally
-- applied here for an accurate history; do not copy this policy as-is.
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
                and p.plan = r.id::text -- placeholder, replaced below
            )
          )
      )
    )
  );
