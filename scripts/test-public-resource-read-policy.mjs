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
    create schema auth;
    create schema storage;
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('app.user_id', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable
      as $$ select jsonb_build_object('is_anonymous', current_setting('app.is_anonymous', true) = 'true') $$;
    create table public.resources (
      id uuid primary key,
      title text not null,
      status text not null,
      meta text, description text, category text, delivery_mode text,
      cta_url text, cover_image_url text, published_at timestamptz,
      created_at timestamptz default now(), created_by uuid,
      tags text[], is_free boolean, file_path text, file_name text,
      file_size bigint, file_mime_type text
    );
    create table storage.objects (bucket_id text not null, name text not null);
    alter table public.resources enable row level security;
    alter table storage.objects enable row level security;
    grant usage on schema public to anon, authenticated;
    grant usage on schema auth, storage to anon, authenticated;
    grant select on public.resources to anon, authenticated;
    grant select (cta_url, file_path, file_name) on public.resources to anon, authenticated;
    grant insert, update, delete on public.resources to authenticated;
    grant select on storage.objects to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function auth.jwt() to anon, authenticated;

    create function public.is_admin() returns boolean
      language sql security definer stable
      set search_path = public
      as $$ select current_setting('app.is_admin', true) = 'true' $$;
    revoke execute on function public.is_admin() from public, anon;
    grant execute on function public.is_admin() to authenticated;
    create function public.has_feature(text) returns boolean
      language sql security definer stable
      as $$ select current_setting('app.premium', true) = 'true' $$;
    revoke execute on function public.has_feature(text) from public, anon;
    grant execute on function public.has_feature(text) to authenticated;

    create policy "resources_public_read_published"
      on public.resources for select
      using (status = 'published' or public.is_admin());
    create policy "resources_admin_update"
      on public.resources for update to authenticated
      using (public.is_admin()) with check (public.is_admin());

    create policy resource_files_entitled_read on storage.objects
      for select to authenticated
      using (bucket_id = 'resource-files' and exists (
        select 1 from public.resources r where r.file_path = storage.objects.name
      ));

    insert into public.resources(id, title, status, delivery_mode, cta_url, cover_image_url, is_free, file_path) values
      ('00000000-0000-4000-8000-000000000001', 'Archived', 'archived', 'web_app', '/archived', 'https://cdn.test/cover.jpg', true, null),
      ('00000000-0000-4000-8000-000000000002', 'Draft', 'draft', 'web_app', '/draft', 'https://cdn.test/cover.jpg', true, null),
      ('00000000-0000-4000-8000-000000000003', 'Published', 'published', 'web_app', '/premium', 'https://cdn.test/cover.jpg', false, null),
      ('00000000-0000-4000-8000-000000000004', 'Free', 'published', 'web_app', '/free', 'https://cdn.test/cover.jpg', true, null),
      ('00000000-0000-4000-8000-000000000005', 'File', 'published', 'file_download', null, 'https://cdn.test/cover.jpg', true, '00000000-0000-4000-8000-000000000005/worksheet.pdf'),
      ('00000000-0000-4000-8000-000000000006', 'Placeholder', 'published', 'web_app', 'https://example.com/placeholder', 'https://cdn.test/cover.jpg', true, null),
      ('00000000-0000-4000-8000-000000000007', 'Localhost', 'published', 'web_app', 'http://localhost:3000/tool', 'https://cdn.test/cover.jpg', true, null);
    insert into storage.objects(bucket_id, name) values
      ('resource-files', '00000000-0000-4000-8000-000000000005/worksheet.pdf'),
      ('resource-files', '00000000-0000-4000-8000-000000000005/obsolete.pdf');
    update public.resources set file_name = 'teacher-private-name.pdf'
      where id = '00000000-0000-4000-8000-000000000005';
  `);

  await db.query("select set_config('app.user_id', $1, false)", ['11111111-1111-4111-8111-111111111111']);
  await db.query("select set_config('app.is_anonymous', 'false', false)");
  await db.query("select set_config('app.premium', 'false', false)");

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

  assert.deepEqual(await visibleTitles("anon"), ["File", "Free", "Localhost", "Placeholder", "Published"]);
  assert.deepEqual(await visibleTitles("anon", true), ["File", "Free", "Localhost", "Placeholder", "Published"], "anon cannot see drafts even if a session setting is spoofed");
  assert.deepEqual(await visibleTitles("authenticated"), ["File", "Free", "Localhost", "Placeholder", "Published"]);
  assert.deepEqual(await visibleTitles("authenticated", true), ["Archived", "Draft", "File", "Free", "Localhost", "Placeholder", "Published"]);
  await db.query("select set_config('app.is_admin', 'false', false)");

  for (const role of ["anon", "authenticated"]) {
    const { rows: [privilege] } = await db.query(`
      select
        has_column_privilege('${role}', 'public.resources', 'cta_url', 'SELECT') as cta,
        has_column_privilege('${role}', 'public.resources', 'file_path', 'SELECT') as file,
        has_column_privilege('${role}', 'public.resources', 'file_name', 'SELECT') as filename,
        has_column_privilege('${role}', 'public.resources', 'title', 'SELECT') as title,
        has_function_privilege('${role}', 'public.resolve_resource_target(uuid)', 'EXECUTE') as resolve
    `);
    assert.deepEqual(privilege, { cta: false, file: false, filename: false, title: true, resolve: role === "authenticated" });
    await db.exec(`set role ${role}`);
    try {
      await assert.rejects(() => db.query("select cta_url from public.resources"), /permission denied/);
      await assert.rejects(() => db.query("select file_path from public.resources"), /permission denied/);
      await assert.rejects(() => db.query("select file_name from public.resources"), /permission denied/);
      await assert.rejects(() => db.query("select title from public.resources where cta_url = '/premium'"), /permission denied/, "filters must not become a destination-existence oracle");
      const { rows } = await db.query("select title from public.resource_catalog order by title");
      assert.deepEqual(rows.map((row) => row.title), ["File", "Free", "Published"]);
      await assert.rejects(() => db.query("select file_name from public.resource_catalog"), /does not exist/);
    } finally { await db.exec("reset role"); }
  }

  await db.exec("set role authenticated");
  try {
    const resolve = async (id) => (await db.query("select cta_url, file_path from public.resolve_resource_target($1)", [id])).rows;
    assert.deepEqual(await resolve("00000000-0000-4000-8000-000000000003"), [], "Free account cannot resolve premium link");
    assert.equal((await resolve("00000000-0000-4000-8000-000000000004"))[0].cta_url, "/free");
    assert.equal((await resolve("00000000-0000-4000-8000-000000000005"))[0].file_path, "00000000-0000-4000-8000-000000000005/worksheet.pdf");
    assert.equal((await db.query("select file_name from public.resolve_resource_target($1)", ["00000000-0000-4000-8000-000000000005"])).rows[0].file_name, "teacher-private-name.pdf", "authorized download retains original filename");
    const { rows: fileRows } = await db.query("select name from storage.objects");
    assert.equal(fileRows.length, 1, "registered Free member can read exact free file");
    await db.query("select set_config('app.premium', 'true', false)");
    assert.equal((await resolve("00000000-0000-4000-8000-000000000003"))[0].cta_url, "/premium");
    await db.query("select set_config('app.premium', 'false', false)");
    await db.query("select set_config('app.is_anonymous', 'true', false)");
    assert.deepEqual(await resolve("00000000-0000-4000-8000-000000000004"), [], "anonymous Auth user gets no destination");
    assert.equal((await db.query("select name from storage.objects")).rows.length, 0);
    await db.query("select set_config('app.is_anonymous', 'false', false)");
    await db.query("select set_config('app.is_admin', 'true', false)");
    await assert.rejects(() => db.query("select cta_url from public.resources"), /permission denied/, "admin browser role must still use guarded RPC");
    await assert.rejects(() => db.query("select file_name from public.resources"), /permission denied/, "admin browser role also uses guarded RPC for private filenames");
    assert.equal((await resolve("00000000-0000-4000-8000-000000000002"))[0].cta_url, "/draft", "admin can edit draft");
    await db.query("update public.resources set cta_url = '/draft-edited' where id = $1", ["00000000-0000-4000-8000-000000000002"]);
    assert.equal((await resolve("00000000-0000-4000-8000-000000000002"))[0].cta_url, "/draft-edited", "admin can save a destination without direct SELECT privilege");
    assert.equal((await db.query("select name from storage.objects")).rows.length, 2, "admin can access files for cleanup");
  } finally { await db.exec("reset role"); }

  process.stdout.write("Migration 023 public resource read RLS passed in isolated PGlite.\n");
} finally {
  await db.close();
}
