import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// 062 on top of 058's homepage_videos part (exact text of that part), then its rollback.
const read = (dir, name) => readFileSync(new URL(`../supabase/${dir}/${name}`, import.meta.url), "utf8");
const m058 = read("migrations", "20261010090000_058_resource_youtube_video.sql");
const m062 = read("migrations", "20261013100000_062_homepage_videos_four.sql");
const rollback = read("rollbacks", "20261013100000_062_homepage_videos_four.rollback.sql");
const verification = read("verification", "062-verify.sql");

const start = m058.indexOf("create table if not exists public.homepage_videos");
const end = m058.indexOf("grant execute on function public.admin_set_homepage_videos(jsonb) to authenticated;", start);
assert.ok(start > 0 && end > start, "058 homepage_videos text found");
const part058 = m058.slice(start, end) + "grant execute on function public.admin_set_homepage_videos(jsonb) to authenticated;";

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create function public.is_admin() returns boolean language sql stable as $$ select coalesce(current_setting('test.admin', true), '') = 'on' $$;
  ${part058}
`);
const rejects = (sql, params, label) => assert.rejects(() => db.query(sql, params), undefined, label);
const four = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ videoId: String.fromCharCode(97 + i).repeat(11), title: `v${i + 1}` })));
const rows = async () => (await db.query("select position from public.homepage_videos order by position")).rows.map((r) => r.position);

await db.exec("set test.admin = 'on'");
await db.query("select public.admin_set_homepage_videos($1::jsonb)", [four(3)]);
for (const check of (await db.query(verification)).rows.slice(0, 2)) assert.equal(check.ok, false, `before 062: ${check.check_name}`);
await rejects("select public.admin_set_homepage_videos($1::jsonb)", [four(4)], "058 alone refuses a 4th video");

for (const run of [1, 2]) {
  await db.exec(m062);
  assert.deepEqual(await rows(), [1, 2, 3], `run ${run}: existing videos are untouched`);
}
for (const check of (await db.query(verification)).rows) assert.equal(check.ok, true, `verification: ${check.check_name}`);

await db.query("select public.admin_set_homepage_videos($1::jsonb)", [four(4)]);
assert.deepEqual(await rows(), [1, 2, 3, 4], "four videos are accepted");
await rejects("select public.admin_set_homepage_videos($1::jsonb)", [four(5)], "five are refused");
await rejects(`select public.admin_set_homepage_videos('[{"videoId":"bad"}]'::jsonb)`, [], "invalid id still refused");
assert.deepEqual(await rows(), [1, 2, 3, 4], "a refused save leaves the list alone");
await db.exec("set test.admin = 'off'");
await rejects("select public.admin_set_homepage_videos($1::jsonb)", [four(1)], "non-admin still refused");
await db.exec("set test.admin = 'on'");
assert.equal((await db.query("select has_function_privilege('anon', 'public.admin_set_homepage_videos(jsonb)', 'execute') as ok")).rows[0].ok, false, "anon cannot execute");
assert.equal((await db.query("select has_table_privilege('authenticated', 'public.homepage_videos', 'insert') as ok")).rows[0].ok, false, "table stays read-only");

await db.exec(rollback);
assert.deepEqual(await rows(), [1, 2, 3], "rollback drops only the 4th video");
await rejects("select public.admin_set_homepage_videos($1::jsonb)", [four(4)], "3-item limit is back");
await db.query("select public.admin_set_homepage_videos($1::jsonb)", [four(3)]);
await db.exec(m062);
await db.query("select public.admin_set_homepage_videos($1::jsonb)", [four(4)]);
assert.deepEqual(await rows(), [1, 2, 3, 4], "re-applying after rollback works");

console.log("migration 062 four homepage videos: ok");
