-- The original starter-content migration published three demonstration rows
-- before their destinations existed.  Keep the rows available for an admin to
-- finish, but do not advertise broken placeholder links as released content.
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
