-- 052: remove write privileges the browser roles never need (defense in depth).
--
-- WHY
--   Supabase grants `anon` and `authenticated` full table privileges by
--   default, so row level security was the only thing standing between a
--   browser request and a write. The catalogue views and the membership /
--   plan / audit tables below are only ever read by the browser; every write
--   goes through SECURITY DEFINER functions, which run as their owner and are
--   not affected by this migration. Removing the unused privileges means a
--   future policy mistake cannot suddenly allow a member to grant themselves
--   a paid plan, edit published resources, or alter the audit log.
--
--   TRUNCATE is not subject to row level security at all, so it is removed
--   for the same tables as plain hygiene.
--
-- WHAT IT DOES NOT TOUCH
--   * SELECT privileges and every RLS policy (reads are unchanged).
--   * profiles, saved_resources, upgrade_requests, resources and every table
--     that a signed-in member or admin writes directly (profile name/avatar,
--     favourites, admin role changes, resource edits).
--   * Any data. No row is read or written by this file.
--
-- APPLY (not applied by this repository; run by the project owner)
--   1. `supabase migration list` and confirm 049, 050 and 051 are applied.
--   2. `supabase db push --dry-run`, then apply to a Preview/branch database
--      first and click through sign-in, favourites, profile edit, membership
--      page and the admin console.
--   3. Apply to production. It is idempotent: re-running changes nothing.
--   The DO block at the end aborts (and rolls the whole migration back) if a
--   privilege the app needs for reading would be lost or a write privilege
--   would remain.
--
-- ROLLBACK
--   Restore the previous (default) privileges; nothing else changed:
--     grant insert, update, delete, truncate on
--       public.resource_catalog, public.plan_benefit_catalog,
--       public.resource_review_feed, public.resource_review_summary,
--       public.subscriptions, public.subscription_events, public.plans,
--       public.features, public.plan_features, public.admin_audit_log
--     to anon, authenticated;
--   (Views that are not auto-updatable ignore the write grants.)

revoke insert, update, delete, truncate on
  public.resource_catalog,
  public.plan_benefit_catalog,
  public.resource_review_feed,
  public.resource_review_summary
from public, anon, authenticated;

revoke insert, update, delete, truncate on
  public.subscriptions,
  public.subscription_events,
  public.plans,
  public.features,
  public.plan_features,
  public.admin_audit_log
from public, anon, authenticated;

do $$
declare
  v_table text;
  v_role text;
  v_privilege text;
begin
  -- Reads the app depends on must survive.
  foreach v_table in array array[
    'public.resource_catalog',
    'public.plan_benefit_catalog',
    'public.plans',
    'public.features',
    'public.plan_features'
  ] loop
    if not has_table_privilege('anon', v_table, 'select') then
      raise exception '052: anon lost SELECT on %', v_table;
    end if;
  end loop;

  foreach v_table in array array[
    'public.resource_review_feed',
    'public.resource_review_summary',
    'public.subscriptions',
    'public.subscription_events'
  ] loop
    if not has_table_privilege('authenticated', v_table, 'select') then
      raise exception '052: authenticated lost SELECT on %', v_table;
    end if;
  end loop;

  -- No browser role may keep a write privilege on these objects.
  foreach v_table in array array[
    'public.resource_catalog',
    'public.plan_benefit_catalog',
    'public.resource_review_feed',
    'public.resource_review_summary',
    'public.subscriptions',
    'public.subscription_events',
    'public.plans',
    'public.features',
    'public.plan_features',
    'public.admin_audit_log'
  ] loop
    foreach v_role in array array['anon', 'authenticated'] loop
      foreach v_privilege in array array['insert', 'update', 'delete', 'truncate'] loop
        if has_table_privilege(v_role, v_table, v_privilege) then
          raise exception '052: % still holds % on %', v_role, upper(v_privilege), v_table;
        end if;
      end loop;
    end loop;
  end loop;
end
$$;
