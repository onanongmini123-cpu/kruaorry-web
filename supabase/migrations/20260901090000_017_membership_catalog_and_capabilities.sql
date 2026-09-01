-- Phase 1B: introduce a truthful, extensible membership catalogue and a
-- centralized capability model. Existing plan ids remain valid: `plus` is
-- retained as a hidden legacy plan, and `lifetime` is restored only as a
-- hidden compatibility row so historical users can never lose access.

alter table public.plans
  add column price_amount_thb integer,
  add column billing_interval text not null default 'year',
  add column lifecycle_status text not null default 'active',
  add column is_public boolean not null default true,
  add column is_upgradeable boolean not null default true,
  add column is_popular boolean not null default false;

alter table public.plans
  add constraint plans_price_amount_nonnegative
    check (price_amount_thb is null or price_amount_thb >= 0),
  add constraint plans_billing_interval_check
    check (billing_interval in ('none', 'year', 'one_time')),
  add constraint plans_lifecycle_status_check
    check (lifecycle_status in ('active', 'legacy', 'retired'));

insert into public.plans (
  id,
  name,
  price_label,
  note,
  features,
  sort_order,
  price_amount_thb,
  billing_interval,
  lifecycle_status,
  is_public,
  is_upgradeable,
  is_popular
) values
  (
    'free',
    'ฟรี',
    '0 บาท',
    'เริ่มต้นใช้งานสื่อพื้นฐาน',
    array['สื่อพร้อมสอนบางส่วน', 'บันทึกสื่อที่ชอบได้สูงสุด 10 รายการ'],
    10,
    0,
    'none',
    'active',
    true,
    false,
    false
  ),
  (
    'founder',
    'Founder 100',
    '299 บาท/ปี',
    'สำหรับครู 100 คนแรก ต่ออายุต่อเนื่องเพื่อรักษาราคาพิเศษ',
    array['คลังสื่อพรีเมียมทั้งหมด', 'บันทึกสื่อที่ชอบได้ไม่จำกัด', 'ดาวน์โหลดไฟล์อย่างปลอดภัย'],
    20,
    299,
    'year',
    'active',
    true,
    true,
    false
  ),
  (
    'teacher',
    'Teacher',
    '599 บาท/ปี',
    'แพ็กหลักสำหรับครู ไม่ถึงวันละ 2 บาท',
    array['คลังสื่อพรีเมียมทั้งหมด', 'บันทึกสื่อที่ชอบได้ไม่จำกัด', 'ดาวน์โหลดไฟล์อย่างปลอดภัย'],
    30,
    599,
    'year',
    'active',
    true,
    true,
    true
  ),
  (
    'teacher_pro',
    'Teacher Pro',
    '990 บาท/ปี',
    'สำหรับครูที่ต้องการเครื่องมือขั้นสูง ไม่ถึงวันละ 3 บาท',
    array['สิทธิ์ Teacher ครบทุกอย่าง', 'บันทึกสื่อที่ชอบได้ไม่จำกัด', 'ดาวน์โหลดไฟล์อย่างปลอดภัย'],
    40,
    990,
    'year',
    'active',
    true,
    true,
    false
  ),
  (
    'plus',
    'Plus (Legacy)',
    '990 บาท/ปี',
    'แพ็กเดิมสำหรับสมาชิกและคำขอที่มีอยู่ก่อน Phase 1B',
    array['คลังสื่อพรีเมียมทั้งหมด', 'บันทึกสื่อที่ชอบได้ไม่จำกัด', 'ดาวน์โหลดไฟล์อย่างปลอดภัย'],
    90,
    990,
    'year',
    'legacy',
    false,
    false,
    false
  ),
  (
    'lifetime',
    'Lifetime (Legacy)',
    'สิทธิ์เดิม',
    'เก็บไว้เฉพาะเพื่อรักษาสิทธิ์สมาชิกเดิม ห้ามเปิดขายใหม่',
    array['สิทธิ์พรีเมียมเดิมที่ต้องได้รับการคุ้มครอง'],
    100,
    null,
    'one_time',
    'retired',
    false,
    false,
    false
  )
on conflict (id) do update set
  name = excluded.name,
  price_label = excluded.price_label,
  note = excluded.note,
  features = excluded.features,
  sort_order = excluded.sort_order,
  price_amount_thb = excluded.price_amount_thb,
  billing_interval = excluded.billing_interval,
  lifecycle_status = excluded.lifecycle_status,
  is_public = excluded.is_public,
  is_upgradeable = excluded.is_upgradeable,
  is_popular = excluded.is_popular;

create table public.features (
  id text primary key,
  name text not null,
  description text,
  value_type text not null default 'boolean'
    check (value_type in ('boolean', 'integer')),
  created_at timestamptz not null default now()
);

