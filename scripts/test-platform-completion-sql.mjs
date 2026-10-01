import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const migrations = [
  "20260925110000_028_resource_access_featured_benefits.sql",
  "20260925120000_029_private_requests_reviews_reports.sql",
  "20260925130000_030_member_profile_avatars.sql",
  "20260927193000_031_public_vocab_defuse_resource.sql",
  "20260927195000_032_public_treasure_chest_resource.sql",
  "20260927203000_033_public_bingo_fun_resource.sql",
  "20260927214500_034_public_picture_word_match_resource.sql",
  "20260928001500_035_public_mission_wheel_resource.sql",
  "20260928093000_036_public_vocab_fishing_resource.sql",
  "20260928100000_037_public_sentence_train_resource.sql",
  "20260928103000_038_public_ice_cream_math_resource.sql",
  "20260928113000_039_public_word_squad_resource.sql",
  "20260928125500_040_public_daily_word_detective_resource.sql",
  "20260928140000_041_public_listening_detective_resource.sql",
  "20260929090000_042_public_sentence_train_grammar_resource.sql",
  "20260929100000_043_public_grammar_boss_battle_resource.sql",
  "20260929110000_044_public_kaokham_resource.sql",
  "20261001150000_045_public_ar_phonics_quest_resource.sql",
  "20261001160000_046_public_number_listening_line_resource.sql",
];

const USERS = {
  free: "11111111-1111-4111-8111-111111111111",
  teacher: "22222222-2222-4222-8222-222222222222",
  other: "33333333-3333-4333-8333-333333333333",
  admin: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};
const RESOURCES = {
  authenticated: "10000000-0000-4000-8000-000000000001",
  legacyPremium: "10000000-0000-4000-8000-000000000002",
  publicFile: "10000000-0000-4000-8000-000000000003",
  planFile: "10000000-0000-4000-8000-000000000004",
  lockedFile: "10000000-0000-4000-8000-000000000005",
  anotherPublic: "10000000-0000-4000-8000-000000000006",
  newLegacyPremium: "10000000-0000-4000-8000-000000000007",
  vocabDefuse: "6cc12b2d-5ebc-4533-85d0-13038a0dc189",
  treasureChest: "4c1203ce-6e4f-40bd-8dc2-01713e88dcdd",
  bingoFun: "03ae013c-1409-4cb1-aa7c-ce264a94312a",
  pictureWordMatch: "fa15179e-9937-4d25-951c-7af9ab466589",
  missionWheel: "a7266b9c-3539-423b-9119-dbf019b887cb",
  vocabFishing: "2fd4da60-b60a-43ea-b382-5b2065e15241",
  sentenceTrain: "427fb64e-34e0-4f8b-be0e-ee5131e78060",
  iceCreamMath: "a6bdbe60-2672-45ba-8773-bab8cd700ef4",
  wordSquad: "ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8",
  dailyWordDetective: "4136ab94-76c8-43c7-a622-37ed9f41b167",
  listeningDetective: "df55f95a-b307-4aec-8b42-e6b9a1244a6e",
  sentenceTrainGrammar: "86afb9c3-20f2-4ab6-9ebc-9a454b36692b",
  grammarBossBattle: "f14855b7-3a39-4f59-85b9-06dde698d4d4",
  kaokham: "18e463f4-0117-4f0e-9fbf-921be97e5c14",
  arPhonicsQuest: "898fa4ab-4db0-4ec0-9c9b-1ba1d4150972",
  numberListeningLine: "a2dbb83c-33c0-4303-abfd-b9c8ed7799af",
};

async function asRole(role, userId, run, anonymous = role === "anon") {
  await db.query("select set_config('app.user_id', $1, false)", [userId ?? ""]);
  await db.query("select set_config('app.is_anonymous', $1, false)", [String(anonymous)]);
  await db.exec(`set role ${role}`);
  try {
    return await run();
  } finally {
    await db.exec("reset role");
  }
}

async function rejectsWith(run, pattern, message) {
  await assert.rejects(run, pattern, message);
}

async function resolveAs(role, userId, resourceId, anonymous) {
  return asRole(role, userId, async () => (
    await db.query("select delivery_mode, cta_url, file_path from public.resolve_resource_target($1)", [resourceId])
  ).rows, anonymous);
}

