-- The original starter-content migration published three demonstration rows
-- before their destinations existed. A later manual production smoke test also
-- left one explicitly named test row published. Keep all four rows available
-- for an admin to finish, but do not advertise placeholders or test content as
-- released resources.
--
-- Match the complete immutable seed signature (title, delivery mode, target,
-- and the seed-only NULL creator), so later resources and corrected seed rows
-- are left untouched.  Re-running this migration is safe: only rows that are
-- still published qualify.
update public.resources as resource
set
  status = 'draft',
  published_at = null
from (
  values
    (
      'ใบงานคณิตศาสตร์ ป.4 พร้อมสอน'::text,
      'google_template'::text,
      'https://docs.google.com/document/d/placeholder/copy'::text
    ),
    (
      'ตัวจับเวลากิจกรรมในห้องเรียน'::text,
      'web_app'::text,
      'https://example.com/classroom-timer'::text
    ),
    (
      'แบบประเมินความพึงพอใจผู้ปกครอง'::text,
      'google_form'::text,
      'https://forms.gle/placeholder'::text
    )
) as seed(title, delivery_mode, cta_url)
where resource.title = seed.title
  and resource.delivery_mode = seed.delivery_mode
  and resource.cta_url = seed.cta_url
  and resource.created_by is null
  and resource.status = 'published';

-- This UUID is the single live smoke-test resource found during the read-only
-- release audit. Match its full current signature so a corrected row, a copied
-- resource, or unrelated admin content is never demoted by this cleanup.
update public.resources
set
  status = 'draft',
  published_at = null
where id = 'f9438548-f8b2-4496-a18a-0acd6e69d879'::uuid
  and title = 'สื่อทดสอบระบบ (มีรูปปก) 28 ส.ค. 2569'
  and delivery_mode = 'web_app'
  and cta_url = 'https://kruaorry-web.vercel.app/'
  and created_by is not null
  and status = 'published';
