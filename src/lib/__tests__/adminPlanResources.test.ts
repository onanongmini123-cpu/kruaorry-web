import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ADMIN_PLAN_RESOURCES_UNAVAILABLE_MESSAGE,
  fetchAdminPlanResourceSummary,
  normalizeAdminPlanResourceSummary,
} from "../adminPlanResources";

const fixture = {
  access_counts: { free: 2, member: 3, pro: 4, locked: 1, total: 10 },
  plans: [
    { plan_id: "founder", plan_name: "Founder 100", resource_count: 2, latest_resources: ["เกมคำศัพท์", "สื่อคณิต"] },
    { plan_id: "teacher", plan_name: "Teacher", resource_count: 3, latest_resources: ["สื่อคณิต", "บิงโก"] },
  ],
  unassigned_plan_resources: { count: 1, resources: ["สื่อที่ยังไม่ได้ผูกแพ็ก"] },
};

const clientWith = (value: unknown): SupabaseClient => ({
  rpc: vi.fn().mockResolvedValue(value),
}) as unknown as SupabaseClient;

describe("admin plan resource summary", () => {
  it("accepts a complete aggregate and resource-title-only response", () => {
    expect(normalizeAdminPlanResourceSummary(fixture)).toEqual(fixture);
  });

  it("rejects malformed counts, oversized title lists, duplicate plans, and identity-shaped extras", () => {
    expect(normalizeAdminPlanResourceSummary({ ...fixture, access_counts: { ...fixture.access_counts, total: 999 } })).toBeNull();
    expect(normalizeAdminPlanResourceSummary({ ...fixture, plans: [{ ...fixture.plans[0], latest_resources: Array(6).fill("สื่อ") }] })).toBeNull();
    expect(normalizeAdminPlanResourceSummary({ ...fixture, plans: [fixture.plans[0], fixture.plans[0]] })).toBeNull();
    expect(normalizeAdminPlanResourceSummary({ ...fixture, email: "private@example.test" })).toBeNull();
  });

  it("loads and validates the read-only RPC response", async () => {
    const client = clientWith({ data: fixture, error: null });
    await expect(fetchAdminPlanResourceSummary(client)).resolves.toEqual({ data: fixture, message: null, unavailable: false });
    expect(client.rpc).toHaveBeenCalledWith("get_admin_plan_resource_summary");
  });

  it("uses a polite fallback while migration 057 is absent", async () => {
    const client = clientWith({ data: null, error: { code: "PGRST202", message: "Could not find get_admin_plan_resource_summary in schema cache" } });
    await expect(fetchAdminPlanResourceSummary(client)).resolves.toEqual({
      data: null,
      message: ADMIN_PLAN_RESOURCES_UNAVAILABLE_MESSAGE,
      unavailable: true,
    });
  });

  it("never exposes a raw service error", async () => {
    const secretDetail = "database host internal-name failed";
    const result = await fetchAdminPlanResourceSummary(clientWith({ data: null, error: { code: "XX000", message: secretDetail } }));
    expect(result.data).toBeNull();
    expect(result.message).not.toContain(secretDetail);
  });
});
