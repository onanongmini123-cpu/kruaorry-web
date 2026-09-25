import { describe, expect, it } from "vitest";
import {
  canAccessResource,
  entitlementLimit,
  hasEntitlement,
  type EntitlementSnapshot,
  type ResourceAccessMode,
  type ResourceAccessViewer,
} from "../entitlement";

describe("canAccessResource", () => {
  const resource = (
    accessMode: ResourceAccessMode,
    requiredPlanIds: string[] = [],
    status: "draft" | "published" | "archived" = "published",
  ) => ({ status, accessMode, requiredPlanIds });
  const viewer = (
    authenticated: boolean,
    planId: string | null = null,
    role: ResourceAccessViewer["role"] = authenticated ? "member" : null,
  ): ResourceAccessViewer => ({ authenticated, role, planId });

  it("allows anonymous access only to explicitly public published resources", () => {
    expect(canAccessResource(resource("public"), viewer(false))).toBe(true);
    expect(canAccessResource(resource("authenticated"), viewer(false))).toBe(false);
    expect(canAccessResource(resource("plans", ["teacher"]), viewer(false))).toBe(false);
    expect(canAccessResource(resource("locked"), viewer(false))).toBe(false);
  });

  it("allows any signed-in member to authenticated resources", () => {
    expect(canAccessResource(resource("authenticated"), viewer(true, "free"))).toBe(true);
    expect(canAccessResource(resource("authenticated"), viewer(true, "teacher"))).toBe(true);
  });

  it("matches plan-scoped resources by exact current plan id", () => {
    const teacherOnly = resource("plans", ["teacher"]);
    expect(canAccessResource(teacherOnly, viewer(true, "free"))).toBe(false);
    expect(canAccessResource(teacherOnly, viewer(true, "founder"))).toBe(false);
    expect(canAccessResource(teacherOnly, viewer(true, "teacher"))).toBe(true);
  });

  it("keeps locked resources closed to members on every plan", () => {
    expect(canAccessResource(resource("locked"), viewer(true, "free"))).toBe(false);
    expect(canAccessResource(resource("locked"), viewer(true, "teacher"))).toBe(false);
  });

  it("lets admins and owners preview every status and access mode", () => {
    expect(canAccessResource(resource("locked", [], "draft"), viewer(true, "free", "admin"))).toBe(true);
    expect(canAccessResource(resource("locked", [], "archived"), viewer(true, "free", "owner"))).toBe(true);
  });

  it("never grants an unpublished resource to a non-admin", () => {
    expect(canAccessResource(resource("public", [], "draft"), viewer(false))).toBe(false);
    expect(canAccessResource(resource("authenticated", [], "draft"), viewer(true, "free"))).toBe(false);
    expect(canAccessResource(resource("plans", ["teacher"], "archived"), viewer(true, "teacher"))).toBe(false);
  });
});

describe("entitlement helpers", () => {
  const snapshot: EntitlementSnapshot = {
    planId: "free",
    features: { "favorites.limit": { enabled: true, limit: 10 } },
  };

  it("reads boolean and numeric grants from one entitlement snapshot", () => {
    expect(hasEntitlement(snapshot, "favorites.limit")).toBe(true);
    expect(entitlementLimit(snapshot, "favorites.limit")).toBe(10);
    expect(hasEntitlement(snapshot, "download.premium")).toBe(false);
    expect(entitlementLimit(snapshot, "download.premium")).toBeNull();
  });
});
