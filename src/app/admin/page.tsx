"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { LayoutDashboard, FolderCog, MessageSquareText, Users, LogOut, FolderOpen, Plus, Trash2, Pencil, Wallet, Check, X, History, Eye, ShieldCheck, Star, ChevronUp, ChevronDown, EyeOff, Flag, ListChecks } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Select, Badge, StatTile, SideNav, EmptyState, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { loadResourceTarget } from "@/lib/resourceTarget";
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
import { applySelfRoleChange } from "@/lib/memberRole";
import {
  canOfferAdminPlan,
  canRenewMember,
  effectiveMemberPlan,
  memberPlanChangeConfirmation,
  type AdminPlan,
  type AdminSubscription,
} from "@/lib/adminMembership";
import { normalizeFounderCapacity } from "@/lib/founderCapacity";
import { canAccessAdminConsole } from "@/lib/routeAccess";
import { RESOURCE_GRADE_OPTIONS, type ResourceGrade } from "@/lib/resourceGrades";
import { AdminMobileNav } from "./AdminMobileNav";
import {
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
  adminViewHref,
  moveFeaturedResource,
  parseAdminView,
  resourceAccessLabel,
  toggleFeaturedResource,
  type AdminView,
  type IssueReportStatus,
  type ResourceAccessMode,
} from "./adminConsole";

export const dynamic = "force-dynamic";

type View = AdminView;
type ResourceStatus = "draft" | "published" | "archived";
type UploadTarget = "cover" | "file";

interface AdminResource {
  id: string;
  title: string;
  meta: string | null;
  status: ResourceStatus;
  delivery_mode: DeliveryMode;
  access_mode: ResourceAccessMode;
}

interface AdminPlanRow extends AdminPlan {
  is_public: boolean;
  sort_order: number;
}

interface AdminMember {
  id: string;
  full_name: string | null;
  email: string;
  plan: string;
  role: "member" | "admin" | "owner";
}

