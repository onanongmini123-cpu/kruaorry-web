-- Publish the external Bingo Fun learning game for everyone, including
-- signed-out visitors. KruAorry stores only safe catalogue metadata and uses
-- the existing resource target resolver for the public game URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '03ae013c-1409-4cb1-aa7c-ce264a94312a'::uuid
      and (
        lower(btrim(title)) = lower(btrim('บิงโกหรรษา'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-bingo-fun-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Bingo Fun title or target already belongs to another resource';
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
  '03ae013c-1409-4cb1-aa7c-ce264a94312a'::uuid,
  'บิงโกหรรษา',
  'เว็บเกมบิงโก · 3 ชุด · เดี่ยวและทั้งห้อง · กระดาน 3×3/4×4 · 1–40 ใบ · ป.1–3',
  'เกมบิงโกงานวัดความรู้สำหรับเล่นเดี่ยวบนอุปกรณ์หรือเล่นทั้งห้องจากจอครูหนึ่งจอ เลือกชุดตัวเลข 1–30 คำศัพท์สัตว์อย่างน้อย 24 คำ หรือผลบวกอย่างน้อย 24 ค่า โหมดเดี่ยวใช้กระดาน 3×3 แตะคำตอบจากคำใบ้และขอเฉลยช่วยได้ ส่วนโหมดครูฉายจอสร้างกระดาน 3×3 หรือ 4×4 ได้ 1–40 ใบพร้อมรหัสและสั่งพิมพ์ ครูสุ่มรายการแบบไม่ซ้ำ ดูประวัติ และกรอกรหัสเพื่อตรวจรายการที่เรียกก่อนยืนยันผู้ชนะ ระบบไม่อ้างว่าอ่านรอยทำเครื่องหมายบนกระดาษได้',
  'คณิตศาสตร์และภาษาอังกฤษ',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  'https://kru-bingo-fun-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/bingo-fun.jpg',
  array['เกม', 'บิงโก', 'คณิตศาสตร์', 'ภาษาอังกฤษ', 'กิจกรรมทั้งห้อง']::text[],
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
    where id = '03ae013c-1409-4cb1-aa7c-ce264a94312a'::uuid
      and title = 'บิงโกหรรษา'
      and meta = 'เว็บเกมบิงโก · 3 ชุด · เดี่ยวและทั้งห้อง · กระดาน 3×3/4×4 · 1–40 ใบ · ป.1–3'
      and description = 'เกมบิงโกงานวัดความรู้สำหรับเล่นเดี่ยวบนอุปกรณ์หรือเล่นทั้งห้องจากจอครูหนึ่งจอ เลือกชุดตัวเลข 1–30 คำศัพท์สัตว์อย่างน้อย 24 คำ หรือผลบวกอย่างน้อย 24 ค่า โหมดเดี่ยวใช้กระดาน 3×3 แตะคำตอบจากคำใบ้และขอเฉลยช่วยได้ ส่วนโหมดครูฉายจอสร้างกระดาน 3×3 หรือ 4×4 ได้ 1–40 ใบพร้อมรหัสและสั่งพิมพ์ ครูสุ่มรายการแบบไม่ซ้ำ ดูประวัติ และกรอกรหัสเพื่อตรวจรายการที่เรียกก่อนยืนยันผู้ชนะ ระบบไม่อ้างว่าอ่านรอยทำเครื่องหมายบนกระดาษได้'
      and category = 'คณิตศาสตร์และภาษาอังกฤษ'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-bingo-fun-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/bingo-fun.jpg'
      and tags = array['เกม', 'บิงโก', 'คณิตศาสตร์', 'ภาษาอังกฤษ', 'กิจกรรมทั้งห้อง']::text[]
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
    raise exception 'Existing Bingo Fun resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '03ae013c-1409-4cb1-aa7c-ce264a94312a'::uuid
  ) then
    raise exception 'Public Bingo Fun must not have plan-specific grants';
  end if;
end;
$$;
