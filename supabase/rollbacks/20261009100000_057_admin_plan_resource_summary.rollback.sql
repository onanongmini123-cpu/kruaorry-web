-- Rollback for 057. The migration creates one read-only aggregate function;
-- no table or row needs restoring.
begin;
set local lock_timeout = '5s';

drop function if exists public.get_admin_plan_resource_summary();

commit;
