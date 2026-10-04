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
- `20260924170000_025_active_founder_capacity.sql`
- `20260925090000_026_resource_discovery_metadata.sql`
- `20260925100000_027_resource_new_badge.sql`

Migration `026` adds controlled multi-value grade metadata without guessing or
backfilling grades from free-form copy, appends only safe discovery fields to
`resource_catalog`, and keeps private destinations out of that view. It also
splits the existing favorites RLS policy into explicit own-row operations,
adds a large-list index, and provides an idempotent own-user save/remove RPC.
It does not recreate `saved_resources` or rewrite existing favorites.

Migration `027` appends a database-clock-derived
`is_new` field to the safe `resource_catalog` view. The seven-day window is
anchored to the stored `published_at` timestamp, so ordinary metadata edits do
not restart it; changing a resource away from published and publishing it again
continues to use the existing admin publish workflow and establishes a new
publication timestamp. No private destination is added to the view. It was
applied and recorded on the live project on 2026-09-24; a follow-up CLI dry-run
reported the remote database up to date.

The live ledger was rechecked on 2026-09-27. The following Batch 4 migrations
are applied and recorded on the live project in this order:

- `20260925110000_028_resource_access_featured_benefits.sql` — adds the
  canonical resource access predicate, resource-to-plan grants, curated
  featured positions, anonymous access for explicitly public resources, and a
  benefit catalogue derived only from enabled capabilities.
- `20260925120000_029_private_requests_reviews_reports.sql` — isolates teacher
  requests, adds entitlement-gated reviews with a sanitized public feed, and
  adds private, rate-limited resource issue reports for admin triage.
- `20260925130000_030_member_profile_avatars.sql` — limits self-service profile
  edits to display name/avatar data and provisions owner-scoped private avatar
  Storage objects served through short-lived signed URLs.

Their combined SQL/RLS behavior is exercised by
`npm run test:platform-completion-sql`. Immediately before the catalogue
release below, the live ledger matched the local chain through migration
`030`.

Migration `20260927193000_031_public_vocab_defuse_resource.sql` publishes the
external **กู้ระเบิดคำศัพท์** web game as a free public catalogue resource. It
records the six primary grade levels, a production-hosted cover, and the
verified public game URL without storing a private file target or granting a
paid plan. The migration is idempotent and fails closed if the title, target,
or protected catalogue metadata conflicts with an existing row. It was
applied and recorded on the live project on 2026-09-27; a post-apply ledger
check confirmed that local and remote both contain version `20260927193000`.

Migration `20260927195000_032_public_treasure_chest_resource.sql` publishes the
external **เปิดหีบสมบัติ** team game as a free public catalogue resource. It
records the verified 120-question scope, both subject areas, all six primary
grade levels, the production Site URL, and a production-hosted cover. The
migration is idempotent, grants no paid plan, and fails closed when its title,
normalized target URL, or protected catalogue metadata conflicts. It was
applied and recorded on the live project on 2026-09-27; a post-apply ledger
check confirmed that local and remote both contain version `20260927195000`.

Migration `20260927203000_033_public_bingo_fun_resource.sql` publishes the
external **บิงโกหรรษา** game as a free public catalogue resource for Grades
1–3. It records the verified solo and whole-class modes, three complete content
sets, printable 3×3/4×4 boards, the production Site URL, and a
production-hosted cover. The migration is idempotent, grants no paid plan, and
fails closed when its title, normalized target URL, or protected catalogue
metadata conflicts. It was applied and recorded on the live project on
2026-09-27; a post-apply ledger check confirmed that local and remote both
contain version `20260927203000`.

Migration `20260927214500_034_public_picture_word_match_resource.sql`
publishes the external **จับคู่ภาพกับคำ** game as a free public catalogue
resource for Grades 1–3. It records the verified 24-pair, three-category scope,
solo and two-player modes, 4/6/8-pair difficulty options, the production Site
URL, and a production-hosted cover. The migration is idempotent, grants no paid
plan, and fails closed when its title, normalized target URL, or protected
catalogue metadata conflicts. It was applied and recorded on the live project
on 2026-09-27; a post-apply ledger check confirmed that local and remote both
contain version `20260927214500`.

