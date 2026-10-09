import { effectiveMemberPlan, type AdminPlan, type AdminSubscription } from "@/lib/adminMembership";
import { customerBenefitCopy, hasFixedCustomerBenefitCopy, type BenefitCopy } from "@/lib/benefitCopy";
import { isExpiringWithinThirtyDays, isStaffMember, type AdminMemberListItem } from "./memberList";

export interface AdminPlanOverviewItem extends AdminPlan {
  is_public: boolean;
  sort_order: number;
}

export interface PlanBenefitRow {
  plan_id: string;
  feature_id: string;
  feature_name: string;
  feature_description: string | null;
  value_type: "boolean" | "integer";
  limit_value: number | null;
  sort_order: number;
}

export interface PlanMemberCount {
  active: number;
  expiring: number;
}

export interface PlanComparisonCell {
  included: boolean;
  value: string;
}

export interface PlanComparisonRow {
  featureId: string;
  name: string;
  description: string | null;
  cells: Record<string, PlanComparisonCell>;
}

export interface BenefitCopyPreview extends BenefitCopy {
  filtered: boolean;
}

export function isBenefitCopyEditable(featureId: string): boolean {
  return !hasFixedCustomerBenefitCopy(featureId);
}

export function previewCustomerBenefitCopy(
  featureId: string,
  name: string,
  description: string,
): BenefitCopyPreview {
  const normalizedName = name.trim();
  const normalizedDescription = description.trim() || null;
  const copy = customerBenefitCopy({ featureId, name: normalizedName, description: normalizedDescription });
  return {
    ...copy,
    filtered: copy.name !== normalizedName || copy.description !== normalizedDescription,
  };
}

export function calculatePlanMemberCounts(
  plans: readonly AdminPlanOverviewItem[],
  members: readonly AdminMemberListItem[],
  subscriptionsByUser: ReadonlyMap<string, AdminSubscription>,
  now: number,
): Record<string, PlanMemberCount> {
  const counts = Object.fromEntries(plans.map((plan) => [plan.id, { active: 0, expiring: 0 }])) as Record<string, PlanMemberCount>;
  for (const member of members) {
    if (isStaffMember(member)) continue;
    const subscription = subscriptionsByUser.get(member.id) ?? null;
    const planId = effectiveMemberPlan(subscription, now);
    if (!counts[planId]) continue;
    counts[planId].active += 1;
    if (isExpiringWithinThirtyDays(subscription, new Set([planId]), now)) counts[planId].expiring += 1;
  }
  return counts;
}

export function planSaleStatus(plan: AdminPlanOverviewItem): "เปิดขาย" | "ปิดรับใหม่" | "แพ็กเดิม" {
  if (plan.lifecycle_status === "legacy") return "แพ็กเดิม";
  return plan.is_public && (plan.id === "free" || plan.is_upgradeable) ? "เปิดขาย" : "ปิดรับใหม่";
}

export function sortPlansForOverview(plans: readonly AdminPlanOverviewItem[]): AdminPlanOverviewItem[] {
  return [...plans].sort((left, right) => {
    const leftLegacy = left.lifecycle_status === "legacy" ? 1 : 0;
    const rightLegacy = right.lifecycle_status === "legacy" ? 1 : 0;
    return leftLegacy - rightLegacy || left.sort_order - right.sort_order || left.id.localeCompare(right.id);
  });
}

export function planPriceLabel(value: number | null): string {
  if (value === null) return "ไม่ระบุ";
  if (value === 0) return "ฟรี";
  return `${new Intl.NumberFormat("th-TH").format(value)} บาท`;
}

export function benefitValueLabel(benefit: PlanBenefitRow): string {
  if (benefit.value_type === "boolean") return "มี";
  return benefit.limit_value === null
    ? "ไม่จำกัด"
    : new Intl.NumberFormat("th-TH").format(benefit.limit_value);
}

export function uniqueBenefits(rows: readonly PlanBenefitRow[]): PlanBenefitRow[] {
  const byFeature = new Map<string, PlanBenefitRow>();
  for (const row of [...rows].sort((left, right) => left.sort_order - right.sort_order || left.feature_id.localeCompare(right.feature_id))) {
    if (!byFeature.has(row.feature_id)) byFeature.set(row.feature_id, row);
  }
  return [...byFeature.values()];
}

export function buildPlanComparisonRows(
  plans: readonly AdminPlanOverviewItem[],
  rows: readonly PlanBenefitRow[],
): PlanComparisonRow[] {
  return uniqueBenefits(rows).map((feature) => {
    const copy = customerBenefitCopy({
      featureId: feature.feature_id,
      name: feature.feature_name,
      description: feature.feature_description,
    });
    const cells: Record<string, PlanComparisonCell> = {};
    for (const plan of plans) {
      const benefit = rows.find((row) => row.plan_id === plan.id && row.feature_id === feature.feature_id);
      cells[plan.id] = benefit
        ? { included: true, value: benefitValueLabel(benefit) }
        : { included: false, value: "ไม่มี" };
    }
    return { featureId: feature.feature_id, name: copy.name, description: copy.description, cells };
  });
}
