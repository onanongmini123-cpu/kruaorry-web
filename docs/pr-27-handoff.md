# PR #27 — รายงานส่งมอบงาน (Engineering handoff)

> **สถานะปัจจุบัน (อัปเดต 2026-10-07): Rolled out to production** — PR #27 merge เข้า `main` แล้วที่ `39e2cb8`; Vercel production ใช้โค้ดชุดนี้ และ verification ของ 052/053/054 ผ่านบน production
> **คำเตือนสำคัญเรื่อง migration ledger:** schema production มีผลของ 052–054 ครบ แต่ `supabase_migrations.schema_migrations` ยังหยุดที่ 051 ห้ามรัน `db push` หรือ apply 052–054 ซ้ำโดยไม่ตรวจ ให้ reconcile ด้วย `supabase migration repair --status applied` เฉพาะหลังได้รับอนุมัติ
> **วิธีอ่านเอกสาร:** ส่วน “สถานะ Production หลัง rollout” ด้านล่างคือข้อเท็จจริงล่าสุด ส่วนข้อความ Ready for Review / ยังไม่ deploy / ยังไม่ apply ใน runbook เดิมถือเป็นบันทึกก่อน rollout และห้ามนำไปรันซ้ำโดยไม่ตรวจสถานะจริง
>
> **ขอบเขตการตรวจ (ก่อน rollout):** ตรวจโค้ดใน repo + ไฟล์ migration เท่านั้น ไม่ได้เรียกหรือแก้ Supabase production — SQL ทดสอบบนสำเนาในเครื่อง (PGlite เล่น migration 001–051 ซ้ำทั้งสาย), หน้าเว็บทดสอบกับ mock REST ในเครื่อง
> **อ่านส่วนไหน:** เจ้าของระบบ → ข้อ 0, 1, 3.3, 8, 12, 13 · นักพัฒนา → ข้อ 5, 9, 10, 11 (ข้อ 5/9 เป็นบันทึกก่อน rollout ห้ามรันซ้ำแบบ blind)

## สถานะ Production หลัง rollout (2026-10-07)

| รายการ | ผลล่าสุด |
| --- | --- |
| Git / Vercel | PR #27 merge แล้วที่ `39e2cb8`; production redeploy จาก commit เดิมสำเร็จ |
| Migration 052 | `052-verify.sql` ผ่านครบ 29 แถวบน production |
| Migration 053 | `053-verify.sql` ผ่าน; ตั้ง slug เพิ่มให้ 5 รายการเมื่อ 2026-10-07 แล้ว ปัจจุบัน 22 จาก 22 สื่อมี slug และ `null_slugs = 0` |
| Migration 054 | `054-verify.sql` ผ่านครบ 7 แถวบน production |
| Migration ledger | remote ledger ยังแสดงถึง 051 เท่านั้น — เป็น history drift ที่ต้อง repair metadata ก่อน migration รอบถัดไป |
| Sitemap | หลัง redeploy รอบแรกแสดง 17 slug + 5 UUID; หลังตั้ง slug ที่เหลือ direct route ใหม่ทั้ง 5 ตอบ 200 แล้ว แต่ sitemap ยังไม่รีเฟรชเองบน Vercel เมื่อใช้ ISR — ต้อง redeploy หลังเพิ่ม/เปลี่ยนสื่อ จนกว่าจะเปลี่ยนเป็น dynamic (งานถัดไป) |
| Preview database | Vercel Preview ใช้ Supabase production ตัวเดียวกัน จึงไม่ใช่พื้นที่ซ้อม migration หรือ destructive QA |
| Vercel Firewall | ตรวจและตั้งค่าตามแผนแล้ว (2026-10-07) — รายละเอียดอยู่ในบันทึกส่วนตัวของเจ้าของระบบ |
| Supabase Auth | ตรวจแบบ read-only แล้ว (2026-10-07) ยังไม่ได้เปลี่ยนค่าใด — รายละเอียดอยู่ในบันทึกส่วนตัวของเจ้าของระบบ |
| QA ที่ยังค้าง | R18: iPhone Safari, Android Chrome, LINE in-app browser และธุรกรรมเงินจริงหนึ่งรอบ |

**Slug ที่ตั้งด้วยมือหลัง rollout (2026-10-07):**

| resource id | slug |
| --- | --- |
| `494fd2c4-25cc-4d2b-bb81-69f07b0aa556` | `kru-microlab` |
| `ba0cc8bb-3bcd-4f05-8560-ccfb62bb003e` | `kru-random` |
| `28051c63-5941-4a15-8022-51bd647b9a3d` | `phonics-letter-match` |
| `36dfdf68-ab8c-4600-b969-d3e971458a49` | `moral-detective` |
| `4cf231ef-9488-4239-b633-96393c251a72` | `thai-word-factory` |

> ค่าชุดนี้ตั้งด้วยมือบน production และไม่อยู่ในไฟล์ migration — ต้องตั้งซ้ำบน staging หรือฐานข้อมูลที่สร้างใหม่

**บทเรียนหลัง rollout:** sitemap ไม่รีเฟรชเองบน Vercel เมื่อใช้ ISR — ต้อง redeploy หลังเพิ่มหรือเปลี่ยนสื่อ จนกว่าจะเปลี่ยน route เป็น dynamic. Preview ที่ชี้ฐานข้อมูล production ต้องถือเป็น production ทุกครั้ง. ก่อน migration ใหม่ต้องมี staging แยกและแก้ ledger drift ให้เรียบร้อย.

---

## 0. สรุปสั้น

| เรื่อง | สถานะ |
| --- | --- |
| Security audit (source + migrations + ฐานข้อมูลจำลองที่เล่นสายจริง) | ทำแล้ว แก้ในโค้ดตามตาราง 3.1; ผลของ migration 052 บน production ผ่าน verification แล้ว แต่ ledger ยังไม่บันทึก 052; ไม่พบ secret รั่ว; ไม่พบทางเลี่ยงสิทธิ์ (ตาราง 3.2); ความเสี่ยงที่ยอมรับ/ยังไม่แก้อยู่ข้อ 12 |
| ข้อความเทคนิค/error ดิบใน UI ผู้ใช้ | ทำแล้ว (ผ่านตัวช่วยเดียว `friendlyErrorMessage`) |
| โมเดลสิทธิ์เดียว (ใช้ฟรี / สมาชิกฟรี / Teacher Pro) | ทำแล้ว + matrix test 35 กรณี + ทดสอบ route เปิด/ดาวน์โหลดกับ URL ที่ถูกคัดลอก |
| Pricing (Free + Teacher Pro, Founder = "จำกัด 100 บัญชีแรก") | ทำแล้ว ข้อมูลมาจากตาราง plans |
| Resource Card / Detail / Related / Filters / Search / Empty state | ทำแล้ว; ค้นหาทนคำพิมพ์ผิด/ระดับชั้นหลายรูปแบบ (ข้อ 4) |
| หน้าแรก (hero, 4 การ์ด, server-rendered) | ทำแล้ว |
| Mobile 375–1366 + แป้นพิมพ์ + tap target 44px | ทดสอบด้วย Chromium จำลอง + แก้ที่พบ (ข้อ 4, 6); **ยังต้องทดสอบเครื่องจริง** |
| SEO (slug, canonical, OG, sitemap, robots, noindex, metadata ไม่ซ้ำ) | rollout แล้ว; สื่อ 22/22 มี slug; direct route ใหม่ทั้ง 5 ตอบ 200; sitemap ยังต้อง redeploy หลังเปลี่ยนข้อมูลจนกว่าจะเปลี่ยน route เป็น dynamic |
| Analytics | `trackEvent` กลาง เฉพาะ event ที่พิสูจน์ได้; ไม่ส่งคำที่ผู้ใช้พิมพ์ |
| Report Problem + บริบทอัตโนมัติ + APP_VERSION | rollout แล้ว; ผลของ migration 054 ผ่าน verification บน production |
| Migration 052 / 053 / 054 | schema production ผ่าน verification แล้ว; **ledger ยังหยุดที่ 051** จึงต้อง repair metadata ก่อน migration ถัดไปและห้าม apply ซ้ำแบบ blind |
| Dependencies | next 16.3.8 / sharp 0.35.5 / source-map-js 1.2.2; `npm audit --omit=dev` = **0** (main = 3 รวม 1 critical) ไม่มี package เพิ่ม/ลด |

**สิ่งที่ยังไม่ได้ทำ:** ทดสอบ R18 บนเครื่องจริงและชำระเงินจริง, สร้าง staging Supabase แยก, เปลี่ยน Supabase Auth settings, เปิด analytics provider, และแก้ความเสี่ยง follow-up ในข้อ 12. ข้อความ “ไม่ได้ทำ” ในรายงานเดิมด้านล่างเป็นหลักฐาน ณ เวลาก่อน rollout.

---

## 1. Final Gate

