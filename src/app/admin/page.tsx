"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { LayoutDashboard, FolderCog, MessageSquareText, Users, LogOut, FolderOpen, Plus, Trash2, Pencil, Wallet, Check, X } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Select, Badge, StatTile, SideNav, EmptyState, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import {
  validateResourceFile,
  formatFileSize,
  publishValidationError,
  evaluatePublishGuard,
  canProceedAfterFileLookup,
  nextResourceFileFields,
  commitResourceFileChange,
  retryCleanup,
  guardAgainstBusyForm,
  chooseUploadStrategy,
  resumableUploadEndpoint,
  runResumableUpload,
  type DeliveryMode,
  type PendingFile,
  type CleanupFailure,
  type StorageObject,
  type UploadStrategy,
  type TusUploadFactory,
  type TusUploadHandle,
} from "@/lib/resourceFile";

export const dynamic = "force-dynamic";

type View = "dash" | "content" | "requests" | "upgrades" | "members";
type ResourceStatus = "draft" | "published" | "archived";
type UploadTarget = "cover" | "file";

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

type UploadStatus =
  | { phase: "idle" }
  | { phase: "uploading"; target: UploadTarget; progress: number; strategy: UploadStrategy; onPause: (() => void) | null; onCancel: () => void }
  | { phase: "paused"; target: UploadTarget; onResume: () => void; onCancel: () => void }
  | { phase: "error"; target: UploadTarget; message: string; onRetry: () => void; onCancel: () => void };

type FileUploadOutcome = { ok: true; file: PendingFile } | { ok: false };
type CoverUploadOutcome = { ok: true; path: string; url: string } | { ok: false };

