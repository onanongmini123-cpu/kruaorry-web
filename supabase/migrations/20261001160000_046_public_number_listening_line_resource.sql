-- Publish the external Number Listening Line classroom game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue metadata
-- and resolves the public Site URL through the existing resource opener.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'a2dbb83c-33c0-4303-abfd-b9c8ed7799af'::uuid
      and (
        lower(btrim(title)) = lower(btrim('Listening Line Challenge — ฟังเสียงแล้วเลือกคำตอบ'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kruaorry-web.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Number Listening Line title or target already belongs to another resource';
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
  'a2dbb83c-33c0-4303-abfd-b9c8ed7799af'::uuid,
  'Listening Line Challenge — ฟังเสียงแล้วเลือกคำตอบ',
  'เว็บเกมภาษาอังกฤษ · ฟังตัวเลข 5 ระดับ + คำศัพท์ 45 คำ · 2–12 คน · อนุบาล–ม.6',
  'เกมฝึกฟังภาษาอังกฤษแบบผลัดกันตอบสำหรับผู้เรียนอนุบาล–ม.6 บนอุปกรณ์เดียว เลือกได้ 2 โหมด ได้แก่ ฟังตัวเลขและโจทย์คณิตศาสตร์ หรือฟังคำศัพท์พื้นฐาน 45 คำแล้วเลือกคำตอบ a/b/c โหมดตัวเลขปรับตาม 5 ระดับ ตั้งแต่ 0–20 ไปจนถึงจำนวนหลักล้าน จำนวนลบ ทศนิยม เศษส่วน ร้อยละ และบวก–ลบ–คูณ–หาร พร้อมจัดจำนวนรอบให้ผู้เล่นเท่ากัน ระบบปรับจำนวนตัวเลือก เวลา และความเร็วเสียงตามระดับ เล่นได้ 2–12 คน มีนับถอยหลังก่อนแต่ละตา ส่งตาต่ออัตโนมัติ คะแนนรายคน ความแม่นยำรวม และคำแนะนำระดับถัดไป ใช้เสียงสังเคราะห์ภาษาอังกฤษแบบ US จากอุปกรณ์และไม่ต้องใช้บัญชีผู้เรียน',
  'ภาษาอังกฤษ',
  array['kindergarten', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[],
  'web_app',
  'https://kruaorry-web.onanongmini123.chatgpt.site',
  'https://kruaorry-web.onanongmini123.chatgpt.site/images/resources/number-listening-line.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'การฟัง', 'ตัวเลข', 'คณิตศาสตร์', 'คำศัพท์', 'Listening Line', 'กิจกรรมกลุ่ม']::text[],
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
    where id = 'a2dbb83c-33c0-4303-abfd-b9c8ed7799af'::uuid
      and title = 'Listening Line Challenge — ฟังเสียงแล้วเลือกคำตอบ'
      and meta = 'เว็บเกมภาษาอังกฤษ · ฟังตัวเลข 5 ระดับ + คำศัพท์ 45 คำ · 2–12 คน · อนุบาล–ม.6'
      and description = 'เกมฝึกฟังภาษาอังกฤษแบบผลัดกันตอบสำหรับผู้เรียนอนุบาล–ม.6 บนอุปกรณ์เดียว เลือกได้ 2 โหมด ได้แก่ ฟังตัวเลขและโจทย์คณิตศาสตร์ หรือฟังคำศัพท์พื้นฐาน 45 คำแล้วเลือกคำตอบ a/b/c โหมดตัวเลขปรับตาม 5 ระดับ ตั้งแต่ 0–20 ไปจนถึงจำนวนหลักล้าน จำนวนลบ ทศนิยม เศษส่วน ร้อยละ และบวก–ลบ–คูณ–หาร พร้อมจัดจำนวนรอบให้ผู้เล่นเท่ากัน ระบบปรับจำนวนตัวเลือก เวลา และความเร็วเสียงตามระดับ เล่นได้ 2–12 คน มีนับถอยหลังก่อนแต่ละตา ส่งตาต่ออัตโนมัติ คะแนนรายคน ความแม่นยำรวม และคำแนะนำระดับถัดไป ใช้เสียงสังเคราะห์ภาษาอังกฤษแบบ US จากอุปกรณ์และไม่ต้องใช้บัญชีผู้เรียน'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['kindergarten', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kruaorry-web.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.onanongmini123.chatgpt.site/images/resources/number-listening-line.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'การฟัง', 'ตัวเลข', 'คณิตศาสตร์', 'คำศัพท์', 'Listening Line', 'กิจกรรมกลุ่ม']::text[]
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
    raise exception 'Existing Number Listening Line resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'a2dbb83c-33c0-4303-abfd-b9c8ed7799af'::uuid
  ) then
    raise exception 'Public Number Listening Line must not have plan-specific grants';
  end if;
end;
$$;
