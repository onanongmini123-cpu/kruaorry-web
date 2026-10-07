import { absoluteUrl } from "@/lib/site";
export type AdminView = "dash" | "content" | "requests" | "moderation" | "upgrades" | "members" | "benefits" | "audit";

export type ResourceAccessMode = "public" | "authenticated" | "plans" | "locked";

export type IssueReportStatus = "pending" | "in_progress" | "resolved";

interface DatedAdminRow {
  id: string;
  created_at: string;
}

interface AdminRequestOrderRow extends DatedAdminRow {
  status: "pending" | "in_progress" | "done";
  votes: number;
}

interface AdminReviewOrderRow extends DatedAdminRow {
  moderation_status: "pending" | "visible" | "hidden";
}

interface AdminReportOrderRow extends DatedAdminRow {
  status: IssueReportStatus;
}

interface AdminUpgradeOrderRow extends DatedAdminRow {
  status: "pending" | "approved" | "declined";
  payment_reported_at: string | null;
  line_slip_received_at: string | null;
}

interface AdminUpgradeSearchRow {
  reference_code: string;
  profiles: { full_name: string | null; email: string } | null;
}

export const MEMBER_APP_URL = absoluteUrl("/app");

export function adminPaymentSuccessMessage(
  payment: { kind: "application" | "renewal"; amountThb: number; referenceCode?: string },
): string {
  const paymentDetail = payment.kind === "application" && payment.referenceCode
    ? `เลขอ้างอิง ${payment.referenceCode} · ยอด ${payment.amountThb.toLocaleString("th-TH")} บาท`
    : `ต่ออายุสมาชิก · ยอด ${payment.amountThb.toLocaleString("th-TH")} บาท`;
  return `ชำระเงินสำเร็จแล้วค่ะ 🎉 เปิดใช้งานแพ็กเกจเรียบร้อยแล้ว กดด้านล่างเพื่อเข้าใช้งาน\nเข้าใช้งาน KruAorry Web\n${MEMBER_APP_URL}\n\n${paymentDetail}`;
}

export function matchesAdminUpgradeSearch(request: AdminUpgradeSearchRow, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase("th-TH");
  if (!normalizedQuery) return true;
  return [request.reference_code, request.profiles?.full_name, request.profiles?.email]
    .some((value) => value?.toLocaleLowerCase("th-TH").includes(normalizedQuery));
}

export function includesAdminLineSlipProvenance(
  readiness: "checking" | "ready" | "unavailable",
): boolean {
  return readiness === "ready";
}

export interface PriorityPageSlice {
  groupIndex: number;
  from: number;
  to: number;
}

export const ADMIN_ACTION_REFRESH_TIMEOUT_MS = 10_000;

export interface AdminActionCounts {
  requests: number | null;
  moderation: number | null;
  upgrades: number | null;
}

export const EMPTY_ADMIN_ACTION_COUNTS: AdminActionCounts = {
  requests: null,
  moderation: null,
  upgrades: null,
};

export type AdminRefreshFailure = {
  error: unknown;
  timedOut: boolean;
};

export interface CoalescedAdminRefresh {
  request(): Promise<boolean>;
  dispose(): void;
}

/**
 * Runs at most one admin queue read at a time. Calls received while a read is
 * active are coalesced into one immediate follow-up read, so a slow refresh
 * cannot overlap another read or starve a later focus/action refresh. Only the
 * newest requested snapshot is applied. A timeout aborts PostgREST requests
 * that honour AbortSignal and releases every caller with a failed result.
 */
