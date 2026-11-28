import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, migrationSql, rollbackSql, rows } from "./lib/real-chain.mjs";

const db = await chainDb("066");
const verification = readFileSync(new URL("../supabase/verification/067-verify.sql", import.meta.url), "utf8");
const checks = () => rows(db, verification);
assert.equal((await checks()).length, 8);
assert.ok((await checks()).every((row) => !row.ok), "all checks are false before 067");
await db.exec(migrationSql("067"));
assert.ok((await checks()).every((row) => row.ok), JSON.stringify(await checks()));

async function addUser(label, role) {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${label}@test.invalid`]);
  await db.exec("set session_replication_role = replica");
  await db.query("update public.profiles set role = $2 where id = $1", [id, role]);
  await db.exec("set session_replication_role = origin");
  return id;
}
const owner = await addUser("owner", "owner");
const admin = await addUser("admin", "admin");
const member = await addUser("member", "member");
const as = (uid, fn) => asRole(db, "authenticated", uid, fn);
const one = async (sql, params = []) => (await rows(db, sql, params))[0];
async function rejected(call, code) {
  let error;
  try { await call(); } catch (caught) { error = caught; }
  assert.ok(error, `expected ${code}`);
  if (code) assert.equal(error.code, code);
}

const save = (uid, month, income, pro = null) => as(uid, async () =>
  (await one("select public.owner_save_monthly_goal($1,$2,$3) as changed", [month, income, pro])).changed);
const report = (uid, day) => as(uid, async () =>
  (await one("select public.owner_finance_report($1) as value", [day])).value);
const csv = (uid, day) => as(uid, async () =>
  (await one("select public.owner_finance_csv($1) as value", [day])).value);

await rejected(() => save(admin, "2026-03-01", 3100), "42501");
await rejected(() => save(member, "2026-03-01", 3100), "42501");
await rejected(() => report(admin, "2026-03-01"), "42501");
await rejected(() => report(member, "2026-03-01"), "42501");
await rejected(() => csv(admin, "2026-03-01"), "42501");
await rejected(() => asRole(db, "anon", null, () => rows(db, "select public.owner_finance_report(null)")));
await rejected(() => asRole(db, "anon", null, () => rows(db, "select public.owner_finance_csv(null)")));
await rejected(() => asRole(db, "anon", null, () => rows(db, "select public.owner_save_monthly_goal('2026-03-01',1,null)")));
await rejected(() => save(owner, "2026-03-02", 3100), "22023");
await rejected(() => save(owner, "2026-03-01", 0), "22023");
assert.equal(await save(owner, "2026-03-01", 3100, 5), true);
assert.equal(await save(owner, "2026-03-01", 3100, 5), false, "same goal does not add audit");
assert.equal(await save(owner, "2026-03-01", 6200, 7), true);
assert.equal((await one("select count(*)::int as n from public.owner_monthly_goal_audit")).n, 2);
await rejected(() => as(owner, () => rows(db,
  "update public.owner_monthly_goals set income_target_satang=1 where month_start='2026-03-01'")));
assert.equal((await as(admin, () => rows(db, "select * from public.owner_monthly_goals"))).length, 0);
assert.equal((await as(member, () => rows(db, "select * from public.owner_monthly_goal_audit"))).length, 0);

// 16:59:59Z is the last second of February in Bangkok; 17:00:00Z is March 1.
for (const [stamp, amount] of [["2026-02-28T16:59:59Z", 100], ["2026-02-28T17:00:00Z", 599]]) {
  await db.query(`insert into public.membership_payment_confirmations
    (idempotency_key, operation, plan_id, amount_thb, payment_reference, paid_at, confirmed_at)
    values ($1,'renewal','teacher',$2,$3,$4,$4)`, [randomUUID(), amount, `QA-${randomUUID()}`, stamp]);
}
await as(owner, () => rows(db,
  "select public.owner_add_finance_entry($1,'income',3000,'2026-03-01','QA income')", [randomUUID()]));
await as(owner, () => rows(db,
  "select public.owner_add_finance_entry($1,'refund',500,'2026-03-01','QA refund')", [randomUUID()]));
await as(owner, () => rows(db,
  "select public.owner_add_finance_entry($1,'expense',700,'2026-03-01','QA expense')", [randomUUID()]));
const before = (await one("select count(*)::int as n from public.owner_manual_finance_entries")).n;
const result = await report(owner, "2026-03-01");
assert.equal(result.timezone, "Asia/Bangkok");
assert.equal(Number(result.today.member_income_satang), 59900);
assert.equal(Number(result.today.net_revenue_satang), 62400);
assert.equal(Number(result.today.goal_satang), 200, "6200 / 31 rounded up");
assert.equal(Number(result.month.refund_satang), 500);
assert.equal(Number(result.month.expense_satang), 700);
assert.equal(Number(result.month.profit_satang), 61700);
assert.equal(result.month.pro_target_count, 7);
assert.equal(result.months.length, 12);
assert.equal(result.months.at(-1).month, "2026-03-01");
assert.equal(result.best_day.date, "2026-03-01");
assert.equal(result.streak_days, 0, "today never counts toward streak");
assert.equal((await report(owner, "2026-03-02")).streak_days, 1, "finished prior day counts");
const exported = await csv(owner, "2026-03-01");
assert.equal(exported.trim().split("\n").length, 13, "header plus 12 months");
assert.ok(!exported.includes("@") && !exported.includes("QA-"), "CSV contains no PII or reference");
assert.equal((await one("select count(*)::int as n from public.owner_manual_finance_entries")).n, before,
  "reading report and CSV has no side effects");

await db.exec(rollbackSql("067"));
assert.ok((await checks()).every((row) => !row.ok), "all checks false after rollback");
assert.ok((await one("select to_regclass('public.owner_manual_finance_entries') is not null as ok")).ok,
  "066 finance tables survive rollback");
await db.exec(migrationSql("067"));
assert.ok((await checks()).every((row) => row.ok), "067 reapplies after rollback");
console.log("migration 067 owner goals and reports: 8/8 verify, roles, Thai boundary, money, CSV, rollback/reapply ok");
