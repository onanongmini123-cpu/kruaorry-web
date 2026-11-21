-- Rollback for 20261013090000_061_resource_demo_url.sql
--
-- Drops the public demo view, the demo setter, both constraints, the safety
-- function and the column. resource_catalog was never changed, so nothing else
-- needs restoring. Saved demo URLs are lost (they are separate from the full
-- version, which is untouched). The public page and admin console simply show
-- "no demo". Re-applying 061 afterwards works.
begin;
set local lock_timeout = '5s';

drop view if exists public.resource_demo_catalog;
drop function if exists public.admin_set_resource_demo(uuid, text);
alter table public.resources drop constraint if exists resources_demo_differs_from_full;
alter table public.resources drop constraint if exists resources_demo_url_safe;
alter table public.resources drop column if exists demo_url;
drop function if exists public.resource_demo_url_is_safe(text);

commit;
