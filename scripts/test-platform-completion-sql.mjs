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
