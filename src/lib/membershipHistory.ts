import type { UpgradeRequest } from "@/lib/data";

/**
 * Applications that are no longer waiting (declined, expired, cancelled or
 * approved) belong in a collapsed history list, newest first, so an old
 * "ไม่ผ่านการตรวจสอบ" record never competes with the current step.
 */
export function applicationHistory(applications: readonly UpgradeRequest[]): UpgradeRequest[] {
  return applications
    .filter((application) => application.status !== "pending")
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
