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

`membership_application_resolution_audit` is the separate append-only history
of application outcomes. Payment-confirmed approvals use the reason code
`payment_confirmed`; ordinary admin declines use `admin_declined`. A reviewed
owner test cleanup may use `owner_test_cleanup`, but only for the exact
non-identifying creation instants and Founder/Teacher plan tuple approved before
migration 048 is applied. The migration proves both rows belong to the same
owner and derives the resolver from that validated owner profile; no production
request or account UUID is committed. The member-facing application row retains
the same machine-readable `resolution_reason_code`, `resolved_at`, and
`resolved_by` facts.

Free members may save at most 10 resources. A database trigger checks the
catalogue limit under a per-member transaction lock. Existing saved rows are
preserved if a member was already over that limit; only new inserts are denied.

## Manual operations

- `create_membership_application(plan_id)` creates a server-quoted pending
  application and reference code. Each member can have only one pending
  application across all plans: calling it again for the same plan returns that
  application, while changing plans must use the explicit conversion workflow.
  A pending application does not reserve a Founder place.
- `report_membership_payment(request_id)` lets the authenticated owner mark a
  pending application as paid. The idempotent `payment_reported_at` timestamp
  is self-attested workflow state only: it does not confirm payment, grant
  access or reserve a Founder place. A pending application with no timestamp is
  `awaiting payment`; one with a timestamp is `awaiting admin review`. Retrying
  an existing report always returns its original timestamp, even if another
  confirmation filled the final Founder place in the meantime; admin
  confirmation is still blocked once capacity is full.
- `convert_founder_application_to_teacher(request_id)` is the explicit escape
  path when Founder is full. It keeps the same application reference, replaces
  the quote with the active canonical Teacher price of 599 THB and clears a
  report made against the old Founder quote. It never converts silently and
  never activates membership.
- `confirm_membership_payment(request_id, amount_thb, payment_reference,
  paid_at, idempotency_key)` is the only Founder activation path. It requires
  the member-reported marker, records confirmation facts, activates access,
  consumes a Founder place when applicable, appends the payment audit and
  resolves the request in one transaction. A retry with the same facts and
  idempotency key returns the original subscription.
- `decline_upgrade_request(request_id)` resolves a pending request with the
  machine-readable reason `admin_declined`, records the resolver, and appends a
  resolution audit without changing membership.
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
the structural range 1–100. Because older migrations did not record explicit
payment-confirmation evidence, migration 048 fails closed when it finds any
legacy ledger rows. Those rows must be audited and reconciled in a separately
reviewed data migration before the live schema change may proceed; migration
048 never guesses that an older grant was paid.

Application creation and member payment reporting do not write the ledger.
Reporting and activation obtain the same shared transaction advisory lock.
A first report and every activation reject a still-pending 299 THB Founder
quote once the durable capacity is full; retrying an earlier report remains a
read of its original marker. Activation verifies the member report and
confirmed-payment fields before allocating an unused slot. The 101st
confirmation raises an error and the whole
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
migration README. Migration 048 is additive and pending; immediately before
release, audit the live `founder_seat_ledger` provenance, recheck with
`supabase migration list` and
`supabase db push --dry-run`, then test RLS and payment-confirmation flows as
real member and admin roles against a staging copy.

Migration 048 contains one narrowly scoped reconciliation for the reviewed
owner test pair. It matches the exact non-identifying `created_at` instants plus
the Founder/Teacher plan IDs, then proves that exactly two rows match, both
belong to the same owner, both remain pending and unresolved, neither produced
subscription or payment evidence, the unrelated active Plus entitlement is
unchanged, and there are no other duplicate-pending users. Any mismatch rolls
back the whole migration. A pristine replay may skip this production-only
cleanup only when `upgrade_requests` contains exactly zero rows; any nonempty
database must satisfy the full reviewed tuple and surrounding assertions.

The migration acquires `ACCESS EXCLUSIVE` locks on the affected catalogue and
membership tables before its advisory locks. Run it only during the planned
short maintenance window: this order lets an already-running legacy approval
finish before rollout and prevents a new legacy `SELECT ... FOR UPDATE` from
entering midway through the transactional schema change.

Migration 048 deliberately contains no transaction-control statements or
transaction opt-out directive. Apply it only through a supported Supabase
migration runner that owns one atomic transaction for the migration and its
history record; never execute the file piecemeal in the SQL Editor. The PGlite
suite opens an outer transaction only to simulate that runner boundary.

The isolated release rehearsal on 2026-10-02 pinned Supabase CLI `2.114.0`.
`supabase db reset --local --no-seed` replayed the complete clean chain through
048 with `LOCK TABLE` inside the runner-owned transaction. A separate local-only
late-failure probe then proved that both its schema/data changes and migration
history row rolled back, while the recorded 048 row and readiness marker
remained intact; the probe file was removed immediately afterwards. CLI
`2.115.0` and `2.116.0` are not approved for this release because the upstream
`LOCK TABLE` regression reports SQLSTATE `25P01`. Any replacement runner must
repeat this rehearsal. Partial application or migration-ledger drift is a
NO-GO; do not add `BEGIN`/`COMMIT` to the migration as a workaround.

The final migration statement inserts
`system.membership_payment_confirmation_v1_ready` into the existing public
feature catalogue without assigning it to any plan. The frontend may probe only
that pre-existing `features.id` contract before readiness; it must not select
the new payment/application columns or call the new mutation RPCs until the
marker exists.
