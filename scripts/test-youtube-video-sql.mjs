import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 058 (and its rollback) against a small stand-in schema whose
// catalogue view is the exact text of migration 053. The real chain is covered
// by `npm run test:migration-chain-sql`. Not a substitute for a Preview-database run.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m053 = read("migrations", "20261006100000_053_resource_slugs.sql");
const m058 = read("migrations", "20261010090000_058_resource_youtube_video.sql");
const rollback = read("rollbacks", "20261010090000_058_resource_youtube_video.rollback.sql");

const viewStart = m053.indexOf("create or replace view public.resource_catalog");
const viewEnd = m053.indexOf("revoke all on public.resource_catalog from public;", viewStart);
assert.ok(viewStart > 0 && viewEnd > viewStart, "053 view text found");

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
  create table public.plans (id text primary key, name text, sort_order int, lifecycle_status text, is_public boolean);
  create table public.resources (
    id uuid primary key default gen_random_uuid(),
    title text not null, meta text, description text, category text,
    delivery_mode text not null, cover_image_url text, tags text[] default '{}',
    is_free boolean default false, file_size bigint, status text not null default 'published',
    published_at timestamptz default now(), created_at timestamptz default now(),
    grade_levels text[] default '{}', access_mode text not null default 'public',
    file_path text, cta_url text, slug text
  );
  create table public.resource_plan_access (resource_id uuid, plan_id text);
  create table public.featured_resources (resource_id uuid, position int);
  create table public.resource_reviews (id uuid default gen_random_uuid(), resource_id uuid, rating int, moderation_status text);
  ${m053.slice(viewStart, viewEnd)};
  grant all on public.resource_catalog to anon, authenticated;
