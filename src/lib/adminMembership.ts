export interface AdminSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: "active" | "past_due" | "expired" | "cancelled" | "revoked";
  source: "legacy" | "upgrade_request" | "admin" | "renewal";
  billing_interval: "none" | "year" | "one_time";
  current_period_end: string | null;
  founder_status: "active" | "expired" | "lost_price_lock" | null;
  founder_price_lock: boolean;
}

export interface AdminPlan {
  id: string;
  name: string;
  lifecycle_status: "active" | "legacy" | "retired";
  price_amount_thb: number | null;
  renewal_price_amount_thb: number | null;
  is_upgradeable: boolean;
}

export const FOUNDER_RENEWAL_PRICE_THB = 599;

const TEST_APPLICATION_CLEANUP_REASONS = new Set([
  "owner_test_cleanup",
  "test_application_cleanup",
]);

export function adminMembershipApplicationStatusLabel(
  status: "pending" | "approved" | "declined",
  resolutionReasonCode: string | null,
  paymentReportedAt: string | null,
): string {
  if (status === "approved") return "อนุมัติแล้ว";
  if (status === "declined") {
    return resolutionReasonCode && TEST_APPLICATION_CLEANUP_REASONS.has(resolutionReasonCode)
      ? "ยกเลิกรายการทดสอบ"
      : "ปฏิเสธแล้ว";
  }
  return paymentReportedAt ? "แจ้งหลักฐานแล้ว · รอตรวจสอบ" : "รอแจ้งชำระ";
}

const STATUS_PRIORITY: Record<AdminSubscription["status"], number> = {
  active: 3,
  past_due: 2,
  expired: 1,
  cancelled: 0,
  revoked: 0,
};

export function preferredAdminSubscription(
  current: AdminSubscription | undefined,
  candidate: AdminSubscription,
): AdminSubscription {
  if (!current) return candidate;
  const currentPriority = STATUS_PRIORITY[current.status];
  const candidatePriority = STATUS_PRIORITY[candidate.status];
  if (candidatePriority !== currentPriority) return candidatePriority > currentPriority ? candidate : current;

  const currentEnd = current.current_period_end ? Date.parse(current.current_period_end) : Number.NEGATIVE_INFINITY;
  const candidateEnd = candidate.current_period_end ? Date.parse(candidate.current_period_end) : Number.NEGATIVE_INFINITY;
  return candidateEnd > currentEnd ? candidate : current;
}

export function canOfferAdminPlan(plan: AdminPlan, currentPlanId: string): boolean {
  if (plan.id === currentPlanId) return true;
  // Founder is only granted by the payment-confirmation RPC, where the
  // database serializes the 100-seat allocation. A generic admin plan change
  // must never bypass that capacity boundary.
  if (plan.id === "founder") return false;
  return plan.lifecycle_status === "active" && (plan.id === "free" || plan.is_upgradeable);
}

export function renewalAmountThb(subscription: AdminSubscription, cataloguePriceThb: number | null): number | null {
  if (subscription.plan_id === "founder") return FOUNDER_RENEWAL_PRICE_THB;
  return typeof cataloguePriceThb === "number" && Number.isInteger(cataloguePriceThb) && cataloguePriceThb >= 0
    ? cataloguePriceThb
    : null;
}

export function effectiveMemberPlan(subscription: AdminSubscription | null, now = Date.now()): string {
  if (!subscription || !["active", "past_due"].includes(subscription.status)) return "free";
  if (subscription.current_period_end) {
    const end = Date.parse(subscription.current_period_end);
    if (!Number.isFinite(end) || end <= now) return "free";
  }
  return subscription.plan_id;
}

export function canRenewMember(subscription: AdminSubscription | null): boolean {
  if (!subscription || !["active", "past_due", "expired"].includes(subscription.status)) return false;
  if (subscription.source === "legacy" || subscription.billing_interval !== "year" || !subscription.current_period_end) return false;
  const end = Date.parse(subscription.current_period_end);
  if (!Number.isFinite(end)) return false;
  // Founder is a first-year acquisition promotion, not a perpetual price
  // lock. It remains renewable at 599 after the first period and after a late
  // payment, just like another current annual plan.
  return true;
}

export function memberPlanChangeConfirmation(
  currentPlanName: string,
  nextPlanName: string,
  subscription: AdminSubscription | null,
): string {
  const warnings = ["การเปลี่ยนแพ็กจะยกเลิกสิทธิ์แพ็กเดิมที่ยังมีผลทันที (ถ้ามี)"];
  if (subscription?.source === "legacy" || subscription?.billing_interval === "one_time") {
    warnings.push("สิทธิ์เดิม/ตลอดชีพอาจกู้คืนไม่ได้");
  }
  if (subscription?.plan_id === "founder") {
    warnings.push("สิทธิ์ Founder ราคาปีแรก 299 บาทจะสิ้นสุดและไม่สามารถกู้คืนได้");
  }
  return `เปลี่ยนแพ็กจาก ${currentPlanName} เป็น ${nextPlanName} ใช่หรือไม่?\n\n${warnings.join("\n")}\n\nกรุณายืนยันก่อนดำเนินการ`;
}
