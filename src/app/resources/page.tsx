import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Search } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { loadPublicResources } from "./data";

export const metadata: Metadata = {
  title: "คลังสื่อการสอน | KruAorry",
  description: "ดูตัวอย่างสื่อการสอนที่เผยแพร่จริง เลือกสื่อฟรีหรือสื่อสำหรับสมาชิก แล้วสมัครเพื่อเริ่มใช้ในห้องเรียน",
};

type SearchParams = Promise<{ q?: string | string[]; category?: string | string[] }>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim().slice(0, 100);
}

export default async function ResourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = first(params.q);
  const category = first(params.category);
  const result = await loadPublicResources();
  const categories = [...new Set(result.resources.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const visible = result.resources.filter((item) => {
    const matchesCategory = !category || item.category === category;
    const haystack = [item.title, item.meta, item.description, item.category, ...item.tags].join(" ").toLocaleLowerCase("th");
    return matchesCategory && (!query || haystack.includes(query.toLocaleLowerCase("th")));
  });
  const freeCount = result.resources.filter((item) => item.isFree).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-page)" }}>
      <header style={{ background: "var(--surface-card)", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-4) var(--sp-5)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: "var(--fw-bold)", fontFamily: "var(--font-display)", color: "var(--text-strong)" }}><Mascot size={34} /> KruAorry</Link>
          <div style={{ flex: 1 }} />
          <Link href="/login?mode=signup" style={{ color: "var(--text-link)", fontWeight: "var(--fw-semibold)" }}>สมัครสมาชิกฟรี</Link>
        </div>
      </header>

      <main>
        <section style={{ background: "var(--wash-hero)" }}>
          <div style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-10) var(--sp-5)" }}>
            <p style={{ fontSize: "var(--fs-14)", color: "var(--text-link)", fontWeight: "var(--fw-bold)" }}>คลังสื่อสำหรับครูไทย</p>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, var(--fs-44))", maxWidth: 680, marginTop: "var(--sp-3)" }}>เลือกสื่อที่ตรงกับชั้นเรียน ก่อนสมัครใช้งาน</h1>
            <p style={{ fontSize: "var(--fs-18)", color: "var(--text-body)", maxWidth: 670, marginTop: "var(--sp-4)" }}>ดูภาพปก รายละเอียด และหมวดหมู่ของสื่อที่เผยแพร่จริงได้ฟรี เมื่อพบชิ้นที่ถูกใจ สมัครสมาชิกเพื่อเปิดใช้หรือดาวน์โหลด</p>
            {result.status === "ready" && result.resources.length > 0 && <p style={{ marginTop: "var(--sp-5)", color: "var(--text-muted)" }}>สื่อพร้อมดู {result.resources.length} รายการ · สื่อใช้งานฟรี {freeCount} รายการ</p>}
          </div>
        </section>

        <section style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-8) var(--sp-5) var(--sp-13)" }}>
          {result.status === "ready" && result.resources.length > 0 && (
            <form action="/resources" method="get" style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", marginBottom: "var(--sp-7)", alignItems: "end" }}>
              <label style={{ display: "grid", gap: 6, flex: "2 1 250px", fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>
                ค้นหาสื่อ
                <input name="q" type="search" defaultValue={query} placeholder="ชื่อสื่อ วิชา หรือคำสำคัญ" style={{ padding: "12px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border-default)", background: "white", width: "100%" }} />
              </label>
              <label style={{ display: "grid", gap: 6, flex: "1 1 190px", fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>
                หมวดหมู่
                <select name="category" defaultValue={category} style={{ padding: "12px 14px", borderRadius: "var(--r-md)", border: "1px solid var(--border-default)", background: "white", width: "100%" }}>
                  <option value="">ทุกหมวดหมู่</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <button type="submit" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 20px", minHeight: 46, border: 0, borderRadius: "var(--r-md)", background: "var(--brand)", color: "white", fontWeight: "var(--fw-semibold)", cursor: "pointer" }}><Search size={18} />ค้นหา</button>
            </form>
          )}

          {result.status === "unavailable" ? (
            <div role="status" className="kru-card" style={{ padding: "var(--sp-8)", textAlign: "center" }}>
              <BookOpen size={32} style={{ margin: "auto", color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "var(--fs-24)", marginTop: "var(--sp-4)" }}>ยังโหลดคลังสื่อไม่ได้</h2>
              <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>โปรดลองใหม่อีกครั้งในภายหลัง</p>
            </div>
          ) : result.resources.length === 0 ? (
            <div role="status" className="kru-card" style={{ padding: "var(--sp-8)", textAlign: "center" }}>
              <BookOpen size={32} style={{ margin: "auto", color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "var(--fs-24)", marginTop: "var(--sp-4)" }}>ยังไม่มีสื่อจริงที่พร้อมให้ทดลอง</h2>
              <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>ทีมงานกำลังเตรียมสื่อที่เปิดใช้งานได้จริง รายการตัวอย่างที่มีลิงก์ทดสอบจะไม่แสดงบนหน้านี้</p>
            </div>
          ) : visible.length === 0 ? (
            <div role="status" className="kru-card" style={{ padding: "var(--sp-8)", textAlign: "center" }}>
              <h2 style={{ fontSize: "var(--fs-24)" }}>ไม่พบสื่อตามคำค้นนี้</h2>
              <p style={{ color: "var(--text-muted)", marginTop: "var(--sp-3)" }}>ลองใช้คำค้นอื่นหรือเลือกทุกหมวดหมู่</p>
              <Link href="/resources" style={{ display: "inline-block", marginTop: "var(--sp-4)", color: "var(--text-link)" }}>ล้างตัวกรอง</Link>
            </div>
          ) : (
            <>
              <p style={{ color: "var(--text-muted)", marginBottom: "var(--sp-5)" }}>พบ {visible.length} รายการ</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "var(--gap-grid)" }}>
                {visible.map((item) => (
                  <article key={item.id} className="kru-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.coverImageUrl} alt={`ภาพปก ${item.title}`} loading="lazy" referrerPolicy="no-referrer" style={{ width: "100%", aspectRatio: "16 / 10", objectFit: "cover", background: "var(--surface-sunken)" }} />
                    <div style={{ padding: "var(--sp-5)", display: "flex", flex: 1, flexDirection: "column", gap: "var(--sp-3)" }}>
                      <span style={{ width: "fit-content", borderRadius: "var(--r-pill)", padding: "4px 10px", background: item.isFree ? "var(--status-success-bg)" : "var(--status-member-bg)", color: item.isFree ? "var(--status-success-fg)" : "var(--status-member-fg)", fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)" }}>{item.isFree ? "ใช้ได้ฟรี" : "สำหรับสมาชิก"}</span>
                      <h2 style={{ fontSize: "var(--fs-20)", lineHeight: "var(--lh-snug)" }}>{item.title}</h2>
                      {item.meta && <p style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{item.meta}</p>}
                      {item.description && <p style={{ color: "var(--text-body)", fontSize: "var(--fs-15)", lineHeight: "var(--lh-normal)" }}>{item.description}</p>}
                      <Link href={`/resources/${item.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-link)", fontWeight: "var(--fw-semibold)", marginTop: "auto", paddingTop: "var(--sp-3)" }}>ดูรายละเอียดสื่อ <ArrowRight size={17} /></Link>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
