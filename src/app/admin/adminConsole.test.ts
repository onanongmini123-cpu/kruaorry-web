import { describe, expect, it } from "vitest";
import {
  ADMIN_ACTION_REFRESH_INTERVAL_MS,
  adminViewHref,
  createLatestAdminActionCountRefresh,
  installAdminActionRefresh,
  isActionableUpgradeRequest,
  loadAdminActionCounts,
  moveFeaturedResource,
  parseAdminView,
  priorityPageSlices,
  resourceAccessLabel,
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
  it("loads the exact four RLS-scoped queue counts and combines moderation work", async () => {
    const calls: string[] = [];
    const result = await loadAdminActionCounts({
      requests: async () => { calls.push("requests"); return { count: 2, error: null }; },
      reviews: async () => { calls.push("reviews"); return { count: 3, error: null }; },
      reports: async () => { calls.push("reports"); return { count: 4, error: null }; },
      upgrades: async () => { calls.push("upgrades"); return { count: 5, error: null }; },
    }, true);

    expect(calls).toEqual(["requests", "reviews", "reports", "upgrades"]);
    expect(result).toEqual({ requests: 2, moderation: 7, upgrades: 5 });
  });

  it("turns a failed queue query into an unknown badge without hiding other failures", async () => {
    const failure = new Error("count denied");
    const result = await loadAdminActionCounts({
      requests: async () => ({ count: null, error: failure }),
      reviews: async () => ({ count: 3, error: null }),
      reports: async () => ({ count: null, error: failure }),
      upgrades: async () => ({ count: null, error: failure }),
    }, true);

    expect(result).toEqual({ requests: null, moderation: null, upgrades: null });
  });

  it("reflects another-session increase and a handled-action decrease on later refreshes", async () => {
    const results = [
      { requests: 2, moderation: 4, upgrades: 1 },
      { requests: 3, moderation: 4, upgrades: 1 },
      { requests: 2, moderation: 4, upgrades: 1 },
    ];
    const applied: AdminActionCounts[] = [];
    const countRefresh = createLatestAdminActionCountRefresh(
      async () => results.shift() ?? { requests: null, moderation: null, upgrades: null },
      (counts) => { applied.push(counts); },
    );

    await countRefresh.refresh();
    await countRefresh.refresh();
    await countRefresh.refresh();

    expect(applied.map((counts) => counts.requests)).toEqual([2, 3, 2]);
  });

  it("ignores an older overlapping response and any response after disposal", async () => {
    let resolveOlder!: (counts: { requests: number; moderation: number; upgrades: number }) => void;
    let resolveLatest!: (counts: { requests: number; moderation: number; upgrades: number }) => void;
    const older = new Promise<{ requests: number; moderation: number; upgrades: number }>((resolve) => { resolveOlder = resolve; });
    const latest = new Promise<{ requests: number; moderation: number; upgrades: number }>((resolve) => { resolveLatest = resolve; });
    const loads = [older, latest];
    const applied: AdminActionCounts[] = [];
    const countRefresh = createLatestAdminActionCountRefresh(
      () => loads.shift() ?? Promise.resolve({ requests: 0, moderation: 0, upgrades: 0 }),
      (counts) => { applied.push(counts); },
    );

    const olderRefresh = countRefresh.refresh();
    const latestRefresh = countRefresh.refresh();
    resolveLatest({ requests: 9, moderation: 8, upgrades: 7 });
    expect(await latestRefresh).toBe(true);
    resolveOlder({ requests: 1, moderation: 1, upgrades: 1 });
    expect(await olderRefresh).toBe(false);
    expect(applied).toEqual([{ requests: 9, moderation: 8, upgrades: 7 }]);

    const afterDispose = countRefresh.refresh();
    countRefresh.dispose();
    expect(await afterDispose).toBe(false);
    expect(applied).toHaveLength(1);
  });

  it("refreshes only for an authorized admin, then removes focus and timer hooks", () => {
    const handlers: { focus?: () => void; interval?: () => void } = {};
    let clearedInterval: number | null = null;
    let installedIntervals = 0;
    let refreshCount = 0;
    const target = {
      addEventListener: (_type: "focus", listener: () => void) => { handlers.focus = listener; },
      removeEventListener: (_type: "focus", listener: () => void) => {
        if (handlers.focus === listener) delete handlers.focus;
      },
      setInterval: (handler: () => void, timeout: number) => {
        expect(timeout).toBe(ADMIN_ACTION_REFRESH_INTERVAL_MS);
        installedIntervals += 1;
        handlers.interval = handler;
        return 42;
      },
      clearInterval: (id: number) => { clearedInterval = id; },
    };

    const unauthorizedCleanup = installAdminActionRefresh(target, () => { refreshCount += 1; }, false);
    expect(refreshCount).toBe(0);
    expect(installedIntervals).toBe(0);
    expect(handlers.focus).toBeUndefined();
    unauthorizedCleanup();

    const cleanup = installAdminActionRefresh(target, () => { refreshCount += 1; }, true);
    expect(refreshCount).toBe(1);
    expect(installedIntervals).toBe(1);
    handlers.focus?.();
    handlers.interval?.();
    expect(refreshCount).toBe(3);

    cleanup();
    expect(handlers.focus).toBeUndefined();
    expect(clearedInterval).toBe(42);
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

  it("counts only payment-reported pending applications as admin-actionable", () => {
    const rows = [
      { id: "approved", created_at: "2026-10-03T00:00:00Z", status: "approved" as const, payment_reported_at: "2026-10-03T00:00:00Z" },
      { id: "waiting", created_at: "2026-10-02T00:00:00Z", status: "pending" as const, payment_reported_at: null },
      { id: "action", created_at: "2026-10-01T00:00:00Z", status: "pending" as const, payment_reported_at: "2026-10-01T00:00:00Z" },
    ];
    expect(isActionableUpgradeRequest(rows[0])).toBe(false);
    expect(isActionableUpgradeRequest(rows[1])).toBe(false);
    expect(isActionableUpgradeRequest(rows[2])).toBe(true);
    expect(sortAdminUpgradeRequests(rows).map((row) => row.id)).toEqual(["action", "waiting", "approved"]);
  });
});

describe("admin resource controls", () => {
  it("labels plan access using real selected plan names", () => {
    expect(resourceAccessLabel("public", [])).toBe("ฟรีทุกคน");
    expect(resourceAccessLabel("plans", ["Founder 100", "Teacher"])).toBe("Founder 100, Teacher");
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
