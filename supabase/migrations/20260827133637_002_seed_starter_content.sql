insert into public.plans (id, name, price_label, note, features, sort_order) values
  ('free', 'ฟรี', '0 บาท', 'เริ่มต้นใช้งานสื่อพื้นฐาน', array['สื่อพร้อมสอนบางส่วน', 'เครื่องมือในห้องเรียนพื้นฐาน'], 1),
  ('plus', 'Plus', '99 บาท/เดือน', 'ปลดล็อกคลังสื่อและ AI', array['คลังสื่อพร้อมสอนทั้งหมด', 'เครื่องมือ AI ออกข้อสอบ/แผนการสอน', 'เครื่องมือในห้องเรียนครบชุด'], 2),
  ('lifetime', 'Lifetime', '1,990 บาท ครั้งเดียว', 'จ่ายครั้งเดียว ใช้ได้ตลอดไป', array['สิทธิ์เท่ากับแพ็ก Plus', 'อัปเดตฟีเจอร์ใหม่ตลอดไป', 'ไม่มีค่าใช้จ่ายรายเดือน'], 3);

insert into public.resources (title, meta, description, category, delivery_mode, cta_url, cover_image_url, status, published_at) values
  ('ใบงานคณิตศาสตร์ ป.4 พร้อมสอน', 'เอกสาร Google Docs · คณิตศาสตร์', 'ใบงานพร้อมเฉลย ทำสำเนาแล้วปรับแก้ได้ทันที', 'คณิตศาสตร์', 'google_template', 'https://docs.google.com/document/d/placeholder/copy', 'https://images.unsplash.com/photo-1509228468518-180dd4864904?w=800', 'published', now()),
  ('ตัวจับเวลากิจกรรมในห้องเรียน', 'เว็บแอป · เครื่องมือห้องเรียน', 'จับเวลากิจกรรม สุ่มชื่อ และจับกลุ่มนักเรียนได้ในเว็บเดียว', 'เครื่องมือห้องเรียน', 'web_app', 'https://example.com/classroom-timer', 'https://images.unsplash.com/photo-1501139083538-0139583c060f?w=800', 'published', now()),
  ('แบบประเมินความพึงพอใจผู้ปกครอง', 'Google Form · แบบประเมิน', 'เก็บผลตอบรับจากผู้ปกครองอัตโนมัติ พร้อมสรุปผลใน Sheets', 'แบบประเมิน', 'google_form', 'https://forms.gle/placeholder', 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800', 'published', now());
