import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SHARE_IMAGE, SITE_ORIGIN, absoluteUrl } from "../site";

const root = join(__dirname, "..", "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("site address", () => {
  it("derives every absolute URL from the one canonical origin", () => {
    expect(SITE_ORIGIN).toBe("https://kruaorry.com");
    expect(absoluteUrl("/")).toBe("https://kruaorry.com/");
    expect(absoluteUrl("/resources/sentence-train")).toBe("https://kruaorry.com/resources/sentence-train");
  });
});

describe("default share image", () => {
  it("is a file that actually ships in /public", () => {
    expect(DEFAULT_SHARE_IMAGE.url.startsWith("/")).toBe(true);
    expect(existsSync(join(root, "public", DEFAULT_SHARE_IMAGE.url))).toBe(true);
  });

  it("is the fallback for the whole site and for resources without a cover", () => {
    expect(read("src/app/layout.tsx")).toContain("images: [DEFAULT_SHARE_IMAGE]");
    expect(read("src/app/resources/[key]/page.tsx")).toContain(": [DEFAULT_SHARE_IMAGE]");
  });
});
