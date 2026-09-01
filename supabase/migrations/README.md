# Migrations

Filenames use the exact `<version>_<name>` recorded in
`supabase_migrations.schema_migrations` on the live project
(`ghwpmtmbqtchsrnagoir`), pulled directly from that table so this directory
matches applied history exactly.

**Applied on the live project** (verified directly against
`supabase_migrations.schema_migrations`, not inferred from this
directory): `001` through `016c` — 19 migrations, ending
`20260830103407_016c_admin_audit_log_actor_index.sql`.

Two further migrations exist and are **not recorded in
`supabase_migrations.schema_migrations`** — that table, not this
directory and not "how the live database currently behaves," is this
file's authority for "applied." Provenance below is stated by commit,
not by "which branch currently has it" — branch-presence claims go
stale the moment a branch merges; a commit either introduced a file or
it didn't, permanently:

- `20260830120000_016d_plus_plan_truthful_features.sql` — Plus plan
  `features` copy fix. Introduced/prepared on branch
  `claude/hide-unavailable-features`; not part of `main`'s history as of
  `main@49dba60605aa75cf8c28d0ea52699d08ccebb319`. Live-verified not
  applied (2026-09-01): the `plus` plan row's `features` column still
  contains the old, false AI-tool wording this migration replaces.
- `20260901000000_017_serialize_owner_role_transitions.sql` — closes a
  last-owner-guard race condition (see that file's own header for
  details). Introduced by commit `ea0d9ad6c0cebcc8bc83804f59c7d82ededbb1f9`
  on branch `claude/owner-role-concurrency-guard`; exists on any
  branch/commit that contains that commit, including `main`, since
  merged.

  **This one needs a nuance, not a flat "not applied":** its SQL was
  manually run against the live project through the Supabase SQL Editor
  on 2026-09-01. Live-verified the same day that both
  `prevent_self_privilege_escalation()` and `prevent_last_owner_delete()`
  now contain the shared `pg_advisory_xact_lock(729310001)` call this
  migration adds — identical lock key in both, both still
  `SECURITY DEFINER` with `search_path = public` unchanged. So the
  *behavior* this migration describes is live. What did **not** happen
  is a matching row being added to `schema_migrations` — a manual SQL
  Editor run is not the same as applying the migration through
  Supabase's migration tooling, and this directory's "applied" count
  above does not include it. Do not re-run this file's `CREATE OR
  REPLACE FUNCTION` statements assuming nothing happened — the
  functions already match it; what's missing is only the bookkeeping
  row. Reconciling that (recording it properly, e.g. via
  `apply_migration`/CLI so the row is added, or treating the manual run
  as the record of truth) is a decision for whoever formally closes this
  out, not something this note resolves on its own.

The two are independent (disjoint objects — a `plans` row's `features`
column vs. two trigger functions) and can be applied/reconciled in
either order without colliding, despite `016d` sorting before `017`.
