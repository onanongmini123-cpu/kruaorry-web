-- Rollback for 20261012090000_060_homepage_rankings.sql
--
-- Drops the two functions and the view-count table in one transaction. Nothing
-- else depends on them; saved_resources and every resource are untouched. The
-- collected view rows are discarded. Re-applying 060 afterwards works.
begin;
set local lock_timeout = '5s';

drop function if exists public.get_homepage_rankings(integer);
drop function if exists public.record_resource_view(uuid, text);
drop table if exists public.resource_view_daily;

commit;
