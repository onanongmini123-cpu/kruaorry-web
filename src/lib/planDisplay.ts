export const TEACHER_PRO_DISPLAY_NAME = "Teacher Pro";
export const LEGACY_TEACHER_PRO_DISPLAY_NAME = "Teacher Pro (แพ็กเดิม)";

/**
 * `teacher` remains the canonical database and entitlement id. Only its
 * customer-facing name changes, so historical rows and RLS relationships do
 * not need a data migration.
 */
export function planDisplayName(planId: string, storedName?: string | null): string {
  if (planId === "teacher") return TEACHER_PRO_DISPLAY_NAME;
  // `teacher_pro` is a retired, non-saleable entitlement. It must remain
  // visibly distinct from the saleable `teacher` id now labelled Teacher Pro.
  if (planId === "teacher_pro") return LEGACY_TEACHER_PRO_DISPLAY_NAME;
  const normalized = storedName?.trim();
  if (normalized) return normalized;
  if (planId === "founder") return "Founder 100";
  if (planId === "plus") return "Plus";
  if (planId === "lifetime") return "Lifetime";
  if (planId === "free") return "Free";
  return planId;
}

export function planDisplayNames(planIds: readonly string[], storedNames: readonly string[]): string[] {
  // resource_catalog can omit names for hidden legacy plans while still
  // returning every required id. Only pair by index when both arrays have the
  // same shape; otherwise derive conservative labels from ids so a hidden plan
  // cannot shift "Teacher" onto the wrong entitlement.
  const aligned = planIds.length === storedNames.length;
  return [...new Set(planIds.map((planId, index) => (
    planDisplayName(planId, aligned ? storedNames[index] : null)
  )))];
}
