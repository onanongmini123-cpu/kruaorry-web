# แผนขึ้นฐานจริง 061 → 062 (ครูกดเองทุกขั้น)

**ทำหลัง 058–060 ขึ้นจริงและตรวจผ่านแล้วเท่านั้น** (ดู `docs/production-rollout-058-060.md`)
062 ต้องมี 058 อยู่ก่อน

สถานะ: เขียนและทดสอบบน PGlite แล้ว (`npm run test:promo-banners-sql`, `npm run test:homepage-videos-four-sql`)
**ยังไม่ได้ลงที่ staging หรือฐานจริง** ให้ลงที่ staging (`bqgzmlujxtucojforjff`) และซ้อม rollback ก่อน แล้วค่อยขึ้นฐานจริง (`ghwpmtmbqtchsrnagoir`)

| เลข | ทำอะไร | ผลต่อของเดิม |
| --- | --- | --- |
| 061 | ตารางใหม่ `promo_banners` + ฟังก์ชัน `admin_set_promo_banners` สำหรับแบนเนอร์หน้าแรก | เพิ่มของใหม่อย่างเดียว ไม่แตะตารางหรือสิทธิ์เดิม |
| 062 | ขยายวิดีโอหน้าแรกจาก 3 เป็น 4 ช่อง (แก้เงื่อนไข `position` และฟังก์ชัน `admin_set_homepage_videos`) | วิดีโอ 1–3 ที่มีอยู่ไม่เปลี่ยน ไม่แก้ไฟล์ 058 |

แอปอ่านแบบกันพัง: ยังไม่ลง 061 = ไม่มีแบนเนอร์ (ส่วนนี้ถูกซ่อน) ยังไม่ลง 062 = ช่องวิดีโอที่ 4 บันทึกไม่ได้ จึงลงโค้ดก่อนหรือหลังก็ได้

> เลข 061 และ 062 ถูกใช้แล้ว ถ้าจะนำ branch ระบบบัญชี (`claude/wonderful-planck-dixufx`) มาใช้ ต้องเปลี่ยนเลข migration ของ branch นั้นเป็น **063 และ 064**
> (timestamp ใหม่ที่ตามหลัง `20261013100000`) พร้อมไฟล์ rollback และ verify ให้ตรงกัน

## ก่อนเริ่ม (ทำครั้งเดียว)
1. ยืนยันว่า 058–060 อยู่บนฐานจริงแล้ว และ `supabase/verification/058-verify.sql` … `060-verify.sql` ผ่านทุกแถว
2. ยืนยันฐานที่จะลง **ทุกครั้งก่อนกดคำสั่ง**: ต้องเป็น `ghwpmtmbqtchsrnagoir`
   ```bash
   supabase link --project-ref ghwpmtmbqtchsrnagoir
   supabase migration list
   ```
   ต้องเห็น 001–060 ครบทั้งสองฝั่ง และ 061–062 มีเฉพาะฝั่ง Local ถ้าไม่ตรง **หยุด**
3. สำรองข้อมูล เก็บไฟล์ไว้นอก repo และสร้าง backup ในหน้า Supabase Dashboard อีกชั้น
   ```bash
   supabase db dump --linked -f backup-before-061.sql
   ```
4. เลือกเวลาที่คนใช้น้อย (ไฟล์ตั้ง `lock_timeout` 5 วินาที ถ้าติดล็อกจะล้มเองโดยไม่ทำอะไร แค่รันใหม่)

## ตัวที่ 1: 061 แบนเนอร์ประชาสัมพันธ์
- dry-run: `supabase db push --dry-run` ต้องเห็นเฉพาะ `20261013090000_061_promo_banners.sql` ถ้ามีไฟล์อื่น **หยุด**
- ติดตั้ง: `supabase db push`
- ตรวจ: วาง `supabase/verification/061-verify.sql` ใน SQL Editor ทุกแถว `ok = true` (5 แถว)
- ตรวจด้วยมือบนเว็บ (Preview หรือเว็บจริง):
  1. เข้าหน้าแอดมิน เพิ่มแบนเนอร์ 1 อัน (รูปคอม + ข้อความ alt + ลิงก์ `/resources`) กด "บันทึกแบนเนอร์"
  2. หน้าแรกต้องขึ้นแบนเนอร์ทันที (ระบบล้างแคชให้) และกดแล้วไปหน้าที่ตั้งไว้
  3. ลองปิดสวิตช์ "แสดงบนหน้าแรก" แล้วบันทึก หน้าแรกต้องซ่อนส่วนแบนเนอร์
  4. ลองใส่ลิงก์ `javascript:alert(1)` ต้องบันทึกไม่ได้ และขึ้นข้อความภาษาไทย