`);
// Raw table privileges stand in for migration 023's column grants.
await db.exec("grant select (id, title) on public.resources to authenticated");

const ids = [];
for (const title of ["Old A", "Old B", "Old C"]) {
  const { rows } = await db.query(
    "insert into public.resources (title, delivery_mode, cta_url) values ($1, 'web_app', 'https://games.kruaorry.app/play') returning id",
    [title],
  );
  ids.push(rows[0].id);
}
const before = (await db.query("select id, title, slug, access_mode from public.resource_catalog order by id")).rows;
const columnsOf = async () => (await db.query(
  "select column_name from information_schema.columns where table_schema='public' and table_name='resource_catalog' order by ordinal_position",
)).rows.map((row) => row.column_name);

async function rejects(sql, params, label) {
  await assert.rejects(() => db.query(sql, params), undefined, label);
}

for (const run of [1, 2]) {
  await db.exec(m058);

  const columns = await columnsOf();
  assert.equal(columns.at(-1), "youtube_video_id", `run ${run}: video id is the last view column`);
  assert.equal(columns.at(-2), "slug", `run ${run}: slug stays before it`);
  const after = (await db.query("select id, title, slug, access_mode, youtube_video_id from public.resource_catalog order by id")).rows;
  assert.equal(after.length, before.length, `run ${run}: every resource is still listed`);
  for (const row of after) {
    assert.equal(row.youtube_video_id, null, `run ${run}: an existing resource has no video`);
    const old = before.find((b) => b.id === row.id);
    assert.deepEqual({ ...row, youtube_video_id: undefined }, { ...old, youtube_video_id: undefined }, `run ${run}: existing fields are unchanged`);
  }
}

// The read-only verification file runs and every check passes.
const verification = read("verification", "058-verify.sql");
const checks = (await db.query(verification)).rows;
assert.ok(checks.length >= 6, "verification returns its checks");
for (const check of checks) assert.equal(check.ok, true, `verification: ${check.check_name}`);

// Column format check.
await rejects("update public.resources set youtube_video_id = 'short' where id = $1", [ids[0]], "short id rejected");
await rejects("update public.resources set youtube_video_id = 'dQw4w9WgXcQ!' where id = $1", [ids[0]], "12 chars rejected");
await rejects("update public.resources set youtube_video_id = 'dQw4w9WgX c' where id = $1", [ids[0]], "space rejected");

// Admin gate on the per-resource RPC.
await db.exec("set test.admin = 'off'");
await rejects("select public.admin_set_resource_video($1, 'dQw4w9WgXcQ')", [ids[0]], "non-admin rejected");
await db.exec("set test.admin = 'on'");
await db.query("select public.admin_set_resource_video($1, ' dQw4w9WgXcQ ')", [ids[0]]);
assert.equal((await db.query("select youtube_video_id as v from public.resource_catalog where id = $1", [ids[0]])).rows[0].v, "dQw4w9WgXcQ", "trimmed id stored and visible through the view");
assert.equal((await db.query("select youtube_video_id as v from public.resource_catalog where id = $1", [ids[1]])).rows[0].v, null, "other resources untouched");
await rejects("select public.admin_set_resource_video($1, 'not a video id')", [ids[0]], "bad id rejected");
await rejects("select public.admin_set_resource_video(gen_random_uuid(), 'dQw4w9WgXcQ')", [], "unknown resource rejected");
await db.query("select public.admin_set_resource_video($1, '')", [ids[0]]);
assert.equal((await db.query("select youtube_video_id as v from public.resources where id = $1", [ids[0]])).rows[0].v, null, "empty value clears the video");

// Homepage videos.
await db.exec("set test.admin = 'off'");
await rejects(`select public.admin_set_homepage_videos('[{"videoId":"dQw4w9WgXcQ"}]'::jsonb)`, [], "non-admin rejected");
await db.exec("set test.admin = 'on'");
await db.query(`select public.admin_set_homepage_videos('[{"videoId":"dQw4w9WgXcQ","title":"วิธีเล่น"},{"videoId":"9bZkp7q19f0"}]'::jsonb)`);
let rows = (await db.query("select position, youtube_video_id, title from public.homepage_videos order by position")).rows;
assert.deepEqual(rows.map((r) => [r.position, r.youtube_video_id, r.title]), [[1, "dQw4w9WgXcQ", "วิธีเล่น"], [2, "9bZkp7q19f0", null]]);
await db.query(`select public.admin_set_homepage_videos('[{"videoId":"aaaaaaaaaaa"}]'::jsonb)`);
assert.equal((await db.query("select count(*)::int as n from public.homepage_videos")).rows[0].n, 1, "the list is replaced, not appended");
await rejects(`select public.admin_set_homepage_videos('[{"videoId":"aaaaaaaaaaa"},{"videoId":"bbbbbbbbbbb"},{"videoId":"ccccccccccc"},{"videoId":"ddddddddddd"}]'::jsonb)`, [], "more than 3 rejected");
await rejects(`select public.admin_set_homepage_videos('[{"videoId":"bad"}]'::jsonb)`, [], "invalid id rejected");
await rejects(`select public.admin_set_homepage_videos('{"videoId":"aaaaaaaaaaa"}'::jsonb)`, [], "non-array rejected");
assert.equal((await db.query("select count(*)::int as n from public.homepage_videos")).rows[0].n, 1, "a rejected save leaves the previous list in place");
await db.query("select public.admin_set_homepage_videos('[]'::jsonb)");
assert.equal((await db.query("select count(*)::int as n from public.homepage_videos")).rows[0].n, 0, "an empty list hides the section");

// Privileges.
for (const [role, table, privilege] of [
  ["anon", "public.resource_catalog", "insert"], ["authenticated", "public.resource_catalog", "update"],
  ["anon", "public.homepage_videos", "insert"], ["authenticated", "public.homepage_videos", "insert"],
  ["authenticated", "public.homepage_videos", "update"], ["authenticated", "public.homepage_videos", "delete"],
]) {
  assert.equal((await db.query("select has_table_privilege($1, $2, $3) as ok", [role, table, privilege])).rows[0].ok, false, `${role} must not ${privilege} ${table}`);
}
assert.equal((await db.query("select has_table_privilege('anon', 'public.homepage_videos', 'select') as ok")).rows[0].ok, true, "anon can read homepage videos");
assert.equal((await db.query("select has_column_privilege('anon', 'public.resources', 'youtube_video_id', 'select') as ok")).rows[0].ok, false, "anon cannot read the column directly");
assert.equal((await db.query("select has_column_privilege('authenticated', 'public.resources', 'youtube_video_id', 'select') as ok")).rows[0].ok, true, "authenticated (admin list) can");
for (const fn of ["public.admin_set_resource_video(uuid, text)", "public.admin_set_homepage_videos(jsonb)"]) {
  assert.equal((await db.query("select has_function_privilege('anon', $1, 'execute') as ok", [fn])).rows[0].ok, false, `anon cannot execute ${fn}`);
  assert.equal((await db.query("select has_function_privilege('authenticated', $1, 'execute') as ok", [fn])).rows[0].ok, true, `authenticated can execute ${fn} (admin gate is inside)`);
}

// Rollback leaves the catalogue compatible, then 058 can be applied again.
await db.query("select public.admin_set_resource_video($1, 'dQw4w9WgXcQ')", [ids[0]]);
await db.exec(rollback);
assert.equal((await columnsOf()).at(-1), "youtube_video_id", "rollback keeps an always-NULL view column");
assert.equal((await db.query("select count(*)::int as n from public.resource_catalog where youtube_video_id is not null")).rows[0].n, 0, "…which is NULL for everyone");
assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_name='resources' and column_name='youtube_video_id'")).rows[0].n, 0, "real column dropped");
assert.equal((await db.query("select to_regclass('public.homepage_videos') as t")).rows[0].t, null, "homepage_videos dropped");
const restored = (await db.query("select id, title, slug, access_mode from public.resource_catalog order by id")).rows;
assert.deepEqual(restored, before, "existing catalogue data identical after rollback");
await db.exec(m058);
assert.equal((await columnsOf()).at(-1), "youtube_video_id", "re-applying after rollback works");

console.log("migration 058 youtube videos: ok");
await db.close();
