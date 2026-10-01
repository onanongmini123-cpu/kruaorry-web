# Membership and entitlements

Phase 1B replaces broad plan-name checks with database-backed capabilities.
Supabase remains authoritative; frontend checks are presentation only.

## Plan catalogue

Public plans:

- `free` — 0 THB
- `founder` — 299 THB for the first year only, available to the first 100
  people whose payments an admin confirms; renewal is 599 THB/year
- `teacher` — 599 THB for the first year and every annual renewal

Compatibility plans:

- `teacher_pro` keeps its 990 THB/year catalogue row but is hidden and not
  upgradeable until advanced tools actually ship. No existing membership is
  deleted or downgraded.
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

`membership_payment_confirmations` is the append-only operational audit for
paid activations and renewals. It stores the amount, bank/payment reference,
paid timestamp, confirming admin, idempotency key and result; it never stores
a payment-slip image. Authenticated members cannot insert, update or delete
these rows, and only admins may read them through RLS.

Free members may save at most 10 resources. A database trigger checks the
catalogue limit under a per-member transaction lock. Existing saved rows are
preserved if a member was already over that limit; only new inserts are denied.

## Manual operations

- `create_membership_application(plan_id)` creates a server-quoted pending
  application and reference code. Calling it again returns the same pending
  application for that member and plan. A pending application does not reserve
  a Founder place.
- `confirm_membership_payment(request_id, amount_thb, payment_reference,
  paid_at, idempotency_key)` is the only Founder activation path. It records
  confirmation facts, activates access, consumes a Founder place when
  applicable, appends the payment audit and resolves the request in one
  transaction. A retry with the same facts and idempotency key returns the
  original subscription.
- `decline_upgrade_request(request_id)` resolves a pending request without
  changing membership.
- `confirm_subscription_renewal(subscription_id, amount_thb,
  payment_reference, paid_at, idempotency_key)` renews an annual subscription
  at the catalogue renewal price. An early renewal extends the existing end;
  a late or `expired` renewal starts a fresh year at confirmation time and
  restores the profile plan. It cannot revive cancelled/revoked records or add
  an expiry to preserved legacy access.
- `set_member_plan(user_id, plan_id, reason)` remains available for ordinary
  plans and Free, but rejects Founder grants.

The old `approve_upgrade_request(request_id)` and
`renew_subscription(subscription_id)` RPCs are disabled and their browser
execution grants are revoked so they cannot bypass payment confirmation.

All membership RPCs are `SECURITY DEFINER`; the application RPC requires an
authenticated member, while confirmation, renewal, decline and manual-plan
RPCs verify `is_admin()` internally. Paid mutations write a subscription event
where applicable. Direct updates to
`profiles.plan`, direct inserts into `upgrade_requests`, and direct approval
updates on `upgrade_requests` are blocked for browser roles.

## Founder 100 invariant

The offer is cumulative, not concurrent. Only a successful 299 THB admin
confirmation consumes a place. The durable `founder_seat_ledger` is the
capacity source of truth and each grant receives one unique `slot_number` in
the structural range 1–100. A migration preflight fails closed if existing
history already exceeds 100.

Application creation does not write the ledger. Activation obtains the shared
transaction advisory lock, verifies the request's confirmed-payment fields and
allocates an unused slot. The 101st confirmation raises an error and the whole
transaction rolls back, including request payment fields, subscription and
audit row. Expiry, cancellation, revocation or account deletion never removes
or recycles the historical place. Renewal updates the existing subscription
and never writes another ledger row.

The public `get_founder_capacity()` RPC exposes aggregate used/capacity/
remaining values only. The admin-only `get_founder_seat_count()` RPC reports
the same cumulative usage without exposing ledger entries or member identities.
Founder renewals cost 599 THB/year. A late renewal retains the original Founder
grant, starts a fresh annual period and does not reopen the 299 THB offer.

## Deferred work

The capability catalogue already reserves ids for workspace, history,
generators, AI and School. They remain disabled until those workflows exist.
AI quotas, School plans, analytics events, payment-provider integration and
automatic expiry scheduling are intentionally outside Phase 1B.

## Verification and release limits

`npm test` exercises UI/data helpers and static migration invariants.
`npm run test:membership-sql` additionally runs the seven membership SQL files
used by its regression chain against an isolated PGlite database with a
minimal stub of the older schema.
It checks the Plus copy, legacy backfill, Free favorite limit, Founder cap
including the atomic 100th/101st confirmations and account deletion,
activation/renewal idempotency, and early/expired annual renewal behavior.
PGlite is **not** a copy of Supabase production and cannot prove real
multi-connection concurrency, all Storage RLS behavior, or compatibility with
the actual live dataset. No automatic payment is collected.

The two older migrations executed manually (016d and 017) were verified
against the live schema and recorded with `supabase migration repair` on
2026-09-18 without rerunning their SQL. Later applied state is recorded in the
migration README. Migration 047 is additive and pending; immediately before
release, recheck with `supabase migration list` and
`supabase db push --dry-run`, then test RLS and payment-confirmation flows as
real member and admin roles against a staging copy.
