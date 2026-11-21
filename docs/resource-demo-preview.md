# ทดลองเล่น/ดูตัวอย่าง (resource demo) — คู่มือส่งมอบ

ไม่ได้ apply migration กับฐานจริง/staging, ไม่ deploy, ไม่แตะ DNS/Cloudflare/ราคา/สิทธิ์สมาชิก
(ไฟล์ `คู่มือ-kru-games-พร้อมเดโม-2026-11-21.md` บน Mac อ่านจาก cloud session ไม่ได้ — ใช้ข้อกำหนดจากข้อความงานแทน)

## สิ่งที่เพิ่ม
- แอดมิน “จัดการสื่อ → แก้ไข” มีส่วน **ทดลองเล่น/ดูตัวอย่าง**: ไม่มี / URL เดโม (เก็บใน `resources.demo_url` แยกจาก `cta_url`/`file_path`) ใช้ dirty guard และข้อความไทยเดิม
- หน้า `/resources/[key]` ที่เผยแพร่แล้ว: ปุ่ม **ทดลองเล่น** ให้ทุกคน (เปิดแท็บใหม่ `noopener noreferrer`) ถ้ามีเดโม; ไม่มีเดโม = ไม่มีปุ่ม
- ฉบับเต็มไม่เปลี่ยน: `publicResourceAction`, `/api/resources/[id]/open|download`, `resolve_resource_target`, RLS, Storage `resource-files` ยังเหมือนเดิม (มีเทสต์เทียบ policy/ฟังก์ชันก่อน-หลัง)

## ความปลอดภัยของ URL
https เท่านั้น, ไม่มีรหัสผ่าน/พอร์ต, โฮสต์ต้องเป็นชื่อโดเมนสาธารณะ (ไม่ใช่ IP), บล็อก localhost, `.local/.internal/.test`, example.*, และโฮสต์ Preview/ทันเนล (`vercel.app`, `pages.dev`, `workers.dev`, `trycloudflare.com`, `ngrok`, `loca.lt`) — `games.kruaorry.com` ผ่าน
ตรวจ 3 ชั้นด้วยกฎเดียวกัน: ฟอร์มแอดมิน, DB (`resource_demo_url_is_safe` + CHECK), และตอนแสดงผล (`publicDemoUrl`) ทดสอบด้วย corpus ไฟล์เดียว `src/lib/__tests__/fixtures/demo-url-corpus.json` ทั้ง TS และ SQL
ไม่มี open redirect: ลิงก์ถูกใช้เป็น `href` ของค่าที่แอดมินบันทึกเท่านั้น ไม่ได้ประกอบจากอินพุตผู้เยี่ยมชม ไม่มี redirect ฝั่งเซิร์ฟเวอร์
กัน Pro รั่วจากความผิดพลาดของคน: DB ปฏิเสธเดโมที่เท่ากับลิงก์ฉบับเต็ม (`resources_demo_differs_from_full`), ฟอร์มเตือนว่าเดโมเปิดให้ทุกคน

## ไฟล์ตัวอย่าง: ยังไม่ทำ (เสนอ URL-only ก่อน)
- `resource-files` เป็น bucket ส่วนตัวที่ผูกสิทธิ์ (`resource_file_read_allowed`) — ใช้เก็บไฟล์ตัวอย่างสาธารณะต้อง **ผ่อนสิทธิ์** จึงไม่ทำ
- `resource-covers` เป็นสาธารณะแต่ไม่จำกัดชนิดไฟล์/ขนาด และไว้เก็บรูปปก — ไม่เหมาะ
- ทางที่ปลอดภัยคือ bucket สาธารณะใหม่ (เช่น `resource-demos`, จำกัด MIME/ขนาด, เขียนได้เฉพาะแอดมิน) = พื้นผิว Storage ใหม่ ต้องให้เจ้าของระบบตัดสินใจก่อน

## เลข migration ชนกัน (ต้องจัดลำดับก่อน merge)
ตรวจ origin เมื่อ 2026-11-21: main ล่าสุดคือ 057
| เลข | ไฟล์ | อยู่ที่ |
|---|---|---|
| 058 | `20261010090000_058_resource_youtube_video` | `release/pro-features-batch-1`, `feat/youtube-how-to-play` |
| 059 | `20261011090000_059_resource_previews` | `release/pro-features-batch-1`, `feat/try-before-buy` |
| 060 | `20261012090000_060_homepage_rankings` | `release/pro-features-batch-1`, `feat/homepage-rankings` |
| 058, 059 | `20261115…_accounting_*` (คนละเรื่อง) | `claude/wonderful-planck-dixufx` |

