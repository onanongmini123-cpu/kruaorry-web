-- STAGING ONLY (project bqgzmlujxtucojforjff). NEVER run on the live project.
-- Inserts DATA only (no schema change). Every row is titled "[TEST] ..." so
-- supabase/seeds/staging-test-cleanup.sql can remove exactly these rows.
-- Safe to run more than once (it clears its own [TEST] rows first).
--
-- Files that must be uploaded by hand in the Supabase Dashboard -> Storage
-- (SQL cannot create file bytes):
--   bucket resource-covers, folder previews/ : test-pro-file-1.png, test-pro-file-2.png
--   bucket resource-files,  folder ffffffff-0000-4000-8000-000000000004/ : test-pro-file-1.pdf
-- (source files: supabase/seeds/assets/). Until they are uploaded the preview
-- pictures show as broken and the Pro file download cannot open.

do $guard$
begin
  -- The staging project's own test owner exists only there.
  if not exists (select 1 from public.profiles where email = 'admin-70efa2be-e742-4321-a2b9-e3a1f629a3ed@example.com') then
    raise exception 'This is not the staging database. Aborting.';
  end if;
end
$guard$;

delete from public.resources where title like '[TEST]%';
delete from public.homepage_videos where title like '[TEST]%';

insert into public.resources
  (id, title, meta, description, delivery_mode, cta_url, cover_image_url, status, published_at,
   is_free, access_mode, grade_levels, slug, youtube_video_id, file_path, file_name, file_size, file_mime_type)
values
  ('ffffffff-0000-4000-8000-000000000001', '[TEST] เกม Pro 1 (มีวิดีโอ)', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'web_app',
   'https://www.wikipedia.org/#test-pro-game-1', 'https://kruaorry-web.vercel.app/images/resources/bingo-fun.jpg', 'published', now() - interval '1 day',
   false, 'plans', array['p4'], 'test-pro-game-1', 'M7lc1UVf-VE', null, null, null, null),
  ('ffffffff-0000-4000-8000-000000000002', '[TEST] เกม Pro 2', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'web_app',
   'https://www.wikipedia.org/#test-pro-game-2', 'https://kruaorry-web.vercel.app/images/resources/mission-wheel.jpg', 'published', now() - interval '2 days',
   false, 'plans', array['p5'], 'test-pro-game-2', null, null, null, null, null),
  ('ffffffff-0000-4000-8000-000000000003', '[TEST] เทมเพลต Pro', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'google_template',
   'https://docs.google.com/document/d/TEST-ONLY/copy', 'https://kruaorry-web.vercel.app/images/resources/sentence-train.jpg', 'published', now() - interval '3 days',
   false, 'plans', array['p3'], 'test-pro-template', null, null, null, null, null),
  ('ffffffff-0000-4000-8000-000000000004', '[TEST] ไฟล์ดาวน์โหลด Pro', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'file_download',
   null, 'https://kruaorry-web.vercel.app/images/resources/vocab-fishing.jpg', 'published', now() - interval '4 days',
   false, 'plans', array['p6'], 'test-pro-file', null, 'ffffffff-0000-4000-8000-000000000004/test-pro-file-1.pdf', 'test-pro-file-1.pdf', 400, 'application/pdf'),
  ('ffffffff-0000-4000-8000-000000000005', '[TEST] สื่อฟรี 1', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'web_app',
   'https://www.wikipedia.org/#test-free-1', 'https://kruaorry-web.vercel.app/images/resources/vocab-defuse.jpg', 'published', now() - interval '5 hours',
   true, 'public', array['p1'], 'test-free-1', null, null, null, null, null),
  ('ffffffff-0000-4000-8000-000000000006', '[TEST] สื่อฟรี 2', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'web_app',
   'https://www.wikipedia.org/#test-free-2', 'https://kruaorry-web.vercel.app/images/resources/treasure-chest.jpg', 'published', now() - interval '4 hours',
   true, 'public', array['p2'], 'test-free-2', null, null, null, null, null),
  ('ffffffff-0000-4000-8000-000000000007', '[TEST] สื่อฟรี 3', 'ทดสอบ', 'สื่อทดสอบ ใช้ตรวจ Preview เท่านั้น', 'web_app',
   'https://www.wikipedia.org/#test-free-3', 'https://kruaorry-web.vercel.app/images/resources/picture-word-match.jpg', 'published', now() - interval '3 hours',
   true, 'public', array['p3'], 'test-free-3', null, null, null, null, null);

-- Pro resources are usable by the paid plans (same plans as the existing Pro sample).
insert into public.resource_plan_access (resource_id, plan_id)
select r.id, p.plan_id
from public.resources r
cross join (values ('founder'), ('teacher'), ('teacher_pro'), ('plus'), ('lifetime')) as p(plan_id)
where r.title like '[TEST]%' and r.access_mode = 'plans'
on conflict do nothing;

-- Two watermarked preview pictures for the Pro download (files uploaded by hand, see header).
insert into public.resource_previews (resource_id, position, image_url) values
  ('ffffffff-0000-4000-8000-000000000004', 1, 'https://bqgzmlujxtucojforjff.supabase.co/storage/v1/object/public/resource-covers/previews/test-pro-file-1.png'),
  ('ffffffff-0000-4000-8000-000000000004', 2, 'https://bqgzmlujxtucojforjff.supabase.co/storage/v1/object/public/resource-covers/previews/test-pro-file-2.png');

-- One homepage video.
insert into public.homepage_videos (position, youtube_video_id, title)
values (1, 'M7lc1UVf-VE', '[TEST] คลิปแนะนำหน้าแรก')
on conflict (position) do update set youtube_video_id = excluded.youtube_video_id, title = excluded.title;

-- Ranking material: three hearts from the staging owner, and anonymous daily views.
insert into public.saved_resources (user_id, resource_id)
select p.id, r.id from public.profiles p, public.resources r
where p.email = 'admin-70efa2be-e742-4321-a2b9-e3a1f629a3ed@example.com'
  and r.id in ('ffffffff-0000-4000-8000-000000000005','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000007')
on conflict do nothing;

insert into public.resource_view_daily (resource_id, viewer_key, view_date)
select r.id, md5('test-viewer-' || r.id::text || n::text), (now() at time zone 'Asia/Bangkok')::date
from public.resources r, generate_series(1, 4) n
where r.id in ('ffffffff-0000-4000-8000-000000000001','ffffffff-0000-4000-8000-000000000005','ffffffff-0000-4000-8000-000000000006','ffffffff-0000-4000-8000-000000000007')
on conflict do nothing;
