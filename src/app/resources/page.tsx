import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { FilterSheet, ResourceCard } from "@/components/ui";
import {
  ACCESS_FILTER_OPTIONS,
  activeFilterCount,
  filterDiscoveredResources,
  normalizeDiscoveryFilters,
  resourceDiscoveryHref,
  type ResourceAccessFilter,
} from "@/lib/resourceDiscovery";
import { RESOURCE_GRADE_OPTIONS } from "@/lib/resourceGrades";
import { RESOURCE_TYPE_OPTIONS, type ResourceTypeFilter } from "@/lib/resourceMeta";
import { publicFreeAccountAction } from "@/lib/publicAuthState";
import { accessTier } from "@/lib/resourceAccess";
import { publicResourceAction, resourceHref } from "./catalog";
import { loadPublicResources, loadPublicResourceViewer } from "./data";
import "./library.css";

type SearchParams = Promise<{
  q?: string | string[];
  category?: string | string[];
  grade?: string | string[];
  access?: string | string[];
  type?: string | string[];
}>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value ?? "").trim().slice(0, 100);
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const filtered = ["q", "category", "grade", "access", "type"].some((name) => first(params[name as keyof typeof params]));
  return {
    title: "คลังสื่อการสอน",
    description: "ค้นหาเกม สื่อ และเครื่องมือสำหรับห้องเรียน กรองตามระดับชั้น วิชา ประเภท และสิทธิ์การใช้งาน มีทั้งแบบใช้ฟรี สมาชิกฟรี และ Teacher Pro",
    // Every filter combination is the same library: one canonical URL, and
    // result pages for a particular search are not worth indexing.
    alternates: { canonical: "/resources" },
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ResourcesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = normalizeDiscoveryFilters({
    query: first(params.q),
    category: first(params.category),
    grade: first(params.grade),
    access: first(params.access) as ResourceAccessFilter,
    type: first(params.type) as ResourceTypeFilter,
  });
  const [result, viewer] = await Promise.all([loadPublicResources(), loadPublicResourceViewer()]);
  const categories = [...new Set(result.resources.map((item) => item.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th"));
  const visible = filterDiscoveredResources(result.resources, filters);
  const freeCount = result.resources.filter((item) => accessTier(item.accessMode) === "free").length;
  const narrowing = activeFilterCount(filters);
  const hasFilters = Boolean(filters.query) || narrowing > 0;
  const accountAction = publicFreeAccountAction(viewer.authenticated ? "member" : "guest")!;

  return (
    <div style={{ minHeight: "100vh", background: "var(--surface-page)" }}>
      <header style={{ background: "var(--surface-card)", borderBottom: "1px solid var(--border-subtle)" }}>
        <div style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-4) var(--sp-5)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: "var(--fw-bold)", fontFamily: "var(--font-display)", color: "var(--text-strong)" }}><Mascot size={34} /> KruAorry</Link>
          <div style={{ flex: 1 }} />
          <Link href={accountAction.href} style={{ color: "var(--text-link)", fontWeight: "var(--fw-semibold)" }}>{accountAction.label}</Link>
        </div>
      </header>

      <main>
        <section style={{ background: "var(--wash-hero)" }}>
          <div style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-10) var(--sp-5)" }}>
            <p style={{ fontSize: "var(--fs-14)", color: "var(--text-link)", fontWeight: "var(--fw-bold)" }}>คลังสื่อสำหรับครูไทย</p>
            <h1 style={{ fontSize: "clamp(2rem, 5vw, var(--fs-44))", maxWidth: 680, marginTop: "var(--sp-3)" }}>เลือกสื่อที่ตรงกับชั้นเรียน ก่อนเปิดใช้หรือสมัครสมาชิก</h1>
            <p style={{ fontSize: "var(--fs-18)", color: "var(--text-body)", maxWidth: 670, marginTop: "var(--sp-4)" }}>ดูภาพปก รายละเอียด และวิชาของสื่อที่เผยแพร่จริงได้ฟรี ป้าย “ใช้ฟรี” เปิดได้ทันที “สมาชิกฟรี” ใช้บัญชีฟรี และ “Teacher Pro” สำหรับสมาชิกแพ็ก Teacher Pro</p>
            {result.status === "ready" && result.resources.length > 0 && <p style={{ marginTop: "var(--sp-5)", color: "var(--text-muted)" }}>สื่อพร้อมดู {result.resources.length} รายการ · ใช้ฟรีทันที {freeCount} รายการ</p>}
          </div>
        </section>

        <section style={{ maxWidth: "var(--container-max)", margin: "auto", padding: "var(--sp-8) var(--sp-5) var(--sp-13)" }}>
          {result.status === "ready" && result.resources.length > 0 && (
            <form action="/resources" method="get" className="kru-lib-filters" role="search" aria-label="ค้นหาและกรองคลังสื่อ">
              <label className="kru-lib-field kru-lib-search">
                ค้นหาสื่อ
                <input className="kru-input" name="q" type="search" defaultValue={filters.query} placeholder="พิมพ์วิชา ระดับชั้น หรือเรื่องที่ต้องการ" maxLength={100} />
              </label>
              <FilterSheet id="library-filters" activeCount={narrowing}>
                <label className="kru-lib-field">
                  ระดับชั้น
                  <select className="kru-select" name="grade" defaultValue={filters.grade}>
                    <option value="">ทุกระดับชั้น</option>
                    {RESOURCE_GRADE_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>{item.value === "all" ? "สื่อที่ใช้ได้ทุกระดับ" : item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="kru-lib-field">
                  วิชา
                  <select className="kru-select" name="category" defaultValue={filters.category}>
                    <option value="">ทุกวิชา</option>
                    {categories.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>
                <label className="kru-lib-field">
                  ประเภท
                  <select className="kru-select" name="type" defaultValue={filters.type}>
                    {RESOURCE_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <label className="kru-lib-field">
                  สิทธิ์การใช้งาน
                  <select className="kru-select" name="access" defaultValue={filters.access}>
                    {ACCESS_FILTER_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <button type="submit" className="kru-btn kru-btn--primary kru-filter-sheet__apply">ดูผลลัพธ์</button>
              </FilterSheet>
              <button type="submit" className="kru-btn kru-btn--primary kru-lib-submit"><Search size={18} aria-hidden="true" />ค้นหา</button>
            </form>
          )}

          {result.status === "unavailable" ? (
            <div role="status" className="kru-card kru-lib-empty">
              <BookOpen size={32} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "var(--fs-24)" }}>ยังโหลดคลังสื่อไม่ได้</h2>
              <p style={{ color: "var(--text-muted)" }}>ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองอีกครั้ง</p>
              <Link href="/resources" className="kru-btn kru-btn--primary">ลองใหม่</Link>
            </div>
          ) : result.resources.length === 0 ? (
            <div role="status" className="kru-card kru-lib-empty">
              <BookOpen size={32} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "var(--fs-24)" }}>ทีมงานกำลังเตรียมสื่อชุดใหม่</h2>
              <p style={{ color: "var(--text-muted)" }}>ยังไม่มีสื่อที่เปิดให้ใช้ในขณะนี้ สมัครสมาชิกฟรีไว้ก่อน แล้วกลับมาดูใหม่ได้เลย</p>
              <Link href={accountAction.href} className="kru-btn kru-btn--primary">{accountAction.label}</Link>
            </div>
          ) : visible.length === 0 ? (
            <div role="status" className="kru-card kru-lib-empty">
              <Search size={32} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
              <h2 style={{ fontSize: "var(--fs-24)" }}>ยังไม่พบสื่อที่ตรงกับที่ค้นหา</h2>
              <p style={{ color: "var(--text-muted)", maxWidth: 480 }}>ลองพิมพ์ให้สั้นลง ใช้ชื่อวิชา หรือเลือกทุกระดับชั้นและทุกประเภท หรือเริ่มจากหมวดเหล่านี้</p>
              <div className="kru-lib-empty__chips">
                <Link className="kru-btn kru-btn--secondary kru-btn--sm" href={resourceDiscoveryHref("/resources", { access: "free" })}>สื่อที่ใช้ฟรี</Link>
                {categories.slice(0, 6).map((item) => (
                  <Link key={item} className="kru-btn kru-btn--secondary kru-btn--sm" href={resourceDiscoveryHref("/resources", { category: item })}>{item}</Link>
                ))}
              </div>
              <Link href="/resources" style={{ color: "var(--text-link)", fontWeight: "var(--fw-semibold)" }}>ล้างตัวกรองทั้งหมด</Link>
            </div>
          ) : (
            <>
              <div className="kru-lib-summary">
                <p role="status">พบ {visible.length} รายการ</p>
                {hasFilters && <Link href="/resources" style={{ fontWeight: "var(--fw-semibold)" }}>ล้างตัวกรอง</Link>}
              </div>
              <div className="kru-lib-grid">
                {visible.map((item, index) => (
                  <ResourceCard
                    key={item.id}
                    title={item.title}
                    description={item.description}
                    meta={item.meta}
                    category={item.category}
                    deliveryMode={item.deliveryMode}
                    gradeLevels={item.gradeLevels}
                    requiredPlanNames={item.requiredPlanNames}
                    accessTier={accessTier(item.accessMode)}
                    coverImageUrl={item.coverImageUrl}
                    isNew={item.isNew}
                    locked={publicResourceAction(item, viewer).locked}
                    href={resourceHref(item)}
                    priority={index < 4}
                  />
                ))}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
