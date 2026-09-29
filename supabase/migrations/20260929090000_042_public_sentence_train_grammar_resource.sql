-- Publish the distinct Sentence Train grammar game for everyone, including
-- signed-out visitors. The earlier Thai-titled sentence-train game remains a
-- separate catalogue resource with its original URL and cover.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '86afb9c3-20f2-4ab6-9ebc-9a454b36692b'::uuid
      and (
        lower(btrim(title)) = lower(btrim('Sentence Train'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://sentence-train-grammar-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Sentence Train Grammar title or target already belongs to another resource';
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
  '86afb9c3-20f2-4ab6-9ebc-9a454b36692b'::uuid,
  'Sentence Train',
  'เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง · เดี่ยว/2 คน/2–4 ทีม · ป.2–ม.3',
  'เกมฝึกโครงสร้างและลำดับคำภาษาอังกฤษธีมต่อขบวนรถไฟสำหรับนักเรียน ป.2–ม.3 เล่นได้ทั้งคนเดียว 2 คน หรือ 2–4 ทีมบนจอเดียว มีคลังประโยคที่ตรวจสอบแล้ว 810 ข้อ ครบ Present Simple, Past Simple, Future, Questions, Negatives และประโยคซับซ้อน พร้อมคำตอบทางเลือกที่ถูกหลักซึ่งระบบยอมรับตามรายการ ผู้เล่นลากหรือแตะตู้คำลงรางแล้วกดตรวจ ระบบบอกจำนวนตำแหน่งที่ถูกโดยยังไม่เฉลยทันที ครูเลือกระดับ โครงสร้าง ช่วงจำนวนคำ จำนวนข้อ 8–15 ข้อ เวลา 30–60 วินาทีหรือไม่จับเวลา และจำนวนครั้งที่ลองได้ ตอบถูกครั้งแรก 100 คะแนน ครั้งที่สอง 70 คะแนน ครั้งที่สาม 40 คะแนน และคำใบ้ลดคะแนนข้อนั้น 20 คะแนน ระบบซ่อนโจทย์จนผู้เล่นกดพร้อม จัดตาให้ทุกฝ่ายเท่ากัน และสรุปคะแนน โครงสร้างที่พลาด ประโยคที่ตอบผิด และคำอธิบายไวยากรณ์ โดยเลือกเก็บผลล่าสุดเฉพาะในอุปกรณ์ได้',
  'ภาษาอังกฤษ',
  array['p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3']::text[],
  'web_app',
  'https://sentence-train-grammar-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/sentence-train-grammar.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'ประโยค', 'ไวยากรณ์', 'เรียงคำ', 'Sentence Train', 'Tenses', 'Questions', 'กิจกรรมทีม']::text[],
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
    where id = '86afb9c3-20f2-4ab6-9ebc-9a454b36692b'::uuid
      and title = 'Sentence Train'
      and meta = 'เว็บเกมภาษาอังกฤษ · 810 ประโยค · 6 โครงสร้าง · เดี่ยว/2 คน/2–4 ทีม · ป.2–ม.3'
      and description = 'เกมฝึกโครงสร้างและลำดับคำภาษาอังกฤษธีมต่อขบวนรถไฟสำหรับนักเรียน ป.2–ม.3 เล่นได้ทั้งคนเดียว 2 คน หรือ 2–4 ทีมบนจอเดียว มีคลังประโยคที่ตรวจสอบแล้ว 810 ข้อ ครบ Present Simple, Past Simple, Future, Questions, Negatives และประโยคซับซ้อน พร้อมคำตอบทางเลือกที่ถูกหลักซึ่งระบบยอมรับตามรายการ ผู้เล่นลากหรือแตะตู้คำลงรางแล้วกดตรวจ ระบบบอกจำนวนตำแหน่งที่ถูกโดยยังไม่เฉลยทันที ครูเลือกระดับ โครงสร้าง ช่วงจำนวนคำ จำนวนข้อ 8–15 ข้อ เวลา 30–60 วินาทีหรือไม่จับเวลา และจำนวนครั้งที่ลองได้ ตอบถูกครั้งแรก 100 คะแนน ครั้งที่สอง 70 คะแนน ครั้งที่สาม 40 คะแนน และคำใบ้ลดคะแนนข้อนั้น 20 คะแนน ระบบซ่อนโจทย์จนผู้เล่นกดพร้อม จัดตาให้ทุกฝ่ายเท่ากัน และสรุปคะแนน โครงสร้างที่พลาด ประโยคที่ตอบผิด และคำอธิบายไวยากรณ์ โดยเลือกเก็บผลล่าสุดเฉพาะในอุปกรณ์ได้'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://sentence-train-grammar-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/sentence-train-grammar.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'ประโยค', 'ไวยากรณ์', 'เรียงคำ', 'Sentence Train', 'Tenses', 'Questions', 'กิจกรรมทีม']::text[]
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
    raise exception 'Existing Sentence Train Grammar resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '86afb9c3-20f2-4ab6-9ebc-9a454b36692b'::uuid
  ) then
    raise exception 'Public Sentence Train Grammar must not have plan-specific grants';
  end if;
end;
$$;
