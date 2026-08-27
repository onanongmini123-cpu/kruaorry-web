"use client";

import React, { useState } from "react";
import Link from "next/link";
import { LayoutDashboard, FolderCog, MessageSquareText, Users, LogOut, FolderOpen } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Badge, StatTile, SideNav, EmptyState, type SideNavGroup } from "@/components/ui";
import { SAMPLE_MEMBERS, SAMPLE_REQUESTS, SAMPLE_RESOURCES } from "@/lib/sampleData";

type View = "dash" | "content" | "requests" | "members";

const NAV_GROUPS: SideNavGroup[] = [
  {
    items: [
      { key: "dash", label: "ภาพรวม", icon: LayoutDashboard },
      { key: "content", label: "จัดการสื่อ", icon: FolderCog },
      { key: "requests", label: "คำขอจากครู", icon: MessageSquareText },
      { key: "members", label: "สมาชิก", icon: Users },
    ],
  },
];

export default function AdminConsolePage() {
  const [view, setView] = useState<View>("dash");

  return (
    <div style={{ minHeight: "100vh" }}>
      <div className="kru-admin-shell">
        <aside className="kru-admin-sidebar">
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 6px var(--sp-5)" }}>
            <Mascot size={32} />
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: "var(--fw-bold)", fontSize: "var(--fs-18)" }}>KruAorry</div>
              <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>ทีมงานหลังบ้าน</div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            <SideNav groups={NAV_GROUPS} value={view} onChange={(k) => setView(k as View)} />
          </div>
          <Link href="/">
            <Button size="sm" block variant="ghost" icon={LogOut}>
              ออกจากตัวอย่าง
            </Button>
          </Link>
        </aside>

        <main className="kru-admin-main">
          {view === "dash" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>ภาพรวม</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>ตัวเลขตัวอย่างสำหรับตรวจทานหน้าจอ ไม่ใช่ข้อมูลจริง</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--gap-grid)", marginBottom: "var(--sp-8)" }}>
                <StatTile value={SAMPLE_RESOURCES.length} label="สื่อทั้งหมด" icon={FolderOpen} tone="success" />
                <StatTile value={SAMPLE_MEMBERS.filter((m) => m.status === "active").length} label="สมาชิกที่ใช้งานอยู่" icon={Users} tone="brand" />
                <StatTile value={SAMPLE_REQUESTS.filter((r) => r.status === "pending").length} label="คำขอจากครูที่รอ" icon={MessageSquareText} tone="info" />
              </div>
            </div>
          )}

          {view === "content" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>จัดการสื่อ</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>ตัวอย่างรายการสื่อ</p>
              <div className="kru-card" style={{ overflow: "hidden" }}>
                {SAMPLE_RESOURCES.map((item, i) => (
                  <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "var(--sp-5)", padding: "var(--sp-5) var(--sp-6)", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: "var(--fw-semibold)" }}>{item.title}</div>
                      <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{item.meta}</div>
                    </div>
                    <Badge tone="success">เผยแพร่แล้ว</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "requests" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>คำขอจากครู</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>เรียงตามจำนวนโหวต</p>
              {SAMPLE_REQUESTS.length === 0 ? (
                <EmptyState icon={MessageSquareText} title="ยังไม่มีคำขอ" description="" />
              ) : (
                <div style={{ display: "grid", gap: "var(--sp-5)", maxWidth: 900 }}>
                  {SAMPLE_REQUESTS.map((r) => (
                    <div key={r.id} className="kru-card" style={{ padding: "var(--sp-6)", display: "flex", alignItems: "center", gap: "var(--sp-6)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.title}</div>
                        <div style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{r.votes} โหวต · {r.who}</div>
                      </div>
                      <Badge tone={r.status === "pending" ? "warning" : "info"}>{r.status === "pending" ? "รอพิจารณา" : "กำลังผลิต"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "members" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>สมาชิก</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>ตัวอย่างรายชื่อสมาชิก</p>
              <div className="kru-card" style={{ overflow: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-sunken)", textAlign: "left" }}>
                      {["ครู", "แพ็ก", "สถานะ"].map((h) => (
                        <th key={h} style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-13)", color: "var(--text-faint)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SAMPLE_MEMBERS.map((m) => (
                      <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                        <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                          <div style={{ fontWeight: "var(--fw-medium)" }}>{m.name}</div>
                          <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{m.email}</div>
                        </td>
                        <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>{m.plan}</td>
                        <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                          <Badge tone={m.status === "active" ? "success" : "neutral"}>{m.status === "active" ? "ใช้งานอยู่" : "หมดอายุ"}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>
      <style>{`
        .kru-admin-shell { display: flex; min-height: 100vh; }
        .kru-admin-sidebar { display: none; flex-direction: column; width: 256px; flex: 0 0 auto; background: var(--white); border-right: 1px solid var(--border-subtle); padding: var(--sp-6); position: sticky; top: 0; height: 100vh; }
        .kru-admin-main { flex: 1; min-width: 0; padding: var(--sp-5); }
        @media (min-width: 1024px) {
          .kru-admin-sidebar { display: flex; }
          .kru-admin-main { padding: var(--sp-8); }
        }
      `}</style>
    </div>
  );
}
