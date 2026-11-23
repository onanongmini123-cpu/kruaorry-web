import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 061 (and its rollback) on a stand-in schema. Not a substitute
// for a staging run.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m061 = read("migrations", "20261013090000_061_promo_banners.sql");
const rollback = read("rollbacks", "20261013090000_061_promo_banners.rollback.sql");
const verification = read("verification", "061-verify.sql");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
  create table public.unrelated (id int primary key);
  insert into public.unrelated values (1);
`);
const IMG = "https://x.supabase.co/storage/v1/object/public/resource-covers/banners/a.webp";
const rejects = (sql, params, label) => assert.rejects(() => db.query(sql, params), undefined, label);
const count = async (role = null) => {
  if (role) await db.exec(`set role ${role}`);
  const n = (await db.query("select count(*)::int as n from public.promo_banners")).rows[0].n;
  if (role) await db.exec("reset role");
  return n;
};

for (const run of [1, 2]) {
  await db.exec(m061);
  assert.equal((await db.query("select count(*)::int as n from public.unrelated")).rows[0].n, 1, `run ${run}: nothing else touched`);
}
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, true, `verification: ${check.check_name}`);

// Admin gate and replace-the-list behaviour.
await db.exec("set test.admin = 'off'");
await rejects(`select public.admin_set_promo_banners('[]'::jsonb)`, [], "non-admin rejected");
await db.exec("set test.admin = 'on'");
const banner = (extra = {}) => JSON.stringify({ imageUrl: IMG, altText: "ประกาศ", linkUrl: "/resources", ...extra });
await db.query("select public.admin_set_promo_banners($1::jsonb)", [`[${banner()},${banner({ imageMobileUrl: IMG, linkUrl: "https://example.org/a", altText: "สอง" })}]`]);
assert.deepEqual((await db.query("select position, alt_text from public.promo_banners order by position")).rows.map((r) => [r.position, r.alt_text]), [[1, "ประกาศ"], [2, "สอง"]]);
await db.query("select public.admin_set_promo_banners($1::jsonb)", [`[${banner({ altText: "ใหม่" })}]`]);
assert.equal(await count(), 1, "the list is replaced, not appended");

// Bad input is refused and leaves the previous list in place.
for (const [label, extra] of [
  ["javascript link", { linkUrl: "javascript:alert(1)" }],
  ["data link", { linkUrl: "data:text/html,x" }],
  ["http link", { linkUrl: "http://example.org" }],
  ["protocol-relative link", { linkUrl: "//evil.example" }],
  ["link with space", { linkUrl: "/a b" }],
  ["picture outside the banners folder", { imageUrl: "https://x.supabase.co/storage/v1/object/public/resource-covers/previews/a.webp" }],
  ["picture from another site", { imageUrl: "https://evil.example/a.webp" }],
  ["empty alt text", { altText: "  " }],
  ["window ends before it starts", { startsAt: "2030-01-02T00:00:00Z", endsAt: "2030-01-01T00:00:00Z" }],
]) {
  await rejects("select public.admin_set_promo_banners($1::jsonb)", [`[${banner(extra)}]`], label);
}
await rejects(`select public.admin_set_promo_banners($1::jsonb)`, [`[${Array(7).fill(banner()).join(",")}]`], "more than 6 rejected");
await rejects(`select public.admin_set_promo_banners('{"a":1}'::jsonb)`, [], "non-array rejected");
assert.equal((await db.query("select alt_text from public.promo_banners")).rows[0].alt_text, "ใหม่", "a rejected save leaves the previous list in place");
// A link is optional.
await db.query("select public.admin_set_promo_banners($1::jsonb)", [JSON.stringify([{ imageUrl: IMG, altText: "ไม่มีลิงก์" }])]);
assert.equal((await db.query("select link_url from public.promo_banners")).rows[0].link_url, null);

// Public read: only switched-on rows inside their window. Admin read: everything.
await db.query("select public.admin_set_promo_banners($1::jsonb)", [JSON.stringify([
  { imageUrl: IMG, altText: "on" },
  { imageUrl: IMG, altText: "off", isActive: false },
  { imageUrl: IMG, altText: "future", startsAt: "2999-01-01T00:00:00Z" },
  { imageUrl: IMG, altText: "expired", startsAt: "2000-01-01T00:00:00Z", endsAt: "2000-02-01T00:00:00Z" },
  { imageUrl: IMG, altText: "current", startsAt: "2000-01-01T00:00:00Z", endsAt: "2999-01-01T00:00:00Z" },
])]);
await db.exec("set test.admin = 'off'");
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  assert.deepEqual((await db.query("select alt_text from public.promo_banners order by position")).rows.map((r) => r.alt_text), ["on", "current"], `${role} sees only active banners in their window`);
  await db.exec("reset role");
}
await db.exec("set test.admin = 'on'");
await db.exec("set role authenticated");
assert.equal(await count(), 5, "staff see every banner");
await db.exec("reset role");

// Browser roles cannot write.
for (const role of ["anon", "authenticated"]) {
  await db.exec(`set role ${role}`);
  await rejects(`insert into public.promo_banners (position, image_url, alt_text) values (6, '${IMG}', 'x')`, [], `${role} cannot insert`);
  await rejects("delete from public.promo_banners", [], `${role} cannot delete`);
  await db.exec("reset role");
}
assert.equal((await db.query("select has_function_privilege('anon', 'public.admin_set_promo_banners(jsonb)', 'execute') as ok")).rows[0].ok, false, "anon cannot execute the admin function");

// Rollback, tolerant verification, re-apply.
await db.exec(rollback);
assert.equal((await db.query("select to_regclass('public.promo_banners') as t")).rows[0].t, null, "table dropped");
assert.equal((await db.query("select count(*)::int as n from pg_proc where proname = 'admin_set_promo_banners'")).rows[0].n, 0, "function dropped");
assert.equal((await db.query("select count(*)::int as n from public.unrelated")).rows[0].n, 1, "rollback touches nothing else");
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, false, `after rollback: ${check.check_name}`);
await db.exec(m061);
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, true, `after re-apply: ${check.check_name}`);

console.log("migration 061 promo banners: ok");
