"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, FolderCog, MessageSquareText, Users, LogOut, FolderOpen, Plus, Trash2, Pencil, Wallet, Check, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Select, Badge, StatTile, SideNav, EmptyState, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  validateResourceFile,
  formatFileSize,
  publishValidationError,
  nextResourceFileFields,
  commitResourceFileChange,
  discardPendingUpload,
  type DeliveryMode,
  type PendingFile,
} from "@/lib/resourceFile";

export const dynamic = "force-dynamic";

type View = "dash" | "content" | "requests" | "upgrades" | "members";
type ResourceStatus = "draft" | "published" | "archived";

interface AdminResource {
  id: string;
  title: string;
  meta: string | null;
  status: ResourceStatus;
  delivery_mode: DeliveryMode;
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

interface AdminUpgradeRequest {
  id: string;
  user_id: string;
  plan_id: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
}

const NAV_GROUPS: SideNavGroup[] = [
  {
    items: [
      { key: "dash", label: "ภาพรวม", icon: LayoutDashboard },
      { key: "content", label: "จัดการสื่อ", icon: FolderCog },
      { key: "requests", label: "คำขอจากครู", icon: MessageSquareText },
      { key: "upgrades", label: "คำขออัปเกรด", icon: Wallet },
      { key: "members", label: "สมาชิก", icon: Users },
    ],
  },
];

const STATUS_LABEL: Record<ResourceStatus, string> = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว", archived: "เก็บถาวร" };
const STATUS_TONE: Record<ResourceStatus, "success" | "warning" | "neutral"> = { draft: "warning", published: "success", archived: "neutral" };
const REQUEST_LABEL: Record<AdminRequest["status"], string> = { pending: "รอพิจารณา", in_progress: "กำลังผลิต", done: "เสร็จแล้ว" };
const REQUEST_TONE: Record<AdminRequest["status"], "warning" | "info" | "success"> = { pending: "warning", in_progress: "info", done: "success" };

const EMPTY_FORM = {
  title: "",
  meta: "",
  description: "",
  category: "",
  delivery_mode: "web_app" as DeliveryMode,
  cta_url: "",
  cover_image_url: "",
  is_free: true,
  file_path: "",
  file_name: "",
  file_size: 0,
  file_mime_type: "",
};

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
  const [upgradeRequests, setUpgradeRequests] = useState<AdminUpgradeRequest[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);

  const reloadAdminData = async () => {
    const [{ data: resourceRows }, { data: memberRows }, { data: requestRows }, { data: upgradeRows, error: upgradeError }] = await Promise.all([
      supabase.from("resources").select("id, title, meta, status, delivery_mode").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email, plan, role").order("created_at", { ascending: false }),
      supabase.from("requests").select("id, title, votes, status").order("votes", { ascending: false }),
      supabase.from("upgrade_requests").select("id, user_id, plan_id, status, created_at, profiles(full_name, email)").order("created_at", { ascending: false }),
    ]);
    setResources(resourceRows ?? []);
    setMembers(memberRows ?? []);
    setRequests(requestRows ?? []);
    if (upgradeError) console.error("Failed to load upgrade requests:", upgradeError.message);
    setUpgradeRequests((upgradeRows as unknown as AdminUpgradeRequest[]) ?? []);
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
    setPendingResourceId(crypto.randomUUID());
    setForm(EMPTY_FORM);
    setPendingFile(null);
    setFileRemoved(false);
    setFormError(null);
    setShowForm(true);
  };

