import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALLOWED_PROPERTIES, registerAnalyticsProvider, sanitizeProperties, trackEvent } from "../analytics";

describe("sanitizeProperties", () => {
  it("keeps allow-listed scalar properties only", () => {
    expect(sanitizeProperties({
      resource_id: "11111111-2222-4333-8444-555555555555",
      access_tier: "pro",
      results_count: 4,
      authenticated: false,
      email: "teacher@example.com",
      user_id: "abc",
      full_name: "ครูอรรี่",
      nested: { a: 1 },
    })).toEqual({
      resource_id: "11111111-2222-4333-8444-555555555555",
      access_tier: "pro",
      results_count: 4,
      authenticated: false,
    });
  });

  it("drops values that look like an email or a phone number, even under an allowed name", () => {
    expect(sanitizeProperties({ term: "teacher@school.ac.th", source: "081 234 5678", mode: "0812345678" })).toEqual({});
    expect(sanitizeProperties({ term: "ศัพท์ ป.3" })).toEqual({ term: "ศัพท์ ป.3" });
  });

  it("bounds strings and ignores non-finite numbers and empty text", () => {
    expect(sanitizeProperties({ term: "ก".repeat(300) }).term).toHaveLength(80);
    expect(sanitizeProperties({ results_count: Number.NaN, term: "   " })).toEqual({});
    expect(sanitizeProperties(undefined)).toEqual({});
  });

  it("has no property that could carry identity", () => {
    for (const name of ALLOWED_PROPERTIES) expect(/email|full_name|phone|user_id|token|address/.test(name), name).toBe(false);
  });
});

describe("trackEvent", () => {
  let remove: (() => void) | null = null;
  beforeEach(() => {
    // The unit environment is Node; give the module the one global it reads.
    vi.stubGlobal("window", {});
  });
  afterEach(() => {
    remove?.();
    vi.unstubAllGlobals();
  });

  it("sends a sanitized event to every registered provider", () => {
    const track = vi.fn();
    remove = registerAnalyticsProvider({ name: "test", track });
    trackEvent("resource_view", { resource_id: "r1", email: "a@b.co", access_tier: "free" });
    expect(track).toHaveBeenCalledWith({ name: "resource_view", properties: { resource_id: "r1", access_tier: "free" } });
  });

  it("feeds a page's Tag Manager dataLayer and Plausible when they exist", () => {
    const dataLayer: unknown[] = [];
    const plausible = vi.fn();
    Object.assign(globalThis.window, { dataLayer, plausible });
    trackEvent("upgrade_click", { source: "pricing", plan_id: "teacher" });
    expect(dataLayer).toEqual([{ event: "upgrade_click", source: "pricing", plan_id: "teacher" }]);
    expect(plausible).toHaveBeenCalledWith("upgrade_click", { props: { source: "pricing", plan_id: "teacher" } });
  });

  it("does nothing, quietly, when no tool is present", () => {
    expect(() => trackEvent("home_view")).not.toThrow();
  });

  it("is a no-op on the server", () => {
    vi.unstubAllGlobals();
    const track = vi.fn();
    remove = registerAnalyticsProvider({ name: "test", track });
    trackEvent("home_view");
    expect(track).not.toHaveBeenCalled();
  });

  it("never lets a failing provider break the page or starve the others", () => {
    const good = vi.fn();
    const removeBad = registerAnalyticsProvider({ name: "bad", track: () => { throw new Error("boom"); } });
    const removeGood = registerAnalyticsProvider({ name: "good", track: good });
    expect(() => trackEvent("home_view")).not.toThrow();
    expect(good).toHaveBeenCalledTimes(1);
    removeBad();
    remove = removeGood;
  });
});