Migration `20260928001500_035_public_mission_wheel_resource.sql` publishes the
external **วงล้อพิชิตภารกิจ** team game as a free public catalogue resource for
Grades 1–3. It records the verified 60-question, four-subject scope, easy and
medium levels, 2–4-team play, the production Site URL, and a production-hosted
cover. The migration is idempotent, grants no paid plan, and fails closed when
its title, normalized target URL, or protected catalogue metadata conflicts. It
was applied and recorded on the live project on 2026-09-28; a post-apply ledger
check confirmed that local and remote both contain version `20260928001500`.

Migration `20260928093000_036_public_vocab_fishing_resource.sql` publishes the
external **ตกปลาคำศัพท์** game as a free public catalogue resource for Grades
1–3. It records the reviewed 40-word, four-category scope, solo and fair
two-player modes, timed and untimed practice options, the production Site URL,
and a production-hosted cover. The migration is idempotent, grants no paid
plan, and fails closed when its title, normalized target URL, or protected
catalogue metadata conflicts. It was applied and recorded on the live project
on 2026-09-28; a post-apply ledger check confirmed that local and remote both
contain version `20260928093000`.

Migration `20260928100000_037_public_sentence_train_resource.sql` publishes the
external **รถไฟเรียงประโยค** game as a free public catalogue resource for
Grades 1–3. It records the reviewed 150-sentence, five-topic and three-level
scope, solo and cooperative-pair modes, the production Site URL, and a
production-hosted cover. The migration is idempotent, grants no paid plan, and
fails closed when its title, normalized target URL, or protected catalogue
metadata conflicts. It was applied and recorded on the live project on
2026-09-28; a post-apply ledger check confirmed that local and remote both
contain version `20260928100000`.

Migration `20260928103000_038_public_ice_cream_math_resource.sql` publishes the
external **ไอศกรีมคิดเลข** game as a free public catalogue resource for Grades
1–3. It records the verified code-generated addition/subtraction scope, three
number ranges, solo and alternating-pair modes, scored and practice options,
the production Site URL, and a production-hosted cover. The migration is
idempotent, grants no paid plan, and fails closed when its title, normalized
target URL, or protected catalogue metadata conflicts. It was applied and
recorded on the live project on 2026-09-28; a post-apply ledger check confirmed
that local and remote both contain version `20260928103000`.

Migration `20260928113000_039_public_word_squad_resource.sql` publishes the
external **Word Squad — รวมแก๊งคำศัพท์** game as a free public catalogue
resource for Grades 2–12. It records the reviewed 18-template, 72-group and
432-entry vocabulary bank, solo/pair/team/class modes, configurable board,
time, heart and hint options, the production Site URL, and a production-hosted
cover. The migration is idempotent, grants no paid plan, and fails closed when
its title, normalized target URL, or protected catalogue metadata conflicts.
It was applied and recorded on the live project on 2026-09-28; a post-apply
ledger check confirmed that local and remote both contain version
`20260928113000`.

Migration `20260928125500_040_public_daily_word_detective_resource.sql`
publishes the external **Daily Word Detective** game as a free public catalogue
resource for Grades 3–12. It records the reviewed 180-target and 598-word
allowed dictionary, 3–8-letter scope, solo/friend/class modes, configurable
level, category, attempt, time and hint settings, the production Site URL, and
a production-hosted cover. The migration is idempotent, grants no paid plan,
and fails closed when its title, normalized target URL, or protected catalogue
metadata conflicts. It was applied and recorded on the live project on
2026-09-28; a post-apply ledger check confirmed that local and remote both
contain version `20260928125500`.

Migration `20260928140000_041_public_listening_detective_resource.sql`
publishes the external **Listening Detective** game as a free public catalogue
resource for Kindergarten–Grade 12. It records the reviewed 600-clue bank,
six listening types, five age-adjusted levels, solo/2–12-player/2–4-team modes,
fair turn totals, American/British audio support, the production Site URL, and
a production-hosted cover. The migration is idempotent, grants no paid plan,
and fails closed when its title, normalized target URL, or protected catalogue
metadata conflicts. It was applied and recorded on the live project on
2026-09-28; a post-apply ledger check confirmed that local and remote both
contain version `20260928140000`.

