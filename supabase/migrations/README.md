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
file's authority for "applied." Recorded history is still exactly 19
rows through `016c`; nothing below changes that count. Both, however,
have had their exact SQL run manually against the live project through
the Supabase SQL Editor and independently verified live — "applied" and
"live-verified" are not the same claim here, and both need stating
separately for each file:

- `20260830120000_016d_plus_plan_truthful_features.sql` — Plus plan
  `features` copy fix. Introduced/prepared on branch
  `claude/hide-unavailable-features`; not part of `main`'s history as of
  `main@49dba60605aa75cf8c28d0ea52699d08ccebb319`. **Live and verified,
  not recorded:** this file's exact `UPDATE` was run manually via the
  Supabase SQL Editor on 2026-09-01 and returned Success; a read-only
  query the same day confirmed the `plus` plan row's `features` column
  now holds exactly `['คลังสื่อพร้อมสอนทั้งหมด', 'เทมเพลต Google และฟอร์มพร้อมใช้งาน',
  'เครื่องมือในห้องเรียนครบชุด']` — the old false AI-tool wording is gone from
  the live row. No `schema_migrations` row was added for it.
- `20260901000000_017_serialize_owner_role_transitions.sql` — closes a
  last-owner-guard race condition (see that file's own header for
  details). Introduced by commit `ea0d9ad6c0cebcc8bc83804f59c7d82ededbb1f9`
  on branch `claude/owner-role-concurrency-guard`; exists on any
  branch/commit that contains that commit, including `main`, since
  merged. **Live and verified, not recorded:** its SQL was likewise
  manually run against the live project through the Supabase SQL Editor
  on 2026-09-01. Live-verified the same day that both
  `prevent_self_privilege_escalation()` and `prevent_last_owner_delete()`
  now contain the shared `pg_advisory_xact_lock(729310001)` call this
  migration adds — identical lock key in both, both still
  `SECURITY DEFINER` with `search_path = public` unchanged. No
  `schema_migrations` row was added for it either.

For both: a manual SQL Editor run is not the same as applying the
migration through Supabase's migration tooling, so this directory's
"applied" count above does not include either of them — recorded history
stays at 19 rows through `016c` regardless of what's live. Do not re-run
either file assuming nothing happened — the live objects already match
both files; what's missing in both cases is only the bookkeeping row.
Reconciling that (recording each properly, e.g. via `apply_migration`/CLI
so the rows are added, or treating the manual runs as the record of
truth) is a decision for whoever formally closes this out, not something
this note resolves on its own.

The two are independent (disjoint objects — a `plans` row's `features`
column vs. two trigger functions) and were applied/reconciled
independently without colliding, despite `016d` sorting before `017`.
