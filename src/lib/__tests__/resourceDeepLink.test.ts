import { describe, expect, it } from "vitest";
import { resourceIdFromSearch } from "../resourceDeepLink";

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
