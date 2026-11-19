import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 059 (and its rollback and verification file) against a small
// stand-in schema. The real chain is covered by `npm run test:migration-chain-sql`.
// Not a substitute for a Preview-database run before production.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m059 = read("migrations", "20261011090000_059_resource_previews.sql");
const rollback = read("rollbacks", "20261011090000_059_resource_previews.rollback.sql");
const verification = read("verification", "059-verify.sql");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
  create table public.resources (
    id uuid primary key default gen_random_uuid(),
    title text not null, status text not null default 'published', access_mode text not null default 'plans',
    cta_url text, file_path text
  );
`);

const add = async (title, status, accessMode) => (await db.query(
  "insert into public.resources (title, status, access_mode, cta_url, file_path) values ($1, $2, $3, 'https://secret.example/real-link', 'abc/secret-file.pdf') returning id",
  [title, status, accessMode],
)).rows[0].id;
const pro = await add("Pro published", "published", "plans");
const draft = await add("Pro draft", "draft", "plans");
const free = await add("Free published", "published", "public");
const locked = await add("Locked", "published", "locked");

const url = (name) => `https://abc.supabase.co/storage/v1/object/public/resource-covers/previews/${name}.webp`;
async function rejects(sql, params, label) { await assert.rejects(() => db.query(sql, params), undefined, label); }

for (let applied = 0; applied < 2; applied += 1) await db.exec(m059); // idempotent

const checks = (await db.query(verification)).rows;
assert.equal(checks.length, 5);
for (const check of checks) assert.equal(check.ok, true, `verification: ${check.check_name}`);

// The view never carries a destination.
const columns = (await db.query("select column_name from information_schema.columns where table_name='resource_preview_catalog' order by ordinal_position")).rows.map((r) => r.column_name);
assert.deepEqual(columns, ["resource_id", "position", "image_url"], "view exposes only id, position and image");

// Admin gate.
await db.exec("set test.admin = 'off'");
await rejects(`select public.admin_set_resource_previews($1, $2::jsonb)`, [pro, JSON.stringify([url("a")])], "non-admin rejected");
await db.exec("set test.admin = 'on'");
for (const id of [pro, draft, free, locked]) {
  await db.query(`select public.admin_set_resource_previews($1, $2::jsonb)`, [id, JSON.stringify([url("a"), url("b")])]);
}

// Only a published Pro resource's previews are public.
const publicRows = (await db.query("select resource_id, position, image_url from public.resource_preview_catalog order by position")).rows;
assert.deepEqual(publicRows.map((r) => r.resource_id), [pro, pro], "draft, free and locked resources expose no previews");
assert.deepEqual(publicRows.map((r) => r.position), [1, 2]);
await db.query("update public.resources set status = 'draft' where id = $1", [pro]);
assert.equal((await db.query("select count(*)::int as n from public.resource_preview_catalog")).rows[0].n, 0, "unpublishing hides previews");
await db.query("update public.resources set status = 'published' where id = $1", [pro]);

// Replace semantics, limits and format.
await db.query(`select public.admin_set_resource_previews($1, $2::jsonb)`, [pro, JSON.stringify([url("c")])]);
assert.deepEqual((await db.query("select image_url from public.resource_preview_catalog")).rows.map((r) => r.image_url), [url("c")], "the list is replaced, not appended");
await rejects(`select public.admin_set_resource_previews($1, $2::jsonb)`, [pro, JSON.stringify(Array.from({ length: 7 }, (_, i) => url(`x${i}`)))], "more than 6 rejected");
for (const bad of ["http://abc.supabase.co/storage/v1/object/public/resource-covers/previews/a.webp", "https://evil.example/a.png", "https://abc.supabase.co/storage/v1/object/public/resource-covers/other/a.webp", "https://abc.supabase.co/storage/v1/object/public/resource-files/previews/a.webp"]) {
  await rejects(`select public.admin_set_resource_previews($1, $2::jsonb)`, [pro, JSON.stringify([bad])], `bad URL rejected: ${bad}`);
}
await rejects(`select public.admin_set_resource_previews($1, '{"a":1}'::jsonb)`, [pro], "non-array rejected");
await rejects(`select public.admin_set_resource_previews(gen_random_uuid(), '[]'::jsonb)`, [], "unknown resource rejected");
assert.deepEqual((await db.query("select image_url from public.resource_preview_catalog")).rows.map((r) => r.image_url), [url("c")], "a rejected save keeps the previous list");
await db.query(`select public.admin_set_resource_previews($1, '[]'::jsonb)`, [pro]);
assert.equal((await db.query("select count(*)::int as n from public.resource_preview_catalog")).rows[0].n, 0, "empty list clears previews");

// Privileges and RLS as the browser roles.
for (const [role, table, privilege] of [
  ["anon", "public.resource_previews", "select"], ["anon", "public.resource_previews", "insert"],
  ["authenticated", "public.resource_previews", "insert"], ["authenticated", "public.resource_previews", "update"], ["authenticated", "public.resource_previews", "delete"],
  ["anon", "public.resource_preview_catalog", "insert"], ["authenticated", "public.resource_preview_catalog", "update"],
]) {
  assert.equal((await db.query("select has_table_privilege($1, $2, $3) as ok", [role, table, privilege])).rows[0].ok, false, `${role} must not ${privilege} ${table}`);
}
assert.equal((await db.query("select has_function_privilege('anon', 'public.admin_set_resource_previews(uuid, jsonb)', 'execute') as ok")).rows[0].ok, false);
await db.query(`select public.admin_set_resource_previews($1, $2::jsonb)`, [pro, JSON.stringify([url("d")])]);
await db.exec("set role authenticated");
await db.exec("set test.admin = 'off'");
assert.equal((await db.query("select count(*)::int as n from public.resource_previews")).rows[0].n, 0, "a non-admin member sees no rows in the base table (RLS)");
await db.exec("set test.admin = 'on'");
assert.equal((await db.query("select count(*)::int as n from public.resource_previews")).rows[0].n, 7, "an admin can read every row of the base table (3 resources x 2 + 1)");
await db.exec("reset role");

// Deleting a resource removes its previews; rollback and re-apply.
await db.query("delete from public.resources where id = $1", [pro]);
assert.equal((await db.query("select count(*)::int as n from public.resource_previews where resource_id = $1", [pro])).rows[0].n, 0, "previews cascade with the resource");
await db.exec(rollback);
assert.equal((await db.query("select to_regclass('public.resource_previews') as t, to_regclass('public.resource_preview_catalog') as v")).rows[0].t, null);
assert.equal((await db.query("select count(*)::int as n from public.resources")).rows[0].n, 3, "rollback never touches resources");
await db.exec(m059);
assert.equal((await db.query("select to_regclass('public.resource_preview_catalog') as v")).rows[0].v !== null, true, "re-applying after rollback works");

console.log("migration 059 resource previews: ok");
await db.close();
