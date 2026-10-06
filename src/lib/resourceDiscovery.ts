import { ACCESS_TIER_LABEL, accessTier } from "@/lib/resourceAccess";
import type { ResourceAccessMode } from "@/lib/entitlement";
import { isResourceGrade, resourceGradeSearchTerms } from "@/lib/resourceGrades";
import { DELIVERY_TYPE_LABEL, isResourceTypeFilter, resourceTypeOf, type ResourceTypeFilter } from "@/lib/resourceMeta";
import type { DeliveryMode } from "@/lib/resourceFile";

/**
 * Access filter values, one per customer-facing tier:
 * free = ใช้ฟรี (no sign-up), member = สมาชิกฟรี, pro = Teacher Pro.
 */
export type ResourceAccessFilter = "all" | "free" | "member" | "pro";

export const ACCESS_FILTER_OPTIONS: ReadonlyArray<{ value: ResourceAccessFilter; label: string }> = [
  { value: "all", label: "ทั้งหมด" },
  { value: "free", label: ACCESS_TIER_LABEL.free },
  { value: "member", label: ACCESS_TIER_LABEL.member },
  { value: "pro", label: ACCESS_TIER_LABEL.pro },
];

export interface ResourceDiscoveryFilters {
  query?: string;
  category?: string;
  grade?: string;
  access?: ResourceAccessFilter;
  type?: ResourceTypeFilter;
}

