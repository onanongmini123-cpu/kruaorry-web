import type { EntitlementSnapshot } from "@/lib/entitlement";
import { isMembershipExpired, type MemberSubscription } from "@/lib/memberAccount";
import type { UpgradeRequest } from "@/lib/data";
import { safeUpgradeReturnPath } from "@/lib/authReturnPath";
import { planDisplayName } from "@/lib/planDisplay";

export type MembershipJourneyPlanId = "founder" | "teacher";

/** Keep legacy/server wording from leaking the old customer-facing name. */
export function membershipDisplayError(error: string | null | undefined, fallback: string): string {
  const message = error?.trim() || fallback;
  return message.replace(/\bTeacher\b(?!\s+Pro\b)/g, "Teacher Pro");
}

export function requestedMembershipPlan(raw: string | null | undefined): MembershipJourneyPlanId | null {
  return raw === "founder" || raw === "teacher" ? raw : null;
}

export function pendingMembershipApplication(applications: UpgradeRequest[]): UpgradeRequest | null {
  return applications.find((application) => application.status === "pending") ?? null;
}

/**
 * Entitlements remain the server-side source of truth for resource access.
 * Subscription state is used only to stop stale/expired history from making
 * the application UI look current while a refresh is in flight.
 */
export function hasCurrentPaidMembership(
  entitlements: EntitlementSnapshot,
  subscription: MemberSubscription | null,
  now = Date.now(),
): boolean {
  if (subscription) {
    return ["active", "past_due"].includes(subscription.status)
      && !isMembershipExpired(subscription, now);
  }
  return entitlements.planId !== "free";
}

export function canStartMembershipApplication(
  applications: UpgradeRequest[],
  entitlements: EntitlementSnapshot,
  subscription: MemberSubscription | null,
  requestedPlan: MembershipJourneyPlanId | null = null,
  hasFounderHistory = false,
  now = Date.now(),
): boolean {
  if (pendingMembershipApplication(applications)) return false;
  if (requestedPlan === "founder" && hasFounderHistory) return false;
  if (!hasCurrentPaidMembership(entitlements, subscription, now)) return true;
  if (!requestedPlan) return false;
  const currentPlan = entitlements.planId !== "free"
    ? entitlements.planId
    : subscription?.planId ?? "free";
  return currentPlan !== requestedPlan;
}

export function entitlementSatisfiesRequestedPlan(
  entitlements: EntitlementSnapshot,
  requestedPlan: MembershipJourneyPlanId | null,
): boolean {
  if (entitlements.planId === "free") return false;
  return requestedPlan === null || entitlements.planId === requestedPlan;
}

export function membershipPlanUnlocksResource(
  planId: string,
  requiredPlanIds: readonly string[],
): boolean {
  return requiredPlanIds.includes(planId);
}

export function membershipResourceHasSelectablePlan(
  requiredPlanIds: readonly string[],
): boolean {
  return requiredPlanIds.some((planId) => planId === "founder" || planId === "teacher");
}

export function membershipApplicationPlanMismatch(
  applicationPlanId: string | null | undefined,
  requiredPlanIds: readonly string[],
  hasResourceContext: boolean,
  resourcePlansLoaded: boolean,
  resourceReadError: boolean,
): boolean {
  if (!applicationPlanId || !hasResourceContext || !resourcePlansLoaded || resourceReadError) return false;
  return !membershipPlanUnlocksResource(applicationPlanId, requiredPlanIds);
}

export function resolveMembershipPlanSelection(
  preferredPlan: MembershipJourneyPlanId,
  requiredPlanIds: readonly string[],
  hasResourceContext: boolean,
  resourcePlansLoaded: boolean,
  founderUnavailable: boolean,
): MembershipJourneyPlanId {
  if (!hasResourceContext || !resourcePlansLoaded) return preferredPlan;
  if (membershipPlanUnlocksResource(preferredPlan, requiredPlanIds)
    && !(preferredPlan === "founder" && founderUnavailable)) {
    return preferredPlan;
  }
  if (membershipPlanUnlocksResource("teacher", requiredPlanIds)) return "teacher";
  if (membershipPlanUnlocksResource("founder", requiredPlanIds) && !founderUnavailable) return "founder";
  // Founder-only media must remain Founder even when the first-year offer is
  // unavailable. The caller then shows renewal/support instead of advertising
  // Teacher Pro, which cannot unlock this resource.
  if (membershipPlanUnlocksResource("founder", requiredPlanIds)) return "founder";
  // No saleable alternative exists (for example Plus/Lifetime-only media).
  // Preserve the preference only as an internal value; the caller's
  // no-saleable-plan branch hides every purchase CTA.
  return preferredPlan;
}

