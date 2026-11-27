-- Rollback for 20261015090000_065_site_visits.sql
--
-- Drops the visitor table and its four functions. All visitor counts are lost.
-- Nothing else is touched. One transaction; re-applying 065 afterwards works.
begin;
set local lock_timeout = '5s';

drop function if exists public.owner_site_visit_summary(integer);
drop function if exists public.record_site_visit(text);
drop function if exists public.prune_site_visits();
drop function if exists public.site_visit_bangkok_date(timestamptz);
drop table if exists public.site_visit_daily;

commit;
