"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, FolderCog, MessageSquareText, Users, LogOut, FolderOpen, Plus, Trash2, Pencil } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Select, Badge, StatTile, SideNav, EmptyState, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

type View = "dash" | "content" | "requests" | "members";
type ResourceStatus = "draft" | "published" | "archived";
type DeliveryMode = "web_app" | "google_template" | "google_form";

interface AdminResource {
  id: string;
  title: string;
  meta: string | null;
  status: ResourceStatus;
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

const STATUS_LABEL: Record<ResourceStatus, string> = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว", archived: "เก็บถาวร" };
const STATUS_TONE: Record<ResourceStatus, "success" | "warning" | "neutral"> = { draft: "warning", published: "success", archived: "neutral" };
const REQUEST_LABEL: Record<AdminRequest["status"], string> = { pending: "รอพิจารณา", in_progress: "กำลังผลิต", done: "เสร็จแล้ว" };
const REQUEST_TONE: Record<AdminRequest["status"], "warning" | "info" | "success"> = { pending: "warning", in_progress: "info", done: "success" };

const EMPTY_FORM = { title: "", meta: "", description: "", category: "", delivery_mode: "web_app" as DeliveryMode, cta_url: "", cover_image_url: "", is_free: true };

export default function AdminConsolePage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [view, setView] = useState<View>("dash");
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);

  const reloadAdminData = async () => {
    const [{ data: resourceRows }, { data: memberRows }, { data: requestRows }] = await Promise.all([
      supabase.from("resources").select("id, title, meta, status").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email, plan, role").order("created_at", { ascending: false }),
      supabase.from("requests").select("id, title, votes, status").order("votes", { ascending: false }),
    ]);
    setResources(resourceRows ?? []);
    setMembers(memberRows ?? []);
    setRequests(requestRows ?? []);
  };

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
      setAdminId(user.id);
      setAllowed(true);
      setChecking(false);
      await reloadAdminData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const openCreateForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  };

  const openEditForm = async (id: string) => {
    const { data, error } = await supabase
      .from("resources")
      .select("title, meta, description, category, delivery_mode, cta_url, cover_image_url, is_free")
      .eq("id", id)
      .single();
    if (error || !data) {
      window.alert(`โหลดข้อมูลสื่อไม่สำเร็จ: ${error?.message ?? ""}`);
      return;
    }
    setEditingId(id);
    setForm({
      title: data.title ?? "",
      meta: data.meta ?? "",
      description: data.description ?? "",
      category: data.category ?? "",
      delivery_mode: data.delivery_mode,
      cta_url: data.cta_url ?? "",
      cover_image_url: data.cover_image_url ?? "",
      is_free: data.is_free,
    });
    setFormError(null);
    setShowForm(true);
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    setUploadingCover(true);
    setFormError(null);
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const { error: uploadError } = await supabase.storage.from("resource-covers").upload(path, file, { upsert: false });
    if (uploadError) {
      setUploadingCover(false);
      setFormError(`อัปโหลดรูปไม่สำเร็จ: ${uploadError.message}`);
      return;
    }
    const { data } = supabase.storage.from("resource-covers").getPublicUrl(path);
    setForm((f) => ({ ...f, cover_image_url: data.publicUrl }));
    setUploadingCover(false);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.title.trim()) {
      setFormError("กรุณากรอกชื่อสื่อ");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      meta: form.meta.trim() || null,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      delivery_mode: form.delivery_mode,
      cta_url: form.cta_url.trim() || null,
      cover_image_url: form.cover_image_url.trim() || null,
      is_free: form.is_free,
    };
    const { error } = editingId
      ? await supabase.from("resources").update(payload).eq("id", editingId)
      : await supabase.from("resources").insert({ ...payload, status: "draft", created_by: adminId });
    setSaving(false);
    if (error) {
      setFormError(error.message);
      return;
    }
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    await reloadAdminData();
  };

  const handleStatusChange = async (id: string, status: ResourceStatus) => {
    if (status === "published") {
      const target = resources.find((r) => r.id === id);
      const { data: full } = await supabase.from("resources").select("cover_image_url").eq("id", id).single();
      if (!full?.cover_image_url) {
        window.alert(`ยังเผยแพร่ "${target?.title ?? ""}" ไม่ได้ — ต้องมีรูปปกก่อนเผยแพร่`);
        return;
      }
    }
    const { error } = await supabase.from("resources").update({ status, published_at: status === "published" ? new Date().toISOString() : null }).eq("id", id);
    if (error) {
      window.alert(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
      return;
    }
    await reloadAdminData();
  };

  const handleDeleteResource = async (id: string, title: string) => {
    if (!window.confirm(`ลบ "${title}" ใช่หรือไม่? ลบแล้วกู้คืนไม่ได้`)) return;
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) {
      window.alert(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    await reloadAdminData();
  };

  const handleRequestStatusChange = async (id: string, status: AdminRequest["status"]) => {
    const { error } = await supabase.from("requests").update({ status }).eq("id", id);
    if (error) {
      window.alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
      return;
    }
    await reloadAdminData();
  };

  const handleMemberPlanChange = async (id: string, plan: string) => {
    const { error } = await supabase.from("profiles").update({ plan }).eq("id", id);
    if (error) {
      window.alert(`อัปเดตแพ็กไม่สำเร็จ: ${error.message}`);
      return;
    }
    await reloadAdminData();
  };

  const handleMemberRoleChange = async (id: string, role: AdminMember["role"]) => {
    if (id === adminId && role !== "admin" && !window.confirm("นี่คือบัญชีของคุณเอง — ลดสิทธิ์ตัวเองจะทำให้ออกจากหลังบ้านทันที ยืนยันหรือไม่?")) {
      return;
    }
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) {
      window.alert(`อัปเดตบทบาทไม่สำเร็จ: ${error.message}`);
      return;
    }
    if (id === adminId && role !== "admin") {
      router.push("/app");
      return;
    }
    await reloadAdminData();
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-4)", flexWrap: "wrap" }}>
                <div>
                  <h1 style={{ fontSize: "var(--fs-30)" }}>จัดการสื่อ</h1>
                  <p style={{ margin: "var(--sp-3) 0 0", color: "var(--text-muted)" }}>สื่อใหม่เริ่มเป็นฉบับร่าง ต้องมีรูปปกก่อนเผยแพร่</p>
                </div>
                <Button icon={Plus} onClick={() => (showForm ? setShowForm(false) : openCreateForm())}>
                  {showForm ? "ปิดฟอร์ม" : "เพิ่มสื่อใหม่"}
                </Button>
              </div>

              {showForm && (
                <form onSubmit={handleSaveResource} className="kru-card" style={{ padding: "var(--sp-6)", marginTop: "var(--sp-6)", display: "grid", gap: "var(--sp-4)" }}>
                  <h2 style={{ fontSize: "var(--fs-18)", fontWeight: "var(--fw-semibold)" }}>{editingId ? "แก้ไขสื่อ" : "สื่อใหม่"}</h2>
                  {formError && (
                    <p style={{ fontSize: "var(--fs-14)", color: "var(--status-danger-fg)", background: "var(--status-danger-bg)", padding: "10px 14px", borderRadius: "var(--r-md)" }}>
                      {formError}
                    </p>
                  )}
                  <Input label="ชื่อสื่อ" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  <Input label="คำอธิบายสั้น (แสดงใต้ชื่อ)" placeholder="เช่น Google Sheets & Script · ธุรการชั้นเรียน" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
                  <div className="kru-field">
                    <label className="kru-field__label">รายละเอียด</label>
                    <textarea className="kru-input" style={{ minHeight: 96, padding: "var(--sp-4) var(--sp-5)" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--sp-4)" }}>
                    <Input label="หมวดหมู่" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                    <Select
                      label="รูปแบบการใช้งาน"
                      value={form.delivery_mode}
                      onChange={(v) => setForm({ ...form, delivery_mode: v as DeliveryMode })}
                      options={[
                        { value: "web_app", label: "เว็บแอป (เปิดใช้งาน)" },
                        { value: "google_template", label: "Google Template (ทำสำเนา)" },
                        { value: "google_form", label: "Google Form (เปิดแบบฟอร์ม)" },
                      ]}
                    />
                  </div>
                  <Input label="ลิงก์ (URL ปลายทาง)" value={form.cta_url} onChange={(e) => setForm({ ...form, cta_url: e.target.value })} placeholder="https://..." />
                  <div className="kru-field">
                    <label className="kru-field__label">รูปปก (จำเป็นก่อนเผยแพร่)</label>
                    {form.cover_image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.cover_image_url} alt="ตัวอย่างรูปปก" style={{ width: "100%", maxWidth: 320, height: 160, objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid var(--border-subtle)", marginBottom: "var(--sp-3)" }} />
                    )}
                    <input type="file" accept="image/*" onChange={handleCoverUpload} disabled={uploadingCover} />
                    {uploadingCover && <span style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>กำลังอัปโหลด...</span>}
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-14)" }}>
                    <input type="checkbox" checked={form.is_free} onChange={(e) => setForm({ ...form, is_free: e.target.checked })} />
                    ให้สมาชิกทุกแพ็กใช้ได้ฟรี
                  </label>
                  <Button type="submit" loading={saving}>
                    {editingId ? "บันทึกการแก้ไข" : "บันทึกเป็นฉบับร่าง"}
                  </Button>
                </form>
              )}

              <div style={{ marginTop: "var(--sp-6)" }}>
                {resources.length === 0 ? (
                  <EmptyState icon={FolderOpen} title="ยังไม่มีสื่อ" description="กด “เพิ่มสื่อใหม่” เพื่อเริ่มสร้างสื่อชิ้นแรก" />
                ) : (
                  <div className="kru-card" style={{ overflow: "hidden" }}>
                    {resources.map((item, i) => (
                      <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "var(--sp-5)", padding: "var(--sp-5) var(--sp-6)", borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)", flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontWeight: "var(--fw-semibold)" }}>{item.title}</div>
                          <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{item.meta}</div>
                        </div>
                        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                        <select
                          className="kru-select"
                          style={{ minHeight: 36, width: "auto" }}
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as ResourceStatus)}
                        >
                          <option value="draft">ฉบับร่าง</option>
                          <option value="published">เผยแพร่</option>
                          <option value="archived">เก็บถาวร</option>
                        </select>
                        <button
                          type="button"
                          aria-label="แก้ไขสื่อ"
                          onClick={() => openEditForm(item.id)}
                          style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 6 }}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label="ลบสื่อ"
                          onClick={() => handleDeleteResource(item.id, item.title)}
                          style={{ border: "none", background: "transparent", color: "var(--status-danger-fg)", cursor: "pointer", padding: 6 }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                    <div key={r.id} className="kru-card" style={{ padding: "var(--sp-6)", display: "flex", alignItems: "center", gap: "var(--sp-6)", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.title}</div>
                        <div style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{r.votes} โหวต</div>
                      </div>
                      <Badge tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Badge>
                      <select
                        className="kru-select"
                        style={{ minHeight: 36, width: "auto" }}
                        value={r.status}
                        onChange={(e) => handleRequestStatusChange(r.id, e.target.value as AdminRequest["status"])}
                      >
                        <option value="pending">รอพิจารณา</option>
                        <option value="in_progress">กำลังผลิต</option>
                        <option value="done">เสร็จแล้ว</option>
                      </select>
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
                          <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            <select
                              className="kru-select"
                              style={{ minHeight: 36, width: "auto" }}
                              value={m.plan}
                              onChange={(e) => handleMemberPlanChange(m.id, e.target.value)}
                            >
                              <option value="free">free</option>
                              <option value="plus">plus</option>
                              <option value="lifetime">lifetime</option>
                            </select>
                          </td>
                          <td style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            <select
                              className="kru-select"
                              style={{ minHeight: 36, width: "auto" }}
                              value={m.role}
                              onChange={(e) => handleMemberRoleChange(m.id, e.target.value as AdminMember["role"])}
                            >
                              <option value="member">สมาชิก</option>
                              <option value="admin">แอดมิน</option>
                            </select>
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
