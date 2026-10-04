import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { canAccessResource } from "@/lib/entitlement";
import type { EntitlementsResult } from "@/lib/data";
import { createLatestRefreshRunner } from "@/lib/latestRefresh";
import {
  completeMemberEntitlementsRefresh,
  INITIAL_MEMBER_ENTITLEMENTS_STATE,
  type MemberEntitlementsState,
} from "@/lib/memberAccount";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("member entitlement refresh", () => {
  it("refreshes subscription, application, and entitlements together on focus and polling", () => {
    expect(page).toContain("fetchMemberSubscription(supabase, userId)");
    expect(page).toContain("fetchUpgradeRequestsResult(supabase, userId)");
    expect(page).toContain("fetchEntitlementsResult(supabase)");
    expect(page).toContain("completeMemberEntitlementsRefresh(current, entitlementResult)");
    expect(page).toContain("if (!subscriptionResult.error) setSubscription(subscriptionResult.subscription)");
    expect(page).toContain("createLatestRefreshRunner");
    expect(page).toContain('window.setInterval(refreshAccountStatus, 60_000)');
    expect(page).toContain('window.addEventListener("focus", refreshAccountStatus)');
    expect(page).toContain('window.removeEventListener("focus", refreshAccountStatus)');
  });

  it("unlocks a Teacher resource after approval without a reload and keeps the last good grant on a later error", async () => {
    let state: MemberEntitlementsState = INITIAL_MEMBER_ENTITLEMENTS_STATE;
    const resource = {
      status: "published" as const,
      accessMode: "plans" as const,
      requiredPlanIds: ["teacher"],
    };
    const canOpen = () => canAccessResource(resource, {
      authenticated: true,
      role: "member",
      planId: state.entitlements?.planId ?? null,
    });
    const results: EntitlementsResult[] = [
      { entitlements: { planId: "teacher", features: {} }, error: false },
      { entitlements: null, error: true },
    ];
    const runner = createLatestRefreshRunner(
      vi.fn(async (): Promise<EntitlementsResult> => results.shift() ?? { entitlements: null, error: true }),
      (result) => {
        state = completeMemberEntitlementsRefresh(state, result);
      },
    );

    expect(canOpen()).toBe(false);
    await runner.request();
    expect(canOpen()).toBe(true);

    await runner.request();
    expect(canOpen()).toBe(true);
    expect(state.status).toBe("error");
  });

  it("wires retry and logout to the same race-safe refresh runner", () => {
    expect(page).toContain("setEntitlementState((current) => beginMemberEntitlementsRefresh(current))");
    expect(page).toContain("void accountRefreshController.request()");
    expect(page).toContain("accountRefreshController.attach(runner)");
    expect(page).toContain("accountRefreshController.detach(runner)");
    expect(page).toContain("accountRefreshController.dispose()");
    expect(page).toContain("setEntitlementState(INITIAL_MEMBER_ENTITLEMENTS_STATE)");
    expect(page).toContain("ลองตรวจสอบสิทธิ์อีกครั้ง");
    expect(page).toContain('r.accessMode === "plans" && entitlementState.status !== "loaded"');
    expect(page).toContain('currentPlanId === null || entitlementState.status !== "loaded"');
  });
});
