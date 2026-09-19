import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/app", "/admin", "/auth", "/download", "/api", "/reset-password"],
      },
    ],
    sitemap: "https://kruaorry-web.vercel.app/sitemap.xml",
  };
}
