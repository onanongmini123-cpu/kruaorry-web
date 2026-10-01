-- Publish Ecosystem Guardians as a free science teaching resource that
-- requires a permanent KruAorry account. KruAorry stores only safe catalogue
-- metadata and the production Site URL; learning progress remains on-device.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'a7b13975-7244-4a8a-8b33-efc8f04bca89'::uuid
      and (
        lower(btrim(title)) = lower(btrim('ผู้พิทักษ์ระบบนิเวศ — Ecosystem Guardians'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-ecosystem-guardians-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Ecosystem Guardians title or target already belongs to another resource';
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
  'a7b13975-7244-4a8a-8b33-efc8f04bca89'::uuid,
  'ผู้พิทักษ์ระบบนิเวศ — Ecosystem Guardians',
  'สื่อวิทยาศาสตร์โต้ตอบ · 4 ระบบนิเวศ · โซ่อาหาร–สายใยอาหาร · 8 ขั้น · ป.4–6',
  'สื่อการสอนวิทยาศาสตร์แบบโต้ตอบสำหรับ ป.4–ป.6 ใช้เวลา 40–50 นาที พาผู้เรียนทำภารกิจ 8 ขั้นในป่า บ่อน้ำจืด ทุ่งหญ้า และพื้นที่เกษตร ตั้งแต่สำรวจและจำแนกผู้ผลิต ผู้บริโภค และผู้ย่อยสลาย ต่อโซ่อาหารและสายใยอาหารด้วยลูกศรจากอาหารไปยังผู้บริโภค ทดลองปรับตัวแปรเพื่อดูแนวโน้มประชากร วิเคราะห์สาเหตุ และเลือกแผนฟื้นฟูภายใต้งบประมาณ ก่อนทำแบบทบทวน 5/8/10 ข้อ ครูปรับระดับ จำนวนสิ่งมีชีวิต เวลา คำใบ้ คำบรรยาย เสียงธรรมชาติ กราฟ และคำอธิบายได้ มีทั้งโหมดเรียนรู้และโหมดท้าทาย รองรับการลากและการแตะ คีย์บอร์ด และการลดการเคลื่อนไหว พร้อมคู่มือครูและแผนย่อ 25–30 นาที โดยเก็บความคืบหน้าเฉพาะในอุปกรณ์และไม่เก็บชื่อเด็ก',
  'วิทยาศาสตร์',
  array['p4', 'p5', 'p6']::text[],
  'web_app',
  'https://kru-ecosystem-guardians-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/ecosystem-guardians.jpg',
  array['สื่อการสอน', 'ภาพจำลอง', 'มีภารกิจ', 'มีแบบทบทวน', 'โซ่อาหาร', 'สายใยอาหาร', 'ระบบนิเวศ']::text[],
  true,
  'published',
  now(),
  'authenticated',
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
    where id = 'a7b13975-7244-4a8a-8b33-efc8f04bca89'::uuid
      and title = 'ผู้พิทักษ์ระบบนิเวศ — Ecosystem Guardians'
      and meta = 'สื่อวิทยาศาสตร์โต้ตอบ · 4 ระบบนิเวศ · โซ่อาหาร–สายใยอาหาร · 8 ขั้น · ป.4–6'
      and description = 'สื่อการสอนวิทยาศาสตร์แบบโต้ตอบสำหรับ ป.4–ป.6 ใช้เวลา 40–50 นาที พาผู้เรียนทำภารกิจ 8 ขั้นในป่า บ่อน้ำจืด ทุ่งหญ้า และพื้นที่เกษตร ตั้งแต่สำรวจและจำแนกผู้ผลิต ผู้บริโภค และผู้ย่อยสลาย ต่อโซ่อาหารและสายใยอาหารด้วยลูกศรจากอาหารไปยังผู้บริโภค ทดลองปรับตัวแปรเพื่อดูแนวโน้มประชากร วิเคราะห์สาเหตุ และเลือกแผนฟื้นฟูภายใต้งบประมาณ ก่อนทำแบบทบทวน 5/8/10 ข้อ ครูปรับระดับ จำนวนสิ่งมีชีวิต เวลา คำใบ้ คำบรรยาย เสียงธรรมชาติ กราฟ และคำอธิบายได้ มีทั้งโหมดเรียนรู้และโหมดท้าทาย รองรับการลากและการแตะ คีย์บอร์ด และการลดการเคลื่อนไหว พร้อมคู่มือครูและแผนย่อ 25–30 นาที โดยเก็บความคืบหน้าเฉพาะในอุปกรณ์และไม่เก็บชื่อเด็ก'
      and category = 'วิทยาศาสตร์'
      and grade_levels = array['p4', 'p5', 'p6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-ecosystem-guardians-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/ecosystem-guardians.jpg'
      and tags = array['สื่อการสอน', 'ภาพจำลอง', 'มีภารกิจ', 'มีแบบทบทวน', 'โซ่อาหาร', 'สายใยอาหาร', 'ระบบนิเวศ']::text[]
      and is_free = true
      and status = 'published'
      and published_at is not null
      and access_mode = 'authenticated'
      and file_path is null
      and file_name is null
      and file_size is null
      and file_mime_type is null
      and created_by is null
  ) then
    raise exception 'Existing Ecosystem Guardians resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'a7b13975-7244-4a8a-8b33-efc8f04bca89'::uuid
  ) then
    raise exception 'Authenticated Ecosystem Guardians must not have plan-specific grants';
  end if;
end;
$$;