งานนี้จึงใช้ **061** (`20261013090000_061_resource_demo_url`) ไม่ใช้ 058 และ **ไม่แก้ `resource_catalog`** (058 ของ youtube แก้ view นี้เช่นกัน; ถ้าสองไฟล์ต่างทำ `create or replace view` จะ apply ทั้งสองลำดับไม่ได้) เดโมอ่านจาก view แยก `resource_demo_catalog`
**ลำดับที่ต้องใช้: merge/apply 058–060 ก่อน แล้วค่อย 061** (ledger ของ Supabase CLI เรียงตามเวอร์ชัน apply เวอร์ชันต่ำหลังเวอร์ชันสูงไม่ได้ถ้าไม่ใช้ `--include-all`) ทดสอบแล้วว่า 061 apply ได้บนสาย 001–057 + 058–060 ของ release branch และ `resource_catalog` ไม่เปลี่ยนแม้แต่ไบต์เดียว
แผนก่อน merge: (1) merge release batch 058–060 → (2) rebase PR นี้ ถ้า batch เปลี่ยนเลข ให้เลื่อน 061 ต่อท้ายเลขสุดท้าย (3) ชุด accounting ต้องเปลี่ยนเลขของตัวเองให้ไม่ซ้ำ (4) รัน `npm run test:resource-demo-sql` และ `test:migration-chain-sql` ใหม่ (5) apply staging → `supabase/verification/061-verify.sql` → production — **โดยเจ้าของระบบ ไม่ใช่ PR นี้**
ความซ้อนทางฟีเจอร์: 059 `try-before-buy` คือรูปพรีวิวมีลายน้ำของสื่อ Pro; งานนี้คือลิงก์เดโมเล่นได้ — ควรตัดสินใจว่าหน้ารายละเอียดจะวางสองอย่างอย่างไรเมื่อ merge รวมกัน (ปัจจุบันไม่ได้แตะไฟล์เดียวกันนอกจาก `page.tsx` และ `catalog.ts`/`data.ts` ซึ่งอาจมี conflict ข้อความ)

## เมื่อฉบับเต็มเป็น Teacher Pro — การชวนสมัคร
- เว็บหลัก: ใต้ปุ่มทดลองเล่น แสดงข้อความ + **ปุ่มลิงก์ธรรมดา** “ดูแพ็ก Teacher Pro” ที่ใช้ `membershipUpgradeHref` เดิม (`/membership?plan=teacher&returnTo=/resources/<slug>`) ไม่มี redirect อัตโนมัติ ไม่แสดงถ้ามีสิทธิ์แล้ว/มีคำขออัปเกรดค้าง/ไม่ใช่สื่อ Pro ไม่สร้างตรรกะราคาหรือสิทธิ์ใหม่
- **ตัวเกม (repo/Cloudflare อีกที่ ไม่อยู่ใน PR นี้):** หน้าชวนสมัครหลังจบรอบแรกหรือประมาณ 5 ข้อ ต้องทำในโค้ดเกมเอง ช่องแอดมินจับเวลาเกมบน Cloudflare ไม่ได้ ให้เกมแสดงปุ่ม (ไม่ redirect เอง) ชี้ไป `https://kruaorry.com/membership?plan=teacher&returnTo=%2Fresources%2F<slug>` — `returnTo` ต้องเป็นพาธ `/resources/<slug>` เท่านั้น (ผ่าน `safeUpgradeReturnPath`)
- ไฟล์ดาวน์โหลด: เมื่อมีไฟล์ตัวอย่างในอนาคต จะแสดงคำชวนสมัครบนหน้าเว็บ ไม่อ้างว่าไฟล์ในเครื่องเด้งเองได้
- หมายเหตุเดิม (ไม่ได้แก้): ถ้า URL เกมฉบับเต็มบน games.kruaorry.com เปิดได้ตรง ๆ โดยไม่ตรวจสิทธิ์ที่ตัวเกม การกั้น Pro อยู่แค่ที่ `/open` ของเว็บหลัก — ควรให้เกมตรวจเองเมื่อทำโหมดเดโมแยกจากฉบับเต็ม

## Deploy-safe
แอป/แอดมินใช้ได้บนฐานที่ยังไม่มี 061: ไม่มี view = ไม่มีเดโม, แอดมินเห็นข้อความ “ยังไม่ได้ติดตั้ง migration 061” และบันทึกสื่อด้วยช่องอื่นได้ตามปกติ
Rollback: `supabase/rollbacks/20261013090000_061_resource_demo_url.rollback.sql` (ทดสอบแล้ว, apply ซ้ำได้)

