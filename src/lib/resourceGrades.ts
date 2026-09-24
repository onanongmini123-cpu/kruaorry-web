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
