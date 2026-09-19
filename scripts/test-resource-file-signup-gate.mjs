import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Offline regression for migration 022. This creates only the schema that its
// policy depends on, in an ephemeral PGlite database; it never contacts Supabase.
const db = new PGlite();
const migration = readFileSync(
  new URL("../supabase/migrations/20260918090000_022_resource_file_signup_gate.sql", import.meta.url),
  "utf8",
);

const freeId = randomUUID();
const premiumId = randomUUID();
const draftId = randomUUID();
const teacherId = randomUUID();
const freePath = `${freeId}/lesson.pdf`;
const premiumPath = `${premiumId}/lesson.pdf`;
const draftPath = `${draftId}/lesson.pdf`;
const orphanPath = `${freeId}/old-version.pdf`;

async function visiblePaths(role, { uid = "", anonymous = false, premium = false } = {}) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid]);
  await db.query("select set_config('request.jwt.claim.is_anonymous', $1, false)", [String(anonymous)]);
  await db.query("select set_config('app.has_premium', $1, false)", [String(premium)]);
  await db.exec(`set role ${role}`);
  try {
    const { rows } = await db.query("select name from storage.objects order by name");
    return rows.map(({ name }) => name);
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

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object(
        'is_anonymous', current_setting('request.jwt.claim.is_anonymous', true)
      );
    $$;
    create function public.is_admin() returns boolean language sql stable as $$
      select false;
    $$;
    create function public.has_feature(feature text) returns boolean language sql stable as $$
      select feature = 'download.premium'
        and current_setting('app.has_premium', true) = 'true';
    $$;

    create table public.resources (
      id uuid primary key,
      file_path text,
      status text not null,
      is_free boolean not null
    );
    create table storage.objects (
      bucket_id text not null,
      name text not null
    );
    alter table storage.objects enable row level security;
    grant usage on schema auth, storage to anon, authenticated;
    grant select on public.resources, storage.objects to anon, authenticated;

    -- The pre-022 policy deliberately reproduces the anonymous free-file leak.
    create policy resource_files_entitled_read on storage.objects
      for select using (
        bucket_id = 'resource-files'
        and exists (
          select 1 from public.resources r
          where r.file_path = storage.objects.name
            and r.id::text = (regexp_match(storage.objects.name, '^([^/]+)/'))[1]
            and r.status = 'published'
            and (r.is_free or public.has_feature('download.premium'))
        )
      );
  `);

  for (const [id, path, status, free] of [
    [freeId, freePath, "published", true],
    [premiumId, premiumPath, "published", false],
    [draftId, draftPath, "draft", true],
  ]) {
    await db.query(
      "insert into public.resources(id, file_path, status, is_free) values ($1, $2, $3, $4)",
      [id, path, status, free],
    );
    await db.query("insert into storage.objects(bucket_id, name) values ('resource-files', $1)", [path]);
  }
  await db.query("insert into storage.objects(bucket_id, name) values ('resource-files', $1)", [orphanPath]);
  await db.query("insert into storage.objects(bucket_id, name) values ('other-bucket', $1)", [freePath]);

  assert.deepEqual(
    await visiblePaths("anon"),
    [freePath],
    "test baseline must demonstrate the anonymous free-file leak before 022",
  );

  await db.exec(migration);
  const { rows: policies } = await db.query(`
    select roles from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'resource_files_entitled_read'
  `);
  assert.deepEqual(policies[0]?.roles, ["authenticated"]);

  assert.deepEqual(await visiblePaths("anon"), [], "anon must not read even a free file");
  assert.deepEqual(
    await visiblePaths("authenticated", { uid: teacherId }),
    [freePath],
    "a permanent authenticated free member may read only the exact published free file",
  );
  assert.deepEqual(
    await visiblePaths("authenticated", { uid: teacherId, anonymous: true }),
    [],
    "a Supabase anonymous Auth user must not be treated as a registered teacher",
  );
  assert.deepEqual(
    await visiblePaths("authenticated", { uid: teacherId, premium: true }),
    [freePath, premiumPath].sort(),
    "premium entitlement may read exact published premium files but not drafts or orphan files",
  );
  assert.deepEqual(
    await visiblePaths("authenticated", { uid: "", premium: true }),
    [],
    "an authenticated role without a user ID must not read files",
  );

  process.stdout.write("Migration 022 resource-file signup gate passed in isolated PGlite.\n");
} finally {
  await db.close();
}
