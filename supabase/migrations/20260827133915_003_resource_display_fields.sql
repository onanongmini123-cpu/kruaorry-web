alter table public.resources
  add column tags text[] not null default '{}',
  add column is_free boolean not null default true;

update public.resources set tags = array['เกม','ทบทวนบทเรียน'], is_free = true
  where title = 'ตัวจับเวลากิจกรรมในห้องเรียน';
update public.resources set tags = array['เอกสาร','คณิตศาสตร์'], is_free = false
  where title = 'ใบงานคณิตศาสตร์ ป.4 พร้อมสอน';
update public.resources set tags = array['แบบฟอร์ม','ผู้ปกครอง'], is_free = true
  where title = 'แบบประเมินความพึงพอใจผู้ปกครอง';
