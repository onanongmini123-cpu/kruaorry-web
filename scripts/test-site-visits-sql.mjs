import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { asRole, chainDb, migrationSql, rollbackSql, rows } from "./lib/real-chain.mjs";

// 065 on the REAL migration chain (001-064) in PGlite, with Supabase-like roles.
// PGlite has no pg_safeupdate; the "explicit WHERE" rule is checked by 065-verify.sql
// and src/lib/__tests__/functionBodiesHaveWhere.test.ts. Local only, no remote database.
const m065 = migrationSql("065");
const rollback = rollbackSql("065");
const verification = readFileSync(new URL("../supabase/verification/065-verify.sql", import.meta.url), "utf8");

const db = await chainDb("064");
const checks = async () => rows(db, verification);
for (const check of await checks()) assert.equal(check.ok, false, `before 065: ${check.check_name} is false, not an error`);

for (let run = 0; run < 2; run += 1) await db.exec(m065);
for (const check of await checks()) assert.equal(check.ok, true, `verification: ${check.check_name}`);

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

const key = (n) => n.toString(16).padStart(64, "0");
const today = (await rows(db, "select public.site_visit_bangkok_date(now()) as d"))[0].d;
const day = async (offset) => (await rows(db, "select (public.site_visit_bangkok_date(now()) - $1::int) as d", [offset]))[0].d;
const countOn = async (d) => (await rows(db, "select count(*)::int as n from public.site_visit_daily where visit_date = $1", [d]))[0].n;
const record = (k) => asRole(db, "service_role", null, async () => (await rows(db, "select public.record_site_visit($1) as inserted", [k]))[0].inserted);
async function denied(promise, pattern, label) {
  let caught;
  try { await promise; } catch (error) { caught = error; }
  assert.ok(caught, `${label}: expected an error`);
  assert.match(String(caught?.message ?? caught), pattern, label);
  return caught;
}

// Thai midnight: 16:59:59 UTC is still the 26th in Bangkok, 17:00:00 UTC is the 27th.
const bkk = async (at) => (await rows(db, "select to_char(public.site_visit_bangkok_date($1::timestamptz), 'YYYY-MM-DD') as d", [at]))[0].d;
assert.equal(await bkk("2026-11-26T16:59:59Z"), "2026-11-26");
assert.equal(await bkk("2026-11-26T17:00:00Z"), "2026-11-27");
assert.equal(await bkk("2026-12-31T17:00:00Z"), "2027-01-01", "new year in Bangkok");

// One row per viewer per day.
assert.equal(await record(key(1)), true, "first visit recorded");
assert.equal(await record(key(1)), false, "same viewer, same day: not counted again");
assert.equal(await record(key(2)), true, "another viewer counted");
assert.equal(await countOn(today), 2);
// The same key on another day is a separate row (a new day adds).
await db.query("insert into public.site_visit_daily (visit_date, viewer_day_key) values ($1, $2)", [await day(1), key(3)]);
assert.equal(await record(key(3)), true, "a viewer from yesterday is counted again today");
assert.equal(await countOn(today), 3);

// Bad keys are refused (wrong length, upper case, not hex, null).
for (const bad of [key(1).slice(1), key(1).toUpperCase().replace(/0/g, "A"), "z".repeat(64), null, `${key(1)} `]) {
  await denied(record(bad), /64 lowercase hex/, `bad key ${String(bad).slice(0, 8)}`);
}

// Browsers can never call record or touch the table directly.
for (const role of ["anon", "authenticated"]) {
  const uid = role === "anon" ? null : member;
  await denied(asRole(db, role, uid, () => rows(db, "select public.record_site_visit($1)", [key(9)])), /permission denied/, `${role} cannot record`);
  await denied(asRole(db, role, uid, () => rows(db, "select public.prune_site_visits()")), /permission denied/, `${role} cannot prune`);
  await denied(asRole(db, role, uid, () => rows(db, "select count(*) from public.site_visit_daily")), /permission denied/, `${role} cannot read the table`);
  await denied(asRole(db, role, uid, () => rows(db, "insert into public.site_visit_daily (visit_date, viewer_day_key) values (current_date, $1)", [key(9)])), /permission denied/, `${role} cannot insert`);
}
await denied(asRole(db, "authenticated", owner, () => rows(db, "select count(*) from public.site_visit_daily")), /permission denied/, "even the owner reads only through the summary");

