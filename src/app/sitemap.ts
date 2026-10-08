import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";
import { resourceHref } from "@/lib/resourceUrl";
import { loadPublicResources } from "./resources/data";

// Built on every request, on purpose. A route-level cache (`revalidate`) did not
// refresh this file on the host: the cached copy stayed in place for hours
// (age 5579 s, x-vercel-cache: HIT) after the catalogue changed, so new and
// renamed resources never reached search engines without a redeploy. Freshness
// now comes from the shared catalogue cache (5 minutes, see resources/data.ts),
// which does refresh, and a transient database error is never kept around.
export const dynamic = "force-dynamic";

/**
 * Public, indexable pages only: the landing page, the library, legal pages and
 * every resource that is open (or open to members). Member and account pages
 * (/app, /admin, /login, /membership, downloads) are deliberately absent.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/resources"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
  ];

  const catalog = await loadPublicResources();
  if (catalog.status !== "ready") return pages;

  const resourcePages: MetadataRoute.Sitemap = catalog.resources
    .filter((resource) => resource.accessMode !== "locked")
    .map((resource) => ({
      url: absoluteUrl(resourceHref(resource)),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  return [...pages, ...resourcePages];
}
