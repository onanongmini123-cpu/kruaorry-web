# PR #27 — รายงานส่งมอบงาน (Engineering handoff)

> สถานะ: **Draft** — ห้าม merge, ห้าม deploy production, ห้าม apply migration จนกว่าเจ้าของระบบอ่านรายงานนี้และผ่าน Manual QA
> ขอบเขตการตรวจ: โค้ดใน repo + ไฟล์ migration เท่านั้น **ไม่ได้เรียกหรือแก้ Supabase production** (ทดสอบ SQL ด้วย PGlite ในเครื่อง, ทดสอบหน้าเว็บกับ mock REST ในเครื่อง)

---

## 0. สรุปสั้น

| เรื่อง | สถานะ |
| --- | --- |
| Security audit (source + migrations) | ทำแล้ว แก้ในโค้ด 6 จุด + migration 052 (ยังไม่ apply) |
| ข้อความเทคนิค/error ดิบใน UI ผู้ใช้ | ทำแล้ว (ผ่านตัวช่วยเดียว `friendlyErrorMessage`) |
| โมเดลสิทธิ์เดียว (ใช้ฟรี / สมาชิกฟรี / Teacher Pro) | ทำแล้ว + matrix test 35 กรณี |
| Pricing (Free + Teacher Pro, ตารางเทียบ, Founder = "จำกัด 100 บัญชีแรก") | ทำแล้ว ข้อมูลมาจากตาราง plans |
| Resource Card / Detail / Related / Filters / Search / Empty state | ทำแล้ว |
| หน้าแรก (hero, 4 การ์ด, server-rendered) | ทำแล้ว |
| Mobile (375/390/430/768/1024/1366) | ทดสอบด้วย Chromium จำลอง พบ/แก้ 2 ปัญหา layout + tap target ทั้งระบบ ยังต้องทดสอบเครื่องจริง |
| SEO (slug, canonical, OG, sitemap, robots, noindex) | โค้ด Phase A พร้อม deploy ก่อน migration; Phase B = migration 053 (ยังไม่ apply) |
| Analytics | ทำ `trackEvent` กลาง เฉพาะ event ที่พิสูจน์ได้ (ไม่มี game_start/game_complete) |
| Report Problem + บริบทอัตโนมัติ + APP_VERSION | ทำแล้ว; หมวดใหม่ต้องรอ migration 054 |
| Tests | 767 vitest + 8 สคริปต์ SQL engine ผ่าน, tsc/eslint/build ผ่าน |

**สิ่งที่ผมไม่ได้ทำโดยตั้งใจ:** merge, deploy, apply migration, แตะ Supabase production, หมุน secret, เปลี่ยนราคา/สิทธิ์/จำนวน Founder, สร้างข้อมูลหรือรีวิวปลอม, เปิด PR อื่น

---

## 1. Final Gate

| ข้อ | ผล |
| --- | --- |
| Tests | `vitest` **767 passed** (main = 579) · SQL engine 8 สคริปต์ผ่าน · `eslint` 0 error 0 warning · `tsc` ผ่าน (ดูข้อ 7 เรื่อง `LayoutProps`) |
| Build เทียบ main | `next build` สำเร็จทั้งคู่ ไม่มี warning ใหม่ · Vercel Preview ของ head commit = **Ready** |
| Routes ที่เปลี่ยน | ดูข้อ 7 |
| ข้อสมมติเรื่อง DB | โค้ดทำงานได้ทั้ง **ก่อน** และ **หลัง** 052/053/054 (ทดสอบทั้งสองสถานการณ์) ดูข้อ 5 |
| env / secrets ที่ต้องหมุน | **ไม่พบ** secret ที่ commit ใน repo ไม่มี env ใหม่ที่ต้องตั้ง (`NEXT_PUBLIC_APP_VERSION` สร้างตอน build จาก `package.json` + `VERCEL_GIT_COMMIT_SHA` ที่ Vercel ใส่ให้เอง) |
| Manual QA | เช็กลิสต์ข้อ 8 (ACCESS / MOBILE / PURCHASE / RESOURCE / SEO-SLUG) |

