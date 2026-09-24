import { publicCoverUrl } from "@/lib/resourceVisibility";
import { canAccessResource, type EntitlementSnapshot } from "@/lib/entitlement";
import { isResourceGrade, type ResourceGrade } from "@/lib/resourceGrades";

export type PublicResource = {
  id: string;
  title: string;
  meta: string;
  description: string;
  category: string;
  gradeLevels: ResourceGrade[];
  deliveryMode: "web_app" | "google_template" | "google_form" | "file_download";
  coverImageUrl: string | null;
  tags: string[];
  isFree: boolean;
  requiredPlanNames: string[];
};

export interface PublicResourceViewer {
  authenticated: boolean;
  role: "member" | "admin" | "owner" | null;
  entitlements: EntitlementSnapshot;
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

// The resource_catalog view filters unusable/private targets before these
// metadata rows reach the app. Never request a destination in public pages.
export function toPublicResource(value: unknown): PublicResource | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Row;
  if (row.status !== "published") return null;
  if (typeof row.id !== "string" || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(row.id)) return null;
  if (typeof row.title !== "string" || !row.title.trim()) return null;
  if (!DELIVERY_MODES.has(row.delivery_mode as PublicResource["deliveryMode"])) return null;
  const cover = publicCoverUrl(row.cover_image_url);
  const gradeLevels = cleanStringArray(row.grade_levels, 20).filter(isResourceGrade);
  const requiredPlanNames = row.is_free === true ? [] : cleanStringArray(row.required_plan_names, 10);
  return {
    id: row.id,
    title: row.title.trim(),
    meta: typeof row.meta === "string" ? row.meta.trim() : "",
    description: typeof row.description === "string" ? row.description.trim() : "",
    category: typeof row.category === "string" ? row.category.trim() : "",
    gradeLevels,
    deliveryMode: row.delivery_mode as PublicResource["deliveryMode"],
    coverImageUrl: cover,
    tags: cleanStringArray(row.tags, 5),
    isFree: row.is_free === true,
    requiredPlanNames,
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

export const PUBLIC_RESOURCE_SELECT = "id, title, meta, description, category, delivery_mode, cover_image_url, tags, is_free, status, grade_levels, required_plan_names";

export function signupHref(resource: PublicResource): string {
  const destination = resource.isFree && resource.deliveryMode === "file_download"
    ? `/download/${resource.id}`
    : `/app?resource=${resource.id}`;
  return `/login?next=${encodeURIComponent(destination)}&mode=signup`;
}

const ACTION_LABEL: Record<PublicResource["deliveryMode"], string> = {
  web_app: "เปิดใช้งาน",
  google_template: "ทำสำเนาไปยัง Drive ของฉัน",
  google_form: "เปิดแบบฟอร์ม",
  file_download: "ดาวน์โหลดไฟล์",
};

export function requiredPlansLabel(resource: PublicResource): string {
  if (resource.isFree) return "บัญชีสมาชิกฟรี";
  return resource.requiredPlanNames.length > 0
    ? resource.requiredPlanNames.join(" หรือ ")
    : "แพ็กสมาชิกที่มีสิทธิ์คลังพรีเมียม";
}

export function publicResourceAction(resource: PublicResource, viewer: PublicResourceViewer): PublicResourceAction {
  const canUse = viewer.authenticated && canAccessResource(
    { status: "published", isFree: resource.isFree },
    viewer.role ? { role: viewer.role } : null,
    viewer.entitlements,
  );

  if (!viewer.authenticated) {
    return {
      href: signupHref(resource),
      label: "สมัครสมาชิกเพื่อใช้งาน",
      canUse: false,
      locked: !resource.isFree,
      opensNewTab: false,
    };
  }

  if (!canUse) {
    return {
      href: `/app?resource=${resource.id}`,
      label: "อัปเกรดเพื่อปลดล็อก",
      canUse: false,
      locked: true,
      opensNewTab: false,
    };
  }

  return {
    href: resource.deliveryMode === "file_download"
      ? `/download/${resource.id}`
      : `/api/resources/${resource.id}/open`,
    label: ACTION_LABEL[resource.deliveryMode],
    canUse: true,
    locked: false,
    opensNewTab: true,
  };
}
