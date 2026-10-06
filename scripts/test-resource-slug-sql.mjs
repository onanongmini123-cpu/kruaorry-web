import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Runs migration 053 against a small stand-in schema whose catalogue view is
// the exact text of migration 029, then checks the backfill, the constraint,
// the unique index and that the view exposes slug without losing anything.
// Not a substitute for a Preview-database run before production.
const read = (name) => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const m029 = read("20260925120000_029_private_requests_reviews_reports.sql");
const m053 = read("20261006100000_053_resource_slugs.sql");

const viewStart = m029.indexOf("create or replace view public.resource_catalog");
const viewEnd = m029.indexOf("revoke all on public.resource_catalog from public;", viewStart);
assert.ok(viewStart > 0 && viewEnd > viewStart, "029 view text found");
const view029 = m029.slice(viewStart, viewEnd);

const db = new PGlite();
await db.exec(`
  create role anon;
  create role authenticated;
  create table public.plans (id text primary key, name text, sort_order int, lifecycle_status text, is_public boolean);
  create table public.resources (
    id uuid primary key default gen_random_uuid(),
    title text not null, meta text, description text, category text,
    delivery_mode text not null, cover_image_url text, tags text[] default '{}',
    is_free boolean default false, file_size bigint, status text not null default 'published',
    published_at timestamptz default now(), created_at timestamptz default now(),
    grade_levels text[] default '{}', access_mode text not null default 'public',
    file_path text, cta_url text
  );
  create table public.resource_plan_access (resource_id uuid, plan_id text);
  create table public.featured_resources (resource_id uuid, position int);
  create table public.resource_reviews (id uuid default gen_random_uuid(), resource_id uuid, rating int, moderation_status text);
  ${view029};
  grant all on public.resource_catalog to anon, authenticated;
`);

async function addResource(title, ctaUrl = "https://games.kruaorry.app/play") {
  const { rows } = await db.query(
    "insert into public.resources (title, delivery_mode, cta_url) values ($1, 'web_app', $2) returning id",
    [title, ctaUrl],
  );
  return rows[0].id;
}

const seeded = await addResource("Sentence Train");
await addResource("Grammar Boss Battle — ศึกบอสไวยากรณ์");
const renamed = await addResource("ชื่อที่แอดมินแก้แล้ว");
const dupA = await addResource("ตกปลาคำศัพท์");
const dupB = await addResource("ตกปลาคำศัพท์");
const preSet = await addResource("Daily Word Detective");
await db.query("alter table public.resources add column slug text");
await db.query("update public.resources set slug = 'my-custom-slug' where id = $1", [preSet]);
await db.query("alter table public.resources drop column slug");
const countBefore = (await db.query("select count(*)::int as n from public.resources")).rows[0].n;

for (const run of [1, 2]) {
  await db.exec(m053);

  const slugOf = async (id) => (await db.query("select slug from public.resources where id = $1", [id])).rows[0].slug;
  assert.equal(await slugOf(seeded), "sentence-train", `run ${run}: seeded title gets its slug`);
  assert.equal(await slugOf(renamed), null, `run ${run}: a renamed resource keeps its UUID address`);
  assert.equal(await slugOf(dupA), null, `run ${run}: ambiguous titles are skipped`);
  assert.equal(await slugOf(dupB), null, `run ${run}: ambiguous titles are skipped`);

  const catalog = (await db.query("select id, slug from public.resource_catalog order by title")).rows;
  assert.equal(catalog.length, countBefore, `run ${run}: the view still lists every published resource`);
  assert.equal(catalog.find((row) => row.id === seeded).slug, "sentence-train", `run ${run}: view exposes slug`);

  const columns = (await db.query(
    "select column_name from information_schema.columns where table_schema='public' and table_name='resource_catalog' order by ordinal_position",
  )).rows.map((row) => row.column_name);
  assert.equal(columns.at(-1), "slug", `run ${run}: slug is the last view column`);
  assert.ok(columns.includes("required_plan_ids") && columns.includes("review_count"), "029 columns preserved");
}

// Constraint and uniqueness are enforced.
async function rejects(sql, params, label) {
  await assert.rejects(() => db.query(sql, params), undefined, label);
}
const other = await addResource("Another");
await rejects("update public.resources set slug = 'Bad Slug' where id = $1", [other], "uppercase/space rejected");
await rejects("update public.resources set slug = 'ab' where id = $1", [other], "too short rejected");
await rejects("update public.resources set slug = 'double--dash' where id = $1", [other], "double hyphen rejected");
await rejects("update public.resources set slug = '11111111-2222-4333-8444-555555555555' where id = $1", [other], "UUID-shaped slug rejected");
await rejects("update public.resources set slug = 'sentence-train' where id = $1", [other], "duplicate slug rejected");
await db.query("update public.resources set slug = 'another-one' where id = $1", [other]);
await db.query("update public.resources set slug = null where id = $1", [other]);

// Browser roles stay read-only on the view.
for (const [role, privilege] of [["anon", "insert"], ["anon", "update"], ["authenticated", "delete"], ["authenticated", "truncate"]]) {
  const { rows } = await db.query("select has_table_privilege($1, 'public.resource_catalog', $2) as allowed", [role, privilege]);
  assert.equal(rows[0].allowed, false, `${role} must not hold ${privilege}`);
}

console.log("migration 053 resource slugs: ok");
await db.close();