ยังไม่ควรกด Ready for Review จนกว่าเจ้าของระบบ (1) อ่านรายงานนี้ (2) รันเช็กลิสต์ข้อ 8 บน Vercel Preview (3) ยืนยันรายการ "ต้องตรวจเอง" ข้อ 3.3

---

## 2. สถาปัตยกรรมที่เปลี่ยน

**สิทธิ์ (access model)** — `src/lib/resourceAccess.ts` เป็นที่เดียวที่แปลง `access_mode` ในฐานข้อมูล (public / authenticated / plans / locked) เป็นระดับของ *สื่อ* (`free` ใช้ฟรี, `member` สมาชิกฟรี, `pro` Teacher Pro, `unavailable`). ป้ายบนการ์ดมาจาก "ระดับของสื่อ" อย่างเดียว ไม่เปลี่ยนตามผู้ดู; ว่าผู้ดูเปิดได้หรือไม่เป็นเรื่อง entitlement ที่ตัดสินที่เซิร์ฟเวอร์เท่านั้น (RPC `resolve_resource_target`, Storage RLS, signed URL 60 วินาที) UI helper แค่สะท้อนผล. ชื่อแพ็กจริง ("Founder 100 หรือ Teacher Pro") ยังแสดงในข้อความเงื่อนไขผ่าน `requiredPlansLabel()` แยกจากป้าย.

**ข้อมูลสาธารณะ** — คลังสื่อสาธารณะอ่านครั้งเดียวด้วย Supabase anon client แบบไม่ผูก cookie + `unstable_cache` 5 นาที (`src/app/resources/data.ts`) ใช้ร่วมกันระหว่างหน้ารายการ หน้ารายละเอียด related และ sitemap. หน้าแรกเป็น server component (`revalidate = 300`); ถ้าอ่านฝั่งเซิร์ฟเวอร์ไม่ได้ ฝั่งเบราว์เซอร์จะดึงเองเหมือนเดิม.

**URL สื่อ** — `/resources/[id]` → `/resources/[key]` รับทั้ง UUID และ slug. UUID → 308 ไป slug เฉพาะเมื่อสื่อนั้นมี slug แล้ว. อ่านคอลัมน์ `slug` ก่อน ถ้า DB ยังไม่มี (error 42703) ถอยไป query เดิมโดยอัตโนมัติ.

**ชิ้นส่วนใหม่/รวมศูนย์**

| ไฟล์ | หน้าที่ |
| --- | --- |
| `src/lib/resourceGrades.ts` | ป้ายชั้น "ป.1–6 / ป.4–ม.3 / อนุบาล–ป.3" จาก `grade_levels` ที่เดียว + ตรวจว่าครบ |
| `src/lib/resourceMeta.ts` | ป้ายประเภท, ตัวเลขเด่นบนการ์ด, ตัดคำอธิบาย (Intl.Segmenter) |
| `src/lib/resourceDiscovery.ts` | กรอง ระดับชั้น/วิชา/ประเภท/สิทธิ์ + ค้นหาไทย/อังกฤษ (ประถม 4 = ป.4 = P4, synonym, AND ทุกคำ) |
| `src/lib/relatedResources.ts` | related 3–6 รายการ คะแนนแน่นอน (deterministic) ไม่สุ่ม |
| `src/lib/resourceSeo.ts`, `src/lib/site.ts` | title/description/JSON-LD/canonical/รูปแชร์ จาก `SITE_ORIGIN` ที่เดียว |
| `src/lib/analytics.ts` | `trackEvent` กลาง + allow-list property + กรอง PII |
| `src/lib/userMessages.ts` | แปลงทุก error เป็นภาษาไทยที่คนใช้เข้าใจ ไม่โชว์ข้อความระบบ |
| `src/lib/upgradeFlow.ts` | จุดเข้าอัปเกรด Pro จุดเดียว (`proUpgradeHref`) |
| `src/components/ui/{ResourceCard,FilterSheet}`, `PublicTopBar` | การ์ดเดียวทั้งเว็บ, bottom sheet ตัวกรองบนมือถือ (native popover), แถบหัวหน้าสาธารณะ |

---

## 3. Security

### 3.1 พบและแก้แล้ว (ในโค้ด)

