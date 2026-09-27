-- Publish the server-hosted Quick Race game for every real signed-in
-- KruAorry account, including Free. The executable bundle is intentionally
-- absent from public Storage and the public web root; the fixed CTA is served
-- only by a server route that re-resolves this exact resource before returning
-- any game bytes.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '70c9b34d-00d8-4524-b9c5-766b45c7152a'::uuid
      and (
        lower(btrim(title)) = lower(btrim('รถแข่งตอบไว'))
        or cta_url = '/app/games/quick-race'
      )
  ) then
    raise exception 'Quick Race resource title or target already belongs to another row';
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
  '70c9b34d-00d8-4524-b9c5-766b45c7152a'::uuid,
  'รถแข่งตอบไว',
  'เว็บเกม · 2–4 ทีม · ป.1–3',
  'เกมตอบคำถามแบบทีม เลือก 5 หรือ 10 รอบ มีคณิตศาสตร์ จำนวนและแบบรูป และคำศัพท์อังกฤษ 2 ระดับ พร้อมเวลาไม่จำกัด 15 หรือ 30 วินาที ทุกทีมได้ตอบเท่ากัน ตอบถูกได้ 2 คะแนน และมีรอบพิเศษหนึ่งครั้งเมื่อคะแนนเสมอ',
  'เกมการศึกษา',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  '/app/games/quick-race',
  'https://kruaorry-web.vercel.app/images/resources/quick-race-quiz.jpg',
  array['เกม', 'ทบทวนบทเรียน', 'คณิตศาสตร์', 'ภาษาอังกฤษ']::text[],
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
    where id = '70c9b34d-00d8-4524-b9c5-766b45c7152a'::uuid
      and title = 'รถแข่งตอบไว'
      and meta = 'เว็บเกม · 2–4 ทีม · ป.1–3'
      and description = 'เกมตอบคำถามแบบทีม เลือก 5 หรือ 10 รอบ มีคณิตศาสตร์ จำนวนและแบบรูป และคำศัพท์อังกฤษ 2 ระดับ พร้อมเวลาไม่จำกัด 15 หรือ 30 วินาที ทุกทีมได้ตอบเท่ากัน ตอบถูกได้ 2 คะแนน และมีรอบพิเศษหนึ่งครั้งเมื่อคะแนนเสมอ'
      and category = 'เกมการศึกษา'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = '/app/games/quick-race'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/quick-race-quiz.jpg'
      and tags = array['เกม', 'ทบทวนบทเรียน', 'คณิตศาสตร์', 'ภาษาอังกฤษ']::text[]
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
    raise exception 'Existing Quick Race resource does not match the protected system contract';
  end if;

  if exists (
    select 1 from public.resource_plan_access
    where resource_id = '70c9b34d-00d8-4524-b9c5-766b45c7152a'::uuid
  ) then
    raise exception 'Quick Race must not have plan-specific grants';
  end if;
end;
$$;
