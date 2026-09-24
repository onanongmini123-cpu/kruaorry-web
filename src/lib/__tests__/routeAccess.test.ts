import { describe, expect, it } from "vitest";
import { canAccessAdminConsole, canAccessMemberExperience, isProtectedAppPath } from "../routeAccess";

describe("route access", () => {
  it("protects only the member and admin application route families", () => {
    expect(isProtectedAppPath("/app")).toBe(true);
    expect(isProtectedAppPath("/app/settings")).toBe(true);
    expect(isProtectedAppPath("/admin")).toBe(true);
    expect(isProtectedAppPath("/admin/members")).toBe(true);
    expect(isProtectedAppPath("/application")).toBe(false);
    expect(isProtectedAppPath("/resources")).toBe(false);
  });

  it("lets admins preview the member experience without changing role", () => {
    expect(canAccessMemberExperience("member")).toBe(true);
    expect(canAccessMemberExperience("admin")).toBe(true);
    expect(canAccessMemberExperience("owner")).toBe(true);
  });

  it("never grants the admin console to a normal member", () => {
    expect(canAccessAdminConsole("member")).toBe(false);
    expect(canAccessAdminConsole("admin")).toBe(true);
    expect(canAccessAdminConsole("owner")).toBe(true);
    expect(canAccessAdminConsole(undefined)).toBe(false);
  });
});
