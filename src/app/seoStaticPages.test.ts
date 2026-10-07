import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("indexable static pages", () => {
  it("each has its own title, description and canonical instead of the site-wide default", () => {
    const seen = new Set<string>();
    for (const page of ["terms", "privacy"]) {
      const source = readFileSync(new URL(`./${page}/page.tsx`, import.meta.url), "utf8");
      const metadata = source.match(/export const metadata[\s\S]*?\n};/)?.[0] ?? "";
      expect(metadata, page).toMatch(/title: "[^"]+"/);
      const description = metadata.match(/description: "([^"]+)"/)?.[1] ?? "";
      expect(description.length, `${page} description`).toBeGreaterThan(40);
      expect(seen.has(description), `${page} description must be unique`).toBe(false);
      seen.add(description);
      expect(metadata, page).toContain(`canonical: "/${page}"`);
    }
  });
});
