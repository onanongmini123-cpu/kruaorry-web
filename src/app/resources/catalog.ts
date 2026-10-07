import { publicCoverUrl } from "@/lib/resourceVisibility";
import { canAccessResource, type EntitlementSnapshot, type ResourceAccessMode } from "@/lib/entitlement";
import { isResourceGrade, type ResourceGrade } from "@/lib/resourceGrades";
import { FREE_SIGNUP_HREF } from "@/lib/authReturnPath";
import { proUpgradeHref } from "@/lib/upgradeFlow";
import { resourceHref } from "@/lib/resourceUrl";
export { resourceHref };
import { planDisplayNames } from "@/lib/planDisplay";
import { ACCESS_TIER_LABEL } from "@/lib/resourceAccess";
import { parseDetailContent, type ResourceDetailContent } from "@/lib/resourceDetail";
import { isValidSlug } from "@/lib/resourceSlug";

export type PublicResource = {
  id: string;
  /** Stable readable URL key; null until the slug column is live and filled. */
  slug: string | null;
  title: string;
  meta: string;
  description: string;
  category: string;
  gradeLevels: ResourceGrade[];
  deliveryMode: "web_app" | "google_template" | "google_form" | "file_download";
  coverImageUrl: string | null;
  tags: string[];
  accessMode: ResourceAccessMode;
  isFree: boolean;
  isNew: boolean;
  requiredPlanIds: string[];
  requiredPlanNames: string[];
  featuredRank: number | null;
  reviewAverage: number | null;
  reviewCount: number;
  /** Optional structured teaching notes; every section hides when absent. */
  detail: ResourceDetailContent | null;
};

export interface PublicResourceViewer {
  authenticated: boolean;
  role: "member" | "admin" | "owner" | null;
  entitlements: EntitlementSnapshot;
  pendingPlanIds?: string[];
}

export interface PublicResourceAction {
  href: string;
  label: string;
  canUse: boolean;
  locked: boolean;
  opensNewTab: boolean;
}

type Row = Record<string, unknown>;

const DELIVERY_MODES = new Set<PublicResource["deliveryMode"]>([
  "web_app", "google_template", "google_form", "file_download",
]);
const ACCESS_MODES = new Set<ResourceAccessMode>(["public", "authenticated", "plans", "locked"]);

// The resource_catalog view filters unusable/private targets before these
// metadata rows reach the app. Never request a destination in public pages.
export function toPublicResource(value: unknown): PublicResource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  if (row.status !== "published") return null;
  if (typeof row.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id)) return null;
  if (typeof row.title !== "string" || !row.title.trim()) return null;
  if (!DELIVERY_MODES.has(row.delivery_mode as PublicResource["deliveryMode"])) return null;
  if (!ACCESS_MODES.has(row.access_mode as ResourceAccessMode)) return null;
  const cover = publicCoverUrl(row.cover_image_url);
  const gradeLevels = cleanStringArray(row.grade_levels, 20).filter(isResourceGrade);
  const accessMode = row.access_mode as ResourceAccessMode;
  const requiredPlanIds = accessMode === "plans" ? cleanStringArray(row.required_plan_ids, 20) : [];
  const storedPlanNames = accessMode === "plans" ? cleanStringArray(row.required_plan_names, 20) : [];
  const requiredPlanNames = accessMode === "plans" ? planDisplayNames(requiredPlanIds, storedPlanNames) : [];
  return {
    id: row.id,
    slug: isValidSlug(row.slug) ? row.slug : null,
    title: row.title.trim(),
    meta: typeof row.meta === "string" ? row.meta.trim() : "",
    description: typeof row.description === "string" ? row.description.trim() : "",
    category: typeof row.category === "string" ? row.category.trim() : "",
    gradeLevels,
    deliveryMode: row.delivery_mode as PublicResource["deliveryMode"],
    coverImageUrl: cover,
    tags: cleanStringArray(row.tags, 5),
    accessMode,
    isFree: accessMode === "public" || accessMode === "authenticated",
    isNew: row.is_new === true,
    requiredPlanIds,
    requiredPlanNames,
    featuredRank: typeof row.featured_rank === "number" ? row.featured_rank : null,
    reviewAverage: row.review_average === null || row.review_average === undefined
      ? null
      : Number(row.review_average),
    reviewCount: Number(row.review_count ?? 0),
    detail: parseDetailContent(row.detail_content),
  };
}

function cleanStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean))]
    .slice(0, limit);
}

export const PUBLIC_RESOURCE_SELECT = "id, title, meta, description, category, delivery_mode, cover_image_url, tags, is_free, status, grade_levels, access_mode, required_plan_ids, required_plan_names, is_new, featured_rank, review_average, review_count";

/**
 * Same columns plus the slug. Selecting a column that does not exist yet
 * fails the whole query, so the loader tries this first and falls back to
 * PUBLIC_RESOURCE_SELECT until the slug migration is applied.
 */