interface AdminAuditLogRow {
  id: string;
  actor_id: string | null;
  target_id: string;
  field: "role" | "plan";
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

interface AdminRequest {
  id: string;
  title: string;
  votes: number;
  status: "pending" | "in_progress" | "done";
  requested_by: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
}

interface AdminUpgradeRequest {
  id: string;
  user_id: string;
  plan_id: string;
  status: "pending" | "approved" | "declined";
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
}

interface AdminReview {
  id: string;
  resource_id: string;
  user_id: string;
  rating: number;
  body: string;
  moderation_status: "pending" | "visible" | "hidden";
  created_at: string;
  updated_at: string;
  resources: { title: string } | null;
  profiles: { full_name: string | null; email: string } | null;
}

interface AdminIssueReport {
  id: string;
  resource_id: string;
  reporter_id: string;
  category: string;
  details: string | null;
  status: IssueReportStatus;
  created_at: string;
  updated_at: string;
  resources: { title: string } | null;
  profiles: { full_name: string | null; email: string } | null;
}

interface PlanBenefitRow {
  plan_id: string;
  feature_id: string;
  feature_name: string;
  feature_description: string | null;
  value_type: "boolean" | "integer";
  limit_value: number | null;
  sort_order: number;
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

const BASE_NAV_ITEMS: SideNavGroup["items"] = [
  { key: "dash", label: "ภาพรวม", icon: LayoutDashboard },
  { key: "content", label: "จัดการสื่อ", icon: FolderCog },
  { key: "requests", label: "คำขอจากครู", icon: MessageSquareText },
  { key: "moderation", label: "รีวิว / รายงาน", icon: ShieldCheck },
  { key: "upgrades", label: "คำขออัปเกรด", icon: Wallet },
  { key: "members", label: "สมาชิก", icon: Users },
  { key: "benefits", label: "ข้อความสิทธิ์แพ็ก", icon: ListChecks },
];

const OWNER_NAV_ITEM = { key: "audit", label: "ประวัติการแก้ไข", icon: History };

const STATUS_LABEL: Record<ResourceStatus, string> = { draft: "ฉบับร่าง", published: "เผยแพร่แล้ว", archived: "เก็บถาวร" };
const STATUS_TONE: Record<ResourceStatus, "success" | "warning" | "neutral"> = { draft: "warning", published: "success", archived: "neutral" };
const REQUEST_LABEL: Record<AdminRequest["status"], string> = { pending: "รอพิจารณา", in_progress: "กำลังผลิต", done: "เสร็จแล้ว" };
const REQUEST_TONE: Record<AdminRequest["status"], "warning" | "info" | "success"> = { pending: "warning", in_progress: "info", done: "success" };
const ROLE_LABEL: Record<AdminMember["role"], string> = { member: "สมาชิก", admin: "แอดมิน", owner: "เจ้าของระบบ" };
const AUDIT_FIELD_LABEL: Record<AdminAuditLogRow["field"], string> = { role: "บทบาท", plan: "แพ็ก" };
const MODERATION_PAGE_SIZE = 50;
const ADMIN_REVIEW_SELECT = "id, resource_id, user_id, rating, body, moderation_status, created_at, updated_at, resources(title), profiles(full_name, email)";
const ADMIN_REPORT_SELECT = "id, resource_id, reporter_id, category, details, status, created_at, updated_at, resources(title), profiles(full_name, email)";

const EMPTY_FORM = {
  title: "",
  meta: "",
  description: "",
  category: "",
  grade_levels: [] as ResourceGrade[],
  delivery_mode: "web_app" as DeliveryMode,
  cta_url: "",
  cover_image_url: "",
  access_mode: "locked" as ResourceAccessMode,
  plan_ids: [] as string[],
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
  const [viewerRole, setViewerRole] = useState<AdminMember["role"] | null>(null);
  const [view, setView] = useState<View>("dash");
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [members, setMembers] = useState<AdminMember[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<AdminUpgradeRequest[]>([]);
  const [plans, setPlans] = useState<AdminPlanRow[]>([]);
  const [resourcePlanAccess, setResourcePlanAccess] = useState<Map<string, string[]>>(new Map());
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [issueReports, setIssueReports] = useState<AdminIssueReport[]>([]);
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const [reportTotal, setReportTotal] = useState(0);
  const [benefitRows, setBenefitRows] = useState<PlanBenefitRow[]>([]);
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[] | null>(null);
  const [membershipDataError, setMembershipDataError] = useState<string | null>(null);
  const [founderSeatsUsed, setFounderSeatsUsed] = useState<number | null>(null);
  const [renewingId, setRenewingId] = useState<string | null>(null);
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AdminAuditLogRow[]>([]);
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
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [moderationTab, setModerationTab] = useState<"reviews" | "reports">("reviews");

  // Derived (not state) so nothing calls setState from inside an effect —
  // the effect below only performs the revoke side effect on cleanup.
  const coverPreviewUrl = useMemo(() => (selectedCoverFile ? URL.createObjectURL(selectedCoverFile) : null), [selectedCoverFile]);
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  // PostgREST caps a single response (often at 1,000 rows). Never infer Free
  // from a truncated subscription result in the admin member table.
  const loadCurrentSubscriptions = async () => {
    const rows: AdminSubscription[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("subscriptions")
        .select("id, user_id, plan_id, status, source, billing_interval, current_period_end, founder_status, founder_price_lock")
        .in("status", ["active", "past_due"])
        .order("user_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      rows.push(...((data as AdminSubscription[]) ?? []));
      if ((data?.length ?? 0) < pageSize) return { data: rows, error: null };
    }
  };

  const reloadAdminData = async (nextReviewPage = reviewPage, nextReportPage = reportPage) => {
    const [
      { data: resourceRows, error: resourceError },
      { data: memberRows, error: memberError },
      { data: requestRows, error: requestError },
      { data: upgradeRows, error: upgradeError },
      { data: planRows, error: planError },
      { data: subscriptionRows, error: subscriptionError },
      { data: founderCount, error: founderCountError },
      { data: auditRows, error: auditError },
      { data: accessRows, error: accessError },
      { data: featuredRows, error: featuredError },
      { data: reviewRows, error: reviewError, count: reviewCount },
      { data: reportRows, error: reportError, count: reportCount },
      { data: benefits, error: benefitError },
    ] = await Promise.all([
      supabase.from("resources").select("id, title, meta, status, delivery_mode, access_mode").order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, email, plan, role").order("created_at", { ascending: false }),
      supabase.from("requests").select("id, title, votes, status, requested_by, created_at, profiles(full_name, email)").order("votes", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("upgrade_requests").select("id, user_id, plan_id, status, created_at, profiles(full_name, email)").order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name, lifecycle_status, price_amount_thb, is_upgradeable, is_public, sort_order").order("sort_order", { ascending: true }),
      loadCurrentSubscriptions(),
      supabase.rpc("get_founder_capacity"),
      // RLS scopes this to owners only — a non-owner viewer just gets [] back, no error.
      supabase.from("admin_audit_log").select("id, actor_id, target_id, field, old_value, new_value, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("resource_plan_access").select("resource_id, plan_id").order("plan_id", { ascending: true }),
      supabase.from("featured_resources").select("resource_id, position").order("position", { ascending: true }),
      supabase.from("resource_reviews").select(ADMIN_REVIEW_SELECT, { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(nextReviewPage * MODERATION_PAGE_SIZE, (nextReviewPage + 1) * MODERATION_PAGE_SIZE - 1),
      supabase.from("resource_issue_reports").select(ADMIN_REPORT_SELECT, { count: "exact" }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(nextReportPage * MODERATION_PAGE_SIZE, (nextReportPage + 1) * MODERATION_PAGE_SIZE - 1),
      supabase.from("plan_benefit_catalog").select("plan_id, feature_id, feature_name, feature_description, value_type, limit_value, sort_order").order("sort_order", { ascending: true }).order("feature_id", { ascending: true }),
    ]);
    if (resourceError) console.error("Failed to load resources:", resourceError.message);
    if (memberError) console.error("Failed to load members:", memberError.message);
    if (requestError) console.error("Failed to load requests:", requestError.message);
    setResources((resourceRows as AdminResource[]) ?? []);
    setMembers((memberRows as AdminMember[]) ?? []);
    setRequests((requestRows as unknown as AdminRequest[]) ?? []);
    if (upgradeError) console.error("Failed to load upgrade requests:", upgradeError.message);
    setUpgradeRequests((upgradeRows as unknown as AdminUpgradeRequest[]) ?? []);
    if (planError) console.error("Failed to load plans:", planError.message);
    setPlans((planRows as AdminPlanRow[]) ?? []);
    if (subscriptionError) console.error("Failed to load subscriptions:", subscriptionError.message);
    setSubscriptions(subscriptionError || planError ? null : ((subscriptionRows as AdminSubscription[]) ?? []));
    setMembershipDataError(subscriptionError || planError ? "ไม่สามารถตรวจแพ็กที่มีผลจริงได้ กรุณาตรวจการเชื่อมต่อและ migration ก่อนแก้ไขแพ็กสมาชิก" : null);
    if (founderCountError) console.error("Failed to load Founder seat count:", founderCountError.message);
    setFounderSeatsUsed(founderCountError ? null : normalizeFounderCapacity(founderCount)?.used ?? null);
    if (auditError) console.error("Failed to load audit log:", auditError.message);
    setAuditLog(auditRows ?? []);
    if (accessError) console.error("Failed to load resource access:", accessError.message);
    const accessByResource = new Map<string, string[]>();
    for (const row of (accessRows ?? []) as { resource_id: string; plan_id: string }[]) {
      accessByResource.set(row.resource_id, [...(accessByResource.get(row.resource_id) ?? []), row.plan_id]);
    }
    setResourcePlanAccess(accessByResource);
    if (featuredError) console.error("Failed to load featured resources:", featuredError.message);
    setFeaturedIds(((featuredRows ?? []) as { resource_id: string }[]).map((row) => row.resource_id));
    if (reviewError) console.error("Failed to load reviews:", reviewError.message);
    setReviews((reviewRows as unknown as AdminReview[]) ?? []);
    if (!reviewError) {
      setReviewTotal(reviewCount ?? 0);
      setReviewPage(nextReviewPage);
    }
    if (reportError) console.error("Failed to load issue reports:", reportError.message);
    setIssueReports((reportRows as unknown as AdminIssueReport[]) ?? []);
    if (!reportError) {
      setReportTotal(reportCount ?? 0);
      setReportPage(nextReportPage);
    }
    if (benefitError) console.error("Failed to load plan benefits:", benefitError.message);
    setBenefitRows((benefits as PlanBenefitRow[]) ?? []);
  };

  const subscriptionsByUser = useMemo(
    () => new Map((subscriptions ?? []).map((subscription) => [subscription.user_id, subscription])),
    [subscriptions],
  );
  const mutationBusy = saving || pendingAction !== null || renewingId !== null || changingPlanId !== null;

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
      if (!canAccessAdminConsole(profile?.role)) {
        router.push("/app");
        return;
      }
      setAdminId(user.id);
      setViewerRole(profile.role);
      setView(parseAdminView(new URLSearchParams(window.location.search).get("view"), profile.role === "owner"));
      setAllowed(true);
      setChecking(false);
      await reloadAdminData();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, router]);

  useEffect(() => {
    if (!viewerRole) return;
    const syncViewFromHistory = () => {
      setView(parseAdminView(new URLSearchParams(window.location.search).get("view"), viewerRole === "owner"));
    };
    window.addEventListener("popstate", syncViewFromHistory);
    return () => window.removeEventListener("popstate", syncViewFromHistory);
  }, [viewerRole]);

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
    if (mutationBusy) {
      window.alert("กรุณารอให้การบันทึกปัจจุบันเสร็จก่อน");
      return;
    }
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
    if (mutationBusy) {
      window.alert("กรุณารอให้การบันทึกปัจจุบันเสร็จก่อน");
      return;
    }
    const guard = guardAgainstBusyForm(saving);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    const nextView = parseAdminView(key, viewerRole === "owner");
    setView(nextView);
    window.history.pushState(null, "", adminViewHref(nextView));
  };

  const openCreateForm = () => {
    const guard = guardAgainstBusyForm(mutationBusy);
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
    const guard = guardAgainstBusyForm(mutationBusy);
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
    const guard = guardAgainstBusyForm(mutationBusy);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    const [{ data, error }, { target: resolved, error: targetError }] = await Promise.all([
      supabase.from("resources")
        .select("title, meta, description, category, grade_levels, delivery_mode, cover_image_url, access_mode, file_size, file_mime_type")
        .eq("id", id).single(),
      loadResourceTarget(supabase, id),
    ]);
    if (error || !data || targetError || !resolved) {
      window.alert(`โหลดข้อมูลสื่อไม่สำเร็จ: ${error?.message ?? targetError ?? ""}`);
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
      grade_levels: data.grade_levels ?? [],
      delivery_mode: data.delivery_mode,
      cta_url: resolved.cta_url ?? "",
      cover_image_url: data.cover_image_url ?? "",
      access_mode: data.access_mode as ResourceAccessMode,
      plan_ids: resourcePlanAccess.get(id) ?? [],
      file_path: resolved.file_path ?? "",
      file_name: resolved.file_name ?? "",
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

  const handleGradeLevelChange = (grade: ResourceGrade, checked: boolean) => {
    setForm((current) => {
      if (!checked) {
        return { ...current, grade_levels: current.grade_levels.filter((value) => value !== grade) };
      }
      if (grade === "all") {
        return { ...current, grade_levels: ["all"] };
      }

      const selected = new Set<ResourceGrade>([
        ...current.grade_levels.filter((value) => value !== "all"),
        grade,
      ]);
      return {
        ...current,
        grade_levels: RESOURCE_GRADE_OPTIONS
          .map((option) => option.value)
          .filter((value) => selected.has(value)),
      };
    });
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
    const busyGuard = guardAgainstBusyForm(mutationBusy);
    if (!busyGuard.allowed) {
      window.alert(busyGuard.message);
      return;
    }
    setFormError(null);
    if (!form.title.trim()) {
      setFormError("กรุณากรอกชื่อสื่อ");
      return;
    }
    if (form.access_mode === "plans" && form.plan_ids.length === 0) {
      setFormError("กรุณาเลือกอย่างน้อย 1 แพ็กสำหรับสื่อเฉพาะแพ็ก");
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
      if (!resourceId) {
        setFormError("เกิดข้อผิดพลาด กรุณาปิดฟอร์มแล้วเปิดใหม่อีกครั้ง");
        return;
      }
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
        grade_levels: form.grade_levels,
        delivery_mode: form.delivery_mode,
        cta_url: form.cta_url.trim() || null,
        cover_image_url: coverUrl,
        ...fileFields,
      };

      const result = await commitResourceFileChange({
        // Row fields and access grants commit (or roll back) together inside
        // one SECURITY DEFINER transaction. This prevents a failed access
        // validation from leaving edited content under stale public access.
        saveRow: async () => await supabase.rpc("admin_save_resource", {
          p_resource_id: resourceId,
          p_create: !editingId,
          p_title: payload.title,
          p_meta: payload.meta,
          p_description: payload.description,
          p_category: payload.category,
          p_grade_levels: payload.grade_levels,
          p_delivery_mode: payload.delivery_mode,
          p_cta_url: payload.cta_url,
          p_cover_image_url: payload.cover_image_url,
          p_file_path: payload.file_path,
          p_file_name: payload.file_name,
          p_file_size: payload.file_size,
          p_file_mime_type: payload.file_mime_type,
          p_access_mode: form.access_mode,
          p_plan_ids: form.access_mode === "plans" ? form.plan_ids : [],
        }),
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
    const guard = guardAgainstBusyForm(mutationBusy);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    setSaving(true);
    try {
      if (status === "published") {
        const target = resources.find((r) => r.id === id);
        const [{ data: metadata, error: queryError }, { target: resolved, error: targetError }] = await Promise.all([
          supabase.from("resources").select("delivery_mode, cover_image_url").eq("id", id).single(),
          loadResourceTarget(supabase, id),
        ]);
        // Fail closed: a query error or a missing row must never be treated
        // as "no problems found" — both block the publish.
        const publishGuard = evaluatePublishGuard({
          data: metadata && resolved
            ? { status: "published", deliveryMode: metadata.delivery_mode, coverImageUrl: metadata.cover_image_url, filePath: resolved.file_path, ctaUrl: resolved.cta_url }
            : null,
          error: queryError || targetError ? { message: queryError?.message ?? targetError ?? "" } : null,
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
    const guard = guardAgainstBusyForm(mutationBusy);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    if (!window.confirm(`ลบ "${title}" ใช่หรือไม่? ลบแล้วกู้คืนไม่ได้`)) return;
    setSaving(true);
    try {
      const { target, error: lookupError } = await loadResourceTarget(supabase, id);
      // Fail closed: if we can't read file_path we don't know whether a
      // file needs cleanup, so the resource row must not be deleted either
      // — otherwise a delete could silently orphan a private file forever.
      if (!target || !canProceedAfterFileLookup(lookupError ? { message: lookupError } : null)) {
        window.alert(`ลบไม่สำเร็จ: ตรวจสอบไฟล์แนบไม่ได้ (${lookupError ?? ""}) กรุณาลองใหม่ — ไม่ได้ลบข้อมูลสื่อ`);
        return;
      }
      const { error } = await supabase.from("resources").delete().eq("id", id);
      if (error) {
        window.alert(`ลบไม่สำเร็จ: ${error.message}`);
        return;
      }
      if (target.file_path) {
        const { failed } = await retryCleanup([{ storage: supabase.storage.from("resource-files"), path: target.file_path }]);
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
    if (pendingAction) return;
    setPendingAction(`request:${id}`);
    try {
      const { error } = await supabase.from("requests").update({ status }).eq("id", id);
      if (error) {
        window.alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  const handleApproveUpgrade = async (request: AdminUpgradeRequest) => {
    if (pendingAction) return;
    setPendingAction(`upgrade:${request.id}`);
    try {
      const { error } = await supabase.rpc("approve_upgrade_request", { p_request_id: request.id });
      if (error) {
        const friendly = /Founder 100 is full/i.test(error.message)
          ? "Founder ครบ 100 สิทธิ์แล้ว ไม่สามารถอนุมัติเพิ่มได้"
          : `อัปเกรดแพ็กไม่สำเร็จ: ${error.message}`;
        window.alert(friendly);
        return;
      }
      await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  const handleDeclineUpgrade = async (id: string) => {
    if (pendingAction) return;
    setPendingAction(`upgrade:${id}`);
    try {
      const { error } = await supabase.rpc("decline_upgrade_request", { p_request_id: id });
      if (error) {
        window.alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveFeatured = async () => {
    if (mutationBusy) return;
    setPendingAction("featured");
    try {
      const { error } = await supabase.rpc("set_featured_resources", { p_resource_ids: featuredIds });
      if (error) {
        window.alert(`บันทึกสื่อแนะนำไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reloadAdminData();
      window.alert("บันทึกลำดับสื่อแนะนำแล้ว");
    } finally {
      setPendingAction(null);
    }
  };

  const handleReviewVisibility = async (review: AdminReview) => {
    if (pendingAction) return;
    setPendingAction(`review:${review.id}`);
    try {
      const { error } = await supabase.rpc("admin_set_review_visibility", {
        p_review_id: review.id,
        p_visible: review.moderation_status !== "visible",
      });
      if (error) window.alert(`อัปเดตรีวิวไม่สำเร็จ: ${error.message}`);
      else await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  const handleReviewPageChange = async (nextPage: number) => {
    if (pendingAction || nextPage < 0 || nextPage * MODERATION_PAGE_SIZE >= reviewTotal) return;
    setPendingAction("review-page");
    try {
      await reloadAdminData(nextPage, reportPage);
    } finally {
      setPendingAction(null);
    }
  };

  const handleReportPageChange = async (nextPage: number) => {
    if (pendingAction || nextPage < 0 || nextPage * MODERATION_PAGE_SIZE >= reportTotal) return;
    setPendingAction("report-page");
    try {
      await reloadAdminData(reviewPage, nextPage);
    } finally {
      setPendingAction(null);
    }
  };

  const handleDeleteReview = async (review: AdminReview) => {
    if (pendingAction || !window.confirm("ลบรีวิวนี้ถาวรใช่หรือไม่?")) return;
    setPendingAction(`review:${review.id}`);
    try {
      const { error } = await supabase.rpc("admin_delete_resource_review", { p_review_id: review.id });
      if (error) window.alert(`ลบรีวิวไม่สำเร็จ: ${error.message}`);
      else await reloadAdminData(reviews.length === 1 ? Math.max(0, reviewPage - 1) : reviewPage, reportPage);
    } finally {
      setPendingAction(null);
    }
  };

  const handleIssueStatus = async (id: string, status: IssueReportStatus) => {
    if (pendingAction) return;
    setPendingAction(`report:${id}`);
    try {
      const { error } = await supabase.rpc("admin_set_resource_issue_status", { p_report_id: id, p_status: status });
      if (error) window.alert(`อัปเดตรายงานไม่สำเร็จ: ${error.message}`);
      else await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  const handleBenefitCopy = async (featureId: string, event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pendingAction) return;
    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    const description = String(fields.get("description") ?? "").trim();
    if (!name) {
      window.alert("กรุณากรอกชื่อสิทธิ์");
      return;
    }
    setPendingAction(`benefit:${featureId}`);
    try {
      const { error } = await supabase.rpc("admin_update_feature_copy", {
        p_feature_id: featureId,
        p_name: name,
        p_description: description,
      });
      if (error) window.alert(`บันทึกข้อความสิทธิ์ไม่สำเร็จ: ${error.message}`);
      else await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  const handleMemberPlanChange = async (id: string, currentPlan: string, nextPlan: string, subscription: AdminSubscription | null) => {
    if (subscriptions === null || mutationBusy || currentPlan === nextPlan) return;
    const currentName = plans.find((plan) => plan.id === currentPlan)?.name ?? currentPlan;
    const nextName = plans.find((plan) => plan.id === nextPlan && canOfferAdminPlan(plan, currentPlan))?.name;
    if (!nextName) return;
    if (!window.confirm(memberPlanChangeConfirmation(currentName, nextName, subscription))) return;
    setChangingPlanId(id);
    try {
      const { error } = await supabase.rpc("set_member_plan", { p_user_id: id, p_plan_id: nextPlan, p_reason: "admin_members_table" });
      if (error) {
        window.alert(`อัปเดตแพ็กไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reloadAdminData();
    } catch (error) {
      window.alert(`อัปเดตแพ็กไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ"}`);
    } finally {
      setChangingPlanId(null);
    }
  };

  const handleRenewSubscription = async (subscription: AdminSubscription) => {
    if (mutationBusy || !canRenewMember(subscription)) return;
    const plan = plans.find((item) => item.id === subscription.plan_id && item.lifecycle_status === "active");
    const price = subscription.plan_id === "founder" ? 299 : plan?.price_amount_thb;
    if (!plan || typeof price !== "number") {
      window.alert("ไม่พบราคาแพ็กปัจจุบัน จึงยังต่ออายุไม่ได้");
      return;
    }
    if (!window.confirm(`ต่ออายุ ${plan.name} ในราคา ${price.toLocaleString("th-TH")} บาท/ปี ให้สมาชิกคนนี้หรือไม่? ระบบจะบันทึกสิทธิ์ แต่ไม่ตัดเงินอัตโนมัติ`)) return;
    setRenewingId(subscription.id);
    try {
      const { error } = await supabase.rpc("renew_subscription", { p_subscription_id: subscription.id });
      if (error) {
        window.alert(`ต่ออายุไม่สำเร็จ: ${error.message}`);
        return;
      }
      await reloadAdminData();
    } catch (error) {
      window.alert(`ต่ออายุไม่สำเร็จ: ${error instanceof Error ? error.message : "เกิดข้อผิดพลาดในการเชื่อมต่อ"}`);
    } finally {
      setRenewingId(null);
    }
  };

  // Only an owner can reach this at all — the role <select> in the members
  // table below is only rendered as editable for an owner viewer, and the
  // server independently enforces the same rule (is_owner() in the
  // prevent_self_privilege_escalation trigger), so this is UX, not the
  // actual security boundary.
  const handleMemberRoleChange = async (id: string, role: AdminMember["role"]) => {
    if (mutationBusy) return;
    if (id === adminId && role === "member" && !window.confirm("นี่คือบัญชีของคุณเอง — ลดสิทธิ์เป็นสมาชิกจะทำให้ออกจากหลังบ้านทันที ยืนยันหรือไม่?")) {
      return;
    }
    if (id === adminId && viewerRole === "owner" && role !== "owner" && !window.confirm("นี่คือบัญชีของคุณเอง — สละสิทธิ์เจ้าของระบบ ยืนยันหรือไม่? ระบบต้องมีเจ้าของระบบอย่างน้อย 1 คนเสมอ")) {
      return;
    }
    setPendingAction(`role:${id}`);
    try {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
      if (error) {
        // Failed (e.g. the last-owner guard rejected it) — nothing actually
        // changed server-side, so local role/UI must stay exactly as it was.
        const friendly = /last remaining owner/i.test(error.message)
          ? "ไม่สามารถลดสิทธิ์เจ้าของระบบคนสุดท้ายได้ — ต้องมีเจ้าของระบบอย่างน้อย 1 คนเสมอ"
          : `อัปเดตบทบาทไม่สำเร็จ: ${error.message}`;
        window.alert(friendly);
        return;
      }
      if (id === adminId && viewerRole) {
        // The update above actually took effect on the viewer's own row —
        // immediately align locally-rendered privileges with the server.
        const effect = applySelfRoleChange(viewerRole, role, view);
        if (effect) {
          setViewerRole(effect.viewerRole);
          if (effect.clearAuditLog) setAuditLog([]);
          if (effect.view) setView(effect.view as View);
          if (effect.redirectToApp) {
            router.push("/app");
            return;
          }
        }
      }
      await reloadAdminData();
    } finally {
      setPendingAction(null);
    }
  };

  if (checking || !allowed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <span className="kru-spin" aria-hidden="true" style={{ width: 28, height: 28, borderRadius: 999, border: "3px solid var(--border-subtle)", borderTopColor: "var(--brand)" }} />
      </div>
    );
  }

  const isOwner = viewerRole === "owner";
  const navGroups: SideNavGroup[] = [{ items: isOwner ? [...BASE_NAV_ITEMS, OWNER_NAV_ITEM] : BASE_NAV_ITEMS }];
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));

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
      <AdminMobileNav
        groups={navGroups}
        value={view}
        disabled={mutationBusy}
        onChange={handleNavChange}
        onMemberPreview={() => router.push("/app?memberPreview=1")}
        onSignOut={handleSignOut}
      />
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
            <SideNav groups={navGroups} value={view} onChange={handleNavChange} />
          </div>
          <Button size="sm" block variant="soft" icon={Eye} onClick={() => router.push("/app?memberPreview=1")} disabled={mutationBusy} style={{ marginBottom: "var(--sp-3)" }}>
            ดูหน้าสมาชิก
          </Button>
          <Button size="sm" block variant="ghost" icon={LogOut} onClick={handleSignOut} disabled={mutationBusy}>
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
                <Button icon={Plus} onClick={() => (showForm ? closeForm() : openCreateForm())} disabled={mutationBusy}>
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
                  <div className="kru-admin-form-grid">
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
                  <fieldset className="kru-field" style={{ margin: 0, padding: 0, border: "none", minWidth: 0 }}>
                    <legend className="kru-field__label">ระดับชั้น</legend>
                    <p id="resource-grade-help" style={{ margin: "0 0 var(--sp-3)", color: "var(--text-muted)", fontSize: "var(--fs-13)" }}>
                      เลือกได้หลายระดับ หรือเลือก “ทุกระดับ” เพียงรายการเดียว
                    </p>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                        gap: "var(--sp-3)",
                      }}
                    >
                      {RESOURCE_GRADE_OPTIONS.map((option) => (
                        <label
                          key={option.value}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            minHeight: 44,
                            padding: "8px 10px",
                            border: "1px solid var(--border-subtle)",
                            borderRadius: "var(--r-md)",
                            background: form.grade_levels.includes(option.value) ? "var(--surface-sunken)" : "var(--surface-card)",
                            cursor: "pointer",
                            fontSize: "var(--fs-14)",
                          }}
                        >
                          <input
                            type="checkbox"
                            value={option.value}
                            checked={form.grade_levels.includes(option.value)}
                            aria-describedby="resource-grade-help"
                            onChange={(event) => handleGradeLevelChange(option.value, event.target.checked)}
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
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

                  <fieldset className="kru-admin-access-fieldset">
                    <legend className="kru-field__label">สิทธิ์เข้าถึงสื่อ</legend>
                    <p id="resource-access-help" className="kru-admin-field-help">สถานะเผยแพร่และสิทธิ์เข้าถึงเป็นคนละส่วนกัน ผู้ไม่มีสิทธิ์เห็นได้เฉพาะข้อมูลสาธารณะที่ปลอดภัย</p>
                    <div className="kru-admin-access-options" role="radiogroup" aria-describedby="resource-access-help">
                      {([
                        ["public", "ฟรีทุกคน"],
                        ["authenticated", "เฉพาะสมาชิกที่ล็อกอิน"],
                        ["plans", "เฉพาะแพ็กที่เลือก"],
                        ["locked", "ล็อก / ยังไม่เปิด"],
                      ] as [ResourceAccessMode, string][]).map(([mode, label]) => (
                        <label key={mode} className="kru-admin-choice">
                          <input
                            type="radio"
                            name="resource-access-mode"
                            value={mode}
                            checked={form.access_mode === mode}
                            onChange={() => setForm({ ...form, access_mode: mode, plan_ids: mode === "plans" ? form.plan_ids : [] })}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                    {form.access_mode === "plans" && (
                      <div className="kru-admin-plan-options" aria-label="เลือกแพ็กที่ใช้สื่อนี้ได้">
                        {plans.length === 0 && (
                          <p role="alert" className="kru-admin-field-help">ยังไม่มีแพ็กที่ใช้งานได้ จึงยังบันทึกสิทธิ์แบบเฉพาะแพ็กไม่ได้</p>
                        )}
                        {plans.map((plan) => (
                          <label key={plan.id} className="kru-admin-choice">
                            <input
                              type="checkbox"
                              checked={form.plan_ids.includes(plan.id)}
                              onChange={(event) => setForm({
                                ...form,
                                plan_ids: event.target.checked
                                  ? [...new Set([...form.plan_ids, plan.id])]
                                  : form.plan_ids.filter((id) => id !== plan.id),
                              })}
                            />
                            <span>{plan.name}{plan.lifecycle_status !== "active" || !plan.is_public ? " (แพ็กเดิม/ไม่เปิดขาย)" : ""}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </fieldset>
                  <Button type="submit" loading={saving} disabled={mutationBusy && !saving}>
                    {editingId ? "บันทึกการแก้ไข" : "บันทึกเป็นฉบับร่าง"}
                  </Button>
                </form>
              )}

              <section className="kru-card kru-admin-featured-panel" aria-labelledby="featured-resources-title">
                <div className="kru-admin-section-heading">
                  <div>
                    <h2 id="featured-resources-title" style={{ fontSize: "var(--fs-18)" }}>สื่อแนะนำใน Hero</h2>
                    <p className="kru-admin-field-help">เลือกสื่อที่เผยแพร่แล้วได้สูงสุด 5 รายการ และจัดลำดับโดยไม่ทำรายการซ้ำ</p>
                  </div>
                  <Button size="sm" icon={Star} onClick={handleSaveFeatured} loading={pendingAction === "featured"} disabled={mutationBusy && pendingAction !== "featured"}>
                    บันทึกลำดับ
                  </Button>
                </div>
                {resources.filter((resource) => resource.status === "published").length === 0 ? (
                  <p className="kru-admin-field-help">ยังไม่มีสื่อที่เผยแพร่ให้เลือก</p>
                ) : (
                  <div className="kru-admin-featured-list">
                    {resources.filter((resource) => resource.status === "published").map((resource) => {
                      const position = featuredIds.indexOf(resource.id);
                      const selected = position >= 0;
                      return (
                        <div key={resource.id} className="kru-admin-featured-item">
                          <label className="kru-admin-choice" style={{ flex: 1 }}>
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!selected && featuredIds.length >= 5}
                              onChange={(event) => {
                                const next = toggleFeaturedResource(featuredIds, resource.id, event.target.checked);
                                if (event.target.checked && next === featuredIds) window.alert("เลือกสื่อแนะนำได้สูงสุด 5 รายการ");
                                setFeaturedIds(next);
                              }}
                            />
                            <span>{selected ? `${position + 1}. ` : ""}{resource.title}</span>
                          </label>
                          {selected && (
                            <div className="kru-admin-order-actions">
                              <button type="button" className="kru-admin-icon-action" aria-label={`เลื่อน ${resource.title} ขึ้น`} disabled={position === 0} onClick={() => setFeaturedIds(moveFeaturedResource(featuredIds, resource.id, -1))}>
                                <ChevronUp size={18} aria-hidden="true" />
                              </button>
                              <button type="button" className="kru-admin-icon-action" aria-label={`เลื่อน ${resource.title} ลง`} disabled={position === featuredIds.length - 1} onClick={() => setFeaturedIds(moveFeaturedResource(featuredIds, resource.id, 1))}>
                                <ChevronDown size={18} aria-hidden="true" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <div style={{ marginTop: "var(--sp-6)" }}>
                {resources.length === 0 ? (
                  <EmptyState icon={FolderOpen} title="ยังไม่มีสื่อ" description="กด “เพิ่มสื่อใหม่” เพื่อเริ่มสร้างสื่อชิ้นแรก" />
                ) : (
                  <div className="kru-card" style={{ overflow: "hidden" }}>
                    {resources.map((item, i) => (
                      <div key={item.id} className="kru-admin-resource-row" style={{ borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)" }}>
                        <div style={{ flex: 1, minWidth: 180 }}>
                          <div style={{ fontWeight: "var(--fw-semibold)" }}>{item.title}</div>
                          <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{item.meta}</div>
                        </div>
                        <div className="kru-admin-resource-badges">
                          <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                          <Badge tone={item.access_mode === "locked" ? "neutral" : item.access_mode === "public" ? "success" : "brand"}>
                            {resourceAccessLabel(item.access_mode, (resourcePlanAccess.get(item.id) ?? []).map((id) => planNameById.get(id) ?? id))}
                          </Badge>
                        </div>
                        <select
                          className="kru-select"
                          aria-label={`สถานะเผยแพร่ของ ${item.title}`}
                          style={{ minHeight: 44, width: "auto" }}
                          value={item.status}
                          disabled={mutationBusy}
                          onChange={(e) => handleStatusChange(item.id, e.target.value as ResourceStatus)}
                        >
                          <option value="draft">ฉบับร่าง</option>
                          <option value="published">เผยแพร่</option>
                          <option value="archived">เก็บถาวร</option>
                        </select>
                        <button
                          type="button"
                          aria-label="แก้ไขสื่อ"
                          disabled={mutationBusy}
                          onClick={() => openEditForm(item.id)}
                          className="kru-admin-icon-action"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          aria-label="ลบสื่อ"
                          disabled={mutationBusy}
                          onClick={() => handleDeleteResource(item.id, item.title)}
                          className="kru-admin-icon-action kru-admin-icon-action--danger"
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

          {view === "moderation" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>รีวิวและรายงานปัญหา</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>ข้อมูลผู้รีวิวและผู้รายงานแสดงเฉพาะทีมงานหลังบ้าน</p>
              <div className="kru-admin-tablist" role="tablist" aria-label="เลือกประเภทรายการตรวจสอบ">
                <button id="admin-reviews-tab" type="button" role="tab" aria-controls="admin-reviews-panel" aria-selected={moderationTab === "reviews"} className={moderationTab === "reviews" ? "is-active" : ""} onClick={() => setModerationTab("reviews")}>
                  รีวิว ({reviewTotal})
                </button>
                <button id="admin-reports-tab" type="button" role="tab" aria-controls="admin-reports-panel" aria-selected={moderationTab === "reports"} className={moderationTab === "reports" ? "is-active" : ""} onClick={() => setModerationTab("reports")}>
                  รายงานปัญหา ({reportTotal})
                </button>
              </div>

              {moderationTab === "reviews" && (
                reviews.length === 0 ? (
                  <EmptyState icon={Star} title="ยังไม่มีรีวิว" description="รีวิวจากสมาชิกที่มีสิทธิ์ใช้สื่อจะปรากฏที่นี่" />
                ) : (
                  <div id="admin-reviews-panel" className="kru-admin-card-list" role="tabpanel" aria-labelledby="admin-reviews-tab" tabIndex={0}>
                    {reviews.map((review) => (
                      <article key={review.id} className="kru-card kru-admin-moderation-card">
                        <div className="kru-admin-section-heading">
                          <div>
                            <h2 style={{ fontSize: "var(--fs-16)" }}>{review.resources?.title ?? "(ไม่พบชื่อสื่อ)"}</h2>
                            <p className="kru-admin-private-meta">{review.profiles?.full_name || review.profiles?.email || "(ไม่พบผู้ใช้)"} · {new Date(review.created_at).toLocaleString("th-TH")}</p>
                          </div>
                          <Badge tone={review.moderation_status === "visible" ? "success" : "neutral"}>
                            {review.moderation_status === "visible" ? "แสดงอยู่" : review.moderation_status === "pending" ? "รอตรวจสอบ" : "ซ่อนแล้ว"}
                          </Badge>
                        </div>
                        <div aria-label={`${review.rating} ดาว`} className="kru-admin-review-stars">{"★".repeat(review.rating)}{"☆".repeat(Math.max(0, 5 - review.rating))}</div>
                        <p className="kru-admin-review-body">{review.body}</p>
                        <div className="kru-admin-card-actions">
                          <Button size="sm" variant="soft" icon={review.moderation_status === "visible" ? EyeOff : Eye} disabled={pendingAction !== null} loading={pendingAction === `review:${review.id}`} onClick={() => handleReviewVisibility(review)}>
                            {review.moderation_status === "visible" ? "ซ่อนรีวิว" : "แสดงรีวิว"}
                          </Button>
                          <Button size="sm" variant="ghost" icon={Trash2} disabled={pendingAction !== null} onClick={() => handleDeleteReview(review)}>
                            ลบรีวิว
                          </Button>
                        </div>
                      </article>
                    ))}
                    {reviewTotal > MODERATION_PAGE_SIZE && (
                      <div className="kru-admin-pagination" aria-label="เปลี่ยนหน้ารีวิว">
                        <Button size="sm" variant="ghost" disabled={reviewPage === 0 || pendingAction !== null} onClick={() => void handleReviewPageChange(reviewPage - 1)}>หน้าก่อน</Button>
                        <span>หน้า {reviewPage + 1} จาก {Math.ceil(reviewTotal / MODERATION_PAGE_SIZE)}</span>
                        <Button size="sm" variant="ghost" disabled={(reviewPage + 1) * MODERATION_PAGE_SIZE >= reviewTotal || pendingAction !== null} onClick={() => void handleReviewPageChange(reviewPage + 1)}>หน้าถัดไป</Button>
                      </div>
                    )}
                  </div>
                )
              )}

              {moderationTab === "reports" && (
                issueReports.length === 0 ? (
                  <EmptyState icon={Flag} title="ยังไม่มีรายงานปัญหา" description="รายงานจากสมาชิกจะปรากฏที่นี่" />
                ) : (
                  <div id="admin-reports-panel" className="kru-admin-card-list" role="tabpanel" aria-labelledby="admin-reports-tab" tabIndex={0}>
                    {issueReports.map((report) => (
                      <article key={report.id} className="kru-card kru-admin-moderation-card">
                        <div className="kru-admin-section-heading">
                          <div>
                            <h2 style={{ fontSize: "var(--fs-16)" }}>{report.resources?.title ?? "(ไม่พบชื่อสื่อ)"}</h2>
                            <p className="kru-admin-private-meta">{report.profiles?.full_name || report.profiles?.email || "(ไม่พบผู้ใช้)"} · {new Date(report.created_at).toLocaleString("th-TH")}</p>
                          </div>
                          <Badge tone={report.status === "resolved" ? "success" : report.status === "in_progress" ? "info" : "warning"}>{ISSUE_STATUS_LABEL[report.status]}</Badge>
                        </div>
                        <p><strong>{ISSUE_CATEGORY_LABEL[report.category] ?? report.category}</strong></p>
                        {report.details && <p className="kru-admin-review-body">{report.details}</p>}
                        <label className="kru-field" style={{ maxWidth: 260 }}>
                          <span className="kru-field__label">สถานะการจัดการ</span>
                          <select className="kru-select" value={report.status} disabled={pendingAction !== null} onChange={(event) => handleIssueStatus(report.id, event.target.value as IssueReportStatus)}>
                            <option value="pending">รอตรวจสอบ</option>
                            <option value="in_progress">กำลังแก้ไข</option>
                            <option value="resolved">แก้ไขแล้ว</option>
                          </select>
                        </label>
                      </article>
                    ))}
                    {reportTotal > MODERATION_PAGE_SIZE && (
                      <div className="kru-admin-pagination" aria-label="เปลี่ยนหน้ารายงานปัญหา">
                        <Button size="sm" variant="ghost" disabled={reportPage === 0 || pendingAction !== null} onClick={() => void handleReportPageChange(reportPage - 1)}>หน้าก่อน</Button>
                        <span>หน้า {reportPage + 1} จาก {Math.ceil(reportTotal / MODERATION_PAGE_SIZE)}</span>
                        <Button size="sm" variant="ghost" disabled={(reportPage + 1) * MODERATION_PAGE_SIZE >= reportTotal || pendingAction !== null} onClick={() => void handleReportPageChange(reportPage + 1)}>หน้าถัดไป</Button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {view === "benefits" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>ข้อความสิทธิ์แพ็ก</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>แก้ได้เฉพาะชื่อและคำอธิบายของ capability ที่ระบบรองรับ การตั้งค่านี้ไม่เปิดหรือปิดสิทธิ์ของแพ็ก</p>
              {benefitRows.length === 0 ? (
                <EmptyState icon={ListChecks} title="ยังไม่มีสิทธิ์ที่เปิดใช้งาน" description="ระบบจะแสดงเฉพาะ capability ที่เปิดใช้งานจริงในแพ็ก" />
              ) : (
                <div className="kru-admin-card-list">
                  {[...new Map(benefitRows.map((row) => [row.feature_id, row])).values()].map((feature) => {
                    const assignedPlans = benefitRows.filter((row) => row.feature_id === feature.feature_id).map((row) => planNameById.get(row.plan_id) ?? row.plan_id);
                    return (
                      <form key={feature.feature_id} className="kru-card kru-admin-benefit-card" onSubmit={(event) => handleBenefitCopy(feature.feature_id, event)}>
                        <div>
                          <h2 style={{ fontSize: "var(--fs-16)" }}>{feature.feature_name}</h2>
                          <p className="kru-admin-field-help">ใช้ในแพ็ก: {assignedPlans.join(", ")} · รหัส {feature.feature_id}</p>
                        </div>
                        <Input name="name" label="ชื่อสิทธิ์ที่แสดง" defaultValue={feature.feature_name} required maxLength={100} />
                        <div className="kru-field">
                          <label className="kru-field__label" htmlFor={`benefit-description-${feature.feature_id}`}>คำอธิบาย</label>
                          <textarea id={`benefit-description-${feature.feature_id}`} name="description" className="kru-input kru-admin-textarea" defaultValue={feature.feature_description ?? ""} maxLength={500} />
                        </div>
                        <Button type="submit" size="sm" loading={pendingAction === `benefit:${feature.feature_id}`} disabled={pendingAction !== null && pendingAction !== `benefit:${feature.feature_id}`}>
                          บันทึกข้อความ
                        </Button>
                      </form>
                    );
                  })}
                </div>
              )}
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
                    <div key={r.id} className="kru-card kru-admin-request-card">
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.profiles?.full_name || r.profiles?.email || "(ไม่พบข้อมูลผู้ใช้)"}</div>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                          {r.profiles?.email} · ขออัปเกรดเป็น <strong>{r.plan_id}</strong> · {new Date(r.created_at).toLocaleDateString("th-TH")}
                        </div>
                      </div>
                      {r.status === "pending" ? (
                        <div className="kru-admin-card-actions">
                          <Button size="sm" icon={Check} disabled={pendingAction !== null} loading={pendingAction === `upgrade:${r.id}`} onClick={() => handleApproveUpgrade(r)}>
                            อนุมัติและอัปเกรด
                          </Button>
                          <Button size="sm" variant="ghost" icon={X} disabled={pendingAction !== null} onClick={() => handleDeclineUpgrade(r.id)}>
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
                    <div key={r.id} className="kru-card kru-admin-request-card">
                      <div style={{ flex: 1, minWidth: 180 }}>
                        <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.title}</div>
                        <div style={{ fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{r.votes} โหวต</div>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                          {r.profiles?.full_name || r.profiles?.email || "(ไม่พบผู้ส่ง)"} · {new Date(r.created_at).toLocaleString("th-TH")}
                        </div>
                      </div>
                      <Badge tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Badge>
                      <select
                        className="kru-select"
                        aria-label={`สถานะคำขอ ${r.title}`}
                        style={{ minHeight: 44, width: "auto" }}
                        value={r.status}
                        disabled={pendingAction !== null}
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
              <p style={{ margin: "var(--sp-3) 0 var(--sp-3)", color: "var(--text-muted)" }}>รายชื่อผู้ใช้ที่สมัครจริง · แพ็กที่แสดงคำนวณจากสิทธิ์ที่ยังมีผล ไม่ใช่ค่าแคชในโปรไฟล์</p>
              <p style={{ margin: "0 0 var(--sp-6)", color: "var(--text-muted)" }}>
                สมาชิก Founder ที่กำลังใช้งาน: {founderSeatsUsed === null ? "ยังตรวจสอบไม่ได้" : `${founderSeatsUsed}/100`}
              </p>
              {membershipDataError && <p role="alert" style={{ color: "var(--color-danger)", marginBottom: "var(--sp-5)" }}>{membershipDataError}</p>}
              {members.length === 0 ? (
                <EmptyState icon={Users} title="ยังไม่มีสมาชิก" description="" />
              ) : (
                <div className="kru-card kru-admin-responsive-table-wrap">
                  <table className="kru-admin-responsive-table">
                    <thead>
                      <tr style={{ background: "var(--surface-sunken)", textAlign: "left" }}>
                        {["ครู", "แพ็ก", "บทบาท", "การต่ออายุ"].map((h) => (
                          <th key={h} style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-13)", color: "var(--text-faint)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((m) => {
                        const subscription = subscriptionsByUser.get(m.id) ?? null;
                        const effectivePlan = subscriptions === null ? m.plan : effectiveMemberPlan(subscription);
                        const renewablePlan = plans.find((plan) => plan.id === subscription?.plan_id && plan.lifecycle_status === "active");
                        const canRenew = subscriptions !== null && canRenewMember(subscription) && !!renewablePlan &&
                          (subscription?.plan_id === "founder" || typeof renewablePlan.price_amount_thb === "number");
                        return (
                          <tr key={m.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                          <td data-label="ครู" style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            <div style={{ fontWeight: "var(--fw-medium)" }}>{m.full_name || "(ยังไม่ระบุชื่อ)"}</div>
                            <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{m.email}</div>
                          </td>
                          <td data-label="แพ็ก" style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            <select
                              className="kru-select"
                              aria-label={`แพ็กของ ${m.full_name || m.email}`}
                              style={{ minHeight: 44, width: "auto" }}
                              value={effectivePlan}
                              disabled={subscriptions === null || mutationBusy}
                              onChange={(e) => {
                                const nextPlan = e.currentTarget.value;
                                // Keep the visible selection unchanged until the confirmed RPC succeeds.
                                e.currentTarget.value = effectivePlan;
                                void handleMemberPlanChange(m.id, effectivePlan, nextPlan, subscription);
                              }}
                            >
                              {plans
                                .filter((plan) => canOfferAdminPlan(plan, effectivePlan))
                                .map((plan) => (
                                  <option key={plan.id} value={plan.id}>
                                    {plan.name}{plan.lifecycle_status === "legacy" ? " — เดิม" : ""}
                                  </option>
                                ))}
                            </select>
                            {subscriptions === null && <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>แสดงค่าเดิม ยังไม่ยืนยันสิทธิ์</div>}
                            {subscriptions !== null && effectivePlan === "free" && m.plan !== "free" &&
                              <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>แพ็กเดิมหมดอายุหรือไม่มีสิทธิ์ที่มีผล</div>}
                            {subscription?.current_period_end && Number.isFinite(Date.parse(subscription.current_period_end)) &&
                              <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>สิ้นสุด {new Date(subscription.current_period_end).toLocaleDateString("th-TH")}</div>}
                          </td>
                          <td data-label="บทบาท" style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            {isOwner ? (
                              <select
                                className="kru-select"
                                aria-label={`บทบาทของ ${m.full_name || m.email}`}
                                style={{ minHeight: 44, width: "auto" }}
                                value={m.role}
                                disabled={mutationBusy}
                                onChange={(e) => handleMemberRoleChange(m.id, e.target.value as AdminMember["role"])}
                              >
                                <option value="member">สมาชิก</option>
                                <option value="admin">แอดมิน</option>
                                <option value="owner">เจ้าของระบบ</option>
                              </select>
                            ) : (
                              <Badge tone={m.role === "member" ? "neutral" : "success"}>{ROLE_LABEL[m.role]}</Badge>
                            )}
                          </td>
                          <td data-label="การต่ออายุ" style={{ padding: "var(--sp-4) var(--sp-5)" }}>
                            {canRenew && subscription ? (
                              <Button size="sm" variant="ghost" disabled={mutationBusy} onClick={() => void handleRenewSubscription(subscription)}>
                                {renewingId === subscription.id ? "กำลังต่ออายุ…" : "ต่ออายุด้วยมือ"}
                              </Button>
                            ) : "—"}
                          </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {view === "audit" && isOwner && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>ประวัติการแก้ไข</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>การเปลี่ยนบทบาทและแพ็กของสมาชิกทั้งหมด เรียงจากล่าสุด</p>
              {auditLog.length === 0 ? (
                <EmptyState icon={History} title="ยังไม่มีประวัติ" description="" />
              ) : (
                <div className="kru-card kru-admin-responsive-table-wrap">
                  <table className="kru-admin-responsive-table kru-admin-audit-table">
                    <thead>
                      <tr style={{ background: "var(--surface-sunken)", textAlign: "left" }}>
                        {["ผู้แก้ไข", "เป้าหมาย", "รายการ", "จาก", "เป็น", "เมื่อ"].map((h) => (
                          <th key={h} style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-13)", color: "var(--text-faint)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.map((entry) => {
                        const actor = members.find((m) => m.id === entry.actor_id);
                        const target = members.find((m) => m.id === entry.target_id);
                        const displayValue = (v: string | null) => (v == null ? "—" : entry.field === "role" ? (ROLE_LABEL[v as AdminMember["role"]] ?? v) : v);
                        return (
                          <tr key={entry.id} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                            <td data-label="ผู้แก้ไข" style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-14)" }}>{actor?.full_name || actor?.email || "ระบบ"}</td>
                            <td data-label="เป้าหมาย" style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-14)" }}>{target?.full_name || target?.email || "(ไม่พบผู้ใช้)"}</td>
                            <td data-label="รายการ" style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-14)" }}>{AUDIT_FIELD_LABEL[entry.field]}</td>
                            <td data-label="จาก" style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-14)", color: "var(--text-muted)" }}>{displayValue(entry.old_value)}</td>
                            <td data-label="เป็น" style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-14)" }}>{displayValue(entry.new_value)}</td>
                            <td data-label="เมื่อ" style={{ padding: "var(--sp-4) var(--sp-5)", fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>{new Date(entry.created_at).toLocaleString("th-TH")}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      <style>{`
        .kru-admin-shell { display: flex; min-height: 100dvh; max-width: 100%; }
        .kru-admin-sidebar { display: none; flex-direction: column; width: 256px; flex: 0 0 auto; background: var(--white); border-right: 1px solid var(--border-subtle); padding: var(--sp-6); position: sticky; top: 0; height: 100dvh; }
        .kru-admin-main { flex: 1; min-width: 0; max-width: 100%; overflow-x: clip; padding: var(--sp-5) max(var(--sp-4), env(safe-area-inset-right)) calc(var(--sp-8) + env(safe-area-inset-bottom)) max(var(--sp-4), env(safe-area-inset-left)); }
        .kru-admin-main h1 { font-size: clamp(1.55rem, 7vw, var(--fs-30)) !important; overflow-wrap: anywhere; }
        .kru-admin-main button { min-height: 44px; }
        .kru-admin-main input[type="file"] { max-width: 100%; min-height: 44px; font-size: 16px; }
        .kru-admin-main .kru-btn--sm, .kru-admin-drawer .kru-btn--sm { min-height: 44px; }
        .kru-admin-mobile-header { position: sticky; top: 0; z-index: 35; display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: center; gap: var(--sp-3); min-height: calc(60px + env(safe-area-inset-top)); padding: calc(var(--sp-3) + env(safe-area-inset-top)) max(var(--sp-4), env(safe-area-inset-right)) var(--sp-3) max(var(--sp-4), env(safe-area-inset-left)); background: color-mix(in srgb, var(--surface-card) 94%, transparent); border-bottom: 1px solid var(--border-subtle); backdrop-filter: blur(14px); }
        .kru-admin-mobile-header > strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .kru-admin-menu-trigger, .kru-admin-drawer__close, .kru-admin-icon-action { display: inline-grid; place-items: center; width: 44px; height: 44px; padding: 0; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-body); cursor: pointer; }
        .kru-admin-menu-trigger:hover, .kru-admin-drawer__close:hover, .kru-admin-icon-action:hover:not(:disabled) { background: var(--ink-100); }
        .kru-admin-icon-action:disabled { cursor: not-allowed; opacity: .45; }
        .kru-admin-icon-action--danger { color: var(--status-danger-fg); }
        .kru-admin-drawer-layer { position: fixed; inset: 0; z-index: 100; display: flex; }
        .kru-admin-drawer-scrim { position: absolute; inset: 0; width: 100%; border: 0; background: rgba(18, 12, 29, .48); }
        .kru-admin-drawer { position: relative; display: flex; flex-direction: column; width: min(88vw, 340px); height: 100dvh; padding: calc(var(--sp-4) + env(safe-area-inset-top)) var(--sp-4) calc(var(--sp-4) + env(safe-area-inset-bottom)); background: var(--surface-card); box-shadow: var(--shadow-lg); }
        .kru-admin-drawer__header { display: flex; align-items: center; justify-content: space-between; min-height: 52px; padding: 0 var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border-subtle); }
        .kru-admin-drawer__nav { flex: 1; overflow-y: auto; padding: var(--sp-4) 0; overscroll-behavior: contain; }
        .kru-admin-drawer__footer { display: grid; gap: var(--sp-3); padding-top: var(--sp-3); border-top: 1px solid var(--border-subtle); }
        .kru-admin-form-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-4); }
        .kru-admin-access-fieldset { min-width: 0; margin: 0; padding: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-md); }
        .kru-admin-field-help, .kru-admin-private-meta { margin: var(--sp-2) 0; color: var(--text-muted); font-size: var(--fs-13); line-height: 1.55; overflow-wrap: anywhere; }
        .kru-admin-access-options, .kru-admin-plan-options { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr)); gap: var(--sp-3); margin-top: var(--sp-3); }
        .kru-admin-choice { display: flex; align-items: center; gap: var(--sp-3); min-height: 44px; padding: 8px 10px; border: 1px solid var(--border-subtle); border-radius: var(--r-md); cursor: pointer; overflow-wrap: anywhere; }
        .kru-admin-choice input { width: 20px; height: 20px; flex: 0 0 auto; accent-color: var(--brand); }
        .kru-admin-featured-panel { display: grid; gap: var(--sp-4); margin-top: var(--sp-6); padding: var(--sp-5); }
        .kru-admin-featured-list { display: grid; gap: var(--sp-2); }
        .kru-admin-featured-item { display: flex; align-items: center; gap: var(--sp-2); min-width: 0; }
        .kru-admin-order-actions { display: flex; flex: 0 0 auto; }
        .kru-admin-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
        .kru-admin-main .kru-field span, .kru-admin-choice span { min-width: 0; overflow-wrap: anywhere; }
        .kru-admin-resource-row { display: grid; grid-template-columns: minmax(0, 1fr) 44px 44px; align-items: center; gap: var(--sp-3); padding: var(--sp-5); }
        .kru-admin-resource-row > div:first-child, .kru-admin-resource-row > .kru-admin-resource-badges, .kru-admin-resource-row > .kru-select { grid-column: 1 / -1; }
        .kru-admin-resource-row > .kru-select { width: 100% !important; }
        .kru-admin-resource-row > button:nth-last-child(2) { grid-column: 2; }
        .kru-admin-resource-row > button:last-child { grid-column: 3; }
        .kru-admin-resource-badges, .kru-admin-card-actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--sp-3); }
        .kru-admin-card-actions > .kru-btn { flex: 1 1 auto; }
        .kru-admin-request-card, .kru-admin-moderation-card, .kru-admin-benefit-card { padding: var(--sp-5); display: grid; gap: var(--sp-4); min-width: 0; }
        .kru-admin-card-list { display: grid; gap: var(--sp-4); max-width: 920px; }
        .kru-admin-pagination { display: flex; align-items: center; justify-content: center; gap: var(--sp-3); padding: var(--sp-3) 0; color: var(--text-muted); font-size: var(--fs-14); flex-wrap: wrap; }
        .kru-admin-review-stars { color: #b76b00; font-size: var(--fs-20); letter-spacing: 2px; }
        .kru-admin-review-body { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.65; }
        .kru-admin-tablist { display: inline-flex; max-width: 100%; padding: 4px; margin-bottom: var(--sp-6); border-radius: var(--r-pill); background: var(--ink-100); }
        .kru-admin-tablist button { min-height: 44px; padding: 0 var(--sp-5); border: 0; border-radius: var(--r-pill); background: transparent; color: var(--text-muted); cursor: pointer; font-weight: var(--fw-semibold); }
        .kru-admin-tablist button.is-active { background: var(--surface-card); color: var(--text-strong); box-shadow: var(--shadow-sm); }
        .kru-admin-textarea { min-height: 100px; padding: var(--sp-4); resize: vertical; }
        .kru-admin-responsive-table-wrap { border: 0; background: transparent; }
        .kru-admin-responsive-table, .kru-admin-responsive-table tbody, .kru-admin-responsive-table tr, .kru-admin-responsive-table td { display: block; width: 100%; }
        .kru-admin-responsive-table { border-collapse: separate; border-spacing: 0 var(--sp-4); }
        .kru-admin-responsive-table thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
        .kru-admin-responsive-table tr { background: var(--surface-card); border: 1px solid var(--border-subtle); border-radius: var(--r-card); overflow: hidden; }
        .kru-admin-responsive-table td { display: grid; grid-template-columns: minmax(88px, .4fr) minmax(0, 1fr); align-items: center; gap: var(--sp-3); border-top: 1px solid var(--border-subtle); overflow-wrap: anywhere; }
        .kru-admin-responsive-table td:first-child { border-top: 0; }
        .kru-admin-responsive-table td::before { content: attr(data-label); font-size: var(--fs-12); font-weight: var(--fw-semibold); color: var(--text-faint); }
        .kru-admin-responsive-table td .kru-select { width: 100% !important; min-width: 0; }
        @media (min-width: 700px) {
          .kru-admin-form-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
          .kru-admin-resource-row { grid-template-columns: minmax(180px, 1fr) auto auto 44px 44px; gap: var(--sp-4); padding: var(--sp-5) var(--sp-6); }
          .kru-admin-resource-row > div:first-child, .kru-admin-resource-row > .kru-admin-resource-badges, .kru-admin-resource-row > .kru-select, .kru-admin-resource-row > button:nth-last-child(2), .kru-admin-resource-row > button:last-child { grid-column: auto; }
          .kru-admin-resource-row > .kru-select { width: auto !important; }
          .kru-admin-request-card { display: flex; align-items: center; gap: var(--sp-6); flex-wrap: wrap; padding: var(--sp-6); }
          .kru-admin-card-actions > .kru-btn { flex: 0 0 auto; }
          .kru-admin-responsive-table-wrap { overflow-x: auto; border: 1px solid var(--border-subtle); background: var(--surface-card); }
          .kru-admin-responsive-table { display: table; width: 100%; border-collapse: collapse; border-spacing: 0; }
          .kru-admin-responsive-table thead { position: static; width: auto; height: auto; margin: 0; overflow: visible; clip: auto; white-space: normal; display: table-header-group; }
          .kru-admin-responsive-table tbody { display: table-row-group; }
          .kru-admin-responsive-table tr { display: table-row; border: 0; border-radius: 0; }
          .kru-admin-responsive-table td { display: table-cell; width: auto; border-top: 1px solid var(--border-subtle); }
          .kru-admin-responsive-table td::before { content: none; }
        }
        @media (min-width: 1024px) {
          .kru-admin-sidebar { display: flex; }
          .kru-admin-main { padding: var(--sp-8); }
          .kru-admin-mobile-header { display: none; }
        }
      `}</style>
    </div>
  );
}
