-- Publish the external Listening Detective English listening game for
-- everyone, including signed-out visitors. KruAorry stores only safe catalogue
-- metadata and uses the existing resource target resolver for the public URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'df55f95a-b307-4aec-8b42-e6b9a1244a6e'::uuid
      and (
        lower(btrim(title)) = lower(btrim('Listening Detective'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://listening-detective-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Listening Detective title or target already belongs to another resource';
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
  'df55f95a-b307-4aec-8b42-e6b9a1244a6e'::uuid,
  'Listening Detective',
  'เว็บเกมภาษาอังกฤษ · 600 เบาะแส · 6 ประเภทเสียง · เดี่ยว/2–12 คน/2–4 ทีม · อนุบาล–ม.6',
  'เกมฝึกฟังภาษาอังกฤษธีมสำนักงานนักสืบสำหรับผู้เรียนอนุบาล–ม.6 มีคลังเบาะแสที่ตรวจแล้ว 600 ข้อ ครบคำศัพท์ ประโยคสั้น คำสั่ง บทสนทนา เรื่องเล่า รายละเอียด และการระบุบุคคล พร้อม 5 ระดับความยาก เล่นได้ทั้งคนเดียว ผลัดกัน 2–12 คน หรือ 2–4 ทีมบนจอเดียว ระบบจัดจำนวนตาให้ทุกฝ่ายเท่ากัน เลือก 10–20 ข้อ ตัวเลือก 3–4 ข้อ สำเนียง American/British และไม่จับเวลาหรือจับเวลา 15–30 วินาที ฟังครั้งแรกได้ 100 คะแนน ครั้งที่สอง 75 คะแนน ครั้งที่สาม 50 คะแนน หากตอบผิดให้ลองใหม่หนึ่งครั้งและได้ไม่เกิน 25 คะแนน ใช้ไฟล์เสียงที่ตรวจแล้วร่วมกับเสียงสังเคราะห์ มีข้อความสำรองเมื่ออุปกรณ์ไม่มีเสียงโดยไม่นับคะแนน พร้อมสรุปความแม่นยำ คำที่ควรทบทวน และประเภทเสียงที่ควรฝึกเพิ่ม โดยเลือกไม่เก็บข้อมูลหรือเก็บเฉพาะผลล่าสุดในอุปกรณ์ได้',
  'ภาษาอังกฤษ',
  array['kindergarten', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[],
  'web_app',
  'https://listening-detective-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/listening-detective.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'การฟัง', 'จับใจความ', 'คำศัพท์', 'Listening Detective', 'กิจกรรมทีม']::text[],
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
    where id = 'df55f95a-b307-4aec-8b42-e6b9a1244a6e'::uuid
      and title = 'Listening Detective'
      and meta = 'เว็บเกมภาษาอังกฤษ · 600 เบาะแส · 6 ประเภทเสียง · เดี่ยว/2–12 คน/2–4 ทีม · อนุบาล–ม.6'
      and description = 'เกมฝึกฟังภาษาอังกฤษธีมสำนักงานนักสืบสำหรับผู้เรียนอนุบาล–ม.6 มีคลังเบาะแสที่ตรวจแล้ว 600 ข้อ ครบคำศัพท์ ประโยคสั้น คำสั่ง บทสนทนา เรื่องเล่า รายละเอียด และการระบุบุคคล พร้อม 5 ระดับความยาก เล่นได้ทั้งคนเดียว ผลัดกัน 2–12 คน หรือ 2–4 ทีมบนจอเดียว ระบบจัดจำนวนตาให้ทุกฝ่ายเท่ากัน เลือก 10–20 ข้อ ตัวเลือก 3–4 ข้อ สำเนียง American/British และไม่จับเวลาหรือจับเวลา 15–30 วินาที ฟังครั้งแรกได้ 100 คะแนน ครั้งที่สอง 75 คะแนน ครั้งที่สาม 50 คะแนน หากตอบผิดให้ลองใหม่หนึ่งครั้งและได้ไม่เกิน 25 คะแนน ใช้ไฟล์เสียงที่ตรวจแล้วร่วมกับเสียงสังเคราะห์ มีข้อความสำรองเมื่ออุปกรณ์ไม่มีเสียงโดยไม่นับคะแนน พร้อมสรุปความแม่นยำ คำที่ควรทบทวน และประเภทเสียงที่ควรฝึกเพิ่ม โดยเลือกไม่เก็บข้อมูลหรือเก็บเฉพาะผลล่าสุดในอุปกรณ์ได้'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['kindergarten', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://listening-detective-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/listening-detective.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'การฟัง', 'จับใจความ', 'คำศัพท์', 'Listening Detective', 'กิจกรรมทีม']::text[]
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
    raise exception 'Existing Listening Detective resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'df55f95a-b307-4aec-8b42-e6b9a1244a6e'::uuid
  ) then
    raise exception 'Public Listening Detective must not have plan-specific grants';
  end if;
end;
$$;
