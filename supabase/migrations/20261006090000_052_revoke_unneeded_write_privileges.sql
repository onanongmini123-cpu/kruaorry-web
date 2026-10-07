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
--   a paid plan, change plan prices or feature copy, or alter the audit log.
--   (The four catalogue/review views are not writable at all, so for them this
--   is hygiene only.)
--
--   TRUNCATE is not subject to row level security at all, so it is removed
--   for the same tables as plain hygiene.
--
-- WHAT IT DOES NOT TOUCH
--   * SELECT privileges and every RLS policy (reads are unchanged).
--   * Every other table, including profiles, saved_resources, upgrade_requests,
--     requests and resources. The browser writes some of them (admin edits of
--     resources, requests and member roles) and the rest are written through
--     SECURITY DEFINER functions; narrowing them needs its own review.
--   * Any data. No row is read or written by this file.
--
-- NOT COVERED (defence in depth, for a later migration)
--   `anon` still holds table-level write and TRUNCATE privileges on resources,
--   saved_resources, profiles, upgrade_requests and requests, and both browser
--   roles keep REFERENCES and TRIGGER (and MAINTAIN on PostgreSQL 17+) on the
--   objects below. Row level security and the missing PostgREST verbs keep all
--   of these unreachable today; they are listed so nobody assumes otherwise.
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
--   Run supabase/rollbacks/20261006090000_052_revoke_unneeded_write_privileges.rollback.sql
--   (one `grant`, restores the default privileges exactly; tested against the
--   real migration chain by `npm run test:migration-chain-sql`).

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
      raise exception '052: anon does not have SELECT on % (the app reads it; check the project default grants before applying)', v_table;
    end if;
  end loop;

  foreach v_table in array array[
    'public.resource_review_feed',
    'public.resource_review_summary',
    'public.subscriptions',
    'public.subscription_events'
  ] loop
    if not has_table_privilege('authenticated', v_table, 'select') then
      raise exception '052: authenticated does not have SELECT on % (the app reads it; check the project default grants before applying)', v_table;
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
