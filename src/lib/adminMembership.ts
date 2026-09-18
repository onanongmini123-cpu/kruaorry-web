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