// Summary: owner only.
const summary = (uid, days) => asRole(db, "authenticated", uid, async () => (await rows(db, days === undefined
  ? "select public.owner_site_visit_summary() as s" : "select public.owner_site_visit_summary($1) as s", days === undefined ? [] : [days]))[0].s);
for (const [uid, label] of [[admin, "admin (not owner)"], [member, "member"]]) {
  const error = await denied(summary(uid), /Only the site owner/, `${label} refused`);
  assert.equal(error.code, "42501", `${label}: 42501`);
}
await denied(asRole(db, "anon", null, () => rows(db, "select public.owner_site_visit_summary()")), /permission denied/, "anon cannot call the summary");

// Counts across the window: 6 days ago is inside last 7, 7 days ago is not; 29 inside 30, 30 not.
for (const [offset, n] of [[6, 2], [7, 4], [29, 1], [30, 8]]) {
  for (let i = 0; i < n; i += 1) await db.query("insert into public.site_visit_daily (visit_date, viewer_day_key) values ($1, $2)", [await day(offset), key(1000 * offset + i)]);
}
let s = await summary(owner);
assert.equal(s.timezone, "Asia/Bangkok");
assert.equal(s.today, 3);
assert.equal(s.last_7_days, 3 + 1 + 2, "today + yesterday + 6 days ago");
assert.equal(s.last_30_days, 3 + 1 + 2 + 4 + 1, "up to 29 days ago");
assert.equal(s.days.length, 30, "30 days by default");
assert.equal(s.days.at(-1).visitors, 3, "last day is today");
assert.equal(s.days.at(-2).visitors, 1, "yesterday");
assert.equal(s.days.filter((d) => d.visitors === 0).length, 30 - 5, "days without visits are 0, not missing");
assert.deepEqual(s.days.map((d) => d.date), [...s.days.map((d) => d.date)].sort(), "oldest first");
assert.equal((await summary(owner, 7)).days.length, 7);
assert.equal((await summary(owner, 0)).days.length, 1, "at least one day");
assert.equal((await summary(owner, 1000)).days.length, 90, "at most 90 days");
assert.ok(!JSON.stringify(s).includes(key(1)), "the summary never returns viewer keys");

// Pruning: rows older than 90 days go, day 90 stays. Run directly, then via the first visit of a day.
await db.query("insert into public.site_visit_daily (visit_date, viewer_day_key) values ($1, $2), ($3, $4)", [await day(91), key(91), await day(90), key(90)]);
const pruned = await asRole(db, "service_role", null, async () => (await rows(db, "select public.prune_site_visits() as n"))[0].n);
assert.equal(pruned, 1, "only the row older than 90 days is deleted");
assert.equal(await countOn(await day(90)), 1, "day 90 is kept");
await db.query("insert into public.site_visit_daily (visit_date, viewer_day_key) values ($1, $2)", [await day(120), key(120)]);
await db.query("delete from public.site_visit_daily where visit_date = $1", [today]);
assert.equal(await record(key(5)), true, "first visit of the day");
assert.equal(await countOn(await day(120)), 0, "the first visit of a Thai day prunes old rows");
await db.query("insert into public.site_visit_daily (visit_date, viewer_day_key) values ($1, $2)", [await day(120), key(121)]);
assert.equal(await record(key(6)), true);
assert.equal(await countOn(await day(120)), 1, "later visits of the same day do not prune again");

// Existing objects are untouched by 065 and its rollback.
const before = (await rows(db, "select count(*)::int as n from public.profiles"))[0].n;
await db.exec(rollback);
for (const check of await checks()) assert.equal(check.ok, false, `after rollback: ${check.check_name}`);
assert.equal((await rows(db, "select to_regclass('public.site_visit_daily') as t"))[0].t, null);
assert.equal((await rows(db, "select count(*)::int as n from public.profiles"))[0].n, before, "rollback leaves profiles alone");
assert.equal((await rows(db, "select public.is_owner() as ok"))[0].ok, false, "is_owner still exists");
await db.exec(m065);
for (const check of await checks()) assert.equal(check.ok, true, `after re-apply: ${check.check_name}`);

console.log("migration 065 site visits: ok");