Migration `20260929090000_042_public_sentence_train_grammar_resource.sql`
publishes the new **Sentence Train** grammar game as a separate free public
catalogue resource for Grades 2–9, without replacing the earlier Thai-titled
sentence-train game. It records the reviewed 810-sentence bank, six grammar
structures, three word-count bands, solo/2-player/2–4-team modes, fair turn
totals, the production Site URL, and its distinct production-hosted cover. The
migration is idempotent, grants no paid plan, and fails closed when its title,
normalized target URL, or protected catalogue metadata conflicts. It was applied
and recorded on the live project on 2026-09-29; a post-apply ledger check
confirmed that local and remote both contain version `20260929090000`.

Migration `20260929100000_043_public_grammar_boss_battle_resource.sql`
publishes **Grammar Boss Battle — ศึกบอสไวยากรณ์** as a free public catalogue
resource for Grades 3–12. It records the reviewed 576-question bank, six
grammar topics, four level bands, solo/2–4-team/whole-class modes, deterministic
score and boss-damage rules, the public production Site URL, and its distinct
production-hosted cover. The migration is idempotent, grants no paid plan, and
fails closed when its title, normalized target URL, or protected catalogue
metadata conflicts. It was applied and recorded on the live project on
2026-09-29; a post-apply ledger check confirmed that local and remote both
contain version `20260929100000`.

Migration `20260929110000_044_public_kaokham_resource.sql` publishes
**ก้าวคำ — ฟัง อ่าน สะกด เขียน** as a free public Thai literacy resource for
Grades 1–6. It records the six-step listen/read/spell/write journey, local-only
guest mode, teacher activity-code access without a student account, progressive
hints, mastery-separated scoring, and the no-ranking policy, together with the
production Site URL and its distinct cover. The migration is idempotent, grants
no paid plan, and fails closed when its title, normalized target URL, or
protected catalogue metadata conflicts. It was applied and recorded on the
live project on 2026-10-01; a post-apply ledger check confirmed that local and
remote both contain version `20260929110000`.

Migration `20261001150000_045_public_ar_phonics_quest_resource.sql` publishes
**AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร** as a free public English
resource for Kindergarten–Grade 3. It records the reviewed 78-word A–Z bank,
bundled audio, printable QR cards, camera and no-camera modes,
solo/2–12-player/2–4-team/whole-class play, fair turn totals, deterministic
100/50/0 scoring, local-only results, and the camera privacy lifecycle,
together with the production Site URL and its distinct cover. The migration is
idempotent, grants no paid plan, and fails closed when its title, normalized
target URL, or protected catalogue metadata conflicts. It was applied and
recorded on the live project on 2026-10-01; a post-apply ledger check confirmed
that local and remote both contain version `20261001150000`.

Migration `20261001165640_046_authenticated_electric_circuit_lab_resource.sql`
prepares **ห้องทดลองวงจรไฟฟ้า** as a free-after-sign-in science resource for
Grades 4–9. It records the three basic, series, and parallel circuit models,
primary and secondary display levels, eight conductor/insulator materials, six
guided repair and reasoning missions, the 30–45-minute teacher guide, the
production Site URL, and its distinct cover. The migration is idempotent,
requires a permanent KruAorry account, grants no paid plan, and fails closed
when its title, normalized target URL, or protected catalogue metadata
conflicts. It was applied and recorded on the live project on 2026-10-01; a
post-apply ledger check confirmed that local and remote both contain version
`20261001165640`.

Migration `20261001180000_047_authenticated_ecosystem_guardians_resource.sql`
prepares **ผู้พิทักษ์ระบบนิเวศ — Ecosystem Guardians** as a
free-after-sign-in science teaching resource for Grades 4–6. It records four
ecosystems, the eight-step explore/classify/build/simulate/analyze/restore/
review journey, food-chain and food-web arrow conventions, configurable
review lengths, accessible drag-and-tap interaction, a 40–50-minute teacher
guide with a shorter lesson path, the production Site URL, and its distinct
cover. The migration is idempotent, requires a permanent KruAorry account,
grants no paid plan, and fails closed when its title, normalized target URL,
or protected catalogue metadata conflicts. The Site and cover were verified,
the dry-run named only this migration, and it was applied on 2026-10-01; a
post-apply ledger check confirmed local and remote version `20261001180000`.

