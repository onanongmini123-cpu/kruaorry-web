"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { LayoutDashboard, FolderCog, MessageSquareText, MessageCircle, Users, LogOut, FolderOpen, Plus, Trash2, Pencil, Wallet, Check, X, History, Eye, ShieldCheck, Star, ChevronUp, ChevronDown, EyeOff, Flag, ListChecks, Search, RefreshCw, Clipboard } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Button, Input, Select, Badge, StatTile, SideNav, EmptyState, SearchField, type SideNavGroup } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { confirmMembershipPayment, confirmSubscriptionRenewal, fetchFounderCapacity, recordMembershipLineSlipReceived } from "@/lib/data";
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
  adminMembershipApplicationStatusLabel,
  canOfferAdminPlan,
  canRenewMember,
  memberPlanChangeConfirmation,
  preferredAdminSubscription,
  renewalAmountThb,
  type AdminSubscription,
} from "@/lib/adminMembership";
import {
  fetchMembershipLineSlipWorkflowReadiness,
  fetchMembershipSchemaReadiness,
  MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE,
  MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
  type MembershipSchemaReadiness,
} from "@/lib/membershipSchemaReadiness";
import { FOUNDER_CAPACITY_LIMIT, normalizeFounderCapacity } from "@/lib/founderCapacity";
import { planDisplayName } from "@/lib/planDisplay";
import { canAccessAdminConsole } from "@/lib/routeAccess";
import { isPermanentAuthUser } from "@/lib/authIdentity";
import { signOutCurrentSession } from "@/lib/currentSessionLogout";
import { trackEvent } from "@/lib/analytics";
import { APP_VERSION } from "@/lib/appVersion";
import { RESOURCE_GRADE_OPTIONS, type ResourceGrade } from "@/lib/resourceGrades";
import { fetchAdminOverviewInsights, type AdminOverviewInsights as AdminOverviewInsightsData } from "@/lib/adminOverview";
import { friendlyErrorMessage } from "@/lib/userMessages";
import { AdminMobileNav } from "./AdminMobileNav";
import { AdminOverviewInsights } from "./AdminOverviewInsights";
import { AdminMembersPanel } from "./AdminMembersPanel";
import type { AdminMemberListItem, AdminMemberRole } from "./memberList";
import { AdminPlansPanel } from "./AdminPlansPanel";
import type { AdminPlanOverviewItem, PlanBenefitRow } from "./planOverview";
import { ResourceEditorDrawer } from "./ResourceEditorDrawer";
import { CoverCropper } from "@/components/CoverCropper";
import { ATTENTION_LABEL, STATUS_FILTER_LABEL, STATUS_FILTER_ORDER, filterResources, resourceAttention, statusCounts, type ResourceStatusFilter } from "./resourceList";
import { SLUG_RULE_HELP, SLUG_UNAVAILABLE_NOTICE, isSlugUnavailable, resourceAddress, slugFieldState, slugParamForSave, suggestSlug, thaiSlugSaveError } from "./resourceSlugField";
import {
  EMPTY_ADMIN_ACTION_COUNTS,
  ISSUE_CATEGORY_LABEL,
  ISSUE_STATUS_LABEL,
  adminPaymentSuccessMessage,
  adminViewHref,
  createCoalescedAdminRefresh,
  installAdminActionRefresh,
  includesAdminLineSlipProvenance,
  isActionableUpgradeRequest,
  matchesAdminUpgradeSearch,
  moveFeaturedResource,
  parseAdminView,
  priorityPageSlices,
  resourceAccessLabel,
  sameAdminReportVersion,
  sameAdminRequestVersion,
  sameAdminReviewVersion,
  sameAdminSubscriptionVersion,
  sameAdminUpgradeVersion,
  sortAdminReports,
  sortAdminRequests,
  sortAdminReviews,
  sortAdminUpgradeRequests,
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
  grade_levels?: string[] | null;
  /** Absent before migration 053; null while the resource still uses its UUID address. */
  slug?: string | null;
}

type AdminPlanRow = AdminPlanOverviewItem;

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
  reference_code: string;
  quoted_amount_thb: number;
  payment_reported_at: string | null;
  line_slip_received_at: string | null;
  line_slip_received_by: string | null;
  payment_paid_at: string | null;
  payment_confirmed_at: string | null;
  payment_confirmed_by: string | null;
  payment_confirmed_amount_thb: number | null;
  payment_reference: string | null;
  resolution_reason_code: string | null;
  created_at: string;
  profiles: { full_name: string | null; email: string } | null;
}

type PaymentConfirmationTarget =
  | { kind: "application"; request: AdminUpgradeRequest; amountThb: number; title: string }
  | { kind: "renewal"; subscription: AdminSubscription; amountThb: number; title: string };

