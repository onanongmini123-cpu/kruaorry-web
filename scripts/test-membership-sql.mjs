import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";

const files = [
  "20260901090000_017b_membership_catalog_and_capabilities.sql",
  "20260901090100_018_subscriptions_and_legacy_backfill.sql",
  "20260901090200_019_atomic_membership_rpcs_and_entitlement_rls.sql",
  "20260901090300_020_membership_safety_guards.sql",
  "20260901090400_021_founder_seat_usage.sql",
  "20260924170000_025_active_founder_capacity.sql",
  "20261001190000_048_founder_payment_confirmation.sql",
  "20261003120000_049_founder_first_year_once.sql",
  "20261004100000_050_admin_line_slip_workflow.sql",
];
const plusFeatures = [
  "คลังสื่อพร้อมสอนทั้งหมด",
  "เทมเพลต Google และฟอร์มพร้อมใช้งาน",
  "เครื่องมือในห้องเรียนครบชุด",
];
const legacyUser = randomUUID();
const ownerTestUser = randomUUID();
const ownerTestFounderCreatedAt = "2026-10-01T12:48:53.40514+00:00";
const ownerTestTeacherCreatedAt = "2026-10-01T12:49:04.996398+00:00";
const mismatchedTeacherCreatedAt = "2026-10-01T12:49:04.996399+00:00";
const ownerTestFounderResolvedAt = "2026-10-02T02:30:47.860132+00:00";
const ownerTestTeacherResolvedAt = "2026-10-02T02:30:48.6291+00:00";
const mismatchedFounderResolvedAt = "2026-10-02T02:30:47.860133+00:00";

async function rejectsWith(run, message) {
  await assert.rejects(run, (error) => String(error).includes(message));
}

// Executes the actual pending SQL against an isolated Postgres-compatible
// engine. The small baseline below only supplies objects introduced by older
// migrations; this is not a substitute for staging against a live DB copy.
const baselineSql = `
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create table public.profiles (
      id uuid primary key,
      plan text not null default 'free',
      role text not null default 'member',
      created_at timestamptz not null default now()
    );
    create table public.plans (
      id text primary key,
      name text not null,
      price_label text not null,
      note text,
      features text[] not null default '{}',
      sort_order integer not null default 0
    );
    insert into public.plans(id, name, price_label, note, features, sort_order)
    values ('free', 'Free', '0', null, '{}', 1),
      ('plus', 'Plus', '990 บาท/ปี', 'ต่ออายุทุกปี ยกเลิกได้ทุกเมื่อ',
       array['คลังสื่อพร้อมสอนทั้งหมด', 'เทมเพลต Google และฟอร์มพร้อมใช้งาน',
             'เครื่องมือในห้องเรียนครบชุด'], 2);
    create table public.resources (
      id uuid primary key,
      status text not null default 'published',
      is_free boolean not null default false,
      file_path text
    );
    create table public.saved_resources (
      user_id uuid not null references public.profiles(id) on delete cascade,
      resource_id uuid not null,
      primary key (user_id, resource_id)
    );
    create table public.upgrade_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id) on delete cascade,
      plan_id text not null references public.plans(id),
      status text not null default 'pending',
      created_at timestamptz not null default now(),
      resolved_at timestamptz
    );
    alter table public.upgrade_requests enable row level security;
    create policy "upgrade_requests_insert_own" on public.upgrade_requests
      for insert with check (auth.uid() = user_id);
    create policy "upgrade_requests_admin_update" on public.upgrade_requests
      for update using (true) with check (true);
    create function public.is_admin() returns boolean language sql stable security definer
      set search_path = public as $$
        select exists (select 1 from public.profiles
          where id = auth.uid() and role in ('admin', 'owner'));
      $$;
    create table storage.objects (name text, bucket_id text);
    alter table storage.objects enable row level security;
    create policy resource_files_entitled_read on storage.objects
      for select using (bucket_id = 'resource-files');
`;

async function createBaselineDb() {
  const instance = new PGlite({ extensions: { pgcrypto } });
  await instance.exec(baselineSql);
  return instance;
}

// Supabase owns the transaction around each migration and records the
// migration ledger in that same unit. PGlite executes raw SQL directly, so the
// harness supplies the runner boundary instead of allowing BEGIN/COMMIT inside
// a migration file.
async function runMigrationTransactionally(instance, migrationSql) {
  await instance.exec("begin;");
  try {
    await instance.exec(migrationSql);
    await instance.exec("commit;");
  } catch (error) {
    await instance.exec("rollback;");
    throw error;
  }
}

async function getPreservedPlusSnapshot(instance, userId, requestId, subscriptionId) {
  const result = await instance.query(`
    select
      profile.id as profile_id,
      profile.plan as profile_plan,
      profile.role as profile_role,
      request.id as request_id,
      request.user_id as request_user_id,
      request.plan_id as request_plan_id,
      request.status as request_status,
      request.created_at::text as request_created_at,
      request.resolved_at::text as request_resolved_at,
      subscription.id as subscription_id,
      subscription.user_id as subscription_user_id,
      subscription.plan_id as subscription_plan_id,
      subscription.status as subscription_status,
      subscription.source as subscription_source,
      subscription.approved_from_request_id,
      subscription.price_amount_thb,
      subscription.billing_interval,
      subscription.started_at::text as subscription_started_at,
      subscription.current_period_start::text as subscription_period_start,
      subscription.current_period_end::text as subscription_period_end,
      subscription.cancelled_at::text as subscription_cancelled_at,
      subscription.founder_started_at::text as subscription_founder_started_at,
      subscription.founder_status as subscription_founder_status,
      subscription.founder_price_lock,
      subscription.created_by,
      subscription.created_at::text as subscription_created_at,
      subscription.updated_at::text as subscription_updated_at
    from public.profiles profile
    join public.upgrade_requests request on request.id = $2
    join public.subscriptions subscription on subscription.id = $3
    where profile.id = $1
      and request.user_id = profile.id
      and subscription.user_id = profile.id
  `, [userId, requestId, subscriptionId]);
  assert.equal(result.rows.length, 1, "preserved Plus entitlement snapshot is incomplete");
  return result.rows[0];
}

const db = await createBaselineDb();