Migration `20261001190000_048_founder_payment_confirmation.sql` is **pending**.
It makes 299 THB a first-year Founder offer for only the first 100 payments
confirmed by an admin, sets Founder and Teacher renewal to 599 THB/year, and
adds idempotent application, activation and renewal RPCs. Pending applications
do not reserve a place, and a member can have only one pending application
across all plans; switching from Founder to Teacher uses the explicit conversion
RPC. The permanent Founder ledger receives a structurally bounded slot 1–100
only inside successful activation, cannot be deleted or reassigned, and remains
consumed after expiry, cancellation or account deletion. The migration also
adds an admin-readable, browser-append-only payment-confirmation audit
containing reference metadata only, never a slip.

Migration 048 originally lets members call an authenticated idempotent
reporting RPC. Its
`payment_reported_at` marker separates awaiting-payment from awaiting-review
without granting access or reserving a Founder place. A retry returns the
original marker even if capacity filled after that first report. Once Founder
is full, a new report or admin confirmation for a pending Founder quote is
blocked; the request can only proceed through the explicit conversion RPC,
which preserves its reference, requotes canonical Teacher at 599 THB and clears
any report made against the old quote. Migration 050 below supersedes the
member-facing reporting step while retaining this function for schema history.

Migration 048 contains one narrowly scoped, fail-closed reconciliation for the
two owner test applications confirmed by the production read-only audit. It
matches the exact non-identifying `created_at` and `resolved_at` instants plus
the Founder/Teacher plan IDs; no production request, account or payment
identifier is committed. Before writing, it proves that exactly two rows match,
both belong to the same owner, both are already declined and resolved at the
reviewed instants, every resolution occurs at or after creation, no payment or
subscription evidence is linked to either request, no duplicate-pending member
exists, and the separate active Plus subscription/profile still matches the
audited state. It preserves each existing status and resolution instant,
backfills only `resolution_reason_code = 'owner_test_cleanup'`, leaves
`resolved_by` null because the pre-048 schema did not record an actor, and
appends two immutable resolution audit rows before creating the
one-pending-request index. Any mismatch, short write or failed postcondition
rolls the entire transaction back. The cleanup never grants a plan, changes the
existing Plus entitlement, consumes a Founder slot, invents a resolver, or
invents payment evidence.

For migration replay on a pristine database, 048 skips this production-only
cleanup only when `upgrade_requests` contains exactly zero rows (and therefore
no duplicate-pending owner). The zero-row condition is checked again immediately
before reconciliation. Any nonempty request history—whether one unrelated row,
an incomplete target pair, or a changed target—must satisfy the full audited
production shape or the transaction fails closed. This keeps fresh database
reconstruction portable without broadening the production data repair.

It also fails before membership DDL if the historical Founder ledger contains
any legacy grant, because migrations 019–025 did not record explicit
payment-confirmation provenance. Those rows require a separate reviewed audit
and reconciliation; 048 never guesses that an older grant was paid.

Migration 048 contains no `BEGIN`, `COMMIT`, `ROLLBACK`, or transaction opt-out
directive. It must run through a supported Supabase migration runner that wraps
the whole file in one transaction and keeps the schema/data changes atomic with
the migration-history write; do not paste or execute its statements piecemeal
in the SQL Editor. The PGlite regression harness opens an outer transaction only
to simulate that runner boundary—the migration file must not control it.

The migration takes the affected-table `ACCESS EXCLUSIVE` locks before its
advisory locks to keep legacy RPC lock order from deadlocking the rollout,
rejects partially installed schema, and checks its postconditions before adding
the unassigned system feature
`system.membership_payment_confirmation_v1_ready` as its final readiness marker.
Clients must probe only that pre-existing `features.id` contract and remain
fail-closed until the marker exists. Payment-confirmed approvals and ordinary
admin declines append immutable application-resolution audit rows using
`payment_confirmed` and `admin_declined` respectively.