create table public.plan_features (
  plan_id text not null references public.plans(id) on delete cascade,
  feature_id text not null references public.features(id) on delete cascade,
  enabled boolean not null default false,
  limit_value bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (plan_id, feature_id),
  constraint plan_features_limit_nonnegative
    check (limit_value is null or limit_value >= 0)
);

alter table public.features enable row level security;
alter table public.plan_features enable row level security;

create policy "features_public_read"
  on public.features for select
  using (true);

create policy "plan_features_public_read"
  on public.plan_features for select
  using (true);

insert into public.features (id, name, description, value_type) values
  ('library.premium', 'คลังสื่อพรีเมียม', 'เปิดสื่อและไฟล์พรีเมียม', 'boolean'),
  ('favorites.enabled', 'บันทึกสื่อที่ชอบ', 'เปิดใช้งานรายการโปรด', 'boolean'),
  ('favorites.limit', 'จำนวนรายการโปรด', 'ค่าสูงสุดต่อสมาชิก; null หมายถึงไม่จำกัด', 'integer'),
  ('download.premium', 'ดาวน์โหลดพรีเมียม', 'ดาวน์โหลดไฟล์พรีเมียมผ่าน signed URL', 'boolean'),
  ('workspace.enabled', 'พื้นที่ทำงานส่วนตัว', 'พื้นที่ทำงานและคลังส่วนตัว', 'boolean'),
  ('history.download', 'ประวัติดาวน์โหลด', 'ดูประวัติการดาวน์โหลดของตนเอง', 'boolean'),
  ('generator.basic', 'เครื่องมือสร้างพื้นฐาน', 'ใช้ generator ระดับพื้นฐาน', 'boolean'),
  ('generator.advanced', 'เครื่องมือสร้างขั้นสูง', 'ใช้ generator ระดับ Pro', 'boolean'),
  ('templates.personal', 'เทมเพลตส่วนตัว', 'บันทึกและนำเทมเพลตส่วนตัวกลับมาใช้', 'boolean'),
  ('ai.enabled', 'ผู้ช่วย AI', 'เปิดใช้งานงาน AI ฝั่งเซิร์ฟเวอร์', 'boolean'),
  ('ai.monthly_quota', 'โควตา AI รายเดือน', 'จำนวนครั้งต่อรอบบิล', 'integer'),
  ('membership.founder_badge', 'ตรา Founder', 'แสดงสถานะ Founder ที่ยังรักษาสิทธิ์อยู่', 'boolean'),
  ('membership.early_access', 'สิทธิ์ทดลองก่อน', 'เข้าถึงฟีเจอร์ที่เปิด Early Access', 'boolean'),
  ('school.admin', 'ผู้ดูแลโรงเรียน', 'จัดการสมาชิกและพื้นที่ทำงานของโรงเรียน', 'boolean'),
  ('school.shared_library', 'คลังร่วมของโรงเรียน', 'ใช้คลังสื่อร่วมระดับองค์กร', 'boolean'),
  ('analytics.school', 'สถิติโรงเรียน', 'ดูสถิติแบบรวมของโรงเรียน', 'boolean')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  value_type = excluded.value_type;

-- Only capabilities backed by the current product are enabled now. Future
-- AI, generator, workspace, history and school capabilities exist in the
-- catalogue but remain disabled until their actual product flows ship.
insert into public.plan_features (plan_id, feature_id, enabled, limit_value) values
  ('free', 'favorites.enabled', true, null),
  ('free', 'favorites.limit', true, 10),

  ('founder', 'library.premium', true, null),
  ('founder', 'favorites.enabled', true, null),
  ('founder', 'favorites.limit', true, null),
  ('founder', 'download.premium', true, null),
  ('founder', 'membership.founder_badge', true, null),
  ('founder', 'membership.early_access', true, null),

  ('teacher', 'library.premium', true, null),
  ('teacher', 'favorites.enabled', true, null),
  ('teacher', 'favorites.limit', true, null),
  ('teacher', 'download.premium', true, null),

  ('teacher_pro', 'library.premium', true, null),
  ('teacher_pro', 'favorites.enabled', true, null),
  ('teacher_pro', 'favorites.limit', true, null),
  ('teacher_pro', 'download.premium', true, null),

  ('plus', 'library.premium', true, null),
  ('plus', 'favorites.enabled', true, null),
  ('plus', 'favorites.limit', true, null),
  ('plus', 'download.premium', true, null),

  ('lifetime', 'library.premium', true, null),
  ('lifetime', 'favorites.enabled', true, null),
  ('lifetime', 'favorites.limit', true, null),
  ('lifetime', 'download.premium', true, null)
on conflict (plan_id, feature_id) do update set
  enabled = excluded.enabled,
  limit_value = excluded.limit_value,
  updated_at = now();

create index idx_plan_features_feature_id on public.plan_features(feature_id);
