export const MEMBERSHIP_RENEWAL_WINDOW_DAYS = 7;

export type RenewableMembershipStatus = "active" | "past_due" | "expired" | "cancelled" | "revoked";

export function isMembershipRenewalDue(
  status: RenewableMembershipStatus,
  currentPeriodEnd: string | null,
  now = Date.now(),
): boolean {
  if (!currentPeriodEnd || !Number.isFinite(Date.parse(currentPeriodEnd))) return false;
  if (status === "past_due" || status === "expired") return true;
  if (status !== "active") return false;
  const daysRemaining = Math.max(0, Math.ceil((Date.parse(currentPeriodEnd) - now) / 86_400_000));
  return daysRemaining <= MEMBERSHIP_RENEWAL_WINDOW_DAYS;
}
