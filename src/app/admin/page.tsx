"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, FolderCog, MessageSquareText, Users, LogOut, FolderOpen } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Badge, StatTile, SideNav, EmptyState, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

type View = "dash" | "content" | "requests" | "members";

interface AdminResource {
  id: string;
  title: string;
  meta: string | null;
  status: "draft" | "published" | "archived";
}

interface AdminMember {
  id: string;
  full_name: string | null;
  email: string;
  plan: string;
  role: "member" | "admin";
}

interface AdminRequest {
  id: string;
  title: string;
  votes: number;
  status: "pending" | "in_progress" | "done";
}

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
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [view, setView] = useState<View>("dash");
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
      if (profile?.role !== "admin") {
        router.push("/app");
        return;
      }
      setAllowed(true);
      setChecking(false);

      const [{ data: resourceRows }, { data: memberRows }, { data: requestRows }] = await Promise.all([
        supabase.from("resources").select("id, title, meta, status").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, full_name, email, plan, role").order("created_at", { ascending: false }),
        supabase.from("requests").select("id, title, votes, status").order("votes", { ascending: false }),
      ]);
      setResources(resourceRows ?? []);
      setMembers(memberRows ?? []);
      setRequests(requestRows ?? []);
    })();
  }, [supabase, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  if (checking || !allowed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span className="kru-spin" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, border: "3px solid var(--border-subtle)", borderTopColor: "var(--brand)" }} />
      </div>
    );
  }

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
          <Button size="sm" block variant="ghost" icon={LogOut} onClick={handleSignOut}>
            ออกจากระบบ
          </Button>
        </aside>

        <main className="kru-admin-main">
          {view === "dash" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>ภาพรวม</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>ข้อมูลจริงจากฐานข้อมูล</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--gap-grid)", marginBottom: "var(--sp-8)" }}>
                <StatTile value={resources.filter((r) => r.status === "published").length} label="สื่อที่เผยแพร่แล้ว" icon={FolderOpen} tone="success" />
                <StatTile value={members.length} label="สมาชิกทั้งหมด" icon={Users} tone="brand" />
                <StatTile value={requests.filter((r) => r.status === "pending").length} label="คำขอจากครูที่รอ" icon={MessageSquareText} tone="info" />
              </div>
            </div>
          )}

          {view === "content" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>จัดการสื่อ</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>รายการสื่อทั้งหมด (draft/published/archived)</p>
              {resources.length === 0 ? (
                <EmptyState icon={FolderOpen} title="ยังไม่มีสื่อ" description="เพิ่มสื่อได้จากฐานข้อมูล Supabase" />
              ) : (
                <div className="kru-card" style={{ overflow: "hidden" }}>
                  {resources.map((item, i) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "var(--sp-5)", padding: "var(--sp-5) var(--sp-6)", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{item.title}</div>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{item.meta}</div>
                      </div>
                      <Badge tone={item.status === "published" ? "success" : item.status === "draft" ? "warning" : "neutral"}>
                        {item.status === "published" ? "เผยแพร่แล้ว" : item.status === "draft" ? "ฉบับร่าง" : "เก็บถาวร"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "requests" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>คำขอจากครู</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>เรียงตามจำนวนโหวต</p>
              {requests.length === 0 ? (
                <EmptyState icon={MessageSquareText} title="ยังไม่มีคำขอ" description="" />
              ) : (
                <div style={{ display: "grid", gap: "var(--sp-5)", maxWidth: 900 }}>
                  {requests.map((r) => (
                    <div key={r.id} className="kru-card" style={{ padding: "var(--sp-6)", display: "flex", alignItems: "center", gap: "var(--sp-6)" }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.title}</div>
                        <div style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{r.votes} โหวต</div>
                      </div>
                      <Badge tone={r.status === "pending" ? "warning" : r.status === "done" ? "success" : "info"}>
                        {r.status === "pending" ? "รอพิจารณา" : r.status === "done" ? "เสร็จแล้ว" : "กำลังผลิต"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "members" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>สมาชิก</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>รายชื่อผู้ใช้ที่สมัครจริง</p>
              {members.length === 0 ? (
                <EmptyState icon={Users} title="ยังไม่มีสมาชิก" description="" />
              ) : (
                <div className="kru-card" style={{ overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                    <thead>
                      <tr style={{ background: "var(--surface-sunken)", textAlign: "left" }}>
                        {["ครู", "แพ็ก", "บทบาท"].map((h) => (
                          <th key={h} style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-13)", color: "var(--text-faint)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => (
                        <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            <div style={{ fontWeight: "var(--fw-medium)" }}>{m.full_name || "(ยังไม่ระบุชื่อ)"}</div>
                            <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{m.email}</div>
                          </td>
                          <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>{m.plan}</td>
                          <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            <Badge tone={m.role === "admin" ? "member" : "neutral"}>{m.role === "admin" ? "แอดมิน" : "สมาชิก"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
