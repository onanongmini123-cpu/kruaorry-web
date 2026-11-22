-- Rollback for 20261011090000_059_resource_previews.sql
--
-- Drops the admin function, the public view and the table in one transaction.
-- Nothing else depends on them. Stored preview URLs are discarded (export first
-- with `select * from public.resource_previews;` if they matter); the image
-- files in the resource-covers bucket are not touched. Re-applying 059 works.
begin;
set local lock_timeout = '5s';

drop function if exists public.admin_set_resource_previews(uuid, jsonb);
drop view if exists public.resource_preview_catalog;
drop table if exists public.resource_previews;

commit;
