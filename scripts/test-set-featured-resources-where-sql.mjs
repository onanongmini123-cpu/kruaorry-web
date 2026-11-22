import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// 064 on a stand-in schema. PGlite has no pg_safeupdate, so the "explicit WHERE" rule is
// checked by 064-verify.sql (and by src/lib/__tests__/functionBodiesHaveWhere.test.ts);
// this script checks the behaviour: replace, clear, refusals, and all-or-nothing.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m064 = read("migrations", "20261014100000_064_set_featured_resources_where.sql");
const rollback = read("rollbacks", "20261014100000_064_set_featured_resources_where.rollback.sql");
const verification = read("verification", "064-verify.sql");

const db = new PGlite();
await db.exec(`
  create role anon; create role authenticated;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
  create table public.resources (id uuid primary key default gen_random_uuid(), title text, status text not null default 'published');
  create table public.featured_resources (
    resource_id uuid primary key references public.resources(id) on delete cascade,
    position integer not null unique check (position between 1 and 5),
    created_at timestamptz not null default now(), updated_at timestamptz not null default now());
`);
const ids = [];
for (let i = 1; i <= 7; i += 1) ids.push((await db.query("insert into public.resources (title) values ($1) returning id", [`r${i}`])).rows[0].id);
const { rows: [draft] } = await db.query("insert into public.resources (title, status) values ('draft','draft') returning id");
const list = async () => (await db.query("select resource_id from public.featured_resources order by position")).rows.map((r) => r.resource_id);
const rejects = (sql, params, label) => assert.rejects(() => db.query(sql, params), undefined, label);
const set = (arr) => db.query("select public.set_featured_resources($1::uuid[])", [arr]);
const checks = async () => (await db.query(verification)).rows;

// Before the fix (the 028 text): verification flags the missing WHERE.
await db.exec(rollback);
let rows = await checks();
assert.equal(rows[0].ok, false, "028 text has no explicit WHERE");
assert.equal(rows[1].ok, false, "028 text has a bare DELETE");

for (let run = 0; run < 2; run += 1) await db.exec(m064);
for (const check of await checks()) assert.equal(check.ok, true, `verification: ${check.check_name}`);

await db.exec("set test.admin = 'off'");
await rejects("select public.set_featured_resources($1::uuid[])", [[ids[0]]], "non-admin refused");
await db.exec("set test.admin = 'on'");

await set(ids.slice(0, 5));
assert.deepEqual(await list(), ids.slice(0, 5), "five featured saved in order");
await set([ids[6], ids[0], ids[3]]);
assert.deepEqual(await list(), [ids[6], ids[0], ids[3]], "list replaced, order kept");
const positions = (await db.query("select position from public.featured_resources order by position")).rows.map((r) => r.position);
assert.deepEqual(positions, [1, 2, 3]);

// A refused save never empties the list: every refusal happens before the delete.
const keep = await list();
for (const [label, arr] of [
  ["six items", ids.slice(0, 6)], ["duplicates", [ids[0], ids[0]]], ["a draft", [draft.id]],
  ["unknown id", ["00000000-0000-4000-8000-000000000000"]], ["a null", [ids[0], null]],
]) {
  await rejects("select public.set_featured_resources($1::uuid[])", [arr], label);
  assert.deepEqual(await list(), keep, `after refusing ${label} the previous list is still there`);
}

// A failure AFTER the delete (the insert) rolls the delete back too: the list is not left empty.
await db.exec(`
  create function public.boom() returns trigger language plpgsql as $$ begin
    if new.resource_id = '${ids[4]}' then raise exception 'insert failed'; end if; return new; end $$;
  create trigger boom before insert on public.featured_resources for each row execute function public.boom();
`);
await rejects("select public.set_featured_resources($1::uuid[])", [[ids[1], ids[4]]], "insert failure surfaces");
assert.deepEqual(await list(), keep, "insert failure left the previous list untouched (delete was rolled back)");
await db.exec("drop trigger boom on public.featured_resources");

await set([]);
assert.deepEqual(await list(), [], "an empty list clears the hero on purpose");
await set([ids[2]]);
assert.deepEqual(await list(), [ids[2]]);

assert.equal((await db.query("select has_function_privilege('anon', 'public.set_featured_resources(uuid[])', 'execute') as ok")).rows[0].ok, false);
assert.equal((await db.query("select has_function_privilege('authenticated', 'public.set_featured_resources(uuid[])', 'execute') as ok")).rows[0].ok, true);

// Rollback then re-apply.
await db.exec(rollback);
rows = await checks();
assert.equal(rows[0].ok, false); assert.equal(rows[1].ok, false);
assert.deepEqual(await list(), [ids[2]], "rollback leaves the list alone");
await db.exec(m064);
for (const check of await checks()) assert.equal(check.ok, true, `after re-apply: ${check.check_name}`);

console.log("migration 064 set_featured_resources: ok");