export function membershipReturnResourceId(raw: string | null | undefined): string | null {
  const target = membershipReturnTarget(raw);
  if (!target.canAutoReturn) return null;
  const url = new URL(target.destination, "https://return-path.invalid");
  const detail = /^\/resources\/([0-9a-f-]+)$/i.exec(url.pathname);
  if (detail) return detail[1];
  return url.pathname === "/app" ? url.searchParams.get("resource") : null;
}

export interface MembershipReturnResourceRead {
  resourceId: string;
  requiredPlanIds: readonly string[];
  error: boolean;
}

export function membershipReturnResourceState(
  resourceId: string | null,
  read: MembershipReturnResourceRead | null,
): { loaded: boolean; error: boolean; requiredPlanIds: readonly string[] } {
  if (resourceId === null) return { loaded: true, error: false, requiredPlanIds: [] };
  if (read?.resourceId !== resourceId) return { loaded: false, error: false, requiredPlanIds: [] };
  return { loaded: true, error: read.error, requiredPlanIds: read.requiredPlanIds };
}

export function membershipPlanChangeConfirmation(
  subscription: MemberSubscription | null,
  targetPlan: MembershipJourneyPlanId,
): string | null {
  if (!subscription || subscription.planId === targetPlan) return null;
  const warnings = [
    `เมื่อทีมงานอนุมัติแพ็ก ${planDisplayName(targetPlan, targetPlan === "founder" ? "Founder" : null)} สิทธิ์แพ็กเดิมอาจสิ้นสุดทันที`,
  ];
  if (subscription.planId === "founder") {
    warnings.push("สิทธิ์ Founder ราคาเดิมจะสิ้นสุดและไม่สามารถกู้คืนได้");
  }
  if (subscription.source === "legacy" || subscription.billingInterval === "one_time") {
    warnings.push("สิทธิ์ Legacy หรือสิทธิ์ตลอดชีพอาจไม่สามารถกู้คืนได้");
  }
  return `โปรดตรวจสอบก่อนเปลี่ยนแพ็ก:\n\n• ${warnings.join("\n• ")}\n\nยืนยันส่งใบสมัครหรือไม่?`;
}

export function founderApplicationConversionConfirmation(
  subscription: MemberSubscription | null,
): string {
  const planChangeWarning = membershipPlanChangeConfirmation(subscription, "teacher");
  if (planChangeWarning) {
    return `เปลี่ยนใบสมัคร Founder ที่รอดำเนินการเป็น Teacher Pro 599 บาท/ปี โดยใช้เลขอ้างอิงเดิม\n\n${planChangeWarning}`;
  }
  return "เปลี่ยนเฉพาะใบสมัคร Founder ที่รอดำเนินการเป็น Teacher Pro 599 บาท/ปี โดยใช้เลขอ้างอิงเดิมใช่หรือไม่? การเปลี่ยนใบสมัครนี้ยังไม่เปลี่ยนสิทธิ์สมาชิกปัจจุบันจนกว่าทีมงานจะอนุมัติ";
}

export interface MembershipReturnTarget {
  destination: string;
  canAutoReturn: boolean;
}

export function membershipReturnTarget(raw: string | null | undefined): MembershipReturnTarget {
  const destination = safeUpgradeReturnPath(raw);
  return {
    destination,
    canAutoReturn: raw !== null && raw !== undefined && destination === raw,
  };
}

export function membershipAutoReturnDestination(
  rawReturnTo: string | null | undefined,
  requiredPlanIds: readonly string[],
  entitlements: EntitlementSnapshot,
  alreadyReturned: boolean,
): string | null {
  // For a resource return, callers must pass the plans read from the live
  // catalogue. For a non-resource member route, callers may pass the already
  // validated requested-plan hint; the destination is still restricted below.
  if (alreadyReturned || !membershipPlanUnlocksResource(entitlements.planId, requiredPlanIds)) return null;
  const target = membershipReturnTarget(rawReturnTo);
  return target.canAutoReturn ? target.destination : null;
}