| # | พบ | แก้ |
| --- | --- | --- |
| 1 | `/resources` อ่าน session ฝั่งเซิร์ฟเวอร์เพื่อแสดงสิทธิ์ แต่ proxy ไม่ครอบ → token หมดอายุรีเฟรชไม่ได้ (Server Component เขียน cookie ไม่ได้) และไม่มี no-store บน response ที่ตั้ง cookie | proxy ครอบ `/resources`, `/resources/:path*`; response ที่ตั้ง auth cookie ได้ header no-store จากไลบรารี |
| 2 | `/admin` กั้นเฉพาะฝั่ง client (ข้อมูลจริงยังถูก RLS กัน) | server layout ตรวจ role admin/owner **fail closed** + noindex |
| 3 | route เปิด/ดาวน์โหลดสื่อคืน error ดิบให้ผู้ใช้ | หน้า HTML ภาษาไทยพร้อมทางไปต่อ (status code และ no-store เดิม) |
| 4 | หน้า `/download/[id]` ไม่ตรวจรูปแบบ id ก่อนเรียกฐานข้อมูล | ตรวจ UUID ก่อน |
| 5 | ออกจากระบบแอดมินไม่จัดการ error / scope | `signOutCurrentSession` (local scope) + จัดการ error |
| 6 | ไม่มี header พื้นฐาน | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, ปิด `x-powered-by` |
| 7 | สิทธิ์เขียนเริ่มต้นของ `anon`/`authenticated` บน view/ตารางที่ browser ไม่เคยเขียน (RLS เป็นด่านเดียว) | **migration 052** เพิกถอน INSERT/UPDATE/DELETE/TRUNCATE (ยังไม่ apply) |

อื่น ๆ ที่ทำระหว่างทาง: JSON-LD escape `<` กัน script injection จากชื่อสื่อ; `next=` หลังล็อกอินรับเฉพาะ path ที่รู้จัก (`/resources/<uuid|slug>`) กัน open redirect; analytics ตัด property ที่หน้าตาเหมือนอีเมล/เบอร์; context ของรายงานปัญหาจำกัด 4 key และ ≤ 1 KB ที่ฝั่ง DB; จำนวน Founder จริงไม่แสดงสาธารณะ (แอดมินยังเห็น และระบบยังใช้ค่าจริงบล็อกการสมัครเมื่อเต็ม).

### 3.2 ตรวจแล้วไม่พบปัญหา
- ไม่พบ secret/ service role key ใน repo หรือใน bundle ฝั่ง browser (ใช้เฉพาะ `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY`).
- การตัดสินสิทธิ์อยู่ฝั่งเซิร์ฟเวอร์/ฐานข้อมูลทั้งหมด; UI ไม่ใช่ด่านป้องกัน.
- ไม่มีการปิด RLS ในงานนี้; migration ใหม่ไม่ขยายสิทธิ์ใด ๆ (052 ลด, 053 ไม่ grant เพิ่มบน `resources`, 054 คง grant เดิมของ 029).

### 3.3 ต้องให้เจ้าของระบบตรวจเอง (ผมตรวจจาก repo ไม่ได้)
1. Supabase Storage: policy จริงของ bucket ไฟล์สื่อ (private, ไม่มี public read) และ TTL ของ signed URL.
2. Supabase Auth: ต้องยืนยันอีเมล, Redirect URL allow-list ครอบ `https://kruaorry.com/**` (และโดเมน Preview ที่ใช้), ความยาวรหัสผ่านขั้นต่ำ/ตรวจรหัสรั่ว, rate limit, ปิด anonymous sign-in ถ้าไม่ได้ใช้ (แอปถือเป็นผู้เยี่ยมชมอยู่แล้ว).
3. Migration 049–051 ถูก apply จริงบน production (รายงานของคุณระบุว่าถึง 051) — 052 ต้องรอหลัง 051.
4. Vercel: `kruaorry.com` เป็นโดเมนหลัก (canonical ในโค้ดเป็น `https://kruaorry.com`), `www` redirect มาที่เดียวกัน; Preview ตั้ง Deployment Protection หรือไม่.
5. Repo เป็น private หรือไม่ (migration และโครงสร้างสิทธิ์อยู่ใน repo).
6. `X-Frame-Options: SAMEORIGIN` จะกันการฝังหน้าเว็บนี้ใน iframe ของเว็บอื่น — ถ้ามีพาร์ตเนอร์ฝังอยู่ต้องแจ้งก่อน.

