# Migrations

Filenames use the exact `<version>_<name>` recorded in
`supabase_migrations.schema_migrations` on the live project
(`ghwpmtmbqtchsrnagoir`), pulled directly from that table so this directory
matches applied history exactly.

**Applied on the live project** (verified directly against
`supabase_migrations.schema_migrations`, not inferred from this
directory): `001` through `016c` — 19 migrations, ending
`20260830103407_016c_admin_audit_log_actor_index.sql`.

**Present in this repo but NOT yet applied live** — prepared on review
branches, pending manual apply and/or merge approval; do not assume any
of these are live just because the file exists:
- `20260830120000_016d_plus_plan_truthful_features.sql` (branch
  `claude/hide-unavailable-features`) — Plus plan `features` copy fix.
- `20260901000000_017_serialize_owner_role_transitions.sql` (branch
  `claude/owner-role-concurrency-guard`) — closes a last-owner-guard race
  condition (see that file's own header for details).

These two are independent (disjoint objects — a `plans` row's `features`
column vs. two trigger functions) and can be applied in either order
without colliding, despite `016d` sorting before `017`.
