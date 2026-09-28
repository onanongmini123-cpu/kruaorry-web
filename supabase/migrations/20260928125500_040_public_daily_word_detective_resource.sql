-- Publish the external Daily Word Detective spelling and vocabulary game for
-- everyone, including signed-out visitors. KruAorry stores only safe catalogue
-- metadata and uses the existing resource target resolver for the public URL.

do $$
begin
  if exists (
    select 1
    from public.resources
    where id <> '4136ab94-76c8-43c7-a622-37ed9f41b167'::uuid
      and (
        lower(btrim(title)) = lower(btrim('Daily Word Detective'))
        or regexp_replace(btrim(cta_url), '/+$', '') = 'https://daily-word-detective-2026.onanongmini123.chatgpt.site'
      )
  ) then
    raise exception 'Daily Word Detective title or target already belongs to another resource';
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
  '4136ab94-76c8-43c7-a622-37ed9f41b167'::uuid,
  'Daily Word Detective',
  'เว็บเกมภาษาอังกฤษ · 180 คำ · 3–8 ตัวอักษร · เดี่ยว/เพื่อน/ทั้งห้อง · ป.3–ม.6',
  'เกมสืบสวนคำศัพท์ประจำวันสำหรับนักเรียน ป.3–ม.6 ฝึกการสะกดคำ คำศัพท์ การวิเคราะห์ตำแหน่งตัวอักษร และการใช้เหตุผล ผู้เล่นเดาคำลับยาว 3–8 ตัวอักษร โดยระบบใช้สี สัญลักษณ์ และข้อความกำกับเพื่อบอกว่าตัวอักษรถูกตำแหน่ง อยู่ผิดตำแหน่ง หรือไม่มีในคำ มีคลังคำเป้าหมายที่ตรวจแล้ว 180 คำและพจนานุกรมคำที่อนุญาต 598 คำ รองรับเล่นคนเดียว เทียบผลกับเพื่อน หรือให้ทั้งห้องเล่นพร้อมกัน ครูตั้งระดับ หมวด ความยาว จำนวนครั้ง เวลา และคำใบ้ได้ เริ่ม 600 คะแนน เดาผิดหัก 75 คะแนน ใช้คำใบ้หัก 100 คะแนน และถูกครั้งแรกโบนัส 200 คะแนน หลังจบแสดงความหมาย คำอ่าน ประโยคตัวอย่าง และ streak โดยเก็บสถิติเฉพาะในอุปกรณ์และไม่เก็บชื่อเด็ก',
  'ภาษาอังกฤษ',
  array['p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[],
  'web_app',
  'https://daily-word-detective-2026.onanongmini123.chatgpt.site',
  'https://kruaorry-web.vercel.app/images/resources/daily-word-detective.jpg',
  array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'สะกดคำ', 'คิดวิเคราะห์', 'Word Detective', 'คำศัพท์ประจำวัน']::text[],
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
    where id = '4136ab94-76c8-43c7-a622-37ed9f41b167'::uuid
      and title = 'Daily Word Detective'
      and meta = 'เว็บเกมภาษาอังกฤษ · 180 คำ · 3–8 ตัวอักษร · เดี่ยว/เพื่อน/ทั้งห้อง · ป.3–ม.6'
      and description = 'เกมสืบสวนคำศัพท์ประจำวันสำหรับนักเรียน ป.3–ม.6 ฝึกการสะกดคำ คำศัพท์ การวิเคราะห์ตำแหน่งตัวอักษร และการใช้เหตุผล ผู้เล่นเดาคำลับยาว 3–8 ตัวอักษร โดยระบบใช้สี สัญลักษณ์ และข้อความกำกับเพื่อบอกว่าตัวอักษรถูกตำแหน่ง อยู่ผิดตำแหน่ง หรือไม่มีในคำ มีคลังคำเป้าหมายที่ตรวจแล้ว 180 คำและพจนานุกรมคำที่อนุญาต 598 คำ รองรับเล่นคนเดียว เทียบผลกับเพื่อน หรือให้ทั้งห้องเล่นพร้อมกัน ครูตั้งระดับ หมวด ความยาว จำนวนครั้ง เวลา และคำใบ้ได้ เริ่ม 600 คะแนน เดาผิดหัก 75 คะแนน ใช้คำใบ้หัก 100 คะแนน และถูกครั้งแรกโบนัส 200 คะแนน หลังจบแสดงความหมาย คำอ่าน ประโยคตัวอย่าง และ streak โดยเก็บสถิติเฉพาะในอุปกรณ์และไม่เก็บชื่อเด็ก'
      and category = 'ภาษาอังกฤษ'
      and grade_levels = array['p3', 'p4', 'p5', 'p6', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6']::text[]
      and delivery_mode = 'web_app'
      and cta_url = 'https://daily-word-detective-2026.onanongmini123.chatgpt.site'
      and cover_image_url = 'https://kruaorry-web.vercel.app/images/resources/daily-word-detective.jpg'
      and tags = array['เกม', 'ภาษาอังกฤษ', 'คำศัพท์', 'สะกดคำ', 'คิดวิเคราะห์', 'Word Detective', 'คำศัพท์ประจำวัน']::text[]
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
    raise exception 'Existing Daily Word Detective resource does not match the protected catalogue contract';
  end if;

  if exists (
    select 1
    from public.resource_plan_access
    where resource_id = '4136ab94-76c8-43c7-a622-37ed9f41b167'::uuid
  ) then
    raise exception 'Public Daily Word Detective must not have plan-specific grants';
  end if;
end;
$$;
