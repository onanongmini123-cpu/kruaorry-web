import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node", include: ["accounting-dept/**/*.test.ts"] } });
