import { describe, expect, it } from "vitest";
import {
  adminViewHref,
  isActionableUpgradeRequest,
  moveFeaturedResource,
  parseAdminView,
  priorityPageSlices,
  resourceAccessLabel,
  sortAdminReports,
  sortAdminRequests,
  sortAdminReviews,
  sortAdminUpgradeRequests,
  toggleFeaturedResource,
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
