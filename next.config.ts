import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/app/games/quick-race": ["./src/server/game-assets/quick-race/**/*"],
  },
};

export default nextConfig;
