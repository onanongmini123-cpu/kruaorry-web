-- NOT YET APPLIED to the live project — prepared on review branch
-- claude/owner-role-concurrency-guard for review before manual apply.
--
-- Numbered 017 (not 016d): claude/hide-unavailable-features already
-- reserves 20260830120000_016d_plus_plan_truthful_features.sql for an
-- unrelated, also-not-yet-applied fix (Plus plan feature copy). This
-- migration's version (20260901000000) sorts after both 016c (the latest
-- migration actually applied live) and 016d's reserved slot, so applying
-- either one first, in either order, cannot collide with the other —
-- they touch disjoint objects (016d: a plans row's `features` column;
-- this migration: two trigger functions) and neither depends on the
-- other's numbering.
--
-- Fixes a P1 race in the last-owner guard from
-- 20260830103204_016_owner_admin_role_tier.sql. Both
-- prevent_self_privilege_escalation() (BEFORE UPDATE on profiles) and
-- prevent_last_owner_delete() (BEFORE DELETE on profiles) each ran, under
-- plain READ COMMITTED, an unlocked
--   exists (select 1 from profiles where role = 'owner' and id <> <this row>)
-- check before allowing an owner's row to stop being 'owner'. With two
-- owners A and B, two concurrent transactions — demote A / demote B, or
-- demote A / delete B, or delete A / delete B — each only lock their own
-- target row; neither statement's row-level lock is visible to the other
-- transaction's SELECT, so both checks can run concurrently, both see
-- "yes, another owner still exists" (the other transaction hasn't
-- committed yet), and both proceed. Both commit. Zero owners remain,
-- with no exception ever raised. This is a classic check-then-act race,
-- not something an isolation-level change alone fixes reliably (relying
-- on undocumented serialization-failure behavior at a non-default
-- isolation level is not a real fix here, and this project runs at the
-- Postgres/Supabase default of READ COMMITTED).
--
-- Fix: before either function evaluates the "is this the last owner"
-- check, it acquires a single shared transaction-scoped advisory lock
-- (pg_advisory_xact_lock) using one fixed key shared by both functions.
-- Advisory locks serialize on the key, not on any row, so this closes
-- the race between ANY combination of concurrent owner-role transitions
-- and owner deletions, regardless of which rows are involved. The lock
-- is released automatically at transaction end (commit or rollback) —
-- no manual unlock, no risk of a stuck lock on error. The second
-- transaction to reach the lock blocks until the first commits, then
-- re-runs its own exists-check against the now-committed state and
-- correctly finds zero remaining owners, raising as it should.
--
-- Everything else about these functions — who is authorized to change a
-- role or plan at all (is_owner()/is_admin()), SECURITY DEFINER, the
-- locked-down search_path, and the fact that neither function grants
-- EXECUTE to anon/authenticated (trigger functions don't need a direct
-- EXECUTE grant to fire — confirmed unchanged, live, immediately before
-- writing this migration) — is unchanged. CREATE OR REPLACE FUNCTION
-- preserves a function's existing ACL entries, so no REVOKE/GRANT
-- statement is needed here.

-- Both trigger functions below MUST call pg_advisory_xact_lock with this
-- exact same literal key. If the two functions ever use different keys,
-- they stop serializing against each other and the race reopens.
-- (Key chosen arbitrarily; only uniqueness within this project's own
-- advisory-lock usage matters, and this is the only advisory lock this
-- project takes.)
--
-- lock key: 729310001

create or replace function public.prevent_self_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and old.role = 'owner' then
    perform pg_advisory_xact_lock(729310001);
    if not exists (select 1 from public.profiles where role = 'owner' and id <> old.id) then
      raise exception 'Cannot demote the last remaining owner';
    end if;
  end if;

  if new.role is distinct from old.role and not public.is_owner() then
    new.role := old.role;
  end if;

  if new.plan is distinct from old.plan and not public.is_admin() then
    new.plan := old.plan;
  end if;

  return new;
end;
$$;

create or replace function public.prevent_last_owner_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'owner' then
    perform pg_advisory_xact_lock(729310001);
    if not exists (select 1 from public.profiles where role = 'owner' and id <> old.id) then
      raise exception 'Cannot delete the last remaining owner';
    end if;
  end if;
  return old;
end;
$$;