try {
  await db.query("insert into public.profiles(id, plan) values ($1, 'plus')", [legacyUser]);

  for (const file of files) {
    const migrationSql = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
    let preservedPlusSnapshot;

    if (file.includes("_048_")) {
      // Reproduce the reviewed production shape without copying any production
      // UUID or personal data. The owner has an unrelated approved Plus request
      // and current Plus subscription that reconciliation must preserve.
      await db.query(
        "insert into public.profiles(id, plan, role) values ($1, 'plus', 'owner')",
        [ownerTestUser],
      );
      const preservedPlusRequest = await db.query(`
        insert into public.upgrade_requests (
          user_id, plan_id, status, created_at, resolved_at
        ) values (
          $1, 'plus', 'approved', timestamptz '2026-09-30 12:00:00+00',
          timestamptz '2026-09-30 12:05:00+00'
        ) returning id
      `, [ownerTestUser]);
      const preservedPlusSubscription = await db.query(`
        insert into public.subscriptions (
          user_id, plan_id, status, source, approved_from_request_id,
          price_amount_thb, billing_interval, started_at,
          current_period_start, current_period_end
        ) values (
          $1, 'plus', 'active', 'upgrade_request', $2,
          990, 'year', timestamptz '2026-09-30 12:05:00+00',
          timestamptz '2026-09-30 12:05:00+00',
          timestamptz '2027-09-30 12:05:00+00'
        ) returning id
      `, [ownerTestUser, preservedPlusRequest.rows[0].id]);
      preservedPlusSnapshot = await getPreservedPlusSnapshot(
        db,
        ownerTestUser,
        preservedPlusRequest.rows[0].id,
        preservedPlusSubscription.rows[0].id,
      );

      const ownerTestRequests = await db.query(`
        insert into public.upgrade_requests (
          user_id, plan_id, status, created_at, resolved_at
        )
        values
          ($1, 'founder', 'declined', $2::timestamptz, $4::timestamptz),
          ($1, 'teacher', 'declined', $3::timestamptz, $5::timestamptz)
        returning id, plan_id
      `, [
        ownerTestUser,
        ownerTestFounderCreatedAt,
        mismatchedTeacherCreatedAt,
        ownerTestFounderResolvedAt,
        ownerTestTeacherResolvedAt,
      ]);
      assert.equal(ownerTestRequests.rows.length, 2);
      const founderOwnerTestRequest = ownerTestRequests.rows.find(
        (request) => request.plan_id === "founder",
      );
      const teacherOwnerTestRequest = ownerTestRequests.rows.find(
        (request) => request.plan_id === "teacher",
      );
      assert.ok(founderOwnerTestRequest);
      assert.ok(teacherOwnerTestRequest);

      await rejectsWith(
        () => runMigrationTransactionally(db, migrationSql),
        "Owner test reconciliation blocked:",
      );

      const rollbackState = await db.query(`
        select
          exists (
            select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'plans'
              and column_name = 'renewal_price_amount_thb'
          ) as renewal_column_exists,
          pg_catalog.to_regclass('public.membership_payment_confirmations') is not null
            as payment_audit_exists,
          exists (
            select 1 from public.features
            where id = 'system.membership_payment_confirmation_v1_ready'
          ) as readiness_marker_exists,
          (
            select count(*)::integer
            from public.upgrade_requests
            where user_id = $1 and status = 'declined' and resolved_at is not null
          ) as declined_owner_test_requests,
          (
            select count(*)::integer
            from public.upgrade_requests
            where user_id = $1 and status = 'approved' and plan_id = 'plus'
          ) as approved_plus_requests,
          (
            select count(*)::integer
            from public.subscriptions
            where id = $2 and user_id = $1 and plan_id = 'plus'
              and status = 'active' and approved_from_request_id = $3
          ) as active_plus_subscriptions,
          (select plan from public.profiles where id = $1) as profile_plan,
          (select count(*)::integer from public.founder_seat_ledger) as founder_seats
      `, [
        ownerTestUser,
        preservedPlusSubscription.rows[0].id,
        preservedPlusRequest.rows[0].id,
      ]);
      assert.deepEqual(rollbackState.rows[0], {
        renewal_column_exists: false,
        payment_audit_exists: false,
        readiness_marker_exists: false,
        declined_owner_test_requests: 2,
        approved_plus_requests: 1,
        active_plus_subscriptions: 1,
        profile_plan: "plus",
        founder_seats: 0,
      }, "failed 048 preflight left partial schema or readiness state");

      // Correct only the synthetic mismatch, then retry the same migration.
      // The retry must reconcile the exact reviewed shape atomically rather
      // than relying on destructive test-fixture cleanup.
      await db.query(`
        update public.upgrade_requests
        set created_at = $2::timestamptz
        where user_id = $1 and plan_id = 'teacher' and status = 'declined'
      `, [ownerTestUser, ownerTestTeacherCreatedAt]);

      const assertPre048Rollback = async (label) => {
        const state = await db.query(`
          select
            exists (
              select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'plans'
                and column_name = 'renewal_price_amount_thb'
            ) as renewal_column_exists,
            pg_catalog.to_regclass('public.membership_payment_confirmations') is not null
              as payment_audit_exists,
            pg_catalog.to_regclass('public.membership_application_resolution_audit') is not null
              as resolution_audit_exists,
            pg_catalog.to_regclass('public.upgrade_requests_one_pending_per_user') is not null
              as pending_index_exists,
            (
              select count(*)::integer
              from public.features
              where id = 'system.membership_payment_confirmation_v1_ready'
            ) as readiness_markers,
            (
              select count(*)::integer
              from public.upgrade_requests
              where user_id = $1 and status = 'declined' and resolved_at is not null
            ) as declined_owner_test_requests,
            (select count(*)::integer from public.founder_seat_ledger) as founder_seats
        `, [ownerTestUser]);
        assert.deepEqual(state.rows[0], {
          renewal_column_exists: false,
          payment_audit_exists: false,
          resolution_audit_exists: false,
          pending_index_exists: false,
          readiness_markers: 0,
          declined_owner_test_requests: 2,
          founder_seats: 0,
        }, `${label} left partial 048 schema or reconciled data behind`);
        assert.deepEqual(
          await getPreservedPlusSnapshot(
            db,
            ownerTestUser,
            preservedPlusRequest.rows[0].id,
            preservedPlusSubscription.rows[0].id,
          ),
          preservedPlusSnapshot,
          `${label} changed the preserved Plus membership`,
        );
      };

      const failClosedCases = [
        {
          label: "target reopened after reviewed cleanup",
          error: "both reviewed applications must remain declined and resolved as audited",
          arrange: () => db.query(
            "update public.upgrade_requests set status = 'pending', resolved_at = null where id = $1",
            [founderOwnerTestRequest.id],
          ),
          restore: () => db.query(
            "update public.upgrade_requests set status = 'declined', resolved_at = $2::timestamptz where id = $1",
            [founderOwnerTestRequest.id, ownerTestFounderResolvedAt],
          ),
        },
        {
          label: "declined target missing resolution instant",
          error: "both reviewed applications must remain declined and resolved as audited",
          arrange: () => db.query(
            "update public.upgrade_requests set resolved_at = null where id = $1",
            [teacherOwnerTestRequest.id],
          ),
          restore: () => db.query(
            "update public.upgrade_requests set resolved_at = $2::timestamptz where id = $1",
            [teacherOwnerTestRequest.id, ownerTestTeacherResolvedAt],
          ),
        },
        {
          label: "reviewed resolution instant changed by one microsecond",
          error: "both reviewed applications must remain declined and resolved as audited",
          arrange: () => db.query(
            "update public.upgrade_requests set resolved_at = $2::timestamptz where id = $1",
            [founderOwnerTestRequest.id, mismatchedFounderResolvedAt],
          ),
          restore: () => db.query(
            "update public.upgrade_requests set resolved_at = $2::timestamptz where id = $1",
            [founderOwnerTestRequest.id, ownerTestFounderResolvedAt],
          ),
        },
        {
          label: "non-owner target",
          error: "reviewed owner profile or Plus plan changed",
          arrange: () => db.query(
            "update public.profiles set role = 'member' where id = $1",
            [ownerTestUser],
          ),
          restore: () => db.query(
            "update public.profiles set role = 'owner' where id = $1",
            [ownerTestUser],
          ),
        },
        {
          label: "missing current Plus entitlement",
          error: "unrelated active Plus subscription no longer matches",
          arrange: () => db.query(
            "update public.upgrade_requests set status = 'declined' where id = $1",
            [preservedPlusRequest.rows[0].id],
          ),
          restore: () => db.query(
            "update public.upgrade_requests set status = 'approved' where id = $1",
            [preservedPlusRequest.rows[0].id],
          ),
        },
        {
          label: "target linked to an entitlement",
          error: "reviewed application is already linked to a subscription",
          arrange: async () => {
            await db.query(`
              insert into public.subscriptions (
                user_id, plan_id, status, source, approved_from_request_id,
                price_amount_thb, billing_interval, started_at,
                current_period_start, current_period_end
              ) values (
                $1, 'teacher', 'expired', 'upgrade_request', $2,
                599, 'year', timestamptz '2025-01-01 00:00:00+00',
                timestamptz '2025-01-01 00:00:00+00',
                timestamptz '2026-01-01 00:00:00+00'
              )
            `, [ownerTestUser, founderOwnerTestRequest.id]);
          },
          restore: () => db.query(`
            update public.subscriptions
            set approved_from_request_id = null
            where user_id = $1 and plan_id = 'teacher' and status = 'expired'
          `, [ownerTestUser]),
        },
        {
          label: "additional duplicate-pending owner",
          error: "expected no duplicate-pending member after the reviewed cleanup",
          arrange: async () => {
            const extraDuplicateUser = randomUUID();
            await db.query("insert into public.profiles(id) values ($1)", [extraDuplicateUser]);
            await db.query(`
              insert into public.upgrade_requests (user_id, plan_id, status)
              values ($1, 'founder', 'pending'), ($1, 'teacher', 'pending')
            `, [extraDuplicateUser]);
          },
          restore: () => db.query(`
            update public.upgrade_requests request
            set status = 'declined', resolved_at = now()
            where request.plan_id = 'teacher'
              and request.status = 'pending'
              and request.user_id <> $1
          `, [ownerTestUser]),
        },
      ];

      for (const testCase of failClosedCases) {
        await testCase.arrange();
        await rejectsWith(
          () => runMigrationTransactionally(db, migrationSql),
          testCase.error,
        );
        await testCase.restore();
        await assertPre048Rollback(testCase.label);
      }

      const cleanupMarker = "-- Reconcile the reviewed owner-only test applications only after the audit";
      const paymentEvidenceSql = migrationSql.replace(cleanupMarker, `
        insert into public.membership_payment_confirmations (
          idempotency_key, operation, request_id, user_id,
          application_reference_code, plan_id, amount_thb,
          payment_reference, paid_at, confirmed_by
        )
        select
          gen_random_uuid(), 'activation', request.id, request.user_id,
          request.reference_code, request.plan_id, 299,
          'test-only-payment-evidence', now(), request.user_id
        from public.upgrade_requests request
        where request.plan_id = 'founder'
          and request.created_at = timestamptz '${ownerTestFounderCreatedAt}';

        ${cleanupMarker}
      `);
      assert.notEqual(paymentEvidenceSql, migrationSql,
        "payment-evidence test could not locate the reconciliation marker");
      await rejectsWith(
        () => runMigrationTransactionally(db, paymentEvidenceSql),
        "reviewed application gained payment or entitlement evidence",
      );
      await assertPre048Rollback("payment-evidence mismatch");

      // Force the last readiness-marker insert to fail after metadata backfill
      // and both immutable audits have executed. The outer migration transaction
      // must restore the original declined rows and remove every 048 object.
      await db.exec(`
        create function public.reject_test_readiness_marker()
        returns trigger language plpgsql as $$
        begin
          if new.id = 'system.membership_payment_confirmation_v1_ready' then
            raise exception 'test-only late readiness failure';
          end if;
          return new;
        end;
        $$;
        create trigger trg_reject_test_readiness_marker
          before insert on public.features
          for each row execute function public.reject_test_readiness_marker();
      `);
      await rejectsWith(
        () => runMigrationTransactionally(db, migrationSql),
        "test-only late readiness failure",
      );
      await assertPre048Rollback("late readiness failure");
      await db.exec(`
        drop trigger trg_reject_test_readiness_marker on public.features;
        drop function public.reject_test_readiness_marker();
      `);
    }

    await runMigrationTransactionally(db, migrationSql);
    process.stdout.write(`executed ${file}\n`);

    if (file.includes("_048_")) {
      assert.ok(preservedPlusSnapshot, "missing pre-migration Plus entitlement snapshot");
      const postMigrationPlusSnapshot = await getPreservedPlusSnapshot(
        db,
        ownerTestUser,
        preservedPlusSnapshot.request_id,
        preservedPlusSnapshot.subscription_id,
      );
      assert.deepEqual(
        postMigrationPlusSnapshot,
        preservedPlusSnapshot,
        "048 changed an identifier or entitlement-relevant field on the preserved Plus membership",
      );

      const reconciledRequests = await db.query(`
        select request.plan_id, request.status, request.resolution_reason_code,
          request.resolved_at, request.resolved_by,
          count(audit.id)::integer as audit_rows,
          min(audit.previous_status) as previous_status,
          min(audit.new_status) as new_status,
          min(audit.reason_code) as audit_reason_code,
          min(audit.resolved_by::text)::uuid as audit_resolved_by,
          bool_and(audit.resolved_at = request.resolved_at) as matching_resolved_at,
          request.resolved_at = case request.plan_id
            when 'founder' then $4::timestamptz
            when 'teacher' then $5::timestamptz
          end as exact_resolved_at,
          bool_and(audit.resolved_at = case request.plan_id
            when 'founder' then $4::timestamptz
            when 'teacher' then $5::timestamptz
          end) as exact_audit_resolved_at
        from public.upgrade_requests request
        left join public.membership_application_resolution_audit audit
          on audit.request_id = request.id
        where request.user_id = $1
          and request.plan_id in ('founder', 'teacher')
          and request.created_at in ($2::timestamptz, $3::timestamptz)
        group by request.id, request.plan_id, request.status,
          request.resolution_reason_code, request.resolved_at, request.resolved_by
        order by request.plan_id
      `, [
        ownerTestUser,
        ownerTestFounderCreatedAt,
        ownerTestTeacherCreatedAt,
        ownerTestFounderResolvedAt,
        ownerTestTeacherResolvedAt,
      ]);
      assert.equal(reconciledRequests.rows.length, 2,
        "048 deleted or failed to retain one of the reviewed owner-test requests");
      for (const request of reconciledRequests.rows) {
        assert.equal(request.status, "declined");
        assert.equal(request.resolution_reason_code, "owner_test_cleanup");
        assert.ok(request.resolved_at);
        assert.equal(request.exact_resolved_at, true,
          "048 changed a reviewed legacy resolution instant");
        assert.equal(request.resolved_by, null);
        assert.equal(request.audit_rows, 1);
        assert.equal(request.previous_status, "pending");
        assert.equal(request.new_status, "declined");
        assert.equal(request.audit_reason_code, "owner_test_cleanup");
        assert.equal(request.audit_resolved_by, null);
        assert.equal(request.matching_resolved_at, true);
        assert.equal(request.exact_audit_resolved_at, true,
          "048 audit did not retain the exact microsecond resolution instant");
      }

      const preservedState = await db.query(`
        select
          profile.plan as profile_plan,
          request.id as plus_request_id,
          request.status as plus_request_status,
          request.plan_id as plus_request_plan,
          subscription.id as subscription_id,
          subscription.plan_id as subscription_plan,
          subscription.status as subscription_status,
          subscription.approved_from_request_id,
          (select count(*)::integer from public.founder_seat_ledger) as founder_seats,
          (
            select count(*)::integer
            from public.upgrade_requests
            where user_id = $1
          ) as total_owner_requests,
          (
            select count(*)::integer
            from public.membership_application_resolution_audit
            where request_id in (
              select id from public.upgrade_requests
              where user_id = $1 and resolution_reason_code = 'owner_test_cleanup'
            )
          ) as cleanup_audit_rows
        from public.profiles profile
        join public.upgrade_requests request
          on request.user_id = profile.id
          and request.plan_id = 'plus'
          and request.status = 'approved'
        join public.subscriptions subscription
          on subscription.user_id = profile.id
          and subscription.plan_id = 'plus'
          and subscription.status = 'active'
          and subscription.approved_from_request_id = request.id
        where profile.id = $1
      `, [ownerTestUser]);
      const preserved = preservedState.rows[0];
      assert.ok(preserved.plus_request_id);
      assert.ok(preserved.subscription_id);
      assert.equal(preserved.approved_from_request_id, preserved.plus_request_id,
        "the preserved Plus subscription was re-linked to a different application");
      assert.deepEqual({
        profile_plan: preserved.profile_plan,
        plus_request_status: preserved.plus_request_status,
        plus_request_plan: preserved.plus_request_plan,
        subscription_plan: preserved.subscription_plan,
        subscription_status: preserved.subscription_status,
        founder_seats: preserved.founder_seats,
        total_owner_requests: preserved.total_owner_requests,
        cleanup_audit_rows: preserved.cleanup_audit_rows,
      }, {
        profile_plan: "plus",
        plus_request_status: "approved",
        plus_request_plan: "plus",
        subscription_plan: "plus",
        subscription_status: "active",
        founder_seats: 0,
        total_owner_requests: 3,
        cleanup_audit_rows: 2,
      }, "048 changed the unrelated Plus membership or duplicated cleanup state");

      // Supabase's migration ledger prevents an applied migration from running
      // twice. Prove that an accidental direct retry still fails closed before
      // duplicating audit facts or disturbing the preserved entitlement.
      await rejectsWith(
        () => runMigrationTransactionally(db, migrationSql),
        "partial schema detected",
      );
      const retryState = await db.query(`
        select
          (
            select count(*)::integer
            from public.upgrade_requests
            where user_id = $1 and status = 'declined'
              and resolution_reason_code = 'owner_test_cleanup'
          ) as declined_cleanup_requests,
          (
            select count(*)::integer
            from public.membership_application_resolution_audit
            where user_id = $1 and reason_code = 'owner_test_cleanup'
          ) as cleanup_audit_rows,
          (
            select count(*)::integer
            from public.subscriptions
            where user_id = $1 and plan_id = 'plus' and status = 'active'
          ) as active_plus_subscriptions,
          (select plan from public.profiles where id = $1) as profile_plan,
          (select count(*)::integer from public.founder_seat_ledger) as founder_seats,
          (
            select count(*)::integer
            from public.features
            where id = 'system.membership_payment_confirmation_v1_ready'
          ) as readiness_markers
      `, [ownerTestUser]);
      assert.deepEqual(retryState.rows[0], {
        declined_cleanup_requests: 2,
        cleanup_audit_rows: 2,
        active_plus_subscriptions: 1,
        profile_plan: "plus",
        founder_seats: 0,
        readiness_markers: 1,
      }, "an accidental 048 retry changed reconciled membership state");
    }

    if (file.includes("_019_")) {
      const policy = await db.query(`
        select qual from pg_policies
        where schemaname = 'storage' and tablename = 'objects'
          and policyname = 'resource_files_entitled_read'
      `);
      assert.match(policy.rows[0].qual, /r\.file_path = objects\.name/);

      const interimAdmin = randomUUID();
      const interimTeacher = randomUUID();
      await db.query("insert into public.profiles(id, role) values ($1, 'owner')", [interimAdmin]);
      await db.query("insert into public.profiles(id) values ($1)", [interimTeacher]);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [interimAdmin]);
      await rejectsWith(
        () => db.query(
          "select public.set_member_plan($1, 'teacher_pro', 'sql_regression_test')",
          [interimTeacher],
        ),
        "Plan is not available for new memberships",
      );
      const blockedPro = await db.query(`
        select p.plan, count(s.id)::integer as subscriptions
        from public.profiles p
        left join public.subscriptions s on s.user_id = p.id
        where p.id = $1
        group by p.plan
      `, [interimTeacher]);
      assert.deepEqual(
        blockedPro.rows[0],
        { plan: "free", subscriptions: 0 },
        "Teacher Pro assignment changed the membership or profile cache",
      );

      const pendingProUser = randomUUID();
      await db.query("insert into public.profiles(id) values ($1)", [pendingProUser]);
      const pendingPro = await db.query(`
        insert into public.upgrade_requests(user_id, plan_id)
        values ($1, 'teacher_pro') returning id
      `, [pendingProUser]);
      await rejectsWith(
        () => db.query("select public.approve_upgrade_request($1)", [pendingPro.rows[0].id]),
        "Plan is not available for new memberships",
      );
      const rejectedProApproval = await db.query(`
        select r.status, r.resolved_at, p.plan,
          count(s.id)::integer as subscriptions
        from public.upgrade_requests r
        join public.profiles p on p.id = r.user_id
        left join public.subscriptions s on s.user_id = r.user_id
        where r.id = $1
        group by r.status, r.resolved_at, p.plan
      `, [pendingPro.rows[0].id]);
      assert.deepEqual(
        rejectedProApproval.rows[0],
        { status: "pending", resolved_at: null, plan: "free", subscriptions: 0 },
        "Rejected Teacher Pro approval did not roll back cleanly",
      );

      await db.query(
        "select public.set_member_plan($1, 'teacher', 'sql_regression_test')",
        [interimTeacher],
      );
      await db.query(
        "select public.set_member_plan($1, 'free', 'sql_regression_test')",
        [interimTeacher],
      );
      const downgradedToFree = await db.query(`
        select p.plan, (
          count(s.id) filter (where s.status in ('active', 'past_due'))
        )::integer as active_subscriptions
        from public.profiles p
        left join public.subscriptions s on s.user_id = p.id
        where p.id = $1
        group by p.plan
      `, [interimTeacher]);
      assert.deepEqual(
        downgradedToFree.rows[0],
        { plan: "free", active_subscriptions: 0 },
        "019 blocked an admin downgrade to Free",
      );

      const pendingPlusUser = randomUUID();
      await db.query("insert into public.profiles(id) values ($1)", [pendingPlusUser]);
      const pendingPlus = await db.query(`
        insert into public.upgrade_requests(user_id, plan_id)
        values ($1, 'plus') returning id
      `, [pendingPlusUser]);
      await db.query("select public.approve_upgrade_request($1)", [pendingPlus.rows[0].id]);
      const approvedPlus = await db.query(`
        select plan_id, source from public.subscriptions
        where user_id = $1 and status = 'active'
      `, [pendingPlusUser]);
      assert.deepEqual(
        approvedPlus.rows[0],
        { plan_id: "plus", source: "upgrade_request" },
        "019 rejected a preserved pending Plus request",
      );

      const interimProUser = randomUUID();
      await db.query("insert into public.profiles(id) values ($1)", [interimProUser]);
      const interimPro = await db.query(`
        insert into public.subscriptions (
          user_id, plan_id, status, source, billing_interval,
          current_period_start, current_period_end, price_amount_thb
        ) values ($1, 'teacher_pro', 'active', 'admin', 'year',
          now() - interval '1 year', now() - interval '1 day', 500) returning id
      `, [interimProUser]);
      await db.query("select public.renew_subscription($1)", [interimPro.rows[0].id]);
      const interimProState = await db.query(`
        select s.price_amount_thb, p.plan from public.subscriptions s
        join public.profiles p on p.id = s.user_id where s.id = $1
      `, [interimPro.rows[0].id]);
      assert.deepEqual(
        interimProState.rows[0],
        { price_amount_thb: 990, plan: "teacher_pro" },
        "019 blocked renewal of an existing Teacher Pro membership",
      );

      const interimSubscription = await db.query(`
        insert into public.subscriptions (
          user_id, plan_id, status, source, billing_interval,
          current_period_start, current_period_end, price_amount_thb
        ) values ($1, 'teacher', 'active', 'admin', 'year',
          now() - interval '1 year', now() - interval '1 day', 500) returning id
      `, [interimTeacher]);
      await db.query("select public.renew_subscription($1)", [interimSubscription.rows[0].id]);
      const interimPrice = await db.query(
        "select price_amount_thb from public.subscriptions where id = $1",
        [interimSubscription.rows[0].id],
      );
      assert.equal(interimPrice.rows[0].price_amount_thb, 599, "019 alone kept an old renewal price");
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      // Keep the later reconciliation fixture production-like: its shared
      // application owner is the sole resolver candidate at migration time.
      await db.query("update public.profiles set role = 'member' where id = $1", [interimAdmin]);
    }
  }

  // A fresh install has no historic applications to reconcile. Replay the
  // entire active membership chain on a second pristine database and prove
  // the production-only cleanup branch is skipped without weakening 048.
  const pristineDb = await createBaselineDb();
  try {
    for (const file of files) {
      await runMigrationTransactionally(
        pristineDb,
        readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"),
      );
    }
    const pristineState = await pristineDb.query(`
      select
        (select count(*)::integer from public.upgrade_requests) as applications,
        (
          select count(*)::integer
          from public.membership_application_resolution_audit
        ) as resolution_audits,
        (select count(*)::integer from public.founder_seat_ledger) as founder_seats,
        (
          select count(*)::integer from public.features
          where id = 'system.membership_payment_confirmation_v1_ready'
        ) as readiness_markers,
        (
          select count(*)::integer from public.features
          where id = 'system.membership_line_slip_workflow_v1_ready'
        ) as line_slip_readiness_markers,
        pg_catalog.to_regclass('public.upgrade_requests_one_pending_per_user') is not null
          as pending_index_exists
    `);
    assert.deepEqual(pristineState.rows[0], {
      applications: 0,
      resolution_audits: 0,
      founder_seats: 0,
      readiness_markers: 1,
      line_slip_readiness_markers: 1,
      pending_index_exists: true,
    }, "pristine membership migration replay did not complete cleanly");
  } finally {
    await pristineDb.close();
  }

  const readinessMarker = await db.query(`
    select count(*)::integer as count
    from public.features
    where id = 'system.membership_payment_confirmation_v1_ready'
  `);
  assert.equal(readinessMarker.rows[0].count, 1,
    "048 did not publish exactly one final membership schema-readiness marker");

  const plus = await db.query("select features from public.plans where id = 'plus'");
  assert.deepEqual(plus.rows[0].features, plusFeatures, "016d Plus copy was overwritten");
  const teacherPro = await db.query(
    "select is_public, is_upgradeable from public.plans where id = 'teacher_pro'",
  );
  assert.deepEqual(
    teacherPro.rows[0],
    { is_public: false, is_upgradeable: false },
    "Teacher Pro must stay hidden until its advanced capabilities ship",
  );
  const legacy = await db.query(
    "select source, status, current_period_end from public.subscriptions where user_id = $1",
    [legacyUser],
  );
  assert.equal(legacy.rows[0].source, "legacy");
  assert.equal(legacy.rows[0].status, "active");
  assert.equal(legacy.rows[0].current_period_end, null);

  const freeUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [freeUser]);
  for (let n = 0; n < 10; n += 1) {
    await db.query(
      "insert into public.saved_resources(user_id, resource_id) values ($1, $2)",
      [freeUser, randomUUID()],
    );
  }
  await rejectsWith(
    () => db.query("insert into public.saved_resources(user_id, resource_id) values ($1, $2)", [freeUser, randomUUID()]),
    "Saved resource limit reached",
  );

  const prices = await db.query(`
    select id, price_amount_thb, renewal_price_amount_thb
    from public.plans where id in ('founder', 'teacher') order by id
  `);
  assert.deepEqual(prices.rows, [
    { id: "founder", price_amount_thb: 299, renewal_price_amount_thb: 599 },
    { id: "teacher", price_amount_thb: 599, renewal_price_amount_thb: 599 },
  ]);

  const memberMutationPrivileges = await db.query(`
    select
      has_function_privilege('anon', 'public.report_membership_payment(uuid)', 'execute') as anon_report,
      has_function_privilege('authenticated', 'public.report_membership_payment(uuid)', 'execute') as member_report,
      has_function_privilege('anon', 'public.record_membership_line_slip_received(uuid)', 'execute') as anon_line_slip,
      has_function_privilege('authenticated', 'public.record_membership_line_slip_received(uuid)', 'execute') as authenticated_line_slip,
      has_function_privilege('anon', 'public.convert_founder_application_to_teacher(uuid)', 'execute') as anon_convert,
      has_function_privilege('authenticated', 'public.convert_founder_application_to_teacher(uuid)', 'execute') as member_convert,
      has_function_privilege('anon', 'public.has_my_founder_history()', 'execute') as anon_founder_history,
      has_function_privilege('authenticated', 'public.has_my_founder_history()', 'execute') as member_founder_history
  `);
  assert.deepEqual(memberMutationPrivileges.rows[0], {
    anon_report: false,
    member_report: false,
    anon_line_slip: false,
    authenticated_line_slip: true,
    anon_convert: false,
    member_convert: true,
    anon_founder_history: false,
    member_founder_history: true,
  }, "membership mutation RPC execute grants do not match the member/admin workflow boundary");

  const admin = randomUUID();
  await db.query("insert into public.profiles(id, role) values ($1, 'owner')", [admin]);

  const setActor = async (userId) => {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  };
  const createApplication = async (userId, planId) => {
    await setActor(userId);
    const result = await db.query("select * from public.create_membership_application($1)", [planId]);
    return result.rows[0];
  };
  const recordLineSlip = async (requestId) => {
    await setActor(admin);
    const result = await db.query("select * from public.record_membership_line_slip_received($1)", [requestId]);
    return result.rows[0];
  };
  const convertFounderApplication = async (userId, requestId) => {
    await setActor(userId);
    const result = await db.query(
      "select * from public.convert_founder_application_to_teacher($1)",
      [requestId],
    );
    return result.rows[0];
  };
  const confirmApplication = async (
    requestId,
    amount,
    paymentReference,
    idempotencyKey,
    paidAt = new Date().toISOString(),
  ) => {
    await setActor(admin);
    const result = await db.query(
      "select public.confirm_membership_payment($1, $2, $3, $4, $5) as subscription_id",
      [requestId, amount, paymentReference, paidAt, idempotencyKey],
    );
    return result.rows[0].subscription_id;
  };
  const confirmRenewal = async (
    subscriptionId,
    amount,
    paymentReference,
    idempotencyKey,
    paidAt = new Date().toISOString(),
  ) => {
    await setActor(admin);
    const result = await db.query(
      "select public.confirm_subscription_renewal($1, $2, $3, $4, $5) as period_end",
      [subscriptionId, amount, paymentReference, paidAt, idempotencyKey],
    );
    return result.rows[0].period_end;
  };

  const declinedUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [declinedUser]);
  const declinedApplication = await createApplication(declinedUser, "teacher");
  await setActor(admin);
  await db.query("select public.decline_upgrade_request($1)", [declinedApplication.id]);
  const declinedState = await db.query(`
    select request.status, request.resolution_reason_code,
      request.resolved_by, audit.previous_status, audit.new_status,
      audit.reason_code, audit.resolved_by as audit_resolved_by
    from public.upgrade_requests request
    join public.membership_application_resolution_audit audit
      on audit.request_id = request.id
    where request.id = $1
  `, [declinedApplication.id]);
  assert.deepEqual(declinedState.rows[0], {
    status: "declined",
    resolution_reason_code: "admin_declined",
    resolved_by: admin,
    previous_status: "pending",
    new_status: "declined",
    reason_code: "admin_declined",
    audit_resolved_by: admin,
  }, "ordinary decline did not preserve its machine-readable resolution audit");
  await rejectsWith(
    () => db.query(
      "update public.membership_application_resolution_audit set reason_code = 'changed' where request_id = $1",
      [declinedApplication.id],
    ),
    "resolution audit facts cannot be changed",
  );
  await rejectsWith(
    () => db.query(
      "delete from public.membership_application_resolution_audit where request_id = $1",
      [declinedApplication.id],
    ),
    "resolution audit is append-only",
  );

  const firstFounderUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [firstFounderUser]);
  await setActor(firstFounderUser);
  assert.equal((await db.query("select public.has_my_founder_history() as value")).rows[0].value, false,
    "a member without a confirmed Founder grant was marked as historical Founder");
  const firstApplication = await createApplication(firstFounderUser, "founder");
  assert.match(firstApplication.reference_code, /^KA-\d{8,}$/);
  assert.equal(firstApplication.quoted_amount_thb, 299);
  assert.equal(firstApplication.status, "pending");
  assert.equal(firstApplication.payment_reported_at, null);
  assert.equal("user_id" in firstApplication, false, "application RPC leaked a member identifier");

  const repeatedApplication = await createApplication(firstFounderUser, "founder");
  assert.equal(repeatedApplication.id, firstApplication.id, "a pending application must be idempotent per member and plan");
  await rejectsWith(
    () => createApplication(firstFounderUser, "teacher"),
    "มีใบสมัครแพ็กเกจอื่นที่รอดำเนินการอยู่",
  );
  await rejectsWith(
    () => db.query(`
      insert into public.upgrade_requests (
        user_id, plan_id, status, quoted_amount_thb
      ) values ($1, 'teacher', 'pending', 599)
    `, [firstFounderUser]),
    "upgrade_requests_one_pending_per_user",
  );
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 0,
    "a pending application reserved a Founder place");

  await setActor(admin);
  await rejectsWith(
    () => db.query(
      "select public.confirm_membership_payment($1, 299, 'not-yet-reported', now(), $2)",
      [firstApplication.id, randomUUID()],
    ),
    "Member has not reported payment",
  );

  const otherMember = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [otherMember]);
  await setActor(otherMember);
  await rejectsWith(
    () => db.query("select * from public.record_membership_line_slip_received($1)", [firstApplication.id]),
    "Admin access required",
  );

  // A 048-era browser may have written this self-attested timestamp before
  // 050 revoked the member RPC. It must not count as admin LINE provenance or
  // permit confirmation until an admin explicitly records receipt.
  const legacyReportedAt = "2026-10-03T01:02:03.000Z";
  await db.query(
    "update public.upgrade_requests set payment_reported_at = $2 where id = $1",
    [firstApplication.id, legacyReportedAt],
  );
  await setActor(admin);
  await rejectsWith(
    () => confirmApplication(
      firstApplication.id,
      299,
      "legacy-self-attested-only",
      randomUUID(),
    ),
    "Admin-recorded LINE slip is required",
  );
  const legacyOnlyState = await db.query(`
    select line_slip_received_at, line_slip_received_by,
      payment_confirmed_at,
      (select count(*)::integer from public.membership_payment_confirmations
        where request_id = $1) as confirmations
    from public.upgrade_requests where id = $1
  `, [firstApplication.id]);
  assert.deepEqual(legacyOnlyState.rows[0], {
    line_slip_received_at: null,
    line_slip_received_by: null,
    payment_confirmed_at: null,
    confirmations: 0,
  }, "legacy member self-attestation bypassed admin receipt provenance");

  const firstReceipt = await recordLineSlip(firstApplication.id);
  const repeatedReceipt = await recordLineSlip(firstApplication.id);
  assert.equal(firstReceipt.payment_reported_at.toISOString(), new Date(legacyReportedAt).toISOString(),
    "admin receipt overwrote the preserved legacy member timestamp");
  assert.equal(firstReceipt.line_slip_received_by, admin,
    "admin receipt did not record its actor");
  assert.ok(firstReceipt.line_slip_received_at,
    "admin receipt did not record distinct LINE provenance");
  assert.equal(firstReceipt.payment_reported_at.toISOString(), repeatedReceipt.payment_reported_at.toISOString(),
    "recording the same LINE slip twice changed the compatibility timestamp");
  assert.equal(firstReceipt.line_slip_received_at.toISOString(), repeatedReceipt.line_slip_received_at.toISOString(),
    "recording the same LINE slip twice changed its admin receipt timestamp");
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 0,
    "recording a LINE slip reserved a Founder place");

  await setActor(admin);
  await rejectsWith(
    () => db.query(
      "select public.confirm_membership_payment($1, 599, 'wrong-founder-amount', now(), $2)",
      [firstApplication.id, randomUUID()],
    ),
    "does not match quoted amount",
  );
  const failedConfirmation = await db.query(`
    select status, payment_confirmed_at, payment_confirmed_amount_thb
    from public.upgrade_requests where id = $1
  `, [firstApplication.id]);
  assert.deepEqual(failedConfirmation.rows[0], {
    status: "pending",
    payment_confirmed_at: null,
    payment_confirmed_amount_thb: null,
  }, "a rejected confirmation left partial request state");
  assert.equal((await db.query("select count(*)::integer as count from public.membership_payment_confirmations")).rows[0].count, 0);

  await setActor(firstFounderUser);
  await rejectsWith(
    () => db.query(
      "select public.confirm_membership_payment($1, 299, 'member-cannot-confirm', now(), $2)",
      [firstApplication.id, randomUUID()],
    ),
    "Admin access required",
  );

  const firstActivationKey = randomUUID();
  const firstActivationPaidAt = new Date().toISOString();
  const firstFounderSubscription = await confirmApplication(
    firstApplication.id,
    299,
    "founder-payment-001",
    firstActivationKey,
    firstActivationPaidAt,
  );
  const retriedFounderSubscription = await confirmApplication(
    firstApplication.id,
    299,
    "founder-payment-001",
    firstActivationKey,
    firstActivationPaidAt,
  );
  assert.equal(retriedFounderSubscription, firstFounderSubscription, "activation retry did not return the original subscription");
  await rejectsWith(
    () => confirmApplication(
      firstApplication.id,
      299,
      "founder-payment-001",
      firstActivationKey,
      new Date(Date.parse(firstActivationPaidAt) + 1000).toISOString(),
    ),
    "Idempotency key was already used",
  );
  await setActor(firstFounderUser);
  assert.equal((await db.query("select public.has_my_founder_history() as value")).rows[0].value, true,
    "the confirmed Founder grant was not visible to its member as boolean history");
  await rejectsWith(
    () => createApplication(firstFounderUser, "founder"),
    "Founder first-year offer cannot be claimed twice",
  );
  await rejectsWith(
    () => db.query(`
      insert into public.upgrade_requests (
        user_id, plan_id, status, quoted_amount_thb
      ) values ($1, 'founder', 'pending', 299)
    `, [firstFounderUser]),
    "Founder first-year offer cannot be claimed twice",
  );

  const firstActivationState = await db.query(`
    select request.status, request.payment_confirmed_amount_thb,
      request.payment_reference, request.resolution_reason_code,
      subscription.price_amount_thb, subscription.plan_id,
      resolution.previous_status, resolution.new_status,
      resolution.reason_code
    from public.upgrade_requests request
    join public.subscriptions subscription on subscription.approved_from_request_id = request.id
    join public.membership_application_resolution_audit resolution
      on resolution.request_id = request.id
    where request.id = $1
  `, [firstApplication.id]);
  assert.deepEqual(firstActivationState.rows[0], {
    status: "approved",
    payment_confirmed_amount_thb: 299,
    payment_reference: "founder-payment-001",
    resolution_reason_code: "payment_confirmed",
    price_amount_thb: 299,
    plan_id: "founder",
    previous_status: "pending",
    new_status: "approved",
    reason_code: "payment_confirmed",
  });
  assert.equal((await db.query(
    "select count(*)::integer as count from public.membership_payment_confirmations where request_id = $1",
    [firstApplication.id],
  )).rows[0].count, 1, "activation retry duplicated its payment audit");
  assert.equal((await db.query(
    "select count(*)::integer as count from public.membership_application_resolution_audit where request_id = $1",
    [firstApplication.id],
  )).rows[0].count, 1, "activation retry duplicated its resolution audit");
  const firstPaymentFingerprint = createHash("sha256")
    .update("founder-payment-001")
    .digest("hex");
  assert.equal((await db.query(`
    select payment_reference_fingerprint
    from public.membership_payment_confirmations
    where request_id = $1
  `, [firstApplication.id])).rows[0].payment_reference_fingerprint, firstPaymentFingerprint,
  "payment-reference fingerprint did not match the normalized reference");
  await rejectsWith(
    () => db.query(
      "delete from public.membership_payment_confirmations where request_id = $1",
      [firstApplication.id],
    ),
    "Membership payment confirmations are append-only",
  );
  await rejectsWith(
    () => db.query(`
      update public.membership_payment_confirmations
      set amount_thb = 300 where request_id = $1
    `, [firstApplication.id]),
    "Membership payment confirmation facts cannot be changed",
  );

  const explicitConversionUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [explicitConversionUser]);
  const founderApplicationToConvert = await createApplication(explicitConversionUser, "founder");
  const preConversionReceipt = await recordLineSlip(founderApplicationToConvert.id);
  assert.ok(preConversionReceipt.payment_reported_at);
  const explicitConversion = await convertFounderApplication(
    explicitConversionUser,
    founderApplicationToConvert.id,
  );
  assert.equal(explicitConversion.id, founderApplicationToConvert.id);
  assert.equal(explicitConversion.reference_code, founderApplicationToConvert.reference_code);
  assert.equal(explicitConversion.plan_id, "teacher");
  assert.equal(explicitConversion.quoted_amount_thb, 599);
  assert.equal(explicitConversion.payment_reported_at, null,
    "conversion retained a LINE-slip receipt made against the old Founder quote");
  const convertedReceiptProvenance = await db.query(`
    select line_slip_received_at, line_slip_received_by
    from public.upgrade_requests where id = $1
  `, [founderApplicationToConvert.id]);
  assert.deepEqual(convertedReceiptProvenance.rows[0], {
    line_slip_received_at: null,
    line_slip_received_by: null,
  }, "conversion retained admin receipt provenance for the old Founder quote");
  const conversionRetry = await convertFounderApplication(
    explicitConversionUser,
    founderApplicationToConvert.id,
  );
  assert.equal(conversionRetry.reference_code, explicitConversion.reference_code);
  assert.equal(conversionRetry.plan_id, "teacher");
  const convertedLineSlip = await recordLineSlip(founderApplicationToConvert.id);
  const conversionRetryAfterReceipt = await convertFounderApplication(
    explicitConversionUser,
    founderApplicationToConvert.id,
  );
  assert.equal(
    conversionRetryAfterReceipt.payment_reported_at.toISOString(),
    convertedLineSlip.payment_reported_at.toISOString(),
    "an idempotent conversion retry cleared a later Teacher LINE-slip receipt",
  );
  const teacherReceiptAfterConversionRetry = await db.query(`
    select line_slip_received_at, line_slip_received_by
    from public.upgrade_requests where id = $1
  `, [founderApplicationToConvert.id]);
  assert.equal(
    teacherReceiptAfterConversionRetry.rows[0].line_slip_received_at.toISOString(),
    convertedLineSlip.line_slip_received_at.toISOString(),
    "an idempotent conversion retry cleared the Teacher receipt provenance",
  );
  assert.equal(teacherReceiptAfterConversionRetry.rows[0].line_slip_received_by, admin);
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 1,
    "conversion reserved or consumed a Founder place");

  const founderUsers = [firstFounderUser];
  // Reach 99 permanent grants. Every application is created before its own
  // confirmation and therefore never changes the public capacity by itself.
  for (let n = 2; n <= 99; n += 1) {
    const userId = randomUUID();
    founderUsers.push(userId);
    await db.query("insert into public.profiles(id) values ($1)", [userId]);
    const application = await createApplication(userId, "founder");
    await recordLineSlip(application.id);
    await confirmApplication(application.id, 299, `founder-payment-${String(n).padStart(3, "0")}`, randomUUID());
  }

  const hundredthFounderUser = randomUUID();
  const overCapacityFounderUser = randomUUID();
  const firstReceiptAtFullFounderUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1), ($2), ($3)", [
    hundredthFounderUser,
    overCapacityFounderUser,
    firstReceiptAtFullFounderUser,
  ]);
  const hundredthApplication = await createApplication(hundredthFounderUser, "founder");
  const overCapacityApplication = await createApplication(overCapacityFounderUser, "founder");
  const firstReceiptAtFullApplication = await createApplication(firstReceiptAtFullFounderUser, "founder");
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 99,
    "pending applications changed Founder capacity");

  const receiptBeforeCapacityFilled = await recordLineSlip(overCapacityApplication.id);
  await recordLineSlip(hundredthApplication.id);
  await confirmApplication(hundredthApplication.id, 299, "founder-payment-100", randomUUID());
  const retryAfterCapacityFilled = await recordLineSlip(overCapacityApplication.id);
  assert.equal(
    retryAfterCapacityFilled.line_slip_received_at.toISOString(),
    receiptBeforeCapacityFilled.line_slip_received_at.toISOString(),
    "a LINE-slip receipt retry stopped being idempotent after another member filled Founder capacity",
  );
  await rejectsWith(
    () => confirmApplication(overCapacityApplication.id, 299, "founder-payment-101", randomUUID()),
    "Founder 100 is full",
  );
  const firstReceiptAtFull = await recordLineSlip(firstReceiptAtFullApplication.id);
  assert.ok(firstReceiptAtFull.line_slip_received_at,
    "the factual LINE-slip receipt was not recorded after Founder capacity filled");
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 100,
    "recording a LINE slip after capacity filled changed Founder usage");

  const overCapacityState = await db.query(`
    select request.status, request.payment_reported_at is not null as payment_reported,
      request.line_slip_received_at is not null as line_slip_received,
      request.payment_confirmed_at,
      count(confirmation.id)::integer as confirmations,
      count(subscription.id)::integer as subscriptions
    from public.upgrade_requests request
    left join public.membership_payment_confirmations confirmation on confirmation.request_id = request.id
    left join public.subscriptions subscription on subscription.approved_from_request_id = request.id
    where request.id = $1
    group by request.status, request.payment_reported_at,
      request.line_slip_received_at, request.payment_confirmed_at
  `, [overCapacityApplication.id]);
  assert.deepEqual(overCapacityState.rows[0], {
    status: "pending",
    payment_reported: true,
    line_slip_received: true,
    payment_confirmed_at: null,
    confirmations: 0,
    subscriptions: 0,
  }, "the 101st confirmation did not roll back atomically");

  const originalOverCapacityReference = overCapacityApplication.reference_code;
  const convertedTeacher = await convertFounderApplication(
    overCapacityFounderUser,
    overCapacityApplication.id,
  );
  assert.equal(convertedTeacher.id, overCapacityApplication.id);
  assert.equal(convertedTeacher.reference_code, originalOverCapacityReference,
    "conversion replaced the member's application reference");
  assert.equal(convertedTeacher.plan_id, "teacher");
  assert.equal(convertedTeacher.quoted_amount_thb, 599);
  assert.equal(convertedTeacher.payment_reported_at, null);
  const repeatedConversion = await convertFounderApplication(
    overCapacityFounderUser,
    overCapacityApplication.id,
  );
  assert.equal(repeatedConversion.id, convertedTeacher.id);
  assert.equal(repeatedConversion.reference_code, originalOverCapacityReference);
  const convertedReceipt = await recordLineSlip(overCapacityApplication.id);
  const repeatedConvertedReceipt = await recordLineSlip(overCapacityApplication.id);
  assert.equal(convertedReceipt.line_slip_received_at.toISOString(), repeatedConvertedReceipt.line_slip_received_at.toISOString(),
    "Teacher LINE-slip receipt retry changed the original timestamp");
  const convertedTeacherSubscription = await confirmApplication(
    overCapacityApplication.id,
    599,
    "teacher-conversion-payment-001",
    randomUUID(),
  );
  const convertedState = await db.query(`
    select request.reference_code, request.plan_id, request.status,
      subscription.plan_id as subscription_plan
    from public.upgrade_requests request
    join public.subscriptions subscription on subscription.id = $2
    where request.id = $1
  `, [overCapacityApplication.id, convertedTeacherSubscription]);
  assert.deepEqual(convertedState.rows[0], {
    reference_code: originalOverCapacityReference,
    plan_id: "teacher",
    status: "approved",
    subscription_plan: "teacher",
  });

  await setActor(admin);
  const seatCount = await db.query("select public.get_founder_seat_count() as seats");
  assert.equal(seatCount.rows[0].seats, 100);
  const publicCapacity = await db.query("select * from public.get_founder_capacity()");
  assert.deepEqual(publicCapacity.rows[0], { used: 100, capacity: 100, remaining: 0, is_full: true });
  const slots = await db.query(`
    select count(*)::integer as count, count(distinct slot_number)::integer as distinct_count,
      min(slot_number)::integer as first_slot, max(slot_number)::integer as last_slot
    from public.founder_seat_ledger
  `);
  assert.deepEqual(slots.rows[0], { count: 100, distinct_count: 100, first_slot: 1, last_slot: 100 });
  await rejectsWith(
    () => db.query("delete from public.founder_seat_ledger where slot_number = 100"),
    "Founder promotion grants are append-only",
  );
  await rejectsWith(
    () => db.query(`
      update public.founder_seat_ledger
      set granted_at = granted_at + interval '1 second'
      where slot_number = 100
    `),
    "Founder promotion grants cannot be changed or reassigned",
  );
  await rejectsWith(
    () => db.query("update public.plans set renewal_price_amount_thb = null where id = 'founder'"),
    "plans_founder_offer_price",
  );

  await rejectsWith(
    () => db.query("select public.set_member_plan($1, 'founder', 'bypass_attempt')", [overCapacityFounderUser]),
    "Founder grants require confirm_membership_payment",
  );
  await rejectsWith(() => db.query(`
    insert into public.subscriptions (
      user_id, plan_id, status, source, billing_interval, price_amount_thb,
      current_period_end, founder_started_at, founder_status, founder_price_lock
    ) values ($1, 'founder', 'active', 'admin', 'year', 299,
      now() + interval '1 year', now(), 'active', true)
  `, [overCapacityFounderUser]), "Founder activation requires an admin-confirmed 299 THB payment application");
  await rejectsWith(
    () => db.query("select public.approve_upgrade_request($1)", [overCapacityApplication.id]),
    "approve_upgrade_request is disabled",
  );
  await rejectsWith(
    () => db.query("select public.renew_subscription($1)", [firstFounderSubscription]),
    "renew_subscription is disabled",
  );
  await rejectsWith(
    () => db.query(`
      update public.subscriptions
      set current_period_end = current_period_end + interval '1 year'
      where id = $1
    `, [firstFounderSubscription]),
    "Founder renewal requires an audited 599 THB payment confirmation",
  );

  const oldFounderPeriod = (await db.query(
    "select current_period_end from public.subscriptions where id = $1",
    [firstFounderSubscription],
  )).rows[0].current_period_end;
  await rejectsWith(
    () => confirmRenewal(firstFounderSubscription, 299, "founder-renewal-wrong", randomUUID()),
    "does not match renewal amount 599",
  );
  const founderRenewalKey = randomUUID();
  const founderRenewalPaidAt = new Date().toISOString();
  const founderRenewedUntil = await confirmRenewal(
    firstFounderSubscription,
    599,
    "founder-renewal-001",
    founderRenewalKey,
    founderRenewalPaidAt,
  );
  const founderRetryUntil = await confirmRenewal(
    firstFounderSubscription,
    599,
    "founder-renewal-001",
    founderRenewalKey,
    founderRenewalPaidAt,
  );
  assert.equal(founderRetryUntil.toISOString(), founderRenewedUntil.toISOString(), "renewal retry changed the period twice");
  await rejectsWith(
    () => confirmRenewal(
      firstFounderSubscription,
      599,
      "founder-renewal-001",
      founderRenewalKey,
      new Date(Date.parse(founderRenewalPaidAt) + 1000).toISOString(),
    ),
    "Idempotency key was already used",
  );
  assert.ok(founderRenewedUntil > oldFounderPeriod, "Founder renewal did not extend the period");
  const renewedFounder = await db.query(`
    select price_amount_thb, founder_price_lock, founder_status
    from public.subscriptions where id = $1
  `, [firstFounderSubscription]);
  assert.deepEqual(renewedFounder.rows[0], {
    price_amount_thb: 599,
    founder_price_lock: false,
    founder_status: "active",
  });
  assert.equal((await db.query(`
    select count(*)::integer as count from public.membership_payment_confirmations
    where subscription_id = $1 and operation = 'renewal'
  `, [firstFounderSubscription])).rows[0].count, 1, "renewal retry duplicated its payment audit");
  assert.equal((await db.query(`
    select count(*)::integer as count from public.subscription_events
    where subscription_id = $1 and event_type = 'renewed'
  `, [firstFounderSubscription])).rows[0].count, 1, "renewal retry duplicated its subscription event");
  await rejectsWith(
    () => confirmRenewal(firstFounderSubscription, 599, "different-operation", firstActivationKey),
    "Idempotency key was already used",
  );

  const expiredFounderUser = founderUsers[2];
  const expiredFounderSubscription = (await db.query(`
    select id from public.subscriptions
    where user_id = $1 and plan_id = 'founder'
  `, [expiredFounderUser])).rows[0].id;
  await setActor(admin);
  await db.query("select set_config('app.membership_plan_change_allowed', 'on', false)");
  await db.query("update public.profiles set plan = 'free' where id = $1", [expiredFounderUser]);
  await db.query("select set_config('app.membership_plan_change_allowed', 'off', false)");
  await db.query(`
    update public.subscriptions
    set status = 'expired',
      current_period_start = now() - interval '2 years',
      current_period_end = now() - interval '1 year',
      founder_status = 'expired',
      founder_price_lock = false
    where id = $1
  `, [expiredFounderSubscription]);
  await setActor(expiredFounderUser);
  assert.equal((await db.query("select public.has_my_founder_history() as value")).rows[0].value, true,
    "expiring Founder access erased the permanent first-year history");
  const expiredRenewalFloor = (await db.query("select now() as value")).rows[0].value;
  const expiredFounderRenewedUntil = await confirmRenewal(
    expiredFounderSubscription,
    599,
    "founder-expired-renewal-001",
    randomUUID(),
  );
  const expiredRenewalCeiling = (await db.query("select now() as value")).rows[0].value;
  const revivedFounder = await db.query(`
    select subscription.status, subscription.current_period_start,
      subscription.current_period_end, subscription.price_amount_thb,
      subscription.founder_status, subscription.founder_price_lock,
      profile.plan,
      subscription.current_period_end = subscription.current_period_start + interval '1 year'
        as is_fresh_annual_period
    from public.subscriptions subscription
    join public.profiles profile on profile.id = subscription.user_id
    where subscription.id = $1
  `, [expiredFounderSubscription]);
  assert.equal(revivedFounder.rows[0].status, "active");
  assert.equal(revivedFounder.rows[0].plan, "founder");
  assert.equal(revivedFounder.rows[0].price_amount_thb, 599);
  assert.equal(revivedFounder.rows[0].founder_status, "active");
  assert.equal(revivedFounder.rows[0].founder_price_lock, false);
  assert.equal(revivedFounder.rows[0].is_fresh_annual_period, true,
    "expired renewal did not start a fresh annual period");
  assert.ok(revivedFounder.rows[0].current_period_start >= expiredRenewalFloor);
  assert.ok(revivedFounder.rows[0].current_period_start <= expiredRenewalCeiling);
  assert.equal(
    revivedFounder.rows[0].current_period_end.toISOString(),
    expiredFounderRenewedUntil.toISOString(),
    "expired renewal returned a different period end from the stored subscription",
  );
  assert.equal((await db.query("select count(*)::integer as count from public.founder_seat_ledger")).rows[0].count, 100,
    "renewing an expired Founder membership consumed or recycled a promotion place");

  const teacherUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [teacherUser]);
  const teacherApplication = await createApplication(teacherUser, "teacher");
  assert.equal(teacherApplication.quoted_amount_thb, 599);
  await recordLineSlip(teacherApplication.id);
  let duplicateReferenceError;
  try {
    await confirmApplication(
      teacherApplication.id,
      599,
      "  FOUNDER-PAYMENT-001  ",
      randomUUID(),
    );
  } catch (error) {
    duplicateReferenceError = error;
  }
  assert.ok(duplicateReferenceError, "a normalized duplicate payment reference was accepted");
  const duplicateDiagnostic = [
    String(duplicateReferenceError),
    duplicateReferenceError?.detail,
    duplicateReferenceError?.where,
  ].filter(Boolean).join("\n");
  assert.match(duplicateDiagnostic, /membership_payment_reference_unique|payment_reference_fingerprint/);
  assert.ok(!duplicateDiagnostic.toLowerCase().includes("founder-payment-001"),
    "duplicate-reference diagnostics exposed the raw payment reference");
  assert.ok(duplicateDiagnostic.includes(firstPaymentFingerprint),
    "duplicate-reference diagnostics did not identify the one-way fingerprint");
  const teacherSubscription = await confirmApplication(
    teacherApplication.id,
    599,
    "teacher-payment-001",
    randomUUID(),
  );
  await confirmRenewal(teacherSubscription, 599, "teacher-renewal-001", randomUUID());
  const teacherState = await db.query(`
    select subscription.price_amount_thb, profile.plan
    from public.subscriptions subscription
    join public.profiles profile on profile.id = subscription.user_id
    where subscription.id = $1
  `, [teacherSubscription]);
  assert.deepEqual(teacherState.rows[0], { price_amount_thb: 599, plan: "teacher" });

  const legacySubscription = legacy.rows[0];
  const legacyId = await db.query("select id from public.subscriptions where user_id = $1", [legacyUser]);
  assert.equal(legacySubscription.source, "legacy");
  await rejectsWith(
    () => confirmRenewal(legacyId.rows[0].id, 990, "legacy-renewal", randomUUID()),
    "Preserved or non-annual",
  );

  const deletedFounderUser = founderUsers[1];
  const deletedPaymentCode = (await db.query(`
    select confirmation.application_reference_code
    from public.membership_payment_confirmations confirmation
    where confirmation.user_id = $1 and confirmation.operation = 'activation'
  `, [deletedFounderUser])).rows[0].application_reference_code;
  await db.query("delete from public.profiles where id = $1", [deletedFounderUser]);
  const ledgerAfterDeletion = await db.query(
    "select count(*)::integer as seats, count(user_id)::integer as linked from public.founder_seat_ledger",
  );
  assert.deepEqual(ledgerAfterDeletion.rows[0], { seats: 100, linked: 99 },
    "deleting an account recycled or retained identifying Founder ledger data");
  const auditAfterDeletion = await db.query(`
    select request_id, subscription_id, user_id, application_reference_code
    from public.membership_payment_confirmations
    where application_reference_code = $1 and operation = 'activation'
  `, [deletedPaymentCode]);
  assert.deepEqual(auditAfterDeletion.rows[0], {
    request_id: null,
    subscription_id: null,
    user_id: null,
    application_reference_code: deletedPaymentCode,
  }, "account deletion removed the non-identifying payment audit");
  assert.deepEqual((await db.query("select * from public.get_founder_capacity()")).rows[0],
    { used: 100, capacity: 100, remaining: 0, is_full: true },
    "account deletion recycled a Founder promotion place");

  process.stdout.write("SQL execution and membership behaviors passed in isolated PGlite.\n");
} finally {
  await db.close();
}
