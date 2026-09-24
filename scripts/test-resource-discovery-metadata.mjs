import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const discoveryMigration = readFileSync(
  new URL("../supabase/migrations/20260925090000_026_resource_discovery_metadata.sql", import.meta.url),
  "utf8",
);
const newBadgeMigration = readFileSync(
  new URL("../supabase/migrations/20260925100000_027_resource_new_badge.sql", import.meta.url),
  "utf8",
);

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";
const premiumId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const freeId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const draftId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const futureId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const nullPublishedAtId = "ffffffff-ffff-4fff-8fff-ffffffffffff";

async function asAuthenticated(userId, run) {
  await db.query("select set_config('app.user_id', $1, false)", [userId]);
  await db.query("select set_config('app.is_anonymous', 'false', false)");
  await db.exec("set role authenticated");
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;

    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('app.user_id', true), '')::uuid
    $$;
    create function auth.jwt() returns jsonb language sql stable as $$
      select jsonb_build_object(
        'is_anonymous', current_setting('app.is_anonymous', true) = 'true'
      )
    $$;

    create table public.profiles (
      id uuid primary key,
      plan text not null default 'free'
    );
    create table public.plans (
      id text primary key,
      name text not null,
      sort_order integer not null default 0,
      lifecycle_status text not null default 'active',
      is_public boolean not null default true,
      is_upgradeable boolean not null default true
    );
    create table public.plan_features (
      plan_id text not null references public.plans(id),
      feature_id text not null,
      enabled boolean not null default false,
      limit_value bigint,
      primary key (plan_id, feature_id)
    );
    create table public.resources (
      id uuid primary key,
      title text not null,
      meta text,
      description text,
      category text,
      delivery_mode text not null,
      cta_url text,
      cover_image_url text,
      status text not null default 'draft',
      published_at timestamptz,
      created_at timestamptz not null default now(),
      tags text[] not null default '{}',
      is_free boolean not null default true,
      file_path text,
      file_name text,
      file_size bigint,
      file_mime_type text
    );
    create table public.saved_resources (
      user_id uuid not null references public.profiles(id) on delete cascade,
      resource_id uuid not null references public.resources(id) on delete cascade,
      created_at timestamptz not null default now(),
      primary key (user_id, resource_id)
    );
    alter table public.saved_resources enable row level security;
    create policy "saved_resources_own" on public.saved_resources for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);

    create function public.membership_plan_for_user(p_user_id uuid)
    returns text language sql stable security definer set search_path = public as $$
      select coalesce((select plan from public.profiles where id = p_user_id), 'free')
    $$;
    revoke execute on function public.membership_plan_for_user(uuid)
      from public, anon, authenticated;

    create function public.has_feature(p_feature_id text)
    returns boolean language sql stable security definer set search_path = public as $$
      select exists (
        select 1 from public.plan_features pf
        where pf.plan_id = public.membership_plan_for_user(auth.uid())
          and pf.feature_id = p_feature_id
          and pf.enabled = true
      )
    $$;
    revoke execute on function public.has_feature(text) from public, anon;
    grant execute on function public.has_feature(text) to authenticated;

    create function public.enforce_saved_resource_entitlement()
    returns trigger language plpgsql security definer set search_path = public as $$
    declare
      v_plan_id text;
      v_enabled boolean;
      v_limit bigint;
    begin
      perform pg_advisory_xact_lock(hashtextextended('saved-resources:' || new.user_id::text, 0));
      v_plan_id := public.membership_plan_for_user(new.user_id);
      select pf.enabled into v_enabled from public.plan_features pf
        where pf.plan_id = v_plan_id and pf.feature_id = 'favorites.enabled';
      if not coalesce(v_enabled, false) then
        raise exception 'Saving resources is not available for this membership';
      end if;
      select pf.limit_value into v_limit from public.plan_features pf
        where pf.plan_id = v_plan_id and pf.feature_id = 'favorites.limit' and pf.enabled;
      if v_limit is not null and
        (select count(*) from public.saved_resources where user_id = new.user_id) >= v_limit
      then
        raise exception 'Saved resource limit reached for this membership';
      end if;
      return new;
    end;
    $$;
    create trigger trg_enforce_saved_resource_entitlement
      before insert on public.saved_resources
      for each row execute function public.enforce_saved_resource_entitlement();
    revoke execute on function public.enforce_saved_resource_entitlement()
      from public, anon, authenticated;

    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant execute on function auth.jwt() to anon, authenticated;
    grant select (
      id, title, meta, description, category, delivery_mode, cover_image_url,
      status, published_at, created_at, tags, is_free, file_size
    ) on public.resources to anon, authenticated;
    grant select on public.plans, public.plan_features to anon, authenticated;
    grant select, insert, update, delete on public.saved_resources to authenticated;

    insert into public.profiles(id) values
      ('${userA}'), ('${userB}');
    insert into public.plans(id, name, sort_order, lifecycle_status, is_public, is_upgradeable) values
      ('free', 'ฟรี', 10, 'active', true, false),
      ('founder', 'Founder 100', 20, 'active', true, true),
      ('teacher', 'Teacher', 30, 'active', true, true),
      ('teacher_pro', 'Teacher Pro', 40, 'active', false, false),
      ('legacy', 'Legacy', 50, 'legacy', false, false),
      ('blocked', 'Blocked', 60, 'legacy', false, false);
    insert into public.plan_features(plan_id, feature_id, enabled, limit_value) values
      ('free', 'favorites.enabled', true, null),
      ('free', 'favorites.limit', true, 10),
      ('founder', 'download.premium', true, null),
      ('teacher', 'download.premium', true, null),
      ('teacher_pro', 'download.premium', true, null),
      ('legacy', 'download.premium', true, null);

    insert into public.resources(
      id, title, description, category, delivery_mode, cta_url,
      cover_image_url, status, published_at, tags, is_free, file_path, file_name
    ) values
      ('${premiumId}', 'สื่อพรีเมียม', 'safe premium detail', 'คณิตศาสตร์',
       'web_app', '/tools/premium?token=TARGET-SECRET', 'https://cdn.test/premium.jpg',
       'published', now(), array['เกม'], false, null, null),
      ('${freeId}', 'สื่อฟรี', 'safe free detail', 'ภาษาไทย',
       'file_download', null, 'https://cdn.test/free.jpg',
       'published', now(), array['ใบงาน'], true, '${freeId}/free.pdf', 'private-free.pdf'),
      ('${draftId}', 'ฉบับร่าง', 'not public', 'คณิตศาสตร์',
       'web_app', '/tools/draft', 'https://cdn.test/draft.jpg',
       'draft', null, '{}', false, null, null),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'ตัวอย่างปลอม', 'not usable', 'อื่น ๆ',
       'web_app', 'https://example.com/placeholder', 'https://cdn.test/placeholder.jpg',
       'published', now(), '{}', true, null, null);

    insert into public.saved_resources(user_id, resource_id)
    values ('${userB}', '${premiumId}');
  `);

  await db.exec(discoveryMigration);
  await db.exec(newBadgeMigration);

  const defaults = await db.query(
    "select id, grade_levels from public.resources where id = $1",
    [premiumId],
  );
  assert.deepEqual(defaults.rows[0].grade_levels, [], "existing resources must receive an empty, non-guessed grade list");
  await db.query(
    "update public.resources set grade_levels = array['p4', 'p5'] where id = $1",
    [premiumId],
  );
  await assert.rejects(
    () => db.query("update public.resources set grade_levels = array['unverified'] where id = $1", [premiumId]),
    /resources_grade_levels_allowed/,
  );
  await assert.rejects(
    () => db.query("update public.resources set grade_levels = array['all', 'p4'] where id = $1", [premiumId]),
    /resources_grade_levels_allowed/,
  );

  const gradeIndex = await db.query(`
    select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'idx_resources_grade_levels'
  `);
  assert.match(gradeIndex.rows[0].indexdef, /USING gin \(grade_levels\)/i);

  const resourcePrivileges = await db.query(`
    select
      has_column_privilege('anon', 'public.resources', 'grade_levels', 'SELECT') as grade,
      has_column_privilege('anon', 'public.resources', 'cta_url', 'SELECT') as target,
      has_column_privilege('authenticated', 'public.resources', 'file_path', 'SELECT') as file_path
  `);
  assert.deepEqual(resourcePrivileges.rows[0], { grade: true, target: false, file_path: false });

  const catalogColumns = await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'resource_catalog'
    order by ordinal_position
  `);
  const columnNames = catalogColumns.rows.map(({ column_name }) => column_name);
  assert(columnNames.includes("grade_levels"));
  assert(columnNames.includes("required_plan_names"));
  assert(columnNames.includes("is_new"));
  for (const forbidden of ["cta_url", "file_path", "file_name", "file_mime_type"]) {
    assert(!columnNames.includes(forbidden), `${forbidden} leaked into safe catalog`);
  }
  const viewOptions = await db.query(`
    select reloptions from pg_class
    where oid = 'public.resource_catalog'::regclass
  `);
  assert(viewOptions.rows[0].reloptions.includes("security_barrier=true"));

  const savedIndex = await db.query(`
    select indexdef from pg_indexes
    where schemaname = 'public' and indexname = 'idx_saved_resources_user_created'
  `);
  assert.match(savedIndex.rows[0].indexdef, /\(user_id, created_at DESC, resource_id\)/i);

  await db.exec("set role anon");
  let catalogRows;
  try {
    catalogRows = (await db.query(`
      select title, grade_levels, required_plan_names, is_new
      from public.resource_catalog order by title
    `)).rows;
  } finally {
    await db.exec("reset role");
  }
  assert.deepEqual(
    catalogRows.map(({ title }) => title).sort(),
    ["สื่อฟรี", "สื่อพรีเมียม"].sort(),
  );
  const premium = catalogRows.find(({ title }) => title === "สื่อพรีเมียม");
  const free = catalogRows.find(({ title }) => title === "สื่อฟรี");
  assert.deepEqual(premium.grade_levels, ["p4", "p5"]);
  assert.deepEqual(premium.required_plan_names, ["Founder 100", "Teacher"]);
  assert.equal(premium.is_new, true);
  assert.deepEqual(free.required_plan_names, []);
  assert.equal(free.is_new, true);
  assert(!JSON.stringify(catalogRows).includes("TARGET-SECRET"));
  assert(!JSON.stringify(catalogRows).includes("private-free.pdf"));

  // The badge window is derived by the view from the database clock. A
  // metadata-only edit must preserve the original publication timestamp.
  await db.query(
    "update public.resources set published_at = current_timestamp - interval '6 days' where id = $1",
    [premiumId],
  );
  const publishedBeforeMetadataEdit = await db.query(
    "select published_at::text as published_at from public.resources where id = $1",
    [premiumId],
  );
  await db.query(
    "update public.resources set meta = 'updated metadata only' where id = $1",
    [premiumId],
  );
  const afterMetadataEdit = await db.query(`
    select r.published_at::text as published_at, c.is_new
    from public.resources r
    join public.resource_catalog c on c.id = r.id
    where r.id = $1
  `, [premiumId]);
  assert.equal(
    afterMetadataEdit.rows[0].published_at,
    publishedBeforeMetadataEdit.rows[0].published_at,
    "metadata edits must not restart the publication window",
  );
  assert.equal(afterMetadataEdit.rows[0].is_new, true, "a six-day-old resource remains new");

  // Hold current_timestamp stable inside one transaction so the resource is
  // exactly seven days old, not merely a few milliseconds past the boundary.
  await db.exec("begin");
  try {
    await db.query(
      "update public.resources set published_at = current_timestamp - interval '7 days' where id = $1",
      [premiumId],
    );
    const exactBoundary = await db.query(
      "select is_new from public.resource_catalog where id = $1",
      [premiumId],
    );
    assert.equal(exactBoundary.rows[0].is_new, false, "exactly seven days old must not be new");
  } finally {
    await db.exec("rollback");
  }

  await db.query(
    "update public.resources set published_at = current_timestamp - interval '8 days' where id = $1",
    [freeId],
  );
  const expired = await db.query(
    "select is_new from public.resource_catalog where id = $1",
    [freeId],
  );
  assert.equal(expired.rows[0].is_new, false, "an eight-day-old resource must not be new");

  await db.query(`
    insert into public.resources(
      id, title, description, category, delivery_mode, cta_url,
      status, published_at, tags, is_free
    ) values
      ($1, 'เผยแพร่ในอนาคต', 'future', 'อื่น ๆ', 'web_app', '/tools/future',
       'published', current_timestamp + interval '1 day', '{}', true),
      ($2, 'ไม่มีเวลาเผยแพร่', 'null timestamp', 'อื่น ๆ', 'web_app', '/tools/no-date',
       'published', null, '{}', true)
  `, [futureId, nullPublishedAtId]);
  const nonCurrent = await db.query(`
    select id, is_new from public.resource_catalog
    where id in ($1, $2) order by id
  `, [futureId, nullPublishedAtId]);
  assert.equal(nonCurrent.rows.length, 2);
  assert(nonCurrent.rows.every(({ is_new }) => is_new === false), "future/null publication times must not be new");

  await asAuthenticated(userA, async () => {
    const before = await db.query("select resource_id from public.saved_resources");
    assert.deepEqual(before.rows, [], "member A must not see member B favorites");

    await db.query(
      "insert into public.saved_resources(user_id, resource_id) values ($1, $2)",
      [userA, premiumId],
    );
    await assert.rejects(
      () => db.query("insert into public.saved_resources(user_id, resource_id) values ($1, $2)", [userB, freeId]),
      /row-level security policy/,
    );
    await assert.rejects(
      () => db.query("insert into public.saved_resources(user_id, resource_id) values ($1, $2)", [userA, draftId]),
      /row-level security policy/,
    );
    await db.query(
      "insert into public.saved_resources(user_id, resource_id) values ($1, $2)",
      [userA, freeId],
    );
    await assert.rejects(
      () => db.query(
        "update public.saved_resources set user_id = $1 where user_id = $2 and resource_id = $3",
        [userB, userA, freeId],
      ),
      /row-level security policy/,
    );
    await db.query(
      "delete from public.saved_resources where user_id = $1 and resource_id = $2",
      [userA, freeId],
    );

    const first = await db.query("select public.set_my_resource_saved($1, true) as saved", [premiumId]);
    const second = await db.query("select public.set_my_resource_saved($1, true) as saved", [premiumId]);
    assert.equal(first.rows[0].saved, true);
    assert.equal(second.rows[0].saved, true);
    const oneRow = await db.query(
      "select count(*)::integer as count from public.saved_resources where resource_id = $1",
      [premiumId],
    );
    assert.equal(oneRow.rows[0].count, 1, "repeated save must remain idempotent");

    await db.query("select public.set_my_resource_saved($1, true)", [freeId]);
    const removed = await db.query("select public.set_my_resource_saved($1, false) as saved", [freeId]);
    const removedAgain = await db.query("select public.set_my_resource_saved($1, false) as saved", [freeId]);
    assert.equal(removed.rows[0].saved, false);
    assert.equal(removedAgain.rows[0].saved, false);
    await assert.rejects(
      () => db.query("select public.set_my_resource_saved($1, true)", [draftId]),
      /Published resource not found/,
    );

    await db.query("delete from public.saved_resources where user_id = $1", [userB]);
  });

  const memberBStillSaved = await db.query(
    "select count(*)::integer as count from public.saved_resources where user_id = $1",
    [userB],
  );
  assert.equal(memberBStillSaved.rows[0].count, 1, "member A must not delete member B favorites");

  await db.query("update public.profiles set plan = 'blocked' where id = $1", [userA]);
  await asAuthenticated(userA, async () => {
    await assert.rejects(
      () => db.query(
        "update public.saved_resources set resource_id = $1 where user_id = $2 and resource_id = $3",
        [freeId, userA, premiumId],
      ),
      /row-level security policy/,
    );
  });
  const unchangedFavorite = await db.query(
    "select resource_id from public.saved_resources where user_id = $1",
    [userA],
  );
  assert.equal(unchangedFavorite.rows[0].resource_id, premiumId, "UPDATE must not bypass favorites.enabled");
  await db.query("update public.profiles set plan = 'free' where id = $1", [userA]);

  await db.query("select set_config('app.user_id', $1, false)", [userA]);
  await db.query("select set_config('app.is_anonymous', 'true', false)");
  await db.exec("set role authenticated");
  try {
    await assert.rejects(
      () => db.query("select public.set_my_resource_saved($1, true)", [freeId]),
      /Authenticated member required/,
    );
  } finally {
    await db.exec("reset role");
  }

  const privileges = await db.query(`
    select
      has_function_privilege('anon', 'public.set_my_resource_saved(uuid, boolean)', 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', 'public.set_my_resource_saved(uuid, boolean)', 'EXECUTE') as authenticated_execute
  `);
  assert.deepEqual(privileges.rows[0], { anon_execute: false, authenticated_execute: true });

  process.stdout.write("Migrations 026-027 discovery metadata, DB-clock new badge, and favorites RLS passed in isolated PGlite.\n");
} finally {
  await db.close();
}
