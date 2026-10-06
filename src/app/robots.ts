import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Member, admin and machine endpoints. Account pages that stay
        // crawlable (/login, /membership) carry a noindex tag instead.
        disallow: ["/app", "/admin", "/auth", "/download", "/api", "/reset-password"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
