import { describe, expect, it } from "vitest";
import { redactAnalyticsUrl } from "../analyticsUrl";

describe("redactAnalyticsUrl", () => {
  it("removes query strings and fragments from page views", () => {
    expect(redactAnalyticsUrl({
      type: "pageview",
      url: "https://kruaorry.com/reset-password?token=secret#code",
    })).toEqual({ type: "pageview", url: "https://kruaorry.com/reset-password" });
  });

  it("drops paths with likely private contact details", () => {
    expect(redactAnalyticsUrl({ type: "pageview", url: "https://kruaorry.com/teacher%40school.example" })).toBeNull();
    expect(redactAnalyticsUrl({ type: "event", url: "https://kruaorry.com/0812345678" })).toBeNull();
  });

  it("drops malformed URLs rather than reporting them verbatim", () => {
    expect(redactAnalyticsUrl({ type: "pageview", url: "not a URL?email=teacher@example.com" })).toBeNull();
    expect(redactAnalyticsUrl({ type: "pageview", url: "https://kruaorry.com/%ZZ" })).toBeNull();
  });
});
