"use client";

import React, { useState } from "react";
import Link from "next/link";
import { House, FolderOpen, IdCard, LogOut, ArrowLeft, Bookmark } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, SearchField, SideNav, ResourceCard, FilterChips, EmptyState, type SideNavGroup } from "@/components/ui";
import { CATEGORIES, SAMPLE_PLANS, SAMPLE_RESOURCES, type SampleResource } from "@/lib/sampleData";

type View = "home" | "library" | "detail" | "plans";

const NAV_GROUPS: SideNavGroup[] = [
  {
    items: [
      { key: "home", label: "หน้าแรก", icon: House },
      { key: "library", label: "คลังสื่อ", icon: FolderOpen },
      { key: "plans", label: "แพ็กเกจ", icon: IdCard },
    ],
  },
];

export default function TeacherAppPage() {
  const [view, setView] = useState<View>("home");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [saved, setSaved] = useState<string[]>([]);

  const toggleSaved = (id: string) => setSaved((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  const openDetail = (r: SampleResource) => {
    setDetailId(r.id);
    setView("detail");
  };

  const detail = SAMPLE_RESOURCES.find((r) => r.id === detailId) || null;

  const filtered = SAMPLE_RESOURCES.filter((r) => {
    const matchesSearch = !query.trim() || r.title.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = categories.length === 0 || categories.includes(r.category);
    return matchesSearch && matchesCategory;
  });

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="kru-app-shell">
        <aside className="kru-app-sidebar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px var(--sp-6)" }}>
            <Mascot size={36} />
            <span style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-20)", color: "var(--text-strong)" }}>KruAorry</span>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <SideNav groups={NAV_GROUPS} value={view === "detail" ? "library" : view} onChange={(k) => setView(k as View)} />
          </div>
          <Link href="/" style={{ marginTop: "var(--sp-6)" }}>
            <Button size="sm" block variant="ghost" icon={LogOut}>
              ออกจากตัวอย่าง
            </Button>
          </Link>
        </aside>

        <div className="kru-app-main">
          <header className="kru-app-header">
            <SearchField value={query} onChange={setQuery} placeholder="ค้นหาสื่อที่ครูต้องใช้" style={{ flex: 1, maxWidth: 560 }} />
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="kru-app-header-account">
              <span style={{ width: 36, height: 36, borderRadius: "var(--r-pill)", background: "var(--pink-100)", color: "var(--pink-700)", display: "grid", placeItems: "center", fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-14)" }}>
                นภ
              </span>
              <div style={{ fontSize: "var(--fs-14)", lineHeight: 1.3 }}>
                <div style={{ fontWeight: "var(--fw-semibold)" }}>ครูนภา (ตัวอย่าง)</div>
                <div style={{ color: "var(--text-muted)", fontSize: "var(--fs-13)" }}>ครู</div>
              </div>
            </div>
          </header>

          <main style={{ padding: "var(--sp-6) var(--sp-5)", flex: 1 }} className="kru-app-content">
            {view === "home" && (
              <div>
                <div style={{ background: "var(--wash-hero)", borderRadius: "var(--r-panel)", padding: "var(--sp-8)", marginBottom: "var(--sp-8)", display: "flex", alignItems: "center", gap: "var(--sp-6)", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <h1 style={{ fontSize: "var(--fs-30)" }}>สวัสดีค่ะครูนภา</h1>
                    <p style={{ margin: "var(--sp-3) 0 0", fontSize: "var(--fs-16)", color: "var(--text-body)" }}>สื่อพร้อมสอนภาษาไทย ใช้ได้ทันที ไม่ต้องทำเอง</p>
                  </div>
                  <Button size="lg" icon={FolderOpen} onClick={() => setView("library")}>
                    เข้าคลังสื่อ
                  </Button>
                </div>
                <h2 style={{ fontSize: "var(--fs-24)", marginBottom: "var(--sp-5)" }}>สื่อล่าสุดในคลัง</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
                  {SAMPLE_RESOURCES.slice(0, 3).map((r) => (
                    <ResourceCard
                      key={r.id}
                      title={r.title}
                      meta={r.meta}
                      affordance={r.affordance}
                      tags={r.tags}
                      icon={r.icon}
                      tint={r.tint}
                      free={r.free}
                      locked={!r.free}
                      saved={saved.includes(r.id)}
                      onSave={() => toggleSaved(r.id)}
                      onClick={() => openDetail(r)}
                      onAction={() => (r.free ? window.alert(`เปิด: ${r.title} (ตัวอย่าง)`) : setView("plans"))}
                    />
                  ))}
                </div>
              </div>
            )}

            {view === "library" && (
              <div>
                <h1 style={{ fontSize: "var(--fs-30)" }}>คลังสื่อ</h1>
                <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", fontSize: "var(--fs-16)", color: "var(--text-muted)" }}>ดูตัวอย่างได้ทุกชิ้นก่อนใช้ ดาวน์โหลดแล้วสอนได้เลย</p>
                <div className="kru-lib-grid">
                  <aside className="kru-lib-filters">
                    <FilterChips label="หมวดหมู่" options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))} value={categories} onChange={setCategories} />
                  </aside>
                  <div>
                    <div style={{ fontSize: "var(--fs-15)", color: "var(--text-muted)", marginBottom: "var(--sp-5)" }}>พบ {filtered.length} รายการ</div>
                    {filtered.length === 0 ? (
                      <EmptyState icon={FolderOpen} title="ยังไม่มีไฟล์ตามตัวกรองนี้" description="ลองเปลี่ยนตัวกรอง" />
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
                        {filtered.map((r) => (
                          <ResourceCard
                            key={r.id}
                            title={r.title}
                            meta={r.meta}
                            affordance={r.affordance}
                            tags={r.tags}
                            icon={r.icon}
                            tint={r.tint}
                            free={r.free}
                            locked={!r.free}
                            saved={saved.includes(r.id)}
                            onSave={() => toggleSaved(r.id)}
                            onClick={() => openDetail(r)}
                            onAction={() => (r.free ? window.alert(`เปิด: ${r.title} (ตัวอย่าง)`) : setView("plans"))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {view === "detail" && detail && (
              <div>
                <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => setView("library")} style={{ marginBottom: "var(--sp-5)" }}>
                  คลังสื่อ
                </Button>
                <div className="kru-detail-grid">
                  <div>
                    <h1 style={{ fontSize: "var(--fs-36)" }}>{detail.title}</h1>
                    <div style={{ margin: "var(--sp-5) 0 var(--sp-6)", color: "var(--text-muted)" }}>{detail.meta}</div>
                    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--r-panel)", background: "var(--surface-card)", height: 320, display: "grid", placeItems: "center", color: "var(--text-faint)" }}>
                      <detail.icon size={48} strokeWidth={1.5} />
                    </div>
                    <div style={{ display: "grid", gap: "var(--sp-6)", marginTop: "var(--sp-8)", maxWidth: 640 }}>
                      <div>
                        <h3 style={{ fontSize: "var(--fs-20)" }}>สื่อนี้คืออะไร</h3>
                        <p style={{ fontSize: "var(--fs-16)", lineHeight: "var(--lh-loose)", color: "var(--text-body)" }}>{detail.what}</p>
                      </div>
                      <div>
                        <h3 style={{ fontSize: "var(--fs-20)" }}>ช่วยครูอย่างไร</h3>
                        <p style={{ fontSize: "var(--fs-16)", lineHeight: "var(--lh-loose)", color: "var(--text-body)" }}>{detail.helps}</p>
                      </div>
                    </div>
                  </div>
                  <div className="kru-detail-side">
                    <div className="kru-card" style={{ padding: "var(--sp-7)" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-18)", fontWeight: "var(--fw-semibold)" }}>
                        {detail.free ? "พร้อมใช้สอนได้เลย" : "สื่อนี้สำหรับสมาชิก"}
                      </div>
                      <Button
                        block
                        size="lg"
                        style={{ marginTop: "var(--sp-6)" }}
                        onClick={() => (detail.free ? window.alert(`เปิด: ${detail.title} (ตัวอย่าง)`) : setView("plans"))}
                      >
                        {detail.free ? "เปิดใช้งาน" : "ดูแพ็กที่ปลดล็อก"}
                      </Button>
                      <Button block variant="ghost" icon={Bookmark} onClick={() => toggleSaved(detail.id)} style={{ marginTop: "var(--sp-4)" }}>
                        {saved.includes(detail.id) ? "บันทึกไว้แล้ว" : "บันทึกไว้ใช้ทีหลัง"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {view === "plans" && (
              <div>
                <h1 style={{ fontSize: "var(--fs-30)" }}>แพ็กเกจ</h1>
                <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>ตัวเลขตัวอย่าง ยังไม่ใช่ราคาขายจริง</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--gap-grid)" }}>
                  {SAMPLE_PLANS.map((plan) => (
                    <div key={plan.id} className="kru-card" style={{ padding: "var(--sp-7)" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-20)", fontWeight: "var(--fw-semibold)" }}>{plan.name}</div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-30)", fontWeight: "var(--fw-bold)", marginTop: 8 }}>{plan.priceLabel}</div>
                      <p style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)", marginTop: 8 }}>{plan.note}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      <nav className="kru-app-mobile-tabs">
        {NAV_GROUPS[0].items.map((tab) => {
          const active = view === tab.key || (tab.key === "library" && view === "detail");
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setView(tab.key as View)}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, border: "none", background: "transparent", color: active ? "var(--brand)" : "var(--text-muted)", fontSize: "var(--fs-12)", padding: "6px 4px", flex: 1 }}
            >
              <tab.icon size={22} strokeWidth={1.75} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      <style>{`
        .kru-app-shell { display: flex; min-height: 100vh; }
        .kru-app-sidebar { display: none; }
        .kru-app-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
        .kru-app-header { background: var(--white); border-bottom: 1px solid var(--border-subtle); height: 64px; padding: 0 var(--sp-5); display: flex; align-items: center; gap: var(--sp-4); position: sticky; top: 0; z-index: 10; }
        .kru-app-header-account { display: none; }
        .kru-app-mobile-tabs { position: fixed; bottom: 0; left: 0; right: 0; height: 64px; background: var(--white); border-top: 1px solid var(--border-subtle); display: flex; z-index: 20; }
        .kru-lib-grid { display: grid; grid-template-columns: 1fr; gap: var(--sp-6); }
        .kru-lib-filters { display: flex; flex-direction: column; gap: var(--sp-6); }
        .kru-detail-grid { display: grid; grid-template-columns: 1fr; gap: var(--sp-7); }
        @media (min-width: 900px) {
          .kru-lib-grid { grid-template-columns: 256px 1fr; align-items: start; }
          .kru-lib-filters { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--r-card); padding: var(--sp-6); position: sticky; top: var(--sp-6); }
        }
        @media (min-width: 1024px) {
          .kru-app-sidebar { display: flex; flex-direction: column; width: 272px; flex: 0 0 auto; background: var(--white); border-right: 1px solid var(--border-subtle); padding: var(--sp-6); position: sticky; top: 0; height: 100vh; }
          .kru-app-header { height: 72px; padding: 0 var(--sp-8); }
          .kru-app-header-account { display: flex; }
          .kru-app-content { padding: var(--sp-8) !important; }
          .kru-app-mobile-tabs { display: none; }
          .kru-detail-grid { grid-template-columns: 1fr 340px; gap: var(--sp-9); }
          .kru-detail-side { position: sticky; top: var(--sp-6); }
        }
      `}</style>
    </div>
  );
}