Before applying `048`, confirm no unexpected direct clients still call the now
disabled `approve_upgrade_request` or `renew_subscription` RPCs. Run
`npm run test:membership-sql`, the migration-focused Vitest, a CLI dry-run and
real-role staging checks. The PGlite suite verifies transaction rollback and
idempotency in one embedded connection; a staging test with independent
Postgres connections is still required to validate advisory-lock contention.
The isolated release rehearsal on 2026-10-02 pinned Supabase CLI `2.114.0`.
`supabase db reset --local --no-seed` replayed the complete clean chain through
048 and proved that `LOCK TABLE` runs inside the runner-owned transaction. A
separate local-only late-failure migration then rolled back its table/data and
left no migration-history row; the recorded 048 row and readiness marker both
remained present. The temporary probe was removed after verification. CLI
`2.115.0` and `2.116.0` are not approved because of the upstream `LOCK TABLE`
SQLSTATE `25P01` regression. Pin `2.114.0` for this release, or rehearse any
replacement runner in the same way before use. A partial apply or
migration-ledger drift remains a release blocker; do not work around it by
adding transaction control back to the migration file. Recheck the migration
list after the rehearsal and again after any authorized production apply.

Before a migration push, recheck the live ledger and run a dry-run; do not
infer remote state from this dated note.

Migration `20261003120000_049_founder_first_year_once.sql` is **pending** and
must run after `048`. It exposes only the signed-in member's boolean Founder
history and rejects any new pending Founder application when that member is
already present in the permanent Founder ledger. The trigger takes the same
Founder-allocation advisory lock as payment confirmation before reading that
ledger, so a direct pending write cannot race a first grant. It does not rewrite
existing applications, subscriptions, payments, or ledger rows; Founder renewal
at the regular 599 THB/year price continues through the existing renewal RPC.

Migration `20261004100000_050_admin_line_slip_workflow.sql` is **pending** and
must run after `049`. It removes the member-facing execution grant from the old
self-report RPC and adds the admin-only, idempotent
`record_membership_line_slip_received(uuid)` RPC. For rollout compatibility the
RPC writes distinct `line_slip_received_at` and `line_slip_received_by`
provenance. It preserves any legacy, member-self-attested
`payment_reported_at`; when that field is empty, the RPC fills it only so old
readers keep working. A legacy timestamp alone never enables the new admin
confirmation UI. Recording receipt never activates a plan or reserves/consumes
a Founder place. A transition trigger clears receipt provenance whenever the
application plan or quote changes, and rejects a new payment confirmation until
an admin receipt exists. The existing confirmation transaction continues to
serialize the permanent 1–100 Founder allocation, validate the quoted amount,
write immutable payment/resolution audits, and safely return the original
result for an identical idempotency-key retry. The guard applies only to a new
confirmation transition, so previously completed payments and their retries
remain compatible. The migration asserts that 049's permanent-history function
and trigger still exist, changes no production row, and publishes the separate
`system.membership_line_slip_workflow_v1_ready` marker only after its privilege
checks pass. Clients continue to use 048's marker for the broader membership
page. Admin and member readers use legacy selects until 050's separate marker
is present, so a staggered rollout does not disable application creation or
read-only member statuses.

The Phase 1B catalogue preserves the live Plus plan's customer-facing copy
from `016d` while adding only lifecycle/pricing metadata. Migrations 019–025
are already applied: `019` contains durable Founder grant history, renewal lock
order and exact-file Storage policy; `020` adds Free favorites enforcement and
reasserts the same request, renewal, and Storage rules as defense in depth;
`021` exposes only a guarded aggregate of historical Founder grants to admins.
Migration `025` temporarily superseded the display/counting behavior with
current entitled Founder usage. Pending migration `048` restores the durable
ledger as the cumulative source of truth only after any unproven legacy grants
have been separately audited and reconciled, then hardens it as an irreversible
first-100 promotion record; once `048` is applied, places are never recycled.
