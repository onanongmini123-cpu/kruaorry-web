# Migrations

Filenames use the exact `<version>_<name>` recorded in
`supabase_migrations.schema_migrations` on the live project
(`ghwpmtmbqtchsrnagoir`), pulled directly from that table so this directory
matches applied history exactly.

Applied on the live project: `001` through `016c` (18 migrations, ending
`20260830103407_016c_admin_audit_log_actor_index.sql`).

Pending Phase 1B migrations (not yet applied):

- `20260901090000_017_membership_catalog_and_capabilities.sql`
- `20260901090100_018_subscriptions_and_legacy_backfill.sql`
- `20260901090200_019_atomic_membership_rpcs_and_entitlement_rls.sql`
