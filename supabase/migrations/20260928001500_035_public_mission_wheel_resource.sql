-- Publish the external Mission Wheel learning game for everyone, including
-- signed-out visitors. KruAorry stores only safe catalogue metadata and uses
-- the existing resource target resolver for the public game URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'a7266b9c-3539-423b-9119-dbf019b887cb'::uuid
      and (
        lower(btrim(title)) = lower(btrim('วงล้อพิชิตภารกิจ'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-mission-wheel-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Mission Wheel title or target already belongs to another resource';
  end if;
end;
$$;

insert into public.resources (
  id,
  title,
  meta,
  description,
  category,
  grade_levels,
  delivery_mode,
  cta_url,
  cover_image_url,
  tags,
  is_free,
  status,
  published_at,
  access_mode,
  file_path,
  file_name,
  file_size,
  file_mime_type,
  created_by
) values (
  'a7266b9c-3539-423b-9119-dbf019b887cb'::uuid,
  'วงล้อพิชิตภารกิจ',
  'เว็บเกมทีม · 60 ข้อ · 4 หมวดวิชา · ง่าย/กลาง · 2–4 ทีม · ป.1–3',
  'เกมตอบคำถามแบบทีมบนจอเดียวในธีมสวนสนุก สำหรับ 2–4 ทีมผลัดกันหมุนวงล้อเพื่อเลือกหมวดคณิตศาสตร์ ภาษาไทย ภาษาอังกฤษ หรือความรู้รอบตัวด้วยน้ำหนักเท่ากัน วงล้อมีหน้าที่เลือกหมวดเท่านั้น ตอบคำถาม 3 ตัวเลือกถูกได้ 1 ดาว ผิดได้ 0 ดาวพร้อมเฉลย มีคลังอย่างน้อย 60 ข้อ ระดับง่ายและกลางใช้คำถามต่างกัน ระบบจัดลำดับทีมและจำนวนตาให้เท่ากันก่อนตัดสินผู้ได้ดาวสูงสุด รองรับการชนะร่วมกัน และเลือกไม่จับเวลาหรือจับเวลา 30 วินาทีต่อข้อได้',
  'บูรณาการหลายวิชา',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  'https://kru-mission-wheel-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/mission-wheel.jpg',
  array['เกม', 'คณิตศาสตร์', 'ภาษาไทย', 'ภาษาอังกฤษ', 'ความรู้รอบตัว', 'กิจกรรมกลุ่ม']::text[],
  true,
  'published',
  now(),
  'public',
  null,
  null,
  null,
  null,
  null
)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from public.resources
    where id = 'a7266b9c-3539-423b-9119-dbf019b887cb'::uuid
      and title = 'วงล้อพิชิตภารกิจ'
      and meta = 'เว็บเกมทีม · 60 ข้อ · 4 หมวดวิชา · ง่าย/กลาง · 2–4 ทีม · ป.1–3'
      and description = 'เกมตอบคำถามแบบทีมบนจอเดียวในธีมสวนสนุก สำหรับ 2–4 ทีมผลัดกันหมุนวงล้อเพื่อเลือกหมวดคณิตศาสตร์ ภาษาไทย ภาษาอังกฤษ หรือความรู้รอบตัวด้วยน้ำหนักเท่ากัน วงล้อมีหน้าที่เลือกหมวดเท่านั้น ตอบคำถาม 3 ตัวเลือกถูกได้ 1 ดาว ผิดได้ 0 ดาวพร้อมเฉลย มีคลังอย่างน้อย 60 ข้อ ระดับง่ายและกลางใช้คำถามต่างกัน ระบบจัดลำดับทีมและจำนวนตาให้เท่ากันก่อนตัดสินผู้ได้ดาวสูงสุด รองรับการชนะร่วมกัน และเลือกไม่จับเวลาหรือจับเวลา 30 วินาทีต่อข้อได้'
      and category = 'บูรณาการหลายวิชา'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-mission-wheel-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/mission-wheel.jpg'
      and tags = array['เกม', 'คณิตศาสตร์', 'ภาษาไทย', 'ภาษาอังกฤษ', 'ความรู้รอบตัว', 'กิจกรรมกลุ่ม']::text[]
      and is_free = true
      and status = 'published'
      and published_at is not null
      and access_mode = 'public'
      and file_path is null
      and file_name is null
      and file_size is null
      and file_mime_type is null
      and created_by is null
  ) then
    raise exception 'Existing Mission Wheel resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'a7266b9c-3539-423b-9119-dbf019b887cb'::uuid
  ) then
    raise exception 'Public Mission Wheel must not have plan-specific grants';
  end if;
end;
$$;
