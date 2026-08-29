insert into storage.buckets (id, name, public)
values ('resource-covers', 'resource-covers', true)
on conflict (id) do nothing;

create policy "resource_covers_public_read"
  on storage.objects for select
  using (bucket_id = 'resource-covers');

create policy "resource_covers_admin_write"
  on storage.objects for all
  using (bucket_id = 'resource-covers' and public.is_admin())
  with check (bucket_id = 'resource-covers' and public.is_admin());
