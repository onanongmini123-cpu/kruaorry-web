-- Publish the external Word Squad vocabulary grouping game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue
-- metadata and uses the existing resource target resolver for the public URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8'::uuid
      and (
        lower(btrim(title)) = lower(btrim('Word Squad — รวมแก๊งคำศัพท์'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://word-squad-vocabulary-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Word Squad title or target already belongs to another resource';
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
  'ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8'::uuid,
  'Word Squad — รวมแก๊งคำศัพท์',
  'เว็บเกมภาษาอังกฤษ · 16 คำ/กระดาน · 4 กลุ่ม · เดี่ยว/ทีม/ทั้งห้อง · ป.2–ม.6',
  'เกมจัดกลุ่มคำศัพท์ธีมทีมสายลับสำหรับนักเรียน ป.2–ม.6 ในแต่ละกระดานมีคำ 16 คำให้ค้นหาความสัมพันธ์และจัดเป็น 4 กลุ่ม กลุ่มละ 4 คำ เลือกคำ 4 คำแล้วกดตรวจ เมื่อถูกระบบล็อกกลุ่มและเปิดชื่อหมวด เล่นได้ทั้งคนเดียว 2 คน 2–4 ทีม หรือทั้งห้อง มีชุดเนื้อหาที่ตรวจสอบแล้ว ครอบคลุม Animals, Food, School, Verbs, Adjectives, Synonyms, Antonyms, Collocations และ Idioms โดยไม่สร้างคำแบบอิสระ ครูเลือกระดับชั้น หมวด จำนวนกระดาน เวลา หัวใจ และคำใบ้ได้ จัดกลุ่มถูกได้ 100 คะแนน โบนัสเวลาสูงสุด 50 คะแนน ใช้คำใบ้หัก 25 คะแนน ส่วนคำตอบผิดเสียหัวใจโดยชุดเดิมไม่เสียซ้ำ พร้อมสรุปคะแนน เวลา ความแม่นยำ หมวดที่พลาด และคำศัพท์ที่ควรทบทวน',
  'ภาษาอังกฤษ',
  array['p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[],
  'web_app',
  'https://word-squad-vocabulary-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/word-squad.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'จัดหมวดหมู่', 'คิดวิเคราะห์', 'Synonyms', 'Antonyms', 'Collocations', 'Idioms']::text[],
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
    where id = 'ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8'::uuid
      and title = 'Word Squad — รวมแก๊งคำศัพท์'
      and meta = 'เว็บเกมภาษาอังกฤษ · 16 คำ/กระดาน · 4 กลุ่ม · เดี่ยว/ทีม/ทั้งห้อง · ป.2–ม.6'
      and description = 'เกมจัดกลุ่มคำศัพท์ธีมทีมสายลับสำหรับนักเรียน ป.2–ม.6 ในแต่ละกระดานมีคำ 16 คำให้ค้นหาความสัมพันธ์และจัดเป็น 4 กลุ่ม กลุ่มละ 4 คำ เลือกคำ 4 คำแล้วกดตรวจ เมื่อถูกระบบล็อกกลุ่มและเปิดชื่อหมวด เล่นได้ทั้งคนเดียว 2 คน 2–4 ทีม หรือทั้งห้อง มีชุดเนื้อหาที่ตรวจสอบแล้ว ครอบคลุม Animals, Food, School, Verbs, Adjectives, Synonyms, Antonyms, Collocations และ Idioms โดยไม่สร้างคำแบบอิสระ ครูเลือกระดับชั้น หมวด จำนวนกระดาน เวลา หัวใจ และคำใบ้ได้ จัดกลุ่มถูกได้ 100 คะแนน โบนัสเวลาสูงสุด 50 คะแนน ใช้คำใบ้หัก 25 คะแนน ส่วนคำตอบผิดเสียหัวใจโดยชุดเดิมไม่เสียซ้ำ พร้อมสรุปคะแนน เวลา ความแม่นยำ หมวดที่พลาด และคำศัพท์ที่ควรทบทวน'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p2', 'p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://word-squad-vocabulary-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/word-squad.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'จัดหมวดหมู่', 'คิดวิเคราะห์', 'Synonyms', 'Antonyms', 'Collocations', 'Idioms']::text[]
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
    raise exception 'Existing Word Squad resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'ace15fc3-a6da-46b6-b3bc-bdfdd8f7b5c8'::uuid
  ) then
    raise exception 'Public Word Squad must not have plan-specific grants';
  end if;
end;
$$;
