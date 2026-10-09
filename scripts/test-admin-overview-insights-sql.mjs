// Migration 056 against the real migration chain in local PGlite. This never
// connects to Supabase and uses synthetic rows only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, fromSnapshot, migrationSql, rollbackSql, rows, snapshotOf } from "./lib/real-chain.mjs";

const verification = readFileSync(new URL("../supabase/verification/056-verify.sql", import.meta.url), "utf8");
const AS_OF = "2026-10-31T17:00:00.000Z"; // 2026-11-01 00:00:00 Asia/Bangkok

let passed = 0;
const failures = [];
async function check(name, run) {
  try {
    await run();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL  ${name}\n        ${String(error?.message ?? error).split("\n").join("\n        ")}`);
  }
}

async function failsWith(promise, pattern, label) {
  let caught;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `${label}: expected an error`);
  assert.match(String(caught?.message ?? caught), pattern, label);
}

async function addUser(db, label, createdAt, role = "member") {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email, created_at) values ($1, $2, $3)", [id, `${label}@test.invalid`, createdAt]);
  await db.exec("set session_replication_role = replica");
  await db.query("update public.profiles set role = $2, created_at = $3 where id = $1", [id, role, createdAt]);
  await db.exec("set session_replication_role = origin");
  return id;
}

async function seed(db) {
  // Migration fixtures include catalogue examples. Clear only content rows so
  // every aggregate asserted below comes from this test's synthetic dataset.
  await db.exec("delete from public.resources");
  const admin = await addUser(db, "admin", "2026-10-31T17:00:00Z", "admin");
  const member7 = await addUser(db, "member-seven-boundary", "2026-10-25T17:00:00Z");
  const memberBefore7 = await addUser(db, "member-before-seven", "2026-10-25T16:59:59.999Z");
  const member30 = await addUser(db, "member-thirty-boundary", "2026-10-02T17:00:00Z");
  const memberBefore30 = await addUser(db, "member-before-thirty", "2026-10-02T16:59:59.999Z");
  const memberToday = await addUser(db, "member-today", AS_OF);
  const users = [member7, memberBefore7, member30, memberBefore30, memberToday];

  await db.query(`insert into public.membership_payment_confirmations
    (idempotency_key, operation, plan_id, amount_thb, payment_reference, paid_at, confirmed_at, confirmed_by)
    values
      ($1, 'renewal', 'teacher', 200, 'before-month', '2026-10-31T16:59:59.999Z', '2026-10-31T16:59:59.999Z', $4),
      ($2, 'renewal', 'teacher', 100, 'at-month', $5, $5, $4),
      ($3, 'renewal', 'teacher', 900, 'future-row', '2026-10-31T17:00:01Z', '2026-10-31T17:00:01Z', $4)`,
  [randomUUID(), randomUUID(), randomUUID(), admin, AS_OF]);

  await db.query(`insert into public.subscriptions
    (user_id, plan_id, status, source, price_amount_thb, billing_interval, started_at, current_period_start, current_period_end)
    values
      ($1, 'teacher', 'active', 'admin', 599, 'year', '2026-01-01Z', '2026-01-01Z', '2026-11-10T17:00:00Z'),
      ($2, 'teacher', 'past_due', 'admin', 599, 'year', '2026-01-01Z', '2026-01-01Z', '2026-12-02T17:00:00Z'),
      ($3, 'teacher', 'active', 'admin', 599, 'year', '2026-01-01Z', '2026-01-01Z', null),
      ($4, 'teacher', 'expired', 'admin', 599, 'year', '2025-01-01Z', '2025-01-01Z', '2026-01-01Z')`,
  [member7, memberBefore7, member30, memberBefore30]);

  await db.query(`insert into public.upgrade_requests
    (user_id, plan_id, status, reference_code, quoted_amount_thb, resolved_at)
    values ($1, 'teacher', 'pending', 'TEST-ONE', 599, null),
           ($2, 'teacher', 'approved', 'TEST-TWO', 599, '2026-10-20Z')`, [member7, member30]);
  await db.query(`insert into public.founder_seat_ledger (user_id, granted_at, slot_number)
    values ($1, '2026-01-01Z', 1), ($2, '2026-01-02Z', 2)`, [member7, member30]);

  const publishedTop = randomUUID();
  const publishedZero = randomUUID();
  const draftPopular = randomUUID();
  const publishedSecond = randomUUID();
  await db.query(`insert into public.resources
    (id, title, category, delivery_mode, status, grade_levels, cta_url, cover_image_url)
    values
      ($1, 'Published Top', 'คณิตศาสตร์', 'web_app', 'published', array['p1','p2'], 'https://example.test/top', 'https://example.test/top.webp'),
      ($2, 'Published Zero', 'ภาษาไทย', 'web_app', 'published', array['p3'], 'https://example.test/zero', 'https://example.test/zero.webp'),
      ($3, 'Draft Popular', 'วิทยาศาสตร์', 'web_app', 'draft', array['p4'], null, null),
      ($4, 'Published Second', 'คณิตศาสตร์', 'web_app', 'published', array['p1'], 'https://example.test/second', 'https://example.test/second.webp')`,
  [publishedTop, publishedZero, draftPopular, publishedSecond]);
  await db.query(`insert into public.saved_resources (user_id, resource_id) values
    ($1, $5), ($2, $5), ($3, $7), ($1, $6), ($2, $6), ($3, $6), ($4, $6)`,
  [...users.slice(0, 4), publishedTop, draftPopular, publishedSecond]);
  await db.query(`insert into public.resource_reviews
    (resource_id, user_id, rating, body, moderation_status) values
      ($1, $4, 5, 'review one', 'visible'),
      ($1, $5, 4, 'review two', 'visible'),
      ($1, $6, 5, 'review three', 'visible'),
      ($2, $4, 5, 'hidden one', 'hidden'),
      ($3, $4, 3, 'second one', 'visible'),
      ($3, $5, 3, 'second two', 'visible'),
      ($3, $6, 3, 'second three', 'visible')`,
  [publishedTop, publishedZero, publishedSecond, ...users.slice(0, 3)]);
  return { admin, member: member7, ids: { publishedTop, publishedZero, draftPopular, publishedSecond } };
}

async function call(db, userId, asOf = AS_OF, role = "authenticated", anonymous = false) {
  const result = await asRole(db, role, userId, () => db.query(
    "select public.get_admin_overview_insights($1::timestamptz) as result",
    [asOf],
  ), { anonymous });
  return result.rows[0].result;
}

console.log("replaying migrations 001..055 …");
const baseDb = await chainDb("055");
const baseSnapshot = await snapshotOf(baseDb);
await baseDb.close();

async function withDb(run, { apply = true } = {}) {
  const db = await fromSnapshot(baseSnapshot);
  try {
    if (apply) await db.exec(migrationSql("056"));
    return await run(db);
  } finally { await db.close(); }
}

await check("056 verification returns 8/8 true and re-apply is idempotent", async () => {
  await withDb(async (db) => {
    const result = await rows(db, verification);
    assert.equal(result.length, 8);
    assert.equal(result.filter((row) => row.ok === true).length, 8);
    await db.exec(migrationSql("056"));
    assert.equal((await rows(db, verification)).filter((row) => row.ok === true).length, 8);
  });
});

await check("admin can call; member, anonymous session and anon cannot", async () => {
  await withDb(async (db) => {
    const { admin, member } = await seed(db);
    assert.equal((await call(db, admin)).timezone, "Asia/Bangkok");
    await failsWith(call(db, member), /Admin access required|42501/, "member gate");
    await failsWith(call(db, member, AS_OF, "authenticated", true), /Admin access required|42501/, "anonymous session gate");
    await failsWith(call(db, null, AS_OF, "anon"), /permission denied|42501/i, "anon execute grant");
  });
});

await check("Bangkok month and 7/30-day boundaries include local midnight exactly", async () => {
  await withDb(async (db) => {
    const { admin } = await seed(db);
    const result = await call(db, admin);
    assert.equal(new Date(result.periods.month_start).toISOString(), "2026-10-31T17:00:00.000Z");
    assert.equal(new Date(result.periods.new_members_7_days_start).toISOString(), "2026-10-25T17:00:00.000Z");
    assert.equal(new Date(result.periods.new_members_30_days_start).toISOString(), "2026-10-02T17:00:00.000Z");
    assert.equal(result.revenue.month_confirmed_thb, 100);
    assert.equal(result.revenue.all_time_confirmed_thb, 300);
    assert.equal(result.new_members.last_7_days_count, 2);
    assert.equal(result.new_members.last_30_days_count, 4);
  });
});

await check("all eight insight groups use exact aggregate fixture values", async () => {
  await withDb(async (db) => {
    const { admin } = await seed(db);
    const result = await call(db, admin);
    assert.equal(result.revenue.refunds_supported, false);
    assert.equal(new Date(result.revenue.first_confirmed_at).toISOString(), "2026-10-31T16:59:59.999Z");
    assert.deepEqual(result.premium_memberships, { active_count: 3, expiring_within_30_days_count: 1 });
    assert.deepEqual(result.founder_seats, { used: 2, capacity: 100 });
    assert.deepEqual(result.application_funnel, { total_members: 5, requested_premium: 2, approved_premium: 1 });
    assert.equal(result.favorites.top_published_resources[0].title, "Published Top");
    assert.ok(!result.favorites.top_published_resources.some((row) => row.title === "Draft Popular"));
    assert.equal(result.favorites.published_without_hearts_count, 1);
    assert.equal(result.reviews.minimum_review_count, 3);
    assert.equal(result.reviews.top_published_resources[0].title, "Published Top");
    assert.equal(result.reviews.top_published_resources[0].review_count, 3);
    assert.equal(result.content_breakdown.reduce((sum, row) => sum + row.resource_count, 0), 4);
  });
});

await check("result contains no member or payment identity and the call writes nothing", async () => {
  await withDb(async (db) => {
    const { admin } = await seed(db);
    const before = await rows(db, `select
      (select count(*) from public.profiles)::int profiles,
      (select count(*) from public.membership_payment_confirmations)::int payments,
      (select count(*) from public.subscriptions)::int subscriptions,
      (select count(*) from public.upgrade_requests)::int applications,
      (select count(*) from public.founder_seat_ledger)::int founder_seats,
      (select count(*) from public.resources)::int resources,
      (select count(*) from public.saved_resources)::int saves,
      (select count(*) from public.resource_reviews)::int reviews`);
    const result = await call(db, admin);
    const serialized = JSON.stringify(result);
    assert.doesNotMatch(serialized, /@test\.invalid|before-month|at-month|future-row|member-seven-boundary/i);
    assert.doesNotMatch(serialized, /payment_reference|user_id|full_name|email/i);
    assert.deepEqual(await rows(db, `select
      (select count(*) from public.profiles)::int profiles,
      (select count(*) from public.membership_payment_confirmations)::int payments,
      (select count(*) from public.subscriptions)::int subscriptions,
      (select count(*) from public.upgrade_requests)::int applications,
      (select count(*) from public.founder_seat_ledger)::int founder_seats,
      (select count(*) from public.resources)::int resources,
      (select count(*) from public.saved_resources)::int saves,
      (select count(*) from public.resource_reviews)::int reviews`), before);
  });
});

await check("rollback removes only the RPC and a re-apply restores it", async () => {
  await withDb(async (db) => {
    await db.exec(rollbackSql("056"));
    assert.equal((await rows(db, "select to_regprocedure('public.get_admin_overview_insights(timestamp with time zone)') as fn"))[0].fn, null);
    await db.exec(migrationSql("056"));
    assert.equal((await rows(db, verification)).filter((row) => row.ok === true).length, 8);
  });
});

await check("migration guard refuses a partial unexpected overload", async () => {
  await withDb(async (db) => {
    await db.exec(rollbackSql("056"));
    await db.exec("create function public.get_admin_overview_insights(integer) returns jsonb language sql as 'select ''{}''::jsonb'");
    await failsWith(db.exec(migrationSql("056")), /unexpected overload/, "partial-state guard");
  }, { apply: false });
});

console.log(`\n${passed}/${passed + failures.length} checks passed`);
if (failures.length) process.exitCode = 1;
