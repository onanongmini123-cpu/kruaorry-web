import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 060 (and its rollback and verification file) against a small
// stand-in schema. The real chain is covered by `npm run test:migration-chain-sql`.
// Not a substitute for a Preview-database run before production.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m060 = read("migrations", "20261012090000_060_homepage_rankings.sql");
const rollback = read("rollbacks", "20261012090000_060_homepage_rankings.rollback.sql");
const verification = read("verification", "060-verify.sql");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table public.resources (id uuid primary key default gen_random_uuid(), title text not null, status text not null default 'published', published_at timestamptz);
  create table public.saved_resources (user_id uuid not null, resource_id uuid not null references public.resources(id) on delete cascade, primary key (user_id, resource_id));
  -- Stand-in for the public catalogue view: published resources only.
  create view public.resource_catalog as select id, title, published_at from public.resources where status = 'published';
`);

const addResource = async (title, status = "published", daysAgo = 0) => (await db.query(
  "insert into public.resources (title, status, published_at) values ($1, $2, now() - ($3 || ' days')::interval) returning id",
  [title, status, String(daysAgo)],
)).rows[0].id;

const A = await addResource("A", "published", 1);
const B = await addResource("B", "published", 2);
const C = await addResource("C", "published", 3);
const D = await addResource("D", "published", 4);
const DRAFT = await addResource("Draft", "draft", 0);
const OLD = await addResource("Old", "published", 400);
const users = Array.from({ length: 5 }, () => crypto.randomUUID());
const key = (n) => n.toString(16).padStart(32, "0");

for (let applied = 0; applied < 2; applied += 1) await db.exec(m060); // idempotent

const checks = (await db.query(verification)).rows;
assert.equal(checks.length, 4);
for (const check of checks) assert.equal(check.ok, true, `verification: ${check.check_name}`);

const rankings = async (limit) => (await db.query("select public.get_homepage_rankings($1) as r", [limit])).rows[0].r;

// Empty state is well-formed and hides nothing it should not.
let r = await rankings(10);
assert.deepEqual(r.hearts, []);
assert.deepEqual(r.popular, { basis: "all_time", items: [] });
assert.equal(r.newest.length, 5, "newest lists published resources only (draft excluded)");
assert.deepEqual(r.newest.map((x) => x.id).slice(0, 4), [A, B, C, D], "newest first");
assert.ok(!r.newest.some((x) => x.id === DRAFT), "a draft never appears");
assert.equal(r.newest.at(-1).id, OLD, "an old published resource is simply last");

// Views: one per viewer per day; bad input and unpublished resources are ignored.
const view = (id, k) => db.query("select public.record_resource_view($1, $2)", [id, k]);
await view(A, key(1)); await view(A, key(1)); await view(A, key(1));
assert.equal((await db.query("select count(*)::int as n from public.resource_view_daily")).rows[0].n, 1, "the same viewer counts once per day");
await view(A, key(2)); await view(A, key(3));
await view(B, key(1)); await view(B, key(2));
await view(C, key(1));
await view(DRAFT, key(1));
await view(A, "not-a-key"); await view(A, null); await view(null, key(9));
await view(crypto.randomUUID(), key(1));
assert.equal((await db.query("select count(*)::int as n from public.resource_view_daily")).rows[0].n, 6, "draft, unknown resource and malformed keys are not counted");
assert.deepEqual((await db.query("select view_date::text as d from public.resource_view_daily limit 1")).rows[0].d, (await db.query("select (now() at time zone 'Asia/Bangkok')::date::text as d")).rows[0].d, "days are Bangkok calendar days");

r = await rankings(10);
assert.equal(r.popular.basis, "30d", "three resources with recent views: the 30-day list is used");
assert.deepEqual(r.popular.items.map((x) => x.id), [A, B, C], "ordered by distinct viewers in the last 30 days");
assert.ok(r.popular.items.every((x) => Object.keys(x).join() === "id"), "popular items carry an id only");

// Fewer than 3 recent resources: fall back to all-time (add old views).
await db.exec("delete from public.resource_view_daily");
await view(A, key(1));
await db.query("insert into public.resource_view_daily (resource_id, viewer_key, view_date) values ($1, $2, current_date - 100), ($1, $3, current_date - 100), ($4, $2, current_date - 200), ($5, $2, current_date - 300)", [B, key(1), key(2), C, D]);
r = await rankings(10);
assert.equal(r.popular.basis, "all_time", "not enough 30-day data: all-time is used");
assert.deepEqual(r.popular.items.map((x) => x.id).slice(0, 2), [B, A], "B (2 old views) ranks above A (1 recent)");
await db.query("delete from public.resource_view_daily");

// Hearts: counts only, published only, ties broken by newest, never who.
const heart = (user, id) => db.query("insert into public.saved_resources (user_id, resource_id) values ($1, $2)", [user, id]);
for (const u of users.slice(0, 4)) await heart(u, B);
for (const u of users.slice(0, 2)) await heart(u, A);
for (const u of users.slice(0, 2)) await heart(u, C);
await heart(users[0], DRAFT); await heart(users[1], DRAFT); await heart(users[2], DRAFT); await heart(users[3], DRAFT); await heart(users[4], DRAFT);
r = await rankings(10);
assert.deepEqual(r.hearts, [{ id: B, count: 4 }, { id: A, count: 2 }, { id: C, count: 2 }], "most hearts first; a tie goes to the newer resource; the draft is excluded");
assert.equal(r.heart_counts[B], 4, "heart_counts has the count for each listed resource");
assert.equal(r.heart_counts[A], 2);
assert.equal(r.heart_counts[D], undefined, "a resource nobody hearted has no entry (shown as 0)");
assert.ok(!(DRAFT in r.heart_counts), "a draft is never counted");
const text = JSON.stringify(r);
for (const u of users) assert.ok(!text.includes(u), "the answer never contains a user id");
assert.ok(!/user_id|email|viewer_key/.test(text), "no person fields in the answer");

// Limit is capped to 10 and floored to 1.
assert.equal((await rankings(1)).newest.length, 1);
assert.equal((await rankings(999)).newest.length <= 10, true);
assert.equal((await rankings(0)).newest.length, 1);
assert.equal((await rankings(null)).newest.length, 5);

// Unpublishing hides a resource from every list.
await db.query("update public.resources set status = 'draft' where id = $1", [B]);
r = await rankings(10);
assert.ok(!JSON.stringify(r).includes(B), "an unpublished resource disappears from all lists");
await db.query("update public.resources set status = 'published' where id = $1", [B]);

// Privileges.
for (const role of ["anon", "authenticated"]) {
  for (const privilege of ["select", "insert", "update", "delete"]) {
    assert.equal((await db.query("select has_table_privilege($1, 'public.resource_view_daily', $2) as ok", [role, privilege])).rows[0].ok, false, `${role} must not ${privilege} resource_view_daily`);
  }
  assert.equal((await db.query("select has_function_privilege($1, 'public.get_homepage_rankings(integer)', 'execute') as ok", [role])).rows[0].ok, true);
  assert.equal((await db.query("select has_function_privilege($1, 'public.record_resource_view(uuid, text)', 'execute') as ok", [role])).rows[0].ok, true);
}

// Deleting a resource removes its view rows; rollback is clean and re-applicable.
await view(A, key(1));
await db.query("delete from public.resources where id = $1", [A]);
assert.equal((await db.query("select count(*)::int as n from public.resource_view_daily where resource_id = $1", [A])).rows[0].n, 0, "view rows cascade");
const savedBefore = (await db.query("select count(*)::int as n from public.saved_resources")).rows[0].n;
await db.exec(rollback);
assert.equal((await db.query("select to_regclass('public.resource_view_daily') as t")).rows[0].t, null);
assert.equal((await db.query("select to_regprocedure('public.get_homepage_rankings(integer)') as f")).rows[0].f, null);
assert.equal((await db.query("select count(*)::int as n from public.saved_resources")).rows[0].n, savedBefore, "rollback never touches favourites");
await db.exec(m060);
assert.equal((await db.query("select to_regclass('public.resource_view_daily') as t")).rows[0].t !== null, true, "re-applying after rollback works");

console.log("migration 060 homepage rankings: ok");
await db.close();
