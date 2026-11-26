-- Rollback for 20261014090000_063_admin_set_resource_cover.sql
--
-- Drops the function. Nothing depends on it except the admin tool "บีบอัดรูปปกเดิม",
-- which then reports that the tool is not installed. Covers that were already
-- changed keep their new links (use the tool's "ย้อนกลับ" / the CSV backup first
-- if the old links are wanted). Re-applying 063 afterwards works.
begin;
set local lock_timeout = '5s';

drop function if exists public.admin_set_resource_cover(uuid, text);

commit;
