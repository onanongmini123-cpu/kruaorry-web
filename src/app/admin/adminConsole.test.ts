import { describe, expect, it, vi } from "vitest";
import {
  MEMBER_APP_URL,
  adminPaymentSuccessMessage,
  adminViewHref,
  createCoalescedAdminRefresh,
  installAdminActionRefresh,
  includesAdminLineSlipProvenance,
  isActionableUpgradeRequest,
  matchesAdminUpgradeSearch,
  moveFeaturedResource,
  parseAdminView,
  priorityPageSlices,
  resourceAccessLabel,
  sameAdminReportVersion,
  sameAdminRequestVersion,
  sameAdminReviewVersion,
  sameAdminSubscriptionVersion,
  sameAdminUpgradeVersion,
  sortAdminReports,
  sortAdminRequests,
  sortAdminReviews,
  sortAdminUpgradeRequests,
  toggleFeaturedResource,
  type AdminActionCounts,
} from "./adminConsole";

describe("admin console navigation", () => {
  it("keeps owner-only history unavailable to normal admins", () => {
    expect(parseAdminView("audit", false)).toBe("dash");
    expect(parseAdminView("audit", true)).toBe("audit");
    expect(parseAdminView("moderation", false)).toBe("moderation");
    expect(parseAdminView("unknown", true)).toBe("dash");
  });

  it("generates stable, shareable admin URLs", () => {
    expect(adminViewHref("dash")).toBe("/admin");
    expect(adminViewHref("content")).toBe("/admin?view=content");
  });
});