### 3.4 ยังไม่ทำ (เสนอเป็น PR ถัดไป)
- Content-Security-Policy (inline script ของ Next และฟอนต์ต้องมี policy ที่ทดสอบก่อน จึงไม่ใส่แบบเดา).
- Rate limit ฝั่ง DB สำหรับรีวิว/รายงานปัญหา.

---

## 4. UX ที่เปลี่ยน

- ป้ายสิทธิ์ชุดเดียวทั้งเว็บ; การ์ดเรียบ: ปก · ป้าย · ชื่อ (2 บรรทัด) · คำอธิบายสั้น · ชั้น/วิชา/ประเภท · ตัวเลขเด่น ≤ 2 · ปุ่มเดียว "ดูรายละเอียด" (แตะตรงไหนของการ์ดก็เปิดรายละเอียด; ปุ่มหัวใจในแอปแยกการทำงาน).
- ตัวกรอง: ระดับชั้น / วิชา / ประเภท / สิทธิ์ — มือถือเป็น bottom sheet (ปุ่ม "ตัวกรอง" มีตัวเลขที่ใช้อยู่), แท็บเล็ตขึ้นไปแสดงในแถว; เบราว์เซอร์ที่ไม่รองรับ popover แสดงแบบ inline.
- ค้นหาไทย/อังกฤษ: "ประถม 4" = "ป.4" = "P4", "vocabulary" ↔ "คำศัพท์", หลายคำต้องตรงทุกคำ; ไม่พบ → หน้าว่างที่เป็นมิตรพร้อมทางลัด.
- หน้ารายละเอียด: เทมเพลตกลาง ซ่อนหัวข้อที่ไม่มีข้อมูล; ปุ่มหลักเปลี่ยนตามสิทธิ์ ("เริ่มเล่นฟรี" / "สมัครฟรีเพื่อใช้งาน" / "ใช้ด้วย Teacher Pro" / "เปิดใช้งาน"); related 3–6.
- หน้าแรก: H1 ชัด, ค้นหา, "ลองใช้ฟรี", 4 การ์ดทางเข้า (เกมในห้องเรียน / สื่อพร้อมสอน / เครื่องมือครู / Teacher Pro), สื่อฟรีตัวอย่าง, Pricing.
- Pricing: Free + Teacher Pro, Founder เป็นกล่องเสริม "จำกัด 100 บัญชีแรก", ตารางเทียบสิทธิ์ ข้อมูลทั้งหมดมาจากตาราง `plans` / `plan_benefit_catalog` (ไม่มีราคาเขียนตายในส่วนนี้).
- ข้อความ: ไม่มี null / signed URL / "พรีเมียม" / ข้อความระบบในหน้าลูกค้า; ปุ่ม "แจ้งปัญหา" ในหน้า error; ป้าย "ยอดนิยม" ในแอปเปลี่ยนเป็น "แนะนำ" (ไม่อ้างความนิยมที่พิสูจน์ไม่ได้).
- Report Problem: 10 หมวด (หลัง 054) + บริบทอัตโนมัติ (เวอร์ชันแอป, เบราว์เซอร์, ระบบปฏิบัติการ, ขนาดจอ) ไม่เก็บ user-agent/IP; ผู้ที่ยังไม่มีสิทธิ์ใช้สื่อได้ลิงก์ LINE.
- เวอร์ชันแอปแสดงในเมนูติดต่อ (สมาชิก) และหน้าแอดมิน.

**ที่ยังไม่มี (ตั้งใจ):** หัวข้อเนื้อหาเชิงโครงสร้าง (เป้าหมาย / วิธีเล่น / รูปตัวอย่าง / FAQ) — parser พร้อมแล้ว (`src/lib/resourceDetail.ts`) แต่ในฐานข้อมูลยังไม่มีคอลัมน์ `detail_content` และไม่มีหน้าแอดมินกรอก ผมไม่เดา schema; ตอนนี้หน้าแสดงเฉพาะหัวข้อที่สร้างจากข้อมูลที่มีจริง.

