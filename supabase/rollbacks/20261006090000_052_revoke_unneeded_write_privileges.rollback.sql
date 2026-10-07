-- Rollback for 20261006090000_052_revoke_unneeded_write_privileges.sql
--
-- Restores the privileges the project granted by default. Nothing else changes
-- (no policy, no data). Safe to run more than once.
begin;

grant insert, update, delete, truncate on
  public.resource_catalog,
  public.plan_benefit_catalog,
  public.resource_review_feed,
  public.resource_review_summary,
  public.subscriptions,
  public.subscription_events,
  public.plans,
  public.features,
  public.plan_features,
  public.admin_audit_log
to anon, authenticated;

commit;
