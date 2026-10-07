import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..", "..");
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
};
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string }>;
};

function atLeast(version: string, minimum: readonly [number, number, number]): boolean {
  const [major, minor, patch] = version.split(/[.-]/).map(Number);
  const parts = [major, minor, patch];
  for (let index = 0; index < 3; index += 1) {
    if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
  }
  return true;
}

describe("dependencies", () => {
  it("ships only the runtime packages the app uses (a new one must be added here on purpose)", () => {
    expect(Object.keys(packageJson.dependencies).sort()).toEqual([
      "@supabase/ssr",
      "@supabase/supabase-js",
      "lucide-react",
      "next",
      "react",
      "react-dom",
      "tus-js-client",
    ]);
  });

  it("keeps Next.js on a release that has the next/og remote-code-execution fix (GHSA-vcvr-r3jv-pc5j, fixed in 16.3.6)", () => {
    const locked = lock.packages["node_modules/next"]?.version ?? "0.0.0";
    expect(locked).toBe(packageJson.dependencies.next);
    expect(atLeast(locked, [16, 3, 6])).toBe(true);
  });

  it("keeps the lint config on the same Next.js release as the framework", () => {
    expect(packageJson.devDependencies["eslint-config-next"]).toBe(packageJson.dependencies.next);
  });

  it("keeps the optional image library on a release with the librsvg fix (sharp 0.35.5)", () => {
    const sharp = lock.packages["node_modules/sharp"]?.version;
    // sharp is optional (only used by next/image, which this app does not use); when present it must be patched.
    if (sharp) expect(atLeast(sharp, [0, 35, 5])).toBe(true);
  });
});