---

## 5. Database

ไฟล์เท่านั้น ยังไม่ apply; รายละเอียด/Rollback อยู่ในหัวไฟล์และ `supabase/migrations/README.md`.

| ไฟล์ | ทำอะไร | ความเสี่ยง | ทดสอบ |
| --- | --- | --- | --- |
| `20261006090000_052_revoke_unneeded_write_privileges.sql` | เพิกถอนสิทธิ์เขียนที่ไม่ใช้บน 4 view + 6 ตาราง (SELECT/RLS/ข้อมูลไม่เปลี่ยน) มี assertion ยกเลิกทั้งไฟล์ถ้าสิทธิ์อ่านที่ต้องใช้จะหาย | ต่ำ idempotent | `npm run test:privilege-hardening-sql` |
| `20261006100000_053_resource_slugs.sql` | เพิ่ม `resources.slug` (nullable, รูปแบบ+unique) ใส่ slug ให้ seed 17 รายการตามชื่อตรงตัว และเพิ่ม `slug` เป็นคอลัมน์สุดท้ายของ `resource_catalog` | ต่ำ: เขียนเฉพาะคอลัมน์ใหม่ | `npm run test:resource-slug-sql`, `npm run test:platform-completion-sql` |
| `20261006110000_054_resource_issue_context.sql` | ขยายหมวดรายงาน 5→10, เพิ่ม `context jsonb` (≤1 KB), `submit_resource_issue` รับ `p_context` (เลิก overload เดิมใน transaction เดียว), marker `system.resource_issue_context_v1_ready` | ต่ำ | `npm run test:platform-completion-sql` |

**ข้อสมมติ:** โค้ดไม่ต้องการ migration ใหม่เพื่อทำงาน. ก่อน 053 ทุกลิงก์ใช้ UUID; ก่อน 054 ฟอร์มรายงานเสนอ 5 หมวดเดิม (แอปตรวจ marker ก่อนเสนอหมวดใหม่). ตรวจจริงแล้วทั้งสองสถานการณ์กับ mock (คอลัมน์ `slug` ไม่มี → ถอย query เดิม).

**ลำดับ apply แนะนำ:** (1) deploy แอป → (2) 052 บน Preview DB แล้วคลิกทดสอบ → 052 บน production → (3) 054 → (4) 053 (รอ ≤ 5 นาที หรือ redeploy) → (5) ส่ง sitemap ใหม่ใน Search Console. ก่อนแต่ละไฟล์: `supabase migration list` + `db push --dry-run`; ก่อน 053 เทียบ `pg_get_viewdef('public.resource_catalog')` กับ migration 029 และอ่านรายการ slug ภาษาอังกฤษในไฟล์.

---

## 6. Tests

| ชุด | ผล |
| --- | --- |
| `npm test` (vitest) | 767 ผ่าน (main 579) — เพิ่ม: matrix สิทธิ์ 35, access label, discovery, grade, slug, SEO, analytics, user messages, ข้อกำหนด migration, ขนาดปุ่ม/โครงสร้าง CSS ที่สำคัญ |
| SQL engine (PGlite) | `test:membership-sql`, `resource-file`, `public-resource`, `resource-placeholder`, `resource-discovery`, `platform-completion` (รัน 053+054 บนสายจริง), `privilege-hardening`, `resource-slug` — ผ่านทั้งหมด |
| Lint / Types | `npm run lint` 0 error 0 warning · `tsc --noEmit` ผ่านหลัง `next typegen` |
| Browser QA (Chromium จำลองมือถือ/เดสก์ท็อป, build จริง + mock Supabase REST) | 114 หน้า (สาธารณะ) + 192 หน้า (สมาชิกฟรี/Pro) × 6 ขนาดจอ ไม่มี overflow, ไม่มี console/page error, ไม่มีคำต้องห้าม (ยกเว้นหน้า 404 ที่เบราว์เซอร์รายงานสถานะ 404 ตามปกติ และนโยบายความเป็นส่วนตัวที่ระบุชื่อ Supabase เป็นผู้ประมวลผลข้อมูล) · 31 การทดสอบปฏิสัมพันธ์ผ่าน (แตะการ์ด, bottom sheet, ค้นหา, หัวใจ, ฟอร์มรายงาน) |

