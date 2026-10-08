import { describe, expect, it, vi } from "vitest";
import type { PublicResource } from "./resources/catalog";

vi.mock("./resources/data", () => ({ loadPublicResources: vi.fn() }));

import { loadPublicResources } from "./resources/data";
import sitemap, * as sitemapModule from "./sitemap";

const UUID = "4cf231ef-9488-4239-b633-96393c251a72";

function resource(id: string, slug: string | null, accessMode: PublicResource["accessMode"] = "public"): PublicResource {
  return {
    id, slug, title: id, meta: "", description: "", category: "", gradeLevels: [], deliveryMode: "web_app",
    coverImageUrl: null, tags: [], accessMode, isFree: true, isNew: false, requiredPlanIds: [],
    requiredPlanNames: [], featuredRank: null, reviewAverage: null, reviewCount: 0, detail: null,
  };
}

const STATIC_PAGES = [
  "https://kruaorry.com/",
  "https://kruaorry.com/resources",
  "https://kruaorry.com/terms",
  "https://kruaorry.com/privacy",
];

describe("sitemap", () => {
  it("lists the readable address of a resource that has a slug and the UUID address of one that has none", async () => {
    vi.mocked(loadPublicResources).mockResolvedValue({
      status: "ready",
      resources: [resource("86afb9c3-20f2-4ab6-9ebc-9a454b36692b", "sentence-train"), resource(UUID, null)],
    });
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toEqual([
      ...STATIC_PAGES,
      "https://kruaorry.com/resources/sentence-train",
      `https://kruaorry.com/resources/${UUID}`,
    ]);
  });

  it("leaves locked resources out", async () => {
    vi.mocked(loadPublicResources).mockResolvedValue({
      status: "ready",
      resources: [resource("a", "open-one"), resource("b", "coming-soon", "locked")],
    });
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain("https://kruaorry.com/resources/open-one");
    expect(urls).not.toContain("https://kruaorry.com/resources/coming-soon");
  });

  it("still lists the static pages when the catalogue cannot be read", async () => {
    vi.mocked(loadPublicResources).mockResolvedValue({ status: "unavailable", resources: [] });
    expect((await sitemap()).map((entry) => entry.url)).toEqual(STATIC_PAGES);
  });

  it("is built on every request instead of being served from a route cache", () => {
    // The route-level cache stayed stale for hours on the host (see the comment in sitemap.ts).
    expect(sitemapModule.dynamic).toBe("force-dynamic");
    expect((sitemapModule as Record<string, unknown>).revalidate).toBeUndefined();
  });
});
