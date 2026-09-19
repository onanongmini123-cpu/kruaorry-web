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
  is_upgradeable: boolean;
}

export function canOfferAdminPlan(plan: AdminPlan, currentPlanId: string): boolean {
  if (plan.id === currentPlanId) return true;
  return plan.lifecycle_status === "active" && (plan.id === "free" || plan.is_upgradeable);
}

export function effectiveMemberPlan(subscription: AdminSubscription | null, now = Date.now()): string {
  if (!subscription || !["active", "past_due"].includes(subscription.status)) return "free";
  if (subscription.current_period_end) {
    const end = Date.parse(subscription.current_period_end);
    if (!Number.isFinite(end) || end <= now) return "free";
  }
  return subscription.plan_id;
}

export function canRenewMember(subscription: AdminSubscription | null, now = Date.now()): boolean {
  if (!subscription || !["active", "past_due"].includes(subscription.status)) return false;
  if (subscription.source === "legacy" || subscription.billing_interval !== "year" || !subscription.current_period_end) return false;
  const end = Date.parse(subscription.current_period_end);
  if (!Number.isFinite(end)) return false;
  if (subscription.plan_id === "founder") {
    return subscription.founder_price_lock && subscription.founder_status === "active" && end > now;
  }
  return true; // A late normal-plan renewal uses the current catalogue price.
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
  if (subscription?.plan_id === "founder" && subscription.founder_price_lock) {
    warnings.push("สิทธิ์ราคาพิเศษ Founder จะสิ้นสุดและไม่สามารถกู้คืนได้");
  }
  return `เปลี่ยนแพ็กจาก ${currentPlanName} เป็น ${nextPlanName} ใช่หรือไม่?\n\n${warnings.join("\n")}\n\nกรุณายืนยันก่อนดำเนินการ`;
}