**ข้อจำกัด:** ยังไม่ได้ทดสอบบน iOS Safari / Android Chrome จริง, ไม่ได้ทดสอบกับ Supabase จริง (RLS/Storage), และการชำระเงินจริงไม่ได้ทดสอบ.

---

## 7. Build: main เทียบ PR

| รายการ | main (`0709536`) | PR |
| --- | --- | --- |
| `next build` | สำเร็จ | สำเร็จ ไม่มี warning |
| `tsc --noEmit` | `LayoutProps` not found (ชนิดที่ Next สร้างตอน typegen/build) | เหมือนกันก่อน typegen; **ผ่านหลัง `next typegen`** (ทั้งสองฝั่งเหมือนกัน ไม่ใช่ regression) |
| Routes | — | `/resources/[id]` → `/resources/[key]` · `/` เป็น ISR 5 นาที · `/sitemap.xml` เป็น ISR 5 นาที (ดึงสื่อจริง) · `/admin` เปลี่ยนจาก static เป็น dynamic (server layout ตรวจสิทธิ์) · `/resources` และ `/resources/[key]` dynamic เหมือนเดิม |
| proxy matcher | `/login /app /admin` | เพิ่ม `/resources`, `/resources/:path*` |
| ไฟล์ที่เปลี่ยน | — | ราว 125 ไฟล์ แบ่งเป็น commit ตามหัวข้อ (ตัวเลขแน่นอนดูแท็บ Files changed) |

ลำดับอ่านรีวิวที่แนะนำ (ตาม commit): `1a8d17d`/`c35ed8d` สิทธิ์ → `2c743c9`/`caeee92` security → `bd0555a`/`a075fd4`/`e0d2b51` ข้อความ → `c9aa3b4` ชั้นเรียน → `c0266b4` หน้าแรก+pricing → `2265026`/`b3fb3c3` การ์ด/ตัวกรอง → `64864f5` SEO/slug → `f59bf1e` analytics/รายงาน → `0a87ee2`/`b171434`/`ec35758` test + QA.

---

## 8. Manual QA checklist (รันบน Vercel Preview ก่อน; ใช้บัญชีทดสอบ)

### ACCESS
- [ ] ไม่ล็อกอิน: ป้ายสื่อ public = "ใช้ฟรี", สื่อสำหรับสมาชิก = "สมาชิกฟรี", สื่อแพ็ก = "Teacher Pro" (ป้ายไม่เปลี่ยนเมื่อล็อกอินด้วยบัญชีอื่น)
- [ ] สื่อ "ใช้ฟรี": กด "เริ่มเล่นฟรี/เปิดใช้ฟรี" เปิดได้โดยไม่ต้องล็อกอิน
- [ ] สื่อ "สมาชิกฟรี": ผู้เยี่ยมชมเห็น "สมัครฟรีเพื่อใช้งาน" → สมัครแล้วเข้า `/app` (นโยบายเดิม: การสมัครไม่พาต่อไปยังสื่อหรือข้อเสนอเสียเงิน ต้องเลือกใหม่ในแอป) ส่วนล็อกอินบัญชีเดิมกลับมาที่สื่อที่เปิดค้างไว้ได้
- [ ] สื่อ "Teacher Pro": สมาชิกฟรีเห็น "ใช้ด้วย Teacher Pro" ไปหน้าสมัครแพ็ก; Pro/Founder เปิดได้; แพ็กหมดอายุ = ใช้ไม่ได้
- [ ] ลิงก์ดาวน์โหลด/เปิดตรง ๆ ของสื่อที่ไม่มีสิทธิ์ → หน้า error ภาษาไทย ไม่มี JSON/ข้อความระบบ และไม่ได้ไฟล์
- [ ] สื่อ "ยังไม่เปิดใช้งาน" ไม่อยู่ใน sitemap/related และ noindex
- [ ] `/admin` ด้วยบัญชีสมาชิกธรรมดา → ถูกส่งออก (ไม่เห็นหน้าแอดมิน); แอดมิน/owner เข้าได้

