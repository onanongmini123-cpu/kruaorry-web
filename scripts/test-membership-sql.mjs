import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Executes the actual pending SQL against an isolated Postgres-compatible
// engine. The small baseline below only supplies objects introduced by older
// migrations; this is not a substitute for staging against a live DB copy.
const db = new PGlite();
const files = [
  "20260901090000_017b_membership_catalog_and_capabilities.sql",
  "20260901090100_018_subscriptions_and_legacy_backfill.sql",
  "20260901090200_019_atomic_membership_rpcs_and_entitlement_rls.sql",
  "20260901090300_020_membership_safety_guards.sql",
  "20260901090400_021_founder_seat_usage.sql",
  "20260924170000_025_active_founder_capacity.sql",
];
const plusFeatures = [
  "คลังสื่อพร้อมสอนทั้งหมด",
  "เทมเพลต Google และฟอร์มพร้อมใช้งาน",
  "เครื่องมือในห้องเรียนครบชุด",
];
const legacyUser = randomUUID();

async function rejectsWith(run, message) {
  await assert.rejects(run, (error) => String(error).includes(message));
}

try {
  await db.exec(`
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
      user_id uuid not null references public.profiles(id),
      resource_id uuid not null,
      primary key (user_id, resource_id)
    );
    create table public.upgrade_requests (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references public.profiles(id),
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
  `);
  await db.query("insert into public.profiles(id, plan) values ($1, 'plus')", [legacyUser]);

  for (const file of files) {
    await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    process.stdout.write(`executed ${file}\n`);

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
    }
  }

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

  let firstFounder;
  let secondFounder;
  let deletedFounderUser;
  for (let n = 0; n < 100; n += 1) {
    const user = randomUUID();
    if (n === 2) deletedFounderUser = user;
    await db.query("insert into public.profiles(id) values ($1)", [user]);
    const inserted = await db.query(`
      insert into public.subscriptions (
        user_id, plan_id, status, source, billing_interval, price_amount_thb,
        current_period_end, founder_started_at, founder_status, founder_price_lock
      ) values (
        $1, 'founder', $2, 'admin', 'year', 299,
        now() + interval '1 year', now(), $3, $4
      ) returning id
    `, [user, n === 0 ? "expired" : "active", n === 0 ? "lost_price_lock" : "active", n !== 0]);
    if (n === 0) firstFounder = inserted.rows[0].id;
    if (n === 1) secondFounder = inserted.rows[0].id;
  }
  // The expired historical row above no longer consumes active capacity, so
  // the 100th active Founder may now be admitted even though old grants remain
  // durable in the ledger.
  const nextFounder = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [nextFounder]);
  await db.query(`
    insert into public.subscriptions (
      user_id, plan_id, status, source, billing_interval, price_amount_thb,
      current_period_end, founder_started_at, founder_status, founder_price_lock
    ) values ($1, 'founder', 'active', 'admin', 'year', 299,
      now() + interval '1 year', now(), 'active', true)
  `, [nextFounder]);

  const overCapacityFounder = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [overCapacityFounder]);
  await rejectsWith(() => db.query(`
    insert into public.subscriptions (
      user_id, plan_id, status, source, billing_interval, price_amount_thb,
      current_period_end, founder_started_at, founder_status, founder_price_lock
    ) values ($1, 'founder', 'active', 'admin', 'year', 299,
      now() + interval '1 year', now(), 'active', true)
  `, [overCapacityFounder]), "Founder 100 is full");

  const admin = randomUUID();
  await db.query("insert into public.profiles(id, role) values ($1, 'owner')", [admin]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
  const seatCount = await db.query("select public.get_founder_seat_count() as seats");
  assert.equal(seatCount.rows[0].seats, 100, "admin sees active Founder seat usage");
  const publicCapacity = await db.query("select * from public.get_founder_capacity()");
  assert.deepEqual(publicCapacity.rows[0], { used: 100, capacity: 100, remaining: 0, is_full: true });
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [nextFounder]);
  await rejectsWith(() => db.query("select public.get_founder_seat_count()"), "Admin access required");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [admin]);
  await rejectsWith(
    () => db.query("select public.renew_subscription($1)", [firstFounder]),
    "Cancelled, revoked, or expired",
  );
  const legacySubscription = legacy.rows[0];
  const legacyId = await db.query("select id from public.subscriptions where user_id = $1", [legacyUser]);
  assert.equal(legacySubscription.source, "legacy");
  await rejectsWith(
    () => db.query("select public.renew_subscription($1)", [legacyId.rows[0].id]),
    "Preserved or non-annual",
  );

  const teacherUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [teacherUser]);
  const teacher = await db.query(`
    insert into public.subscriptions (
      user_id, plan_id, status, source, billing_interval,
      current_period_start, current_period_end, price_amount_thb
    ) values ($1, 'teacher', 'active', 'admin', 'year',
      now() - interval '1 year', now() - interval '1 day', 500) returning id
  `, [teacherUser]);
  await db.query("select public.renew_subscription($1)", [teacher.rows[0].id]);
  const teacherState = await db.query(`
    select s.price_amount_thb, p.plan from public.subscriptions s
    join public.profiles p on p.id = s.user_id where s.id = $1
  `, [teacher.rows[0].id]);
  assert.equal(teacherState.rows[0].price_amount_thb, 599);
  assert.equal(teacherState.rows[0].plan, "teacher");

  await db.query("update public.plans set price_amount_thb = 399 where id = 'founder'");
  await db.query("select public.renew_subscription($1)", [secondFounder]);
  const founderPrice = await db.query("select price_amount_thb from public.subscriptions where id = $1", [secondFounder]);
  assert.equal(founderPrice.rows[0].price_amount_thb, 299);

  await db.query("delete from public.profiles where id = $1", [deletedFounderUser]);
  const ledger = await db.query("select count(*)::integer as seats, count(user_id)::integer as linked from public.founder_seat_ledger");
  assert.equal(ledger.rows[0].seats, 100, "historical Founder grants were unexpectedly deleted");
  assert.equal(ledger.rows[0].linked, 99, "erased profile UUID was retained in the ledger");
  const afterDeletion = await db.query("select public.get_founder_seat_count() as seats");
  assert.equal(afterDeletion.rows[0].seats, 99, "an inactive/deleted Founder still consumed active capacity");

  const replacementFounder = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [replacementFounder]);
  await db.query(`
    insert into public.subscriptions (
      user_id, plan_id, status, source, billing_interval, price_amount_thb,
      current_period_end, founder_started_at, founder_status, founder_price_lock
    ) values ($1, 'founder', 'active', 'admin', 'year', 299,
      now() + interval '1 year', now(), 'active', true)
  `, [replacementFounder]);
  const finalCapacity = await db.query("select * from public.get_founder_capacity()");
  assert.deepEqual(finalCapacity.rows[0], { used: 100, capacity: 100, remaining: 0, is_full: true });
  const finalLedger = await db.query("select count(*)::integer as seats from public.founder_seat_ledger");
  assert.equal(finalLedger.rows[0].seats, 101, "historical grants should remain append-only after a replacement seat");

  process.stdout.write("SQL execution and membership behaviors passed in isolated PGlite.\n");
} finally {
  await db.close();
}
