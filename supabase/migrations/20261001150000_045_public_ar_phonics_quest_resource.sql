-- Publish AR Phonics Quest as a free public English learning resource.
-- KruAorry stores only safe catalogue metadata and the public Site URL;
-- camera frames and pupil results remain on the visitor's device.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '898fa4ab-4db0-4ec0-9c9b-1ba1d4150972'::uuid
      and (
        lower(btrim(title)) = lower(btrim('AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://ar-phonics-quest-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'AR Phonics Quest title or target already belongs to another resource';
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
  '898fa4ab-4db0-4ec0-9c9b-1ba1d4150972'::uuid,
  'AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร',
  'เว็บเกมภาษาอังกฤษ · 78 คำ A–Z · สแกนบัตร/ไม่ใช้กล้อง · เดี่ยว/2–12 คน/2–4 ทีม/ทั้งห้อง · อนุบาล–ป.3',
  'เกมฝึกโฟนิกส์ธีมนักสำรวจสำหรับอนุบาล–ป.3 เชื่อมเสียงต้นคำกับตัวอักษรพิมพ์ใหญ่–เล็ก มีคำศัพท์ที่ตรวจแล้ว 78 คำครบ A–Z พร้อมไฟล์เสียงในเว็บ เล่นได้ทั้งคนเดียว ผลัดกัน 2–12 คน 2–4 ทีม หรือทั้งห้อง ระบบจัดตาให้เท่ากันและไม่จบกลางรอบ ครูเลือกตัวอักษร จำนวนภารกิจ และเวลา 20/30/40 วินาทีได้ เด็กฟังคำแล้วสแกนบัตร QR A–Z ที่พิมพ์จากเว็บ หรือใช้โหมดแตะ 3 ตัวเลือกโดยไม่ใช้กล้อง ตอบถูกครั้งแรกได้ 100 คะแนน ครั้งที่สอง 50 คะแนน ผิดหรือหมดเวลาได้ 0 คะแนน พร้อมคำใบ้ คำถามเสริม และสรุปเสียงที่ควรฝึก กล้องขอสิทธิ์เมื่อกดเปิด ไม่บันทึกหรืออัปโหลดภาพ ปิดเมื่อออกหรือซ่อนหน้าเว็บ และเก็บผลเฉพาะในอุปกรณ์',
  'ภาษาอังกฤษ',
  array['kindergarten', 'p1', 'p2', 'p3']::text[],
  'web_app',
  'https://ar-phonics-quest-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/ar-phonics-quest.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'โฟนิกส์', 'Phonics', 'A–Z', 'ตัวอักษร', 'คำศัพท์', 'สแกน QR', 'กิจกรรมทีม']::text[],
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
    where id = '898fa4ab-4db0-4ec0-9c9b-1ba1d4150972'::uuid
      and title = 'AR Phonics Quest — ภารกิจล่าเสียงตัวอักษร'
      and meta = 'เว็บเกมภาษาอังกฤษ · 78 คำ A–Z · สแกนบัตร/ไม่ใช้กล้อง · เดี่ยว/2–12 คน/2–4 ทีม/ทั้งห้อง · อนุบาล–ป.3'
      and description = 'เกมฝึกโฟนิกส์ธีมนักสำรวจสำหรับอนุบาล–ป.3 เชื่อมเสียงต้นคำกับตัวอักษรพิมพ์ใหญ่–เล็ก มีคำศัพท์ที่ตรวจแล้ว 78 คำครบ A–Z พร้อมไฟล์เสียงในเว็บ เล่นได้ทั้งคนเดียว ผลัดกัน 2–12 คน 2–4 ทีม หรือทั้งห้อง ระบบจัดตาให้เท่ากันและไม่จบกลางรอบ ครูเลือกตัวอักษร จำนวนภารกิจ และเวลา 20/30/40 วินาทีได้ เด็กฟังคำแล้วสแกนบัตร QR A–Z ที่พิมพ์จากเว็บ หรือใช้โหมดแตะ 3 ตัวเลือกโดยไม่ใช้กล้อง ตอบถูกครั้งแรกได้ 100 คะแนน ครั้งที่สอง 50 คะแนน ผิดหรือหมดเวลาได้ 0 คะแนน พร้อมคำใบ้ คำถามเสริม และสรุปเสียงที่ควรฝึก กล้องขอสิทธิ์เมื่อกดเปิด ไม่บันทึกหรืออัปโหลดภาพ ปิดเมื่อออกหรือซ่อนหน้าเว็บ และเก็บผลเฉพาะในอุปกรณ์'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['kindergarten', 'p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://ar-phonics-quest-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/ar-phonics-quest.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'โฟนิกส์', 'Phonics', 'A–Z', 'ตัวอักษร', 'คำศัพท์', 'สแกน QR', 'กิจกรรมทีม']::text[]
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
    raise exception 'Existing AR Phonics Quest resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '898fa4ab-4db0-4ec0-9c9b-1ba1d4150972'::uuid
  ) then
    raise exception 'Public AR Phonics Quest must not have plan-specific grants';
  end if;
end;
$$;