// The real tus.Upload constructor, adapted to the TusUploadFactory shape
// runResumableUpload expects — kept as the one place this module touches
// tus-js-client directly, so the orchestration logic itself (in
// resourceFile.ts) stays injectable/mockable and framework-free.
const createTusUpload: TusUploadFactory = (file, options) => new tus.Upload(file, options as unknown as ConstructorParameters<typeof tus.Upload>[1]) as unknown as TusUploadHandle;

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
  // `saving` is the single "an admin mutation is in flight" flag: true for
  // the entire cover-upload + file-upload + row-save + cleanup sequence,
  // and for delete/status changes too. guardAgainstBusyForm(saving) gates
  // every other admin action so none of them can interrupt it.
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingResourceId, setPendingResourceId] = useState<string | null>(null);
  // The object path is generated once, at selection time, and stored
  // alongside the File — every retry/resume/re-attempt (including a whole
  // extra click of Save) reuses this exact path. It is never regenerated.
  const [selectedFile, setSelectedFile] = useState<{ file: File; path: string } | null>(null);
  // Cover images are also only held in memory until Save — uploading them
  // immediately (the old behavior) could leave an orphaned file in the
  // public bucket if the row save never happens (validation failure,
  // closed form, etc.).
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ phase: "idle" });
  // Storage cleanup that failed and was NOT dropped — kept here so it can
  // be retried instead of silently becoming an orphaned file forever.
  const [failedCleanups, setFailedCleanups] = useState<CleanupFailure[]>([]);

  // Derived (not state) so nothing calls setState from inside an effect —
  // the effect below only performs the revoke side effect on cleanup.
  const coverPreviewUrl = useMemo(() => (selectedCoverFile ? URL.createObjectURL(selectedCoverFile) : null), [selectedCoverFile]);
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

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

  // Warn on tab close/navigation away from the app while a save/upload is
  // in flight — the guardAgainstBusyForm checks below cover in-app actions,
  // this covers leaving the page entirely.
  useEffect(() => {
    if (!saving) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saving]);

  const handleSignOut = async () => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  };

  const handleNavChange = (key: string) => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    setView(key as View);
  };

  const openCreateForm = () => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    setEditingId(null);
    setPendingResourceId(crypto.randomUUID());
    setForm(EMPTY_FORM);
    setSelectedFile(null);
    setSelectedCoverFile(null);
    setFileRemoved(false);
    setFormError(null);
    setShowForm(true);
  };

  const closeForm = () => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    setSelectedFile(null);
    setSelectedCoverFile(null);
    setFileRemoved(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPendingResourceId(null);
    setFormError(null);
    setShowForm(false);
  };

  const openEditForm = async (id: string) => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
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
    setSelectedFile(null);
    setSelectedCoverFile(null);
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

  const handleCoverSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("กรุณาเลือกไฟล์รูปภาพ");
      return;
    }
    setFormError(null);
    setSelectedCoverFile(file);
  };

  // The object path is fixed the moment a file is selected — every retry
  // or later Save click reuses this exact path, never a fresh one.
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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
    setFormError(null);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${resourceId}/${crypto.randomUUID()}-${safeName}`;
    setSelectedFile({ file, path });
    setFileRemoved(false);
  };

  // Removing a not-yet-uploaded selection just drops it from memory
  // (nothing was ever written to storage, so there's no path/fingerprint
  // to clear on the server). Removing the currently-saved file only takes
  // effect once Save succeeds.
  const handleFileRemove = () => {
    if (selectedFile) {
      setSelectedFile(null);
      return;
    }
    if (!form.file_path) return;
    if (!window.confirm("ลบไฟล์นี้ใช่หรือไม่? การลบจะมีผลเมื่อกดบันทึก")) return;
    setFileRemoved(true);
  };

  // Uploads a cover image with the same retry/cancel discipline as the
  // resource file. Covers are always small, so no resumable path is
  // needed — but a "cancel" clicked right as the request finishes must
  // still not leave an orphaned object, hence the post-await recheck.
  const runCoverUpload = (file: File): Promise<CoverUploadOutcome> => {
    const path = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    return new Promise<CoverUploadOutcome>((resolve) => {
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        setUploadStatus({ phase: "idle" });
        resolve({ ok: false });
      };
      const attempt = async () => {
        if (cancelled) return;
        setUploadStatus({ phase: "uploading", target: "cover", progress: 0, strategy: "standard", onPause: null, onCancel: cancel });
        try {
          const { error } = await supabase.storage.from("resource-covers").upload(path, file, { upsert: false });
          if (cancelled) {
            if (!error) await supabase.storage.from("resource-covers").remove([path]);
            return;
          }
          if (error) {
            setUploadStatus({ phase: "error", target: "cover", message: `อัปโหลดรูปปกไม่สำเร็จ: ${error.message}`, onRetry: attempt, onCancel: cancel });
            return;
          }
          const { data } = supabase.storage.from("resource-covers").getPublicUrl(path);
          setUploadStatus({ phase: "idle" });
          resolve({ ok: true, path, url: data.publicUrl });
        } catch (thrown) {
          if (cancelled) return;
          const message = thrown instanceof Error ? thrown.message : String(thrown);
          setUploadStatus({ phase: "error", target: "cover", message: `อัปโหลดรูปปกไม่สำเร็จ: ${message}`, onRetry: attempt, onCancel: cancel });
        }
      };
      attempt();
    });
  };

  const runStandardFileUpload = (file: File, path: string): Promise<FileUploadOutcome> => {
    return new Promise<FileUploadOutcome>((resolve) => {
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
        setUploadStatus({ phase: "idle" });
        resolve({ ok: false });
      };
      const attempt = async () => {
        if (cancelled) return;
        setUploadStatus({ phase: "uploading", target: "file", progress: 0, strategy: "standard", onPause: null, onCancel: cancel });
        try {
          const { error } = await supabase.storage.from("resource-files").upload(path, file, { upsert: false });
          if (cancelled) {
            if (!error) await supabase.storage.from("resource-files").remove([path]);
            return;
          }
          if (error) {
            setUploadStatus({ phase: "error", target: "file", message: `อัปโหลดไฟล์ไม่สำเร็จ: ${error.message}`, onRetry: attempt, onCancel: cancel });
            return;
          }
          setUploadStatus({ phase: "idle" });
          resolve({ ok: true, file: { path, name: file.name, size: file.size, mimeType: file.type } });
        } catch (thrown) {
          if (cancelled) return;
          const message = thrown instanceof Error ? thrown.message : String(thrown);
          setUploadStatus({ phase: "error", target: "file", message: `อัปโหลดไฟล์ไม่สำเร็จ: ${message}`, onRetry: attempt, onCancel: cancel });
        }
      };
      attempt();
    });
  };

  const runResumableFileUpload = async (file: File, path: string): Promise<FileUploadOutcome> => {
    let session;
    try {
      const { data } = await supabase.auth.getSession();
      session = data.session;
    } catch (sessionError) {
      const message = sessionError instanceof Error ? sessionError.message : String(sessionError);
      setFormError(`ตรวจสอบเซสชันไม่สำเร็จ: ${message}`);
      return { ok: false };
    }
    if (!session) {
      setFormError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
      return { ok: false };
    }

    return new Promise<FileUploadOutcome>((resolve) => {
      const controller = runResumableUpload({
        createUpload: createTusUpload,
        file,
        path,
        bucketName: "resource-files",
        endpoint: resumableUploadEndpoint(process.env.NEXT_PUBLIC_SUPABASE_URL || ""),
        headers: {
          authorization: `Bearer ${session.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          "x-upsert": "false",
        },
        onStatusChange: (status) => {
          const onCancel = async () => {
            const { error } = await controller.cancel();
            if (error) window.alert(`ยกเลิกการอัปโหลดไม่สมบูรณ์: ${error}`);
          };
          if (status.phase === "uploading") {
            const onPause = async () => {
              const { error } = await controller.pause();
              if (error) window.alert(`พักการอัปโหลดไม่สำเร็จ: ${error}`);
            };
            setUploadStatus({ phase: "uploading", target: "file", progress: status.progress, strategy: "resumable", onPause, onCancel });
          } else if (status.phase === "paused") {
            setUploadStatus({ phase: "paused", target: "file", onResume: () => controller.retry(), onCancel });
          } else if (status.phase === "error") {
            setUploadStatus({ phase: "error", target: "file", message: `อัปโหลดไฟล์ไม่สำเร็จ: ${status.message}`, onRetry: () => controller.retry(), onCancel });
          }
        },
      });

      controller.result.then((outcome) => {
        setUploadStatus({ phase: "idle" });
        resolve(outcome.ok && outcome.file ? { ok: true, file: outcome.file } : { ok: false });
      });
    });
  };

  const runFileUpload = (selected: { file: File; path: string }): Promise<FileUploadOutcome> => {
    const strategy = chooseUploadStrategy(selected.file.size);
    return strategy === "standard" ? runStandardFileUpload(selected.file, selected.path) : runResumableFileUpload(selected.file, selected.path);
  };

  const handleSaveResource = async (e: React.FormEvent) => {
    e.preventDefault();
    const busyGuard = guardAgainstBusyForm(saving);
    if (!busyGuard.allowed) {
      window.alert(busyGuard.message);
      return;
    }
    setFormError(null);
    if (!form.title.trim()) {
      setFormError("กรุณากรอกชื่อสื่อ");
      return;
    }

    // Fail closed on saving an already-published resource into an invalid
    // state (e.g. clearing its only file/link/cover, or switching delivery
    // mode) — checked client-side before any upload starts, so the DB
    // constraint in 015_resource_type_publish_targets.sql is the last
    // resort, not the only line of defense.
    const currentStatus = editingId ? resources.find((r) => r.id === editingId)?.status : undefined;
    if (currentStatus === "published") {
      const wouldHaveFile = selectedFile ? true : fileRemoved ? false : Boolean(form.file_path);
      const wouldHaveCover = selectedCoverFile ? true : Boolean(form.cover_image_url.trim());
      const validationError = publishValidationError({
        status: "published",
        deliveryMode: form.delivery_mode,
        coverImageUrl: wouldHaveCover ? "pending-truthy-placeholder" : null,
        filePath: wouldHaveFile ? "pending-truthy-placeholder" : null,
        ctaUrl: form.cta_url.trim() || null,
      });
      if (validationError) {
        setFormError(validationError);
        return;
      }
    }

    setSaving(true);
    try {
      const resourceId = editingId ?? pendingResourceId;
      const filesStorage = supabase.storage.from("resource-files");
      const pendingUploads: StorageObject[] = [];
      const obsoleteOnSuccess: StorageObject[] = [];

      let coverUrl = form.cover_image_url.trim() || null;
      if (selectedCoverFile) {
        const coverResult = await runCoverUpload(selectedCoverFile);
        if (!coverResult.ok) return;
        coverUrl = coverResult.url;
        pendingUploads.push({ storage: supabase.storage.from("resource-covers"), path: coverResult.path });
      }

      let pendingFile: PendingFile | null = null;
      if (selectedFile) {
        if (!resourceId) {
          setFormError("เกิดข้อผิดพลาด กรุณาปิดฟอร์มแล้วเปิดใหม่อีกครั้ง");
          return;
        }
        const uploaded = await runFileUpload(selectedFile);
        if (!uploaded.ok) return;
        pendingFile = uploaded.file;
        pendingUploads.push({ storage: filesStorage, path: pendingFile.path });
      }

      const currentFilePath = form.file_path || null;
      const fileFields = nextResourceFileFields(
        { file_path: currentFilePath, file_name: form.file_name || null, file_size: form.file_size || null, file_mime_type: form.file_mime_type || null },
        pendingFile,
        fileRemoved,
      );
      if ((pendingFile || fileRemoved) && currentFilePath) {
        obsoleteOnSuccess.push({ storage: filesStorage, path: currentFilePath });
      }

      const payload = {
        title: form.title.trim(),
        meta: form.meta.trim() || null,
        description: form.description.trim() || null,
        category: form.category.trim() || null,
        delivery_mode: form.delivery_mode,
        cta_url: form.cta_url.trim() || null,
        cover_image_url: coverUrl,
        is_free: form.is_free,
        ...fileFields,
      };

      const result = await commitResourceFileChange({
        saveRow: async () =>
          editingId
            ? await supabase.from("resources").update(payload).eq("id", editingId)
            : await supabase.from("resources").insert({ ...payload, id: pendingResourceId, status: "draft", created_by: adminId }),
        pendingUploads,
        obsoleteOnSuccess,
      });

      // Cleanup failures never block the user-visible outcome, but the
      // failed path (with its storage handle) is retained, not dropped —
      // it can be retried from the banner below.
      if (result.cleanupFailures.length > 0) {
        setFailedCleanups((prev) => [...prev, ...result.cleanupFailures]);
      }

      if (!result.ok) {
        setFormError(result.saveError);
        return;
      }
      if (result.cleanupFailures.length > 0) {
        window.alert("บันทึกสำเร็จ แต่ลบไฟล์เดิมไม่สำเร็จ — ระบบเก็บรายการนี้ไว้ให้ลองใหม่ได้จากแบนเนอร์ด้านบน");
      }

      setForm(EMPTY_FORM);
      setEditingId(null);
      setPendingResourceId(null);
      setSelectedFile(null);
      setSelectedCoverFile(null);
      setFileRemoved(false);
      setShowForm(false);
      await reloadAdminData();
    } finally {
      setSaving(false);
      setUploadStatus({ phase: "idle" });
    }
  };

  const handleStatusChange = async (id: string, status: ResourceStatus) => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    setSaving(true);
    try {
      if (status === "published") {
        const target = resources.find((r) => r.id === id);
        const { data: full, error: queryError } = await supabase.from("resources").select("delivery_mode, cover_image_url, file_path, cta_url").eq("id", id).single();
        // Fail closed: a query error or a missing row must never be treated
        // as "no problems found" — both block the publish.
        const publishGuard = evaluatePublishGuard({
          data: full
            ? { status: "published", deliveryMode: full.delivery_mode, coverImageUrl: full.cover_image_url, filePath: full.file_path, ctaUrl: full.cta_url }
            : null,
          error: queryError ? { message: queryError.message } : null,
        });
        if (!publishGuard.allow) {
          window.alert(`ยังเผยแพร่ "${target?.title ?? ""}" ไม่ได้ — ${publishGuard.reason}`);
          return;
        }
      }
      const { error } = await supabase.from("resources").update({ status, published_at: status === "published" ? new Date().toISOString() : null }).eq("id", id);
      if (error) {
        window.alert(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reloadAdminData();
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteResource = async (id: string, title: string) => {
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    if (!window.confirm(`ลบ "${title}" ใช่หรือไม่? ลบแล้วกู้คืนไม่ได้`)) return;
    setSaving(true);
    try {
      const { data: full, error: lookupError } = await supabase.from("resources").select("file_path").eq("id", id).single();
      // Fail closed: if we can't read file_path we don't know whether a
      // file needs cleanup, so the resource row must not be deleted either
      // — otherwise a delete could silently orphan a private file forever.
      if (!canProceedAfterFileLookup(lookupError ? { message: lookupError.message } : null)) {
        window.alert(`ลบไม่สำเร็จ: ตรวจสอบไฟล์แนบไม่ได้ (${lookupError?.message ?? ""}) กรุณาลองใหม่ — ไม่ได้ลบข้อมูลสื่อ`);
        return;
      }
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) {
        window.alert(`ลบไม่สำเร็จ: ${error.message}`);
        return;
      }
      if (full?.file_path) {
        const { failed } = await retryCleanup([{ storage: supabase.storage.from("resource-files"), path: full.file_path }]);
        if (failed.length > 0) {
          setFailedCleanups((prev) => [...prev, ...failed]);
          window.alert(`ลบสื่อ "${title}" สำเร็จ แต่ลบไฟล์แนบไม่สำเร็จ: ${failed[0].message} — ระบบเก็บรายการนี้ไว้ให้ลองใหม่ได้จากแบนเนอร์ด้านบน`);
        }
      }
      await reloadAdminData();
    } finally {
      setSaving(false);
    }
  };

  const handleRetryCleanup = async () => {
    if (failedCleanups.length === 0) return;
    setSaving(true);
    try {
      const { failed } = await retryCleanup(failedCleanups.map((f) => ({ storage: f.storage, path: f.path })));
      setFailedCleanups(failed);
      window.alert(failed.length === 0 ? "ลบไฟล์ค้างสำเร็จแล้วทั้งหมด" : `ยังลบไฟล์ไม่สำเร็จ ${failed.length} รายการ ลองใหม่ภายหลัง`);
    } finally {
      setSaving(false);
    }
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

  const uploadStatusFor = (target: UploadTarget) => (uploadStatus.phase !== "idle" && uploadStatus.target === target ? uploadStatus : null);

  const renderUploadStatus = (target: UploadTarget) => {
    const status = uploadStatusFor(target);
    if (!status) return null;
    if (status.phase === "uploading") {
      return (
        <div style={{ marginBottom: "var(--sp-3)" }}>
          <div style={{ fontSize: "var(--fs-13)", marginBottom: 4 }}>
            กำลังอัปโหลด{target === "cover" ? "รูปปก" : "ไฟล์"} ({status.strategy === "resumable" ? "resumable" : "standard"}) — {status.progress}%
          </div>
          <div style={{ height: 8, background: "var(--surface-sunken)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${status.progress}%`, background: "var(--brand)", transition: "width 0.2s" }} />
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
            {status.onPause && (
              <button type="button" onClick={status.onPause} style={{ border: "none", background: "transparent", color: "var(--brand)", cursor: "pointer", fontSize: "var(--fs-13)", padding: 0 }}>
                พักการอัปโหลด
              </button>
            )}
            <button type="button" onClick={status.onCancel} style={{ border: "none", background: "transparent", color: "var(--status-danger-fg)", cursor: "pointer", fontSize: "var(--fs-13)", padding: 0 }}>
              ยกเลิก
            </button>
          </div>
        </div>
      );
    }
    if (status.phase === "paused") {
      return (
        <div style={{ marginBottom: "var(--sp-3)", fontSize: "var(--fs-14)" }}>
          พักการอัปโหลด{target === "cover" ? "รูปปก" : "ไฟล์"}ไว้
          <button type="button" onClick={status.onResume} style={{ marginLeft: 10, border: "none", background: "transparent", color: "var(--brand)", cursor: "pointer" }}>
            ดำเนินการต่อ
          </button>
          <button type="button" onClick={status.onCancel} style={{ marginLeft: 10, border: "none", background: "transparent", color: "var(--status-danger-fg)", cursor: "pointer" }}>
            ยกเลิก
          </button>
        </div>
      );
    }
    return (
      <div style={{ marginBottom: "var(--sp-3)", fontSize: "var(--fs-14)", color: "var(--status-danger-fg)" }}>
        {status.message}
        <button type="button" onClick={status.onRetry} style={{ marginLeft: 10, border: "none", background: "transparent", color: "var(--brand)", cursor: "pointer" }}>
          ลองใหม่
        </button>
        <button type="button" onClick={status.onCancel} style={{ marginLeft: 10, border: "none", background: "transparent", color: "var(--status-danger-fg)", cursor: "pointer" }}>
          ยกเลิก
        </button>
      </div>
    );
  };

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
            <SideNav groups={NAV_GROUPS} value={view} onChange={handleNavChange} />
          </div>
          <Button size="sm" block variant="ghost" icon={LogOut} onClick={handleSignOut} disabled={saving}>
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
                <Button icon={Plus} onClick={() => (showForm ? closeForm() : openCreateForm())} disabled={saving}>
                  {showForm ? "ปิดฟอร์ม" : "เพิ่มสื่อใหม่"}
                </Button>
              </div>

              {failedCleanups.length > 0 && (
                <div
                  className="kru-card"
                  style={{
                    padding: "var(--sp-5)",
                    marginTop: "var(--sp-6)",
                    background: "var(--status-danger-bg)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "var(--sp-4)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: "var(--fs-14)", color: "var(--status-danger-fg)" }}>
                    มีไฟล์ที่ลบไม่สำเร็จ {failedCleanups.length} รายการ (ไฟล์ค้างใน storage แต่ไม่กระทบข้อมูลสื่อที่บันทึกแล้ว)
                  </span>
                  <Button size="sm" variant="ghost" onClick={handleRetryCleanup} loading={saving}>
                    ลองลบอีกครั้ง
                  </Button>
                </div>
              )}

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
                      ไฟล์สื่อ (PDF, DOCX, PPTX, XLSX, ZIP — ไม่เกิน 50MB{form.delivery_mode === "file_download" ? " จำเป็นสำหรับโหมดไฟล์ดาวน์โหลด" : ""}; ไฟล์เกิน 6MB อัปโหลดแบบ resumable)
                    </label>
                    {renderUploadStatus("file")}
                    {uploadStatusFor("file") === null &&
                      (selectedFile ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: "var(--sp-3)", fontSize: "var(--fs-14)" }}>
                          <span>
                            {selectedFile.file.name} ({formatFileSize(selectedFile.file.size)}) — จะอัปโหลดเมื่อกด &quot;บันทึก&quot;
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
                      ))}
                    <input type="file" accept=".pdf,.docx,.pptx,.xlsx,.zip" onChange={handleFileSelect} disabled={uploadStatus.phase !== "idle"} />
                  </div>

                  <div className="kru-field">
                    <label className="kru-field__label">รูปปก (จำเป็นก่อนเผยแพร่)</label>
                    {renderUploadStatus("cover")}
                    {(coverPreviewUrl || form.cover_image_url) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverPreviewUrl || form.cover_image_url}
                        alt="ตัวอย่างรูปปก"
                        style={{ width: "100%", maxWidth: 320, height: 160, objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid var(--border-subtle)", marginBottom: "var(--sp-3)" }}
                      />
                    )}
                    {selectedCoverFile && uploadStatusFor("cover") === null && (
                      <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)", marginBottom: "var(--sp-3)" }}>รูปใหม่ — จะอัปโหลดเมื่อกด &quot;บันทึก&quot;</div>
                    )}
                    <input type="file" accept="image/*" onChange={handleCoverSelect} disabled={uploadStatus.phase !== "idle"} />
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
                          disabled={saving}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as ResourceStatus)}
                        >
                          <option value="draft">ฉบับร่าง</option>
                          <option value="published">เผยแพร่</option>
                          <option value="archived">เก็บถาวร</option>
                        </select>
                        <button
                          type="button"
                          aria-label="แก้ไขสื่อ"
                          disabled={saving}
                          onClick={() => openEditForm(item.id)}
                          style={{ border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: 6 }}
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label="ลบสื่อ"
                          disabled={saving}
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
