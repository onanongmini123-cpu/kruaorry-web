-- Publish Electric Circuit Lab as a free science resource that requires a
-- permanent KruAorry account. KruAorry stores only safe catalogue metadata
-- and the production Site URL; the Site does not collect pupil identities.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'c3a21758-8338-4f8f-a77e-42e7a6cf3eca'::uuid
      and (
        lower(btrim(title)) = lower(btrim('ห้องทดลองวงจรไฟฟ้า'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-electric-circuit-lab-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Electric Circuit Lab title or target already belongs to another resource';
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
  'c3a21758-8338-4f8f-a77e-42e7a6cf3eca'::uuid,
  'ห้องทดลองวงจรไฟฟ้า',
  'สื่อวิทยาศาสตร์โต้ตอบ · วงจรพื้นฐาน/อนุกรม/ขนาน · ตัวนำ–ฉนวน · 6 ภารกิจ · ป.4–ม.3',
  'ห้องทดลองวิทยาศาสตร์แบบโต้ตอบสำหรับ ป.4–ม.3 ให้นักเรียนประกอบวงจรพื้นฐาน วงจรอนุกรม และวงจรขนานจากแบตเตอรี่ 3 โวลต์ สวิตช์ หลอดไฟ และสายไฟ แล้วเปิด–ปิดหน้าสัมผัสเพื่อสังเกตทิศทางกระแส ค่ากระแส และความสว่างของหลอด เปรียบเทียบวัสดุ 8 ชนิดเพื่อจำแนกตัวนำกับฉนวน มีระดับการแสดงผลสำหรับประถมและมัธยม ภารกิจซ่อมและคำถาม 6 ด่าน คำใบ้ทีละขั้น และคู่มือครูสำหรับกิจกรรม 30–45 นาที ใช้เป็นแบบจำลองแนวคิด ไม่เก็บชื่อหรือข้อมูลเด็ก และย้ำให้การทดลองจริงใช้ถ่านแรงดันต่ำเท่านั้น ไม่ใช้ไฟบ้าน',
  'วิทยาศาสตร์',
  array['p4', 'p5', 'p6', 'm1', 'm2', 'm3']::text[],
  'web_app',
  'https://kru-electric-circuit-lab-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/electric-circuit-lab.jpg',
  array['วิทยาศาสตร์', 'วงจรไฟฟ้า', 'การทดลอง', 'อนุกรม', 'ขนาน', 'ตัวนำและฉนวน', 'กิจกรรมโต้ตอบ', 'ป.4–ม.3']::text[],
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
    where id = 'c3a21758-8338-4f8f-a77e-42e7a6cf3eca'::uuid
      and title = 'ห้องทดลองวงจรไฟฟ้า'
      and meta = 'สื่อวิทยาศาสตร์โต้ตอบ · วงจรพื้นฐาน/อนุกรม/ขนาน · ตัวนำ–ฉนวน · 6 ภารกิจ · ป.4–ม.3'
      and description = 'ห้องทดลองวิทยาศาสตร์แบบโต้ตอบสำหรับ ป.4–ม.3 ให้นักเรียนประกอบวงจรพื้นฐาน วงจรอนุกรม และวงจรขนานจากแบตเตอรี่ 3 โวลต์ สวิตช์ หลอดไฟ และสายไฟ แล้วเปิด–ปิดหน้าสัมผัสเพื่อสังเกตทิศทางกระแส ค่ากระแส และความสว่างของหลอด เปรียบเทียบวัสดุ 8 ชนิดเพื่อจำแนกตัวนำกับฉนวน มีระดับการแสดงผลสำหรับประถมและมัธยม ภารกิจซ่อมและคำถาม 6 ด่าน คำใบ้ทีละขั้น และคู่มือครูสำหรับกิจกรรม 30–45 นาที ใช้เป็นแบบจำลองแนวคิด ไม่เก็บชื่อหรือข้อมูลเด็ก และย้ำให้การทดลองจริงใช้ถ่านแรงดันต่ำเท่านั้น ไม่ใช้ไฟบ้าน'
      and category = 'วิทยาศาสตร์'
      and grade_levels = array['p4', 'p5', 'p6', 'm1', 'm2', 'm3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-electric-circuit-lab-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/electric-circuit-lab.jpg'
      and tags = array['วิทยาศาสตร์', 'วงจรไฟฟ้า', 'การทดลอง', 'อนุกรม', 'ขนาน', 'ตัวนำและฉนวน', 'กิจกรรมโต้ตอบ', 'ป.4–ม.3']::text[]
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
    raise exception 'Existing Electric Circuit Lab resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'c3a21758-8338-4f8f-a77e-42e7a6cf3eca'::uuid
  ) then
    raise exception 'Authenticated Electric Circuit Lab must not have plan-specific grants';
  end if;
end;
$$;
