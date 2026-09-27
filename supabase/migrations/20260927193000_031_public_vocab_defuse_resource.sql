-- Publish the external Vocabulary Defuse game for everyone, including guests.
-- The game itself is hosted on its own public Sites origin. KruAorry stores
-- only safe catalogue metadata and resolves the destination through the
-- existing resource access function.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '6cc12b2d-5ebc-4533-85d0-13038a0dc189'::uuid
      and (
        lower(btrim(title)) = lower(btrim('กู้ระเบิดคำศัพท์'))
        or btrim(cta_url) = 'https://kru-vocab-defuse-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Vocabulary Defuse title or target already belongs to another resource';
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
  '6cc12b2d-5ebc-4533-85d0-13038a0dc189'::uuid,
  'กู้ระเบิดคำศัพท์',
  'เว็บเกมภาษาอังกฤษ · 48 คำ · 4 หมวด · 8 ด่าน · ป.1–6',
  'เกมภารกิจกู้ระเบิดคำศัพท์สำหรับผู้เรียนระดับประถม ฝึกคำศัพท์ภาษาอังกฤษ 48 คำใน 4 หมวด ได้แก่ สัตว์ ของใช้ในห้องเรียน อาหาร และส่วนต่าง ๆ ของร่างกาย ผ่านภารกิจปลดล็อก 8 ขั้น เลือกได้ 3 ระดับ—คำแปลไทย ภาพ SVG และประโยคบริบท—พร้อมโหมดเล่นเดี่ยวหรือช่วยกันทั้งห้อง ตั้งเวลา 60/120/180 วินาทีหรือฝึกไม่จับเวลา ตอบผิดมีเฉลยสั้น ๆ และเปลี่ยนเป็นข้อสำรองทันที ครูพักเวลาเพื่ออธิบายได้ทุกข้อ ไม่มีเสียงตกใจหรือภาพรุนแรง',
  'ภาษาอังกฤษ',
  array['p1', 'p2', 'p3', 'p4', 'p5', 'p6']::text[],
  'web_app',
  'https://kru-vocab-defuse-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/vocab-defuse.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'ประถมศึกษา', 'กิจกรรมทั้งห้อง']::text[],
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
    where id = '6cc12b2d-5ebc-4533-85d0-13038a0dc189'::uuid
      and title = 'กู้ระเบิดคำศัพท์'
      and meta = 'เว็บเกมภาษาอังกฤษ · 48 คำ · 4 หมวด · 8 ด่าน · ป.1–6'
      and description = 'เกมภารกิจกู้ระเบิดคำศัพท์สำหรับผู้เรียนระดับประถม ฝึกคำศัพท์ภาษาอังกฤษ 48 คำใน 4 หมวด ได้แก่ สัตว์ ของใช้ในห้องเรียน อาหาร และส่วนต่าง ๆ ของร่างกาย ผ่านภารกิจปลดล็อก 8 ขั้น เลือกได้ 3 ระดับ—คำแปลไทย ภาพ SVG และประโยคบริบท—พร้อมโหมดเล่นเดี่ยวหรือช่วยกันทั้งห้อง ตั้งเวลา 60/120/180 วินาทีหรือฝึกไม่จับเวลา ตอบผิดมีเฉลยสั้น ๆ และเปลี่ยนเป็นข้อสำรองทันที ครูพักเวลาเพื่ออธิบายได้ทุกข้อ ไม่มีเสียงตกใจหรือภาพรุนแรง'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p1', 'p2', 'p3', 'p4', 'p5', 'p6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-vocab-defuse-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/vocab-defuse.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'ประถมศึกษา', 'กิจกรรมทั้งห้อง']::text[]
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
    raise exception 'Existing Vocabulary Defuse resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '6cc12b2d-5ebc-4533-85d0-13038a0dc189'::uuid
  ) then
    raise exception 'Public Vocabulary Defuse must not have plan-specific grants';
  end if;
end;
$$;
