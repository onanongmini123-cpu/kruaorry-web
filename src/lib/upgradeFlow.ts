import { safeUpgradeReturnPath } from "@/lib/authReturnPath";

export type UpgradePlanId = "founder" | "teacher";

/**
 * The one entry point for every Teacher Pro call to action (pricing, plan
 * cards, locked resources). All of them lead to /membership, where a signed-out
 * visitor is asked to sign in or sign up and is then returned to the
 * application and payment steps. Do not link Pro buttons anywhere else (for
 * example straight to LINE): LINE is only used after an application exists.
 */
export function proUpgradeHref(options: { planId?: UpgradePlanId | null; returnTo?: string } = {}): string {
  const query = new URLSearchParams();
  if (options.planId) query.set("plan", options.planId);
  if (options.returnTo) query.set("returnTo", safeUpgradeReturnPath(options.returnTo));
  const text = query.toString();
  return text ? `/membership?${text}` : "/membership";
}
