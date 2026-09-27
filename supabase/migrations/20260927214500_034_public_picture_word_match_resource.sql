-- Publish the external Picture-to-Word Match learning game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue metadata
-- and uses the existing resource target resolver for the public game URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> 'fa15179e-9937-4d25-951c-7af9ab466589'::uuid
      and (
        lower(btrim(title)) = lower(btrim('จับคู่ภาพกับคำ'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-picture-word-match-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Picture-to-Word Match title or target already belongs to another resource';
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
  'fa15179e-9937-4d25-951c-7af9ab466589'::uuid,
  'จับคู่ภาพกับคำ',
  'เว็บเกมคำศัพท์ · 24 คู่ · 3 หมวด · เดี่ยว/2 คน · 4/6/8 คู่ · ป.1–3',
  'เกมจับคู่การ์ดภาพกับคำศัพท์อังกฤษบนอุปกรณ์เดียว เลือกสัตว์ ผลไม้ หรือสิ่งของในห้องเรียน และเล่นได้ทั้งคนเดียวหรือ 2 คนผลัดกัน ระบบเปิดการ์ดครั้งละ 2 ใบ ตรวจคู่ด้วยรหัสที่แน่นอน ล็อกการเปิดระหว่างปิดการ์ดที่ไม่ตรง และจัดคะแนนหรือเปลี่ยนตาอัตโนมัติ เลือกความยาก 4, 6 หรือ 8 คู่ ระดับง่ายมีคำแปล ส่วนระดับกลางและยากฝึกจำคำศัพท์ พร้อมสรุปจำนวนครั้งที่เปิด ความแม่นยำ เวลา และคำที่จับคู่ครบโดยไม่ใช้ข้อความตัดสินความฉลาด',
  'ภาษาอังกฤษ',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  'https://kru-picture-word-match-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/picture-word-match.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'จับคู่', 'ประถมต้น']::text[],
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
    where id = 'fa15179e-9937-4d25-951c-7af9ab466589'::uuid
      and title = 'จับคู่ภาพกับคำ'
      and meta = 'เว็บเกมคำศัพท์ · 24 คู่ · 3 หมวด · เดี่ยว/2 คน · 4/6/8 คู่ · ป.1–3'
      and description = 'เกมจับคู่การ์ดภาพกับคำศัพท์อังกฤษบนอุปกรณ์เดียว เลือกสัตว์ ผลไม้ หรือสิ่งของในห้องเรียน และเล่นได้ทั้งคนเดียวหรือ 2 คนผลัดกัน ระบบเปิดการ์ดครั้งละ 2 ใบ ตรวจคู่ด้วยรหัสที่แน่นอน ล็อกการเปิดระหว่างปิดการ์ดที่ไม่ตรง และจัดคะแนนหรือเปลี่ยนตาอัตโนมัติ เลือกความยาก 4, 6 หรือ 8 คู่ ระดับง่ายมีคำแปล ส่วนระดับกลางและยากฝึกจำคำศัพท์ พร้อมสรุปจำนวนครั้งที่เปิด ความแม่นยำ เวลา และคำที่จับคู่ครบโดยไม่ใช้ข้อความตัดสินความฉลาด'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-picture-word-match-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/picture-word-match.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'จับคู่', 'ประถมต้น']::text[]
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
    raise exception 'Existing Picture-to-Word Match resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = 'fa15179e-9937-4d25-951c-7af9ab466589'::uuid
  ) then
    raise exception 'Public Picture-to-Word Match must not have plan-specific grants';
  end if;
end;
$$;
