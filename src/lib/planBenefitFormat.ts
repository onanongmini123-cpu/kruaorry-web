export type LandingPlanBenefit = {
  featureId: string;
  name: string;
  description: string | null;
  valueType: "boolean" | "integer";
  limitValue: number | null;
};

export type LandingBillingInterval = "month" | "year" | "lifetime" | null;

export type FormattedPlanBenefit = {
  title: string;
  description: string | null;
};

export function formatPlanBenefit(benefit: LandingPlanBenefit): FormattedPlanBenefit {
  const name = benefit.name.trim();
  const description = benefit.description?.trim() || null;
  if (benefit.valueType === "integer") {
    const value = benefit.limitValue === null
      ? "ไม่จำกัด"
      : new Intl.NumberFormat("th-TH").format(benefit.limitValue);
    return { title: `${name}: ${value}`, description };
  }
  return { title: name, description };
}

export function billingIntervalLabel(interval: LandingBillingInterval): string | null {
  if (interval === "month") return "ต่อเดือน";
  if (interval === "year") return "ต่อปี";
  if (interval === "lifetime") return "ชำระครั้งเดียว";
  return null;
}
