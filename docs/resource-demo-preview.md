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
ทดสอบแล้วว่า 061 apply ได้บนสาย 001–057 + 058–060 ของ release branch และ `resource_catalog` ไม่เปลี่ยนแม้แต่ไบต์เดียว
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
