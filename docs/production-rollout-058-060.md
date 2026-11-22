# แผนขึ้นฐานจริง 058 → 059 → 060 (ครูกดเองทุกขั้น)

สถานะ: ซ้อมบน staging (`bqgzmlujxtucojforjff`) ครบแล้ว — ลงทั้ง 3 ไฟล์, ไฟล์ตรวจผ่าน (058 6/6, 059 5/5, 060 4/4),
ซ้อม rollback + repair + ลงกลับผ่าน **ฐานจริง (`ghwpmtmbqtchsrnagoir`) ยังไม่ถูกแตะ**

ทั้งสามไฟล์ "เพิ่มของใหม่อย่างเดียว" ไม่แก้แถวเดิม ราคา สิทธิ์ หรือขั้นตอนอนุมัติสมาชิก
แอปอ่านแบบกันพัง: ถ้ายังไม่ลง migration ฟีเจอร์ใหม่แค่ไม่แสดง จึงลงโค้ดก่อนหรือหลังก็ได้

## ก่อนเริ่ม (ทำครั้งเดียว)
1. ยืนยันว่า release ที่รวม main ล่าสุดผ่านการตรวจบน Preview แล้ว (ดู `docs/release-checklist-batch-1.md`)
2. ยืนยันฐานที่จะลง **ทุกครั้งก่อนกดคำสั่ง**: ต้องเป็น `ghwpmtmbqtchsrnagoir`
   ```bash
   supabase link --project-ref ghwpmtmbqtchsrnagoir
   supabase migration list
   ```
   ต้องเห็น 001–057 ครบทั้งสองฝั่ง และ 058–060 มีเฉพาะฝั่ง Local ถ้าไม่ตรง **หยุด**
3. สำรองข้อมูล เก็บไฟล์ไว้นอก repo และสร้าง backup ในหน้า Supabase Dashboard อีกชั้น
   ```bash
   supabase db dump --linked -f backup-before-058.sql
   ```
4. เลือกเวลาที่คนใช้น้อย (ไฟล์ตั้ง `lock_timeout` 5 วินาที ถ้าติดล็อกจะล้มเองโดยไม่ทำอะไร แค่รันใหม่)

## ตัวที่ 1: 058 วิดีโอวิธีเล่น (แตะ view `resource_catalog` จึงทำก่อนและตรวจละเอียด)
- สำรอง: ขั้น 3 ด้านบน
- dry-run: `supabase db push --dry-run` ต้องเห็นเฉพาะ `20261010090000_058_resource_youtube_video.sql` ถ้ามีไฟล์อื่น **หยุด**
- ติดตั้ง: `supabase db push`
- ตรวจ: วาง `supabase/verification/058-verify.sql` ใน SQL Editor ทุกแถว `ok = true` (6 แถว)
  แล้วเปิดหน้าแรก, `/resources`, หน้าสื่อ 1–2 ชิ้น ต้องเปิดได้ปกติ และหัวใจที่เคยกดยังอยู่
- ย้อนกลับ: วาง `supabase/rollbacks/20261010090000_058_resource_youtube_video.rollback.sql` ทั้งไฟล์ (ธุรกรรมเดียว)
  แล้วบันทึก ledger: `supabase migration repair --status reverted 20261010090000`
  ห้ามลบ/สร้าง `resource_catalog` เอง ถ้ามีลิงก์วิดีโอที่ใส่แล้ว ให้ส่งออกก่อนตามคำสั่งในหัวไฟล์ rollback

## ตัวที่ 2: 059 ภาพตัวอย่างมีลายน้ำ (ทำเมื่อ 058 ผ่านแล้ว)
- สำรอง: `supabase db dump --linked -f backup-before-059.sql`
- dry-run: ต้องเห็นเฉพาะ `20261011090000_059_resource_previews.sql`
- ติดตั้ง: `supabase db push`
- ตรวจ: `supabase/verification/059-verify.sql` ทุกแถว `ok = true` (5 แถว) แล้วตรวจข้อ 3–8 ในเช็กลิสต์
- ย้อนกลับ: `supabase/rollbacks/20261011090000_059_resource_previews.rollback.sql` แล้ว
  `supabase migration repair --status reverted 20261011090000` (ลิงก์รูปตัวอย่างที่บันทึกไว้หาย ไฟล์ใน Storage ไม่ถูกแตะ)

## ตัวที่ 3: 060 อันดับหน้าแรก (ทำเมื่อ 059 ผ่านแล้ว)
- สำรอง: `supabase db dump --linked -f backup-before-060.sql`
- dry-run: ต้องเห็นเฉพาะ `20261012090000_060_homepage_rankings.sql`
- ติดตั้ง: `supabase db push`
- ตรวจ: `supabase/verification/060-verify.sql` ทุกแถว `ok = true` (4 แถว) แล้วตรวจข้อ 1, 2, 4 และ 12 ในเช็กลิสต์
- ย้อนกลับ: `supabase/rollbacks/20261012090000_060_homepage_rankings.rollback.sql` แล้ว
  `supabase migration repair --status reverted 20261012090000` (ข้อมูลยอดดูที่เก็บไว้หาย)
- หลัง rollback ไฟล์ `060-verify.sql` จะคืน `ok = false` ทุกแถว (ไม่ error) ถือว่าลบสะอาด

## ถ้าลงด้วย SQL Editor แทน `db push`
วางไฟล์ migration **ทั้งไฟล์** รันครั้งเดียว แล้วบันทึกว่าลงแล้ว (ไม่รัน SQL ซ้ำ):
```bash
supabase migration repair --status applied 20261010090000   # 058
supabase migration repair --status applied 20261011090000   # 059
supabase migration repair --status applied 20261012090000   # 060
```
หลังทุกคำสั่ง repair ให้รัน `supabase migration list` ว่าสองฝั่งตรงกัน

## เมื่อไหร่ต้องหยุดและย้อนกลับ
- dry-run แสดงไฟล์ที่ไม่ใช่ตัวที่ตั้งใจ → หยุด ยังไม่ต้องย้อน
- ไฟล์ตรวจมีแถว `ok = false` หลังติดตั้ง → รัน rollback ของตัวนั้น + repair reverted แล้วแจ้งผม
- หน้าแรก, `/resources`, หรือการเปิดสื่อพัง → rollback ตัวล่าสุดที่ลง

## หมายเหตุ
- คำสั่ง `migration repair` ในเอกสารนี้เขียนตามวิธีที่ใช้ใน `docs/pr-27-handoff.md` (applied หลังลงด้วยมือ,
  reverted หลัง rollback) ผมไม่ได้เห็นข้อสรุปของ Codex จึงให้ครูเทียบกับของ Codex ก่อนใช้จริง
- ข้อมูลทดสอบบน staging: `supabase/seeds/staging-test-data.sql` (ลง) และ `staging-test-cleanup.sql` (ลบเฉพาะแถว `[TEST]`) **ห้ามรันบนฐานจริง**
