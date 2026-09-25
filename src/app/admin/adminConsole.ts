export type AdminView = "dash" | "content" | "requests" | "moderation" | "upgrades" | "members" | "benefits" | "audit";

export type ResourceAccessMode = "public" | "authenticated" | "plans" | "locked";

export type IssueReportStatus = "pending" | "in_progress" | "resolved";

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