function localDateTimeInputValue(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `manual-payment-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function userFacingAdminError(message: string): string {
  return message
    .replace(/\bTeacher\b(?!\s+Pro\b)/g, "Teacher Pro")
    .replace("Member has not reported payment for this application", "ยังไม่ได้บันทึกรับสลิปจาก LINE สำหรับใบสมัครนี้")
    .replace("Admin-recorded LINE slip is required before payment confirmation", "ต้องบันทึกว่าทีมงานได้รับสลิปใน LINE ก่อนยืนยันยอด");
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
  /** Present once migration 054 is applied: app build, browser, OS, screen size. */
  context?: { app_version?: string; browser?: string; os?: string; viewport?: string } | null;
}

interface AdminQueueResult<T> {
  data: T[] | null;
  error: { message?: string } | null;
  count: number | null;
  actionCount: number | null;
}

interface AdminQueueSnapshot {
  requests: AdminQueueResult<AdminRequest>;
  reviews: AdminQueueResult<AdminReview>;
  reports: AdminQueueResult<AdminIssueReport>;
  upgrades: AdminQueueResult<AdminUpgradeRequest>;
  reviewPage: number;
  reportPage: number;
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
  { key: "benefits", label: "แพ็กและสิทธิ์", icon: ListChecks },
];

const OWNER_NAV_ITEM = { key: "audit", label: "ประวัติการแก้ไข", icon: History };

const REQUEST_LABEL: Record<AdminRequest["status"], string> = { pending: "รอพิจารณา", in_progress: "กำลังผลิต", done: "เสร็จแล้ว" };
const REQUEST_TONE: Record<AdminRequest["status"], "warning" | "info" | "success"> = { pending: "warning", in_progress: "info", done: "success" };
const ROLE_LABEL: Record<AdminMemberRole, string> = { member: "สมาชิก", admin: "แอดมิน", owner: "เจ้าของระบบ" };
const AUDIT_FIELD_LABEL: Record<AdminAuditLogRow["field"], string> = { role: "บทบาท", plan: "แพ็ก" };
const MODERATION_PAGE_SIZE = 50;
const ADMIN_REVIEW_SELECT = "id, resource_id, user_id, rating, body, moderation_status, created_at, updated_at, resources(title), profiles!resource_reviews_user_id_fkey(full_name, email)";
const ADMIN_REPORT_SELECT = "id, resource_id, reporter_id, category, details, status, created_at, updated_at, resources(title), profiles(full_name, email)";
// Asked for first; falls back to the plain select until migration 054 exists.
const ADMIN_REPORT_SELECT_WITH_CONTEXT = `${ADMIN_REPORT_SELECT}, context`;
const ADMIN_UPGRADE_SELECT = "id, user_id, plan_id, status, reference_code, quoted_amount_thb, payment_reported_at, payment_paid_at, payment_confirmed_at, payment_confirmed_by, payment_confirmed_amount_thb, payment_reference, resolution_reason_code, created_at, profiles!upgrade_requests_user_id_fkey(full_name, email)";
const ADMIN_UPGRADE_LINE_SLIP_SELECT = "id, user_id, plan_id, status, reference_code, quoted_amount_thb, payment_reported_at, line_slip_received_at, line_slip_received_by, payment_paid_at, payment_confirmed_at, payment_confirmed_by, payment_confirmed_amount_thb, payment_reference, resolution_reason_code, created_at, profiles!upgrade_requests_user_id_fkey(full_name, email)";

const RESOURCE_LIST_SELECT = "id, title, meta, status, delivery_mode, access_mode, grade_levels";

const EMPTY_FORM = {
  title: "",
  meta: "",
  description: "",
  category: "",
  grade_levels: [] as ResourceGrade[],
  delivery_mode: "web_app" as DeliveryMode,
  cta_url: "",
  cover_image_url: "",
  slug: "",
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
  const [viewerRole, setViewerRole] = useState<AdminMemberRole | null>(null);
  const [view, setView] = useState<View>("dash");
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [members, setMembers] = useState<AdminMemberListItem[]>([]);
  const [requests, setRequests] = useState<AdminRequest[]>([]);
  const [upgradeRequests, setUpgradeRequests] = useState<AdminUpgradeRequest[]>([]);
  const [upgradeSearch, setUpgradeSearch] = useState("");
  const [plans, setPlans] = useState<AdminPlanRow[]>([]);
  const [resourcePlanAccess, setResourcePlanAccess] = useState<Map<string, string[]>>(new Map());
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [issueReports, setIssueReports] = useState<AdminIssueReport[]>([]);
  const [actionCounts, setActionCounts] = useState(EMPTY_ADMIN_ACTION_COUNTS);
  const [queueRefreshError, setQueueRefreshError] = useState<string | null>(null);
  const adminQueueRefreshRef = useRef<ReturnType<typeof createCoalescedAdminRefresh<AdminQueueSnapshot>> | null>(null);
  const adminQueueLoaderRef = useRef<(signal: AbortSignal) => Promise<AdminQueueSnapshot>>(() => Promise.reject(new Error("Admin queue loader is not ready")));
  const adminQueueApplyRef = useRef<(snapshot: AdminQueueSnapshot) => void>(() => undefined);
  const adminQueueSnapshotRef = useRef<AdminQueueSnapshot | null>(null);
  const reviewPageRef = useRef(0);
  const reportPageRef = useRef(0);
  const membershipSchemaReadinessRef = useRef<MembershipSchemaReadiness>("checking");
  const lineSlipWorkflowReadinessRef = useRef<MembershipSchemaReadiness>("checking");
  const [reviewPage, setReviewPage] = useState(0);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [reportPage, setReportPage] = useState(0);
  const [reportTotal, setReportTotal] = useState(0);
  const [benefitRows, setBenefitRows] = useState<PlanBenefitRow[]>([]);
  const [memberDirectoryAvailable, setMemberDirectoryAvailable] = useState(false);
  const [benefitDataAvailable, setBenefitDataAvailable] = useState(false);
  const [planOverviewMessage, setPlanOverviewMessage] = useState<string | null>(null);
  const [subscriptions, setSubscriptions] = useState<AdminSubscription[] | null>(null);
  const [premiumPlanIds, setPremiumPlanIds] = useState<Set<string> | null>(null);
  const [memberStatusNow, setMemberStatusNow] = useState(() => Date.now());
  const [membershipSchemaReadiness, setMembershipSchemaReadiness] = useState<MembershipSchemaReadiness>("checking");
  const [lineSlipWorkflowReadiness, setLineSlipWorkflowReadiness] = useState<MembershipSchemaReadiness>("checking");
  const [membershipDataError, setMembershipDataError] = useState<string | null>(null);
  const [founderSeatsUsed, setFounderSeatsUsed] = useState<number | null>(null);
  const [founderCapacityRefreshing, setFounderCapacityRefreshing] = useState(false);
  const [overviewInsights, setOverviewInsights] = useState<AdminOverviewInsightsData | null>(null);
  const [overviewInsightsLoading, setOverviewInsightsLoading] = useState(true);
  const [overviewInsightsMessage, setOverviewInsightsMessage] = useState<string | null>(null);
  const [changingPlanId, setChangingPlanId] = useState<string | null>(null);
  const [auditLog, setAuditLog] = useState<AdminAuditLogRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  // The form as it was when the editor opened, to tell whether there is anything unsaved.
  const [formBaseline, setFormBaseline] = useState("");
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceFilter, setResourceFilter] = useState<ResourceStatusFilter>("all");
  const [contentTab, setContentTab] = useState<"list" | "featured">("list");
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  // The slug the resource had when the form opened ("" = none yet); the field is only sent when it differs.
  const [savedSlug, setSavedSlug] = useState("");
  // False while the database can not yet be read or written for slugs (migration 055 not applied).
  const [slugSupported, setSlugSupported] = useState(true);
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
  // The original selection stays local while the inline crop panel is open.
  // Only its optimized result replaces selectedCoverFile and can be uploaded.
  const [coverCropSource, setCoverCropSource] = useState<File | null>(null);
  const [coverCropMeta, setCoverCropMeta] = useState<{ width: number; height: number; extension: "webp" | "jpg" } | null>(null);
  const [fileRemoved, setFileRemoved] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({ phase: "idle" });
  // Storage cleanup that failed and was NOT dropped — kept here so it can
  // be retried instead of silently becoming an orphaned file forever.
  const [failedCleanups, setFailedCleanups] = useState<CleanupFailure[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [paymentTarget, setPaymentTarget] = useState<PaymentConfirmationTarget | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentPaidAt, setPaymentPaidAt] = useState(() => localDateTimeInputValue());
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccessMessage, setPaymentSuccessMessage] = useState<string | null>(null);
  const [paymentSuccessCopied, setPaymentSuccessCopied] = useState(false);
  const [moderationTab, setModerationTab] = useState<"reviews" | "reports">("reviews");
  const paymentDialogRef = useRef<HTMLElement>(null);
  const paymentTriggerRef = useRef<HTMLElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const pendingActionRef = useRef<string | null>(null);

  // Derived (not state) so nothing calls setState from inside an effect —
  // the effect below only performs the revoke side effect on cleanup.
  const coverPreviewUrl = useMemo(() => (selectedCoverFile ? URL.createObjectURL(selectedCoverFile) : null), [selectedCoverFile]);
  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  useEffect(() => {
    pendingActionRef.current = pendingAction;
  }, [pendingAction]);

  const beginPendingAction = (action: string): boolean => {
    if (pendingActionRef.current) return false;
    pendingActionRef.current = action;
    setPendingAction(action);
    return true;
  };

  const finishPendingAction = (action: string) => {
    if (pendingActionRef.current !== action) return;
    pendingActionRef.current = null;
    setPendingAction(null);
  };

  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  useEffect(() => {
    if (!paymentTarget) return;

    const dialog = paymentDialogRef.current;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => dialog?.focus());

    const handleDialogKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (pendingActionRef.current) return;
        event.preventDefault();
        setPaymentTarget(null);
        setPaymentError(null);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      if (paymentTriggerRef.current?.isConnected) paymentTriggerRef.current.focus();
    };
  }, [paymentTarget]);

  // PostgREST caps a single response (often at 1,000 rows). Never infer Free
  // from a truncated subscription result in the admin member table.
  const loadCurrentSubscriptions = async () => {
    const rows: AdminSubscription[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("subscriptions")
        .select("id, user_id, plan_id, status, source, billing_interval, current_period_end, founder_status, founder_price_lock")
        .in("status", ["active", "past_due", "expired"])
        .order("user_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) return { data: null, error };
      rows.push(...((data as AdminSubscription[]) ?? []));
      if ((data?.length ?? 0) < pageSize) return { data: rows, error: null };
    }
  };

  // The action queue must include every request before status/vote sorting;
  // otherwise PostgREST's default row cap could hide an older pending item.
  const loadTeacherRequests = async (signal: AbortSignal) => {
    const rows: AdminRequest[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("requests")
        .select("id, title, votes, status, requested_by, created_at, profiles(full_name, email)")
        .order("votes", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1)
        .abortSignal(signal);
      if (error) return { data: null, error };
      rows.push(...((data as unknown as AdminRequest[]) ?? []));
      if ((data?.length ?? 0) < pageSize) return { data: rows, error: null };
    }
  };

  // Upgrade search is client-side, so it must be backed by every row rather
  // than PostgREST's default first page. The secondary id ordering keeps page
  // boundaries stable when multiple requests share the same created_at.
  const loadUpgradeRequests = async (signal: AbortSignal) => {
    const rows: AdminUpgradeRequest[] = [];
    const pageSize = 500;
    const includesLineSlipProvenance = includesAdminLineSlipProvenance(lineSlipWorkflowReadinessRef.current);
    const select = includesLineSlipProvenance ? ADMIN_UPGRADE_LINE_SLIP_SELECT : ADMIN_UPGRADE_SELECT;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase.from("upgrade_requests")
        .select(select)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + pageSize - 1)
        .abortSignal(signal);
      if (error) return { data: null, error };
      rows.push(...(((data as unknown as AdminUpgradeRequest[]) ?? []).map((row) => ({
        ...row,
        line_slip_received_at: includesLineSlipProvenance ? row.line_slip_received_at : null,
        line_slip_received_by: includesLineSlipProvenance ? row.line_slip_received_by : null,
      }))));
      if ((data?.length ?? 0) < pageSize) return { data: rows, error: null };
    }
  };

  // Pagination follows the workflow priority across the whole table, not just
  // within a page that happened to be ordered by recency. Each status gets an
  // exact RLS-scoped count, then priorityPageSlices maps the requested global
  // page onto status-local ranges. This keeps an older pending item ahead of
  // newer completed history without loading the entire private table.
  const loadReviewPage = async (page: number, signal: AbortSignal) => {
    const [pendingCountResult, historyCountResult] = await Promise.all([
      supabase.from("resource_reviews").select("id", { count: "exact", head: true }).eq("moderation_status", "pending").abortSignal(signal),
      supabase.from("resource_reviews").select("id", { count: "exact", head: true }).neq("moderation_status", "pending").abortSignal(signal),
    ]);
    const countError = pendingCountResult.error ?? historyCountResult.error;
    if (countError) return { data: null, error: countError, count: null, actionCount: null };

    const counts = [pendingCountResult.count ?? 0, historyCountResult.count ?? 0];
    const slices = priorityPageSlices(counts, page, MODERATION_PAGE_SIZE);
    const pageResults = await Promise.all(slices.map((slice) => (
      slice.groupIndex === 0
        ? supabase.from("resource_reviews").select(ADMIN_REVIEW_SELECT).eq("moderation_status", "pending").order("created_at", { ascending: false }).order("id", { ascending: false }).range(slice.from, slice.to).abortSignal(signal)
        : supabase.from("resource_reviews").select(ADMIN_REVIEW_SELECT).neq("moderation_status", "pending").order("created_at", { ascending: false }).order("id", { ascending: false }).range(slice.from, slice.to).abortSignal(signal)
    )));
    const pageError = pageResults.find((result) => result.error)?.error ?? null;
    return {
      data: pageError ? null : pageResults.flatMap((result) => (result.data ?? []) as unknown as AdminReview[]),
      error: pageError,
      count: counts[0] + counts[1],
      actionCount: counts[0],
    };
  };

  const loadReportPage = async (page: number, signal: AbortSignal) => {
    const statuses: IssueReportStatus[] = ["pending", "in_progress", "resolved"];
    const countResults = await Promise.all(statuses.map((status) => (
      supabase.from("resource_issue_reports").select("id", { count: "exact", head: true }).eq("status", status).abortSignal(signal)
    )));
    const countError = countResults.find((result) => result.error)?.error ?? null;
    if (countError) return { data: null, error: countError, count: null, actionCount: null };

    const counts = countResults.map((result) => result.count ?? 0);
    const slices = priorityPageSlices(counts, page, MODERATION_PAGE_SIZE);
    const readReportPages = (select: string) => Promise.all(slices.map((slice) => (
      supabase.from("resource_issue_reports")
        .select(select)
        .eq("status", statuses[slice.groupIndex])
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(slice.from, slice.to)
        .abortSignal(signal)
    )));
    let pageResults = await readReportPages(ADMIN_REPORT_SELECT_WITH_CONTEXT);
    if (pageResults.some((result) => result.error && /context/i.test(result.error.message ?? ""))) {
      pageResults = await readReportPages(ADMIN_REPORT_SELECT);
    }
    const pageError = pageResults.find((result) => result.error)?.error ?? null;
    return {
      data: pageError ? null : pageResults.flatMap((result) => (result.data ?? []) as unknown as AdminIssueReport[]),
      error: pageError,
      count: counts.reduce((total, count) => total + count, 0),
      actionCount: counts[0] + counts[1],
    };
  };

  const loadAdminQueueSnapshot = async (signal: AbortSignal): Promise<AdminQueueSnapshot> => {
    const reviewPageToLoad = reviewPageRef.current;
    const reportPageToLoad = reportPageRef.current;
    const includeUpgrades = membershipSchemaReadinessRef.current === "ready";
    const [requestResult, reviewResult, reportResult, upgradeResult] = await Promise.all([
      loadTeacherRequests(signal),
      loadReviewPage(reviewPageToLoad, signal),
      loadReportPage(reportPageToLoad, signal),
      includeUpgrades
        ? loadUpgradeRequests(signal)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const requestRows = requestResult.data as AdminRequest[] | null;
    const upgradeRows = upgradeResult.data as AdminUpgradeRequest[] | null;
    return {
      requests: {
        data: requestRows,
        error: requestResult.error,
        count: requestResult.error ? null : requestRows?.length ?? 0,
        actionCount: requestResult.error ? null : requestRows?.filter((row) => row.status === "pending").length ?? 0,
      },
      reviews: reviewResult,
      reports: reportResult,
      upgrades: {
        data: upgradeRows,
        error: upgradeResult.error,
        count: includeUpgrades && !upgradeResult.error ? upgradeRows?.length ?? 0 : null,
        actionCount: includeUpgrades && !upgradeResult.error
          ? upgradeRows?.filter(isActionableUpgradeRequest).length ?? 0
          : null,
      },
      reviewPage: reviewPageToLoad,
      reportPage: reportPageToLoad,
    };
  };

  const applyAdminQueueSnapshot = (snapshot: AdminQueueSnapshot) => {
    adminQueueSnapshotRef.current = snapshot;
    const failures: string[] = [];
    if (snapshot.requests.error) {
      failures.push("คำขอจากครู");
    } else {
      setRequests(sortAdminRequests(snapshot.requests.data ?? []));
    }
    if (snapshot.reviews.error) {
      failures.push("รีวิว");
    } else {
      setReviews(sortAdminReviews(snapshot.reviews.data ?? []));
      setReviewTotal(snapshot.reviews.count ?? 0);
      setReviewPage(snapshot.reviewPage);
    }
    if (snapshot.reports.error) {
      failures.push("รายงานปัญหา");
    } else {
      setIssueReports(sortAdminReports(snapshot.reports.data ?? []));
      setReportTotal(snapshot.reports.count ?? 0);
      setReportPage(snapshot.reportPage);
    }
    if (snapshot.upgrades.error) {
      failures.push("แจ้งชำระ");
    } else if (membershipSchemaReadinessRef.current === "ready") {
      setUpgradeRequests(sortAdminUpgradeRequests(snapshot.upgrades.data ?? []));
    } else {
      setUpgradeRequests([]);
    }

    setActionCounts({
      requests: snapshot.requests.actionCount,
      moderation: snapshot.reviews.error || snapshot.reports.error
        ? null
        : (snapshot.reviews.actionCount ?? 0) + (snapshot.reports.actionCount ?? 0),
      upgrades: snapshot.upgrades.actionCount,
    });
    setQueueRefreshError(failures.length > 0
      ? `อัปเดตรายการ ${failures.join(", ")} ไม่สำเร็จ ตัวเลขที่เกี่ยวข้องจะแสดงเป็น — และปิดการดำเนินการกับข้อมูลเดิมชั่วคราว`
      : null);
  };

  useEffect(() => {
    adminQueueLoaderRef.current = loadAdminQueueSnapshot;
    adminQueueApplyRef.current = applyAdminQueueSnapshot;
  });

  useEffect(() => {
    const refresh = createCoalescedAdminRefresh(
      (signal) => adminQueueLoaderRef.current(signal),
      (snapshot) => adminQueueApplyRef.current(snapshot),
      ({ timedOut }) => {
        adminQueueSnapshotRef.current = null;
        setActionCounts(EMPTY_ADMIN_ACTION_COUNTS);
        setQueueRefreshError(timedOut
          ? "การอัปเดตรายการหลังบ้านใช้เวลานานเกินไป ตัวเลขจะแสดงเป็น — และปิดการดำเนินการกับข้อมูลเดิมชั่วคราว"
          : "อัปเดตรายการหลังบ้านไม่สำเร็จ ตัวเลขจะแสดงเป็น — และปิดการดำเนินการกับข้อมูลเดิมชั่วคราว");
      },
    );
    adminQueueRefreshRef.current = refresh;
    return () => {
      refresh.dispose();
      if (adminQueueRefreshRef.current === refresh) adminQueueRefreshRef.current = null;
    };
  }, []);

  const refreshAdminQueues = (
    nextReviewPage = reviewPageRef.current,
    nextReportPage = reportPageRef.current,
  ): Promise<boolean> => {
    reviewPageRef.current = nextReviewPage;
    reportPageRef.current = nextReportPage;
    return adminQueueRefreshRef.current?.request() ?? Promise.resolve(false);
  };

  const refreshAndMatchQueueRow = async <T extends { id: string },>(
    queue: "requests" | "reviews" | "reports" | "upgrades",
    rendered: T,
    sameVersion: (renderedRow: T, latestRow: T) => boolean,
    notify: (message: string) => void = (message) => window.alert(message),
  ): Promise<T | null> => {
    const refreshed = await refreshAdminQueues();
    const snapshot = adminQueueSnapshotRef.current;
    const result = snapshot?.[queue] as AdminQueueResult<T> | undefined;
    if (!refreshed || !result || result.error || !result.data) {
      notify("รีเฟรชข้อมูลล่าสุดไม่สำเร็จ ระบบยังไม่ได้ดำเนินการ กรุณากดรีเฟรชข้อมูลแล้วลองอีกครั้ง");
      return null;
    }

    const latest = result.data.find((row) => row.id === rendered.id);
    if (!latest || !sameVersion(rendered, latest)) {
      notify("ข้อมูลรายการนี้มีการเปลี่ยนแปลง ระบบยังไม่ได้ดำเนินการ กรุณาตรวจข้อมูลล่าสุดแล้วลองอีกครั้ง");
      return null;
    }
    return latest;
  };

  // Asked for with the slug first; falls back to the plain list until migration 053 exists.
  const loadResourceList = async () => {
    const select = (columns: string) => supabase.from("resources").select(columns).order("created_at", { ascending: false });
    const withSlug = await select(`${RESOURCE_LIST_SELECT}, slug`);
    if (withSlug.error && isSlugUnavailable(withSlug.error)) {
      setSlugSupported(false);
      return await select(RESOURCE_LIST_SELECT);
    }
    setSlugSupported(true);
    return withSlug;
  };

  const reloadAdminData = async (nextReviewPage = reviewPage, nextReportPage = reportPage) => {
    setMembershipSchemaReadiness("checking");
    setLineSlipWorkflowReadiness("checking");
    setOverviewInsightsLoading(true);
    // Keep the content, moderation and member-directory tools available while
    // the payment-confirmation schema is being rolled out. Only the second
    // batch below touches 048 columns/RPCs, and it cannot run until the shared
    // readiness marker has been verified.
    const baseDataPromise = Promise.all([
      loadResourceList(),
      supabase.from("profiles").select("id, full_name, email, plan, role, created_at").order("created_at", { ascending: false }),
      supabase.from("plans").select("id, name, lifecycle_status, price_amount_thb, is_upgradeable, is_public, sort_order").order("sort_order", { ascending: true }),
      supabase.from("plan_features").select("plan_id, feature_id, enabled").eq("feature_id", "library.premium").eq("enabled", true),
      // RLS scopes this to owners only — a non-owner viewer just gets [] back, no error.
      supabase.from("admin_audit_log").select("id, actor_id, target_id, field, old_value, new_value, created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("resource_plan_access").select("resource_id, plan_id").order("plan_id", { ascending: true }),
      supabase.from("featured_resources").select("resource_id, position").order("position", { ascending: true }),
      supabase.from("plan_benefit_catalog").select("plan_id, feature_id, feature_name, feature_description, value_type, limit_value, sort_order").order("sort_order", { ascending: true }).order("feature_id", { ascending: true }),
    ]);
    const readinessPromise = fetchMembershipSchemaReadiness(supabase);
    const lineSlipReadinessPromise = fetchMembershipLineSlipWorkflowReadiness(supabase);
    const overviewInsightsPromise = fetchAdminOverviewInsights(supabase);

    const [
      { data: resourceRows, error: resourceError },
      { data: memberRows, error: memberError },
      { data: basePlanRows, error: basePlanError },
      { data: premiumFeatureRows, error: premiumFeatureError },
      { data: auditRows, error: auditError },
      { data: accessRows, error: accessError },
      { data: featuredRows, error: featuredError },
      { data: benefits, error: benefitError },
    ] = await baseDataPromise;

    if (resourceError) console.error("Failed to load resources:", resourceError.message);
    if (memberError) console.error("Failed to load members:", memberError.message);
    setMemberDirectoryAvailable(!memberError);
    setResources((resourceRows as unknown as AdminResource[] | null) ?? []);
    setMembers((memberRows as AdminMemberListItem[]) ?? []);
    if (premiumFeatureError) console.error("Failed to load premium plan capabilities (code=" + (premiumFeatureError.code || "unknown") + ")");
    setPremiumPlanIds(premiumFeatureError
      ? null
      : new Set(((premiumFeatureRows ?? []) as { plan_id: string }[]).map((feature) => feature.plan_id)));
    if (basePlanError) console.error("Failed to load plans:", basePlanError.message);
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
    if (benefitError) console.error("Failed to load plan benefits:", benefitError.message);
    setBenefitDataAvailable(!benefitError);
    setBenefitRows((benefits as PlanBenefitRow[]) ?? []);
    const basePlans: AdminPlanRow[] = ((basePlanRows ?? []) as Omit<AdminPlanRow, "renewal_price_amount_thb">[])
      .map((plan) => ({ ...plan, name: planDisplayName(plan.id, plan.name), renewal_price_amount_thb: null }));
    setPlans(basePlanError ? [] : basePlans);
    setPlanOverviewMessage(memberError || basePlanError || benefitError
      ? "ข้อมูลบางส่วนยังโหลดไม่สำเร็จ ระบบจึงซ่อนตัวเลขที่ยังยืนยันไม่ได้ กรุณารีเฟรชข้อมูลแล้วลองอีกครั้ง"
      : null);

    const overviewResult = await overviewInsightsPromise;
    setOverviewInsights((current) => overviewResult.data ?? (overviewResult.unavailable ? null : current));
    setOverviewInsightsMessage(overviewResult.message);
    setOverviewInsightsLoading(false);

    const [readiness, lineSlipReadiness] = await Promise.all([
      readinessPromise,
      lineSlipReadinessPromise,
    ]);
    setLineSlipWorkflowReadiness(lineSlipReadiness);
    lineSlipWorkflowReadinessRef.current = lineSlipReadiness;

    let membershipPlans = basePlans;
    let membershipError: string | null = readiness === "ready" ? null : MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE;

    if (readiness === "ready") {
      const [
        { data: planRows, error: planError },
        { data: subscriptionRows, error: subscriptionError },
        { data: founderCount, error: founderCountError },
      ] = await Promise.all([
        supabase.from("plans").select("id, name, lifecycle_status, price_amount_thb, renewal_price_amount_thb, is_upgradeable, is_public, sort_order").order("sort_order", { ascending: true }),
        loadCurrentSubscriptions(),
        supabase.rpc("get_founder_capacity"),
      ]);

      if (planError) console.error("Failed to load membership plans:", planError.message);
      if (!planError) {
        membershipPlans = ((planRows as AdminPlanRow[]) ?? [])
          .map((plan) => ({ ...plan, name: planDisplayName(plan.id, plan.name) }));
      }
      if (subscriptionError) console.error("Failed to load subscriptions:", subscriptionError.message);
      setSubscriptions(subscriptionError || planError ? null : ((subscriptionRows as AdminSubscription[]) ?? []));
      if (founderCountError) console.error("Failed to load Founder seat count:", founderCountError.message);
      setFounderSeatsUsed(founderCountError ? null : normalizeFounderCapacity(founderCount)?.used ?? null);
      if (subscriptionError || planError || founderCountError) {
        membershipError = "ไม่สามารถตรวจข้อมูลสมาชิกที่จำเป็นได้ จึงปิดการยืนยัน ปฏิเสธ และต่ออายุชั่วคราว";
      }
    } else {
      setUpgradeRequests([]);
      setSubscriptions(null);
      setFounderSeatsUsed(null);
      setPaymentTarget(null);
    }

    setMembershipDataError(membershipError);
    setMembershipSchemaReadiness(readiness);
    membershipSchemaReadinessRef.current = readiness;
    setPlans(membershipPlans);

    // A missing 048 schema cannot prevent the base admin tools above from
    // loading. The catalogue fallback intentionally omits the new renewal
    // price while keeping resource-plan editing available.
    if (basePlanError && readiness !== "ready") setPlans([]);

    // Queue rows and their badges are one bounded, latest-only snapshot. Every
    // full reload awaits it, so post-action UI cannot show a new badge beside
    // stale rows from an earlier session.
    await refreshAdminQueues(nextReviewPage, nextReportPage);
  };

  const subscriptionsByUser = useMemo(() => {
    const byUser = new Map<string, AdminSubscription>();
    for (const subscription of subscriptions ?? []) {
      byUser.set(subscription.user_id, preferredAdminSubscription(byUser.get(subscription.user_id), subscription));
    }
    return byUser;
  }, [subscriptions]);
  const membershipMutationsReady = membershipSchemaReadiness === "ready" && membershipDataError === null;
  const membershipMaintenanceMessage = membershipDataError ?? MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE;
  const mutationBusy = saving || pendingAction !== null || changingPlanId !== null || paymentTarget !== null;
  const filteredUpgradeRequests = useMemo(() => {
    return upgradeRequests.filter((request) => matchesAdminUpgradeSearch(request, upgradeSearch));
  }, [upgradeSearch, upgradeRequests]);
  const confirmsFounderApplication = paymentTarget?.kind === "application" && paymentTarget.request.plan_id === "founder";
  const founderCapacityUnavailable = confirmsFounderApplication && (founderCapacityRefreshing || founderSeatsUsed === null);
  const founderCapacityFull = confirmsFounderApplication && !founderCapacityRefreshing && founderSeatsUsed !== null && founderSeatsUsed >= FOUNDER_CAPACITY_LIMIT;
  const founderConfirmationBlocked = founderCapacityUnavailable || founderCapacityFull;
  const projectedFounderSeats = confirmsFounderApplication && founderSeatsUsed !== null ? founderSeatsUsed + 1 : null;

  useEffect(() => {
    (async () => {
      const authResult = await supabase.auth.getUser().catch(() => null);
      const user = authResult
        && !authResult.error
        && isPermanentAuthUser(authResult.data.user)
        ? authResult.data.user
        : null;
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
    const uninstall = installAdminActionRefresh(window, () => {
      void refreshAdminQueues();
    }, allowed);

    return () => {
      uninstall();
    };
  }, [allowed]);

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
    // Sign out this device only, and stay put if it did not work, so a
    // shared computer is never left signed in without the admin knowing.
    const logoutError = await signOutCurrentSession(supabase.auth);
    if (logoutError) {
      window.alert(logoutError);
      return;
    }
    router.push("/");
    router.refresh();
  };

  const handleManualAdminRefresh = async () => {
    const action = "queue-refresh";
    if (!beginPendingAction(action)) return;
    try {
      setMemberStatusNow(Date.now());
      const refreshed = await refreshAdminQueues();
      if (!refreshed) {
        window.alert("รีเฟรชข้อมูลไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองอีกครั้ง");
      }
    } finally {
      finishPendingAction(action);
    }
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
    if (nextView === "requests" || nextView === "moderation" || nextView === "upgrades") {
      void refreshAdminQueues();
    }
  };

  const openCreateForm = () => {
    const guard = guardAgainstBusyForm(mutationBusy);
    if (!guard.allowed) {
      window.alert(guard.message);
      return;
    }
    setEditingId(null);
    setPendingResourceId(crypto.randomUUID());
    setSavedSlug("");
    setForm(EMPTY_FORM);
    setFormBaseline(JSON.stringify(EMPTY_FORM));
    setSelectedFile(null);
    setSelectedCoverFile(null);
    setCoverCropSource(null);
    setCoverCropMeta(null);
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
    setCoverCropSource(null);
    setCoverCropMeta(null);
    setFileRemoved(false);
    setSavedSlug("");
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
    const loadRow = async () => {
      const columns = "title, meta, description, category, grade_levels, delivery_mode, cover_image_url, access_mode, file_size, file_mime_type";
      const withSlug = await supabase.from("resources").select(`${columns}, slug`).eq("id", id).single();
      if (withSlug.error && isSlugUnavailable(withSlug.error)) {
        return await supabase.from("resources").select(columns).eq("id", id).single();
      }
      return withSlug;
    };
    const [{ data: loaded, error }, { target: resolved, error: targetError }] = await Promise.all([
      loadRow(),
      loadResourceTarget(supabase, id),
    ]);
    const data = loaded as (typeof loaded & { slug?: string | null }) | null;
    if (error || !data || targetError || !resolved) {
      window.alert(`โหลดข้อมูลสื่อไม่สำเร็จ: ${error?.message ?? targetError ?? ""}`);
      return;
    }
    setEditingId(id);
    setPendingResourceId(null);
    setSelectedFile(null);
    setSelectedCoverFile(null);
    setCoverCropSource(null);
    setCoverCropMeta(null);
    setFileRemoved(false);
    setSavedSlug(data.slug ?? "");
    const nextForm = {
      title: data.title ?? "",
      meta: data.meta ?? "",
      description: data.description ?? "",
      category: data.category ?? "",
      grade_levels: data.grade_levels ?? [],
      delivery_mode: data.delivery_mode,
      cta_url: resolved.cta_url ?? "",
      cover_image_url: data.cover_image_url ?? "",
      slug: data.slug ?? "",
      access_mode: data.access_mode as ResourceAccessMode,
      plan_ids: resourcePlanAccess.get(id) ?? [],
      file_path: resolved.file_path ?? "",
      file_name: resolved.file_name ?? "",
      file_size: data.file_size ?? 0,
      file_mime_type: data.file_mime_type ?? "",
    };
    setForm(nextForm);
    setFormBaseline(JSON.stringify(nextForm));
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
    setCoverCropSource(file);
    setCoverCropMeta(null);
  };

  const closeCoverCropper = () => {
    setCoverCropSource(null);
    window.requestAnimationFrame(() => coverInputRef.current?.focus());
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
      setFormError("เกิดข้อผิดพลาด กรุณาปิดแผงแก้ไขแล้วเปิดใหม่อีกครั้ง");
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
    const slugState = slugFieldState(slugSupported ? form.slug : "", savedSlug);
    if (slugState.kind === "invalid") {
      setFormError(slugState.message);
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
        gradeLevels: form.grade_levels,
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
        setFormError("เกิดข้อผิดพลาด กรุณาปิดแผงแก้ไขแล้วเปิดใหม่อีกครั้ง");
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
          setFormError("เกิดข้อผิดพลาด กรุณาปิดแผงแก้ไขแล้วเปิดใหม่อีกครั้ง");
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

      const slugParam = slugSupported ? slugParamForSave(form.slug, savedSlug) : null;
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
          // Only sent when the field changed, so saving anything else also works before migration 055.
          ...(slugParam ? { p_slug: slugParam } : {}),
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
        setFormError(thaiSlugSaveError(result.saveError) ?? result.saveError);
        return;
      }
      if (result.cleanupFailures.length > 0) {
        window.alert("บันทึกสำเร็จ แต่ลบไฟล์เดิมไม่สำเร็จ — ระบบเก็บรายการนี้ไว้ให้ลองใหม่ได้จากแบนเนอร์ด้านบน");
      }

      setSavedNotice(`บันทึก “${payload.title}” แล้ว`);
      setSavedSlug("");
      setForm(EMPTY_FORM);
      setFormBaseline("");
      setEditingId(null);
      setPendingResourceId(null);
      setSelectedFile(null);
      setSelectedCoverFile(null);
      setCoverCropSource(null);
      setCoverCropMeta(null);
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
          supabase.from("resources").select("delivery_mode, cover_image_url, grade_levels").eq("id", id).single(),
          loadResourceTarget(supabase, id),
        ]);
        // Fail closed: a query error or a missing row must never be treated
        // as "no problems found" — both block the publish.
        const publishGuard = evaluatePublishGuard({
          data: metadata && resolved
            ? { status: "published", deliveryMode: metadata.delivery_mode, coverImageUrl: metadata.cover_image_url, filePath: resolved.file_path, ctaUrl: resolved.cta_url, gradeLevels: metadata.grade_levels ?? [] }
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

  const handleRequestStatusChange = async (request: AdminRequest, status: AdminRequest["status"]) => {
    const action = `request:${request.id}`;
    if (!beginPendingAction(action)) return;
    try {
      const latest = await refreshAndMatchQueueRow("requests", request, sameAdminRequestVersion);
      if (!latest) return;
      const { error } = await supabase.from("requests").update({ status }).eq("id", latest.id);
      if (error) {
        window.alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
      }
      await refreshAdminQueues();
    } finally {
      finishPendingAction(action);
    }
  };

  const openPaymentConfirmation = (target: PaymentConfirmationTarget) => {
    if (queueRefreshError) {
      window.alert("กรุณาโหลดรายการหลังบ้านล่าสุดให้สำเร็จก่อนยืนยันการชำระ");
      return;
    }
    if (!membershipMutationsReady) {
      window.alert(membershipMaintenanceMessage);
      return;
    }
    if (mutationBusy) return;
    paymentTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPaymentTarget(target);
    setPaymentReference("");
    setPaymentPaidAt(localDateTimeInputValue());
    setPaymentVerified(false);
    setPaymentIdempotencyKey(newIdempotencyKey());
    setPaymentError(null);
    if (target.kind === "application" && target.request.plan_id === "founder") {
      void refreshFounderCapacityForPayment();
    } else {
      setFounderCapacityRefreshing(false);
    }
  };

  const refreshFounderCapacityForPayment = async () => {
    if (!membershipMutationsReady) return;
    setFounderCapacityRefreshing(true);
    try {
      const capacity = await fetchFounderCapacity(supabase);
      setFounderSeatsUsed(capacity?.used ?? null);
    } finally {
      setFounderCapacityRefreshing(false);
    }
  };

  const closePaymentConfirmation = () => {
    if (pendingAction) return;
    setPaymentTarget(null);
    setPaymentError(null);
  };

  const handleConfirmPayment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!paymentTarget || pendingActionRef.current) return;
    if (queueRefreshError) {
      setPaymentError("รายการหลังบ้านไม่ใช่ข้อมูลล่าสุด กรุณาโหลดใหม่ก่อนยืนยันการชำระ");
      return;
    }
    if (!membershipMutationsReady) {
      setPaymentError(membershipMaintenanceMessage);
      return;
    }
    if (founderCapacityUnavailable) {
      setPaymentError("ยังตรวจสอบจำนวน Founder ปัจจุบันไม่ได้ จึงปิดการยืนยันชั่วคราว");
      return;
    }
    if (founderCapacityFull) {
      setPaymentError(`Founder ครบ ${FOUNDER_CAPACITY_LIMIT} สิทธิ์แล้ว ระบบจะไม่ออกสิทธิ์เกินจำนวน`);
      return;
    }
    const normalizedReference = paymentReference.trim();
    const paidAt = new Date(paymentPaidAt);
    if (!normalizedReference) {
      setPaymentError("กรุณากรอกเลขอ้างอิงการชำระจากรายการจริง");
      return;
    }
    if (!paymentPaidAt || !Number.isFinite(paidAt.getTime())) {
      setPaymentError("กรุณาระบุวันและเวลาที่รับชำระ");
      return;
    }
    if (!paymentVerified) {
      setPaymentError("กรุณายืนยันว่าได้ตรวจยอดเงินเข้าจริงแล้ว");
      return;
    }

    const actionId = paymentTarget.kind === "application"
      ? `payment:${paymentTarget.request.id}`
      : `renewal:${paymentTarget.subscription.id}`;
    if (!beginPendingAction(actionId)) return;
    setPaymentError(null);
    try {
      if (paymentTarget.kind === "application") {
        const latest = await refreshAndMatchQueueRow(
          "upgrades",
          paymentTarget.request,
          sameAdminUpgradeVersion,
          setPaymentError,
        );
        if (!latest) return;
      } else {
        const { data: latestSubscription, error: subscriptionError } = await supabase
          .from("subscriptions")
          .select("id, user_id, plan_id, status, source, billing_interval, current_period_end, founder_status, founder_price_lock")
          .eq("id", paymentTarget.subscription.id)
          .maybeSingle();
        if (subscriptionError || !latestSubscription) {
          setPaymentError("รีเฟรชข้อมูลสมาชิกไม่สำเร็จ ระบบยังไม่ได้ดำเนินการ กรุณาปิดหน้าต่างนี้ รีเฟรชข้อมูล แล้วลองอีกครั้ง");
          return;
        }
        if (!sameAdminSubscriptionVersion(paymentTarget.subscription, latestSubscription as AdminSubscription)) {
          setPaymentError("ข้อมูลสมาชิกนี้มีการเปลี่ยนแปลง ระบบยังไม่ได้ดำเนินการ กรุณาปิดหน้าต่างนี้ ตรวจข้อมูลล่าสุด แล้วลองอีกครั้ง");
          return;
        }
      }

      const confirmation = {
        amountThb: paymentTarget.amountThb,
        paymentReference: normalizedReference,
        paidAt: paidAt.toISOString(),
        idempotencyKey: paymentIdempotencyKey,
      };
      const errorMessage = paymentTarget.kind === "application"
        ? await confirmMembershipPayment(supabase, paymentTarget.request.id, confirmation)
        : await confirmSubscriptionRenewal(supabase, paymentTarget.subscription.id, confirmation);
      if (errorMessage) {
        const friendlyError = userFacingAdminError(errorMessage);
        setPaymentError(/Founder 100 is full/i.test(friendlyError)
          ? "Founder ครบ 100 สิทธิ์แล้ว ระบบไม่ได้อนุมัติรายการนี้"
          : `ยืนยันการชำระไม่สำเร็จ: ${friendlyError}`);
        // The payment RPC locks and re-checks pending state server-side. A
        // stale second-session action therefore fails closed; refresh the
        // whole queue immediately so the rejected row cannot be acted on again.
        await refreshAdminQueues();
        return;
      }
      // The database confirmed the payment and activated or renewed the plan.
      trackEvent("pro_activated", {
        plan_id: paymentTarget.kind === "application" ? paymentTarget.request.plan_id : paymentTarget.subscription.plan_id,
        stage: paymentTarget.kind === "application" ? "activation" : "renewal",
      });
      setPaymentSuccessMessage(adminPaymentSuccessMessage({
        kind: paymentTarget.kind,
        amountThb: paymentTarget.amountThb,
        referenceCode: paymentTarget.kind === "application"
          ? paymentTarget.request.reference_code
          : undefined,
      }));
      setPaymentSuccessCopied(false);
      setPaymentTarget(null);
      try {
        await reloadAdminData();
      } catch {
        window.alert("ยืนยันการชำระสำเร็จแล้ว แต่โหลดข้อมูลล่าสุดไม่สำเร็จ กรุณากดรีเฟรชข้อมูลอีกครั้ง");
      }
    } catch (error) {
      setPaymentError(`ยืนยันการชำระไม่สำเร็จ: ${error instanceof Error ? userFacingAdminError(error.message) : "เกิดข้อผิดพลาดในการเชื่อมต่อ"}`);
    } finally {
      finishPendingAction(actionId);
    }
  };

  const handleApproveUpgrade = (request: AdminUpgradeRequest) => {
    if (!membershipMutationsReady) {
      window.alert(membershipMaintenanceMessage);
      return;
    }
    if (!request.line_slip_received_at) {
      window.alert("ยังไม่ได้บันทึกรับสลิปจาก LINE สำหรับใบสมัครนี้");
      return;
    }
    const amountThb = Number(request.quoted_amount_thb);
    if (!Number.isInteger(amountThb) || amountThb <= 0) {
      window.alert("ไม่พบยอดที่คาดว่าจะชำระ จึงยังยืนยันไม่ได้");
      return;
    }
    openPaymentConfirmation({
      kind: "application",
      request,
      amountThb,
      title: `ใบสมัคร ${request.reference_code}`,
    });
  };

  const handleRecordLineSlip = async (request: AdminUpgradeRequest) => {
    if (lineSlipWorkflowReadiness !== "ready") {
      window.alert(MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE);
      return;
    }
    const action = `slip:${request.id}`;
    if (queueRefreshError || paymentTarget || !window.confirm(`ยืนยันว่าได้รับสลิปของ ${request.reference_code} ใน LINE แล้ว?`) || !beginPendingAction(action)) return;
    try {
      const latest = await refreshAndMatchQueueRow("upgrades", request, sameAdminUpgradeVersion);
      if (!latest) return;
      const result = await recordMembershipLineSlipReceived(supabase, latest.id);
      if (result.error || !result.application) {
        window.alert(`บันทึกรับสลิปไม่สำเร็จ: ${userFacingAdminError(result.error ?? "ระบบไม่ได้ส่งข้อมูลกลับมา")}`);
      }
      await refreshAdminQueues();
    } finally {
      finishPendingAction(action);
    }
  };

  const handleCopyPaymentSuccess = async () => {
    if (!paymentSuccessMessage) return;
    try {
      await navigator.clipboard.writeText(paymentSuccessMessage);
      setPaymentSuccessCopied(true);
      window.setTimeout(() => setPaymentSuccessCopied(false), 2500);
    } catch {
      window.alert("คัดลอกข้อความไม่สำเร็จ กรุณาเลือกข้อความและคัดลอกด้วยตนเอง");
    }
  };

  const handleDeclineUpgrade = async (request: AdminUpgradeRequest) => {
    if (!membershipMutationsReady) {
      window.alert(membershipMaintenanceMessage);
      return;
    }
    const action = `upgrade:${request.id}`;
    if (queueRefreshError || paymentTarget || !window.confirm("ปฏิเสธใบสมัครนี้ใช่หรือไม่? ผู้สมัครจะเห็นสถานะว่าไม่ผ่านการตรวจสอบ") || !beginPendingAction(action)) return;
    try {
      const latest = await refreshAndMatchQueueRow("upgrades", request, sameAdminUpgradeVersion);
      if (!latest) return;
      const { error } = await supabase.rpc("decline_upgrade_request", { p_request_id: latest.id });
      if (error) {
        window.alert(`อัปเดตไม่สำเร็จ: ${error.message}`);
        await refreshAdminQueues();
        return;
      }
      await refreshAdminQueues();
    } finally {
      finishPendingAction(action);
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
    const action = `review:${review.id}`;
    if (!beginPendingAction(action)) return;
    try {
      const latest = await refreshAndMatchQueueRow("reviews", review, sameAdminReviewVersion);
      if (!latest) return;
      const { error } = await supabase.rpc("admin_set_review_visibility", {
        p_review_id: latest.id,
        p_visible: latest.moderation_status !== "visible",
      });
      if (error) window.alert(`อัปเดตรีวิวไม่สำเร็จ: ${error.message}`);
      await refreshAdminQueues();
    } finally {
      finishPendingAction(action);
    }
  };

  const handleReviewPageChange = async (nextPage: number) => {
    const action = "review-page";
    if (queueRefreshError || nextPage < 0 || nextPage * MODERATION_PAGE_SIZE >= reviewTotal || !beginPendingAction(action)) return;
    try {
      await refreshAdminQueues(nextPage, reportPage);
    } finally {
      finishPendingAction(action);
    }
  };

  const handleReportPageChange = async (nextPage: number) => {
    const action = "report-page";
    if (queueRefreshError || nextPage < 0 || nextPage * MODERATION_PAGE_SIZE >= reportTotal || !beginPendingAction(action)) return;
    try {
      await refreshAdminQueues(reviewPage, nextPage);
    } finally {
      finishPendingAction(action);
    }
  };

  const handleDeleteReview = async (review: AdminReview) => {
    const action = `review:${review.id}`;
    if (!window.confirm("ลบรีวิวนี้ถาวรใช่หรือไม่?") || !beginPendingAction(action)) return;
    try {
      const latest = await refreshAndMatchQueueRow("reviews", review, sameAdminReviewVersion);
      if (!latest) return;
      const { error } = await supabase.rpc("admin_delete_resource_review", { p_review_id: latest.id });
      if (error) window.alert(`ลบรีวิวไม่สำเร็จ: ${error.message}`);
      await refreshAdminQueues(reviews.length === 1 ? Math.max(0, reviewPage - 1) : reviewPage, reportPage);
    } finally {
      finishPendingAction(action);
    }
  };

  const handleIssueStatus = async (report: AdminIssueReport, status: IssueReportStatus) => {
    const action = `report:${report.id}`;
    if (!beginPendingAction(action)) return;
    try {
      const latest = await refreshAndMatchQueueRow("reports", report, sameAdminReportVersion);
      if (!latest) return;
      const { error } = await supabase.rpc("admin_set_resource_issue_status", {
        p_report_id: latest.id,
        p_status: status,
      });
      if (error) window.alert(`อัปเดตรายงานไม่สำเร็จ: ${error.message}`);
      await refreshAdminQueues();
    } finally {
      finishPendingAction(action);
    }
  };

  const handleBenefitCopy = async (featureId: string, rawName: string, rawDescription: string): Promise<string | null> => {
    const name = rawName.trim();
    const description = rawDescription.trim();
    if (!name) return "กรุณากรอกชื่อสิทธิ์";
    const action = `benefit:${featureId}`;
    if (!beginPendingAction(action)) return "กำลังทำรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่";
    try {
      const { error } = await supabase.rpc("admin_update_feature_copy", {
        p_feature_id: featureId,
        p_name: name,
        p_description: description,
      });
      if (error) return friendlyErrorMessage(error, "บันทึกข้อความสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง");
      await reloadAdminData();
      return null;
    } catch (error) {
      return friendlyErrorMessage(error, "บันทึกข้อความสิทธิ์ไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      finishPendingAction(action);
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
        window.alert(friendlyErrorMessage(error, "อัปเดตแพ็กไม่สำเร็จ กรุณาลองอีกครั้ง"));
        return;
      }
      await reloadAdminData();
    } catch (error) {
      window.alert(friendlyErrorMessage(error, "อัปเดตแพ็กไม่สำเร็จ กรุณาลองอีกครั้ง"));
    } finally {
      setChangingPlanId(null);
    }
  };

  const handleRenewSubscription = (subscription: AdminSubscription) => {
    if (!membershipMutationsReady) {
      window.alert(membershipMaintenanceMessage);
      return;
    }
    if (mutationBusy || !canRenewMember(subscription)) return;
    const plan = plans.find((item) => item.id === subscription.plan_id && item.lifecycle_status === "active");
    const price = renewalAmountThb(subscription, plan?.renewal_price_amount_thb ?? plan?.price_amount_thb ?? null);
    if (!plan || price === null) {
      window.alert("ไม่พบราคาแพ็กปัจจุบัน จึงยังต่ออายุไม่ได้");
      return;
    }
    openPaymentConfirmation({ kind: "renewal", subscription, amountThb: price, title: `ต่ออายุ ${plan.name}` });
  };

  // Only an owner can reach this at all — the role action in the members
  // panel is only rendered for an owner viewer, and the
  // server independently enforces the same rule (is_owner() in the
  // prevent_self_privilege_escalation trigger), so this is UX, not the
  // actual security boundary.
  const handleMemberRoleChange = async (member: AdminMemberListItem, role: AdminMemberRole): Promise<string | null> => {
    if (mutationBusy) return "กำลังทำรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่";
    const action = `role:${member.id}`;
    if (!beginPendingAction(action)) return "กำลังทำรายการอื่นอยู่ กรุณารอสักครู่แล้วลองใหม่";
    try {
      const { error } = await supabase.from("profiles").update({ role }).eq("id", member.id);
      if (error) {
        // Failed (e.g. the last-owner guard rejected it) — nothing actually
        // changed server-side, so local role/UI must stay exactly as it was.
        return friendlyErrorMessage(error, "อัปเดตบทบาทไม่สำเร็จ กรุณาลองอีกครั้ง");
      }
      if (member.id === adminId && viewerRole) {
        // The update above actually took effect on the viewer's own row —
        // immediately align locally-rendered privileges with the server.
        const effect = applySelfRoleChange(viewerRole, role, view);
        if (effect) {
          setViewerRole(effect.viewerRole);
          if (effect.clearAuditLog) setAuditLog([]);
          if (effect.view) setView(effect.view as View);
          if (effect.redirectToApp) {
            router.push("/app");
            return null;
          }
        }
      }
      await reloadAdminData();
      return null;
    } catch (error) {
      return friendlyErrorMessage(error, "อัปเดตบทบาทไม่สำเร็จ กรุณาลองอีกครั้ง");
    } finally {
      finishPendingAction(action);
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
  const navBadgeByKey: Partial<Record<View, number | null>> = {
    requests: actionCounts.requests,
    moderation: actionCounts.moderation,
    upgrades: actionCounts.upgrades,
  };
  const baseNavItems = BASE_NAV_ITEMS.map((item) => ({ ...item, badge: navBadgeByKey[item.key as View] }));
  const navGroups: SideNavGroup[] = [{ items: isOwner ? [...baseNavItems, OWNER_NAV_ITEM] : baseNavItems }];
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

  const resourceCounts = statusCounts(resources);
  const visibleResources = filterResources(resources, { query: resourceQuery, status: resourceFilter });
  const formDirty = showForm && (JSON.stringify(form) !== formBaseline || Boolean(selectedFile) || Boolean(selectedCoverFile) || Boolean(coverCropSource) || fileRemoved);

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
            <SideNav groups={navGroups} value={view} ariaLabel="เมนูหลังบ้าน" onChange={handleNavChange} />
          </div>
          <Button size="sm" block variant="soft" icon={Eye} onClick={() => router.push("/app?memberPreview=1")} disabled={mutationBusy} style={{ marginBottom: "var(--sp-3)" }}>
            ดูหน้าสมาชิก
          </Button>
          <Button size="sm" block variant="ghost" icon={LogOut} onClick={handleSignOut} disabled={mutationBusy}>
            ออกจากระบบ
          </Button>
        </aside>

        <main className="kru-admin-main">
          <p className="kru-admin-private-meta" style={{ textAlign: "right" }}>เวอร์ชันแอป {APP_VERSION}</p>
          <div className="kru-admin-refresh-row">
            <Button
              type="button"
              size="sm"
              variant="soft"
              icon={RefreshCw}
              onClick={() => void handleManualAdminRefresh()}
              loading={pendingAction === "queue-refresh"}
              disabled={mutationBusy && pendingAction !== "queue-refresh"}
            >
              รีเฟรชข้อมูล
            </Button>
          </div>
          {queueRefreshError && (
            <div className="kru-admin-queue-error" role="alert">
              <span>{queueRefreshError}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => void refreshAdminQueues()}>ลองโหลดรายการใหม่</Button>
            </div>
          )}
          {paymentSuccessMessage && (
            <section className="kru-admin-payment-success" role="status" aria-label="ข้อความแจ้งสมาชิกหลังยืนยันชำระ">
              <div>
                <strong>ยืนยันสำเร็จ · คัดลอกข้อความส่งกลับใน LINE</strong>
                <button type="button" onClick={() => { setPaymentSuccessMessage(null); setPaymentSuccessCopied(false); }} aria-label="ปิดข้อความสำเร็จ"><X size={18} aria-hidden="true" /></button>
              </div>
              <textarea readOnly value={paymentSuccessMessage} aria-label="ข้อความพร้อมส่งให้สมาชิก" rows={3} onFocus={(event) => event.currentTarget.select()} />
              <Button type="button" size="sm" icon={paymentSuccessCopied ? Check : Clipboard} onClick={() => void handleCopyPaymentSuccess()}>
                {paymentSuccessCopied ? "คัดลอกแล้ว" : "คัดลอกข้อความแจ้งสมาชิก"}
              </Button>
            </section>
          )}
          {view === "dash" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>ภาพรวม</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>ข้อมูลจริงจากฐานข้อมูล</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--gap-grid)", marginBottom: "var(--sp-8)" }}>
                <StatTile value={resources.filter((r) => r.status === "published").length} label="สื่อที่เผยแพร่แล้ว" icon={FolderOpen} tone="success" />
                <StatTile value={members.length} label="สมาชิกทั้งหมด" icon={Users} tone="brand" />
                <StatTile value={actionCounts.requests ?? "—"} label="คำขอใหม่ที่ต้องพิจารณา" icon={MessageSquareText} tone="info" />
                <StatTile value={actionCounts.moderation ?? "—"} label="รีวิว/รายงานที่ต้องจัดการ" icon={ShieldCheck} tone="warning" />
                <StatTile value={membershipMutationsReady ? actionCounts.upgrades ?? "—" : "—"} label="แจ้งชำระที่ต้องตรวจ" icon={Wallet} tone="warning" />
              </div>
              <AdminOverviewInsights data={overviewInsights} loading={overviewInsightsLoading} message={overviewInsightsMessage} />
            </div>
          )}

          {view === "content" && (
            <div>
              <div className="kru-res-header">
                <div>
                  <h1 style={{ fontSize: "var(--fs-30)" }}>จัดการสื่อ</h1>
                  <p>กดชื่อสื่อหรือปุ่ม “แก้ไข” เพื่อเปิดแผงแก้ไขด้านข้าง · สื่อใหม่เริ่มเป็นฉบับร่าง ต้องมีรูปปกก่อนเผยแพร่</p>
                </div>
                <Button icon={Plus} onClick={openCreateForm} disabled={mutationBusy}>
                  เพิ่มสื่อใหม่
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

              {savedNotice && (
                <div className="kru-res-notice" role="status">
                  <Check size={18} aria-hidden="true" />
                  <span>{savedNotice}</span>
                </div>
              )}

              <ResourceEditorDrawer
                open={showForm}
                formId="resource-form"
                title={editingId ? "แก้ไขสื่อ" : "เพิ่มสื่อใหม่"}
                subtitle={form.title.trim() || (editingId ? undefined : "เริ่มเป็นฉบับร่าง ต้องมีรูปปกก่อนเผยแพร่")}
                submitLabel={editingId ? "บันทึกการแก้ไข" : "บันทึกเป็นฉบับร่าง"}
                saving={saving}
                submitDisabled={(mutationBusy && !saving) || Boolean(coverCropSource)}
                dirty={formDirty}
                error={formError}
                onClose={closeForm}
              >
                <form id="resource-form" onSubmit={handleSaveResource} className="kru-res-form">
                  <section className="kru-res-section" aria-labelledby="res-sec-basic">
                    <h3 id="res-sec-basic">ข้อมูลหลัก</h3>
                  <Input label="ชื่อสื่อ" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
                  {(() => {
                    const state = slugFieldState(form.slug, savedSlug);
                    const suggestion = suggestSlug(form.title);
                    const preview = state.kind === "empty" ? (state.hasSaved ? savedSlug : "") : form.slug.trim();
                    if (!slugSupported) {
                      return (
                        <div className="kru-field">
                          <Input label="ที่อยู่ลิงก์ของสื่อ (slug)" value="" disabled readOnly aria-describedby="resource-slug-help" />
                          <div id="resource-slug-help" role="status" style={{ marginTop: "var(--sp-2)", fontSize: "var(--fs-13)", color: "var(--status-warning-fg)" }}>
                            ⚠ {SLUG_UNAVAILABLE_NOTICE}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="kru-field">
                        <Input
                          label="ที่อยู่ลิงก์ของสื่อ (slug)"
                          value={form.slug}
                          onChange={(e) => setForm({ ...form, slug: e.target.value })}
                          placeholder={savedSlug ? "เว้นว่างไว้ = ใช้ slug เดิม" : "เช่น sentence-train (เว้นว่างได้)"}
                          autoCapitalize="none"
                          autoCorrect="off"
                          spellCheck={false}
                          maxLength={80}
                          aria-invalid={state.kind === "invalid"}
                          aria-describedby="resource-slug-help"
                          trailing={!form.slug.trim() && suggestion && suggestion !== savedSlug ? (
                            <button type="button" className="kru-btn kru-btn--soft kru-btn--sm" onClick={() => setForm({ ...form, slug: suggestion })}>
                              ใช้ {suggestion}
                            </button>
                          ) : undefined}
                        />
                        <div id="resource-slug-help" style={{ display: "grid", gap: 4, marginTop: "var(--sp-2)", fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                          <span>{SLUG_RULE_HELP}</span>
                          {preview && state.kind !== "invalid" && <span>ลิงก์ของสื่อ: <strong style={{ color: "var(--text-strong)", wordBreak: "break-all" }}>{resourceAddress(preview)}</strong></span>}
                          {!preview && <span>ถ้าไม่ตั้ง สื่อนี้จะใช้ลิงก์แบบรหัสยาว (UUID) จนกว่าจะตั้ง slug</span>}
                          {state.kind === "invalid" && <span role="alert" style={{ color: "var(--status-danger-fg)" }}>{state.message}</span>}
                          {state.kind === "changed" && (
                            <span role="status" style={{ color: "var(--status-warning-fg)" }}>
                              ⚠ การเปลี่ยน slug ทำให้ลิงก์เดิม ({resourceAddress(savedSlug)}) ใช้ไม่ได้ ลิงก์ที่แชร์ไว้ไปแล้วจะเปิดไม่ได้ (ลิงก์แบบรหัสยาวยังใช้ได้เสมอ)
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  <Input label="คำอธิบายสั้น (แสดงใต้ชื่อ)" placeholder="เช่น Google Sheets & Script · ธุรการชั้นเรียน" value={form.meta} onChange={(e) => setForm({ ...form, meta: e.target.value })} />
                  <div className="kru-field">
                    <label className="kru-field__label" htmlFor="resource-description">รายละเอียด</label>
                    <textarea id="resource-description" className="kru-input" style={{ minHeight: 96, padding: "var(--sp-4) var(--sp-5)" }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  </section>
                  <section className="kru-res-section" aria-labelledby="res-sec-class">
                    <h3 id="res-sec-class">หมวดหมู่และระดับชั้น</h3>
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
                  </section>
                  <section className="kru-res-section" aria-labelledby="res-sec-files">
                    <h3 id="res-sec-files">ลิงก์ ไฟล์ และรูปปก</h3>
                  <Input label="ลิงก์ (URL ปลายทาง)" value={form.cta_url} onChange={(e) => setForm({ ...form, cta_url: e.target.value })} placeholder="https://..." />

                  <div className="kru-field">
                    <label className="kru-field__label" htmlFor="resource-file">
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
                    <input id="resource-file" type="file" accept=".pdf,.docx,.pptx,.xlsx,.zip" onChange={handleFileSelect} disabled={uploadStatus.phase !== "idle"} />
                  </div>

                  <div className="kru-field">
                    <label className="kru-field__label" htmlFor="resource-cover">รูปปก (จำเป็นก่อนเผยแพร่)</label>
                    {renderUploadStatus("cover")}
                    {(coverPreviewUrl || form.cover_image_url) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={coverPreviewUrl || form.cover_image_url}
                        alt="ตัวอย่างรูปปก"
                        style={{ width: "100%", maxWidth: 320, aspectRatio: "4 / 3", height: "auto", objectFit: "cover", borderRadius: "var(--r-md)", border: "1px solid var(--border-subtle)", marginBottom: "var(--sp-3)" }}
                      />
                    )}
                    {selectedCoverFile && uploadStatusFor("cover") === null && (
                      <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)", marginBottom: "var(--sp-3)" }}>
                        รูปใหม่ {coverCropMeta ? `${coverCropMeta.width}×${coverCropMeta.height} ${coverCropMeta.extension.toUpperCase()} · ${formatFileSize(selectedCoverFile.size)}` : ""} — จะอัปโหลดเมื่อกด &quot;บันทึก&quot;
                      </div>
                    )}
                    <input ref={coverInputRef} id="resource-cover" type="file" accept="image/*" onChange={handleCoverSelect} disabled={uploadStatus.phase !== "idle" || Boolean(coverCropSource)} />
                    {coverCropSource && (
                      <CoverCropper
                        file={coverCropSource}
                        onCancel={closeCoverCropper}
                        onConfirm={(croppedFile, output) => {
                          setSelectedCoverFile(croppedFile);
                          setCoverCropMeta(output);
                          setFormError(null);
                          closeCoverCropper();
                        }}
                      />
                    )}
                  </div>

                  </section>
                  <section className="kru-res-section" aria-labelledby="res-sec-access">
                    <h3 id="res-sec-access">สิทธิ์การเข้าถึง</h3>
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
                  </section>
                </form>
              </ResourceEditorDrawer>

              <div className="kru-res-tabs" role="tablist" aria-label="มุมมองจัดการสื่อ">
                <button id="res-tab-list" type="button" role="tab" aria-selected={contentTab === "list"} aria-controls="res-panel-list" onClick={() => setContentTab("list")}>
                  สื่อทั้งหมด ({resources.length})
                </button>
                <button id="res-tab-featured" type="button" role="tab" aria-selected={contentTab === "featured"} aria-controls="res-panel-featured" onClick={() => setContentTab("featured")}>
                  สื่อแนะนำใน Hero ({featuredIds.length}/5)
                </button>
              </div>

              {contentTab === "featured" && (
              <section id="res-panel-featured" role="tabpanel" className="kru-card kru-admin-featured-panel" aria-labelledby="featured-resources-title">
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
              )}

              {contentTab === "list" && (
                <div id="res-panel-list" role="tabpanel" aria-labelledby="res-tab-list">
                  <div className="kru-res-toolbar">
                    <SearchField
                      className="kru-res-search"
                      ariaLabel="ค้นหาสื่อ"
                      placeholder="ค้นหาชื่อสื่อ คำอธิบาย หรือ slug"
                      value={resourceQuery}
                      onChange={setResourceQuery}
                    />
                    <div className="kru-res-chips" role="group" aria-label="กรองตามสถานะ">
                      {STATUS_FILTER_ORDER.map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={`kru-res-chip${key === "attention" ? " kru-res-chip--attention" : ""}`}
                          aria-pressed={resourceFilter === key}
                          onClick={() => setResourceFilter(key)}
                        >
                          {STATUS_FILTER_LABEL[key]}
                          <span className="kru-res-chip__count">{resourceCounts[key]}</span>
                        </button>
                      ))}
                    </div>
                    <p className="kru-res-summary" role="status" aria-live="polite">
                      แสดง {visibleResources.length} จาก {resources.length} รายการ
                    </p>
                  </div>

                  {resources.length === 0 ? (
                    <div className="kru-res-empty">
                      <EmptyState icon={FolderOpen} title="ยังไม่มีสื่อ" description="กด “เพิ่มสื่อใหม่” เพื่อเริ่มสร้างสื่อชิ้นแรก" />
                    </div>
                  ) : visibleResources.length === 0 ? (
                    <div className="kru-res-empty">
                      <EmptyState icon={Search} title="ไม่พบสื่อที่ตรงกับการค้นหา" description="ลองเปลี่ยนคำค้นหา หรือเลือกตัวกรองอื่น" />
                      <div style={{ display: "flex", justifyContent: "center", marginTop: "var(--sp-4)" }}>
                        <Button variant="soft" onClick={() => { setResourceQuery(""); setResourceFilter("all"); }}>
                          ล้างตัวกรอง
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="kru-card kru-res-list">
                      <table className={`kru-res-table${slugSupported ? "" : " kru-res-table--no-slug"}`}>
                        <thead>
                          <tr>
                            <th scope="col">ชื่อสื่อ</th>
                            <th scope="col">สถานะ</th>
                            <th scope="col">สิทธิ์เข้าถึง</th>
                            <th scope="col" className="kru-res-cell--slug">ลิงก์</th>
                            <th scope="col"><span className="kru-res-sr">จัดการ</span></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleResources.map((item) => {
                            const flags = resourceAttention(item);
                            return (
                              <tr key={item.id}>
                                <td className="kru-res-cell--main">
                                  <button type="button" className="kru-res-title" disabled={mutationBusy} onClick={() => openEditForm(item.id)}>
                                    {item.title}
                                  </button>
                                  {item.meta ? <div className="kru-res-meta">{item.meta}</div> : null}
                                  {flags.length > 0 && (
                                    <div className="kru-res-flags">
                                      {flags.map((flag) => (
                                        <span key={flag} className="kru-res-flag">⚠ {ATTENTION_LABEL[flag]}</span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td data-label="สถานะ">
                                  <select
                                    className="kru-select kru-res-status-select"
                                    data-status={item.status}
                                    aria-label={`สถานะเผยแพร่ของ ${item.title}`}
                                    value={item.status}
                                    disabled={mutationBusy}
                                    onChange={(e) => handleStatusChange(item.id, e.target.value as ResourceStatus)}
                                  >
                                    <option value="draft">ฉบับร่าง</option>
                                    <option value="published">เผยแพร่แล้ว</option>
                                    <option value="archived">เก็บถาวร</option>
                                  </select>
                                </td>
                                <td data-label="สิทธิ์เข้าถึง">
                                  <Badge tone={item.access_mode === "locked" ? "neutral" : item.access_mode === "public" ? "success" : "brand"}>
                                    {resourceAccessLabel(item.access_mode, (resourcePlanAccess.get(item.id) ?? []).map((id) => planNameById.get(id) ?? id))}
                                  </Badge>
                                </td>
                                <td data-label="ลิงก์" className="kru-res-cell--slug">
                                  <span className="kru-res-slug" title={item.slug ? `/resources/${item.slug}` : undefined}>{item.slug ? `/resources/${item.slug}` : "—"}</span>
                                </td>
                                <td className="kru-res-cell--actions">
                                  <div className="kru-res-actions">
                                    <Button size="sm" variant="secondary" icon={Pencil} disabled={mutationBusy} onClick={() => openEditForm(item.id)} aria-label={`แก้ไข ${item.title}`}>
                                      แก้ไข
                                    </Button>
                                    <button
                                      type="button"
                                      aria-label={`ลบ ${item.title}`}
                                      disabled={mutationBusy}
                                      onClick={() => handleDeleteResource(item.id, item.title)}
                                      className="kru-admin-icon-action kru-admin-icon-action--danger"
                                    >
                                      <Trash2 size={18} />
                                    </button>
                                  </div>
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
            </div>
          )}

          {view === "moderation" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>รีวิวและรายงานปัญหา</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-6)", color: "var(--text-muted)" }}>ข้อมูลผู้รีวิวและผู้รายงานแสดงเฉพาะทีมงานหลังบ้าน</p>
              <div className="kru-admin-tablist" role="tablist" aria-label="เลือกประเภทรายการตรวจสอบ">
                <button id="admin-reviews-tab" type="button" role="tab" aria-controls="admin-reviews-panel" aria-selected={moderationTab === "reviews"} className={moderationTab === "reviews" ? "is-active" : ""} onClick={() => { setModerationTab("reviews"); void refreshAdminQueues(); }}>
                  รีวิว ({reviewTotal})
                </button>
                <button id="admin-reports-tab" type="button" role="tab" aria-controls="admin-reports-panel" aria-selected={moderationTab === "reports"} className={moderationTab === "reports" ? "is-active" : ""} onClick={() => { setModerationTab("reports"); void refreshAdminQueues(); }}>
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
                          <div className="kru-admin-resource-badges">
                            {review.moderation_status === "pending" && <Badge tone="brand">ใหม่</Badge>}
                            <Badge tone={review.moderation_status === "visible" ? "success" : review.moderation_status === "pending" ? "warning" : "neutral"}>
                              {review.moderation_status === "visible" ? "แสดงอยู่" : review.moderation_status === "pending" ? "รอตรวจสอบ" : "ซ่อนแล้ว"}
                            </Badge>
                          </div>
                        </div>
                        <div aria-label={`${review.rating} ดาว`} className="kru-admin-review-stars">{"★".repeat(review.rating)}{"☆".repeat(Math.max(0, 5 - review.rating))}</div>
                        <p className="kru-admin-review-body">{review.body}</p>
                        <div className="kru-admin-card-actions">
                          <Button size="sm" variant="soft" icon={review.moderation_status === "visible" ? EyeOff : Eye} disabled={pendingAction !== null || queueRefreshError !== null} loading={pendingAction === `review:${review.id}`} onClick={() => handleReviewVisibility(review)}>
                            {review.moderation_status === "visible" ? "ซ่อนรีวิว" : "แสดงรีวิว"}
                          </Button>
                          <Button size="sm" variant="ghost" icon={Trash2} disabled={pendingAction !== null || queueRefreshError !== null} onClick={() => handleDeleteReview(review)}>
                            ลบรีวิว
                          </Button>
                        </div>
                      </article>
                    ))}
                    {reviewTotal > MODERATION_PAGE_SIZE && (
                      <div className="kru-admin-pagination" aria-label="เปลี่ยนหน้ารีวิว">
                        <Button size="sm" variant="ghost" disabled={reviewPage === 0 || pendingAction !== null || queueRefreshError !== null} onClick={() => void handleReviewPageChange(reviewPage - 1)}>หน้าก่อน</Button>
                        <span>หน้า {reviewPage + 1} จาก {Math.ceil(reviewTotal / MODERATION_PAGE_SIZE)}</span>
                        <Button size="sm" variant="ghost" disabled={(reviewPage + 1) * MODERATION_PAGE_SIZE >= reviewTotal || pendingAction !== null || queueRefreshError !== null} onClick={() => void handleReviewPageChange(reviewPage + 1)}>หน้าถัดไป</Button>
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
                          <div className="kru-admin-resource-badges">
                            {report.status === "pending" && <Badge tone="brand">ใหม่</Badge>}
                            <Badge tone={report.status === "resolved" ? "success" : report.status === "in_progress" ? "info" : "warning"}>{ISSUE_STATUS_LABEL[report.status]}</Badge>
                          </div>
                        </div>
                        <p><strong>{ISSUE_CATEGORY_LABEL[report.category] ?? report.category}</strong></p>
                        {report.details && <p className="kru-admin-review-body">{report.details}</p>}
                        {report.context && (
                          <p className="kru-admin-private-meta">
                            {[report.context.app_version && `เวอร์ชัน ${report.context.app_version}`, report.context.browser, report.context.os, report.context.viewport].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <label className="kru-field" style={{ maxWidth: 260 }}>
                          <span className="kru-field__label">สถานะการจัดการ</span>
                          <select className="kru-select" value={report.status} disabled={pendingAction !== null || queueRefreshError !== null} onChange={(event) => handleIssueStatus(report, event.target.value as IssueReportStatus)}>
                            <option value="pending">รอตรวจสอบ</option>
                            <option value="in_progress">กำลังแก้ไข</option>
                            <option value="resolved">แก้ไขแล้ว</option>
                          </select>
                        </label>
                      </article>
                    ))}
                    {reportTotal > MODERATION_PAGE_SIZE && (
                      <div className="kru-admin-pagination" aria-label="เปลี่ยนหน้ารายงานปัญหา">
                        <Button size="sm" variant="ghost" disabled={reportPage === 0 || pendingAction !== null || queueRefreshError !== null} onClick={() => void handleReportPageChange(reportPage - 1)}>หน้าก่อน</Button>
                        <span>หน้า {reportPage + 1} จาก {Math.ceil(reportTotal / MODERATION_PAGE_SIZE)}</span>
                        <Button size="sm" variant="ghost" disabled={(reportPage + 1) * MODERATION_PAGE_SIZE >= reportTotal || pendingAction !== null || queueRefreshError !== null} onClick={() => void handleReportPageChange(reportPage + 1)}>หน้าถัดไป</Button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}

          {view === "benefits" && (
            <AdminPlansPanel
              plans={plans}
              benefitRows={benefitRows}
              members={members}
              subscriptionsByUser={subscriptionsByUser}
              countsAvailable={subscriptions !== null && premiumPlanIds !== null && memberDirectoryAvailable}
              benefitsAvailable={benefitDataAvailable}
              founderSeatsUsed={founderSeatsUsed}
              referenceNow={memberStatusNow}
              pendingFeatureId={pendingAction?.startsWith("benefit:") ? pendingAction.slice("benefit:".length) : null}
              dataMessage={planOverviewMessage ?? (subscriptions === null ? membershipDataError : null)}
              onSaveBenefitCopy={handleBenefitCopy}
            />
          )}

          {view === "upgrades" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>คำขออัปเกรด</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-5)", color: "var(--text-muted)" }}>จับคู่เลขอ้างอิงกับแชต LINE และตรวจยอดเงินเข้าจริงก่อนยืนยัน</p>
              {!membershipMutationsReady && (
                <p role="alert" className="kru-admin-membership-maintenance">
                  {membershipMaintenanceMessage}
                </p>
              )}
              {membershipMutationsReady && lineSlipWorkflowReadiness !== "ready" && (
                <p role="status" className="kru-admin-membership-maintenance">
                  {MEMBERSHIP_LINE_SLIP_WORKFLOW_UNAVAILABLE_MESSAGE} รายการที่บันทึกรับสลิปไว้แล้วยังตรวจและยืนยันยอดได้ตามปกติ
                </p>
              )}
              <Input
                label="ค้นหาใบสมัคร"
                icon={Search}
                type="search"
                value={upgradeSearch}
                onChange={(event) => setUpgradeSearch(event.target.value)}
                placeholder="เลขอ้างอิง ชื่อ หรืออีเมล"
                containerClassName="kru-admin-upgrade-search"
              />
              {!membershipMutationsReady ? null : upgradeRequests.length === 0 ? (
                <EmptyState icon={Wallet} title="ยังไม่มีคำขออัปเกรด" description="" />
              ) : filteredUpgradeRequests.length === 0 ? (
                <EmptyState icon={Search} title="ไม่พบใบสมัคร" description="ลองค้นหาด้วยเลขอ้างอิง ชื่อ หรืออีเมลอื่น" />
              ) : (
                <div className="kru-admin-card-list">
                  {filteredUpgradeRequests.map((r) => (
                    <div key={r.id} className="kru-card kru-admin-request-card">
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div className="kru-admin-section-heading">
                          <div style={{ fontWeight: "var(--fw-semibold)" }}>{r.profiles?.full_name || r.profiles?.email || "(ไม่พบข้อมูลผู้ใช้)"}</div>
                          <div className="kru-admin-resource-badges">
                            {isActionableUpgradeRequest(r) && <Badge tone="brand">ใหม่</Badge>}
                            <Badge tone={r.status === "approved" ? "success" : r.status === "declined" ? "neutral" : r.line_slip_received_at ? "info" : "warning"}>
                              {adminMembershipApplicationStatusLabel(r.status, r.resolution_reason_code, r.line_slip_received_at)}
                            </Badge>
                          </div>
                        </div>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--text-muted)" }}>
                          {r.profiles?.email} · ขออัปเกรดเป็น <strong>{planDisplayName(r.plan_id)}</strong> · {new Date(r.created_at).toLocaleDateString("th-TH")}
                        </div>
                        <dl className="kru-admin-payment-summary">
                          <div><dt>เลขอ้างอิงใบสมัคร</dt><dd className="kru-admin-reference">{r.reference_code || "—"}</dd></div>
                          <div><dt>ยอดตามใบสมัคร</dt><dd>{Number(r.quoted_amount_thb).toLocaleString("th-TH")} บาท</dd></div>
                          <div><dt>ทีมงานบันทึกรับสลิปจาก LINE</dt><dd>{r.line_slip_received_at ? new Date(r.line_slip_received_at).toLocaleString("th-TH") : "ยังไม่บันทึก"}</dd></div>
                          {r.payment_reported_at && !r.line_slip_received_at && (
                            <div><dt>สถานะแจ้งชำระจากระบบเดิม</dt><dd>{new Date(r.payment_reported_at).toLocaleString("th-TH")} · ยังไม่ถือว่าทีมงานรับสลิป</dd></div>
                          )}
                          <div><dt>รับชำระเมื่อ</dt><dd>{r.payment_paid_at ? new Date(r.payment_paid_at).toLocaleString("th-TH") : "ยังไม่บันทึก"}</dd></div>
                          <div><dt>อ้างอิงการชำระ</dt><dd>{r.payment_reference || "ยังไม่บันทึก"}</dd></div>
                          {r.payment_confirmed_at && (
                            <div><dt>ยืนยันในระบบ</dt><dd>{new Date(r.payment_confirmed_at).toLocaleString("th-TH")} · {(r.payment_confirmed_amount_thb ?? r.quoted_amount_thb).toLocaleString("th-TH")} บาท</dd></div>
                          )}
                        </dl>
                      </div>
                      {r.status === "pending" ? (
                        <div className="kru-admin-card-actions">
                          {r.line_slip_received_at ? (
                            <Button size="sm" icon={Check} disabled={!membershipMutationsReady || mutationBusy || queueRefreshError !== null} loading={pendingAction === `payment:${r.id}`} onClick={() => handleApproveUpgrade(r)}>
                              ยืนยันรับเงินจริง {Number(r.quoted_amount_thb).toLocaleString("th-TH")} บาท
                            </Button>
                          ) : (
                            <Button size="sm" variant="soft" icon={MessageCircle} disabled={!membershipMutationsReady || lineSlipWorkflowReadiness !== "ready" || mutationBusy || queueRefreshError !== null} loading={pendingAction === `slip:${r.id}`} onClick={() => void handleRecordLineSlip(r)}>
                              บันทึกรับสลิปจาก LINE
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" icon={X} disabled={!membershipMutationsReady || mutationBusy || queueRefreshError !== null} onClick={() => handleDeclineUpgrade(r)}>
                            ปฏิเสธ
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "requests" && (
            <div>
              <h1 style={{ fontSize: "var(--fs-30)" }}>คำขอจากครู</h1>
              <p style={{ margin: "var(--sp-3) 0 var(--sp-7)", color: "var(--text-muted)" }}>แสดงคำขอใหม่ก่อน แล้วเรียงตามจำนวนโหวตในแต่ละสถานะ</p>
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
                      <div className="kru-admin-resource-badges">
                        {r.status === "pending" && <Badge tone="brand">ใหม่</Badge>}
                        <Badge tone={REQUEST_TONE[r.status]}>{REQUEST_LABEL[r.status]}</Badge>
                      </div>
                      <select
                        className="kru-select"
                        aria-label={`สถานะคำขอ ${r.title}`}
                        style={{ minHeight: 44, width: "auto" }}
                        value={r.status}
                        disabled={pendingAction !== null || queueRefreshError !== null}
                        onChange={(e) => handleRequestStatusChange(r, e.target.value as AdminRequest["status"])}
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
            <AdminMembersPanel
              members={members}
              subscriptions={subscriptions}
              subscriptionsByUser={subscriptionsByUser}
              plans={plans}
              premiumPlanIds={premiumPlanIds}
              founderSeatsUsed={founderSeatsUsed}
              membershipDataError={membershipDataError}
              membershipMutationsReady={membershipMutationsReady}
              mutationBusy={mutationBusy}
              isOwner={isOwner}
              adminId={adminId}
              referenceNow={memberStatusNow}
              onMemberPlanChange={(id, currentPlan, nextPlan, subscription) => {
                void handleMemberPlanChange(id, currentPlan, nextPlan, subscription);
              }}
              onRenewSubscription={handleRenewSubscription}
              onRoleChange={handleMemberRoleChange}
            />
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
                        const displayValue = (v: string | null) => (v == null ? "—" : entry.field === "role" ? (ROLE_LABEL[v as AdminMemberRole] ?? v) : v);
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
      {paymentTarget && (
        <div className="kru-admin-dialog-layer">
          <button type="button" className="kru-admin-dialog-scrim" aria-label="ปิดหน้าต่างยืนยันการชำระ" onClick={closePaymentConfirmation} disabled={pendingAction !== null} />
          <section ref={paymentDialogRef} tabIndex={-1} className="kru-card kru-admin-payment-dialog" role="dialog" aria-modal="true" aria-labelledby="payment-confirmation-title" aria-describedby="payment-confirmation-description">
            <form onSubmit={(event) => void handleConfirmPayment(event)}>
              <div>
                <span className="kru-admin-dialog-eyebrow">ยืนยันด้วยมือ</span>
                <h2 id="payment-confirmation-title">ยืนยันรับเงินจริง</h2>
                <p id="payment-confirmation-description">ตรวจบัญชีรับเงินและจับคู่กับเลขอ้างอิงก่อนยืนยัน การกดครั้งนี้จะออกสิทธิ์สมาชิกทันที</p>
              </div>
              <dl className="kru-admin-payment-dialog__summary">
                <div><dt>รายการ</dt><dd>{paymentTarget.title}</dd></div>
                {paymentTarget.kind === "application" && <div><dt>เลขอ้างอิงใบสมัคร</dt><dd className="kru-admin-reference">{paymentTarget.request.reference_code}</dd></div>}
                <div><dt>ยอดที่ต้องตรวจ</dt><dd><strong>{paymentTarget.amountThb.toLocaleString("th-TH")} บาท</strong></dd></div>
                {confirmsFounderApplication && (
                  <>
                    <div><dt>Founder ปัจจุบัน</dt><dd>{founderCapacityRefreshing ? "กำลังตรวจสอบ…" : founderSeatsUsed === null ? "ตรวจสอบไม่ได้" : `${founderSeatsUsed}/${FOUNDER_CAPACITY_LIMIT}`}</dd></div>
                    <div><dt>หลังยืนยันรายการนี้</dt><dd>{founderCapacityRefreshing ? "กำลังคำนวณ…" : projectedFounderSeats === null ? "คำนวณไม่ได้" : `${projectedFounderSeats}/${FOUNDER_CAPACITY_LIMIT}`}</dd></div>
                  </>
                )}
              </dl>
              {founderCapacityUnavailable && !founderCapacityRefreshing && (
                <div className="kru-admin-capacity-retry" role="alert">
                  <span>ยังตรวจสอบจำนวน Founder ปัจจุบันไม่ได้ จึงปิดการยืนยันชั่วคราว</span>
                  <Button type="button" variant="ghost" onClick={() => void refreshFounderCapacityForPayment()}>ลองตรวจสอบอีกครั้ง</Button>
                </div>
              )}
              {founderCapacityFull && <p className="kru-admin-payment-error" role="alert">Founder ครบ {FOUNDER_CAPACITY_LIMIT} สิทธิ์แล้ว รายการนี้ยืนยันไม่ได้</p>}
              {queueRefreshError && <p className="kru-admin-payment-error" role="alert">รายการหลังบ้านไม่ใช่ข้อมูลล่าสุด ปิดการยืนยันชั่วคราว</p>}
              <Input
                label="เลขอ้างอิงการชำระ"
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="เช่น เลขธุรกรรม/รหัสจากรายการเงินเข้า"
                autoComplete="off"
                maxLength={120}
                required
                disabled={pendingAction !== null || founderConfirmationBlocked || queueRefreshError !== null}
              />
              <Input
                label="วันและเวลาที่รับชำระ"
                type="datetime-local"
                value={paymentPaidAt}
                onChange={(event) => setPaymentPaidAt(event.target.value)}
                required
                disabled={pendingAction !== null || founderConfirmationBlocked || queueRefreshError !== null}
              />
              <label className="kru-admin-payment-check">
                <input type="checkbox" checked={paymentVerified} onChange={(event) => setPaymentVerified(event.target.checked)} disabled={pendingAction !== null || founderConfirmationBlocked || queueRefreshError !== null} />
                <span>ฉันตรวจแล้วว่ายอด {paymentTarget.amountThb.toLocaleString("th-TH")} บาทเข้าจริง และข้อมูลตรงกับรายการนี้</span>
              </label>
              {paymentError && <p className="kru-admin-payment-error" role="alert">{paymentError}</p>}
              <div className="kru-admin-dialog-actions">
                <Button type="button" variant="ghost" onClick={closePaymentConfirmation} disabled={pendingAction !== null}>ยกเลิก</Button>
                <Button type="submit" icon={Check} loading={pendingAction !== null} disabled={pendingAction !== null || !paymentVerified || founderConfirmationBlocked || queueRefreshError !== null}>
                  ยืนยันรับเงิน {paymentTarget.amountThb.toLocaleString("th-TH")} บาท
                </Button>
              </div>
            </form>
          </section>
        </div>
      )}
      <style>{`
        .kru-admin-shell { display: flex; min-height: 100dvh; max-width: 100%; }
        .kru-admin-queue-error { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; margin-bottom: var(--sp-5); padding: var(--sp-4); border: 1px solid var(--border-default); border-radius: var(--r-md); background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-admin-refresh-row { display: flex; justify-content: flex-end; margin-bottom: var(--sp-4); }
        .kru-admin-payment-success { margin-bottom: var(--sp-5); padding: var(--sp-5); display: grid; gap: var(--sp-3); border: 1px solid color-mix(in srgb, var(--status-success-fg) 28%, transparent); border-radius: var(--r-card); background: var(--status-success-bg); color: var(--status-success-fg); }
        .kru-admin-payment-success > div { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
        .kru-admin-payment-success > div button { min-width: 44px; min-height: 44px; display: inline-grid; place-items: center; border: 0; border-radius: var(--r-pill); background: transparent; color: inherit; cursor: pointer; }
        .kru-admin-payment-success textarea { width: 100%; min-height: 88px; padding: var(--sp-3); resize: vertical; border: 1px solid var(--border-default); border-radius: var(--r-md); background: var(--surface-card); color: var(--text-strong); font: inherit; line-height: 1.6; }
        .kru-admin-payment-success > :global(.kru-btn) { width: fit-content; }
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
        .kru-admin-membership-maintenance { max-width: 920px; margin: 0 0 var(--sp-5); padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-warning-bg); color: var(--status-warning-fg); overflow-wrap: anywhere; }
        .kru-admin-upgrade-search { max-width: 520px; margin-bottom: var(--sp-6); }
        .kru-admin-payment-summary { margin: var(--sp-3) 0 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: var(--sp-2) var(--sp-5); }
        .kru-admin-payment-summary div { min-width: 0; }
        .kru-admin-payment-summary dt { color: var(--text-faint); font-size: var(--fs-12); }
        .kru-admin-payment-summary dd { margin: 2px 0 0; color: var(--text-body); font-size: var(--fs-13); overflow-wrap: anywhere; }
        .kru-admin-reference { font-family: var(--font-mono); font-weight: var(--fw-semibold); letter-spacing: .03em; }
        .kru-admin-dialog-layer { position: fixed; inset: 0; z-index: 200; display: grid; place-items: center; padding: max(var(--sp-4), env(safe-area-inset-top)) max(var(--sp-4), env(safe-area-inset-right)) max(var(--sp-4), env(safe-area-inset-bottom)) max(var(--sp-4), env(safe-area-inset-left)); }
        .kru-admin-dialog-scrim { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: rgba(18, 12, 29, .58); }
        .kru-admin-payment-dialog { position: relative; width: min(100%, 560px); max-height: calc(100dvh - 32px); overflow-y: auto; padding: clamp(20px, 5vw, 32px); }
        .kru-admin-payment-dialog form { display: grid; gap: var(--sp-5); }
        .kru-admin-payment-dialog h2 { margin-top: var(--sp-2); font-size: var(--fs-24); }
        .kru-admin-payment-dialog p { margin-top: var(--sp-2); color: var(--text-muted); font-size: var(--fs-14); }
        .kru-admin-dialog-eyebrow { color: var(--purple-700); font-size: var(--fs-13); font-weight: var(--fw-bold); }
        .kru-admin-payment-dialog__summary { margin: 0; padding: var(--sp-4); display: grid; gap: var(--sp-3); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-admin-payment-dialog__summary div { display: flex; justify-content: space-between; align-items: baseline; gap: var(--sp-4); }
        .kru-admin-payment-dialog__summary dt { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-admin-payment-dialog__summary dd { min-width: 0; margin: 0; text-align: right; overflow-wrap: anywhere; }
        .kru-admin-payment-check { min-height: 48px; padding: var(--sp-3); display: flex; align-items: flex-start; gap: var(--sp-3); border: 1px solid var(--border-brand); border-radius: var(--r-md); background: var(--purple-50); cursor: pointer; }
        .kru-admin-payment-check input { width: 20px; height: 20px; margin-top: 2px; flex: 0 0 auto; accent-color: var(--brand); }
        .kru-admin-payment-check span { font-size: var(--fs-14); line-height: 1.55; }
        .kru-admin-payment-error { margin: 0 !important; padding: var(--sp-3); border-radius: var(--r-md); background: var(--status-danger-bg); color: var(--status-danger-fg) !important; }
        .kru-admin-capacity-retry { padding: var(--sp-3); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; border-radius: var(--r-md); background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-admin-dialog-actions { display: flex; justify-content: flex-end; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-admin-dialog-actions .kru-btn { flex: 1 1 180px; }
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
