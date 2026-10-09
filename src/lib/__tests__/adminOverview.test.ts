import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_OVERVIEW_UNAVAILABLE_MESSAGE,
  fetchAdminOverviewInsights,
  normalizeAdminOverviewInsights,
} from "../adminOverview";

const fixture = {
  as_of: "2026-11-01T00:00:00+07:00",
  timezone: "Asia/Bangkok",
  periods: {
    month_start: "2026-11-01T00:00:00+07:00",
    new_members_7_days_start: "2026-10-26T00:00:00+07:00",
    new_members_30_days_start: "2026-10-03T00:00:00+07:00",
  },
  revenue: { month_confirmed_thb: 299, all_time_confirmed_thb: 898, first_confirmed_at: "2026-10-01T10:00:00+07:00", refunds_supported: false },
  premium_memberships: { active_count: 2, expiring_within_30_days_count: 1 },
  new_members: { last_7_days_count: 3, last_30_days_count: 4 },
  founder_seats: { used: 5, capacity: 100 },
  application_funnel: { total_members: 7, requested_premium: 4, approved_premium: 2 },
  favorites: { top_published_resources: [{ title: "เกมภาษาไทย", heart_count: 6 }], published_without_hearts_count: 2 },
  reviews: { minimum_review_count: 3, top_published_resources: [{ title: "เกมคณิต", average_rating: 4.67, review_count: 3 }] },
  content_breakdown: [{ grade_level: "p1", category: "คณิตศาสตร์", resource_count: 2 }],
};

const clientWith = (value: unknown): SupabaseClient => ({
  rpc: vi.fn().mockResolvedValue(value),
}) as unknown as SupabaseClient;

describe("admin overview insights", () => {
  it("accepts a complete aggregate-only response", () => {
    expect(normalizeAdminOverviewInsights(fixture)).toEqual(fixture);
  });

  it("rejects malformed, negative, or personally identifying-shaped rows", () => {
    expect(normalizeAdminOverviewInsights({ ...fixture, revenue: { ...fixture.revenue, all_time_confirmed_thb: -1 } })).toBeNull();
    expect(normalizeAdminOverviewInsights({ ...fixture, favorites: { ...fixture.favorites, top_published_resources: [{ title: "", heart_count: 1 }] } })).toBeNull();
    expect(normalizeAdminOverviewInsights({ ...fixture, timezone: "UTC" })).toBeNull();
  });

  it("loads the RPC without client-supplied report dates", async () => {
    const client = clientWith({ data: fixture, error: null });
    await expect(fetchAdminOverviewInsights(client)).resolves.toEqual({ data: fixture, message: null, unavailable: false });
    expect(client.rpc).toHaveBeenCalledWith("get_admin_overview_insights");
  });

  it("uses the polite fallback while migration 056 is absent", async () => {
    const client = clientWith({ data: null, error: { code: "PGRST202", message: "Could not find get_admin_overview_insights in schema cache" } });
    await expect(fetchAdminOverviewInsights(client)).resolves.toEqual({
      data: null,
      message: ADMIN_OVERVIEW_UNAVAILABLE_MESSAGE,
      unavailable: true,
    });
  });

  it("never exposes a raw service error", async () => {
    const secretDetail = "database host internal-name failed";
    const result = await fetchAdminOverviewInsights(clientWith({ data: null, error: { code: "XX000", message: secretDetail } }));
    expect(result.data).toBeNull();
    expect(result.message).not.toContain(secretDetail);
  });
});
