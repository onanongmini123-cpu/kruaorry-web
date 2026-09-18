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