## งานค้าง (ยังไม่ทำ — จดไว้ต่อภายหลัง) · อัปเดต 2026-11-21
สถานะตอนจด: main = `38df79a`, release batch 058–060 ยังไม่ merge, PR นี้ Draft ไม่ apply DB ใด ๆ

| # | งาน | ติดอะไร / ใครทำ | ทำต่ออย่างไร |
|---|---|---|---|
| 1 | Rebase PR นี้หลัง release batch (058–060) เข้า main | รอ merge batch | แก้ conflict 6 ไฟล์ (`admin/page.tsx`, `detail.css`, `data.ts`, `catalog.ts`, `data.test.ts`, `sitemap.test.ts`) แบบเก็บทั้งสองฝั่ง; `anonCatalog(answer, previewAnswer?, demos?)`; cache key `public-catalog-v4`; `npm install` (batch เพิ่ม `qrcode`); รันชุดทดสอบเต็ม แล้ว push branch เดิม + อัปเดตตัวเลขใน PR body. เคยทดลองแล้ว: 121 ไฟล์ / 1116 เทสต์ผ่าน SQL ผ่านหมด |
| 2 | ถ้า batch เปลี่ยนเลข migration | รอ batch | ย้าย 061 (migration, rollback, verify, ชื่อใน `scripts/test-resource-demo-sql.mjs`, เอกสาร, คอมเมนต์) ให้อยู่หลังเลขสุดท้ายของ batch |
| 3 | ชุด accounting (058/059 บน `claude/wonderful-planck-dixufx`) ซ้ำเลข | เจ้าของชุดนั้น | ต้องเปลี่ยนเลขของตัวเองก่อนลงเรือ |
| 4 | ตัดสินวางปุ่มทดลองเล่นร่วมกับรูปพรีวิวลายน้ำของ 059 | เจ้าของระบบ | ตอนนี้ปุ่มอยู่ใต้การ์ดสิทธิ์ ส่วนพรีวิวอยู่ส่วนล่างของหน้า (ไม่ชนกัน) ปรับตำแหน่ง/ข้อความได้หลังตัดสิน |
| 5 | ไฟล์ตัวอย่าง (sample file) | ต้องอนุมัติ bucket สาธารณะใหม่ | PR แยก: migration เลขถัดไป, bucket เช่น `resource-demos` (จำกัด MIME/ขนาด, เขียนเฉพาะแอดมิน, อ่านสาธารณะ), rollback, verify, เทสต์ SQL, ฟอร์มแอดมินเปิดตัวเลือก “ไฟล์ตัวอย่าง”, ล้างไฟล์เมื่อเปลี่ยน/ลบ, คำชวนสมัครบนหน้าเว็บสำหรับไฟล์ดาวน์โหลด (ไม่อ้างว่าไฟล์ในเครื่องเด้งเองได้) |
| 6 | ทดสอบหน้าแอดมินบนเบราว์เซอร์จริง | ต้องบัญชีแอดมิน + staging | ใส่ URL ถูก/ผิด (http, `vercel.app`, ซ้ำลิงก์ฉบับเต็ม), เลือก “ไม่มี” แล้วปุ่มหาย, ปิดฟอร์มที่ยังไม่บันทึกต้องมีคำเตือน, ฐานที่ยังไม่มี 061 ต้องเห็นข้อความ “ยังไม่ได้ติดตั้ง migration 061” |
| 7 | apply 061 บน staging → `061-verify.sql` → production | เจ้าของระบบเท่านั้น | หลัง 058–060 ถูก apply แล้วเท่านั้น (ledger ของ Supabase CLI) |
| 8 | หน้าชวนสมัครในตัวเกม (หลังจบรอบแรก/~5 ข้อ) | ทีมเกม (repo/Cloudflare อื่น) | ปุ่มที่ลูกค้ากดเอง ไป `/membership?plan=teacher&returnTo=%2Fresources%2F<slug>` ไม่ redirect อัตโนมัติ; ให้ตัวเกมตรวจสิทธิ์ฉบับเต็มเองด้วย |
| 9 | QA ซ้ำ 375px/1280px + axe บนสาย merge แล้ว | หลังข้อ 1 | รวมหน้าที่มีทั้งเดโม พรีวิว และวิดีโอ |

ห้ามทำโดยไม่ได้รับอนุญาตใหม่: merge, deploy, apply migration บนฐานจริง/staging, เปลี่ยน DNS/Cloudflare/ราคา/สิทธิ์สมาชิก
