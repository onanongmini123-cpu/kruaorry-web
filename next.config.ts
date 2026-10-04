import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