describe("admin action queues", () => {
  it("serializes slow reads, coalesces bursts, and applies only the newest cross-session snapshot", async () => {
    type Snapshot = { requests: string[]; counts: AdminActionCounts };
    const resolvers: Array<(snapshot: Snapshot) => void> = [];
    const applied: Snapshot[] = [];
    let activeLoads = 0;
    let maximumActiveLoads = 0;
    let loadCalls = 0;
    const refresh = createCoalescedAdminRefresh(
      () => {
        loadCalls += 1;
        activeLoads += 1;
        maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
        return new Promise<Snapshot>((resolve) => {
          resolvers.push((snapshot) => {
            activeLoads -= 1;
            resolve(snapshot);
          });
        });
      },
      (snapshot) => { applied.push(snapshot); },
      () => undefined,
    );

    const initialPoll = refresh.request();
    const focusRefresh = refresh.request();
    const menuRefresh = refresh.request();
    expect(loadCalls).toBe(1);
    expect(maximumActiveLoads).toBe(1);

    resolvers[0]({ requests: ["old"], counts: { requests: 1, moderation: 0, upgrades: 0 } });
    await vi.waitFor(() => expect(loadCalls).toBe(2));
    expect(applied).toEqual([]);
    expect(maximumActiveLoads).toBe(1);

    resolvers[1]({ requests: ["old", "new-from-other-session"], counts: { requests: 2, moderation: 0, upgrades: 0 } });
    await expect(Promise.all([initialPoll, focusRefresh, menuRefresh])).resolves.toEqual([true, true, true]);
    expect(applied).toEqual([
      { requests: ["old", "new-from-other-session"], counts: { requests: 2, moderation: 0, upgrades: 0 } },
    ]);
    expect(maximumActiveLoads).toBe(1);
    refresh.dispose();
  });

  it("aborts a hung read at the timeout, reports unknown, and accepts a later refresh", async () => {
    vi.useFakeTimers();
    try {
      const failures: Array<{ timedOut: boolean }> = [];
      const applied: number[] = [];
      let attempt = 0;
      let observedAbort = false;
      const refresh = createCoalescedAdminRefresh(
        (signal) => {
          attempt += 1;
          if (attempt === 2) return Promise.resolve(9);
          return new Promise<number>(() => {
            signal.addEventListener("abort", () => { observedAbort = true; }, { once: true });
          });
        },
        (value) => { applied.push(value); },
        (failure) => { failures.push(failure); },
        250,
      );

      const timedOut = refresh.request();
      await vi.advanceTimersByTimeAsync(250);
      await expect(timedOut).resolves.toBe(false);
      expect(observedAbort).toBe(true);
      expect(failures).toHaveLength(1);
      expect(failures[0]).toMatchObject({ timedOut: true });
      expect(applied).toEqual([]);

      await expect(refresh.request()).resolves.toBe(true);
      expect(applied).toEqual([9]);
      refresh.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes only for an authorized admin on load and focus without polling", () => {
    const handlers: { focus?: () => void } = {};
    let refreshCount = 0;
    const target = {
      addEventListener: (_type: "focus", listener: () => void) => { handlers.focus = listener; },
      removeEventListener: (_type: "focus", listener: () => void) => {
        if (handlers.focus === listener) delete handlers.focus;
      },
    };

    const unauthorizedCleanup = installAdminActionRefresh(target, () => { refreshCount += 1; }, false);
    expect(refreshCount).toBe(0);
    expect(handlers.focus).toBeUndefined();
    unauthorizedCleanup();

    const cleanup = installAdminActionRefresh(target, () => { refreshCount += 1; }, true);
    expect(refreshCount).toBe(1);
    handlers.focus?.();
    expect(refreshCount).toBe(2);

    cleanup();
    expect(handlers.focus).toBeUndefined();
  });

  it("detects a queue row changed since the admin rendered it", () => {
    expect(sameAdminRequestVersion(
      { id: "request", status: "pending" },
      { id: "request", status: "in_progress" },
    )).toBe(false);
    expect(sameAdminReviewVersion(
      { id: "review", moderation_status: "pending", updated_at: "old" },
      { id: "review", moderation_status: "pending", updated_at: "new" },
    )).toBe(false);
    expect(sameAdminReportVersion(
      { id: "report", status: "pending", updated_at: "same" },
      { id: "report", status: "pending", updated_at: "same" },
    )).toBe(true);
    expect(sameAdminUpgradeVersion(
      { id: "upgrade", status: "pending", payment_reported_at: "legacy", line_slip_received_at: null, plan_id: "founder", quoted_amount_thb: 299 },
      { id: "upgrade", status: "pending", payment_reported_at: "legacy", line_slip_received_at: "now", plan_id: "founder", quoted_amount_thb: 299 },
    )).toBe(false);
    expect(sameAdminSubscriptionVersion(
      { id: "subscription", status: "active", plan_id: "teacher", current_period_end: "2026-01-01" },
      { id: "subscription", status: "active", plan_id: "teacher", current_period_end: "2026-01-01" },
    )).toBe(true);
  });

  it("fills a page from prioritized database groups without hiding older actions", () => {
    expect(priorityPageSlices([60, 90], 0, 50)).toEqual([
      { groupIndex: 0, from: 0, to: 49 },
    ]);
    expect(priorityPageSlices([60, 90], 1, 50)).toEqual([
      { groupIndex: 0, from: 50, to: 59 },
      { groupIndex: 1, from: 0, to: 39 },
    ]);
    expect(priorityPageSlices([10, 15, 80], 0, 50)).toEqual([
      { groupIndex: 0, from: 0, to: 9 },
      { groupIndex: 1, from: 0, to: 14 },
      { groupIndex: 2, from: 0, to: 24 },
    ]);
  });

  it("orders new teacher requests first while preserving vote rank", () => {
    const rows = [
      { id: "done", created_at: "2026-10-03T00:00:00Z", status: "done" as const, votes: 50 },
      { id: "new-low", created_at: "2026-10-02T00:00:00Z", status: "pending" as const, votes: 2 },
      { id: "new-high", created_at: "2026-10-01T00:00:00Z", status: "pending" as const, votes: 8 },
    ];
    expect(sortAdminRequests(rows).map((row) => row.id)).toEqual(["new-high", "new-low", "done"]);
    expect(rows.map((row) => row.id)).toEqual(["done", "new-low", "new-high"]);
  });

  it("puts moderation work before completed history", () => {
    const reviews = [
      { id: "visible", created_at: "2026-10-03T00:00:00Z", moderation_status: "visible" as const },
      { id: "pending", created_at: "2026-10-01T00:00:00Z", moderation_status: "pending" as const },
    ];
    const reports = [
      { id: "resolved", created_at: "2026-10-03T00:00:00Z", status: "resolved" as const },
      { id: "working", created_at: "2026-10-02T00:00:00Z", status: "in_progress" as const },
      { id: "pending", created_at: "2026-10-01T00:00:00Z", status: "pending" as const },
    ];
    expect(sortAdminReviews(reviews).map((row) => row.id)).toEqual(["pending", "visible"]);
    expect(sortAdminReports(reports).map((row) => row.id)).toEqual(["pending", "working", "resolved"]);
  });

  it("counts only pending applications with an admin-recorded LINE slip as actionable", () => {
    const rows = [
      { id: "approved", created_at: "2026-10-03T00:00:00Z", status: "approved" as const, payment_reported_at: "2026-10-03T00:00:00Z", line_slip_received_at: "2026-10-03T00:00:00Z" },
      { id: "legacy", created_at: "2026-10-02T12:00:00Z", status: "pending" as const, payment_reported_at: "2026-10-02T00:00:00Z", line_slip_received_at: null },
      { id: "waiting", created_at: "2026-10-02T00:00:00Z", status: "pending" as const, payment_reported_at: null, line_slip_received_at: null },
      { id: "action", created_at: "2026-10-01T00:00:00Z", status: "pending" as const, payment_reported_at: "2026-10-01T00:00:00Z", line_slip_received_at: "2026-10-01T00:00:00Z" },
    ];
    expect(isActionableUpgradeRequest(rows[0])).toBe(false);
    expect(isActionableUpgradeRequest(rows[1])).toBe(false);
    expect(isActionableUpgradeRequest(rows[2])).toBe(false);
    expect(isActionableUpgradeRequest(rows[3])).toBe(true);
    expect(sortAdminUpgradeRequests(rows).map((row) => row.id)).toEqual(["action", "legacy", "waiting", "approved"]);
  });

  it("searches upgrade requests by reference, member name, or email", () => {
    const request = {
      reference_code: "KA-00001234",
      profiles: { full_name: "ครูอรรี่ ทดสอบ", email: "Teacher@example.com" },
    };

    expect(matchesAdminUpgradeSearch(request, "  ka-00001234 ")).toBe(true);
    expect(matchesAdminUpgradeSearch(request, "อรรี่")).toBe(true);
    expect(matchesAdminUpgradeSearch(request, "teacher@EXAMPLE.com")).toBe(true);
    expect(matchesAdminUpgradeSearch(request, "missing")).toBe(false);
    expect(matchesAdminUpgradeSearch(request, " ")).toBe(true);
  });

  it("keeps admin upgrade reads on legacy columns until migration 050 is ready", () => {
    expect(includesAdminLineSlipProvenance("checking")).toBe(false);
    expect(includesAdminLineSlipProvenance("unavailable")).toBe(false);
    expect(includesAdminLineSlipProvenance("ready")).toBe(true);
  });

  it("builds a copy-ready confirmation message with the member app URL", () => {
    const message = adminPaymentSuccessMessage({
      kind: "application",
      amountThb: 299,
      referenceCode: "KA-00001234",
    });

    expect(message).toContain("ชำระเงินสำเร็จแล้วค่ะ 🎉 เปิดใช้งานแพ็กเกจเรียบร้อยแล้ว กดด้านล่างเพื่อเข้าใช้งาน");
    expect(message).toContain("เข้าใช้งาน KruAorry Web");
    expect(message).toContain("KA-00001234");
    expect(message).toContain("299 บาท");
    expect(message).toContain(MEMBER_APP_URL);
    expect(MEMBER_APP_URL).toBe("https://kruaorry.com/app");
  });
});

describe("admin resource controls", () => {
  it("labels plan access using real selected plan names", () => {
    expect(resourceAccessLabel("public", [])).toBe("ฟรีทุกคน");
    expect(resourceAccessLabel("plans", ["Founder 100", "Teacher Pro"])).toBe("Founder 100, Teacher Pro");
  });

  it("enforces a five-item, duplicate-free featured order", () => {
    const full = ["a", "b", "c", "d", "e"];
    expect(toggleFeaturedResource(full, "f", true)).toEqual(full);
    expect(toggleFeaturedResource(["a"], "a", true)).toEqual(["a"]);
    expect(toggleFeaturedResource(["a", "b"], "a", false)).toEqual(["b"]);
    expect(moveFeaturedResource(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveFeaturedResource(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
  });
});
