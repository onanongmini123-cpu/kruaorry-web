import { describe, expect, it } from "vitest";
import { applySelfRoleChange } from "../memberRole";

describe("applySelfRoleChange", () => {
  it("owner demoting themselves to admin: updates viewerRole, clears the audit log, and does not redirect", () => {
    const effect = applySelfRoleChange("owner", "admin", "members");
    expect(effect).toEqual({ viewerRole: "admin", clearAuditLog: true, view: null, redirectToApp: false });
  });

  it("owner demoting themselves to admin while on the audit view: leaves the owner-only view instead of staying on it", () => {
    const effect = applySelfRoleChange("owner", "admin", "audit");
    expect(effect).toEqual({ viewerRole: "admin", clearAuditLog: true, view: "members", redirectToApp: false });
  });

  it("owner demoting themselves to member: still routes to /app, same as before", () => {
    const effect = applySelfRoleChange("owner", "member", "members");
    expect(effect).toEqual({ viewerRole: "member", clearAuditLog: true, view: null, redirectToApp: true });
  });

  it("admin demoting themselves to member: still routes to /app", () => {
    const effect = applySelfRoleChange("admin", "member", "content");
    expect(effect).toEqual({ viewerRole: "member", clearAuditLog: true, view: null, redirectToApp: true });
  });

  it("no real change (re-selecting the same role): returns null — nothing is cleared, no view change, no redirect", () => {
    expect(applySelfRoleChange("owner", "owner", "audit")).toBeNull();
    expect(applySelfRoleChange("admin", "admin", "members")).toBeNull();
  });

  it("only switches away from the audit view when it was actually the current view", () => {
    const effect = applySelfRoleChange("owner", "admin", "content");
    expect(effect?.view).toBeNull();
  });
});
