-- Rollback 067 only. Recorded goals and their audit history are lost.
set local lock_timeout = '5s';
drop function if exists public.owner_finance_csv(date);
drop function if exists public.owner_finance_report(date);
drop function if exists public.owner_finance_day_totals(date);
drop function if exists public.owner_save_monthly_goal(date,bigint,integer);
drop trigger if exists owner_goal_audit_append_only on public.owner_monthly_goal_audit;
drop function if exists public.owner_goal_audit_append_only();
drop table if exists public.owner_monthly_goal_audit;
drop table if exists public.owner_monthly_goals;
