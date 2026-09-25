import { isResourceGrade, resourceGradeSearchTerms } from "@/lib/resourceGrades";

export type ResourceAccessFilter = "all" | "free" | "member";

export interface ResourceDiscoveryFilters {
  query?: string;
  category?: string;
  grade?: string;
  access?: ResourceAccessFilter;
}

export interface DiscoverableResource {
  title: string;
  meta?: string | null;
  description?: string | null;
  category?: string | null;
  tags?: readonly string[] | null;
  gradeLevels?: readonly string[] | null;
  isFree: boolean;
  accessMode?: "public" | "authenticated" | "plans" | "locked";
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

function cleaned(value: string | null | undefined): string {
  return (value ?? "").replace(CONTROL_CHARACTERS, "").trim();
}

function bounded(value: string | null | undefined, maxLength = 100): string {
  return cleaned(value).slice(0, maxLength);
}

export function normalizeDiscoveryText(value: string | null | undefined): string {
  return cleaned(value).normalize("NFKC").toLocaleLowerCase("th");
}

export function normalizeDiscoveryFilters(filters: ResourceDiscoveryFilters): Required<ResourceDiscoveryFilters> {
  const access = filters.access === "free" || filters.access === "member" ? filters.access : "all";
  const grade = bounded(filters.grade);
  return {
    query: bounded(filters.query),
    category: bounded(filters.category),
    grade: isResourceGrade(grade) ? grade : "",
    access,
  };
}

export function filterDiscoveredResources<T extends DiscoverableResource>(
  resources: readonly T[],
  filters: ResourceDiscoveryFilters,
): T[] {
  const normalized = normalizeDiscoveryFilters(filters);
  const query = normalizeDiscoveryText(normalized.query);

  return resources.filter((resource) => {
    if (normalized.category && resource.category !== normalized.category) return false;
    if (normalized.grade && !resource.gradeLevels?.includes(normalized.grade) && !resource.gradeLevels?.includes("all")) return false;
    if (normalized.access === "free") {
      const isFreeAccess = resource.accessMode
        ? resource.accessMode === "public" || resource.accessMode === "authenticated"
        : resource.isFree;
      if (!isFreeAccess) return false;
    }
    if (normalized.access === "member") {
      const isPlanAccess = resource.accessMode ? resource.accessMode === "plans" : !resource.isFree;
      if (!isPlanAccess) return false;
    }
    if (!query) return true;

    const haystack = [
      resource.title,
      resource.meta,
      resource.description,
      resource.category,
      ...(resource.tags ?? []),
      ...resourceGradeSearchTerms(resource.gradeLevels),
    ]
      .map((value) => normalizeDiscoveryText(value))
      .filter(Boolean)
      .join(" ");

    return haystack.includes(query);
  });
}

export function resourceDiscoveryHref(pathname: string, filters: ResourceDiscoveryFilters): string {
  const normalized = normalizeDiscoveryFilters(filters);
  const params = new URLSearchParams();
  if (normalized.query) params.set("q", normalized.query);
  if (normalized.category) params.set("category", normalized.category);
  if (normalized.grade) params.set("grade", normalized.grade);
  if (normalized.access !== "all") params.set("access", normalized.access);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