| ข้อ | ผล |
| --- | --- |
| Tests | `npm test` (vitest) **842 ผ่าน / 90 ไฟล์** (main = 579) · SQL engine 9 สคริปต์ผ่าน รวม `test:migration-chain-sql` 31 checks (`test:membership-concurrency` ต้องใช้ Postgres จริง ไม่ได้รันในที่นี้) |
| Lint / Types | `eslint` 0 error 0 warning · `tsc --noEmit` ผ่านหลัง `next typegen` (บน main ก็ต้อง typegen เหมือนกัน — ดูข้อ 7) |
| Build เทียบ main | `next build` สำเร็จทั้งคู่ ไม่มี warning ใหม่ · ทุก route ของแอปเล็กกว่า main (ยกเว้น `/_global-error` ใหญ่ขึ้น ≈ 0.3 KB gzip; ตารางข้อ 7) · Vercel Preview ของ head commit ดูสถานะที่ PR |
| Browser QA บน build จริง (Chromium จำลอง + mock Supabase) | สาธารณะ 114 หน้า · สมาชิก 192 หน้า · ปฏิสัมพันธ์ 31/31 · ล็อกอิน/ออก/สมัคร/ลืมรหัส 33/33 · แป้นพิมพ์ 37/37 · axe 36 มุมมอง เหลือ 1 กฎ (contrast ของสีแบรนด์ — ต้องให้เจ้าของตัดสินใจ ข้อ 12) |
| ข้อสมมติเรื่อง DB | โค้ดทำงานได้ทั้ง **ก่อน** และ **หลัง** 052/053/054 (ทดสอบทั้งสองสถานการณ์) |
| env / secrets ที่ต้องหมุน | **ไม่พบ** secret ใน repo (สแกนทั้ง repo + ผู้ตรวจอิสระ) ไม่มี env ใหม่ที่ต้องตั้ง — โค้ดอ่านเฉพาะ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_VERSION` (สร้างตอน build จาก `package.json` + `VERCEL_GIT_COMMIT_SHA`) |
| Manual QA | QA จำลองผ่านตามหลักฐานเดิม; R18 บน iPhone Safari, Android Chrome, LINE in-app browser และธุรกรรมเงินจริงยังค้าง และต้องทำกับ production/test account ที่ควบคุมได้ ไม่ใช่ Preview ที่ใช้ DB เดียวกันโดยไม่วางแผน |

**ข้อสรุปปัจจุบัน:** gate ฝั่งวิศวกรรมผ่านและ rollout แล้ว. ห้ามรัน runbook rollout ซ้ำ; งานค้างหลักคือ R18, staging แยก, migration-ledger repair และ follow-up ที่จัดลำดับในข้อ 14.

---

## 2. สถาปัตยกรรมที่เปลี่ยน

**สิทธิ์ (access model)** — `src/lib/resourceAccess.ts` เป็นที่เดียวที่แปลง `access_mode` ในฐานข้อมูล (public / authenticated / plans / locked) เป็นระดับของ *สื่อ* (`free` ใช้ฟรี, `member` สมาชิกฟรี, `pro` Teacher Pro, `unavailable`). ป้ายบนการ์ดมาจาก "ระดับของสื่อ" อย่างเดียว ไม่เปลี่ยนตามผู้ดู; ว่าผู้ดูเปิดได้หรือไม่เป็นเรื่อง entitlement ที่ตัดสินที่เซิร์ฟเวอร์เท่านั้น (RPC `resolve_resource_target`, Storage RLS, signed URL 60 วินาที) UI helper แค่สะท้อนผล. ชื่อแพ็กจริง ("Founder 100 หรือ Teacher Pro") ยังแสดงในข้อความเงื่อนไขผ่าน `requiredPlansLabel()` แยกจากป้าย.

**ข้อมูลสาธารณะ** — คลังสื่อสาธารณะอ่านครั้งเดียวด้วย Supabase anon client แบบไม่ผูก cookie + `unstable_cache` 5 นาที (`src/app/resources/data.ts`) ใช้ร่วมกันระหว่างหน้ารายการ หน้ารายละเอียด related, sitemap และหน้าแรก. หน้าแรกเป็น server component (`revalidate = 300`); ถ้าอ่านฝั่งเซิร์ฟเวอร์ไม่ได้ ฝั่งเบราว์เซอร์จะดึงเองเหมือนเดิม. ข้อมูลเฉพาะผู้ดู (สิทธิ์ แพ็ก คำขออัปเกรดที่รอ) อ่านต่อคำขอผ่าน cookie จึง **ไม่เข้าแคชที่ใช้ร่วมกัน**.

**ข้อแลกเปลี่ยนที่ควรรู้ (caching):** หน้าสาธารณะอ่านจากแคชที่ตั้งอายุไว้ 5 นาที — จากการวัดจริง สื่อที่เพิ่ง *เผยแพร่/แก้ไข/ปิด* ในแอดมินสะท้อนบน `/resources` และหน้ารายละเอียดในราว 5–6 นาที (หลังหมดอายุ คำขอแรกยังได้ข้อมูลเดิมและสั่งให้รีเฟรช คำขอถัดไปได้ข้อมูลใหม่), ส่วน `/` และ sitemap มีชั้น ISR ซ้อนบนแคชข้อมูล. หน้า `/app` ของสมาชิกอ่านตรงจึงเห็นทันที. ป้าย/ปุ่มอาจล้าหลังได้ตามช่วงนั้นเมื่อมีการเปลี่ยนสิทธิ์ของสื่อ แต่การตัดสินสิทธิ์ตอนกดเปิด/ดาวน์โหลดตรวจสดที่เซิร์ฟเวอร์ทุกครั้ง ไม่ผ่านแคช จึงไม่เปิดสิทธิ์เกิน (ผลกระทบสูงสุด: สื่อที่เพิ่งล็อกอาจยังโชว์ปุ่มเล่นฟรีราว 5–6 นาที แล้วคลิกได้หน้า error ภาษาไทย). การสั่งล้างแคชทันทีต้องมี endpoint ที่ใช้ secret ใหม่ จึงไม่ใส่ใน PR นี้. proxy ที่ `/resources` เพิ่มการตรวจ session ต่อคำขอของสมาชิกที่ล็อกอิน (ผู้เยี่ยมชมที่ไม่มี cookie ไม่เรียกเครือข่าย) ทำให้คำขอของสมาชิกมีการเรียก auth 2 ครั้ง (proxy + server component).

**URL สื่อ** — `/resources/[id]` → `/resources/[key]` รับทั้ง UUID และ slug. UUID → 308 ไป slug เฉพาะเมื่อสื่อนั้นมี slug แล้ว; ตัวพิมพ์ใหญ่ → 308 เป็นตัวเล็ก. อ่านคอลัมน์ `slug` ก่อน ถ้า DB ยังไม่มี (error 42703) ถอยไป query เดิมโดยอัตโนมัติ.

**ชิ้นส่วนใหม่/รวมศูนย์**

| ไฟล์ | หน้าที่ |
| --- | --- |
| `src/lib/resourceGrades.ts` | ป้ายชั้น "ป.1–6 / ป.4–ม.3 / อนุบาล–ป.3" จาก `grade_levels` ที่เดียว + ตรวจว่าครบ |
| `src/lib/resourceMeta.ts` | ป้ายประเภท, ตัวเลขเด่นบนการ์ด, ตัดคำอธิบาย (Intl.Segmenter) |
| `src/lib/resourceDiscovery.ts` | กรอง ระดับชั้น/วิชา/ประเภท/สิทธิ์ + ค้นหาไทย/อังกฤษ (ชั้นเรียนหลายรูปแบบ, synonym, ทนพิมพ์ผิด, AND ทุกคำ) |
| `src/lib/relatedResources.ts` | related 3–6 รายการ คะแนนแน่นอน (deterministic) ไม่สุ่ม |
| `src/lib/resourceSeo.ts`, `src/lib/site.ts` | title/description/JSON-LD/canonical/รูปแชร์ จาก `SITE_ORIGIN` ที่เดียว |
| `src/lib/analytics.ts` | `trackEvent` กลาง + allow-list property + กรอง PII (`docs/analytics.md`) |
| `src/lib/userMessages.ts` | แปลงทุก error เป็นภาษาไทยที่คนใช้เข้าใจ ไม่โชว์ข้อความระบบ |
| `src/lib/upgradeFlow.ts` | จุดเข้าอัปเกรด Pro จุดเดียว (`proUpgradeHref`) |
| `src/components/ui/{ResourceCard,FilterSheet}`, `PublicTopBar` | การ์ดเดียวทั้งเว็บ, bottom sheet ตัวกรองบนมือถือ (native popover), แถบหัวหน้าสาธารณะ |
| `supabase/rollbacks/*.rollback.sql` | rollback ของ 052/053/054 (ทดสอบแล้ว) — ข้อ 5.7 |
| `supabase/verification/*.sql` | SQL read-only ตรวจก่อน/หลัง apply — ข้อ 5.4, 5.6 |
| `scripts/test-migration-chain-sql.mjs`, `scripts/lib/real-chain.mjs` | เล่น migration 001–051 จริงซ้ำแล้วทดสอบ 052–054 — ข้อ 5.8 |

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
| 7 | สิทธิ์เขียนเริ่มต้นของ `anon`/`authenticated` บน view/ตารางที่ browser ไม่เคยเขียน (RLS เป็นด่านเดียว) | **migration 052** (ยังไม่ apply) |
| 8 | redirect ของ proxy (ผู้เยี่ยมชม → `/login`, สมาชิกที่เปิด `/login`) ไม่ได้คัดลอก header no-store ที่ไลบรารีใส่ตอนรีเฟรช token | คัดลอก cache headers + ค่าเริ่มต้น `private, no-store` (มีเทสต์) |
| 9 | analytics ส่งข้อความที่ผู้ใช้พิมพ์ในช่องค้นหา (อาจเป็นชื่อคน) | เลิกส่งคำค้น เหลือ `query_length`, `results_count`, `filters_count`; ตัด `term` ออกจาก allow-list |
| 10 | หน้า error HTML (เปิด/ดาวน์โหลด) รับ `href` ใดก็ได้ — latent ไม่มีจุดเรียกที่ไม่ปลอดภัยวันนี้ | อนุญาตเฉพาะ path ภายในไซต์ (ขึ้นต้น `/` ไม่ใช่ `//`, ไม่มี backslash/control) ที่เหลือกลับไปแอป |
| 11 | dependency: next 16.3.3 มีช่องโหว่ GHSA-vcvr-r3jv-pc5j (RCE ใน `next/og` — repo นี้ไม่ได้ใช้ ImageResponse) + sharp + source-map-js | อัปเป็น 16.3.8 / 0.35.5 / 1.2.2 + เทสต์กันถอยเวอร์ชัน (`dependencies.test.ts`) |

อื่น ๆ ที่ทำระหว่างทาง: JSON-LD escape `<` กัน script injection จากชื่อสื่อ; `next=` หลังล็อกอินรับเฉพาะ path ที่รู้จัก (`/resources/<uuid|slug>`, `/app` ที่ตรวจพารามิเตอร์, `/membership` ที่ตรวจ `returnTo`, `/download/<uuid>`) กัน open redirect — ค่าอันตรายทั้งหมดกลับไป `/app`; analytics ตัด property ที่หน้าตาเหมือนอีเมล/เบอร์; context ของรายงานปัญหาจำกัด 4 key และ ≤ 1 KB ที่ฝั่ง DB; จำนวน Founder จริงไม่แสดงสาธารณะ (แอดมินยังเห็น และระบบยังใช้ค่าจริงบล็อกการสมัครเมื่อเต็ม); race ของรายการโปรดและโฟกัสของปุ่มที่กำลังโหลดแก้แล้ว (ดูข้อ 4 หัวข้อ Accessibility).

### 3.2 ตรวจแล้วไม่พบปัญหา (ผู้ตรวจอิสระเล่น migration ทั้งสาย 001–054 บน PGlite พร้อม RLS/trigger จริง)

- **เมทริกซ์ผู้ดู:** anon / สมาชิกฟรี / session แบบ anonymous ของ Supabase / Pro ที่ยังไม่หมดอายุ / past_due ที่ยังไม่หมดรอบ / สถานะ active แต่หมดรอบ / expired / admin × สื่อ public / authenticated / plans / locked / draft — ไม่มีทางที่ผู้ดูที่ไม่มีสิทธิ์จะได้ signed URL, `file_path` หรือ URL ปลายทางภายนอก. ไม่มีข้อมูลเฉพาะผู้ดูเข้าแคชที่ใช้ร่วมกัน.
- **IDOR / auth bypass:** สมาชิกฟรีแก้ `resources` ไม่ได้, ยกระดับ role/แพ็กด้วยตนเองไม่ได้ ("Plan changes must use a membership RPC"), อ่านข้อมูลคนอื่น (subscriptions, profiles, reviews, audit log) ไม่ได้, บันทึกรายการโปรดแทนคนอื่น/ของ draft ไม่ได้; ทุก admin RPC ปฏิเสธสมาชิกธรรมดา; admin ที่ไม่ใช่ owner สร้าง/ลด owner ไม่ได้; metadata สมัครที่ใส่ `role=owner` ถูกเมิน; ทุกตาราง public เปิด RLS.
- **Signed URL:** ออกเฉพาะหลัง `resolve_resource_target` ตัดสินที่เซิร์ฟเวอร์ แล้ว Storage ตรวจซ้ำตอนเซ็น; TTL 60 วินาที; route ไม่อ่าน query string จากไคลเอนต์; error ไม่เปิดเผยปลายทาง; `Cache-Control: no-store` + `Referrer-Policy: no-referrer`.
- **Redirect:** `next` อันตรายทุกแบบ (`https://evil.com`, `//evil.com`, `/\evil.com`, `javascript:`, `/admin`, `/api/...`, ค่ายาว/มี control char) → `/app`; callback ของ auth ไม่รับ `next` เลย.
- **Injection / HTML:** `dangerouslySetInnerHTML` มีเฉพาะ JSON-LD 2 จุดที่ escape แล้ว; หน้า error escape ครบ; URL ปก/ตัวอย่างต้องเป็น https ไม่มี credentials และใช้ใน `<img>` เท่านั้น; ลิงก์ `target=_blank` มี `rel="noopener noreferrer"`.
- **Secrets / env:** ไม่พบ service-role key, private key หรือ token (สแกน src, scripts, config, docs, public, supabase); ไม่มี `.env` ใน git; client ใช้เฉพาะ anon key.
- **ขีดจำกัดฝั่ง DB ที่มีอยู่:** คำขอ 5 ต่อ 24 ชม., รายงานปัญหา 5 ต่อชม. (+ ไม่ซ้ำตามหมวดที่ยังไม่แก้), บันทึกรายการโปรด 10 สำหรับสมาชิกฟรี, ชื่อ 2–80 ตัวอักษร, bucket รูปโปรไฟล์/ไฟล์สื่อจำกัดขนาด/ชนิด.
- **ไม่ได้ตรวจ (ผู้ตรวจรายงานไว้):** ข้อความ error หน้า login ในแง่ user enumeration; logic ฝั่ง client ของ `ProfileSettings`/`AvatarCropper` แบบเต็ม; ทุกขั้นตอน UI ของแอดมิน.

### 3.3 ผลตรวจระบบภายนอกและรายการที่ยังต้องตรวจเอง

1. **Supabase Storage:** ยังต้องตรวจ policy จริงของ bucket ไฟล์สื่อ (private, ไม่มี public read) และ TTL ของ signed URL; ดูความเสี่ยง R2/R3 ข้อ 12.
2. **Supabase Auth:** ตรวจแบบ read-only แล้ว (2026-10-07) ยังไม่ได้เปลี่ยนค่าใด — รายละเอียดอยู่ในบันทึกส่วนตัวของเจ้าของระบบ. ยังเหลือ: ทบทวนนโยบายรหัสผ่านและทดสอบ flow อีเมลบน staging ก่อนเปลี่ยนค่าใด.
3. **Migration 052–054:** schema production ผ่าน verification แล้ว แต่ ledger ยังหยุดที่ 051; ต้อง repair ledger metadata หลังอนุมัติและก่อน migration ใหม่.
4. **Vercel:** `kruaorry.com` เป็นโดเมนหลัก; ยืนยันแล้วว่า Preview ใช้ Supabase production ตัวเดียวกัน. Firewall: ตั้งค่าตามแผนแล้ว รายละเอียดอยู่ในบันทึกส่วนตัว.
5. Repo เป็น public (ยืนยัน 2026-10-07) — ห้ามใส่ค่าตั้งค่าความปลอดภัยหรือรายละเอียดความเสี่ยงที่ยังไม่แก้ใน repo; ใช้บันทึกส่วนตัวของเจ้าของระบบ.
6. `X-Frame-Options: SAMEORIGIN` จะกันการฝังหน้าเว็บนี้ใน iframe ของเว็บอื่น — ถ้ามีพาร์ตเนอร์ฝังอยู่ต้องแจ้งก่อน.
7. ทดสอบบนเครื่องจริง (iOS Safari, Android Chrome, LINE in-app browser) และการชำระเงินจริงตามขั้นตอนของคุณ.

---

## 4. UX ที่เปลี่ยน

- ป้ายสิทธิ์ชุดเดียวทั้งเว็บ; การ์ดเรียบ: ปก · ป้าย · ชื่อ (2 บรรทัด) · คำอธิบายสั้น · ชั้น/วิชา/ประเภท · ตัวเลขเด่น ≤ 2 · ปุ่มเดียว "ดูรายละเอียด" (แตะตรงไหนของการ์ดก็เปิดรายละเอียด; ปุ่มหัวใจในแอปแยกการทำงาน; การ์ดหนึ่งใบ = tab stop เดียว).
- ตัวกรอง: ระดับชั้น / วิชา / ประเภท / สิทธิ์ — มือถือเป็น bottom sheet (ปุ่ม "ตัวกรอง" มีตัวเลขที่ใช้อยู่; เปิด/ปิดด้วยแป้นพิมพ์ได้, Esc ปิดแล้วโฟกัสกลับที่ปุ่ม, Tab แรกเข้าไปในแผง), แท็บเล็ตขึ้นไปแสดงในแถว; เบราว์เซอร์ที่ไม่รองรับ popover แสดงแบบ inline.
- **ค้นหาไทย/อังกฤษ (ผ่าน 31 เทสต์ขอบ `resourceDiscoveryEdgeCases.test.ts`):** ป3 = ป.3 = ประถม 3 = ประถมศึกษาปีที่ 3 = P3 = grade 3 · ม.1 / มัธยม 1 / M1 / grade 7 · ช่วง `ป.4-6` · "ประถมต้น/ปลาย" · English / อังกฤษ / ภาษาอังกฤษ (ไม่สนตัวพิมพ์) · game / games / เกม / เกมส์ · worksheet / ใบงาน · vocabulary / vocab / คำศัพท์ (รวมคำสะกดผิดที่พบบ่อย) · `grammer`/`gramar` → grammar (ทนผิด 1–2 ตัวอักษรในคำยาว ไม่ลากคำสั้นหรือคำไม่เกี่ยว) · หลายคำต้องตรงทุกคำ ลำดับใดก็ได้ · เว้นวรรคเกิน/แปลก/อักขระล่องหน, ตัวเลขไทย, ตัวอักษรเต็มความกว้าง · วลีไทยไม่เว้นวรรคแยกด้วย `Intl.Segmenter` · ไม่อ่านท้ายคำไทยหรือคำอังกฤษที่ลงท้าย p/m เป็นชั้นเรียน · ชั้นเรียนที่ไม่มีจริงไม่พบอะไร · ค่า filter แปลก/อันตรายถูกทิ้ง · URL ค้นหายาวถูกจำกัด · ไม่พบ → หน้าว่างที่เป็นมิตรพร้อมทางลัด + ล้างตัวกรอง. ความเร็ว: 100 สื่อ ≤ 1.1 ms ต่อการพิมพ์หนึ่งตัว (ครั้งแรก ≈ 10 ms), 3,000 สื่อ ≤ 4 ms (ครั้งแรก ≈ 180 ms) — แคตตาล็อกจริงตอนนี้ ~20 รายการ.
- หน้ารายละเอียด: เทมเพลตกลาง ซ่อนหัวข้อที่ไม่มีข้อมูล; ปุ่มหลักเปลี่ยนตามสิทธิ์ ("เริ่มเล่นฟรี" / "สมัครฟรีเพื่อใช้งาน" / "ใช้ด้วย Teacher Pro" / "เปิดใช้งาน"); related 3–6.
- หน้าแรก: H1 ชัด, ค้นหา, "ลองใช้ฟรี", 4 การ์ดทางเข้า (เกมในห้องเรียน / สื่อพร้อมสอน / เครื่องมือครู / Teacher Pro), สื่อฟรีตัวอย่าง, Pricing; การดึงจำนวน Founder ใหม่ทุก 5 นาที และไม่ดึงตอนแท็บซ่อน.
- Pricing: Free + Teacher Pro, Founder เป็นกล่องเสริม "จำกัด 100 บัญชีแรก", ตารางเทียบสิทธิ์ ข้อมูลทั้งหมดมาจากตาราง `plans` / `plan_benefit_catalog` (ไม่มีราคาเขียนตายในส่วนนี้).
- ข้อความ: ไม่มี null / signed URL / "พรีเมียม" / ข้อความระบบในหน้าลูกค้า; ปุ่ม "แจ้งปัญหา" ในหน้า error; ป้าย "ยอดนิยม" ในแอปเปลี่ยนเป็น "แนะนำ" (ไม่อ้างความนิยมที่พิสูจน์ไม่ได้).
- Report Problem: 10 หมวด (หลัง 054) + บริบทอัตโนมัติ (เวอร์ชันแอป, เบราว์เซอร์, ระบบปฏิบัติการ, ขนาดจอ) ไม่เก็บ user-agent/IP; ฟอร์มตัดสินหมวดก่อนเปิด (ไม่กระพริบเปลี่ยน); ผู้ที่ยังไม่มีสิทธิ์ใช้สื่อได้ลิงก์ LINE.
- เวอร์ชันแอปแสดงในเมนูติดต่อ (สมาชิก) และหน้าแอดมิน.
- **Accessibility:** axe-core บน 18 หน้า × 2 ความกว้าง (375/1280) เหลือ 1 กฎ (contrast สีแบรนด์ — ข้อ 12 R12) จากเดิม 9; โครงหัวข้อ/landmark ถูกต้อง (หนึ่ง `<main>`, ลำดับ h1→h2→h3); ปุ่ม/ลิงก์ ≥ 44px บนจอสัมผัส; ทุก tab stop มี focus ring; ไม่มี keyboard trap; ข้อความลิงก์ในย่อหน้ามีขีดเส้นใต้. **แก้จากการทดสอบแป้นพิมพ์:** ปุ่มที่กำลังโหลดเคยใช้ `disabled` ทำให้โฟกัสหลุดไปที่หน้า (กดหัวใจ/ปุ่มส่งฟอร์มแล้วต้อง Tab ใหม่ทั้งหน้า) — ตอนนี้ใช้ `aria-disabled` + `aria-busy` และไม่รับคลิกระหว่างโหลด (รวมการ submit) พร้อมคงชื่อปุ่มไว้ให้ screen reader; และ refresh รายการโปรดตอนแท็บกลับมา focus ไม่ทับผลของการกดหัวใจอีก (guard + เทสต์).
- **ความเสถียรของเลย์เอาต์ (CLS):** 0.000 ทุกหน้าที่ 375px; ที่ 1280px หน้าแรก 0.035, `/membership` 0.182 (มีมาก่อน PR เหมือนกัน — ข้อ 12 R13).

**ที่ยังไม่มี (ตั้งใจ):** หัวข้อเนื้อหาเชิงโครงสร้าง (เป้าหมาย / วิธีเล่น / รูปตัวอย่าง / FAQ) — parser พร้อมแล้ว (`src/lib/resourceDetail.ts`) แต่ในฐานข้อมูลยังไม่มีคอลัมน์ `detail_content` และไม่มีหน้าแอดมินกรอก ผมไม่เดา schema.

---

## 5. Database

> **สถานะหลัง rollout:** ผลของทั้งสามไฟล์อยู่บน production และ verification ผ่าน แต่ ledger ยังไม่บันทึก 052–054. เนื้อหาด้านล่างเป็น runbook/หลักฐานก่อน rollout ไม่ใช่คำสั่งให้ apply ซ้ำ. ทุกไฟล์ออกแบบให้รันซ้ำได้ ไม่ลบข้อมูล ไม่ขยายสิทธิ์ browser role และมี guard + rollback + SQL ตรวจผล แต่ควร repair ledger แทนการรันซ้ำ.

### 5.1 ภาพรวม

| ไฟล์ (`supabase/migrations/`) | ทำอะไร | ล็อก | Guard (ยกเลิกทั้งไฟล์ถ้าไม่ตรง) | Rollback | ตรวจผล |
| --- | --- | --- | --- | --- | --- |
| `20261006090000_052_revoke_unneeded_write_privileges` | เพิกถอน INSERT/UPDATE/DELETE/TRUNCATE ของ `public`/`anon`/`authenticated` บน 4 view + 6 ตาราง (`resource_catalog`, `plan_benefit_catalog`, `resource_review_feed`, `resource_review_summary`, `subscriptions`, `subscription_events`, `plans`, `features`, `plan_features`, `admin_audit_log`) — SELECT/RLS/ข้อมูลไม่เปลี่ยน | ไม่มีล็อกตาราง (GRANT/REVOKE แก้แค่ ACL) | สิทธิ์อ่านที่แอปใช้ต้องยังอยู่; ต้องไม่เหลือสิทธิ์เขียนตัวใด | `grant …` คำสั่งเดียว | `052-verify.sql` |
| `20261006100000_053_resource_slugs` | เพิ่ม `resources.slug` (nullable text) + CHECK รูปแบบ + unique index (เฉพาะแถวที่มี slug) + ใส่ slug ให้ seed **17 รายการตาม id** + view `resource_catalog` เพิ่ม `slug` เป็นคอลัมน์สุดท้าย (นอกนั้นเหมือน migration 029) | `lock_timeout 5s`; ล็อกสั้น ๆ บน `resources` (~15 ms ที่ 50 แถว, ไม่ rewrite ตาราง) | view ต้องมีคอลัมน์และ `security_barrier` ตรง 029 (ตรวจก่อนแก้อะไร); คอลัมน์/ข้อมูล slug เดิมต้องผ่าน CHECK | `update resources set slug = null` (ไม่แตะ schema) หรือไฟล์ rollback | `053-verify.sql` |
| `20261006110000_054_resource_issue_context` | หมวดรายงาน 5→10, เพิ่ม `context jsonb` (≤ 1 KB, ต้องเป็น object), `submit_resource_issue` รับ `p_context` (4 key สั้น ๆ), marker `system.resource_issue_context_v1_ready` | `lock_timeout 5s`; ตารางเล็ก | — (idempotent; CHECK หมวดสร้างใหม่ไม่ว่าชื่อเดิมคืออะไร) | ไฟล์ rollback (ไม่ลบรายงาน) | `054-verify.sql` |

**สายอ้างอิง/ลำดับ:** ทั้งสามไฟล์ไม่พึ่งกัน — ทดสอบแล้วว่าทั้ง 6 ลำดับการ apply ได้สถานะสุดท้ายเดียวกัน (รวมสิทธิ์ ACL, view, constraint, function, marker) และแต่ละไฟล์ใช้ได้ลำพังบน 051. ลำดับตามชื่อไฟล์ (052 → 053 → 054) ที่ `supabase db push` ใช้จึงใช้ได้เลย.

### 5.2 สิ่งที่ทำให้ rollout ปลอดภัย (ตรวจโดย `npm run test:migration-chain-sql`)

- **ตรวจก่อนเขียน:** 053 หยุดทันทีพร้อมข้อความชัดเจน ถ้า `resource_catalog` ไม่ใช่ view ของ migration 029 (ชื่อ/ลำดับคอลัมน์ผิด หรือไม่ใช่ `security_barrier`) — เพราะไฟล์นี้ `create or replace` view ทั้งก้อน หากมีคนแก้ view มือจะถูกเขียนทับเงียบ ๆ.
- **Atomic:** guard สุดท้ายของ 052/053 ยกเลิกทั้งไฟล์ถ้าผลไม่ตรงที่ออกแบบ; ทดสอบว่าเมื่อไฟล์ล้มเหลว สถานะฐานข้อมูลเหมือนก่อนรัน (ทุก ACL/constraint/function/ข้อมูล).
- **รันซ้ำได้:** รันสองครั้งแล้วสถานะเท่าเดิม (ไม่ซ้ำ ไม่ error); ถ้า apply ไปครึ่งทางด้วยเหตุใดก็ตาม รันไฟล์เดิมซ้ำเพื่อให้ครบ.
- **Backfill slug ตาม id ไม่ใช่ชื่อ:** แก้ชื่อสื่อ/มีชื่อซ้ำ/ชื่อพิมพ์ต่าง (เช่น สระอำแยกชิ้น) ไม่ทำให้ map ผิดแถว; แถวที่มี slug แล้วไม่ถูกเขียนทับ; slug ที่มีคนใช้แล้วไม่ถูกแย่ง (แถวนั้นอยู่ที่ UUID); สื่อที่เผยแพร่แต่ไม่อยู่ในรายการแสดงเป็น WARNING ท้ายไฟล์ (ไม่ใช่ error).
- **view เดิมไม่เปลี่ยนความหมาย:** ทดสอบว่าแถวและค่าทุกคอลัมน์ที่ view คืน (รวมสื่อ placeholder/localhost/ไอพีภายใน/ไฟล์ว่าง/ไฟล์ใต้ id อื่น) เท่าเดิมทุกประการก่อน-หลัง 053 นอกจากคอลัมน์ `slug` ที่เพิ่ม; และมี pin test ว่าเนื้อ view ใน 053 = ของ 029 + `r.slug` (ไม่มี migration 030–052 ที่นิยาม view ใหม่).
- **ฐานข้อมูลกับแอปรับ slug ชุดเดียวกัน:** corpus 41 ค่า (`src/lib/__tests__/fixtures/slug-corpus.json`) รันทั้งกับ CHECK ใน DB และ `isValidSlug` ในแอป.
- **ข้อมูลจริงที่อาจต่างจาก seed:** คอลัมน์ `slug` ที่มีคนสร้างมือพร้อมค่าผิดรูปแบบ → ไฟล์ล้มเหลวทั้งไฟล์พร้อมข้อความ constraint (ไม่เหลือครึ่ง ๆ กลาง ๆ); คอลัมน์ `slug` คนละชนิด → `pre-check.sql` แจ้งก่อน apply; ชื่อ CHECK ของหมวดรายงานต่างจากที่คาด → 054 ทิ้ง CHECK ที่คุมหมวดทุกตัวแล้วสร้างใหม่ชื่อมาตรฐาน; รายงานเก่า 5 หมวดคงอยู่ครบ.
- **เทสต์จับของพังจริง:** ทดลองทำให้ migration/rollback ผิดโดยตั้งใจ 12 แบบ (เช่น backfill เขียนทับ slug, ไม่ตัดความยาว context, rollback ลืมลบ marker/ลืมตาราง) — เทสต์จับได้ครบ 12/12.

### 5.3 ข้อกำหนดก่อนเริ่ม

1. สิทธิ์เข้า Supabase project (SQL editor ของ dashboard หรือ CLI ที่ `supabase link` แล้ว) ด้วยบทบาทที่รัน DDL ได้ (owner ของ schema `public`).
2. ledger แสดง migration ถึง `20261004110000` (051) แล้ว.
3. **Deploy แอปของ PR นี้ก่อน** (ได้โดยเจ้าของ merge) — แอปทำงานได้ทั้งก่อน/หลัง migration จึงไม่มีช่วงที่พัง.
4. รู้ว่ามีที่ย้อนกลับของข้อมูล: Supabase backup รายวัน/PITR ตามแพ็กของโปรเจกต์ (เจ้าของยืนยันแผน) — migration นี้ไม่ลบข้อมูลแต่ควรมีไว้เสมอ.
5. **ห้ามรันผ่านเครื่องมือที่ commit ทีละคำสั่ง** (เช่น `psql -f` ธรรมดา): ต้องเป็นการรันทั้งไฟล์ในธุรกรรมเดียว — `supabase db push` / SQL editor ของ dashboard / `psql --single-transaction -f`. (Supabase CLI ส่งแต่ละไฟล์เป็น batch เดียวซึ่ง Postgres ถือเป็นธุรกรรมโดยปริยาย — ข้อสมมตินี้ยังไม่ได้ยืนยันกับโปรเจกต์จริง ดูข้อ 12 R17; ไฟล์ทั้งหมดรันซ้ำได้จึงกู้คืนได้แม้ไม่เป็นเช่นนั้น.)

### 5.4 Pre-check (ก่อน apply อะไรก็ตาม — ไม่เปลี่ยนอะไร)

รัน `supabase/verification/pre-check.sql` ใน SQL editor (Preview ก่อน แล้ว production) — **ทุกแถวต้อง `ok = true`**; แถว `state:` บอกว่า migration ไหน apply ไปแล้ว. และดู ledger (เฉพาะ Supabase):

```sql
select version, name from supabase_migrations.schema_migrations order by version desc limit 8;
-- แถวบนสุดต้องเป็น 20261004110000 (051) หรือใหม่กว่า
```

| แถวที่ไม่ผ่าน | หมายถึง | ทำอะไร |
| --- | --- | --- |
| `resource_catalog is the 029 view…` / `…security_barrier view` | view ไม่ตรง 029 (มีคนแก้) | อย่า apply 053 จนกว่าจะเทียบ `select pg_get_viewdef('public.resource_catalog'::regclass, true)` กับ migration 029 และตกลงว่าจะรวมการแก้ไขนั้นเข้าไฟล์อย่างไร |
| `submit_resource_issue has exactly one overload` | มีฟังก์ชันซ้อนหลาย signature | ดู `select oid::regprocedure from pg_proc where proname = 'submit_resource_issue'`; อย่า apply 054 จนกว่าจะรู้ที่มา |
| `resource_issue_reports has exactly one CHECK on category` | CHECK หมวดผิดปกติ | ดู `select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.resource_issue_reports'::regclass` |
| `the ten objects 052 changes all exist` / `the reads the app depends on are granted` | schema/สิทธิ์อ่านต่างจากที่คาด | 052 จะยกเลิกเองด้วยข้อความที่ระบุ; ตรวจ default grants ของโปรเจกต์ |
| `resources.slug can be added…` | มีคอลัมน์ `slug` ชนิดอื่นอยู่แล้ว | ตรวจที่มา; อย่า apply 053 จนกว่าจะรู้ |

### 5.5 ขั้นตอน apply

```bash
supabase link --project-ref <PROJECT_REF>        # ครั้งแรกเท่านั้น (ต้อง login แล้ว)
supabase migration list                          # 052–054 ต้องมีเฉพาะฝั่ง Local
supabase db push --dry-run                       # ต้องแสดงเฉพาะ 052, 053, 054
supabase db push                                 # apply ตามลำดับชื่อไฟล์ + บันทึก ledger
```

ถ้าใช้ SQL editor: วางไฟล์ **ทั้งไฟล์** รันครั้งเดียว แล้วบันทึก ledger ด้วย `supabase migration repair --status applied 20261006090000` (และ `…100000`, `…110000`) — ไม่เช่นนั้น `db push` รอบหน้าจะพยายามรันซ้ำ (ไม่เสียหายเพราะรันซ้ำได้ แต่รก).

หลังแต่ละไฟล์ให้รัน SQL ตรวจผลของไฟล์นั้น (5.6) แล้วค่อยไปไฟล์ถัดไป ถ้าใช้ `db push` ครั้งเดียวทั้งสามไฟล์ ให้รัน verify ทั้งสามตามลำดับหลังเสร็จ.

ข้อควรรู้ตอนรัน:
- ถ้าไฟล์ล้มด้วย `canceling statement due to lock timeout` (053/054 ตั้ง `lock_timeout` 5 วินาที) แปลว่ามีคำสั่งยาวถือล็อกอยู่ — ไม่มีอะไรถูกเปลี่ยน (ยกเลิกทั้งไฟล์); รันใหม่ในช่วงเงียบ.
- ถ้า API ยังไม่เห็นฟังก์ชัน/คอลัมน์ใหม่หลัง apply (ปกติ Supabase โหลด schema cache ของ PostgREST เองหลัง DDL) ให้สั่ง `notify pgrst, 'reload schema';` — อาการ: รายงานปัญหาส่งหมวดใหม่ไม่ได้ (054) หรือแอปยังใช้ URL แบบ UUID ทั้งที่ `053-verify.sql` ผ่าน (แอปถอยไป query เดิมโดยอัตโนมัติเมื่อไม่เจอคอลัมน์).

### 5.6 ตรวจผลหลัง apply (read-only; ทุกแถวต้อง `ok = true`)

| ไฟล์ตรวจ | ตรวจอะไร |
| --- | --- |
| `052-verify.sql` | `anon`/`authenticated` ไม่มี INSERT/UPDATE/DELETE/TRUNCATE บนทั้ง 10 object และยังมี SELECT ที่แอปใช้ (29 แถว) |
| `053-verify.sql` | `resources.slug` nullable text · CHECK `resources_slug_format` validated · unique partial index `resources_slug_key` · `resource_catalog` มี `slug` เป็นคอลัมน์สุดท้ายชนิด text · ยังเป็น `security_barrier` · browser role อ่านได้เขียนไม่ได้ · policy ของ `saved_resources` ที่พึ่ง view ยังอยู่ · (info) จำนวนสื่อที่มี slug และสื่อที่เผยแพร่แต่ยังใช้ UUID |
| `054-verify.sql` | `context jsonb` nullable · CHECK `context` object ≤ 1 KB · CHECK หมวดมี 10 ค่า (ตัวเดียว) · เหลือฟังก์ชัน 4 อาร์กิวเมนต์ตัวเดียว · security definer + `search_path=""` · เฉพาะ `authenticated` เรียกได้ (ไม่ใช่ anon/PUBLIC) · มี marker |

ค่าที่คาดบน production จริง: `053-verify` แถว info จะแจ้ง "N of M" (M = จำนวนสื่อทั้งหมดในตาราง, N = 17 ถ้าสื่อ seed ครบ) และรายชื่อสื่อที่เผยแพร่แล้วยังไม่มี slug — สื่อที่เพิ่มหลัง seed ต้องตั้ง slug มือ (ดู R11).

### 5.7 Rollback ของฐานข้อมูล

ไฟล์อยู่ที่ `supabase/rollbacks/` (วางใน SQL editor รันทั้งไฟล์; แต่ละไฟล์เป็นธุรกรรมเดียวและรันซ้ำได้). **ย้อนแอปไม่ต้องย้อน DB** (แอปรองรับทั้งสองสถานะ) — ย้อน DB เมื่อพบปัญหาที่ DB เท่านั้น. หลัง rollback ให้บันทึก ledger: `supabase migration repair --status reverted <version>`.

| ย้อน | ไฟล์ | ผลลัพธ์ | ข้อควรระวัง |
| --- | --- | --- | --- |
| 052 | `…052….rollback.sql` | คืนสิทธิ์เขียนเดิมทั้ง 10 object (ACL เท่าก่อน 052 ทุกประการ) | — |
| 054 | `…054….rollback.sql` | ลบ marker, คืนฟังก์ชัน 3 อาร์กิวเมนต์ + สิทธิ์ตาม 029, คืน CHECK 5 หมวด + ลบ `context` **เฉพาะเมื่อไม่มีรายงานหมวดใหม่**; ถ้ามี จะเก็บ CHECK ที่ขยายและ `context` ไว้ (ไม่ลบรายงานใด) และแจ้งด้วย NOTICE | แท็บที่เปิดค้างยังเสนอ 10 หมวดจนกว่าจะรีโหลด; ส่งหมวดใหม่หลัง rollback จะได้ข้อความขออภัยของแอป |
| 053 | ทางเลือกที่ปลอดภัยเสมอ: `update public.resources set slug = null;` — ลิงก์กลับเป็น UUID ในราว 5–6 นาที ไม่แตะ schema · หรือ `…053….rollback.sql` ลบ slug/constraint/index/คอลัมน์ | view `resource_catalog` ยังคงคอลัมน์ `slug` ที่เป็น NULL เสมอ (เพื่อไม่ต้องแตะ policy ของ `saved_resources` ที่พึ่ง view; แอปทั้งสองเวอร์ชันรองรับ) | **ห้าม** `drop view resource_catalog` มือ (`cascade` จะทิ้ง policy 2 ตัวของ `saved_resources`); ถ้า slug ถูก index/แชร์ไปแล้ว URL slug จะกลายเป็น 404 จนกว่าบอทจะ crawl ใหม่ — แก้ไปข้างหน้าแทน rollback |

ทดสอบแล้ว: rollback แต่ละไฟล์คืนสถานะเดิมจริง (เทียบ fingerprint ของ ACL/view/constraint/index/function/policy/ข้อมูล) รันซ้ำได้ และ apply ไปข้างหน้าซ้ำหลัง rollback ได้ผลเท่าเดิม; ย้อนทั้งสามตามลำดับ 054 → 053 → 052 เหลือความต่างเพียงคอลัมน์ `slug` (NULL) ของ view.

### 5.8 หลักฐานและข้อจำกัด

`npm run test:migration-chain-sql` (31 checks, ~25 วินาที ไม่ต้องใช้ credential/เครือข่าย): เล่น migration 001–051 จริงทั้งหมดบน PGlite (PostgreSQL 17 compile เป็น WebAssembly) พร้อม role `anon`/`authenticated`/`service_role` และ default privileges แบบ Supabase แล้วทดสอบทุกข้อใน 5.2 รวมพฤติกรรมในฐานะ `anon`/`authenticated`/สมาชิก. สคริปต์อื่นที่เกี่ยวข้อง: `test:privilege-hardening-sql`, `test:resource-slug-sql`, `test:platform-completion-sql` (เล่น migration จริงบางชุดรวม 053/054), และ vitest pin tests (เทียบข้อความ view/ฟังก์ชันกับ 029 โดยตรง).

**ไม่ครอบคลุม (ต้องดูบนของจริง):** Supabase Storage/GoTrue/PostgREST จริง (ใช้ stub ของ `auth`/`storage`); PostgreSQL เวอร์ชันของโปรเจกต์ (ทดสอบบน 17; สิทธิ์ `MAINTAIN` มีเฉพาะ 17+ — ดู 052 หัวไฟล์ "NOT COVERED"); ข้อมูล/แก้มือใน production ที่ไม่ได้มาจาก migration (pre-check และ guard มีไว้ตรงนี้); ความหน่วงล็อกภายใต้โหลดจริง (ตั้ง `lock_timeout` ให้ล้มเร็วแทนคิวรอ ถ้าล้มให้รันใหม่ช่วงเงียบ).

---

## 6. Tests

| ชุด | ผล |
| --- | --- |
| `npm test` (vitest) | **842 ผ่าน / 90 ไฟล์** (main 579) — เพิ่ม: matrix สิทธิ์ 35, access label, discovery + 31 เทสต์ขอบของการค้นหา, grade, slug (รวม corpus ร่วมกับ DB), SEO, analytics, user messages, ปุ่ม busy/โฟกัส, guard รายการโปรด, pin test ของ migration/rollback/verification, ขนาดปุ่ม/โครงสร้าง CSS ที่สำคัญ |
| SQL engine (PGlite) | `test:membership-sql`, `resource-file`, `public-resource`, `resource-placeholder`, `resource-discovery`, `platform-completion`, `privilege-hardening`, `resource-slug`, **`migration-chain` (31 checks, สายจริง)** — ผ่านทั้งหมด |
| Lint / Types | `npm run lint` 0 error 0 warning · `tsc --noEmit` ผ่านหลัง `next typegen` |
| Browser QA (Chromium จำลองมือถือ/เดสก์ท็อป, build จริง + mock Supabase REST) | **สาธารณะ 114 หน้า** × 6 ขนาดจอ (375/390/430/768/1024/1366) และ **สมาชิกฟรี/Pro 192 หน้า**: ไม่มี overflow, console/page error, คำต้องห้าม (ยกเว้น 12 รายการที่คาดไว้: หน้า 404 ที่เบราว์เซอร์รายงานสถานะ 404 และนโยบายความเป็นส่วนตัวที่ระบุชื่อ Supabase เป็นผู้ประมวลผลข้อมูล) · **ปฏิสัมพันธ์ 31/31** (แตะการ์ด, bottom sheet, ค้นหา, หัวใจ, ฟอร์มรายงาน) · **ล็อกอิน/ออกจากระบบ/สมัคร/ลืมรหัส 33/33** (ข้อความ error ไทย, ไม่มี session ก่อนยืนยัน, ออกจากระบบเฉพาะเครื่องนี้, `/app` ปิดอีกครั้งหลังออก) · **แป้นพิมพ์ 37/37** · **axe 36 มุมมอง** · **CLS** รายหน้า |

เมทริกซ์ "ฟรีเปิด Pro ไม่ได้ / Pro เปิดได้ / ผู้เยี่ยมชมเปิดได้เฉพาะ public / URL ที่ถูกคัดลอกหรือแก้ไม่ข้ามสิทธิ์" ครอบด้วย: matrix 35 กรณี (ตรรกะ UI), เทสต์ route `/api/resources/[id]/open` และ `/download` (9 + 17 กรณี: ผู้เยี่ยมชม, สมาชิกฟรีกับ URL premium ที่คัดลอก, id ผิดรูปแบบ, resolver ล้ม/ค้าง, ไม่ echo token), และการตัดสินจริงที่ DB (ผู้ตรวจอิสระเล่นสายจริง — ข้อ 3.2).

**ข้อจำกัด:** ยังไม่ได้ทดสอบบน iOS Safari / Android Chrome จริง, ไม่ได้ทดสอบกับ Supabase จริง (RLS/Storage), และการชำระเงินจริงไม่ได้ทดสอบ.

---

## 7. Build, dependencies, bundle, performance — main เทียบ PR

| รายการ | main (`0709536`) | PR |
| --- | --- | --- |
| `next build` | สำเร็จ | สำเร็จ ไม่มี warning |
| `tsc --noEmit` | `LayoutProps` not found (ชนิดที่ Next สร้างตอน typegen/build) | เหมือนกันก่อน typegen; **ผ่านหลัง `next typegen`** (ทั้งสองฝั่งเหมือนกัน ไม่ใช่ regression) |
| Routes | — | `/resources/[id]` → `/resources/[key]` · `/` และ `/sitemap.xml` เป็น ISR 5 นาที · `/admin` เปลี่ยนจาก static เป็น dynamic (server layout ตรวจสิทธิ์) · `/resources` และ `/resources/[key]` dynamic เหมือนเดิม |
| proxy matcher | `/login /app /admin` | เพิ่ม `/resources`, `/resources/:path*` |
| ไฟล์ที่เปลี่ยน | — | 144 ไฟล์ (ณ `0339789`) แบ่งเป็น commit ตามหัวข้อ (ตัวเลขแน่นอนดูแท็บ Files changed) |

**Dependencies:** ไม่มี package เพิ่ม/ลด — `package.json` เปลี่ยน 2 บรรทัด (`next`, `eslint-config-next` 16.3.3 → 16.3.8) และ lockfile ปรับเฉพาะเวอร์ชัน (next + swc binaries, sharp + libvips, source-map-js 1.2.1 → 1.2.2, fastq 1.20.1 → 1.20.3). `npm ci --dry-run` ผ่าน; ไม่มี package ที่ deprecated เพิ่ม (มี `eslint@9` ที่ถูกระบุ deprecated อยู่แล้วบน main).

| `npm audit` | main | PR |
| --- | --- | --- |
| production (`--omit=dev`) | 3 (1 critical: next/og RCE · 2 high: sharp, source-map-js) | **0** |
| ทั้งหมดรวม dev | 9 (8 high, 1 critical) | 6 high — ทั้งหมดอยู่ในสาย lint/glob (`brace-expansion`, `braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` → `eslint-config-next`) ไม่ถูก ship และไม่ได้เกิดจาก PR นี้; `braces` ไม่มีเวอร์ชันแก้ — ทางแก้เดียวของ npm คือถอย `eslint-config-next` เป็น 14.x (breaking) จึงไม่ทำ |

**Bundle (JS ฝั่ง client ต่อ route, KB):** ทุก route ของแอปเล็กกว่า main (ยกเว้น `/_global-error` หน้า fallback ที่ใหญ่ขึ้น ≈ 0.3 KB gzip)

| route | main raw / gzip | PR raw / gzip | Δ gzip |
| --- | --- | --- | --- |
| `/` | 980 / 290 | 950 / 282 | −8.7 |
| `/resources` | 628 / 195 | 615 / 192 | −3.5 |
| `/resources/[id]` → `[key]` | 950 / 283 | 898 / 266 | −17 |
| `/app` | 1,034 / 305 | 1,010 / 298 | −7.6 |
| `/login` | 927 / 277 | 881 / 263 | −13.9 |
| `/membership` | 998 / 293 | 966 / 282 | −10.4 |
| `/admin` | 1,091 / 316 | 1,061 / 307 | −8.2 |
| JS ทั้งหมด (static chunks) | 1,689 / 494 | 1,546 / 447 | −47 |

**Performance (ตรวจโดยไม่แตะ production):** ไม่มี N+1 (คลังสาธารณะอ่านครั้งเดียวผ่านแคชร่วม, related/ค้นหาคำนวณในหน่วยความจำจาก snapshot เดียวกัน); entitlement ไม่ถูกอ่านซ้ำต่อการ์ด (อ่านครั้งเดียวต่อคำขอ/ต่อ mount); key ของแคช `public-catalog-v2` ไม่ขึ้นกับผู้ดู; การค้นหามี WeakMap cache ของข้อความค้นหาได้ต่อรายการ (ตัวเลขข้อ 4); หน้าแรกเป็น server-rendered (ไม่ต้องรอ JS เพื่อเห็นเนื้อหา); filter sheet เป็น native popover ไม่ต้องใช้ JS; polling Founder ลดเหลือ 5 นาทีและหยุดเมื่อแท็บซ่อน; ฟอร์มรายงานตรวจ marker ล่วงหน้าตอน mount (ไม่รอตอนกด). **ที่ยังเป็น follow-up:** รูปปกเสิร์ฟขนาดต้นฉบับจาก Storage (ไม่ resize) — ควรใช้ image transformation; รีวิวดึงฝั่ง client ต่อการเปิดหน้ารายละเอียดหนึ่งครั้ง; CLS ของ `/membership` (R13).

ลำดับอ่านรีวิวที่แนะนำ (ตาม commit): `1a8d17d`/`c35ed8d` สิทธิ์ → `2c743c9`/`caeee92` security → `bd0555a`/`a075fd4`/`e0d2b51` ข้อความ → `c9aa3b4` ชั้นเรียน → `c0266b4` หน้าแรก+pricing → `2265026`/`b3fb3c3` การ์ด/ตัวกรอง → `64864f5` SEO/slug → `f59bf1e` analytics/รายงาน → `0a87ee2`/`b171434`/`ec35758` test + QA → `859d586` ค้นหา → `06c2cb6` dependencies → `3dad8cd`/`20b25b6`/`2d6441b` security/SEO/a11y รอบสุดท้าย → `a336f9d`/`f2b64da` migration + เทสต์สายจริง → `d2dc773`/`4d4dcf2`/`0339789` SEO/โฟกัส/รายการโปรด.

---

## 8. Manual QA checklist (หลักฐานเดิม + R18 ที่ยังต้องรันบนเครื่องจริง)

### ACCESS
- [ ] ไม่ล็อกอิน: ป้ายสื่อ public = "ใช้ฟรี", สื่อสำหรับสมาชิก = "สมาชิกฟรี", สื่อแพ็ก = "Teacher Pro" (ป้ายไม่เปลี่ยนเมื่อล็อกอินด้วยบัญชีอื่น)
- [ ] สื่อ "ใช้ฟรี": กด "เริ่มเล่นฟรี/เปิดใช้ฟรี" เปิดได้โดยไม่ต้องล็อกอิน
- [ ] สื่อ "สมาชิกฟรี": ผู้เยี่ยมชมเห็น "สมัครฟรีเพื่อใช้งาน" → สมัครแล้วเข้า `/app` (นโยบายเดิม: การสมัครไม่พาต่อไปยังสื่อหรือข้อเสนอเสียเงิน ต้องเลือกใหม่ในแอป) ส่วนล็อกอินบัญชีเดิมกลับมาที่สื่อที่เปิดค้างไว้ได้
- [ ] สื่อ "Teacher Pro": สมาชิกฟรีเห็น "ใช้ด้วย Teacher Pro" ไปหน้าสมัครแพ็ก; Pro/Founder เปิดได้; แพ็กหมดอายุ = ใช้ไม่ได้
- [ ] ลิงก์ดาวน์โหลด/เปิดตรง ๆ ของสื่อที่ไม่มีสิทธิ์ (คัดลอก `/api/resources/<id>/open` ไปเปิดด้วยบัญชีฟรี/ไม่ล็อกอิน) → หน้า error ภาษาไทย ไม่มี JSON/ข้อความระบบ และไม่ได้ไฟล์/ปลายทาง
- [ ] สื่อ "ยังไม่เปิดใช้งาน" ไม่อยู่ใน sitemap/related และ noindex
- [ ] `/admin` ด้วยบัญชีสมาชิกธรรมดา → ถูกส่งออก (ไม่เห็นหน้าแอดมิน); แอดมิน/owner เข้าได้
- [ ] ออกจากระบบ → กด Back → `/app` ไม่แสดงข้อมูลสมาชิก

### MOBILE (375 · 390 · 430 · 768 · 1024 · 1366) — **เครื่องจริงอย่างน้อย iPhone Safari + Android Chrome + LINE in-app browser**
- [ ] ไม่มี scroll แนวนอนที่ `/`, `/resources`, `/resources/<สื่อ>`, `/membership`, `/login`, `/app` ทุกแท็บ, `/terms`, `/privacy`
- [ ] ปุ่ม/ลิงก์หลักแตะง่าย (≈44px): การ์ด, ตัวกรอง, เมนูหัว, จุด carousel, ปุ่มล้างคำค้น
- [ ] ตัวกรองบนมือถือ: เปิด/ปิด sheet (แตะนอก/ปุ่ม ✕), เลือกแล้วกด "ดูผลลัพธ์", ตัวเลขบนปุ่มถูกต้อง
- [ ] iPhone: แถบเมนูล่างของ `/app` ไม่ถูก safe-area บัง, ปุ่ม "ติดต่อแอดมิน" ไม่บังปุ่มหลัก
- [ ] หน้า `/app` คลังสื่อที่ 1024–1300px ตัวกรองไม่ถูกตัด
- [ ] พิมพ์ในช่องค้นหาด้วยแป้นพิมพ์ไทยบนมือถือ (ป.3, ประถม 3, grammer) ผลถูกต้อง ไม่ค้าง

### PURCHASE (รายการเดิมใช้ Preview; R18 รอบถัดไปใช้ธุรกรรมจริงที่เจ้าของควบคุมและบันทึกผล)
- [ ] `/membership` ผู้เยี่ยมชม → ล็อกอิน → กลับมาเลือกแพ็ก → สร้างเลขอ้างอิง ("การสร้างเลขอ้างอิงยังไม่นับสิทธิ์/ยังไม่จองสิทธิ์")
- [ ] ขั้นตอนส่งสลิปทาง LINE และสถานะ "รอตรวจ"; แอดมินยืนยัน → สิทธิ์ใช้งาน → สื่อ Pro เปิดได้
- [ ] Founder: หน้าสาธารณะเห็นเฉพาะ "จำกัด 100 บัญชีแรก" (ไม่มีตัวเลขคงเหลือ/แถบ); แอดมินเห็นจำนวนจริง; เมื่อเต็มระบบยังบล็อกการสมัครราคา Founder
- [ ] ราคา/ข้อความต่ออายุตรงกับที่ตั้งค่า (299 ปีแรก / 599 ต่อปี ตามค่าปัจจุบัน — งานนี้ไม่ได้เปลี่ยนราคา)
- [ ] CTA อัปเกรดทุกจุดไปทางเดียวกัน (`/membership`)

### RESOURCE
- [ ] หน้ารายละเอียด: หัวข้อที่ไม่มีข้อมูลหายไป, แสดงชั้นเรียนเป็นช่วง ("ป.2–ม.3"), related 3–6 รายการ
- [ ] ค้นหา "ประถม 4", "P4", "vocabulary", "ไวยากรณ์", "ป3"; ค้นหาไม่พบ → หน้าว่างพร้อมทางลัด
- [ ] รีวิว: เฉพาะผู้มีสิทธิ์ใช้สื่อ; ผู้อื่นเห็นเหตุผลชัดเจน
- [ ] แจ้งปัญหา: ก่อน 054 มี 5 หมวด / หลัง 054 มี 10 หมวด, ส่งแล้วขึ้นข้อความขอบคุณ ไม่ใช่ error ดิบ; แอดมินเห็นรายงานพร้อมบริบท
- [ ] แอดมิน: เผยแพร่สื่อที่ไม่ระบุระดับชั้นไม่ได้; รายการที่เผยแพร่แล้วแต่ไม่มีชั้นมีคำเตือน
- [ ] เวอร์ชันแอปแสดงใน "ติดต่อแอดมิน" และหน้าแอดมิน (รูปแบบ `0.1.0+abc1234`)
- [ ] ใช้แป้นพิมพ์อย่างเดียว: Tab ไปถึงทุกปุ่มสำคัญ มีเส้นโฟกัสเห็นชัด, Enter/Space กดหัวใจแล้วโฟกัสไม่หลุด

### SEO-SLUG
- [ ] **ก่อน 053:** `/resources/<uuid>` = 200, canonical เป็น UUID; `/resources/<slug>` = 404
- [ ] **หลัง 053 (ราว 5–6 นาที):** `/resources/<uuid>` → 308 ไป slug; slug = 200; canonical = `https://kruaorry.com/resources/<slug>`; ตัวพิมพ์ใหญ่ → 308 เป็นตัวเล็ก; slug ที่ไม่มี = 404 (คำสั่งตรวจอยู่ข้อ 10)
- [ ] `/sitemap.xml` มีเฉพาะ slug (ไม่มี UUID, ไม่มีสื่อ locked); `/robots.txt` ไม่มีบรรทัด `Host:` และ Disallow `/app /admin /auth /download /api /reset-password`
- [ ] `/resources?q=…` หรือมีตัวกรอง → `noindex, follow` และ canonical `/resources`; `/login /membership /app /admin` noindex
- [ ] JSON-LD (LearningResource + BreadcrumbList) ผ่าน Rich Results Test; ตัวอย่างแชร์ LINE/Facebook มีชื่อ+รูป (ไม่มีปก → ใช้ mascot); `/terms` `/privacy` มี description ของตัวเอง
- [ ] ส่ง sitemap ใหม่ใน Search Console หลัง 053; ห้าม rollback 053 หลังถูก index แล้ว (slug จะกลายเป็น 404 จนกว่าบอทจะ crawl ใหม่) — แก้ไปข้างหน้าแทน

---

## 9. ลำดับ rollout production (บันทึก runbook ที่ใช้แล้ว — ห้ามรันซ้ำแบบ blind)

> ขั้นตอนนี้ถูกดำเนินการแล้ว. ก่อนใช้ในอนาคตต้องอ่าน “สถานะ Production หลัง rollout” และตรวจ ledger/schema ใหม่ทุกครั้ง โดยเฉพาะ history drift ของ 052–054.

ผู้ทำ: นักพัฒนาที่มีสิทธิ์ Supabase/Vercel. เจ้าของระบบตัดสินใจเฉพาะ "merge" (ขั้น 1). **ทุกขั้นมีเงื่อนไขหยุด — ถ้าเจอ ให้หยุดและ rollback ตามข้อ 11 แล้วค่อยหาสาเหตุ**

**ขั้น 0 — เตรียม (ไม่เปลี่ยนอะไร)**
1. อ่านข้อ 3.3 และ 12 ให้จบ; ยืนยัน backup/PITR (5.3 ข้อ 4).
2. Vercel → Project → Settings → Environment Variables: ดูว่า `NEXT_PUBLIC_SUPABASE_URL` ของ **Preview** ชี้โปรเจกต์ไหน. ถ้าเหมือน Production = **Preview ใช้ฐานข้อมูลจริง** (การ apply บน "Preview" คือ apply production) → ใช้ Supabase Branch (ถ้าแพ็กรองรับ) หรือทำข้อ 3–6 โดยถือว่าเป็น production และเตรียม rollback ไว้ในแท็บอื่น.
3. รัน `pre-check.sql` (5.4) — ต้องผ่านทุกแถว. **หยุด** ถ้ามีแถวไม่ผ่าน.

**ขั้น 1 — deploy แอป** (เจ้าของ merge; Vercel deploy production). ตรวจ (ยังไม่มี migration): `/`, `/resources`, `/resources/<uuid>` = 200 และ canonical เป็น UUID, `/resources/<slug>` = 404, ล็อกอิน → `/app` → หัวใจ/โปรไฟล์/`/membership`/`/admin` (แอดมิน) ทำงาน, ฟอร์มรายงานมี 5 หมวด, `/sitemap.xml`, `/robots.txt`. **หยุด** ถ้ามีหน้าใดพัง → ย้อนแอป (ข้อ 11).

**ขั้น 2 — 052** (สิทธิ์เขียน)
1. `supabase db push` (หรือวาง 052 ใน SQL editor) → `052-verify.sql` ต้องผ่านทั้ง 29 แถว.
2. คลิกทดสอบทันที: ล็อกอิน, บันทึก/เอาออกรายการโปรด, แก้โปรไฟล์, เปิด `/membership`, สร้างเลขอ้างอิง, แอดมินเปลี่ยนแพ็กสมาชิก/อนุมัติ, แก้ข้อความ benefit, สลับสื่อแนะนำ.
3. เฝ้า Postgres log 15–30 นาที: `permission denied for table …` บน 10 object แปลว่ามีทางเขียนที่ไม่เคยพบ → **rollback 052 ทันที** (คำสั่งเดียว) แล้วแจ้งทีม. ตัวอย่างใน Supabase Logs Explorer: `select timestamp, event_message from postgres_logs where event_message like '%permission denied for table%' order by timestamp desc limit 50`.

**ขั้น 3 — 054** (หมวดรายงาน)
1. apply → `054-verify.sql` ผ่านทั้ง 7 แถว.
2. เปิดสื่อหนึ่งชิ้นด้วยบัญชีทดสอบ → ฟอร์ม "แจ้งปัญหา" ต้องมี 10 หมวด → ส่งหมวดใหม่หนึ่งรายการ → แอดมินเห็นรายงานพร้อมบริบท (เวอร์ชัน/เบราว์เซอร์/ระบบ/ขนาดจอ).
3. **หยุด** ถ้าส่งไม่ได้ → rollback 054.

**ขั้น 4 — 053** (slug) — ทำสุดท้ายเพราะผู้ใช้/บอทเห็นผล
1. `053-verify.sql` ผ่านทั้งหมด (แถว info: N slug, รายชื่อสื่อที่เผยแพร่แล้วยังไม่มี slug).
2. รอราว 5–6 นาที (หลังหมดอายุให้เปิดหน้ารายการสองครั้ง) หรือ redeploy แล้วรันข้อ 10 (curl) ทั้งชุด.
3. ตั้ง slug ให้สื่อที่เผยแพร่แล้วแต่ยังไม่มี (R11) ถ้าต้องการ: `update public.resources set slug = 'my-slug' where id = '…';` (รูปแบบ/ซ้ำถูกปฏิเสธโดย DB).
4. ส่ง sitemap ใหม่ใน Search Console.
5. **หยุด** ถ้ามีหน้าสื่อใด 404/500 → `update public.resources set slug = null;` (ไม่แตะ schema).

**ขั้น 5 — เฝ้าระวัง 24 ชม.แรก:** Vercel runtime logs ของ `/resources/*`, `/api/resources/*`, `/auth/callback`; Supabase Postgres logs (permission denied / error spike); จำนวนรายงานปัญหา; อัตราล็อกอินสำเร็จ.

## 10. Post-deploy validation (คำสั่งตรวจ — ค่าที่คาดจากการทดสอบบน build จริงกับ mock)

```bash
BASE=https://kruaorry.com
UUID=<id ของสื่อที่มี slug>   # เช่น Sentence Train = 86afb9c3-20f2-4ab6-9ebc-9a454b36692b
SLUG=<slug ของสื่อนั้น>        # sentence-train

curl -sI "$BASE/resources/$UUID" | grep -iE '^HTTP|^location'     # หลัง 053: 308 + location: /resources/<slug>
curl -sI "$BASE/resources/${SLUG^}" | grep -iE '^HTTP|^location'  # ตัวพิมพ์ใหญ่: 308 → /resources/<slug>
curl -sI "$BASE/resources/$SLUG" | grep -iE '^HTTP|^x-content|^x-frame'   # 200 + nosniff + SAMEORIGIN
curl -sI "$BASE/resources/does-not-exist" | grep -i '^HTTP'       # 404
curl -s  "$BASE/resources/$SLUG" | grep -o '<link rel="canonical"[^>]*>'  # href="https://kruaorry.com/resources/<slug>"
curl -s  "$BASE/sitemap.xml" | grep -o '<loc>[^<]*</loc>'         # เฉพาะ slug ไม่มี UUID/สื่อ locked
curl -s  "$BASE/robots.txt"                                       # Disallow /app /admin /auth /download /api /reset-password + Sitemap:, ไม่มี Host:
curl -s  "$BASE/resources?q=x" | grep -o '<meta name="robots"[^>]*>'     # noindex, follow
curl -sI "$BASE/api/resources/not-a-uuid/open" | grep -i '^HTTP'  # 404 (หน้า HTML ภาษาไทย)
curl -sI "$BASE/api/resources/<id สื่อสมาชิก/Pro>/open" | grep -iE '^HTTP|^cache-control|^referrer'   # ไม่ล็อกอิน: 403 + no-store + no-referrer (สื่อ public จะ redirect ไปปลายทางตามปกติ)
```

---

## 11. Rollback (รวม)

| อะไร | วิธี |
| --- | --- |
| แอป | Vercel: promote deployment ก่อนหน้า หรือ revert merge — แอปเข้ากันได้กับ DB ทั้งก่อน/หลัง migration จึงย้อนแอปได้โดยไม่ต้องย้อน DB |
| 052 | `supabase/rollbacks/…052….rollback.sql` (คำสั่ง `grant` เดียว) |
| 054 | `supabase/rollbacks/…054….rollback.sql` (ไม่ลบรายงาน) |
| 053 | `update public.resources set slug = null;` (แนะนำ) หรือ `supabase/rollbacks/…053….rollback.sql` — อ่านคำเตือน SEO ในข้อ 5.7 |
| ledger | `supabase migration repair --status reverted <version>` หลัง rollback |
| Analytics | ปิดโดยไม่ตั้ง GTM/Plausible — ไม่มี provider = ไม่ส่งอะไรออกไป |

---

## 12. ความเสี่ยงที่ทราบ (ยอมรับ/ยังไม่แก้ใน PR นี้)

| # | เรื่อง | ผลกระทบ | ทางลด / ข้อเสนอ |
| --- | --- | --- | --- |
| R1 | route เปิด/ดาวน์โหลดสื่อ (ออก signed URL) ยังไม่มี throttle ต่อผู้ใช้/ไอพี — บัญชีเดียววนเรียกเพื่อดึงสื่อทั้งคลัง/แชร์บัญชีได้ (กลาง; ผลคือต้นทุน/การละเมิด ไม่ใช่ข้อมูลรั่ว) | ต้นทุน egress, การแจกจ่ายสื่อ Pro | **กฎ WAF บน Vercel** rate limit `/api/resources/*` (ไม่ต้องแก้โค้ด); ระยะยาว: RPC นับการดาวน์โหลดต่อผู้ใช้ที่ตารางเล็ก (ต้อง migration แยก) (มีมาตรการเก็บข้อมูลแล้ว — ดูบันทึกส่วนตัว) |
| R2 | สื่อ `public` แบบ **ไฟล์** ผู้เยี่ยมชมโหลดไม่ได้จริง — policy ของ Storage `resource_covers_admin_write` ไม่มี `TO` จึงถูกประเมินกับ anon แล้วเรียก `is_admin()` ที่ anon เรียกไม่ได้ (ต่ำ; ล้มแบบปลอดภัย = หน้า error) | ไม่มีสื่อ seed แบบนี้ในวันนี้ (public ทั้งหมดเป็นเว็บ) | migration แยกให้ policy เป็น `to authenticated` + ตัดสินใจเชิงผลิตภัณฑ์ว่าจะอนุญาต public+file หรือไม่ (นโยบาย 022 = ไฟล์ต้องสมัครสมาชิก) |
| R3 | สมาชิกที่ล็อกอินทุกคนลิสต์ bucket `resource-covers` ได้ รวมปกของสื่อ draft/archived (ต่ำ; มีแค่ภาพและชื่อไฟล์) | ภาพก่อนเผยแพร่เห็นได้ | อัปโหลดปก draft ใต้ prefix ส่วนตัว หรือกรองลิสต์ด้วยสถานะ — หรือยอมรับความเสี่ยง |
| R4 | รีวิวไม่มี throttle ต่อชั่วโมง (ต่ำ; รีวิวใหม่เป็น pending เห็นเฉพาะแอดมิน) | คิวตรวจรีวิวถูกท่วมได้ | ทำแบบเดียวกับรายงานปัญหา (เช่น 10 รีวิวใหม่/ชม.) ใน migration แยก |
| R5 | ข้อมูลสาธารณะล้าหลังได้ราว 5–6 นาที (`/` และ sitemap มีชั้น ISR ซ้อน) | สื่อที่เพิ่งเผยแพร่/ปิด/ล็อกยังไม่สะท้อน | หลังหมดอายุ คำขอแรกยังได้ข้อมูลเดิมและสั่งให้รีเฟรช คำขอถัดไปได้ข้อมูลใหม่; ตัวเลือก: route ของแอดมินเรียก `revalidateTag("catalog")` หลังเปลี่ยน |
| R6 | Flow ยืนยันอีเมลและ callback ยังต้องตรวจแบบ end-to-end บนสภาพแวดล้อมแยกก่อนเปลี่ยนการตั้งค่า | หากปรับโดยไม่ทดสอบ การสมัครหรือกู้คืนบัญชีอาจสะดุด | ตรวจ flow อีเมล/callback บน staging ก่อนปรับ template; รายละเอียดอยู่ในบันทึกส่วนตัว |
| R7 | สิทธิ์เขียนของ `anon`/`authenticated` บนตารางอื่น (`profiles`, `resources`, `saved_resources`, `upgrade_requests`, `requests`) เหลือ ถูกกันด้วย RLS/trigger เท่านั้น (info) + `REFERENCES`/`TRIGGER`/`MAINTAIN`(PG17+) บน 10 object ของ 052 | ไม่เป็นช่องโหว่วันนี้ (ทดสอบทุกการเขียนแล้วถูกปฏิเสธ) | migration แยกหลังตรวจว่าแอปเขียนตารางไหนตรง (บางตารางแอดมินเขียนจาก browser จริง) |
| R8 | session แบบ anonymous ของ Supabase ผ่าน guard ไม่เท่ากันในบาง RPC (info) | เข้าถึงไม่ได้วันนี้ (`profiles.email NOT NULL` ทำให้ session แบบนี้สมัครไม่ได้) | เติม guard `is_anonymous` ใน `create_membership_application` และ policy insert ของ `saved_resources` เผื่อวันที่ผ่อน NOT NULL |
| R9 | ยังไม่มี Content-Security-Policy | ไม่มีชั้นกัน XSS เพิ่ม | เริ่มจาก report-only ที่ทดสอบกับ inline script ของ Next และฟอนต์ก่อน |
| R10 | `X-Frame-Options: SAMEORIGIN` | พาร์ตเนอร์ที่ฝังเว็บนี้จะเห็นว่าง | แจ้งก่อน (ข้อ 3.3) |
| R11 | สื่อปัจจุบัน 22/22 มี slug แล้ว แต่สื่อที่เผยแพร่ในอนาคต **ไม่ได้ slug อัตโนมัติ** (แอดมินและ `admin_save_resource` ยังไม่มีช่อง slug) | SEO ของสื่อใหม่ | เพิ่มช่อง slug/RPC หลังมี staging แยก |
| R12 | **Contrast ของสีแบรนด์ต่ำกว่า WCAG AA (4.5:1)**: ปุ่มหลัก `#8a6df0` + ตัวขาว = 3.80; ข้อความรอง `#8a809e` บนพื้น `#f1eff7`/`#f8f7fc`/ขาว = 3.25/3.48/3.71; ข้อความสีแบรนด์ `#7355da` บน `#ede7ff` = 4.32 | ผู้มีสายตาไม่ดีอ่านยาก | งานถัดไปที่อนุมัติแล้ว: ปุ่มหลัก `#7d5cee` (4.53), ข้อความรอง `#6f6584` (4.76–5.43), ข้อความแบรนด์บนพื้นอ่อน `#6f50d9` (4.57) — ทำเป็น PR โค้ดแยก |
| R13 | `/membership` ที่ ≥ 1280px: หัวข้อ hero เปลี่ยนจากค่า fallback "299 บาทเฉพาะปีแรก" เป็นป้ายจากฐานข้อมูล "299 บาท (เฉพาะปีแรก)" แล้วตัดบรรทัดเป็น 2 บรรทัด → CLS 0.18 (**มีบน main เหมือนกัน**: build ของ main กับ mock เดียวกันแสดงหัวข้อเปลี่ยน 83 → 166 px ตามลำดับเดียวกัน จึงไม่ใช่ regression; ไม่ได้แก้เพราะเป็นข้อความแพ็ก/ราคาและมีเทสต์ล็อกข้อความเดิม) | กระตุกเล็กน้อยตอนโหลด หน้า noindex | ใช้สตริง fallback เดียวกับป้ายใน DB (migration 048 ตั้ง `299 บาท (เฉพาะปีแรก)`) + ปรับเทสต์ `membershipFrontend.test.ts` — เจ้าของอนุมัติเพราะแตะข้อความราคา |
| R14 | proxy เพิ่มการเรียก auth 1 ครั้งต่อคำขอของสมาชิกที่ล็อกอินบน `/resources`, `/app` (ผู้เยี่ยมชมไม่มี) | ความหน่วง/โควตา Supabase Auth เพิ่มเล็กน้อย | เฝ้าดูโควตา; ถ้าจำเป็นลดด้วยการแคชผลชั่วคราว |
| R15 | รูปปกเสิร์ฟขนาดต้นฉบับ; รีวิวดึงฝั่ง client ต่อการเปิดรายละเอียด | แบนด์วิดท์/เวลาโหลดบนมือถือช้า | image transformation ของ Supabase หรือ loader ของ `next/image`; ดึงรีวิวฝั่งเซิร์ฟเวอร์ |
| R16 | dev-only npm advisories 6 รายการ (สาย lint/glob), `eslint@9` deprecated | ไม่ถูก ship; กระทบเครื่อง dev/CI | อัปเกรด eslint เมื่อ `eslint-config-next` รองรับ; ไม่ใช้ `npm audit fix --force` |
| R17 | production schema มีผลของ 052–054 แต่ migration ledger ยังหยุดที่ 051; Preview ใช้ DB production ตัวเดียวกัน | migration ถัดไปอาจพยายามรันไฟล์เก่าซ้ำ และไม่มีพื้นที่ซ้อมจริง | repair ledger หลังอนุมัติ แล้วสร้าง staging แยก (Supabase Branching บน Pro หรือ repurpose project เก่าหลังยืนยันว่าเขียนทับได้) ก่อน migration ใหม่ |
| R18 | ยังไม่ได้ทดสอบ: เครื่องจริง (iOS/Android/LINE), Supabase Storage/Auth จริง, การชำระเงินจริง, นโยบายจริงบน production | — | รายการข้อ 3.3 และ 8 |

## 13. สิ่งที่ตั้งใจไม่เปลี่ยน

ราคา (299 ปีแรก / 599 ต่อปี) และข้อความราคาที่ล็อกด้วยเทสต์เดิม · เงื่อนไข/ตรรกะสิทธิ์ใน DB (`access_mode`, `resolve_resource_target`, RLS, Storage policy) · จำนวนและตรรกะ Founder 100 · ขั้นตอนชำระเงิน (LINE + แอดมินยืนยัน) · อัตลักษณ์แบรนด์ (สี/ฟอนต์/มาสคอต) · Supabase Auth settings · ข้อมูล production ทุกอย่าง · secrets และ env (ไม่มีเพิ่ม) · คอลัมน์/ตารางอื่นนอกจากที่ 052–054 ระบุ · ตัวให้บริการ analytics (ไม่ตั้ง provider) · สถาปัตยกรรมหลัก (ยังเป็น Next.js App Router + Supabase เหมือนเดิม).

## 14. Follow-up (ไม่อยู่ใน PR นี้) — เรียงตามคุณค่า

1. ทำ R18 บน iPhone Safari, Android Chrome, LINE in-app browser และธุรกรรมเงินจริงหนึ่งรอบโดยเจ้าของระบบ.
2. เลือก staging Supabase แยก: Branching (ต้อง Pro) หรือยืนยันว่า project เก่าที่ inactive สามารถ repurpose ได้; จากนั้น repair ledger 052–054 ตามขั้นตอนที่อนุมัติ.
3. ทบทวนมาตรการป้องกันการดึงสื่อจำนวนมาก (รายละเอียดอยู่ในบันทึกส่วนตัว).
4. เพิ่มช่อง slug ในแอดมิน + RPC หลัง staging พร้อม (ข้อมูลปัจจุบันครบ 22/22 แล้ว).
5. ปรับ token contrast (R12) เป็น PR โค้ดแยก และ QA สี/axe/viewport.
6. migration เสริมความปลอดภัยหลัง staging พร้อม: scope policy Storage (R2/R3), throttle รีวิว (R4), เพิกถอนสิทธิ์เขียนที่เหลือของ anon/authenticated + `MAINTAIN` (R7), guard anonymous (R8).
7. เปิด analytics provider ตาม `docs/analytics.md` เมื่อพร้อมวัดผล แล้วจึงเริ่ม CSP แบบ report-only (R9) และวัดรูปปกก่อนปรับ image transformation (R15).
8. รวมข้อความราคา fallback (299/599) ใน `membership/page.tsx`, `terms`, `membershipJourney`, `adminMembership` ให้อ่านจากค่าตั้งเดียว + เทสต์กันคลาดเคลื่อน (ต้องให้เจ้าของยืนยันแหล่งความจริงก่อน).
9. `/app` คลังสื่อมีช่องค้นหาสองช่องผูกกับค่าเดียวกัน — ตัดสินใจเชิงดีไซน์ก่อนลดเหลือหนึ่ง; ปุ่มให้ดาวรีวิวควรเริ่มที่ยังไม่เลือก.
10. ค้นหาในหัวหน้า (header search) สำหรับหน้าที่ไม่ใช่หน้าแรก.
