-- Publish the external Ice Cream Math learning game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue
-- metadata and uses the existing resource target resolver for the public URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'a6bdbe60-2672-45ba-8773-bab8cd700ef4'::uuid
      and (
        lower(btrim(title)) = lower(btrim('ไอศกรีมคิดเลข'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-ice-cream-math-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Ice Cream Math title or target already belongs to another resource';
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
  'a6bdbe60-2672-45ba-8773-bab8cd700ef4'::uuid,
  'ไอศกรีมคิดเลข',
  'เว็บเกมคณิตศาสตร์ · บวก–ลบ · 3 ระดับ · 10 ข้อ · เดี่ยว/คู่ · ป.1–3',
  'เกมฝึกบวก–ลบในคาเฟ่ไอศกรีมพาสเทลสำหรับนักเรียนประถมต้น เล่นได้ทั้งคนเดียวหรือคู่ผลัดกันตอบบนเครื่องเดียว เกมละ 10 ข้อ โดยระบบสร้างโจทย์และคำนวณคำตอบจริง เลือกระดับง่ายช่วง 0–20 ระดับกลาง 0–100 หรือระดับยาก 0–1,000 พร้อมเลือกบวก ลบ หรือแบบผสม โดยไม่สร้างผลลบติดลบ มีคำตอบ 3 ตัวเลือกที่ไม่ซ้ำกัน ลากหรือแตะลูกไอศกรีมลงโคน ตอบถูกครั้งแรกได้ 10 คะแนน หากผิดดูภาพวิธีคิดและลองใหม่ได้ 5 คะแนน พร้อมโหมดฝึกไม่คิดคะแนน ทุก 3 ชั้นเสิร์ฟหนึ่งถ้วย และหน้าผลลัพธ์แยกคะแนน จำนวนถ้วย และข้อที่ควรฝึกเพิ่มอย่างชัดเจน',
  'คณิตศาสตร์',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  'https://kru-ice-cream-math-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/ice-cream-math.jpg',
  array['เกม', 'คณิตศาสตร์', 'บวก', 'ลบ', 'คิดเลข', 'ประถมต้น', 'ไอศกรีม']::text[],
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
    where id = 'a6bdbe60-2672-45ba-8773-bab8cd700ef4'::uuid
      and title = 'ไอศกรีมคิดเลข'
      and meta = 'เว็บเกมคณิตศาสตร์ · บวก–ลบ · 3 ระดับ · 10 ข้อ · เดี่ยว/คู่ · ป.1–3'
      and description = 'เกมฝึกบวก–ลบในคาเฟ่ไอศกรีมพาสเทลสำหรับนักเรียนประถมต้น เล่นได้ทั้งคนเดียวหรือคู่ผลัดกันตอบบนเครื่องเดียว เกมละ 10 ข้อ โดยระบบสร้างโจทย์และคำนวณคำตอบจริง เลือกระดับง่ายช่วง 0–20 ระดับกลาง 0–100 หรือระดับยาก 0–1,000 พร้อมเลือกบวก ลบ หรือแบบผสม โดยไม่สร้างผลลบติดลบ มีคำตอบ 3 ตัวเลือกที่ไม่ซ้ำกัน ลากหรือแตะลูกไอศกรีมลงโคน ตอบถูกครั้งแรกได้ 10 คะแนน หากผิดดูภาพวิธีคิดและลองใหม่ได้ 5 คะแนน พร้อมโหมดฝึกไม่คิดคะแนน ทุก 3 ชั้นเสิร์ฟหนึ่งถ้วย และหน้าผลลัพธ์แยกคะแนน จำนวนถ้วย และข้อที่ควรฝึกเพิ่มอย่างชัดเจน'
      and category = 'คณิตศาสตร์'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-ice-cream-math-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/ice-cream-math.jpg'
      and tags = array['เกม', 'คณิตศาสตร์', 'บวก', 'ลบ', 'คิดเลข', 'ประถมต้น', 'ไอศกรีม']::text[]
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
    raise exception 'Existing Ice Cream Math resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'a6bdbe60-2672-45ba-8773-bab8cd700ef4'::uuid
  ) then
    raise exception 'Public Ice Cream Math must not have plan-specific grants';
  end if;
end;
$$;
