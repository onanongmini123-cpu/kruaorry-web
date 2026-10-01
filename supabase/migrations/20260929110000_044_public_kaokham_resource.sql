-- Publish KaoKham as a free public Thai literacy learning resource. Guests
-- can use its local-only mode, while teachers can optionally share an
-- activity code; KruAorry stores only safe catalogue metadata and the Site URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '18e463f4-0117-4f0e-9fbf-921be97e5c14'::uuid
      and (
        lower(btrim(title)) = lower(btrim('ก้าวคำ — ฟัง อ่าน สะกด เขียน'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kaokham-learning-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'KaoKham title or target already belongs to another resource';
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
  '18e463f4-0117-4f0e-9fbf-921be97e5c14'::uuid,
  'ก้าวคำ — ฟัง อ่าน สะกด เขียน',
  'เว็บเรียนรู้ภาษาไทย · 6 ขั้น · ฟัง–อ่าน–สะกด–เขียน · ผู้มาเยือน/รหัสกิจกรรม · ป.1–ป.6',
  'เว็บฝึกอ่านและสะกดคำไทยด้วยตนเอง 6 ขั้นสำหรับ ป.1–ป.6 ตั้งแต่ฟัง เลือกคำ ประกอบคำ อ่าน สะกดหรือเขียน และใช้คำในประโยค มีคำใบ้ทีละขั้น ไม่หักคะแนน และแยกผลการทำได้เองจากการทำหลังลองใหม่หรือใช้คำใบ้ ผู้มาเยือนเก็บผลเฉพาะในเครื่อง ส่วนนักเรียนเข้าร่วมด้วยรหัสกิจกรรมของครูได้โดยไม่ต้องมีบัญชี ไม่มีการจัดอันดับ และเปรียบเทียบเฉพาะพัฒนาการของตนเอง',
  'ภาษาไทย',
  array['p1', 'p2', 'p3', 'p4', 'p5', 'p6']::text[],
  'web_app',
  'https://kaokham-learning-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/kaokham.jpg',
  array['ภาษาไทย', 'การอ่าน', 'สะกดคำ', 'เขียนคำ', 'เรียนรู้ด้วยตนเอง', 'ก้าวคำ', 'รหัสกิจกรรม', 'ประถมศึกษา']::text[],
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
    where id = '18e463f4-0117-4f0e-9fbf-921be97e5c14'::uuid
      and title = 'ก้าวคำ — ฟัง อ่าน สะกด เขียน'
      and meta = 'เว็บเรียนรู้ภาษาไทย · 6 ขั้น · ฟัง–อ่าน–สะกด–เขียน · ผู้มาเยือน/รหัสกิจกรรม · ป.1–ป.6'
      and description = 'เว็บฝึกอ่านและสะกดคำไทยด้วยตนเอง 6 ขั้นสำหรับ ป.1–ป.6 ตั้งแต่ฟัง เลือกคำ ประกอบคำ อ่าน สะกดหรือเขียน และใช้คำในประโยค มีคำใบ้ทีละขั้น ไม่หักคะแนน และแยกผลการทำได้เองจากการทำหลังลองใหม่หรือใช้คำใบ้ ผู้มาเยือนเก็บผลเฉพาะในเครื่อง ส่วนนักเรียนเข้าร่วมด้วยรหัสกิจกรรมของครูได้โดยไม่ต้องมีบัญชี ไม่มีการจัดอันดับ และเปรียบเทียบเฉพาะพัฒนาการของตนเอง'
      and category = 'ภาษาไทย'
      and grade_levels = array['p1', 'p2', 'p3', 'p4', 'p5', 'p6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kaokham-learning-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/kaokham.jpg'
      and tags = array['ภาษาไทย', 'การอ่าน', 'สะกดคำ', 'เขียนคำ', 'เรียนรู้ด้วยตนเอง', 'ก้าวคำ', 'รหัสกิจกรรม', 'ประถมศึกษา']::text[]
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
    raise exception 'Existing KaoKham resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '18e463f4-0117-4f0e-9fbf-921be97e5c14'::uuid
  ) then
    raise exception 'Public KaoKham must not have plan-specific grants';
  end if;
end;
$$;
