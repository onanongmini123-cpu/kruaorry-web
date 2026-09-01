import { describe, expect, it } from "vitest";
import { canAccessResource, entitlementLimit, hasEntitlement, type EntitlementSnapshot } from "../entitlement";

describe("canAccessResource", () => {
  const published = (isFree: boolean) => ({ status: "published" as const, isFree });
  const draft = (isFree: boolean) => ({ status: "draft" as const, isFree });
  const archived = (isFree: boolean) => ({ status: "archived" as const, isFree });

  const memberProfile = { role: "member" as const };
  const adminProfile = { role: "admin" as const };
  const ownerProfile = { role: "owner" as const };
  const freeEntitlements: EntitlementSnapshot = {
    planId: "free",
    features: { "favorites.limit": { enabled: true, limit: 10 } },
  };
  const paidEntitlements: EntitlementSnapshot = {
    planId: "plus",
    features: { "download.premium": { enabled: true, limit: null } },
  };

  it("free user can download only free published media", () => {
    expect(canAccessResource(published(true), memberProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(published(false), memberProfile, freeEntitlements)).toBe(false);
  });

  it("paid user can download both free and member-only published media", () => {
    expect(canAccessResource(published(true), memberProfile, paidEntitlements)).toBe(true);
    expect(canAccessResource(published(false), memberProfile, paidEntitlements)).toBe(true);
  });

  it("admin can download everything, including drafts and archived resources", () => {
    expect(canAccessResource(published(true), adminProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(published(false), adminProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(draft(true), adminProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(draft(false), adminProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(archived(false), adminProfile, freeEntitlements)).toBe(true);
  });

  it("owner can download everything, including drafts and archived resources", () => {
    expect(canAccessResource(published(true), ownerProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(published(false), ownerProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(draft(true), ownerProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(draft(false), ownerProfile, freeEntitlements)).toBe(true);
    expect(canAccessResource(archived(false), ownerProfile, freeEntitlements)).toBe(true);
  });

  it("draft or archived resources are never downloadable by a non-admin, regardless of plan", () => {
    expect(canAccessResource(draft(true), memberProfile, freeEntitlements)).toBe(false);
    expect(canAccessResource(draft(false), memberProfile, paidEntitlements)).toBe(false);
    expect(canAccessResource(archived(true), memberProfile, freeEntitlements)).toBe(false);
    expect(canAccessResource(archived(false), memberProfile, paidEntitlements)).toBe(false);
  });

  it("a free resource is accessible even with no profile (not signed in / no profile row)", () => {
    expect(canAccessResource(published(true), null, null)).toBe(true);
    expect(canAccessResource(published(false), null, null)).toBe(false);
  });

  it("uses capability ids rather than treating every non-free plan as paid", () => {
    const unknownPlan: EntitlementSnapshot = { planId: "custom", features: {} };
    expect(canAccessResource(published(false), memberProfile, unknownPlan)).toBe(false);
    expect(canAccessResource(published(false), memberProfile, paidEntitlements)).toBe(true);
  });

  it("reads boolean and numeric grants from one entitlement snapshot", () => {
    expect(hasEntitlement(freeEntitlements, "favorites.limit")).toBe(true);
    expect(entitlementLimit(freeEntitlements, "favorites.limit")).toBe(10);
    expect(hasEntitlement(freeEntitlements, "download.premium")).toBe(false);
    expect(entitlementLimit(freeEntitlements, "download.premium")).toBeNull();
  });
});
