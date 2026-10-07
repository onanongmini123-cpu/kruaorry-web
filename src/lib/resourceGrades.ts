export const RESOURCE_GRADE_OPTIONS = [
  { value: "kindergarten", label: "อนุบาล" },
  { value: "p1", label: "ป.1" },
  { value: "p2", label: "ป.2" },
  { value: "p3", label: "ป.3" },
  { value: "p4", label: "ป.4" },
  { value: "p5", label: "ป.5" },
  { value: "p6", label: "ป.6" },
  { value: "m1", label: "ม.1" },
  { value: "m2", label: "ม.2" },
  { value: "m3", label: "ม.3" },
  { value: "m4", label: "ม.4" },
  { value: "m5", label: "ม.5" },
  { value: "m6", label: "ม.6" },
  { value: "vocational", label: "อาชีวศึกษา" },
  { value: "all", label: "ทุกระดับ" },
] as const;

export type ResourceGrade = (typeof RESOURCE_GRADE_OPTIONS)[number]["value"];

const RESOURCE_GRADE_VALUES = new Set<string>(RESOURCE_GRADE_OPTIONS.map((option) => option.value));
const RESOURCE_GRADE_LABELS = new Map<string, string>(RESOURCE_GRADE_OPTIONS.map((option) => [option.value, option.label]));

export function isResourceGrade(value: string): value is ResourceGrade {
  return RESOURCE_GRADE_VALUES.has(value);
}

export function resourceGradeLabel(value: string): string {
  return RESOURCE_GRADE_LABELS.get(value) ?? value;
}

export function resourceGradeSearchTerms(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).flatMap((value) => [value, resourceGradeLabel(value)]);
}

// The ladder runs kindergarten -> p1..p6 -> m1..m6. "vocational" and "all"
// sit outside it and are never merged into a range.
const GRADE_LADDER = RESOURCE_GRADE_OPTIONS
  .map((option) => option.value as string)
  .filter((value) => value !== "vocational" && value !== "all");

function shortLadderLabel(grade: string, withStage: boolean): string {
  const label = resourceGradeLabel(grade);
  return withStage ? label : label.replace(/^[ปม]\./, "");
}

/**
 * One compact, consistent label for a resource's grade levels, derived only
 * from the structured `grade_levels` values: "ป.1–6", "ป.4–ม.3", "อนุบาล–ป.3",
 * "ป.1, ป.3", "ทุกระดับ". Cards, lists, detail pages, search metadata and
 * SEO must all use this instead of showing a truncated subset of the tags.
 * Returns "" when no valid grade is set.
 */
export function formatResourceGrades(values: readonly string[] | null | undefined): string {
  const valid = [...new Set((values ?? []).filter(isResourceGrade))];
  if (valid.length === 0) return "";
  if (valid.includes("all")) return resourceGradeLabel("all");

  const ladder = valid
    .filter((grade) => GRADE_LADDER.includes(grade))
    .sort((a, b) => GRADE_LADDER.indexOf(a) - GRADE_LADDER.indexOf(b));
  const parts: string[] = [];
  let index = 0;
  while (index < ladder.length) {
    let end = index;
    while (end + 1 < ladder.length && GRADE_LADDER.indexOf(ladder[end + 1]) === GRADE_LADDER.indexOf(ladder[end]) + 1) end += 1;
    const first = ladder[index];
    const last = ladder[end];
    if (end === index) {
      parts.push(resourceGradeLabel(first));
    } else if (end === index + 1) {
      parts.push(resourceGradeLabel(first), resourceGradeLabel(last));
    } else {
      const sameStage = first.charAt(0) === last.charAt(0) && first !== "kindergarten";
      parts.push(`${resourceGradeLabel(first)}–${shortLadderLabel(last, !sameStage)}`);
    }
    index = end + 1;
  }
  if (valid.includes("vocational")) parts.push(resourceGradeLabel("vocational"));
  return parts.join(", ");
}

/** Admin-facing problem with a resource's grade data, or null when it is fine. */
export function resourceGradeProblem(values: readonly string[] | null | undefined): string | null {
  const list = values ?? [];
  if (list.length === 0) return "ยังไม่ระบุระดับชั้น";
  if (list.some((value) => !isResourceGrade(value))) return "มีระดับชั้นที่ไม่ถูกต้อง";
  if (list.includes("all") && list.length > 1) return "ระดับชั้น “ทุกระดับ” ต้องเลือกเพียงรายการเดียว";
  return null;
}
