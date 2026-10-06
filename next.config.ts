import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Build identity for support: "0.1.0+0709536". The commit comes from the host
// at build time (Vercel exposes it); a local build says "local".
function buildVersion(): string {
  let version = "0.0.0";
  try {
    version = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version ?? version;
  } catch {
    // Keep the placeholder; a missing package.json must not break the build.
  }
  const commit = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local";
  return `${version}+${commit}`;
}

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: buildVersion(),
  },
  async headers() {
    return [
      {
        // Baseline hardening for every page, including /admin and /app:
        // block clickjacking from other origins and MIME sniffing. No
        // script-src CSP here on purpose; inline Next scripts and web fonts
        // would need a tested policy first.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
      {
        source: "/reset-password",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, noarchive" },
        ],
      },
    ];
  },
};

export default nextConfig;
