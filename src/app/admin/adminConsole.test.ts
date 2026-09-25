import { describe, expect, it } from "vitest";
import {
  adminViewHref,
  moveFeaturedResource,
  parseAdminView,
  resourceAccessLabel,
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
