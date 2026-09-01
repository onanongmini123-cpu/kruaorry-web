# Migrations

Filenames use the exact `<version>_<name>` recorded in
`supabase_migrations.schema_migrations` on the live project
(`ghwpmtmbqtchsrnagoir`), pulled directly from that table so this directory
matches applied history exactly.

**Applied on the live project** (verified directly against
`supabase_migrations.schema_migrations`, not inferred from this
directory): `001` through `016c` — 19 migrations, ending
`20260830103407_016c_admin_audit_log_actor_index.sql`.

Two further migrations are prepared but **not applied live** (this is a
fact about the live database, not about any branch, so it stays true
regardless of what gets merged where). Provenance below is stated by
commit, not by "which branch currently has it" — branch-presence claims
go stale the moment a branch merges; a commit either introduced a file
or it didn't, permanently:

- `20260830120000_016d_plus_plan_truthful_features.sql` — Plus plan
  `features` copy fix. Introduced/prepared on branch
  `claude/hide-unavailable-features`. As of `main@9645162`, this file is
  not part of `main`'s history. If that's since changed (the branch was
  merged), check `supabase_migrations.schema_migrations` on the live
  project, not this note, for whether it's actually been applied.
- `20260901000000_017_serialize_owner_role_transitions.sql` — closes a
  last-owner-guard race condition (see that file's own header for
  details). Introduced by commit `ea0d9ad6c0cebcc8bc83804f59c7d82ededbb1f9`
  on branch `claude/owner-role-concurrency-guard`; it exists on that
  branch and on any branch/commit that contains that commit (including
  `main`, once merged). Its presence in a given checkout is therefore an
  ordinary git-history question, not something this file needs to track —
  what this file does need to state, and does above, is that it is not
  yet applied live regardless.

The two are independent (disjoint objects — a `plans` row's `features`
column vs. two trigger functions) and can be applied in either order
without colliding, despite `016d` sorting before `017`.
