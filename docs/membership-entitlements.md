# Membership and entitlements

Phase 1B replaces broad plan-name checks with database-backed capabilities.
Supabase remains authoritative; frontend checks are presentation only.

## Plan catalogue

Public plans:

- `free` — 0 THB
- `founder` — 299 THB/year, capped at 100 distinct members ever admitted
- `teacher` — 599 THB/year and the primary public plan
- `teacher_pro` — 990 THB/year

Compatibility plans:

- `plus` remains a hidden legacy plan. Existing profiles and upgrade requests
  retain it, but new requests and manual assignments cannot select it.
- `lifetime` is a hidden retired compatibility row. It exists only so a
  historical profile can be backfilled without losing access. It cannot be
  sold or assigned to a new membership.

The `plans.features` array is marketing copy. Authorization never reads it.

## Capability source of truth

`features` defines stable capability ids. `plan_features` grants them to a
plan and can hold an optional numeric limit. A missing or disabled grant is
denied. A null limit on an enabled capability means unbounded.

The authenticated RPC `get_my_entitlements()` resolves the caller's current
subscription and returns every capability in one snapshot. Client code fails
closed to the Free snapshot if this RPC cannot be read.

Premium Storage access calls `has_feature('download.premium')` inside RLS.
Admin and owner roles retain their existing operational bypass.

## Subscription lifecycle

`subscriptions` is authoritative for paid access. `profiles.plan` remains a
compatibility/display cache and can only be changed by membership RPCs.

Supported subscription statuses are:

- `active`
- `past_due`
- `expired`
- `cancelled`
- `revoked`

An active or past-due subscription is entitled only while its period has not
ended. A null end date is allowed only for preserved legacy access or a
one-time historical plan.

`subscription_events` is append-only from the browser's perspective and keeps
activation, renewal, cancellation, expiry and Founder price-lock history.

Free members may save at most 10 resources. A database trigger checks the
catalogue limit under a per-member transaction lock. Existing saved rows are
preserved if a member was already over that limit; only new inserts are denied.

## Manual operations

- `approve_upgrade_request(request_id)` activates a subscription and resolves
  its pending request in one transaction.
- `decline_upgrade_request(request_id)` resolves a pending request without
  changing membership.
- `set_member_plan(user_id, plan_id, reason)` handles explicit admin changes.
- `renew_subscription(subscription_id)` renews a current annual subscription.
  It cannot revive cancelled/revoked records or add an expiry to preserved
  legacy access. Late Teacher/Teacher Pro renewal uses the current plan price;
  late Founder renewal records the lost price lock instead.

All mutation RPCs are `SECURITY DEFINER`, verify `is_admin()` internally and
write a subscription event. Direct updates to `profiles.plan` and direct
approval updates on `upgrade_requests` are blocked.

## Founder 100 invariant

Every new Founder activation obtains the same transaction-level advisory lock.
The subscription insert trigger reserves one row in `founder_seat_ledger` in
the same transaction and rejects the 101st row. Expired seats are not recycled.
The ledger survives account deletion: its user reference becomes null for
erasure, but the anonymous seat row remains counted. A user with a previous
Founder seat cannot claim it again; renewal is the only path that keeps the
299 THB price lock.

If renewal occurs after the Founder period has ended, the subscription history
is retained, the lock becomes `lost_price_lock`, and the effective plan becomes
Free until the owner assigns a currently available normal plan.

## Deferred work

The capability catalogue already reserves ids for workspace, history,
generators, AI and School. They remain disabled until those workflows exist.
AI quotas, School plans, analytics events, payment-provider integration and
automatic expiry scheduling are intentionally outside Phase 1B.

## Verification and release limits

`npm test` exercises UI/data helpers and static migration invariants.
`npm run test:membership-sql` additionally runs the four pending SQL files
against an isolated PGlite database with a minimal stub of the older schema.
It checks the Plus copy, legacy backfill, Free favorite limit, Founder cap
including account deletion, and renewal behavior. PGlite is **not** a copy of
Supabase production and cannot prove real multi-connection concurrency, all
Storage RLS behavior, or compatibility with the actual live dataset.

Before deployment, reconcile the two older migrations that were executed
manually but are absent from `schema_migrations`, then validate 017b–020 in a
staging copy of the actual database. Apply them in order during a maintenance
window, verify RLS and payment/approval flows as real roles, and only then
enable the new membership surface. No migration in this branch has been
applied to the live project yet.
