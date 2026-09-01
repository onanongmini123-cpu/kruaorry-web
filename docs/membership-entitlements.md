# Membership and entitlements

Phase 1B replaces broad plan-name checks with database-backed capabilities.
Supabase remains authoritative; frontend checks are presentation only.

## Plan catalogue

Public plans:

- `free` — 0 THB
- `founder` — 299 THB/year, capped at 100 active continuous subscriptions
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

## Manual operations

- `approve_upgrade_request(request_id)` activates a subscription and resolves
  its pending request in one transaction.
- `decline_upgrade_request(request_id)` resolves a pending request without
  changing membership.
- `set_member_plan(user_id, plan_id, reason)` handles explicit admin changes.
- `renew_subscription(subscription_id)` renews an annual subscription.

All mutation RPCs are `SECURITY DEFINER`, verify `is_admin()` internally and
write a subscription event. Direct updates to `profiles.plan` and direct
approval updates on `upgrade_requests` are blocked.

## Founder 100 invariant

Every new Founder activation obtains the same transaction-level advisory lock,
counts valid active Founder subscriptions under that lock, rejects activation
at 100, then inserts the new subscription before releasing the lock. A user
with any previous Founder subscription cannot claim Founder again; renewal is
the only path that keeps the 299 THB price lock.

If renewal occurs after the Founder period has ended, the subscription history
is retained, the lock becomes `lost_price_lock`, and the effective plan becomes
Free until the owner assigns a currently available normal plan.

## Deferred work

The capability catalogue already reserves ids for workspace, history,
generators, AI and School. They remain disabled until those workflows exist.
AI quotas, School plans, analytics events, payment-provider integration and
automatic expiry scheduling are intentionally outside Phase 1B.
