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
}

export interface PriorityPageSlice {
  groupIndex: number;
  from: number;
  to: number;
}

export const ADMIN_ACTION_REFRESH_INTERVAL_MS = 30_000;

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

interface AdminActionCountQueryResult {
  count: number | null;
  error: unknown;
}

export interface AdminActionCountQueries {
  requests: () => PromiseLike<AdminActionCountQueryResult>;
  reviews: () => PromiseLike<AdminActionCountQueryResult>;
  reports: () => PromiseLike<AdminActionCountQueryResult>;
  upgrades: () => PromiseLike<AdminActionCountQueryResult>;
}

async function runAdminActionCountQuery(
  query: () => PromiseLike<AdminActionCountQueryResult>,
): Promise<AdminActionCountQueryResult> {
  try {
    return await query();
  } catch (error) {
    return { count: null, error };
  }
}

export async function loadAdminActionCounts(
  queries: AdminActionCountQueries,
  includeUpgrades: boolean,
): Promise<AdminActionCounts> {
  const [requestResult, reviewResult, reportResult, upgradeResult] = await Promise.all([
    runAdminActionCountQuery(queries.requests),
    runAdminActionCountQuery(queries.reviews),
    runAdminActionCountQuery(queries.reports),
    includeUpgrades
      ? runAdminActionCountQuery(queries.upgrades)
      : Promise.resolve({ count: null, error: null }),
  ]);

  return {
    requests: requestResult.error ? null : requestResult.count ?? 0,
    moderation: reviewResult.error || reportResult.error
      ? null
      : (reviewResult.count ?? 0) + (reportResult.count ?? 0),
    upgrades: !includeUpgrades || upgradeResult.error
      ? null
      : upgradeResult.count ?? 0,
  };
}

export interface LatestAdminActionCountRefresh {
  refresh(): Promise<boolean>;
  dispose(): void;
}

export function createLatestAdminActionCountRefresh(
  load: () => Promise<AdminActionCounts>,
  apply: (counts: AdminActionCounts) => void,
): LatestAdminActionCountRefresh {
  let latestRequest = 0;
  let active = true;

  return {
    async refresh() {
      const request = ++latestRequest;
      const counts = await load();
      if (!active || request !== latestRequest) return false;
      apply(counts);
      return true;
    },
    dispose() {
      active = false;
      latestRequest += 1;
    },
  };
}

export interface AdminActionRefreshTarget {
  addEventListener(type: "focus", listener: () => void): void;
  removeEventListener(type: "focus", listener: () => void): void;
  setInterval(handler: () => void, timeout: number): number;
  clearInterval(id: number): void;
}

export function installAdminActionRefresh(
  target: AdminActionRefreshTarget,
  refresh: () => void,
  enabled: boolean,
  intervalMs = ADMIN_ACTION_REFRESH_INTERVAL_MS,
): () => void {
  if (!enabled) return () => undefined;

  refresh();
  target.addEventListener("focus", refresh);
  const intervalId = target.setInterval(refresh, intervalMs);

  return () => {
    target.removeEventListener("focus", refresh);
    target.clearInterval(intervalId);
  };
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

export function isActionableUpgradeRequest(request: Pick<AdminUpgradeOrderRow, "status" | "payment_reported_at">): boolean {
  return request.status === "pending" && Boolean(request.payment_reported_at);
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
  other: "อื่น ๆ",
};
