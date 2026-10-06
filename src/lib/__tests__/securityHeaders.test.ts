import { describe, expect, it } from "vitest";
import nextConfig from "../../../next.config";

type HeaderRule = { source: string; headers: { key: string; value: string }[] };

async function rules(): Promise<HeaderRule[]> {
  return (await nextConfig.headers!()) as HeaderRule[];
}

describe("site-wide security headers", () => {
  it("blocks MIME sniffing and cross-origin framing on every route", async () => {
    const all = (await rules()).find((rule) => rule.source === "/:path*");
    expect(all?.headers).toEqual(expect.arrayContaining([
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
    ]));
  });

  it("keeps the stricter /reset-password rule last so its Referrer-Policy wins", async () => {
    const list = await rules();
    const last = list[list.length - 1];
    expect(last.source).toBe("/reset-password");
    expect(last.headers).toEqual(expect.arrayContaining([
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "no-store, max-age=0" },
    ]));
  });

  it("does not advertise the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("stamps the build version for support from the package and the commit", () => {
    expect(nextConfig.env?.NEXT_PUBLIC_APP_VERSION).toMatch(/^\d+\.\d+\.\d+\+(?:[0-9a-f]{7}|local)$/);
  });
});
