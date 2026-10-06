/**
 * Problem-report categories. The first five exist in every database; the rest
 * need migration 054 and are only offered once the application has seen its
 * readiness marker.
 */
export type ResourceIssueCategory =
  | "cannot_open"
  | "broken_link"
  | "cannot_download"
  | "wrong_content"
  | "other"
  | "wrong_answer"
  | "cannot_play"
  | "no_sound"
  | "camera_issue"
  | "mobile_layout";

export interface IssueOption {
  value: ResourceIssueCategory;
  label: string;
}

/** Offered everywhere (what a database without migration 054 accepts). */
export const BASE_ISSUE_OPTIONS: readonly IssueOption[] = [
  { value: "cannot_open", label: "เปิดสื่อไม่ได้" },
  { value: "broken_link", label: "ลิงก์เสีย" },
  { value: "cannot_download", label: "ดาวน์โหลดไม่ได้" },
  { value: "wrong_content", label: "เนื้อหาผิด" },
  { value: "other", label: "อื่น ๆ" },
];

/** What teachers actually run into, in the order they are shown. */
export const EXTENDED_ISSUE_OPTIONS: readonly IssueOption[] = [
  { value: "wrong_content", label: "เนื้อหาผิด" },
  { value: "wrong_answer", label: "เฉลยผิด" },
  { value: "cannot_play", label: "เล่นไม่ได้" },
  { value: "no_sound", label: "เสียงไม่ออก" },
  { value: "camera_issue", label: "กล้องไม่ทำงาน" },
  { value: "mobile_layout", label: "มือถือแสดงผลผิด" },
  { value: "cannot_download", label: "ดาวน์โหลดไม่ได้" },
  { value: "broken_link", label: "ลิงก์เสีย" },
  { value: "cannot_open", label: "เปิดสื่อไม่ได้" },
  { value: "other", label: "อื่น ๆ" },
];

export const ISSUE_CATEGORY_LABELS: Record<ResourceIssueCategory, string> = Object.fromEntries(
  EXTENDED_ISSUE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<ResourceIssueCategory, string>;

export function issueOptions(extended: boolean): readonly IssueOption[] {
  return extended ? EXTENDED_ISSUE_OPTIONS : BASE_ISSUE_OPTIONS;
}
