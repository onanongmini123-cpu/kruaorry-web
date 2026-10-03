import type { EntitlementSnapshot } from "@/lib/entitlement";
import { isMembershipExpired, type MemberSubscription } from "@/lib/memberAccount";
import type { UpgradeRequest } from "@/lib/data";
import { safeUpgradeReturnPath } from "@/lib/authReturnPath";

export type MembershipJourneyPlanId = "founder" | "teacher";

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
  now = Date.now(),
): boolean {
  if (pendingMembershipApplication(applications)) return false;
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
  requestedPlan: MembershipJourneyPlanId | null,
  entitlements: EntitlementSnapshot,
  alreadyReturned: boolean,
): string | null {
  // The normal resource CTA always includes its required plan. Without that
  // signal the membership page cannot prove that an arbitrary paid plan can
  // open the returned resource, so fail closed and keep the explicit /app
  // fallback instead of risking a redirect loop.
  if (alreadyReturned || requestedPlan === null || !entitlementSatisfiesRequestedPlan(entitlements, requestedPlan)) return null;
  const target = membershipReturnTarget(rawReturnTo);
  return target.canAutoReturn ? target.destination : null;
}
