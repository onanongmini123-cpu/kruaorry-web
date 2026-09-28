-- Publish the external Vocabulary Fishing learning game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue
-- metadata and uses the existing resource target resolver for the public URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '2fd4da60-b60a-43ea-b382-5b2065e15241'::uuid
      and (
        lower(btrim(title)) = lower(btrim('ตกปลาคำศัพท์'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-vocab-fishing-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Vocabulary Fishing title or target already belongs to another resource';
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
  '2fd4da60-b60a-43ea-b382-5b2065e15241'::uuid,
  'ตกปลาคำศัพท์',
  'เว็บเกมคำศัพท์ · 40 คำ · 4 หมวด · เดี่ยว/2 คน · 60 วินาที/ฝึก · ป.1–3',
  'เกมฝึกคำศัพท์ภาษาอังกฤษในโลกใต้ทะเลสดใส เล่นได้ทั้งคนเดียวหรือ 2 คนผลัดกันบนอุปกรณ์เดียว เลือกสัตว์ อาหาร สี หรือของใช้ในห้องเรียนจากคลังอย่างน้อย 40 คำ แล้วแตะปลาคำศัพท์อังกฤษที่ตรงกับภาพหรือคำแปลไทยจากปลา 3 ตัว ตอบถูกได้ 10 คะแนน ตอบผิดได้ 0 คะแนนและดูเฉลยก่อนข้อถัดไป เลือกเล่น 60 วินาทีหรือฝึกแบบไม่จับเวลาได้ พร้อมตัวเลือกหยุดปลาเคลื่อนที่ ปุ่มฟังคำศัพท์เสริม และสรุปคำที่เรียนรู้กับคำที่ควรทบทวน',
  'ภาษาอังกฤษ',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  'https://kru-vocab-fishing-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/vocab-fishing.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'สัตว์', 'อาหาร', 'สี', 'ห้องเรียน']::text[],
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
    where id = '2fd4da60-b60a-43ea-b382-5b2065e15241'::uuid
      and title = 'ตกปลาคำศัพท์'
      and meta = 'เว็บเกมคำศัพท์ · 40 คำ · 4 หมวด · เดี่ยว/2 คน · 60 วินาที/ฝึก · ป.1–3'
      and description = 'เกมฝึกคำศัพท์ภาษาอังกฤษในโลกใต้ทะเลสดใส เล่นได้ทั้งคนเดียวหรือ 2 คนผลัดกันบนอุปกรณ์เดียว เลือกสัตว์ อาหาร สี หรือของใช้ในห้องเรียนจากคลังอย่างน้อย 40 คำ แล้วแตะปลาคำศัพท์อังกฤษที่ตรงกับภาพหรือคำแปลไทยจากปลา 3 ตัว ตอบถูกได้ 10 คะแนน ตอบผิดได้ 0 คะแนนและดูเฉลยก่อนข้อถัดไป เลือกเล่น 60 วินาทีหรือฝึกแบบไม่จับเวลาได้ พร้อมตัวเลือกหยุดปลาเคลื่อนที่ ปุ่มฟังคำศัพท์เสริม และสรุปคำที่เรียนรู้กับคำที่ควรทบทวน'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-vocab-fishing-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/vocab-fishing.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'สัตว์', 'อาหาร', 'สี', 'ห้องเรียน']::text[]
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
    raise exception 'Existing Vocabulary Fishing resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '2fd4da60-b60a-43ea-b382-5b2065e15241'::uuid
  ) then
    raise exception 'Public Vocabulary Fishing must not have plan-specific grants';
  end if;
end;
$$;
