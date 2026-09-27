-- Publish the external Treasure Chest classroom game for everyone, including
-- signed-out visitors. KruAorry stores only safe catalogue metadata and uses
-- the existing resource target resolver for the public game URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '4c1203ce-6e4f-40bd-8dc2-01713e88dcdd'::uuid
      and (
        lower(btrim(title)) = lower(btrim('เปิดหีบสมบัติ'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-treasure-chest-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Treasure Chest title or target already belongs to another resource';
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
  '4c1203ce-6e4f-40bd-8dc2-01713e88dcdd'::uuid,
  'เปิดหีบสมบัติ',
  'เว็บเกมทีม · 120 ข้อ · คณิตศาสตร์และอังกฤษ · 3 ระดับ · 2–4 ทีม · ป.1–6',
  'เกมตอบคำถามสะสมเหรียญสำหรับ 2–4 ทีมบนจอเดียว เลือกหมวดคณิตศาสตร์หรือภาษาอังกฤษ แล้วเปิดหีบง่าย กลาง หรือยาก โดยเห็นรางวัล 10/20/30 เหรียญก่อนเลือก ตอบผิดได้ 0 พร้อมเฉลยและเหตุผล ทุกทีมเลือกหีบได้ครบทุกระดับในทุกตา เล่นครบจำนวนตาเท่ากันก่อนตัดสิน และชนะร่วมกันเมื่อคะแนนเสมอ ไม่มีการสุ่มรางวัล หักคะแนน หรือขโมยคะแนน',
  'คณิตศาสตร์และภาษาอังกฤษ',
  array['p1', 'p2', 'p3', 'p4', 'p5', 'p6']::text[],
  'web_app',
  'https://kru-treasure-chest-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/treasure-chest.jpg',
  array['เกม', 'คณิตศาสตร์', 'ภาษาอังกฤษ', 'ประถมศึกษา', 'กิจกรรมกลุ่ม']::text[],
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
    where id = '4c1203ce-6e4f-40bd-8dc2-01713e88dcdd'::uuid
      and title = 'เปิดหีบสมบัติ'
      and meta = 'เว็บเกมทีม · 120 ข้อ · คณิตศาสตร์และอังกฤษ · 3 ระดับ · 2–4 ทีม · ป.1–6'
      and description = 'เกมตอบคำถามสะสมเหรียญสำหรับ 2–4 ทีมบนจอเดียว เลือกหมวดคณิตศาสตร์หรือภาษาอังกฤษ แล้วเปิดหีบง่าย กลาง หรือยาก โดยเห็นรางวัล 10/20/30 เหรียญก่อนเลือก ตอบผิดได้ 0 พร้อมเฉลยและเหตุผล ทุกทีมเลือกหีบได้ครบทุกระดับในทุกตา เล่นครบจำนวนตาเท่ากันก่อนตัดสิน และชนะร่วมกันเมื่อคะแนนเสมอ ไม่มีการสุ่มรางวัล หักคะแนน หรือขโมยคะแนน'
      and category = 'คณิตศาสตร์และภาษาอังกฤษ'
      and grade_levels = array['p1', 'p2', 'p3', 'p4', 'p5', 'p6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-treasure-chest-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/treasure-chest.jpg'
      and tags = array['เกม', 'คณิตศาสตร์', 'ภาษาอังกฤษ', 'ประถมศึกษา', 'กิจกรรมกลุ่ม']::text[]
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
    raise exception 'Existing Treasure Chest resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '4c1203ce-6e4f-40bd-8dc2-01713e88dcdd'::uuid
  ) then
    raise exception 'Public Treasure Chest must not have plan-specific grants';
  end if;
end;
$$;
