delete from public.plans where id = 'lifetime';

update public.plans set
  price_label = '990 บาท/ปี',
  note = 'ต่ออายุทุกปี ยกเลิกได้ทุกเมื่อ',
  features = array['คลังสื่อพร้อมสอนทั้งหมด', 'เครื่องมือ AI ออกข้อสอบ/แผนการสอน (มีโควตาต่อเดือน)', 'เครื่องมือในห้องเรียนครบชุด']
where id = 'plus';
