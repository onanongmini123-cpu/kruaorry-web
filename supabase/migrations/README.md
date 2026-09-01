# Migrations

Filenames use the exact `<version>_<name>` recorded in
`supabase_migrations.schema_migrations` on the live project
(`ghwpmtmbqtchsrnagoir`), pulled directly from that table so this directory
matches applied history exactly.

**Applied on the live project** (verified directly against
`supabase_migrations.schema_migrations`, not inferred from this
directory): `001` through `016c` — 19 migrations, ending
`20260830103407_016c_admin_audit_log_actor_index.sql`.

Two further migrations are prepared but **not applied live**, and each
exists on only one branch — neither is present on `main`, and they are
not present together on any single branch:

- `20260830120000_016d_plus_plan_truthful_features.sql` — Plus plan
  `features` copy fix. Present **only** on branch
  `claude/hide-unavailable-features`; **not present** in this directory
  on `main` or on `claude/owner-role-concurrency-guard`. Do not look for
  this file outside that branch.
- `20260901000000_017_serialize_owner_role_transitions.sql` — closes a
  last-owner-guard race condition (see that file's own header for
  details). Present in this directory on branch
  `claude/owner-role-concurrency-guard`; not applied live, and not
  present on `main` until that branch is merged.

The two are independent (disjoint objects — a `plans` row's `features`
column vs. two trigger functions), each reserves its own version/number,
and they can be applied in either order without colliding once both
exist together — despite `016d` sorting before `017`.