export interface DiscoverableResource {
  title: string;
  meta?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: readonly string[] | null;
  gradeLevels?: readonly string[] | null;
  isFree: boolean;
  accessMode?: ResourceAccessMode;
  /** Either name is accepted: public pages say deliveryMode, the member app says affordance. */
  deliveryMode?: DeliveryMode | null;
  affordance?: DeliveryMode | null;
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function cleaned(value: string | null | undefined): string {
  return (value ?? "").replace(CONTROL_CHARACTERS, "").trim();
}

function bounded(value: string | null | undefined, maxLength = 100): string {
  return cleaned(value).slice(0, maxLength);
}

/** Writes any mention of a school year the same way: "ป.3", "ม.1". */
function canonicalGrades(value: string): string {
  return value
    .replace(/ประถม(?:ศึกษา)?(?:\s*ปีที่)?\s*([1-6])(?!\d)/g, "ป.$1")
    .replace(/มัธยม(?:ศึกษา)?(?:\s*ปีที่)?\s*([1-6])(?!\d)/g, "ม.$1")
    .replace(/ป\s?\.?\s?([1-6])(?!\d)/g, "ป.$1")
    .replace(/ม\s?\.?\s?([1-6])(?!\d)/g, "ม.$1")
    .replace(/(?<![a-z])p\s?([1-6])(?!\d)/g, "ป.$1")
    .replace(/(?<![a-z])m\s?([1-6])(?!\d)/g, "ม.$1");
}

export function normalizeDiscoveryText(value: string | null | undefined): string {
  return canonicalGrades(cleaned(value).normalize("NFKC").toLocaleLowerCase("th"));
}

export function normalizeDiscoveryFilters(filters: ResourceDiscoveryFilters): Required<ResourceDiscoveryFilters> {
  const access = filters.access === "free" || filters.access === "member" || filters.access === "pro"
    ? filters.access
    : "all";
  const grade = bounded(filters.grade);
  const type = filters.type && isResourceTypeFilter(filters.type) ? filters.type : "all";
  return {
    query: bounded(filters.query),
    category: bounded(filters.category),
    grade: isResourceGrade(grade) ? grade : "",
    access,
    type,
  };
}

// Words people use interchangeably in Thai and English. A search for any word
// in a group also matches the others; this only widens matching, it never
// invents a resource.
const SYNONYM_GROUPS: ReadonlyArray<readonly string[]> = [
  ["ศัพท์", "คำศัพท์", "vocabulary", "vocab"],
  ["ไวยากรณ์", "grammar"],
  ["คณิต", "คณิตศาสตร์", "math", "maths", "mathematics"],
  ["อังกฤษ", "ภาษาอังกฤษ", "english"],
  ["ภาษาไทย", "thai"],
  ["วิทย์", "วิทยาศาสตร์", "science"],
  ["เกม", "game", "games"],
  ["ฟัง", "การฟัง", "listening"],
  ["สะกด", "สะกดคำ", "spelling"],
  ["อ่าน", "การอ่าน", "reading"],
  ["เขียน", "การเขียน", "writing"],
  ["ประโยค", "sentence"],
  ["ใบงาน", "worksheet"],
  ["เทมเพลต", "template"],
  ["แบบฟอร์ม", "ฟอร์ม", "form"],
  ["ฟรี", "free"],
  ["โฟนิกส์", "phonics"],
  ["ตัวอักษร", "alphabet", "letters"],
];

function variantsOf(token: string): string[] {
  if (token.length < 2) return [token];
  const found = new Set<string>([token]);
  for (const group of SYNONYM_GROUPS) {
    const related = group.some((word) => word === token || (token.length >= 3 && (word.includes(token) || token.includes(word) && word.length >= 3)));
    if (related) group.forEach((word) => found.add(word));
  }
  return [...found];
}

function gradeWords(grades: readonly string[] | null | undefined): string[] {
  const words = resourceGradeSearchTerms(grades);
  for (const grade of grades ?? []) {
    if (/^p[1-6]$/.test(grade)) words.push("ประถม");
    if (/^m[1-6]$/.test(grade)) words.push("มัธยม");
  }
  return words;
}

function resourceMode(resource: DiscoverableResource): DeliveryMode | null {
  return resource.deliveryMode ?? resource.affordance ?? null;
}

function matchesAccess(resource: DiscoverableResource, access: ResourceAccessFilter): boolean {
  if (access === "all") return true;
  if (resource.accessMode) {
    const tier = accessTier(resource.accessMode);
    return tier === (access === "member" ? "member" : access === "pro" ? "pro" : "free");
  }
  // Without an access mode only "free vs paid" is known.
  if (access === "free" || access === "member") return resource.isFree;
  return !resource.isFree;
}

function haystackOf(resource: DiscoverableResource): string {
  const mode = resourceMode(resource);
  return [
    resource.title,
    resource.meta,
    resource.description,
    resource.category,
    ...(resource.tags ?? []),
    ...gradeWords(resource.gradeLevels),
    mode ? DELIVERY_TYPE_LABEL[mode] : null,
    resource.accessMode ? ACCESS_TIER_LABEL[accessTier(resource.accessMode)] : null,
  ]
    .map((value) => normalizeDiscoveryText(value))
    .filter(Boolean)
    .join(" ");
}

export function filterDiscoveredResources<T extends DiscoverableResource>(
  resources: readonly T[],
  filters: ResourceDiscoveryFilters,
): T[] {
  const normalized = normalizeDiscoveryFilters(filters);
  const tokens = normalizeDiscoveryText(normalized.query).split(/\s+/).filter(Boolean);
  const tokenVariants = tokens.map(variantsOf);

  return resources.filter((resource) => {
    if (normalized.category && resource.category !== normalized.category) return false;
    if (normalized.grade && !resource.gradeLevels?.includes(normalized.grade) && !resource.gradeLevels?.includes("all")) return false;
    if (!matchesAccess(resource, normalized.access)) return false;
    if (normalized.type !== "all") {
      const mode = resourceMode(resource);
      if (!mode || resourceTypeOf(mode) !== normalized.type) return false;
    }
    if (tokens.length === 0) return true;

    const haystack = haystackOf(resource);
    return tokenVariants.every((variants) => variants.some((variant) => haystack.includes(variant)));
  });
}

export function resourceDiscoveryHref(pathname: string, filters: ResourceDiscoveryFilters): string {
  const normalized = normalizeDiscoveryFilters(filters);
  const params = new URLSearchParams();
  if (normalized.query) params.set("q", normalized.query);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.grade) params.set("grade", normalized.grade);
  if (normalized.access !== "all") params.set("access", normalized.access);
  if (normalized.type !== "all") params.set("type", normalized.type);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** How many filters (not counting the search words) are narrowing the list. */
export function activeFilterCount(filters: ResourceDiscoveryFilters): number {
  const normalized = normalizeDiscoveryFilters(filters);
  return [normalized.category, normalized.grade, normalized.access !== "all", normalized.type !== "all"]
    .filter(Boolean).length;
}
