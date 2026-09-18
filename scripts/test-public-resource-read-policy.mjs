import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Offline RLS regression for migration 023. No live Supabase connection.
const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260918090100_023_split_public_resource_read_policy.sql", import.meta.url),
  "utf8",
);

async function visibleTitles(role, admin = false) {
  await db.query("select set_config('app.is_admin', $1, false)", [String(admin)]);
  await db.exec(`set role ${role}`);
  try {
    const { rows } = await db.query("select title from public.resources order by title");
    return rows.map(({ title }) => title);
  } finally {
    await db.exec("reset role");
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create table public.resources (
      title text primary key,
      status text not null
    );
    alter table public.resources enable row level security;
    grant usage on schema public to anon, authenticated;
    grant select on public.resources to anon, authenticated;

    create function public.is_admin() returns boolean
      language sql security definer stable
      set search_path = public
      as $$ select current_setting('app.is_admin', true) = 'true' $$;
    revoke execute on function public.is_admin() from public, anon;
    grant execute on function public.is_admin() to authenticated;

    create policy "resources_public_read_published"
      on public.resources for select
      using (status = 'published' or public.is_admin());

    insert into public.resources(title, status) values
      ('Archived', 'archived'),
      ('Draft', 'draft'),
      ('Published', 'published');
  `);

  await assert.rejects(
    () => visibleTitles("anon"),
    /permission denied for function is_admin/,
    "the test baseline must reproduce the old anonymous catalog failure",
  );

  await db.exec(migration);

  const { rows: policies } = await db.query(`
    select policyname, roles, qual from pg_policies
    where schemaname = 'public' and tablename = 'resources'
      and policyname in ('resources_public_read_published', 'resources_admin_read')
    order by policyname
  `);
  assert.deepEqual(policies.map(({ policyname, roles }) => [policyname, roles]), [
    ["resources_admin_read", ["authenticated"]],
    ["resources_public_read_published", ["anon", "authenticated"]],
  ]);
  assert.match(policies[0].qual, /is_admin\(\)/);
  assert.doesNotMatch(policies[1].qual, /is_admin\(\)/);

  const { rows: privileges } = await db.query(`
    select
      has_function_privilege('anon', 'public.is_admin()', 'EXECUTE') as anon_can_call,
      has_function_privilege('authenticated', 'public.is_admin()', 'EXECUTE') as member_can_call
  `);
  assert.deepEqual(privileges[0], { anon_can_call: false, member_can_call: true });

  assert.deepEqual(await visibleTitles("anon"), ["Published"]);
  assert.deepEqual(await visibleTitles("anon", true), ["Published"], "anon cannot see drafts even if a session setting is spoofed");
  assert.deepEqual(await visibleTitles("authenticated"), ["Published"]);
  assert.deepEqual(await visibleTitles("authenticated", true), ["Archived", "Draft", "Published"]);

  process.stdout.write("Migration 023 public resource read RLS passed in isolated PGlite.\n");
} finally {
  await db.close();
}
