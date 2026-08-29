import { describe, expect, it } from "vitest";
import { canAccessResource } from "../entitlement";

describe("canAccessResource", () => {
  const published = (isFree: boolean) => ({ status: "published" as const, isFree });
  const draft = (isFree: boolean) => ({ status: "draft" as const, isFree });
  const archived = (isFree: boolean) => ({ status: "archived" as const, isFree });

  const freeProfile = { plan: "free", role: "member" as const };
  const paidProfile = { plan: "plus", role: "member" as const };
  const adminProfile = { plan: "free", role: "admin" as const };

  it("free user can download only free published media", () => {
    expect(canAccessResource(published(true), freeProfile)).toBe(true);
    expect(canAccessResource(published(false), freeProfile)).toBe(false);
  });

  it("paid user can download both free and member-only published media", () => {
    expect(canAccessResource(published(true), paidProfile)).toBe(true);
    expect(canAccessResource(published(false), paidProfile)).toBe(true);
  });

  it("admin can download everything, including drafts and archived resources", () => {
    expect(canAccessResource(published(true), adminProfile)).toBe(true);
    expect(canAccessResource(published(false), adminProfile)).toBe(true);
    expect(canAccessResource(draft(true), adminProfile)).toBe(true);
    expect(canAccessResource(draft(false), adminProfile)).toBe(true);
    expect(canAccessResource(archived(false), adminProfile)).toBe(true);
  });

  it("draft or archived resources are never downloadable by a non-admin, regardless of plan", () => {
    expect(canAccessResource(draft(true), freeProfile)).toBe(false);
    expect(canAccessResource(draft(false), paidProfile)).toBe(false);
    expect(canAccessResource(archived(true), freeProfile)).toBe(false);
    expect(canAccessResource(archived(false), paidProfile)).toBe(false);
  });

  it("a free resource is accessible even with no profile (not signed in / no profile row)", () => {
    expect(canAccessResource(published(true), null)).toBe(true);
    expect(canAccessResource(published(false), null)).toBe(false);
  });
});
