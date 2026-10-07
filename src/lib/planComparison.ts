import type { Plan, PlanBenefit } from "@/lib/data";
import { ACCESS_TIER_LABEL } from "@/lib/resourceAccess";

export type ComparisonCell = { included: false } | { included: true; text: string | null };

export interface ComparisonRow {
  featureId: string;
  name: string;
  free: ComparisonCell;
  pro: ComparisonCell;
}

const NOT_INCLUDED: ComparisonCell = { included: false };

function cell(benefit: PlanBenefit | undefined): ComparisonCell {
  if (!benefit) return NOT_INCLUDED;
  if (benefit.valueType !== "integer") return { included: true, text: null };
  return {
    included: true,
    text: benefit.limitValue === null ? "ไม่จำกัด" : new Intl.NumberFormat("th-TH").format(benefit.limitValue),
  };
}

/** True for the always-true statement about what every account can open. */
export const FREE_ACCESS_FEATURE_ID = "access.free";

/**
 * Free vs Teacher Pro rows built only from the plans' real, enabled benefits
 * (`plan_benefit_catalog`), so a capability that is not granted to either
 * plan can never appear. The first row states what the access labels mean:
 * resources labelled ใช้ฟรี or สมาชิกฟรี are open to both plans.
 *
 * `favorites.enabled` is hidden when `favorites.limit` is present because the
 * limit row already says whether (and how much) saving is allowed.
 */
export function buildPlanComparison(free: Plan | undefined, pro: Plan | undefined): ComparisonRow[] {
  const freeBenefits = new Map((free?.benefits ?? []).map((benefit) => [benefit.featureId, benefit]));
  const proBenefits = new Map((pro?.benefits ?? []).map((benefit) => [benefit.featureId, benefit]));

  const order: string[] = [];
  for (const benefit of [...(pro?.benefits ?? []), ...(free?.benefits ?? [])]) {
    if (!order.includes(benefit.featureId)) order.push(benefit.featureId);
  }
  const hasLimitRow = order.includes("favorites.limit");

  const rows: ComparisonRow[] = [{
    featureId: FREE_ACCESS_FEATURE_ID,
    name: `เกมและสื่อที่ติดป้าย “${ACCESS_TIER_LABEL.free}” และ “${ACCESS_TIER_LABEL.member}”`,
    free: { included: true, text: null },
    pro: { included: true, text: null },
  }];

  for (const featureId of order) {
    if (featureId === "favorites.enabled" && hasLimitRow) continue;
    const source = proBenefits.get(featureId) ?? freeBenefits.get(featureId);
    if (!source) continue;
    rows.push({
      featureId,
      name: source.name,
      free: cell(freeBenefits.get(featureId)),
      pro: cell(proBenefits.get(featureId)),
    });
  }
  return rows;
}
