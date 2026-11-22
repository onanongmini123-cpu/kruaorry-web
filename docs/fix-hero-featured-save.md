# แก้: บันทึก "สื่อแนะนำใน Hero" ขึ้น "DELETE requires a WHERE clause"

## สาเหตุ
- โค้ดเว็บไม่มี DELETE เอง หน้าแอดมินเรียกฟังก์ชัน SQL `set_featured_resources` (ไฟล์ `src/app/admin/page.tsx`)
- ในฟังก์ชันนั้น (migration 028 บรรทัด `delete from public.featured_resources;`) ไม่มี `WHERE`
- คำขอที่มาทาง API ของ Supabase รันด้วยตัวป้องกัน **pg_safeupdate** (ตั้งไว้ที่ role `authenticator`:
  `session_preload_libraries = supautils, safeupdate` ยืนยันบน staging) ซึ่งปฏิเสธ DELETE/UPDATE ที่ไม่มี WHERE
  แม้อยู่ในฟังก์ชัน SECURITY DEFINER → บันทึกล้มและข้อมูลเดิมไม่เปลี่ยน (ตรงกับที่เห็น)
- 058 และ 060 เขียน `where true` อยู่แล้ว จึงไม่มีปัญหา ตรวจทุก migration แล้วไม่พบ DELETE/UPDATE ไม่มี WHERE ในฟังก์ชันอื่น

## เกิดตอนไหน
- โค้ดผิดอยู่ตั้งแต่ migration 028 (25 ก.ย.) **ไม่ได้เกิดจาก PR #45, #47, #48 หรือ migration 058–060** (ไม่มีไฟล์ใดแตะฟังก์ชันนี้)
- ผมไม่ได้อ่านฐานจริง จึงบอกไม่ได้ว่าเมื่อไหร่ที่ตัวป้องกันเริ่มมีผลกับฟังก์ชันนี้ และเคยบันทึกสำเร็จได้หรือไม่ (ค่า 5/5 ที่ตั้งไว้อาจมาจากการลงด้วย SQL Editor ซึ่งไม่ผ่านตัวป้องกัน)
  ฟังก์ชันบน staging ตรงกับ migration 028 ทุกตัวอักษร ซึ่งบ่งว่าฐานจริงก็เหมือนกัน

## วิธีแก้
- ต้องแก้ที่ฟังก์ชัน SQL (โค้ดเว็บไม่ต้องแก้) → migration **064** เปลี่ยนบรรทัดเดียวเป็น `delete from public.featured_resources where true;`
- ทั้งฟังก์ชันเป็นธุรกรรมเดียว: ถ้า insert พลาด การลบถูกย้อนคืน รายการเดิมยังอยู่
- ตรวจ (ห้ามผ่าน, ไม่ใช่ลบก่อนตรวจ): ทุกเงื่อนไข (เกิน 5, ซ้ำ, ไม่ได้เผยแพร่, null) ปฏิเสธก่อนถึงคำสั่งลบ รายการจึงไม่ถูกทำให้ว่างโดยการบันทึกที่ถูกปฏิเสธ
- ไฟล์: `supabase/migrations/20261014100000_064_set_featured_resources_where.sql` · rollback · `supabase/verification/064-verify.sql` (3 แถว ต้อง `ok = true`) · ทดสอบ `npm run test:featured-resources-sql`
- เทสต์กันซ้ำ: `src/lib/__tests__/functionBodiesHaveWhere.test.ts` สแกนทุก migration ว่าไม่มี DELETE/UPDATE ไม่มี WHERE ในฟังก์ชัน

## ลงและตรวจ (Codex/ครูกดเอง)
```bash
supabase migration list            # 064 ต้องมีเฉพาะฝั่ง Local
supabase db push --dry-run         # ต้องเห็นเฉพาะ 064
```
1. ลงที่ staging ก่อน รัน `064-verify.sql` (3 แถว true) แล้วเข้าหน้าแอดมินบน Preview กด "บันทึก" ที่แท็บสื่อแนะนำ ต้องขึ้นว่าบันทึกแล้ว
2. ค่อยลงฐานจริง และกดบันทึกอีกครั้ง
- ย้อนกลับ: ไฟล์ rollback + `supabase migration repair --status reverted 20261014100000` (คืนเป็นข้อความเดิมของ 028 ซึ่งจะกลับมามีบั๊ก)
- ระบบบัญชีถ้าจะใช้ ต้องเปลี่ยนเลข migration เป็น **065 และ 066**
