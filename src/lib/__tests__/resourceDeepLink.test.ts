import { describe, expect, it } from "vitest";
import { appDiscoveryStateFromSearch, resourceIdFromSearch } from "../resourceDeepLink";

describe("resourceIdFromSearch", () => {
  const resources = [{ id: "published-1" }, { id: "published-2" }];

  it("opens only a resource already loaded for this member", () => {
    expect(resourceIdFromSearch("?resource=published-2", resources)).toBe("published-2");
    expect(resourceIdFromSearch("?resource=draft-1", resources)).toBeNull();
  });

  it("ignores missing or ambiguous resource targets", () => {
    expect(resourceIdFromSearch("", resources)).toBeNull();
    expect(resourceIdFromSearch("?resource=published-1&resource=published-2", resources)).toBeNull();
  });
});

describe("appDiscoveryStateFromSearch", () => {
  it("restores known member views and bounded discovery filters", () => {
    expect(appDiscoveryStateFromSearch("?view=favorites&q=%E0%B9%80%E0%B8%A8%E0%B8%A9%E0%B8%AA%E0%B9%88%E0%B8%A7%E0%B8%99&category=%E0%B8%84%E0%B8%93%E0%B8%B4%E0%B8%95%E0%B8%A8%E0%B8%B2%E0%B8%AA%E0%B8%95%E0%B8%A3%E0%B9%8C&grade=p4"))
      .toEqual({ view: "favorites", query: "เศษส่วน", category: "คณิตศาสตร์", grade: "p4" });
  });

  it("rejects ambiguous or unknown view state", () => {
    expect(appDiscoveryStateFromSearch("?view=admin&q=a&q=b")).toEqual({ view: "home", query: "", category: "", grade: "" });
    expect(appDiscoveryStateFromSearch("?view=library&grade=%E0%B8%9B.2").grade).toBe("");
  });
});
