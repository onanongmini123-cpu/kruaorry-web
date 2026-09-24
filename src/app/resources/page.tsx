import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, Lock, Search } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { filterDiscoveredResources, normalizeDiscoveryFilters, type ResourceAccessFilter } from "@/lib/resourceDiscovery";
import { RESOURCE_GRADE_OPTIONS, resourceGradeLabel } from "@/lib/resourceGrades";
import { publicResourceAction, requiredPlansLabel } from "./catalog";
import { loadPublicResources, loadPublicResourceViewer } from "./data";
import { PublicResourceCover } from "./PublicResourceCover";

export const metadata: Metadata = {
  title: "คลังสื่อการสอน | KruAorry",
  description: "ดูตัวอย่างสื่อการสอนที่เผยแพร่จริง เลือกสื่อฟรีหรือสื่อสำหรับสมาชิก แล้วสมัครเพื่อเริ่มใช้ในห้องเรียน",
};

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
  grade?: string | string[];
  access?: string | string[];
}>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim().slice(0, 100);
}

export default async function ResourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = normalizeDiscoveryFilters({
    query: first(params.q),
    category: first(params.category),
    grade: first(params.grade),
    access: first(params.access) as ResourceAccessFilter,
  });
  const [result, viewer] = await Promise.all([loadPublicResources(), loadPublicResourceViewer()]);
  const categories = [...new Set(result.resources.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const visible = filterDiscoveredResources(result.resources, filters);
  const freeCount = result.resources.filter((item) => item.isFree).length;
  const hasFilters = Boolean(filters.query || filters.category || filters.grade || filters.access !== "all");

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
            <form action="/resources" method="get" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: "var(--sp-3)", marginBottom: "var(--sp-7)", alignItems: "end" }}>
              <label style={{ display: "grid", gap: 6, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>
                ค้นหาสื่อ
                <input className="kru-input" name="q" type="search" defaultValue={filters.query} placeholder="พิมพ์วิชา ระดับชั้น หรือเรื่องที่ต้องการ" />
              </label>
              <label style={{ display: "grid", gap: 6, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>
                หมวดหมู่
                <select className="kru-select" name="category" defaultValue={filters.category}>
                  <option value="">ทุกหมวดหมู่</option>
                  {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>
                ระดับชั้น
                <select className="kru-select" name="grade" defaultValue={filters.grade}>
                  <option value="">ทุกระดับชั้น</option>
                  {RESOURCE_GRADE_OPTIONS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.value === "all" ? "สื่อที่ใช้ได้ทุกระดับ" : item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "grid", gap: 6, minWidth: 0, fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>
                สิทธิ์การใช้งาน
                <select className="kru-select" name="access" defaultValue={filters.access}>
                  <option value="all">ทั้งหมด</option>
                  <option value="free">สื่อใช้ฟรี</option>
                  <option value="member">สื่อสำหรับสมาชิก</option>
                </select>
              </label>
              <button type="submit" className="kru-btn kru-btn--primary" style={{ minHeight: 52 }}><Search size={18} />ค้นหา</button>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap", marginBottom: "var(--sp-5)" }}>
                <p style={{ color: "var(--text-muted)" }}>พบ {visible.length} รายการ</p>
                {hasFilters && <Link href="/resources" style={{ fontWeight: "var(--fw-semibold)" }}>ล้างตัวกรอง</Link>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "var(--gap-grid)", alignItems: "stretch" }}>
                {visible.map((item) => {
                  const action = publicResourceAction(item, viewer);
                  const planLabel = requiredPlansLabel(item);
                  return (
                    <article key={item.id} className="kru-card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", height: "100%" }}>
                      <Link href={`/resources/${item.id}`} aria-label={`ดูรายละเอียด ${item.title}`} style={{ display: "block", color: "inherit" }}>
                        <div style={{ position: "relative" }}>
                          <PublicResourceCover title={item.title} url={item.coverImageUrl} deliveryMode={item.deliveryMode} style={{ aspectRatio: "16 / 10" }} />
                          {action.locked && (
                            <span role="img" aria-label={`ล็อก ต้องใช้ ${planLabel}`} style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(255,255,255,.55)" }}>
                              <span style={{ width: 42, height: 42, display: "grid", placeItems: "center", borderRadius: "var(--r-pill)", color: "var(--status-member-fg)", background: "var(--status-member-bg)", boxShadow: "var(--shadow-sm)" }}><Lock size={19} aria-hidden="true" /></span>
                            </span>
                          )}
                        </div>
                      </Link>
                      <div style={{ padding: "var(--sp-5)", display: "flex", flex: 1, flexDirection: "column", gap: "var(--sp-3)" }}>
                        <span style={{ width: "fit-content", borderRadius: "var(--r-pill)", padding: "4px 10px", background: item.isFree ? "var(--status-success-bg)" : "var(--status-member-bg)", color: item.isFree ? "var(--status-success-fg)" : "var(--status-member-fg)", fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)" }}>{item.isFree ? "ใช้ได้ฟรี" : `สำหรับ ${planLabel}`}</span>
                        <h2 style={{ minHeight: "2.8em", display: "-webkit-box", overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 2, fontSize: "var(--fs-20)", lineHeight: "var(--lh-snug)" }}><Link href={`/resources/${item.id}`} style={{ color: "inherit" }}>{item.title}</Link></h2>
                        <p style={{ minHeight: "1.5em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{item.meta || "สื่อพร้อมใช้ในชั้นเรียน"}</p>
                        <p style={{ minHeight: "4.5em", display: "-webkit-box", overflow: "hidden", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, color: "var(--text-body)", fontSize: "var(--fs-15)", lineHeight: "var(--lh-normal)" }}>{item.description || "ดูรายละเอียดของสื่อและสิทธิ์การใช้งานก่อนเปิดใช้"}</p>
                        <div style={{ minHeight: 28, display: "flex", alignItems: "flex-start", gap: 6, flexWrap: "wrap" }}>
                          {item.category && <span className="kru-tag">{item.category}</span>}
                          {item.gradeLevels.slice(0, 2).map((grade) => <span className="kru-tag" key={grade}>{resourceGradeLabel(grade)}</span>)}
                        </div>
                        <div style={{ display: "grid", gap: "var(--sp-3)", marginTop: "auto", paddingTop: "var(--sp-2)" }}>
                          <Link href={`/resources/${item.id}`} style={{ minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, color: "var(--text-link)", fontWeight: "var(--fw-semibold)" }}>ดูเพิ่มเติม <ArrowRight size={17} aria-hidden="true" /></Link>
                          <a
                            href={action.href}
                            className="kru-btn kru-btn--soft kru-btn--block"
                            target={action.opensNewTab ? "_blank" : undefined}
                            rel={action.opensNewTab ? "noopener noreferrer" : undefined}
                            referrerPolicy={action.opensNewTab ? "no-referrer" : undefined}
                          >
                            {action.locked && <Lock size={17} aria-hidden="true" />}{action.label}
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
