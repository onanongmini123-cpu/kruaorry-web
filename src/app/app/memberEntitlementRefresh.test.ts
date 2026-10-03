import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canAccessResource, EMPTY_ENTITLEMENTS, type EntitlementSnapshot } from "@/lib/entitlement";
import { createLatestRefreshRunner } from "@/lib/latestRefresh";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("member entitlement refresh", () => {
  it("refreshes subscription, application, and entitlements together on focus and polling", () => {
    expect(page).toContain("fetchMemberSubscription(supabase, userId)");
    expect(page).toContain("fetchUpgradeRequestsResult(supabase, userId)");
    expect(page).toContain("fetchEntitlementsResult(supabase)");
    expect(page).toContain("if (!entitlementResult.error) setEntitlements(entitlementResult.entitlements)");
    expect(page).toContain("createLatestRefreshRunner");
    expect(page).toContain('window.setInterval(refreshAccountStatus, 60_000)');
    expect(page).toContain('window.addEventListener("focus", refreshAccountStatus)');
    expect(page).toContain('window.removeEventListener("focus", refreshAccountStatus)');
  });

  it("unlocks a Teacher resource after approval without a reload and keeps the last good grant on a later error", async () => {
    let entitlements: EntitlementSnapshot = EMPTY_ENTITLEMENTS;
    const resource = {
      status: "published" as const,
      accessMode: "plans" as const,
      requiredPlanIds: ["teacher"],
    };
    const canOpen = () => canAccessResource(resource, {
      authenticated: true,
      role: "member",
      planId: entitlements.planId,
    });
    const results = [
      { entitlements: { planId: "teacher", features: {} }, error: false },
      { entitlements: EMPTY_ENTITLEMENTS, error: true },
    ];
    const runner = createLatestRefreshRunner(
      vi.fn(async () => results.shift() ?? { entitlements: EMPTY_ENTITLEMENTS, error: true }),
      (result) => {
        if (!result.error) entitlements = result.entitlements;
      },
    );

    expect(canOpen()).toBe(false);
    await runner.request();
    expect(canOpen()).toBe(true);

    await runner.request();
    expect(canOpen()).toBe(true);
  });
});