export function createCoalescedAdminRefresh<T>(
  load: (signal: AbortSignal) => Promise<T>,
  apply: (value: T) => void,
  onFailure: (failure: AdminRefreshFailure) => void,
  timeoutMs = ADMIN_ACTION_REFRESH_TIMEOUT_MS,
): CoalescedAdminRefresh {
  let disposed = false;
  let running = false;
  let requestedGeneration = 0;
  let settledGeneration = 0;
  let activeController: AbortController | null = null;
  const waiters: Array<{ generation: number; resolve: (applied: boolean) => void }> = [];

  const settleThrough = (generation: number, applied: boolean) => {
    settledGeneration = generation;
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      if (waiters[index].generation <= generation) {
        const [{ resolve }] = waiters.splice(index, 1);
        resolve(applied);
      }
    }
  };

  const drain = async () => {
    if (running || disposed) return;
    running = true;
    try {
      while (!disposed && settledGeneration < requestedGeneration) {
        const generation = requestedGeneration;
        const controller = new AbortController();
        activeController = controller;
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<{ ok: false; failure: AdminRefreshFailure }>((resolve) => {
          timeoutId = setTimeout(() => {
            resolve({
              ok: false,
              failure: {
                error: new Error(`Admin queue refresh timed out after ${timeoutMs}ms`),
                timedOut: true,
              },
            });
            controller.abort();
          }, timeoutMs);
        });

        const result = await Promise.race([
          load(controller.signal).then(
            (value) => ({ ok: true as const, value }),
            (error) => ({ ok: false as const, failure: { error, timedOut: false } }),
          ),
          timeout,
        ]);
        clearTimeout(timeoutId);
        if (activeController === controller) activeController = null;
        if (disposed) return;

        // A newer focus/menu/action request arrived while this snapshot was
        // loading. Do not flash stale counts or rows; run the queued refresh.
        if (generation !== requestedGeneration) continue;

        if (result.ok) {
          apply(result.value);
          settleThrough(generation, true);
        } else {
          onFailure(result.failure);
          settleThrough(generation, false);
        }
      }
    } finally {
      running = false;
      if (!disposed && settledGeneration < requestedGeneration) void drain();
    }
  };

  return {
    request() {
      if (disposed) return Promise.resolve(false);
      const generation = ++requestedGeneration;
      const result = new Promise<boolean>((resolve) => {
        waiters.push({ generation, resolve });
      });
      void drain();
      return result;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      activeController?.abort();
      activeController = null;
      while (waiters.length > 0) waiters.shift()?.resolve(false);
    },
  };
}

export interface AdminActionRefreshTarget {
  addEventListener(type: "focus", listener: () => void): void;
  removeEventListener(type: "focus", listener: () => void): void;
}

export function installAdminActionRefresh(
  target: AdminActionRefreshTarget,
  refresh: () => void,
  enabled: boolean,
): () => void {
  if (!enabled) return () => undefined;

  refresh();
  target.addEventListener("focus", refresh);

  return () => {
    target.removeEventListener("focus", refresh);
  };
}

export function sameAdminRequestVersion(
  rendered: Pick<AdminRequestOrderRow, "id" | "status">,
  latest: Pick<AdminRequestOrderRow, "id" | "status">,
): boolean {
  return rendered.id === latest.id && rendered.status === latest.status;
}

export function sameAdminReviewVersion(
  rendered: Pick<AdminReviewOrderRow, "id" | "moderation_status"> & { updated_at: string },
  latest: Pick<AdminReviewOrderRow, "id" | "moderation_status"> & { updated_at: string },
): boolean {
  return rendered.id === latest.id
    && rendered.moderation_status === latest.moderation_status
    && rendered.updated_at === latest.updated_at;
}

export function sameAdminReportVersion(
  rendered: Pick<AdminReportOrderRow, "id" | "status"> & { updated_at: string },
  latest: Pick<AdminReportOrderRow, "id" | "status"> & { updated_at: string },
): boolean {
  return rendered.id === latest.id
    && rendered.status === latest.status
    && rendered.updated_at === latest.updated_at;
}

export function sameAdminUpgradeVersion(
  rendered: Pick<AdminUpgradeOrderRow, "id" | "status" | "payment_reported_at" | "line_slip_received_at"> & { plan_id: string; quoted_amount_thb: number },
  latest: Pick<AdminUpgradeOrderRow, "id" | "status" | "payment_reported_at" | "line_slip_received_at"> & { plan_id: string; quoted_amount_thb: number },
): boolean {
  return rendered.id === latest.id
    && rendered.status === latest.status
    && rendered.payment_reported_at === latest.payment_reported_at
    && rendered.line_slip_received_at === latest.line_slip_received_at
    && rendered.plan_id === latest.plan_id
    && rendered.quoted_amount_thb === latest.quoted_amount_thb;
}

export function sameAdminSubscriptionVersion(
  rendered: { id: string; plan_id: string; status: string; current_period_end: string | null },
  latest: { id: string; plan_id: string; status: string; current_period_end: string | null },
): boolean {
  return rendered.id === latest.id
    && rendered.plan_id === latest.plan_id
    && rendered.status === latest.status
    && rendered.current_period_end === latest.current_period_end;
}

export function priorityPageSlices(groupCounts: number[], page: number, pageSize: number): PriorityPageSlice[] {
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(pageSize) || pageSize <= 0) return [];
  const pageStart = page * pageSize;
  const pageEnd = pageStart + pageSize;
  const slices: PriorityPageSlice[] = [];
  let groupStart = 0;

  groupCounts.forEach((rawCount, groupIndex) => {
    const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 0;
    const groupEnd = groupStart + count;
    const overlapStart = Math.max(pageStart, groupStart);
    const overlapEnd = Math.min(pageEnd, groupEnd);
    if (overlapStart < overlapEnd) {
      slices.push({
        groupIndex,
        from: overlapStart - groupStart,
        to: overlapEnd - groupStart - 1,
      });
    }
    groupStart = groupEnd;
  });

  return slices;
}

