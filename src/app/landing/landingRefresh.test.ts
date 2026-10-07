import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(__dirname, "LandingExperience.tsx"), "utf8");

// The public front page is the busiest page and anonymous, so an open tab must
// not poll the database once a minute (the membership page re-checks capacity
// before any application anyway).
describe("landing page background refresh", () => {
  it("refreshes slowly, never while the tab is hidden, and not on every focus", () => {
    expect(source).toContain("const FOUNDER_REFRESH_INTERVAL_MS = 5 * 60_000;");
    expect(source).toContain("if (!document.hidden) refreshFounderCapacity();");
    expect(source).toContain("Date.now() - lastRefresh >= FOUNDER_REFRESH_MIN_GAP_MS");
    expect(source).not.toMatch(/setInterval\(refreshFounderCapacity,\s*60_000\)/);
    expect(source).not.toContain('addEventListener("focus", refreshFounderCapacity)');
  });
});