export const PUBLIC_RESOURCE_SELECT_WITH_SLUG = `${PUBLIC_RESOURCE_SELECT}, slug`;

export function signupHref(): string {
  // Account creation always lands at the member-app root. Opening a resource
  // remains a separate click whose API route rechecks current entitlement.
  return FREE_SIGNUP_HREF;
}

type UpgradeResource = Pick<PublicResource, "id" | "requiredPlanIds">;

/** Build an intentional paid-upgrade CTA without accepting an arbitrary URL. */
export function membershipUpgradeHref(
  resource: UpgradeResource,
  requestedReturnTo: string = resourceHref(resource),
): string {
  const preferredPlan = resource.requiredPlanIds.includes("founder")
    ? "founder"
    : resource.requiredPlanIds.includes("teacher")
      ? "teacher"
      : null;
  return proUpgradeHref({ planId: preferredPlan, returnTo: requestedReturnTo });
}

/** Main button wording per tier (what the resource asks of the viewer). */
export const SIGNUP_TO_USE_LABEL = "สมัครฟรีเพื่อใช้งาน";
export const USE_WITH_PRO_LABEL = "ใช้ด้วย Teacher Pro";

const ACTION_LABEL: Record<PublicResource["deliveryMode"], string> = {
  web_app: "เปิดใช้งาน",
  google_template: "ทำสำเนาไปยัง Drive ของฉัน",
  google_form: "เปิดแบบฟอร์ม",
  file_download: "ดาวน์โหลดไฟล์",
};

/**
 * Which plans unlock a resource, for explanatory copy ("ต้องใช้ Founder 100
 * หรือ Teacher Pro"). This keeps the real `requiredPlanNames`; the access
 * badge (`accessLabel`) is a separate, viewer-independent tier label. The
 * generic Teacher Pro label is only a fallback when no plan names exist.
 */
export function requiredPlansLabel(resource: PublicResource): string {
  if (resource.accessMode === "public") return ACCESS_TIER_LABEL.free;
  if (resource.accessMode === "authenticated") return ACCESS_TIER_LABEL.member;
  if (resource.accessMode === "locked") return ACCESS_TIER_LABEL.unavailable;
  return resource.requiredPlanNames.length > 0
    ? resource.requiredPlanNames.join(" หรือ ")
    : ACCESS_TIER_LABEL.pro;
}

function looksLikeGame(resource: Pick<PublicResource, "tags" | "meta">): boolean {
  return resource.tags.includes("เกม") || /เกม/.test(resource.meta);
}

/** "เริ่มเล่นฟรี" for a free game, "เปิดใช้" for tools; files and Google items keep their own verb. */
function openLabel(resource: PublicResource): string {
  if (resource.deliveryMode !== "web_app") return ACTION_LABEL[resource.deliveryMode];
  const free = resource.accessMode === "public";
  if (looksLikeGame(resource)) return free ? "เริ่มเล่นฟรี" : "เริ่มเล่น";
  return free ? "เปิดใช้ฟรี" : "เปิดใช้งาน";
}

export function publicResourceAction(resource: PublicResource, viewer: PublicResourceViewer): PublicResourceAction {
  const canUse = canAccessResource(
    {
      status: "published",
      accessMode: resource.accessMode,
      requiredPlanIds: resource.requiredPlanIds,
    },
    {
      authenticated: viewer.authenticated,
      role: viewer.role,
      planId: viewer.entitlements.planId,
    },
  );

  if (resource.accessMode === "locked" && viewer.role !== "admin" && viewer.role !== "owner") {
    return {
      href: resourceHref(resource),
      label: "ยังไม่เปิดให้ใช้งาน",
      canUse: false,
      locked: true,
      opensNewTab: false,
    };
  }

  if (!canUse && resource.accessMode === "authenticated" && !viewer.authenticated) {
    return {
      href: signupHref(),
      label: SIGNUP_TO_USE_LABEL,
      canUse: false,
      locked: true,
      opensNewTab: false,
    };
  }

  if (!canUse) {
    const upgradePending = resource.accessMode === "plans"
      && resource.requiredPlanIds.some((planId) => (viewer.pendingPlanIds ?? []).includes(planId));
    const hasSaleablePlan = resource.requiredPlanIds.some((planId) => planId === "founder" || planId === "teacher");
    return {
      href: membershipUpgradeHref(resource),
      label: upgradePending
        ? "ติดตามคำขออัปเกรด"
        : !hasSaleablePlan
          ? viewer.authenticated ? "ตรวจสอบสิทธิ์สมาชิกเดิม" : "เข้าสู่ระบบเพื่อตรวจสอบสิทธิ์เดิม"
          : USE_WITH_PRO_LABEL,
      canUse: false,
      locked: true,
      opensNewTab: false,
    };
  }

  return {
    href: resource.deliveryMode === "file_download"
      ? `/download/${resource.id}`
      : `/api/resources/${resource.id}/open`,
    label: openLabel(resource),
    canUse: true,
    locked: false,
    opensNewTab: true,
  };
}