async function assertPublicGameSeed({
  resourceId,
  migration,
  label,
  title,
  meta,
  description,
  category,
  gradeLevels,
  ctaUrl,
  coverImageUrl,
  tags,
  duplicateTitleId,
  duplicateUrlId,
  alternateTitle,
}) {
  const beforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [resourceId])).rows[0];
  assert.equal(beforeReplay.id, resourceId);
  assert.equal(beforeReplay.title, title);
  assert.equal(beforeReplay.meta, meta);
  assert.equal(beforeReplay.description, description);
  assert.equal(beforeReplay.category, category);
  assert.deepEqual(beforeReplay.grade_levels, gradeLevels);
  assert.equal(beforeReplay.delivery_mode, "web_app");
  assert.equal(beforeReplay.cta_url, ctaUrl);
  assert.equal(beforeReplay.cover_image_url, coverImageUrl);
  assert.deepEqual(beforeReplay.tags, tags);
  assert.equal(beforeReplay.is_free, true);
  assert.equal(beforeReplay.status, "published");
  assert.equal(beforeReplay.access_mode, "public");
  assert.equal(beforeReplay.file_path, null);
  assert.equal(beforeReplay.file_name, null);
  assert.equal(beforeReplay.file_size, null);
  assert.equal(beforeReplay.file_mime_type, null);
  assert.equal(beforeReplay.created_by, null);
  assert.ok(beforeReplay.published_at);

  const sql = readFileSync(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8");
  await db.exec(sql);
  const afterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [resourceId],
  )).rows[0];
  assert.equal(afterReplay.count, 1);
  assert.equal(
    new Date(afterReplay.published_at).toISOString(),
    new Date(beforeReplay.published_at).toISOString(),
    `replaying the ${label} seed must preserve first publication time`,
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [resourceId],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [resourceId],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, resourceId, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, resourceId, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, resourceId, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, resourceId, false)).length, 1);

  await db.exec("begin");
  try {
    await db.query(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values ($1, $2, 'web_app', $3, true, 'draft', 'public')
    `, [duplicateTitleId, title, `https://duplicate-title.test/${label.toLowerCase().replaceAll(" ", "-")}`]);
    await rejectsWith(
      () => db.exec(sql),
      new RegExp(`${label} title or target already belongs to another resource`),
      `the ${label} seed must reject a duplicate title owned by another resource`,
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.query(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values ($1, $2, 'web_app', $3, true, 'draft', 'public')
    `, [duplicateUrlId, alternateTitle, `${ctaUrl}/`]);
    await rejectsWith(
      () => db.exec(sql),
      new RegExp(`${label} title or target already belongs to another resource`),
      `the ${label} seed must reject a normalized duplicate target URL`,
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.query("update public.resources set meta = 'tampered contract' where id = $1", [resourceId]);
    await rejectsWith(
      () => db.exec(sql),
      new RegExp(`Existing ${label} resource does not match the protected catalogue contract`),
      `the ${label} seed must fail closed when its existing ID has mismatched protected metadata`,
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.query(
      "insert into public.resource_plan_access(resource_id, plan_id) values ($1, 'teacher')",
      [resourceId],
    );
    await rejectsWith(
      () => db.exec(sql),
      new RegExp(`Public ${label} must not have plan-specific grants`),
      `the public ${label} seed must fail closed when a paid-plan grant exists`,
    );
  } finally {
    await db.exec("rollback");
  }
}

try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema storage;

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
      email text not null,
      full_name text,
      role text not null default 'member',
      plan text not null default 'free',
      created_at timestamptz not null default now()
    );
    create table public.plans (
      id text primary key,
      name text not null,
      price_label text not null,
      note text,
      features text[] not null default '{}',
      sort_order integer not null default 0,
      price_amount_thb integer,
      billing_interval text not null default 'year',
      lifecycle_status text not null default 'active',
      is_public boolean not null default true,
      is_upgradeable boolean not null default true,
      is_popular boolean not null default false
    );
    create table public.features (
      id text primary key,
      name text not null,
      description text,
      value_type text not null default 'boolean',
      created_at timestamptz not null default now()
    );
    create table public.plan_features (
      plan_id text not null references public.plans(id) on delete cascade,
      feature_id text not null references public.features(id) on delete cascade,
      enabled boolean not null default false,
      limit_value bigint,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
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
      created_by uuid references public.profiles(id),
      created_at timestamptz not null default now(),
      tags text[] not null default '{}',
      is_free boolean not null default true,
      file_path text,
      file_name text,
      file_size bigint,
      file_mime_type text,
      grade_levels text[] not null default '{}'
    );
    create table public.requests (
      id uuid primary key default gen_random_uuid(),
      title text not null,
      requested_by uuid references public.profiles(id),
      votes integer not null default 0,
      status text not null default 'pending',
      created_at timestamptz not null default now()
    );
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      bucket_id text not null,
      name text not null,
      owner_id text,
      primary key (bucket_id, name)
    );

    alter table public.profiles enable row level security;
    alter table public.resources enable row level security;
    alter table public.requests enable row level security;
    alter table storage.objects enable row level security;

    create function public.is_admin() returns boolean
    language sql stable security definer set search_path = public as $$
      select exists (
        select 1 from public.profiles
        where id = auth.uid() and role in ('admin', 'owner')
      )
    $$;
    create function public.is_owner() returns boolean
    language sql stable security definer set search_path = public as $$
      select exists (
        select 1 from public.profiles where id = auth.uid() and role = 'owner'
      )
    $$;
    create function public.membership_plan_for_user(p_user_id uuid) returns text
    language sql stable security definer set search_path = public as $$
      select coalesce((select plan from public.profiles where id = p_user_id), 'free')
    $$;
    revoke execute on function public.membership_plan_for_user(uuid)
      from public, anon, authenticated;

    create function public.prevent_self_privilege_escalation() returns trigger
    language plpgsql security definer set search_path = public as $$
    begin
      if not public.is_owner() then new.role := old.role; end if;
      if not public.is_admin() then new.plan := old.plan; end if;
      return new;
    end;
    $$;
    create trigger trg_prevent_self_privilege_escalation
      before update on public.profiles
      for each row execute function public.prevent_self_privilege_escalation();

    create policy profiles_select_own_or_admin on public.profiles for select
      to authenticated using (auth.uid() = id or public.is_admin());
    create policy profiles_update_own_or_admin on public.profiles for update
      to authenticated using (auth.uid() = id or public.is_admin())
      with check (auth.uid() = id or public.is_admin());
    create policy resources_public_read_published on public.resources for select
      to anon, authenticated using (status = 'published');
    create policy resources_admin_read on public.resources for select
      to authenticated using (public.is_admin());
    create policy resources_admin_insert on public.resources for insert
      to authenticated with check (public.is_admin());
    create policy resources_admin_update on public.resources for update
      to authenticated using (public.is_admin()) with check (public.is_admin());
    create policy resources_admin_delete on public.resources for delete
      to authenticated using (public.is_admin());
    create policy "requests_read_all_members" on public.requests for select
      to authenticated using (auth.uid() is not null);
    create policy "requests_insert_own" on public.requests for insert
      to authenticated with check (auth.uid() = requested_by);
    create policy "requests_admin_update" on public.requests for update
      to authenticated using (public.is_admin()) with check (public.is_admin());
    create policy resource_files_entitled_read on storage.objects for select
      to authenticated using (bucket_id = 'resource-files');

    grant usage on schema public, auth, storage to anon, authenticated;
    grant execute on function auth.uid(), auth.jwt() to anon, authenticated;
    grant execute on function public.is_admin(), public.is_owner() to authenticated;
    grant select on public.resources to anon, authenticated;
    grant insert, update, delete on public.resources to authenticated;
    grant select, update on public.profiles to authenticated;
    grant select, insert, update on public.requests to authenticated;
    grant select, insert, update, delete on storage.objects to anon, authenticated;

    insert into public.plans (
      id, name, price_label, sort_order, billing_interval,
      lifecycle_status, is_public, is_upgradeable
    ) values
      ('free', 'ฟรี', '0 บาท', 10, 'none', 'active', true, false),
      ('founder', 'Founder 100', '299 บาท/ปี', 20, 'year', 'active', true, true),
      ('teacher', 'Teacher', '599 บาท/ปี', 30, 'year', 'active', true, true),
      ('lifetime', 'Lifetime', 'สิทธิ์เดิม', 100, 'one_time', 'retired', false, false);
    insert into public.features(id, name, description, value_type) values
      ('favorites.enabled', 'รายการโปรด', 'บันทึกสื่อ', 'boolean'),
      ('favorites.limit', 'จำนวนรายการโปรด', 'จำนวนสูงสุด', 'integer'),
      ('download.premium', 'ดาวน์โหลดพรีเมียม', 'เข้าถึงไฟล์พรีเมียม', 'boolean'),
      ('disabled.example', 'ยังไม่เปิด', 'ต้องไม่แสดง', 'boolean');
    insert into public.plan_features(plan_id, feature_id, enabled, limit_value) values
      ('free', 'favorites.enabled', true, null),
      ('free', 'favorites.limit', true, 10),
      ('teacher', 'download.premium', true, null),
      ('founder', 'download.premium', true, null),
      ('lifetime', 'download.premium', true, null),
      ('teacher', 'disabled.example', false, null);

    insert into public.profiles(id, email, full_name, role, plan) values
      ('${USERS.free}', 'free@test.invalid', 'Free Teacher', 'member', 'free'),
      ('${USERS.teacher}', 'teacher@test.invalid', 'Paid Teacher', 'member', 'teacher'),
      ('${USERS.other}', 'other@test.invalid', 'Other Teacher', 'member', 'free'),
      ('${USERS.admin}', 'admin@test.invalid', 'Owner', 'owner', 'free');

    insert into public.resources(
      id, title, description, delivery_mode, cta_url, cover_image_url,
      status, published_at, is_free, file_path, file_name
    ) values
      ('${RESOURCES.authenticated}', 'Registered sample', 'auth', 'web_app', '/auth', 'https://cdn.test/auth.webp', 'published', now(), true, null, null),
      ('${RESOURCES.legacyPremium}', 'Legacy premium', 'premium', 'web_app', '/premium', 'https://cdn.test/premium.webp', 'published', now(), false, null, null);

    create view public.resource_catalog with (security_barrier = true) as
    select
      r.id, r.title, r.meta, r.description, r.category, r.delivery_mode,
      r.cover_image_url, r.tags, r.is_free, r.file_size, r.status,
      r.published_at, r.created_at, r.grade_levels,
      case when r.is_free then '{}'::text[] else array['Teacher']::text[] end as required_plan_names,
      (r.published_at is not null and current_timestamp < r.published_at + interval '7 days') as is_new
    from public.resources r where r.status = 'published';
    grant select on public.resource_catalog to anon, authenticated;
  `);

  for (const filename of migrations) {
    const sql = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
    await db.exec(sql);
    process.stdout.write(`executed ${filename}\n`);
  }

  const vocabDefuseBeforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [RESOURCES.vocabDefuse])).rows[0];
  assert.equal(vocabDefuseBeforeReplay.title, "กู้ระเบิดคำศัพท์");
  assert.equal(vocabDefuseBeforeReplay.meta, "เว็บเกมภาษาอังกฤษ · 48 คำ · 4 หมวด · 8 ด่าน · ป.1–6");
  assert.equal(vocabDefuseBeforeReplay.category, "ภาษาอังกฤษ");
  assert.deepEqual(vocabDefuseBeforeReplay.grade_levels, ["p1", "p2", "p3", "p4", "p5", "p6"]);
  assert.equal(vocabDefuseBeforeReplay.delivery_mode, "web_app");
  assert.equal(vocabDefuseBeforeReplay.cta_url, "https://kru-vocab-defuse-2026.onanongmini123.chatgpt.site");
  assert.equal(vocabDefuseBeforeReplay.cover_image_url, "https://kruaorry-web.vercel.app/images/resources/vocab-defuse.jpg");
  assert.deepEqual(vocabDefuseBeforeReplay.tags, ["เกม", "ภาษาอังกฤษ", "คำศัพท์", "ประถมศึกษา", "กิจกรรมทั้งห้อง"]);
  assert.equal(vocabDefuseBeforeReplay.is_free, true);
  assert.equal(vocabDefuseBeforeReplay.status, "published");
  assert.equal(vocabDefuseBeforeReplay.access_mode, "public");
  assert.equal(vocabDefuseBeforeReplay.file_path, null);
  assert.equal(vocabDefuseBeforeReplay.file_name, null);
  assert.equal(vocabDefuseBeforeReplay.file_size, null);
  assert.equal(vocabDefuseBeforeReplay.file_mime_type, null);
  assert.equal(vocabDefuseBeforeReplay.created_by, null);
  assert.ok(vocabDefuseBeforeReplay.published_at);

  const vocabDefuseSql = readFileSync(
    new URL("../supabase/migrations/20260927193000_031_public_vocab_defuse_resource.sql", import.meta.url),
    "utf8",
  );
  await db.exec(vocabDefuseSql);
  const vocabDefuseAfterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [RESOURCES.vocabDefuse],
  )).rows[0];
  assert.equal(vocabDefuseAfterReplay.count, 1);
  assert.equal(
    new Date(vocabDefuseAfterReplay.published_at).toISOString(),
    new Date(vocabDefuseBeforeReplay.published_at).toISOString(),
    "replaying the idempotent seed must preserve first publication time",
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [RESOURCES.vocabDefuse],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [RESOURCES.vocabDefuse],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.vocabDefuse, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.vocabDefuse, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.vocabDefuse, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.vocabDefuse, false)).length, 1);

  const treasureChestBeforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [RESOURCES.treasureChest])).rows[0];
  assert.equal(treasureChestBeforeReplay.title, "เปิดหีบสมบัติ");
  assert.equal(treasureChestBeforeReplay.meta, "เว็บเกมทีม · 120 ข้อ · คณิตศาสตร์และอังกฤษ · 3 ระดับ · 2–4 ทีม · ป.1–6");
  assert.equal(treasureChestBeforeReplay.category, "คณิตศาสตร์และภาษาอังกฤษ");
  assert.deepEqual(treasureChestBeforeReplay.grade_levels, ["p1", "p2", "p3", "p4", "p5", "p6"]);
  assert.equal(treasureChestBeforeReplay.delivery_mode, "web_app");
  assert.equal(treasureChestBeforeReplay.cta_url, "https://kru-treasure-chest-2026.onanongmini123.chatgpt.site");
  assert.equal(treasureChestBeforeReplay.cover_image_url, "https://kruaorry-web.vercel.app/images/resources/treasure-chest.jpg");
  assert.deepEqual(treasureChestBeforeReplay.tags, ["เกม", "คณิตศาสตร์", "ภาษาอังกฤษ", "ประถมศึกษา", "กิจกรรมกลุ่ม"]);
  assert.equal(treasureChestBeforeReplay.is_free, true);
  assert.equal(treasureChestBeforeReplay.status, "published");
  assert.equal(treasureChestBeforeReplay.access_mode, "public");
  assert.equal(treasureChestBeforeReplay.file_path, null);
  assert.equal(treasureChestBeforeReplay.file_name, null);
  assert.equal(treasureChestBeforeReplay.file_size, null);
  assert.equal(treasureChestBeforeReplay.file_mime_type, null);
  assert.equal(treasureChestBeforeReplay.created_by, null);
  assert.ok(treasureChestBeforeReplay.published_at);

  const treasureChestSql = readFileSync(
    new URL("../supabase/migrations/20260927195000_032_public_treasure_chest_resource.sql", import.meta.url),
    "utf8",
  );
  await db.exec(treasureChestSql);
  const treasureChestAfterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [RESOURCES.treasureChest],
  )).rows[0];
  assert.equal(treasureChestAfterReplay.count, 1);
  assert.equal(
    new Date(treasureChestAfterReplay.published_at).toISOString(),
    new Date(treasureChestBeforeReplay.published_at).toISOString(),
    "replaying the Treasure Chest seed must preserve first publication time",
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [RESOURCES.treasureChest],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [RESOURCES.treasureChest],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.treasureChest, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.treasureChest, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.treasureChest, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.treasureChest, false)).length, 1);

  const bingoFunBeforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [RESOURCES.bingoFun])).rows[0];
  assert.equal(bingoFunBeforeReplay.title, "บิงโกหรรษา");
  assert.equal(bingoFunBeforeReplay.meta, "เว็บเกมบิงโก · 3 ชุด · เดี่ยวและทั้งห้อง · กระดาน 3×3/4×4 · 1–40 ใบ · ป.1–3");
  assert.equal(bingoFunBeforeReplay.description, "เกมบิงโกงานวัดความรู้สำหรับเล่นเดี่ยวบนอุปกรณ์หรือเล่นทั้งห้องจากจอครูหนึ่งจอ เลือกชุดตัวเลข 1–30 คำศัพท์สัตว์อย่างน้อย 24 คำ หรือผลบวกอย่างน้อย 24 ค่า โหมดเดี่ยวใช้กระดาน 3×3 แตะคำตอบจากคำใบ้และขอเฉลยช่วยได้ ส่วนโหมดครูฉายจอสร้างกระดาน 3×3 หรือ 4×4 ได้ 1–40 ใบพร้อมรหัสและสั่งพิมพ์ ครูสุ่มรายการแบบไม่ซ้ำ ดูประวัติ และกรอกรหัสเพื่อตรวจรายการที่เรียกก่อนยืนยันผู้ชนะ ระบบไม่อ้างว่าอ่านรอยทำเครื่องหมายบนกระดาษได้");
  assert.equal(bingoFunBeforeReplay.category, "คณิตศาสตร์และภาษาอังกฤษ");
  assert.deepEqual(bingoFunBeforeReplay.grade_levels, ["p1", "p2", "p3"]);
  assert.equal(bingoFunBeforeReplay.delivery_mode, "web_app");
  assert.equal(bingoFunBeforeReplay.cta_url, "https://kru-bingo-fun-2026.onanongmini123.chatgpt.site");
  assert.equal(bingoFunBeforeReplay.cover_image_url, "https://kruaorry-web.vercel.app/images/resources/bingo-fun.jpg");
  assert.deepEqual(bingoFunBeforeReplay.tags, ["เกม", "บิงโก", "คณิตศาสตร์", "ภาษาอังกฤษ", "กิจกรรมทั้งห้อง"]);
  assert.equal(bingoFunBeforeReplay.is_free, true);
  assert.equal(bingoFunBeforeReplay.status, "published");
  assert.equal(bingoFunBeforeReplay.access_mode, "public");
  assert.equal(bingoFunBeforeReplay.file_path, null);
  assert.equal(bingoFunBeforeReplay.file_name, null);
  assert.equal(bingoFunBeforeReplay.file_size, null);
  assert.equal(bingoFunBeforeReplay.file_mime_type, null);
  assert.equal(bingoFunBeforeReplay.created_by, null);
  assert.ok(bingoFunBeforeReplay.published_at);

  const bingoFunSql = readFileSync(
    new URL("../supabase/migrations/20260927203000_033_public_bingo_fun_resource.sql", import.meta.url),
    "utf8",
  );
  await db.exec(bingoFunSql);
  const bingoFunAfterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [RESOURCES.bingoFun],
  )).rows[0];
  assert.equal(bingoFunAfterReplay.count, 1);
  assert.equal(
    new Date(bingoFunAfterReplay.published_at).toISOString(),
    new Date(bingoFunBeforeReplay.published_at).toISOString(),
    "replaying the Bingo Fun seed must preserve first publication time",
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [RESOURCES.bingoFun],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [RESOURCES.bingoFun],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.bingoFun, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.bingoFun, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.bingoFun, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.bingoFun, false)).length, 1);

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000033',
        'บิงโกหรรษา',
        'web_app',
        'https://duplicate-title.test/bingo',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(bingoFunSql),
      /Bingo Fun title or target already belongs to another resource/,
      "the Bingo Fun seed must reject a duplicate title owned by another resource",
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000034',
        'เกมบิงโกชื่ออื่น',
        'web_app',
        'https://kru-bingo-fun-2026.onanongmini123.chatgpt.site/',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(bingoFunSql),
      /Bingo Fun title or target already belongs to another resource/,
      "the Bingo Fun seed must reject a normalized duplicate target URL",
    );
  } finally {
    await db.exec("rollback");
  }

  const pictureWordMatchBeforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [RESOURCES.pictureWordMatch])).rows[0];
  assert.equal(pictureWordMatchBeforeReplay.title, "จับคู่ภาพกับคำ");
  assert.equal(pictureWordMatchBeforeReplay.meta, "เว็บเกมคำศัพท์ · 24 คู่ · 3 หมวด · เดี่ยว/2 คน · 4/6/8 คู่ · ป.1–3");
  assert.equal(pictureWordMatchBeforeReplay.description, "เกมจับคู่การ์ดภาพกับคำศัพท์อังกฤษบนอุปกรณ์เดียว เลือกสัตว์ ผลไม้ หรือสิ่งของในห้องเรียน และเล่นได้ทั้งคนเดียวหรือ 2 คนผลัดกัน ระบบเปิดการ์ดครั้งละ 2 ใบ ตรวจคู่ด้วยรหัสที่แน่นอน ล็อกการเปิดระหว่างปิดการ์ดที่ไม่ตรง และจัดคะแนนหรือเปลี่ยนตาอัตโนมัติ เลือกความยาก 4, 6 หรือ 8 คู่ ระดับง่ายมีคำแปล ส่วนระดับกลางและยากฝึกจำคำศัพท์ พร้อมสรุปจำนวนครั้งที่เปิด ความแม่นยำ เวลา และคำที่จับคู่ครบโดยไม่ใช้ข้อความตัดสินความฉลาด");
  assert.equal(pictureWordMatchBeforeReplay.category, "ภาษาอังกฤษ");
  assert.deepEqual(pictureWordMatchBeforeReplay.grade_levels, ["p1", "p2", "p3"]);
  assert.equal(pictureWordMatchBeforeReplay.delivery_mode, "web_app");
  assert.equal(pictureWordMatchBeforeReplay.cta_url, "https://kru-picture-word-match-2026.onanongmini123.chatgpt.site");
  assert.equal(pictureWordMatchBeforeReplay.cover_image_url, "https://kruaorry-web.vercel.app/images/resources/picture-word-match.jpg");
  assert.deepEqual(pictureWordMatchBeforeReplay.tags, ["เกม", "ภาษาอังกฤษ", "คำศัพท์", "จับคู่", "ประถมต้น"]);
  assert.equal(pictureWordMatchBeforeReplay.is_free, true);
  assert.equal(pictureWordMatchBeforeReplay.status, "published");
  assert.equal(pictureWordMatchBeforeReplay.access_mode, "public");
  assert.equal(pictureWordMatchBeforeReplay.file_path, null);
  assert.equal(pictureWordMatchBeforeReplay.file_name, null);
  assert.equal(pictureWordMatchBeforeReplay.file_size, null);
  assert.equal(pictureWordMatchBeforeReplay.file_mime_type, null);
  assert.equal(pictureWordMatchBeforeReplay.created_by, null);
  assert.ok(pictureWordMatchBeforeReplay.published_at);

  const pictureWordMatchSql = readFileSync(
    new URL("../supabase/migrations/20260927214500_034_public_picture_word_match_resource.sql", import.meta.url),
    "utf8",
  );
  await db.exec(pictureWordMatchSql);
  const pictureWordMatchAfterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [RESOURCES.pictureWordMatch],
  )).rows[0];
  assert.equal(pictureWordMatchAfterReplay.count, 1);
  assert.equal(
    new Date(pictureWordMatchAfterReplay.published_at).toISOString(),
    new Date(pictureWordMatchBeforeReplay.published_at).toISOString(),
    "replaying the Picture-to-Word Match seed must preserve first publication time",
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [RESOURCES.pictureWordMatch],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [RESOURCES.pictureWordMatch],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.pictureWordMatch, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.pictureWordMatch, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.pictureWordMatch, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.pictureWordMatch, false)).length, 1);

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000035',
        'จับคู่ภาพกับคำ',
        'web_app',
        'https://duplicate-title.test/picture-word-match',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(pictureWordMatchSql),
      /Picture-to-Word Match title or target already belongs to another resource/,
      "the Picture-to-Word Match seed must reject a duplicate title owned by another resource",
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000036',
        'เกมจับคู่ชื่ออื่น',
        'web_app',
        'https://kru-picture-word-match-2026.onanongmini123.chatgpt.site/',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(pictureWordMatchSql),
      /Picture-to-Word Match title or target already belongs to another resource/,
      "the Picture-to-Word Match seed must reject a normalized duplicate target URL",
    );
  } finally {
    await db.exec("rollback");
  }

  const missionWheelBeforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [RESOURCES.missionWheel])).rows[0];
  assert.equal(missionWheelBeforeReplay.title, "วงล้อพิชิตภารกิจ");
  assert.equal(missionWheelBeforeReplay.meta, "เว็บเกมทีม · 60 ข้อ · 4 หมวดวิชา · ง่าย/กลาง · 2–4 ทีม · ป.1–3");
  assert.equal(missionWheelBeforeReplay.description, "เกมตอบคำถามแบบทีมบนจอเดียวในธีมสวนสนุก สำหรับ 2–4 ทีมผลัดกันหมุนวงล้อเพื่อเลือกหมวดคณิตศาสตร์ ภาษาไทย ภาษาอังกฤษ หรือความรู้รอบตัวด้วยน้ำหนักเท่ากัน วงล้อมีหน้าที่เลือกหมวดเท่านั้น ตอบคำถาม 3 ตัวเลือกถูกได้ 1 ดาว ผิดได้ 0 ดาวพร้อมเฉลย มีคลังอย่างน้อย 60 ข้อ ระดับง่ายและกลางใช้คำถามต่างกัน ระบบจัดลำดับทีมและจำนวนตาให้เท่ากันก่อนตัดสินผู้ได้ดาวสูงสุด รองรับการชนะร่วมกัน และเลือกไม่จับเวลาหรือจับเวลา 30 วินาทีต่อข้อได้");
  assert.equal(missionWheelBeforeReplay.category, "บูรณาการหลายวิชา");
  assert.deepEqual(missionWheelBeforeReplay.grade_levels, ["p1", "p2", "p3"]);
  assert.equal(missionWheelBeforeReplay.delivery_mode, "web_app");
  assert.equal(missionWheelBeforeReplay.cta_url, "https://kru-mission-wheel-2026.onanongmini123.chatgpt.site");
  assert.equal(missionWheelBeforeReplay.cover_image_url, "https://kruaorry-web.vercel.app/images/resources/mission-wheel.jpg");
  assert.deepEqual(missionWheelBeforeReplay.tags, ["เกม", "คณิตศาสตร์", "ภาษาไทย", "ภาษาอังกฤษ", "ความรู้รอบตัว", "กิจกรรมกลุ่ม"]);
  assert.equal(missionWheelBeforeReplay.is_free, true);
  assert.equal(missionWheelBeforeReplay.status, "published");
  assert.equal(missionWheelBeforeReplay.access_mode, "public");
  assert.equal(missionWheelBeforeReplay.file_path, null);
  assert.equal(missionWheelBeforeReplay.file_name, null);
  assert.equal(missionWheelBeforeReplay.file_size, null);
  assert.equal(missionWheelBeforeReplay.file_mime_type, null);
  assert.equal(missionWheelBeforeReplay.created_by, null);
  assert.ok(missionWheelBeforeReplay.published_at);

  const missionWheelSql = readFileSync(
    new URL("../supabase/migrations/20260928001500_035_public_mission_wheel_resource.sql", import.meta.url),
    "utf8",
  );
  await db.exec(missionWheelSql);
  const missionWheelAfterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [RESOURCES.missionWheel],
  )).rows[0];
  assert.equal(missionWheelAfterReplay.count, 1);
  assert.equal(
    new Date(missionWheelAfterReplay.published_at).toISOString(),
    new Date(missionWheelBeforeReplay.published_at).toISOString(),
    "replaying the Mission Wheel seed must preserve first publication time",
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [RESOURCES.missionWheel],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [RESOURCES.missionWheel],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.missionWheel, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.missionWheel, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.missionWheel, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.missionWheel, false)).length, 1);

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000037',
        'วงล้อพิชิตภารกิจ',
        'web_app',
        'https://duplicate-title.test/mission-wheel',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(missionWheelSql),
      /Mission Wheel title or target already belongs to another resource/,
      "the Mission Wheel seed must reject a duplicate title owned by another resource",
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000038',
        'เกมวงล้อชื่ออื่น',
        'web_app',
        'https://kru-mission-wheel-2026.onanongmini123.chatgpt.site/',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(missionWheelSql),
      /Mission Wheel title or target already belongs to another resource/,
      "the Mission Wheel seed must reject a normalized duplicate target URL",
    );
  } finally {
    await db.exec("rollback");
  }

  const vocabFishingBeforeReplay = (await db.query(`
    select id::text, title, meta, description, category, grade_levels,
      delivery_mode, cta_url, cover_image_url, tags, is_free, status,
      published_at, access_mode, file_path, file_name, file_size,
      file_mime_type, created_by
    from public.resources where id = $1
  `, [RESOURCES.vocabFishing])).rows[0];
  assert.equal(vocabFishingBeforeReplay.title, "ตกปลาคำศัพท์");
  assert.equal(vocabFishingBeforeReplay.meta, "เว็บเกมคำศัพท์ · 40 คำ · 4 หมวด · เดี่ยว/2 คน · 60 วินาที/ฝึก · ป.1–3");
  assert.equal(vocabFishingBeforeReplay.description, "เกมฝึกคำศัพท์ภาษาอังกฤษในโลกใต้ทะเลสดใส เล่นได้ทั้งคนเดียวหรือ 2 คนผลัดกันบนอุปกรณ์เดียว เลือกสัตว์ อาหาร สี หรือของใช้ในห้องเรียนจากคลังอย่างน้อย 40 คำ แล้วแตะปลาคำศัพท์อังกฤษที่ตรงกับภาพหรือคำแปลไทยจากปลา 3 ตัว ตอบถูกได้ 10 คะแนน ตอบผิดได้ 0 คะแนนและดูเฉลยก่อนข้อถัดไป เลือกเล่น 60 วินาทีหรือฝึกแบบไม่จับเวลาได้ พร้อมตัวเลือกหยุดปลาเคลื่อนที่ ปุ่มฟังคำศัพท์เสริม และสรุปคำที่เรียนรู้กับคำที่ควรทบทวน");
  assert.equal(vocabFishingBeforeReplay.category, "ภาษาอังกฤษ");
  assert.deepEqual(vocabFishingBeforeReplay.grade_levels, ["p1", "p2", "p3"]);
  assert.equal(vocabFishingBeforeReplay.delivery_mode, "web_app");
  assert.equal(vocabFishingBeforeReplay.cta_url, "https://kru-vocab-fishing-2026.onanongmini123.chatgpt.site");
  assert.equal(vocabFishingBeforeReplay.cover_image_url, "https://kruaorry-web.vercel.app/images/resources/vocab-fishing.jpg");
  assert.deepEqual(vocabFishingBeforeReplay.tags, ["เกม", "ภาษาอังกฤษ", "คำศัพท์", "สัตว์", "อาหาร", "สี", "ห้องเรียน"]);
  assert.equal(vocabFishingBeforeReplay.is_free, true);
  assert.equal(vocabFishingBeforeReplay.status, "published");
  assert.equal(vocabFishingBeforeReplay.access_mode, "public");
  assert.equal(vocabFishingBeforeReplay.file_path, null);
  assert.equal(vocabFishingBeforeReplay.file_name, null);
  assert.equal(vocabFishingBeforeReplay.file_size, null);
  assert.equal(vocabFishingBeforeReplay.file_mime_type, null);
  assert.equal(vocabFishingBeforeReplay.created_by, null);
  assert.ok(vocabFishingBeforeReplay.published_at);

  const vocabFishingSql = readFileSync(
    new URL("../supabase/migrations/20260928093000_036_public_vocab_fishing_resource.sql", import.meta.url),
    "utf8",
  );
  await db.exec(vocabFishingSql);
  const vocabFishingAfterReplay = (await db.query(
    "select count(*)::integer as count, min(published_at) as published_at from public.resources where id = $1",
    [RESOURCES.vocabFishing],
  )).rows[0];
  assert.equal(vocabFishingAfterReplay.count, 1);
  assert.equal(
    new Date(vocabFishingAfterReplay.published_at).toISOString(),
    new Date(vocabFishingBeforeReplay.published_at).toISOString(),
    "replaying the Vocabulary Fishing seed must preserve first publication time",
  );
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_plan_access where resource_id = $1",
    [RESOURCES.vocabFishing],
  )).rows[0].count, 0);
  assert.equal((await db.query(
    "select count(*)::integer as count from public.resource_catalog where id = $1 and access_mode = 'public'",
    [RESOURCES.vocabFishing],
  )).rows[0].count, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.vocabFishing, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.vocabFishing, true)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.vocabFishing, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.vocabFishing, false)).length, 1);

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000039',
        'ตกปลาคำศัพท์',
        'web_app',
        'https://duplicate-title.test/vocab-fishing',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(vocabFishingSql),
      /Vocabulary Fishing title or target already belongs to another resource/,
      "the Vocabulary Fishing seed must reject a duplicate title owned by another resource",
    );
  } finally {
    await db.exec("rollback");
  }

  await db.exec("begin");
  try {
    await db.exec(`
      insert into public.resources (
        id, title, delivery_mode, cta_url, is_free, status, access_mode
      ) values (
        '90000000-0000-4000-8000-000000000040',
        'เกมตกปลาชื่ออื่น',
        'web_app',
        'https://kru-vocab-fishing-2026.onanongmini123.chatgpt.site/',
        true,
        'draft',
        'public'
      )
    `);
    await rejectsWith(
      () => db.exec(vocabFishingSql),
      /Vocabulary Fishing title or target already belongs to another resource/,
      "the Vocabulary Fishing seed must reject a normalized duplicate target URL",
    );
  } finally {
    await db.exec("rollback");
  }

  await assertPublicGameSeed({
    resourceId: RESOURCES.sentenceTrain,
    migration: "20260928100000_037_public_sentence_train_resource.sql",
    label: "Sentence Train",
    title: "รถไฟเรียงประโยค",
    meta: "เว็บเกมภาษาอังกฤษ · 150 ประโยค · 5 หัวข้อ · 3 ระดับ · เดี่ยว/คู่ · ป.1–3",
    description: "เกมฝึกเรียงคำภาษาอังกฤษในสถานีรถไฟแสนสนุกสำหรับนักเรียนประถมต้น มีคลัง 150 ประโยค ครบคำทักทาย แนะนำตัว สี สิ่งของ และสัตว์ พร้อมระดับง่าย 3–4 คำ ระดับกลาง 5–6 คำ และระดับยาก 7–8 คำ เล่นได้ทั้งคนเดียวหรือคู่ร่วมมือบนเครื่องเดียว เลือกเล่น 5 หรือ 10 ข้อ จัดตู้คำด้วยการลากหรือแตะบนมือถือ ตรวจลำดับจากรหัสคำที่แน่นอน แสดงตัวพิมพ์ใหญ่และเครื่องหมายวรรคตอนอัตโนมัติ พร้อมโหมดสาธิต คะแนนครั้งแรก 10 คะแนน ครั้งที่สอง 5 คะแนน และดูเฉลยได้ 0 คะแนน",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["p1", "p2", "p3"],
    ctaUrl: "https://kru-sentence-train-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/sentence-train.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "ประโยค", "ไวยากรณ์", "คำทักทาย", "สี", "สิ่งของ", "สัตว์"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000041",
    duplicateUrlId: "90000000-0000-4000-8000-000000000042",
    alternateTitle: "เกมรถไฟชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.iceCreamMath,
    migration: "20260928103000_038_public_ice_cream_math_resource.sql",
    label: "Ice Cream Math",
    title: "ไอศกรีมคิดเลข",
    meta: "เว็บเกมคณิตศาสตร์ · บวก–ลบ · 3 ระดับ · 10 ข้อ · เดี่ยว/คู่ · ป.1–3",
    description: "เกมฝึกบวก–ลบในคาเฟ่ไอศกรีมพาสเทลสำหรับนักเรียนประถมต้น เล่นได้ทั้งคนเดียวหรือคู่ผลัดกันตอบบนเครื่องเดียว เกมละ 10 ข้อ โดยระบบสร้างโจทย์และคำนวณคำตอบจริง เลือกระดับง่ายช่วง 0–20 ระดับกลาง 0–100 หรือระดับยาก 0–1,000 พร้อมเลือกบวก ลบ หรือแบบผสม โดยไม่สร้างผลลบติดลบ มีคำตอบ 3 ตัวเลือกที่ไม่ซ้ำกัน ลากหรือแตะลูกไอศกรีมลงโคน ตอบถูกครั้งแรกได้ 10 คะแนน หากผิดดูภาพวิธีคิดและลองใหม่ได้ 5 คะแนน พร้อมโหมดฝึกไม่คิดคะแนน ทุก 3 ชั้นเสิร์ฟหนึ่งถ้วย และหน้าผลลัพธ์แยกคะแนน จำนวนถ้วย และข้อที่ควรฝึกเพิ่มอย่างชัดเจน",
    category: "คณิตศาสตร์",
    gradeLevels: ["p1", "p2", "p3"],
    ctaUrl: "https://kru-ice-cream-math-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/ice-cream-math.jpg",
    tags: ["เกม", "คณิตศาสตร์", "บวก", "ลบ", "คิดเลข", "ประถมต้น", "ไอศกรีม"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000043",
    duplicateUrlId: "90000000-0000-4000-8000-000000000044",
    alternateTitle: "เกมไอศกรีมชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.wordSquad,
    migration: "20260928113000_039_public_word_squad_resource.sql",
    label: "Word Squad",
    title: "Word Squad — รวมแก๊งคำศัพท์",
    meta: "เว็บเกมภาษาอังกฤษ · 16 คำ/กระดาน · 4 กลุ่ม · เดี่ยว/ทีม/ทั้งห้อง · ป.2–ม.6",
    description: "เกมจัดกลุ่มคำศัพท์ธีมทีมสายลับสำหรับนักเรียน ป.2–ม.6 ในแต่ละกระดานมีคำ 16 คำให้ค้นหาความสัมพันธ์และจัดเป็น 4 กลุ่ม กลุ่มละ 4 คำ เลือกคำ 4 คำแล้วกดตรวจ เมื่อถูกระบบล็อกกลุ่มและเปิดชื่อหมวด เล่นได้ทั้งคนเดียว 2 คน 2–4 ทีม หรือทั้งห้อง มีชุดเนื้อหาที่ตรวจสอบแล้ว ครอบคลุม Animals, Food, School, Verbs, Adjectives, Synonyms, Antonyms, Collocations และ Idioms โดยไม่สร้างคำแบบอิสระ ครูเลือกระดับชั้น หมวด จำนวนกระดาน เวลา หัวใจ และคำใบ้ได้ จัดกลุ่มถูกได้ 100 คะแนน โบนัสเวลาสูงสุด 50 คะแนน ใช้คำใบ้หัก 25 คะแนน ส่วนคำตอบผิดเสียหัวใจโดยชุดเดิมไม่เสียซ้ำ พร้อมสรุปคะแนน เวลา ความแม่นยำ หมวดที่พลาด และคำศัพท์ที่ควรทบทวน",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["p2", "p3", "p4", "p5", "p6", "m1", "m2", "m3", "m4", "m5", "m6"],
    ctaUrl: "https://word-squad-vocabulary-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/word-squad.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "คำศัพท์", "จัดหมวดหมู่", "คิดวิเคราะห์", "Synonyms", "Antonyms", "Collocations", "Idioms"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000045",
    duplicateUrlId: "90000000-0000-4000-8000-000000000046",
    alternateTitle: "เกมรวมแก๊งชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.dailyWordDetective,
    migration: "20260928125500_040_public_daily_word_detective_resource.sql",
    label: "Daily Word Detective",
    title: "Daily Word Detective",
    meta: "เว็บเกมภาษาอังกฤษ · 180 คำ · 3–8 ตัวอักษร · เดี่ยว/เพื่อน/ทั้งห้อง · ป.3–ม.6",
    description: "เกมสืบสวนคำศัพท์ประจำวันสำหรับนักเรียน ป.3–ม.6 ฝึกการสะกดคำ คำศัพท์ การวิเคราะห์ตำแหน่งตัวอักษร และการใช้เหตุผล ผู้เล่นเดาคำลับยาว 3–8 ตัวอักษร โดยระบบใช้สี สัญลักษณ์ และข้อความกำกับเพื่อบอกว่าตัวอักษรถูกตำแหน่ง อยู่ผิดตำแหน่ง หรือไม่มีในคำ มีคลังคำเป้าหมายที่ตรวจแล้ว 180 คำและพจนานุกรมคำที่อนุญาต 598 คำ รองรับเล่นคนเดียว เทียบผลกับเพื่อน หรือให้ทั้งห้องเล่นพร้อมกัน ครูตั้งระดับ หมวด ความยาว จำนวนครั้ง เวลา และคำใบ้ได้ เริ่ม 600 คะแนน เดาผิดหัก 75 คะแนน ใช้คำใบ้หัก 100 คะแนน และถูกครั้งแรกโบนัส 200 คะแนน หลังจบแสดงความหมาย คำอ่าน ประโยคตัวอย่าง และ streak โดยเก็บสถิติเฉพาะในอุปกรณ์และไม่เก็บชื่อเด็ก",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["p3", "p4", "p5", "p6", "m1", "m2", "m3", "m4", "m5", "m6"],
    ctaUrl: "https://daily-word-detective-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/daily-word-detective.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "คำศัพท์", "สะกดคำ", "คิดวิเคราะห์", "Word Detective", "คำศัพท์ประจำวัน"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000047",
    duplicateUrlId: "90000000-0000-4000-8000-000000000048",
    alternateTitle: "เกมนักสืบคำศัพท์ชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.listeningDetective,
    migration: "20260928140000_041_public_listening_detective_resource.sql",
    label: "Listening Detective",
    title: "Listening Detective",
    meta: "เว็บเกมภาษาอังกฤษ · 600 เบาะแส · 6 ประเภทเสียง · เดี่ยว/2–12 คน/2–4 ทีม · อนุบาล–ม.6",
    description: "เกมฝึกฟังภาษาอังกฤษธีมสำนักงานนักสืบสำหรับผู้เรียนอนุบาล–ม.6 มีคลังเบาะแสที่ตรวจแล้ว 600 ข้อ ครบคำศัพท์ ประโยคสั้น คำสั่ง บทสนทนา เรื่องเล่า รายละเอียด และการระบุบุคคล พร้อม 5 ระดับความยาก เล่นได้ทั้งคนเดียว ผลัดกัน 2–12 คน หรือ 2–4 ทีมบนจอเดียว ระบบจัดจำนวนตาให้ทุกฝ่ายเท่ากัน เลือก 10–20 ข้อ ตัวเลือก 3–4 ข้อ สำเนียง American/British และไม่จับเวลาหรือจับเวลา 15–30 วินาที ฟังครั้งแรกได้ 100 คะแนน ครั้งที่สอง 75 คะแนน ครั้งที่สาม 50 คะแนน หากตอบผิดให้ลองใหม่หนึ่งครั้งและได้ไม่เกิน 25 คะแนน ใช้ไฟล์เสียงที่ตรวจแล้วร่วมกับเสียงสังเคราะห์ มีข้อความสำรองเมื่ออุปกรณ์ไม่มีเสียงโดยไม่นับคะแนน พร้อมสรุปความแม่นยำ คำที่ควรทบทวน และประเภทเสียงที่ควรฝึกเพิ่ม โดยเลือกไม่เก็บข้อมูลหรือเก็บเฉพาะผลล่าสุดในอุปกรณ์ได้",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["kindergarten", "p1", "p2", "p3", "p4", "p5", "p6", "m1", "m2", "m3", "m4", "m5", "m6"],
    ctaUrl: "https://listening-detective-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/listening-detective.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "การฟัง", "จับใจความ", "คำศัพท์", "Listening Detective", "กิจกรรมทีม"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000049",
    duplicateUrlId: "90000000-0000-4000-8000-000000000050",
    alternateTitle: "เกมนักสืบการฟังชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.sentenceTrainGrammar,
    migration: "20260929090000_042_public_sentence_train_grammar_resource.sql",
    label: "Sentence Train Grammar",
    title: "Sentence Train",
    meta: "เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง · เดี่ยว/2 คน/2–4 ทีม · ป.2–ม.3",
    description: "เกมฝึกโครงสร้างและลำดับคำภาษาอังกฤษธีมต่อขบวนรถไฟสำหรับนักเรียน ป.2–ม.3 เล่นได้ทั้งคนเดียว 2 คน หรือ 2–4 ทีมบนจอเดียว มีคลังประโยคที่ตรวจสอบแล้ว 810 ข้อ ครบ Present Simple, Past Simple, Future, Questions, Negatives และประโยคซับซ้อน พร้อมคำตอบทางเลือกที่ถูกหลักซึ่งระบบยอมรับตามรายการ ผู้เล่นลากหรือแตะตู้คำลงรางแล้วกดตรวจ ระบบบอกจำนวนตำแหน่งที่ถูกโดยยังไม่เฉลยทันที ครูเลือกระดับ โครงสร้าง ช่วงจำนวนคำ จำนวนข้อ 8–15 ข้อ เวลา 30–60 วินาทีหรือไม่จับเวลา และจำนวนครั้งที่ลองได้ ตอบถูกครั้งแรก 100 คะแนน ครั้งที่สอง 70 คะแนน ครั้งที่สาม 40 คะแนน และคำใบ้ลดคะแนนข้อนั้น 20 คะแนน ระบบซ่อนโจทย์จนผู้เล่นกดพร้อม จัดตาให้ทุกฝ่ายเท่ากัน และสรุปคะแนน โครงสร้างที่พลาด ประโยคที่ตอบผิด และคำอธิบายไวยากรณ์ โดยเลือกเก็บผลล่าสุดเฉพาะในอุปกรณ์ได้",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["p2", "p3", "p4", "p5", "p6", "m1", "m2", "m3"],
    ctaUrl: "https://sentence-train-grammar-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/sentence-train-grammar.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "ประโยค", "ไวยากรณ์", "เรียงคำ", "Sentence Train", "Tenses", "Questions", "กิจกรรมทีม"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000051",
    duplicateUrlId: "90000000-0000-4000-8000-000000000052",
    alternateTitle: "เกมรถไฟไวยากรณ์ชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.grammarBossBattle,
    migration: "20260929100000_043_public_grammar_boss_battle_resource.sql",
    label: "Grammar Boss Battle",
    title: "Grammar Boss Battle — ศึกบอสไวยากรณ์",
    meta: "เว็บเกมภาษาอังกฤษ · 576 ข้อ · 6 หัวข้อไวยากรณ์ · เดี่ยว/2–4 ทีม/ทั้งห้อง · ป.3–ม.6",
    description: "เกมฝึกไวยากรณ์ภาษาอังกฤษธีมฮีโร่ร่วมมือปราบบอสคำผิดสำหรับนักเรียน ป.3–ม.6 เล่นได้ทั้งคนเดียว 2–4 ทีม หรือทั้งห้องร่วมมือบนจอเดียว มีคลังคำถามที่ตรวจสอบแล้ว 576 ข้อ ครบ Parts of Speech, Articles, Pronouns, Subject–Verb Agreement, Tenses และ Error Correction พร้อม 4 ช่วงระดับ ครูเลือกหัวข้อ จำนวนตา เวลา 20/30 วินาทีหรือไม่จับเวลา และความแข็งแรงของบอสได้ ตอบถูกได้ 100 คะแนน ความเสียหายพื้นฐาน 10 หน่วย และโบนัสคอมโบ จากนั้นเลือกพลังโจมตี ป้องกัน หรือเพิ่มคะแนนให้เพื่อนด้วยผลคงที่ไม่สุ่ม ตอบผิดไม่หักคะแนนและบอสไม่เสียพลัง พร้อมคำอธิบายทุกข้อ ระบบซ่อนโจทย์จนกดพร้อม จัดตาให้ทุกทีมเท่ากันก่อนตัดสิน ชนะร่วมกันเมื่อพลังบอสหมด ส่วนโหมดแข่งขันตัดสินจากความเสียหายรวมและรองรับผู้ชนะร่วมเมื่อเสมอ พร้อมสรุปคะแนน ความแม่นยำรายหัวข้อ คอมโบ และหัวข้อที่ควรสอนซ้ำ โดยไม่เก็บชื่อเด็กและเลือกเก็บเฉพาะผลล่าสุดในอุปกรณ์ได้",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["p3", "p4", "p5", "p6", "m1", "m2", "m3", "m4", "m5", "m6"],
    ctaUrl: "https://grammar-boss-battle-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/grammar-boss-battle.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "ไวยากรณ์", "Grammar Boss Battle", "Parts of Speech", "Tenses", "Error Correction", "กิจกรรมทีม"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000053",
    duplicateUrlId: "90000000-0000-4000-8000-000000000054",
    alternateTitle: "เกมบอสไวยากรณ์ชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.kaokham,
    migration: "20260929110000_044_public_kaokham_resource.sql",
    label: "KaoKham",
    title: "ก้าวคำ — ฟัง อ่าน สะกด เขียน",
    meta: "เว็บเรียนรู้ภาษาไทย · 6 ขั้น · ฟัง–อ่าน–สะกด–เขียน · ผู้มาเยือน/รหัสกิจกรรม · ป.1–ป.6",
    description: "เว็บฝึกอ่านและสะกดคำไทยด้วยตนเอง 6 ขั้นสำหรับ ป.1–ป.6 ตั้งแต่ฟัง เลือกคำ ประกอบคำ อ่าน สะกดหรือเขียน และใช้คำในประโยค มีคำใบ้ทีละขั้น ไม่หักคะแนน และแยกผลการทำได้เองจากการทำหลังลองใหม่หรือใช้คำใบ้ ผู้มาเยือนเก็บผลเฉพาะในเครื่อง ส่วนนักเรียนเข้าร่วมด้วยรหัสกิจกรรมของครูได้โดยไม่ต้องมีบัญชี ไม่มีการจัดอันดับ และเปรียบเทียบเฉพาะพัฒนาการของตนเอง",
    category: "ภาษาไทย",
    gradeLevels: ["p1", "p2", "p3", "p4", "p5", "p6"],
    ctaUrl: "https://kaokham-learning-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/kaokham.jpg",
    tags: ["ภาษาไทย", "การอ่าน", "สะกดคำ", "เขียนคำ", "เรียนรู้ด้วยตนเอง", "ก้าวคำ", "รหัสกิจกรรม", "ประถมศึกษา"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000055",
    duplicateUrlId: "90000000-0000-4000-8000-000000000056",
    alternateTitle: "แบบฝึกภาษาไทยชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.arPhonicsQuest,
    migration: "20261001150000_045_public_ar_phonics_quest_resource.sql",
    label: "AR Phonics Quest",
    title: "AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร",
    meta: "เว็บเกมภาษาอังกฤษ · 78 คำ A–Z · สแกนบัตร/ไม่ใช้กล้อง · เดี่ยว/2–12 คน/2–4 ทีม/ทั้งห้อง · อนุบาล–ป.3",
    description: "เกมฝึกโฟนิกส์ธีมนักสำรวจสำหรับอนุบาล–ป.3 เชื่อมเสียงต้นคำกับตัวอักษรพิมพ์ใหญ่–เล็ก มีคำศัพท์ที่ตรวจแล้ว 78 คำครบ A–Z พร้อมไฟล์เสียงในเว็บ เล่นได้ทั้งคนเดียว ผลัดกัน 2–12 คน 2–4 ทีม หรือทั้งห้อง ระบบจัดตาให้เท่ากันและไม่จบกลางรอบ ครูเลือกตัวอักษร จำนวนภารกิจ และเวลา 20/30/40 วินาทีได้ เด็กฟังคำแล้วสแกนบัตร QR A–Z ที่พิมพ์จากเว็บ หรือใช้โหมดแตะ 3 ตัวเลือกโดยไม่ใช้กล้อง ตอบถูกครั้งแรกได้ 100 คะแนน ครั้งที่สอง 50 คะแนน ผิดหรือหมดเวลาได้ 0 คะแนน พร้อมคำใบ้ คำถามเสริม และสรุปเสียงที่ควรฝึก กล้องขอสิทธิ์เมื่อกดเปิด ไม่บันทึกหรืออัปโหลดภาพ ปิดเมื่อออกหรือซ่อนหน้าเว็บ และเก็บผลเฉพาะในอุปกรณ์",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["kindergarten", "p1", "p2", "p3"],
    ctaUrl: "https://ar-phonics-quest-2026.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.vercel.app/images/resources/ar-phonics-quest.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "โฟนิกส์", "Phonics", "A–Z", "ตัวอักษร", "คำศัพท์", "สแกน QR", "กิจกรรมทีม"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000057",
    duplicateUrlId: "90000000-0000-4000-8000-000000000058",
    alternateTitle: "เกมโฟนิกส์ชื่ออื่น",
  });

  await assertPublicGameSeed({
    resourceId: RESOURCES.numberListeningLine,
    migration: "20261001160000_046_public_number_listening_line_resource.sql",
    label: "Number Listening Line",
    title: "Listening Line Challenge — ฟังเสียงแล้วเลือกคำตอบ",
    meta: "เว็บเกมภาษาอังกฤษ · ฟังตัวเลข 5 ระดับ + คำศัพท์ 45 คำ · 2–12 คน · อนุบาล–ม.6",
    description: "เกมฝึกฟังภาษาอังกฤษแบบผลัดกันตอบสำหรับผู้เรียนอนุบาล–ม.6 บนอุปกรณ์เดียว เลือกได้ 2 โหมด ได้แก่ ฟังตัวเลขและโจทย์คณิตศาสตร์ หรือฟังคำศัพท์พื้นฐาน 45 คำแล้วเลือกคำตอบ a/b/c โหมดตัวเลขปรับตาม 5 ระดับ ตั้งแต่ 0–20 ไปจนถึงจำนวนหลักล้าน จำนวนลบ ทศนิยม เศษส่วน ร้อยละ และบวก–ลบ–คูณ–หาร พร้อมจัดจำนวนรอบให้ผู้เล่นเท่ากัน ระบบปรับจำนวนตัวเลือก เวลา และความเร็วเสียงตามระดับ เล่นได้ 2–12 คน มีนับถอยหลังก่อนแต่ละตา ส่งตาต่ออัตโนมัติ คะแนนรายคน ความแม่นยำรวม และคำแนะนำระดับถัดไป ใช้เสียงสังเคราะห์ภาษาอังกฤษแบบ US จากอุปกรณ์และไม่ต้องใช้บัญชีผู้เรียน",
    category: "ภาษาอังกฤษ",
    gradeLevels: ["kindergarten", "p1", "p2", "p3", "p4", "p5", "p6", "m1", "m2", "m3", "m4", "m5", "m6"],
    ctaUrl: "https://kruaorry-web.onanongmini123.chatgpt.site",
    coverImageUrl: "https://kruaorry-web.onanongmini123.chatgpt.site/images/resources/number-listening-line.jpg",
    tags: ["เกม", "ภาษาอังกฤษ", "การฟัง", "ตัวเลข", "คณิตศาสตร์", "คำศัพท์", "Listening Line", "กิจกรรมกลุ่ม"],
    duplicateTitleId: "90000000-0000-4000-8000-000000000059",
    duplicateUrlId: "90000000-0000-4000-8000-000000000060",
    alternateTitle: "เกมฟังตัวเลขชื่ออื่น",
  });

  // Existing semantics are preserved by the backfill.
  const backfill = await db.query(`
    select id::text, access_mode from public.resources
    where id in ($1, $2) order by id
  `, [RESOURCES.authenticated, RESOURCES.legacyPremium]);
  assert.deepEqual(backfill.rows, [
    { id: RESOURCES.authenticated, access_mode: "authenticated" },
    { id: RESOURCES.legacyPremium, access_mode: "plans" },
  ]);
  const legacyPlans = await db.query(`
    select plan_id from public.resource_plan_access
    where resource_id = $1 order by plan_id
  `, [RESOURCES.legacyPremium]);
  assert.deepEqual(legacyPlans.rows.map((row) => row.plan_id), ["founder", "lifetime", "teacher"]);

  // Create all four access modes through the same admin RPC used by the UI.
  await asRole("authenticated", USERS.admin, async () => {
    await db.query(`
      insert into public.resources(
        id, title, delivery_mode, cover_image_url, status, published_at,
        is_free, file_path, file_name
      ) values
        ($1, 'Public file', 'file_download', 'https://cdn.test/public.webp', 'published', now(), true, $2, 'public.pdf'),
        ($3, 'Plan file', 'file_download', 'https://cdn.test/plan.webp', 'published', now(), false, $4, 'plan.pdf'),
        ($5, 'Locked file', 'file_download', 'https://cdn.test/locked.webp', 'published', now(), false, $6, 'locked.pdf'),
        ($7, 'Another public', 'web_app', 'https://cdn.test/other.webp', 'published', now(), true, null, null)
    `, [
      RESOURCES.publicFile, `${RESOURCES.publicFile}/public.pdf`,
      RESOURCES.planFile, `${RESOURCES.planFile}/plan.pdf`,
      RESOURCES.lockedFile, `${RESOURCES.lockedFile}/locked.pdf`,
      RESOURCES.anotherPublic,
    ]);
    await db.query("select public.set_resource_access($1, 'public', '{}'::text[])", [RESOURCES.publicFile]);
    await db.query("select public.set_resource_access($1, 'plans', array['teacher'])", [RESOURCES.planFile]);
    await db.query("select public.set_resource_access($1, 'locked', '{}'::text[])", [RESOURCES.lockedFile]);
    await db.query("select public.set_resource_access($1, 'public', '{}'::text[])", [RESOURCES.anotherPublic]);
  });

  // The admin save RPC commits content and access together. Hidden/retired
  // historical plans remain selectable so existing paid members can be
  // granted new premium resources without changing their plan identity.
  await asRole("authenticated", USERS.admin, () => db.query(`
    select public.admin_save_resource(
      p_resource_id => $1,
      p_create => true,
      p_title => 'New legacy-compatible premium',
      p_meta => null,
      p_description => 'new premium',
      p_category => 'premium',
      p_grade_levels => '{}'::text[],
      p_delivery_mode => 'web_app',
      p_cta_url => '/new-premium',
      p_cover_image_url => 'https://cdn.test/new-premium.webp',
      p_file_path => null,
      p_file_name => null,
      p_file_size => null,
      p_file_mime_type => null,
      p_access_mode => 'plans',
      p_plan_ids => array['teacher', 'lifetime']
    )
  `, [RESOURCES.newLegacyPremium]));
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.resources set status = 'published', published_at = now() where id = $1",
    [RESOURCES.newLegacyPremium],
  ));
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.profiles set plan = 'lifetime' where id = $1", [USERS.other],
  ));
  assert.equal((await resolveAs("authenticated", USERS.other, RESOURCES.newLegacyPremium, false)).length, 1);
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.profiles set plan = 'free' where id = $1", [USERS.other],
  ));

  const publicTitleBefore = (await db.query(
    "select title from public.resources where id = $1", [RESOURCES.publicFile],
  )).rows[0].title;
  await rejectsWith(
    () => asRole("authenticated", USERS.admin, () => db.query(`
      select public.admin_save_resource(
        p_resource_id => $1, p_create => false, p_title => 'Must roll back',
        p_meta => null, p_description => null, p_category => null,
        p_grade_levels => '{}'::text[], p_delivery_mode => 'file_download',
        p_cta_url => null, p_cover_image_url => 'https://cdn.test/public.webp',
        p_file_path => $2, p_file_name => 'public.pdf', p_file_size => null,
        p_file_mime_type => 'application/pdf', p_access_mode => 'plans',
        p_plan_ids => array['missing-plan']
      )
    `, [RESOURCES.publicFile, `${RESOURCES.publicFile}/public.pdf`])),
    /Unknown plan/,
  );
  assert.equal((await db.query(
    "select title from public.resources where id = $1", [RESOURCES.publicFile],
  )).rows[0].title, publicTitleBefore, "content must roll back when access validation fails");
  assert.equal((await db.query(
    "select access_mode from public.resources where id = $1", [RESOURCES.publicFile],
  )).rows[0].access_mode, "public");

  // Storage API/service-role writes bypass member RLS in production. Seed the
  // object metadata as the table owner, then re-enable RLS before assertions.
  await db.exec("alter table storage.objects disable row level security");
  await db.query(`
    insert into storage.objects(bucket_id, name) values
      ('resource-files', $1), ('resource-files', $2), ('resource-files', $3)
  `, [
    `${RESOURCES.publicFile}/public.pdf`,
    `${RESOURCES.planFile}/plan.pdf`,
    `${RESOURCES.lockedFile}/locked.pdf`,
  ]);
  await db.exec("alter table storage.objects enable row level security");

  assert.equal((await resolveAs("anon", null, RESOURCES.publicFile, true)).length, 1);
  assert.equal((await resolveAs("anon", null, RESOURCES.authenticated, true)).length, 0);
  assert.equal((await resolveAs("anon", null, RESOURCES.planFile, true)).length, 0);
  assert.equal((await resolveAs("anon", null, RESOURCES.lockedFile, true)).length, 0);

  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.authenticated, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.free, RESOURCES.planFile, false)).length, 0);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.planFile, false)).length, 1);
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.lockedFile, false)).length, 0);
  assert.equal((await resolveAs("authenticated", USERS.admin, RESOURCES.lockedFile, false)).length, 1);

  const anonFiles = await asRole("anon", null, async () => (
    await db.query("select name from storage.objects order by name")
  ).rows, true);
  assert.deepEqual(anonFiles.map((row) => row.name), [`${RESOURCES.publicFile}/public.pdf`]);
  const teacherFiles = await asRole("authenticated", USERS.teacher, async () => (
    await db.query("select name from storage.objects order by name")
  ).rows);
  assert.deepEqual(teacherFiles.map((row) => row.name), [
    `${RESOURCES.publicFile}/public.pdf`, `${RESOURCES.planFile}/plan.pdf`,
  ]);

  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.profiles set plan = 'free' where id = $1",
    [USERS.teacher],
  ));
  assert.equal((await resolveAs("authenticated", USERS.teacher, RESOURCES.planFile, false)).length, 0, "access must follow current database membership immediately");
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.profiles set plan = 'teacher' where id = $1",
    [USERS.teacher],
  ));

  // Featured order is atomic, bounded, and duplicate-free.
  await asRole("authenticated", USERS.admin, async () => {
    await db.query("select public.set_featured_resources(array[$1::uuid,$2::uuid])", [RESOURCES.planFile, RESOURCES.publicFile]);
  });
  const featured = await db.query("select resource_id::text, position from public.featured_resources order by position");
  assert.deepEqual(featured.rows, [
    { resource_id: RESOURCES.planFile, position: 1 },
    { resource_id: RESOURCES.publicFile, position: 2 },
  ]);
  await rejectsWith(
    () => asRole("authenticated", USERS.admin, () => db.query(
      "select public.set_featured_resources(array[$1::uuid,$1::uuid])", [RESOURCES.publicFile],
    )),
    /cannot contain duplicates/,
  );
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.resources set status = 'draft' where id = $1", [RESOURCES.anotherPublic],
  ));
  await rejectsWith(
    () => asRole("authenticated", USERS.admin, () => db.query(
      "select public.set_featured_resources(array[$1::uuid])", [RESOURCES.anotherPublic],
    )),
    /must exist and be published/,
  );
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.resources set status = 'published' where id = $1", [RESOURCES.anotherPublic],
  ));

  // Benefit rows can only come from enabled capabilities; copy updates do not
  // grant a capability or make a disabled row visible.
  const benefitBefore = await db.query("select feature_id from public.plan_benefit_catalog where plan_id = 'teacher' order by feature_id");
  assert.deepEqual(benefitBefore.rows.map((row) => row.feature_id), ["download.premium"]);
  await asRole("authenticated", USERS.admin, () => db.query(
    "select public.admin_update_feature_copy('download.premium', 'ดาวน์โหลดสื่อพรีเมียม', 'ไฟล์ที่แพ็กนี้มีสิทธิ์จริง')",
  ));
  const benefitAfter = await db.query("select feature_name from public.plan_benefit_catalog where plan_id = 'teacher'");
  assert.equal(benefitAfter.rows[0].feature_name, "ดาวน์โหลดสื่อพรีเมียม");
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "select public.admin_update_feature_copy('download.premium', 'ปลอม', 'ปลอม')",
    )),
    /Admin access required/,
  );

  // Requests: caller identity/defaults are server-controlled and reads are
  // isolated to own rows plus admins.
  const ownRequest = await asRole("authenticated", USERS.free, async () => (
    await db.query("select public.submit_my_request('ขอสื่อวิทยาศาสตร์') as id")
  ).rows[0].id);
  const ownRows = await asRole("authenticated", USERS.free, async () => (
    await db.query("select id::text, requested_by::text, votes, status from public.requests")
  ).rows);
  assert.deepEqual(ownRows, [{ id: ownRequest, requested_by: USERS.free, votes: 0, status: "pending" }]);
  const otherRows = await asRole("authenticated", USERS.other, async () => (
    await db.query("select id from public.requests")
  ).rows);
  assert.equal(otherRows.length, 0);
  const adminRequestRows = await asRole("authenticated", USERS.admin, async () => (
    await db.query("select id from public.requests")
  ).rows);
  assert.equal(adminRequestRows.length, 1);
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "insert into public.requests(title, requested_by, votes, status) values ('spoof', $1, 999, 'done')",
      [USERS.free],
    )),
    /permission denied/,
  );

  // One review per member/resource; every new/edit submission returns to the
  // moderation queue. Members read only their own safe fields via RPC, while
  // the public feed is anonymous and includes only approved reviews.
  const firstReview = await asRole("authenticated", USERS.free, async () => (
    await db.query("select public.upsert_my_resource_review($1, 4, 'ใช้งานง่าย') as id", [RESOURCES.authenticated])
  ).rows[0].id);
  assert.equal((await db.query("select count(*)::integer as count from public.resource_reviews")).rows[0].count, 1);
  const ownReview = await asRole("authenticated", USERS.free, async () => (
    await db.query("select * from public.get_my_resource_review($1)", [RESOURCES.authenticated])
  ).rows);
  assert.deepEqual(ownReview, [{ rating: 4, body: "ใช้งานง่าย", moderation_status: "pending" }]);
  assert.deepEqual(await asRole("authenticated", USERS.free, async () => (
    await db.query("select * from public.resource_reviews")
  ).rows), [], "the base review table and moderator metadata must be admin-only");
  const otherReviewRows = await asRole("authenticated", USERS.other, async () => (
    await db.query("select * from public.get_my_resource_review($1)", [RESOURCES.authenticated])
  ).rows);
  assert.equal(otherReviewRows.length, 0);
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "select public.upsert_my_resource_review($1, 5, 'ไม่มีสิทธิ์')", [RESOURCES.planFile],
    )),
    /Published entitled resource required/,
  );
  const publicFeed = await asRole("anon", null, async () => (
    await db.query("select id::text, rating, body, reviewer_name, reviewer_avatar_path from public.resource_review_feed")
  ).rows, true);
  assert.deepEqual(publicFeed, [], "pending reviews must not be public");
  assert.equal((await db.query("select review_count from public.resource_catalog where id = $1", [RESOURCES.authenticated])).rows[0].review_count, 0);

  await asRole("authenticated", USERS.admin, () => db.query(
    "select public.admin_set_review_visibility($1, true)", [firstReview],
  ));
  const approvedFeed = await asRole("anon", null, async () => (
    await db.query("select id::text, rating, body, reviewer_name, reviewer_avatar_path from public.resource_review_feed")
  ).rows, true);
  assert.deepEqual(approvedFeed, [{
    id: firstReview,
    rating: 4,
    body: "ใช้งานง่าย",
    reviewer_name: "สมาชิก KruAorry",
    reviewer_avatar_path: null,
  }]);
  const catalogRating = await db.query("select review_average::text, review_count from public.resource_catalog where id = $1", [RESOURCES.authenticated]);
  assert.deepEqual(catalogRating.rows[0], { review_average: "4.0", review_count: 1 });

  const editedReview = await asRole("authenticated", USERS.free, async () => (
    await db.query("select public.upsert_my_resource_review($1, 5, 'ดีมาก ใช้ได้จริง') as id", [RESOURCES.authenticated])
  ).rows[0].id);
  assert.equal(editedReview, firstReview);
  assert.equal((await db.query("select count(*)::integer as count from public.resource_review_feed")).rows[0].count, 0, "an edited review must be moderated again");
  assert.deepEqual(await asRole("authenticated", USERS.free, async () => (
    await db.query("select * from public.get_my_resource_review($1)", [RESOURCES.authenticated])
  ).rows), [{ rating: 5, body: "ดีมาก ใช้ได้จริง", moderation_status: "pending" }]);

  await asRole("authenticated", USERS.admin, () => db.query(
    "select public.admin_set_review_visibility($1, true)", [firstReview],
  ));
  await asRole("authenticated", USERS.admin, () => db.query(
    "select public.admin_set_review_visibility($1, false)", [firstReview],
  ));
  assert.equal((await db.query("select count(*)::integer as count from public.resource_review_feed")).rows[0].count, 0);
  assert.equal((await db.query("select review_count from public.resource_catalog where id = $1", [RESOURCES.authenticated])).rows[0].review_count, 0);
  await asRole("authenticated", USERS.admin, () => db.query(
    "select public.admin_set_review_visibility($1, true)", [firstReview],
  ));
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.resources set status = 'draft' where id = $1", [RESOURCES.authenticated],
  ));
  assert.equal((await db.query("select count(*)::integer as count from public.resource_review_feed")).rows[0].count, 0);
  assert.equal((await db.query("select count(*)::integer as count from public.resource_reviews")).rows[0].count, 1);
  await asRole("authenticated", USERS.admin, () => db.query(
    "update public.resources set status = 'published' where id = $1", [RESOURCES.authenticated],
  ));
  assert.equal((await db.query("select count(*)::integer as count from public.resource_review_feed")).rows[0].count, 1);

  // Reports are write-only for members, admin-readable, identity-derived,
  // duplicate guarded, and transactionally rate-limited.
  const firstReport = await asRole("authenticated", USERS.free, async () => (
    await db.query("select public.submit_resource_issue($1, 'cannot_open', 'เปิดแล้วไม่ตอบสนอง') as id", [RESOURCES.authenticated])
  ).rows[0].id);
  const reporterRows = await asRole("authenticated", USERS.free, async () => (
    await db.query("select id from public.resource_issue_reports")
  ).rows);
  assert.equal(reporterRows.length, 0, "reporter must not be able to list even their own report");
  const adminReports = await asRole("authenticated", USERS.admin, async () => (
    await db.query("select id::text, reporter_id::text, status from public.resource_issue_reports")
  ).rows);
  assert.deepEqual(adminReports, [{ id: firstReport, reporter_id: USERS.free, status: "pending" }]);
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "select public.submit_resource_issue($1, 'cannot_open', 'ปัญหาเดิมซ้ำ')", [RESOURCES.authenticated],
    )),
    /unresolved report of this type already exists/,
  );
  for (const category of ["broken_link", "cannot_download", "wrong_content", "other"]) {
    await asRole("authenticated", USERS.free, () => db.query(
      "select public.submit_resource_issue($1, $2, 'รายละเอียดปัญหา')",
      [RESOURCES.authenticated, category],
    ));
  }
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "select public.submit_resource_issue($1, 'cannot_open', 'เกินโควตา')", [RESOURCES.anotherPublic],
    )),
    /rate limit reached/,
  );
  await asRole("authenticated", USERS.admin, () => db.query(
    "select public.admin_set_resource_issue_status($1, 'resolved')", [firstReport],
  ));
  assert.equal((await db.query("select status from public.resource_issue_reports where id = $1", [firstReport])).rows[0].status, "resolved");

  // Self-service profile updates cannot alter identity, role, plan, or another
  // profile. Avatar paths are opaque, private and accepted only when the
  // corresponding Storage object belongs to the authenticated caller.
  const avatarPath = "avatars/44444444-4444-4444-8444-444444444444.webp";
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "select * from public.update_my_profile('ครูคนใหม่', $1)", [avatarPath],
    )),
    /does not belong/,
  );
  await asRole("authenticated", USERS.free, () => db.query(
    "insert into storage.objects(bucket_id, name, owner_id) values ('profile-avatars', $1, $2)",
    [avatarPath, USERS.free],
  ));
  await asRole("authenticated", USERS.free, () => db.query(
    "select * from public.update_my_profile('ครูคนใหม่', $1)", [avatarPath],
  ));
  await asRole("authenticated", USERS.free, () => db.query(
    "update public.profiles set email = 'spoof@test.invalid', plan = 'teacher', role = 'owner' where id = $1",
    [USERS.free],
  ));
  const protectedProfile = await db.query("select email, full_name, role, plan, avatar_path from public.profiles where id = $1", [USERS.free]);
  assert.deepEqual(protectedProfile.rows[0], {
    email: "free@test.invalid",
    full_name: "ครูคนใหม่",
    role: "member",
    plan: "free",
    avatar_path: avatarPath,
  });
  await asRole("authenticated", USERS.free, () => db.query(
    "update public.profiles set full_name = 'แก้คนอื่น' where id = $1", [USERS.other],
  ));
  assert.equal((await db.query("select full_name from public.profiles where id = $1", [USERS.other])).rows[0].full_name, "Other Teacher");
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "select * from public.update_my_profile('ครูคนใหม่', $1)", ["avatars/55555555-5555-4555-8555-555555555555.webp"],
    )),
    /does not belong/,
  );
  await rejectsWith(
    () => asRole("authenticated", USERS.free, () => db.query(
      "insert into storage.objects(bucket_id, name, owner_id) values ('profile-avatars', $1, $2)",
      ["avatars/55555555-5555-4555-8555-555555555555.webp", USERS.other],
    )),
    /row-level security policy/,
  );
  const avatarPublicRead = await asRole("anon", null, async () => (
    await db.query("select name from storage.objects where bucket_id = 'profile-avatars'")
  ).rows, true);
  assert.deepEqual(avatarPublicRead, []);
  const avatarOwnerRead = await asRole("authenticated", USERS.free, async () => (
    await db.query("select name from storage.objects where bucket_id = 'profile-avatars'")
  ).rows);
  assert.deepEqual(avatarOwnerRead, [{ name: avatarPath }]);
  const avatarOtherRead = await asRole("authenticated", USERS.other, async () => (
    await db.query("select name from storage.objects where bucket_id = 'profile-avatars'")
  ).rows);
  assert.deepEqual(avatarOtherRead, []);
  const feedAfterProfile = await db.query("select reviewer_name, reviewer_avatar_path from public.resource_review_feed where id = $1", [firstReview]);
  assert.deepEqual(feedAfterProfile.rows[0], { reviewer_name: "สมาชิก KruAorry", reviewer_avatar_path: null });

  const catalogColumns = await db.query(`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'resource_catalog'
    order by ordinal_position
  `);
  const names = catalogColumns.rows.map((row) => row.column_name);
  for (const expected of [
    "access_mode", "required_plan_ids", "required_plan_names",
    "featured_rank", "review_average", "review_count",
  ]) assert(names.includes(expected), `resource_catalog is missing ${expected}`);
  for (const forbidden of ["cta_url", "file_path", "file_name", "file_mime_type"]) {
    assert(!names.includes(forbidden), `${forbidden} leaked into resource_catalog`);
  }

  process.stdout.write("Batch 4 platform SQL/RLS regression passed in isolated PGlite.\n");
} finally {
  await db.close();
}