  // Closing or cancelling the form must never leave an uploaded-but-unsaved
  // file sitting in storage — discard it if there is one.
  const closeForm = async () => {
    const cleanupError = await discardPendingUpload(supabase.storage.from("resource-files"), pendingFile);
    if (cleanupError) console.error(cleanupError);
    setPendingFile(null);
    setFileRemoved(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingResourceId(null);
    setFormError(null);
    setShowForm(false);
  };

  const openEditForm = async (id: string) => {
    const { data, error } = await supabase
      .from("resources")
      .select("title, meta, description, category, delivery_mode, cta_url, cover_image_url, is_free, file_path, file_name, file_size, file_mime_type")
      .eq("id", id)
      .single();
    if (error || !data) {
      window.alert(`โหลดข้อมูลสื่อไม่สำเร็จ: ${error?.message ?? ""}`);
      return;
    }
    setEditingId(id);
    setPendingResourceId(null);
    setPendingFile(null);
    setFileRemoved(false);
    setForm({
      title: data.title ?? "",
      meta: data.meta ?? "",
      description: data.description ?? "",
      category: data.category ?? "",
      delivery_mode: data.delivery_mode,
      cta_url: data.cta_url ?? "",
      cover_image_url: data.cover_image_url ?? "",
      is_free: data.is_free,
      file_path: data.file_path ?? "",
      file_name: data.file_name ?? "",
      file_size: data.file_size ?? 0,
      file_mime_type: data.file_mime_type ?? "",
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateResourceFile(file);
    if (validationError) {
      setFormError(validationError);
      return;
    }
    const resourceId = editingId ?? pendingResourceId;
    if (!resourceId) {
      setFormError("เกิดข้อผิดพลาด กรุณาปิดฟอร์มแล้วเปิดใหม่อีกครั้ง");
      return;
    }
    setUploadingFile(true);
    setFormError(null);
    const storage = supabase.storage.from("resource-files");
    // A pending upload from earlier in this same form session (picked a file,
    // then picked a different one before saving) is safe to discard now —
    // it was never referenced by the row. The previously *saved* file
    // (form.file_path) is untouched here; it's only deleted after a
    // successful save, in handleSaveResource.
    if (pendingFile) {
      const cleanupError = await discardPendingUpload(storage, pendingFile);
      if (cleanupError) console.error(cleanupError);
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${resourceId}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await storage.upload(path, file, { upsert: false });
    if (uploadError) {
      setUploadingFile(false);
      setFormError(`อัปโหลดไฟล์ไม่สำเร็จ: ${uploadError.message}`);
      return;
    }
    setPendingFile({ path, name: file.name, size: file.size, mimeType: file.type });
    setFileRemoved(false);
    setUploadingFile(false);
  };

  // Removing a file never deletes anything immediately: a not-yet-saved
  // pending upload is just discarded from storage (it was never the row's
  // file), while removing the currently-saved file only takes effect once
  // the form is saved successfully (handleSaveResource performs the delete).
  const handleFileRemove = async () => {
    if (pendingFile) {
      const cleanupError = await discardPendingUpload(supabase.storage.from("resource-files"), pendingFile);
      if (cleanupError) console.error(cleanupError);
      setPendingFile(null);
      return;
    }
    if (!form.file_path) return;
    if (!window.confirm("ลบไฟล์นี้ใช่หรือไม่? การลบจะมีผลเมื่อกดบันทึก")) return;
    setFileRemoved(true);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.title.trim()) {
      setFormError("กรุณากรอกชื่อสื่อ");
      return;
    }
    setSaving(true);

    const currentFilePath = form.file_path || null;
    const fileFields = nextResourceFileFields(
      { file_path: currentFilePath, file_name: form.file_name || null, file_size: form.file_size || null, file_mime_type: form.file_mime_type || null },
      pendingFile,
      fileRemoved,
    );
    const payload = {
      title: form.title.trim(),
      meta: form.meta.trim() || null,
      description: form.description.trim() || null,
      category: form.category.trim() || null,
      delivery_mode: form.delivery_mode,
      cta_url: form.cta_url.trim() || null,
      cover_image_url: form.cover_image_url.trim() || null,
      is_free: form.is_free,
      ...fileFields,
    };

    const result = await commitResourceFileChange({
      storage: supabase.storage.from("resource-files"),
      saveRow: async () =>
        editingId
          ? await supabase.from("resources").update(payload).eq("id", editingId)
          : await supabase.from("resources").insert({ ...payload, id: pendingResourceId, status: "draft", created_by: adminId }),
      currentFilePath,
      pendingFile,
      fileRemoved,
    });

    // Cleanup failures never block the user-visible outcome, but they must
    // never be silently dropped either.
    result.cleanupErrors.forEach((message) => console.error(message));

    if (!result.ok) {
      setSaving(false);
      setPendingFile(null);
      setFileRemoved(false);
      setFormError(result.saveError);
      return;
    }
    if (result.cleanupErrors.length > 0) {
      window.alert(result.cleanupErrors.join("\n"));
    }

    setSaving(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingResourceId(null);
    setPendingFile(null);
    setFileRemoved(false);
    setShowForm(false);
    await reloadAdminData();
  };

  const handleStatusChange = async (id: string, status: ResourceStatus) => {
    if (status === "published") {
      const target = resources.find((r) => r.id === id);
      const { data: full } = await supabase.from("resources").select("delivery_mode, cover_image_url, file_path, cta_url").eq("id", id).single();
      const validationError =
        full &&
        publishValidationError({
          status: "published",
          deliveryMode: full.delivery_mode,
          coverImageUrl: full.cover_image_url,
          filePath: full.file_path,
          ctaUrl: full.cta_url,
        });
      if (validationError) {
        window.alert(`ยังเผยแพร่ "${target?.title ?? ""}" ไม่ได้ — ${validationError}`);
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
    const { data: full } = await supabase.from("resources").select("file_path").eq("id", id).single();
    const { error } = await supabase.from("resources").delete().eq("id", id);
    if (error) {
      window.alert(`ลบไม่สำเร็จ: ${error.message}`);
      return;
    }
    if (full?.file_path) {
      await supabase.storage.from("resource-files").remove([full.file_path]);
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

  const handleApproveUpgrade = async (request: AdminUpgradeRequest, userId: string) => {
    const { error: planError } = await supabase.from("profiles").update({ plan: request.plan_id }).eq("id", userId);
    if (planError) {
      window.alert(`อัปเกรดแพ็กไม่สำเร็จ: ${planError.message}`);
      return;
    }
    const { error: statusError } = await supabase
      .from("upgrade_requests")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", request.id);
    if (statusError) {
      window.alert(`อัปเดตสถานะคำขอไม่สำเร็จ: ${statusError.message}`);
      return;
    }
    await reloadAdminData();
  };

  const handleDeclineUpgrade = async (id: string) => {
    const { error } = await supabase.from("upgrade_requests").update({ status: "declined", resolved_at: new Date().toISOString() }).eq("id", id);
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
                <StatTile value={upgradeRequests.filter((r) => r.status === "pending").length} label="คำขออัปเกรดที่รอ" icon={Wallet} tone="warning" />
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
                <Button icon={Plus} onClick={() => (showForm ? closeForm() : openCreateForm())}>
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
                        { value: "file_download", label: "ไฟล์ดาวน์โหลด" },
                      ]}
                    />
                  </div>
                  <Input label="ลิงก์ (URL ปลายทาง)" value={form.cta_url} onChange={(e) => setForm({ ...form, cta_url: e.target.value })} placeholder="https://..." />
                  <div className="kru-field">
                    <label className="kru-field__label">
                      ไฟล์สื่อ (PDF, DOCX, PPTX, XLSX, ZIP — ไม่เกิน 50MB{form.delivery_mode === "file_download" ? " จำเป็นสำหรับโหมดไฟล์ดาวน์โหลด" : ""})
                    </label>
                    {pendingFile ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--sp-3)", fontSize: "var(--fs-14)" }}>
                        <span>
                          {pendingFile.name} ({formatFileSize(pendingFile.size)}) — ไฟล์ใหม่ จะบันทึกเมื่อกด &quot;บันทึก&quot;
                        </span>
                        <button type="button" onClick={handleFileRemove} style={{ border: "none", background: "transparent", color: "var(--status-danger-fg)", cursor: "pointer", padding: 4 }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ) : fileRemoved ? (
                      <div style={{ marginBottom: "var(--sp-3)", fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>
                        จะลบไฟล์เดิมเมื่อกด &quot;บันทึก&quot;
                        <button type="button" onClick={() => setFileRemoved(false)} style={{ marginLeft: 10, border: "none", background: "transparent", color: "var(--brand)", cursor: "pointer" }}>
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      form.file_name && (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--sp-3)", fontSize: "var(--fs-14)" }}>
                          <span>
                            {form.file_name} ({formatFileSize(form.file_size)})
                          </span>
                          <button type="button" onClick={handleFileRemove} style={{ border: "none", background: "transparent", color: "var(--status-danger-fg)", cursor: "pointer", padding: 4 }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )
                    )}
                    <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.zip" onChange={handleFileUpload} disabled={uploadingFile} />
                    {uploadingFile && <span style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>กำลังอัปโหลด...</span>}
                  </div>
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

          {view === "upgrades" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>คำขออัปเกรด</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>ตรวจสอบว่าได้รับเงินแล้วก่อนกดอนุมัติ</p>
              {upgradeRequests.length === 0 ? (
                <EmptyState icon={Wallet} title="ยังไม่มีคำขออัปเกรด" description="" />
              ) : (
                <div style={{ display: "grid", gap: "var(--sp-5)", maxWidth: 900 }}>
                  {upgradeRequests.map((r) => (
                    <div key={r.id} className="kru-card" style={{ padding: "var(--sp-6)", display: "flex", alignItems: "center", gap: "var(--sp-6)", flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.profiles?.full_name || r.profiles?.email || "(ไม่พบข้อมูลผู้ใช้)"}</div>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                          {r.profiles?.email} · ขออัปเกรดเป็น <strong>{r.plan_id}</strong> · {new Date(r.created_at).toLocaleDateString("th-TH")}
                        </div>
                      </div>
                      {r.status === "pending" ? (
                        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
                          <Button size="sm" icon={Check} onClick={() => handleApproveUpgrade(r, r.user_id)}>
                            อนุมัติและอัปเกรด
                          </Button>
                          <Button size="sm" variant="ghost" icon={X} onClick={() => handleDeclineUpgrade(r.id)}>
                            ปฏิเสธ
                          </Button>
                        </div>
                      ) : (
                        <Badge tone={r.status === "approved" ? "success" : "neutral"}>{r.status === "approved" ? "อนุมัติแล้ว" : "ปฏิเสธแล้ว"}</Badge>
                      )}
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
