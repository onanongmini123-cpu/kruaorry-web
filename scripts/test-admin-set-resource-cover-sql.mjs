import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 063 (and its rollback) on a stand-in schema. Not a substitute for a staging run.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m063 = read("migrations", "20261014090000_063_admin_set_resource_cover.sql");
const rollback = read("rollbacks", "20261014090000_063_admin_set_resource_cover.rollback.sql");
const verification = read("verification", "063-verify.sql");

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create schema storage;
  create table storage.objects (bucket_id text, name text);
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
  create table public.resources (
    id uuid primary key default gen_random_uuid(), title text not null, status text not null default 'draft',
    published_at timestamptz, cover_image_url text, slug text, access_mode text not null default 'public',
    constraint resources_publish_requires_cover check (status <> 'published' or cover_image_url is not null)
  );
  create table public.resource_plan_access (resource_id uuid, plan_id text, created_at timestamptz default now());
`);
const BASE = "https://abc.supabase.co/storage/v1/object/public/resource-covers/";
await db.exec(`insert into storage.objects values ('resource-covers','old.png'),('resource-covers','v2/new.webp'),('resource-covers','folder/a-b_c.webp'),('resource-files','secret.pdf'),('other','x.webp')`);
const { rows: [r1] } = await db.query(`insert into public.resources (title, status, published_at, cover_image_url, slug, access_mode) values ('A','published','2026-11-01T00:00:00Z','${BASE}old.png','a-slug','plans') returning id`);
const { rows: [r2] } = await db.query(`insert into public.resources (title) values ('B') returning id`);
await db.query(`insert into public.resource_plan_access (resource_id, plan_id) values ($1,'teacher')`, [r1.id]);
const rejects = (sql, params, label) => assert.rejects(() => db.query(sql, params), undefined, label);
const snapshot = async () => (await db.query("select * from public.resources order by title")).rows;
const planRows = async () => JSON.stringify((await db.query("select * from public.resource_plan_access")).rows);

for (let run = 0; run < 2; run += 1) await db.exec(m063);
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, true, `verification: ${check.check_name}`);

// Admin gate comes first.
await db.exec("set test.admin = 'off'");
await rejects("select public.admin_set_resource_cover($1, $2)", [r1.id, `${BASE}v2/new.webp`], "non-admin refused");
await db.exec("set test.admin = 'on'");

// Only the cover changes: every other column and the plan-access rows are identical.
const before = await snapshot(); const plansBefore = await planRows();
await db.query("select public.admin_set_resource_cover($1, $2)", [r1.id, `${BASE}v2/new.webp`]);
const after = await snapshot();
assert.equal(after.find((r) => r.id === r1.id).cover_image_url, `${BASE}v2/new.webp`, "cover changed");
for (let i = 0; i < before.length; i += 1) {
  assert.deepEqual({ ...after[i], cover_image_url: null }, { ...before[i], cover_image_url: null }, "no other column changed (status, published_at, slug, access)");
}
assert.equal(after.find((r) => r.id === r2.id).cover_image_url, before.find((r) => r.id === r2.id).cover_image_url, "other resources untouched");
assert.equal(await planRows(), plansBefore, "plan-access rows untouched");
// Putting the old link back (what the tool's rollback does) works too, including a folder name.
await db.query("select public.admin_set_resource_cover($1, $2)", [r1.id, `${BASE}old.png`]);
await db.query("select public.admin_set_resource_cover($1, $2)", [r1.id, `${BASE}folder/a-b_c.webp`]);

// Refusals leave the row alone.
const keep = await snapshot();
for (const [label, id, url] of [
  ["null url", r1.id, null], ["empty url", r1.id, ""], ["http", r1.id, `${BASE}v2/new.webp`.replace("https", "http")],
  ["javascript:", r1.id, "javascript:alert(1)"], ["other bucket", r1.id, "https://abc.supabase.co/storage/v1/object/public/other/x.webp"],
  ["private files bucket", r1.id, "https://abc.supabase.co/storage/v1/object/public/resource-files/secret.pdf"],
  ["file that does not exist", r1.id, `${BASE}v2/missing.webp`], ["path escape", r1.id, `${BASE}v2/../old.png`],
  ["space in link", r1.id, `${BASE}v2/new .webp`], ["percent-encoded name", r1.id, `${BASE}v2/%6Eew.webp`],
  ["unknown resource", "00000000-0000-4000-8000-000000000000", `${BASE}old.png`], ["null id", null, `${BASE}old.png`],
]) await rejects("select public.admin_set_resource_cover($1, $2)", [id, url], label);
assert.deepEqual(await snapshot(), keep, "every refusal left the data unchanged");

// Privileges.
assert.equal((await db.query("select has_function_privilege('anon', 'public.admin_set_resource_cover(uuid, text)', 'execute') as ok")).rows[0].ok, false);
assert.equal((await db.query("select has_function_privilege('authenticated', 'public.admin_set_resource_cover(uuid, text)', 'execute') as ok")).rows[0].ok, true);

// Rollback, tolerant verification, re-apply.
await db.exec(rollback);
assert.equal((await db.query("select count(*)::int as n from pg_proc where proname = 'admin_set_resource_cover'")).rows[0].n, 0, "function dropped");
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, false, `after rollback: ${check.check_name}`);
await db.exec(m063);
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, true, `after re-apply: ${check.check_name}`);

console.log("migration 063 admin_set_resource_cover: ok");
