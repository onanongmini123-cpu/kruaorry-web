# Migrations

Applied filenames use the exact `<version>_<name>` recorded in
`supabase_migrations.schema_migrations` on the live project
(`ghwpmtmbqtchsrnagoir`). Newer files in this directory are pending and
must be checked against the live ledger before application.

**Live ledger as verified on 2026-09-18:** `001` through `016c` (19
migrations), plus the following two migrations that were originally run
manually in the SQL Editor and subsequently reconciled with
`supabase migration repair --status applied` after verifying the live
objects matched their SQL. The repair added history records only; it did
not rerun their SQL:

- `20260830120000_016d_plus_plan_truthful_features.sql` — Plus plan
  `features` copy fix. Introduced/prepared on branch
  `claude/hide-unavailable-features`. **Live and recorded:** this file's
  exact `UPDATE` was run manually via the Supabase SQL Editor on
  2026-09-01 and returned Success; a read-only
  query the same day confirmed the `plus` plan row's `features` column
  now holds exactly `['คลังสื่อพร้อมสอนทั้งหมด', 'เทมเพลต Google และฟอร์มพร้อมใช้งาน',
  'เครื่องมือในห้องเรียนครบชุด']` — the old false AI-tool wording is gone from
  the live row. The CLI repair later recorded its version in
  `schema_migrations`.
- `20260901000000_017_serialize_owner_role_transitions.sql` — closes a
  last-owner-guard race condition (see that file's own header for
  details). Introduced by commit `ea0d9ad6c0cebcc8bc83804f59c7d82ededbb1f9`
  on branch `claude/owner-role-concurrency-guard`; exists on any
  branch/commit that contains that commit, including `main`, since
  merged. **Live and recorded:** its SQL was likewise
  manually run against the live project through the Supabase SQL Editor
  on 2026-09-01. Live-verified the same day that both
  `prevent_self_privilege_escalation()` and `prevent_last_owner_delete()`
  now contain the shared `pg_advisory_xact_lock(729310001)` call this
  migration adds — identical lock key in both, both still
  `SECURITY DEFINER` with `search_path = public` unchanged. The CLI repair
  later recorded its version in `schema_migrations`.

The two are independent (disjoint objects — a `plans` row's `features`
column vs. two trigger functions) and were applied/reconciled
independently without colliding, despite `016d` sorting before `017`.

The live ledger was rechecked with `supabase migration list` on 2026-09-24.
The following migrations are now applied and recorded on the live project:

- `20260901090000_017b_membership_catalog_and_capabilities.sql`
- `20260901090100_018_subscriptions_and_legacy_backfill.sql`
- `20260901090200_019_atomic_membership_rpcs_and_entitlement_rls.sql`
- `20260901090300_020_membership_safety_guards.sql`
- `20260901090400_021_founder_seat_usage.sql`
- `20260918090000_022_resource_file_signup_gate.sql`
- `20260918090100_023_split_public_resource_read_policy.sql`
- `20260919090000_024_demote_placeholder_seed_resources.sql`

`20260924170000_025_active_founder_capacity.sql` is the next additive
migration. It changes Founder availability from the historical grant ledger to
the current active-subscription aggregate, exposes that aggregate without
member identifiers, and keeps the 100-seat limit transactionally enforced.
It must be applied together with the frontend that consumes
`get_founder_capacity()`.

Before a migration push, recheck the live ledger and run a dry-run; do not
infer remote state from this dated note.

The Phase 1B catalogue deliberately preserves the live Plus plan's
customer-facing copy from `016d` while adding only lifecycle/pricing metadata.
Coordinate the database change and matching frontend release in a maintenance
window: existing production code reads target columns that `023` revokes,
while new code needs views and RPCs created only by these migrations.
`019` already
contains the durable Founder grant history, correct renewal lock order and price, and
exact-file Storage policy; `020` adds Free favorites enforcement and reasserts
the same request, renewal, and Storage rules as defense in depth. `021` exposes
only a guarded aggregate of historical Founder grants to admins; `025`
supersedes that display/counting behavior with the active Founder source of
truth while retaining the ledger solely to prevent reclaiming a lost price lock.