### MOBILE (375 · 390 · 430 · 768 · 1024 · 1366)
- [ ] ไม่มี scroll แนวนอนที่ `/`, `/resources`, `/resources/<สื่อ>`, `/membership`, `/login`, `/app` ทุกแท็บ, `/terms`, `/privacy`
- [ ] ปุ่ม/ลิงก์หลักแตะง่าย (≈44px): การ์ด, ตัวกรอง, เมนูหัว, จุด carousel, ปุ่มล้างคำค้น
- [ ] ตัวกรองบนมือถือ: เปิด/ปิด sheet (แตะนอก/ปุ่ม ✕), เลือกแล้วกด "ดูผลลัพธ์", ตัวเลขบนปุ่มถูกต้อง
- [ ] iPhone: แถบเมนูล่างของ `/app` ไม่ถูก safe-area บัง, ปุ่ม "ติดต่อแอดมิน" ไม่บังปุ่มหลัก
- [ ] หน้า `/app` คลังสื่อที่ 1024–1300px ตัวกรองไม่ถูกตัด

### PURCHASE (ห้ามใช้เงินจริง; ทดสอบบน Preview DB)
- [ ] `/membership` ผู้เยี่ยมชม → ล็อกอิน → กลับมาเลือกแพ็ก → สร้างเลขอ้างอิง ("การสร้างเลขอ้างอิงยังไม่นับสิทธิ์/ยังไม่จองสิทธิ์")
- [ ] ขั้นตอนส่งสลิปทาง LINE และสถานะ "รอตรวจ"; แอดมินยืนยัน → สิทธิ์ใช้งาน → สื่อ Pro เปิดได้
- [ ] Founder: หน้าสาธารณะเห็นเฉพาะ "จำกัด 100 บัญชีแรก" (ไม่มีตัวเลขคงเหลือ/แถบ); แอดมินเห็นจำนวนจริง; เมื่อเต็มระบบยังบล็อกการสมัครราคา Founder
- [ ] ราคา/ข้อความต่ออายุตรงกับที่ตั้งค่า (299 ปีแรก / 599 ต่อปี ตามค่าปัจจุบัน — งานนี้ไม่ได้เปลี่ยนราคา)
- [ ] CTA อัปเกรดทุกจุดไปทางเดียวกัน (`/membership`)

### RESOURCE
- [ ] หน้ารายละเอียด: หัวข้อที่ไม่มีข้อมูลหายไป, แสดงชั้นเรียนเป็นช่วง ("ป.2–ม.3"), related 3–6 รายการ
- [ ] ค้นหา "ประถม 4", "P4", "vocabulary", "ไวยากรณ์"; ค้นหาไม่พบ → หน้าว่างพร้อมทางลัด
- [ ] รีวิว: เฉพาะผู้มีสิทธิ์ใช้สื่อ; ผู้อื่นเห็นเหตุผลชัดเจน
- [ ] แจ้งปัญหา: ก่อน 054 มี 5 หมวด / หลัง 054 มี 10 หมวด, ส่งแล้วขึ้นข้อความขอบคุณ ไม่ใช่ error ดิบ
- [ ] แอดมิน: เผยแพร่สื่อที่ไม่ระบุระดับชั้นไม่ได้; รายการที่เผยแพร่แล้วแต่ไม่มีชั้นมีคำเตือน
- [ ] เวอร์ชันแอปแสดงใน "ติดต่อแอดมิน" และหน้าแอดมิน (รูปแบบ `0.1.0+abc1234`)

### SEO-SLUG
- [ ] **ก่อน 053:** `/resources/<uuid>` = 200, canonical เป็น UUID; `/resources/<slug>` = 404
- [ ] **หลัง 053 (≤ 5 นาที):** `/resources/<uuid>` → 308 ไป slug; slug = 200; canonical = `https://kruaorry.com/resources/<slug>`; ตัวพิมพ์ใหญ่ → 308 เป็นตัวเล็ก; slug ที่ไม่มี = 404
- [ ] `/sitemap.xml` มีเฉพาะ slug (ไม่มี UUID, ไม่มีสื่อ locked); `/robots.txt` ไม่มีบรรทัด `Host:` และ Disallow `/app /admin /auth /download /api /reset-password`
- [ ] `/resources?q=…` หรือมีตัวกรอง → `noindex, follow` และ canonical `/resources`; `/login /membership /app /admin` noindex
- [ ] JSON-LD (LearningResource + BreadcrumbList) ผ่าน Rich Results Test; ตัวอย่างแชร์ LINE/Facebook มีชื่อ+รูป (ไม่มีปก → ใช้ mascot)
- [ ] ส่ง sitemap ใหม่ใน Search Console หลัง 053; ห้าม rollback 053 หลังถูก index แล้ว (slug จะกลายเป็น 404 จนกว่าบอทจะ crawl ใหม่) — แก้ไปข้างหน้าแทน

