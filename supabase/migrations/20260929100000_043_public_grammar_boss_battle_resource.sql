-- Publish the external Grammar Boss Battle English grammar game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue metadata
-- and uses the existing resource target resolver for the public Site URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'f14855b7-3a39-4f59-85b9-06dde698d4d4'::uuid
      and (
        lower(btrim(title)) = lower(btrim('Grammar Boss Battle — ศึกบอสไวยากรณ์'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://grammar-boss-battle-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Grammar Boss Battle title or target already belongs to another resource';
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
  'f14855b7-3a39-4f59-85b9-06dde698d4d4'::uuid,
  'Grammar Boss Battle — ศึกบอสไวยากรณ์',
  'เว็บเกมภาษาอังกฤษ · 576 ข้อ · 6 หัวข้อไวยากรณ์ · เดี่ยว/2–4 ทีม/ทั้งห้อง · ป.3–ม.6',
  'เกมฝึกไวยากรณ์ภาษาอังกฤษธีมฮีโร่ร่วมมือปราบบอสคำผิดสำหรับนักเรียน ป.3–ม.6 เล่นได้ทั้งคนเดียว 2–4 ทีม หรือทั้งห้องร่วมมือบนจอเดียว มีคลังคำถามที่ตรวจสอบแล้ว 576 ข้อ ครบ Parts of Speech, Articles, Pronouns, Subject–Verb Agreement, Tenses และ Error Correction พร้อม 4 ช่วงระดับ ครูเลือกหัวข้อ จำนวนตา เวลา 20/30 วินาทีหรือไม่จับเวลา และความแข็งแรงของบอสได้ ตอบถูกได้ 100 คะแนน ความเสียหายพื้นฐาน 10 หน่วย และโบนัสคอมโบ จากนั้นเลือกพลังโจมตี ป้องกัน หรือเพิ่มคะแนนให้เพื่อนด้วยผลคงที่ไม่สุ่ม ตอบผิดไม่หักคะแนนและบอสไม่เสียพลัง พร้อมคำอธิบายทุกข้อ ระบบซ่อนโจทย์จนกดพร้อม จัดตาให้ทุกทีมเท่ากันก่อนตัดสิน ชนะร่วมกันเมื่อพลังบอสหมด ส่วนโหมดแข่งขันตัดสินจากความเสียหายรวมและรองรับผู้ชนะร่วมเมื่อเสมอ พร้อมสรุปคะแนน ความแม่นยำรายหัวข้อ คอมโบ และหัวข้อที่ควรสอนซ้ำ โดยไม่เก็บชื่อเด็กและเลือกเก็บเฉพาะผลล่าสุดในอุปกรณ์ได้',
  'ภาษาอังกฤษ',
  array['p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[],
  'web_app',
  'https://grammar-boss-battle-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/grammar-boss-battle.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'ไวยากรณ์', 'Grammar Boss Battle', 'Parts of Speech', 'Tenses', 'Error Correction', 'กิจกรรมทีม']::text[],
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
    where id = 'f14855b7-3a39-4f59-85b9-06dde698d4d4'::uuid
      and title = 'Grammar Boss Battle — ศึกบอสไวยากรณ์'
      and meta = 'เว็บเกมภาษาอังกฤษ · 576 ข้อ · 6 หัวข้อไวยากรณ์ · เดี่ยว/2–4 ทีม/ทั้งห้อง · ป.3–ม.6'
      and description = 'เกมฝึกไวยากรณ์ภาษาอังกฤษธีมฮีโร่ร่วมมือปราบบอสคำผิดสำหรับนักเรียน ป.3–ม.6 เล่นได้ทั้งคนเดียว 2–4 ทีม หรือทั้งห้องร่วมมือบนจอเดียว มีคลังคำถามที่ตรวจสอบแล้ว 576 ข้อ ครบ Parts of Speech, Articles, Pronouns, Subject–Verb Agreement, Tenses และ Error Correction พร้อม 4 ช่วงระดับ ครูเลือกหัวข้อ จำนวนตา เวลา 20/30 วินาทีหรือไม่จับเวลา และความแข็งแรงของบอสได้ ตอบถูกได้ 100 คะแนน ความเสียหายพื้นฐาน 10 หน่วย และโบนัสคอมโบ จากนั้นเลือกพลังโจมตี ป้องกัน หรือเพิ่มคะแนนให้เพื่อนด้วยผลคงที่ไม่สุ่ม ตอบผิดไม่หักคะแนนและบอสไม่เสียพลัง พร้อมคำอธิบายทุกข้อ ระบบซ่อนโจทย์จนกดพร้อม จัดตาให้ทุกทีมเท่ากันก่อนตัดสิน ชนะร่วมกันเมื่อพลังบอสหมด ส่วนโหมดแข่งขันตัดสินจากความเสียหายรวมและรองรับผู้ชนะร่วมเมื่อเสมอ พร้อมสรุปคะแนน ความแม่นยำรายหัวข้อ คอมโบ และหัวข้อที่ควรสอนซ้ำ โดยไม่เก็บชื่อเด็กและเลือกเก็บเฉพาะผลล่าสุดในอุปกรณ์ได้'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://grammar-boss-battle-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/grammar-boss-battle.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'ไวยากรณ์', 'Grammar Boss Battle', 'Parts of Speech', 'Tenses', 'Error Correction', 'กิจกรรมทีม']::text[]
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
    raise exception 'Existing Grammar Boss Battle resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'f14855b7-3a39-4f59-85b9-06dde698d4d4'::uuid
  ) then
    raise exception 'Public Grammar Boss Battle must not have plan-specific grants';
  end if;
end;
$$;
