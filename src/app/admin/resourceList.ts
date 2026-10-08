import { resourceGradeProblem } from "@/lib/resourceGrades";

/**
 * Pure helpers behind the admin "จัดการสื่อ" list: searching, the status chips and the
 * "needs a look" flags. No database or React here, so they are easy to test.
 */

export type AdminResourceStatus = "draft" | "published" | "archived";

export interface AdminResourceListItem {
  id: string;
  title: string;
  meta: string | null;
  status: AdminResourceStatus;
  grade_levels?: string[] | null;
  /** undefined = the column could not be read (before migration 055); null = no slug yet. */
  slug?: string | null;
}

export type ResourceStatusFilter = "all" | AdminResourceStatus | "attention";

export type ResourceAttention = "grade" | "slug";

export const ATTENTION_LABEL: Record<ResourceAttention, string> = {
  grade: "ยังไม่ระบุระดับชั้น",
  slug: "ยังไม่มี slug (ใช้ลิงก์แบบรหัสยาว)",
};

/** What is missing on a published resource. Drafts and archived ones are not flagged. */
export function resourceAttention(item: AdminResourceListItem): ResourceAttention[] {
  if (item.status !== "published") return [];
  const flags: ResourceAttention[] = [];
  if (resourceGradeProblem(item.grade_levels)) flags.push("grade");
  if (item.slug === null) flags.push("slug");
  return flags;
}

/** Lower-cased, whitespace-collapsed text used for matching; Thai has no case, so only spaces matter. */
export function normalizeSearch(text: string | null | undefined): string {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

export function matchesQuery(item: AdminResourceListItem, query: string): boolean {
  const needle = normalizeSearch(query);
  if (!needle) return true;
  const haystack = normalizeSearch(`${item.title} ${item.meta ?? ""} ${item.slug ?? ""}`);
  // Every word typed must appear somewhere ("ภาษา อังกฤษ" finds a title with both).
  return needle.split(" ").every((word) => haystack.includes(word));
}

export function filterResources<T extends AdminResourceListItem>(
  items: readonly T[],
  { query = "", status = "all" }: { query?: string; status?: ResourceStatusFilter },
): T[] {
  return items.filter((item) => {
    if (status === "attention") {
      if (resourceAttention(item).length === 0) return false;
    } else if (status !== "all" && item.status !== status) {
      return false;
    }
    return matchesQuery(item, query);
  });
}

export function statusCounts(items: readonly AdminResourceListItem[]): Record<ResourceStatusFilter, number> {
  const counts: Record<ResourceStatusFilter, number> = { all: items.length, draft: 0, published: 0, archived: 0, attention: 0 };
  for (const item of items) {
    counts[item.status] += 1;
    if (resourceAttention(item).length > 0) counts.attention += 1;
  }
  return counts;
}

export const STATUS_FILTER_LABEL: Record<ResourceStatusFilter, string> = {
  all: "ทั้งหมด",
  published: "เผยแพร่แล้ว",
  draft: "ฉบับร่าง",
  archived: "เก็บถาวร",
  attention: "ต้องตรวจ",
};

/** Order the chips are shown in. */
export const STATUS_FILTER_ORDER: readonly ResourceStatusFilter[] = ["all", "published", "draft", "archived", "attention"];
