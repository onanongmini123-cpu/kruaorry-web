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
  "20261001180000_047_founder_payment_confirmation.sql",
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

  const prices = await db.query(`
    select id, price_amount_thb, renewal_price_amount_thb
    from public.plans where id in ('founder', 'teacher') order by id
  `);
  assert.deepEqual(prices.rows, [
    { id: "founder", price_amount_thb: 299, renewal_price_amount_thb: 599 },
    { id: "teacher", price_amount_thb: 599, renewal_price_amount_thb: 599 },
  ]);

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

  const firstFounderUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1)", [firstFounderUser]);
  const firstApplication = await createApplication(firstFounderUser, "founder");
  assert.match(firstApplication.reference_code, /^KA-\d{8,}$/);
  assert.equal(firstApplication.quoted_amount_thb, 299);
  assert.equal(firstApplication.status, "pending");

  const repeatedApplication = await createApplication(firstFounderUser, "founder");
  assert.equal(repeatedApplication.id, firstApplication.id, "a pending application must be idempotent per member and plan");
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 0,
    "a pending application reserved a Founder place");

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

  const firstActivationState = await db.query(`
    select request.status, request.payment_confirmed_amount_thb,
      request.payment_reference, subscription.price_amount_thb,
      subscription.plan_id
    from public.upgrade_requests request
    join public.subscriptions subscription on subscription.approved_from_request_id = request.id
    where request.id = $1
  `, [firstApplication.id]);
  assert.deepEqual(firstActivationState.rows[0], {
    status: "approved",
    payment_confirmed_amount_thb: 299,
    payment_reference: "founder-payment-001",
    price_amount_thb: 299,
    plan_id: "founder",
  });
  assert.equal((await db.query(
    "select count(*)::integer as count from public.membership_payment_confirmations where request_id = $1",
    [firstApplication.id],
  )).rows[0].count, 1, "activation retry duplicated its payment audit");
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

  const founderUsers = [firstFounderUser];
  // Reach 99 permanent grants. Every application is created before its own
  // confirmation and therefore never changes the public capacity by itself.
  for (let n = 2; n <= 99; n += 1) {
    const userId = randomUUID();
    founderUsers.push(userId);
    await db.query("insert into public.profiles(id) values ($1)", [userId]);
    const application = await createApplication(userId, "founder");
    await confirmApplication(application.id, 299, `founder-payment-${String(n).padStart(3, "0")}`, randomUUID());
  }

  const hundredthFounderUser = randomUUID();
  const overCapacityFounderUser = randomUUID();
  await db.query("insert into public.profiles(id) values ($1), ($2)", [hundredthFounderUser, overCapacityFounderUser]);
  const hundredthApplication = await createApplication(hundredthFounderUser, "founder");
  const overCapacityApplication = await createApplication(overCapacityFounderUser, "founder");
  assert.equal((await db.query("select * from public.get_founder_capacity()")).rows[0].used, 99,
    "pending applications changed Founder capacity");

  await confirmApplication(hundredthApplication.id, 299, "founder-payment-100", randomUUID());
  await rejectsWith(
    () => confirmApplication(overCapacityApplication.id, 299, "founder-payment-101", randomUUID()),
    "Founder 100 is full",
  );

  const overCapacityState = await db.query(`
    select request.status, request.payment_confirmed_at,
      count(confirmation.id)::integer as confirmations,
      count(subscription.id)::integer as subscriptions
    from public.upgrade_requests request
    left join public.membership_payment_confirmations confirmation on confirmation.request_id = request.id
    left join public.subscriptions subscription on subscription.approved_from_request_id = request.id
    where request.id = $1
    group by request.status, request.payment_confirmed_at
  `, [overCapacityApplication.id]);
  assert.deepEqual(overCapacityState.rows[0], {
    status: "pending",
    payment_confirmed_at: null,
    confirmations: 0,
    subscriptions: 0,
  }, "the 101st confirmation did not roll back atomically");

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