function newestFirst(left: DatedAdminRow, right: DatedAdminRow): number {
  const dateDifference = Date.parse(right.created_at) - Date.parse(left.created_at);
  return Number.isFinite(dateDifference) && dateDifference !== 0
    ? dateDifference
    : right.id.localeCompare(left.id);
}

export function isActionableUpgradeRequest(request: Pick<AdminUpgradeOrderRow, "status" | "line_slip_received_at">): boolean {
  return request.status === "pending" && Boolean(request.line_slip_received_at);
}

export function sortAdminRequests<T extends AdminRequestOrderRow>(rows: T[]): T[] {
  const rank: Record<AdminRequestOrderRow["status"], number> = { pending: 0, in_progress: 1, done: 2 };
  return [...rows].sort((left, right) => {
    const statusDifference = rank[left.status] - rank[right.status];
    if (statusDifference !== 0) return statusDifference;
    const voteDifference = right.votes - left.votes;
    return voteDifference !== 0 ? voteDifference : newestFirst(left, right);
  });
}

export function sortAdminReviews<T extends AdminReviewOrderRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const actionableDifference = Number(right.moderation_status === "pending") - Number(left.moderation_status === "pending");
    return actionableDifference !== 0 ? actionableDifference : newestFirst(left, right);
  });
}

export function sortAdminReports<T extends AdminReportOrderRow>(rows: T[]): T[] {
  const rank: Record<IssueReportStatus, number> = { pending: 0, in_progress: 1, resolved: 2 };
  return [...rows].sort((left, right) => {
    const statusDifference = rank[left.status] - rank[right.status];
    return statusDifference !== 0 ? statusDifference : newestFirst(left, right);
  });
}

export function sortAdminUpgradeRequests<T extends AdminUpgradeOrderRow>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const rank = (row: AdminUpgradeOrderRow) => isActionableUpgradeRequest(row) ? 0 : row.status === "pending" ? 1 : 2;
    const statusDifference = rank(left) - rank(right);
    return statusDifference !== 0 ? statusDifference : newestFirst(left, right);
  });
}

const COMMON_VIEWS = new Set<AdminView>([
  "dash",
  "content",
  "requests",
  "moderation",
  "upgrades",
  "members",
  "benefits",
]);

export function parseAdminView(value: string | null, isOwner: boolean): AdminView {
  if (value === "audit") return isOwner ? "audit" : "dash";
  return value && COMMON_VIEWS.has(value as AdminView) ? value as AdminView : "dash";
}

export function adminViewHref(view: AdminView): string {
  return view === "dash" ? "/admin" : `/admin?view=${encodeURIComponent(view)}`;
}

export const ACCESS_MODE_LABEL: Record<ResourceAccessMode, string> = {
  public: "ฟรีทุกคน",
  authenticated: "สมาชิก",
  plans: "เฉพาะแพ็ก",
  locked: "ล็อก",
};

export function resourceAccessLabel(mode: ResourceAccessMode, planNames: string[]): string {
  if (mode !== "plans") return ACCESS_MODE_LABEL[mode];
  return planNames.length > 0 ? planNames.join(", ") : "เฉพาะแพ็ก (ยังไม่เลือก)";
}

export function toggleFeaturedResource(ids: string[], id: string, checked: boolean, limit = 5): string[] {
  if (!checked) return ids.filter((value) => value !== id);
  if (ids.includes(id) || ids.length >= limit) return ids;
  return [...ids, id];
}

export function moveFeaturedResource(ids: string[], id: string, direction: -1 | 1): string[] {
  const index = ids.indexOf(id);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= ids.length) return ids;
  const next = [...ids];
  [next[index], next[destination]] = [next[destination], next[index]];
  return next;
}

export const ISSUE_STATUS_LABEL: Record<IssueReportStatus, string> = {
  pending: "รอตรวจสอบ",
  in_progress: "กำลังแก้ไข",
  resolved: "แก้ไขแล้ว",
};

export const ISSUE_CATEGORY_LABEL: Record<string, string> = {
  cannot_open: "เปิดไม่ได้",
  broken_link: "ลิงก์เสีย",
  cannot_download: "ดาวน์โหลดไม่ได้",
  wrong_content: "เนื้อหาผิด",
  wrong_answer: "เฉลยผิด",
  cannot_play: "เล่นไม่ได้",
  no_sound: "เสียงไม่ออก",
  camera_issue: "กล้องไม่ทำงาน",
  mobile_layout: "มือถือแสดงผลผิด",
  other: "อื่น ๆ",
};