- ย้อนกลับ: วาง `supabase/rollbacks/20261013090000_061_promo_banners.rollback.sql` ทั้งไฟล์ (ธุรกรรมเดียว) แล้วบันทึก ledger
  `supabase migration repair --status reverted 20261013090000`
  (แถวแบนเนอร์ที่บันทึกไว้หาย ไฟล์รูปใน Storage ไม่ถูกแตะ)
- หลัง rollback `061-verify.sql` จะคืน `ok = false` ทุกแถว (ไม่ error) ถือว่าลบสะอาด หน้าแรกกลับไปซ่อนส่วนแบนเนอร์เอง

## ตัวที่ 2: 062 วิดีโอหน้าแรก 4 ช่อง (ทำเมื่อ 061 ผ่านแล้ว)
- สำรอง: `supabase db dump --linked -f backup-before-062.sql`
- dry-run: ต้องเห็นเฉพาะ `20261013100000_062_homepage_videos_four.sql`
- ติดตั้ง: `supabase db push`
- ตรวจ: `supabase/verification/062-verify.sql` ทุกแถว `ok = true` (4 แถว)
  แล้วในหน้าแอดมินใส่วิดีโอ 4 ช่องแล้วบันทึก หน้าแรกต้องแสดง 4 คลิป (2x2 บนคอม แถวเลื่อนบนมือถือ)
  ลองใส่คลิปซ้ำ ต้องขึ้น "วิดีโอที่ N: วิดีโอนี้ซ้ำกับช่องที่ X" และไม่บันทึก
- ย้อนกลับ: `supabase/rollbacks/20261013100000_062_homepage_videos_four.rollback.sql` แล้ว
  `supabase migration repair --status reverted 20261013100000`
  **ข้อควรระวัง:** วิดีโอช่องที่ 4 (ถ้ามี) จะถูกลบ ส่งออกก่อนด้วย `select * from public.homepage_videos where position = 4;`
  วิดีโอ 1–3 อยู่ครบ

## ถ้าลงด้วย SQL Editor แทน `db push`
วางไฟล์ migration **ทั้งไฟล์** รันครั้งเดียว แล้วบันทึกว่าลงแล้ว (ไม่รัน SQL ซ้ำ):
```bash
supabase migration repair --status applied 20261013090000   # 061
supabase migration repair --status applied 20261013100000   # 062
```
หลังทุกคำสั่ง repair ให้รัน `supabase migration list` ว่าสองฝั่งตรงกัน

## เมื่อไหร่ต้องหยุดและย้อนกลับ
- dry-run แสดงไฟล์ที่ไม่ใช่ตัวที่ตั้งใจ → หยุด ยังไม่ต้องย้อน
- ไฟล์ตรวจมีแถว `ok = false` หลังติดตั้ง → รัน rollback ของตัวนั้น + repair reverted แล้วแจ้งผม
- หน้าแรกหรือหน้าแอดมินพังหลังลง → rollback ตัวล่าสุดที่ลง (หน้าแรกอ่านแบบกันพัง จึงควรแค่ซ่อนส่วนใหม่)

## หมายเหตุ
- คำสั่ง `migration repair` ตามวิธีเดียวกับ `docs/production-rollout-058-060.md` และ `docs/pr-27-handoff.md`
- ผมยังไม่ได้ลง 061/062 ที่ staging จึงยังไม่เคยรัน verify กับฐานจริงของโปรเจกต์ ผลที่มีคือทดสอบบน PGlite เท่านั้น