---

## 9. ลำดับ rollout production (เสนอ)

1. เจ้าของระบบรีวิว PR, รันเช็กลิสต์บน Preview, ตอบรายการข้อ 3.3.
2. Merge (เจ้าของเป็นผู้ทำ) → Vercel deploy; ตรวจ `/`, `/resources`, `/resources/<uuid>`, ล็อกอิน, `/app`, `/membership`, `/admin`, `/sitemap.xml`, `/robots.txt`.
3. 052 บน Preview DB → คลิกทดสอบ (ล็อกอิน, หัวใจ, แก้โปรไฟล์, membership, แอดมิน) → 052 บน production → ทดสอบซ้ำ.
4. 054 (Preview ก่อน) → ส่งรายงานทดสอบทุกหมวด.
5. 053 (Preview ก่อน; เทียบ view กับ 029) → รอ ≤ 5 นาที → เช็ก SEO-SLUG → ส่ง sitemap.
6. เฝ้าดู error log 24 ชม.แรก.

## 10. Rollback

| อะไร | วิธี |
| --- | --- |
| แอป | Vercel: promote deployment ก่อนหน้า หรือ revert merge — แอปเข้ากันได้กับ DB ทั้งก่อน/หลัง migration จึงย้อนแอปได้โดยไม่ต้องย้อน DB |
| 052 | คำสั่ง `grant insert, update, delete, truncate on … to anon, authenticated;` ในหัวไฟล์ |
| 054 | ขั้นตอนในหัวไฟล์ (ลบ marker, คืน `submit_resource_issue` ตาม 029, คืน check 5 หมวดเมื่อไม่มีแถวหมวดใหม่, ลบคอลัมน์ `context`) |
| 053 | `update public.resources set slug = null;` ให้ลิงก์กลับเป็น UUID ภายใน 5 นาที (หรือ drop ตามหัวไฟล์) — **ระวัง SEO** ถ้า slug ถูก index แล้วให้แก้ไปข้างหน้า |
| Analytics | ปิดโดยไม่ตั้ง GTM/Plausible — ไม่มี provider = ไม่ส่งอะไรออกไป |

## 11. Follow-up (ไม่อยู่ใน PR นี้)

1. คอลัมน์ `detail_content` + ที่กรอกในแอดมิน เพื่อเปิดหัวข้อเนื้อหาเชิงโครงสร้าง.
2. รวมข้อความราคา fallback (299/599) ใน `membership/page.tsx`, `terms`, `membershipJourney`, `adminMembership` ให้อ่านจากค่าตั้งเดียว + เทสต์กันคลาดเคลื่อน (ต้องให้เจ้าของยืนยันแหล่งความจริงก่อน — ไม่ได้แตะเพราะเกี่ยวกับการชำระเงิน).
3. Content-Security-Policy ที่ทดสอบแล้ว; rate limit รีวิว/รายงาน.
4. `/app` คลังสื่อมีช่องค้นหาสองช่อง (หัวหน้าจอ + ในคลัง) ผูกกับค่าเดียวกัน — ควรตัดช่องใดช่องหนึ่งออก (ตัดสินใจเชิงดีไซน์).
5. ปุ่มให้ดาวรีวิวเริ่มที่ 5 ดาวโดยปริยาย — ควรเริ่มที่ยังไม่เลือก (เป็นพฤติกรรมเดิม ไม่เปลี่ยนในงานนี้).
6. ตั้งค่า GTM/Plausible จริงตาม `docs/analytics.md` เมื่อพร้อมวัดผล.
7. ทดสอบอุปกรณ์จริง (iOS Safari, Android Chrome, LINE in-app browser).
