-- Publish the external Sentence Train learning game for everyone,
-- including signed-out visitors. KruAorry stores only safe catalogue
-- metadata and uses the existing resource target resolver for the public URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '427fb64e-34e0-4f8b-be0e-ee5131e78060'::uuid
      and (
        lower(btrim(title)) = lower(btrim('รถไฟเรียงประโยค'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://kru-sentence-train-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Sentence Train title or target already belongs to another resource';
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
  '427fb64e-34e0-4f8b-be0e-ee5131e78060'::uuid,
  'รถไฟเรียงประโยค',
  'เว็บเกมภาษาอังกฤษ · 150 ประโยค · 5 หัวข้อ · 3 ระดับ · เดี่ยว/คู่ · ป.1–3',
  'เกมฝึกเรียงคำภาษาอังกฤษในสถานีรถไฟแสนสนุกสำหรับนักเรียนประถมต้น มีคลัง 150 ประโยค ครบคำทักทาย แนะนำตัว สี สิ่งของ และสัตว์ พร้อมระดับง่าย 3–4 คำ ระดับกลาง 5–6 คำ และระดับยาก 7–8 คำ เล่นได้ทั้งคนเดียวหรือคู่ร่วมมือบนเครื่องเดียว เลือกเล่น 5 หรือ 10 ข้อ จัดตู้คำด้วยการลากหรือแตะบนมือถือ ตรวจลำดับจากรหัสคำที่แน่นอน แสดงตัวพิมพ์ใหญ่และเครื่องหมายวรรคตอนอัตโนมัติ พร้อมโหมดสาธิต คะแนนครั้งแรก 10 คะแนน ครั้งที่สอง 5 คะแนน และดูเฉลยได้ 0 คะแนน',
  'ภาษาอังกฤษ',
  array['p1', 'p2', 'p3']::text[],
  'web_app',
  'https://kru-sentence-train-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/sentence-train.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'ประโยค', 'ไวยากรณ์', 'คำทักทาย', 'สี', 'สิ่งของ', 'สัตว์']::text[],
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
    where id = '427fb64e-34e0-4f8b-be0e-ee5131e78060'::uuid
      and title = 'รถไฟเรียงประโยค'
      and meta = 'เว็บเกมภาษาอังกฤษ · 150 ประโยค · 5 หัวข้อ · 3 ระดับ · เดี่ยว/คู่ · ป.1–3'
      and description = 'เกมฝึกเรียงคำภาษาอังกฤษในสถานีรถไฟแสนสนุกสำหรับนักเรียนประถมต้น มีคลัง 150 ประโยค ครบคำทักทาย แนะนำตัว สี สิ่งของ และสัตว์ พร้อมระดับง่าย 3–4 คำ ระดับกลาง 5–6 คำ และระดับยาก 7–8 คำ เล่นได้ทั้งคนเดียวหรือคู่ร่วมมือบนเครื่องเดียว เลือกเล่น 5 หรือ 10 ข้อ จัดตู้คำด้วยการลากหรือแตะบนมือถือ ตรวจลำดับจากรหัสคำที่แน่นอน แสดงตัวพิมพ์ใหญ่และเครื่องหมายวรรคตอนอัตโนมัติ พร้อมโหมดสาธิต คะแนนครั้งแรก 10 คะแนน ครั้งที่สอง 5 คะแนน และดูเฉลยได้ 0 คะแนน'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p1', 'p2', 'p3']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://kru-sentence-train-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/sentence-train.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'ประโยค', 'ไวยากรณ์', 'คำทักทาย', 'สี', 'สิ่งของ', 'สัตว์']::text[]
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
    raise exception 'Existing Sentence Train resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '427fb64e-34e0-4f8b-be0e-ee5131e78060'::uuid
  ) then
    raise exception 'Public Sentence Train must not have plan-specific grants';
  end if;
end;
$$;
