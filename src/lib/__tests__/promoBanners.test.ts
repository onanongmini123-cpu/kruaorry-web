import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PromoBanners } from "@/app/landing/PromoBanners";
import { moveBanner } from "@/app/admin/AdminPromoBannersPanel";
import { fitSize } from "@/lib/imageWebp";
import { bannersPayload, draftsFromRows, EMPTY_BANNER_DRAFT, isBannerImageUrl, isSafeBannerLink, parsePromoBanners, PROMO_BANNER_LIMIT } from "@/lib/promoBanners";

const IMG = "https://x.supabase.co/storage/v1/object/public/resource-covers/banners/a.webp";
const MOB = "https://x.supabase.co/storage/v1/object/public/resource-covers/banners/m.webp";
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");

describe("banner links and pictures", () => {
  it("allows only site paths and https links", () => {
    for (const ok of ["/resources", "/membership?plan=teacher", "https://example.org/page"]) expect(isSafeBannerLink(ok), ok).toBe(true);
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "http://example.org", "//evil.example", "/", "/ a", "https://u:p@example.org", "https://", "", "\\\\evil", 5, null]) {
      expect(isSafeBannerLink(bad), String(bad)).toBe(false);
    }
  });
  it("accepts only pictures from the banners folder of the public cover bucket", () => {
    expect(isBannerImageUrl(IMG)).toBe(true);
    for (const bad of ["https://x.supabase.co/storage/v1/object/public/resource-covers/previews/a.webp", "https://evil.example/a.webp", "http://x.supabase.co/storage/v1/object/public/resource-covers/banners/a.webp", "https://x.supabase.co/storage/v1/object/public/resource-covers/banners/", null]) {
      expect(isBannerImageUrl(bad), String(bad)).toBe(false);
    }
  });
});

describe("parsePromoBanners", () => {
  it("orders by position, drops bad rows, hides a bad link but keeps the picture, caps at six", () => {
    const rows = [
      { position: 2, image_url: IMG, image_mobile_url: MOB, link_url: "javascript:alert(1)", alt_text: " two " },
      { position: 1, image_url: IMG, image_mobile_url: "https://evil.example/x.webp", link_url: "/resources", alt_text: "one" },
      { position: 3, image_url: "https://evil.example/x.webp", link_url: null, alt_text: "bad picture" },
      { position: 4, image_url: IMG, link_url: null, alt_text: "  " },
      null,
      ...Array.from({ length: 8 }, (_, i) => ({ position: 10 + i, image_url: IMG, link_url: null, alt_text: `n${i}` })),
    ];
    const out = parsePromoBanners(rows);
    expect(out).toHaveLength(PROMO_BANNER_LIMIT);
    expect(out[0]).toEqual({ imageUrl: IMG, imageMobileUrl: null, linkUrl: "/resources", altText: "one" });
    expect(out[1]).toEqual({ imageUrl: IMG, imageMobileUrl: MOB, linkUrl: null, altText: "two" });
  });
  it("returns nothing for non-arrays so the section hides", () => {
    for (const bad of [null, undefined, {}, "x", 3]) expect(parsePromoBanners(bad)).toEqual([]);
  });
});

describe("bannersPayload (admin save)", () => {
  const ok = { ...EMPTY_BANNER_DRAFT, imageUrl: IMG, altText: " ประกาศ  สำคัญ ", linkUrl: " /resources " };
  it("builds the RPC list, trims, and turns days into Bangkok instants (end day is included)", () => {
    const result = bannersPayload([{ ...ok, startDate: "2030-01-01", endDate: "2030-01-31", imageMobileUrl: MOB }]);
    expect(result).toEqual({ ok: true, banners: [{ imageUrl: IMG, imageMobileUrl: MOB, linkUrl: "/resources", altText: "ประกาศ สำคัญ", isActive: true, startsAt: "2029-12-31T17:00:00.000Z", endsAt: "2030-01-31T17:00:00.000Z" }] });
  });
  it("refuses bad input with a Thai message naming the banner", () => {
    const cases: [Partial<typeof ok>, string][] = [
      [{ imageUrl: "" }, "แบนเนอร์ที่ 1: ยังไม่ได้ใส่รูปสำหรับคอม"],
      [{ linkUrl: "javascript:alert(1)" }, "ลิงก์ต้องขึ้นต้นด้วย https://"],
      [{ linkUrl: "http://example.org" }, "ลิงก์ต้องขึ้นต้นด้วย https://"],
      [{ altText: "  " }, "ข้อความ alt"],
      [{ startDate: "2030-02-01", endDate: "2030-01-01" }, "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม"],
      [{ imageMobileUrl: "https://evil.example/m.webp" }, "รูปมือถือไม่ถูกต้อง"],
    ];
    for (const [patch, text] of cases) {
      const result = bannersPayload([{ ...ok, ...patch }]);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toContain(text);
    }
    expect(bannersPayload(Array.from({ length: 7 }, () => ok)).ok).toBe(false);
    expect(bannersPayload([])).toEqual({ ok: true, banners: [] });
  });
  it("round-trips through the rows the admin reads back", () => {
    const sent = bannersPayload([{ ...ok, startDate: "2030-01-01", endDate: "2030-01-31", isActive: false }]);
    if (!sent.ok) throw new Error("expected ok");
    const back = draftsFromRows([{ position: 1, image_url: IMG, image_mobile_url: null, link_url: "/resources", alt_text: "ประกาศ สำคัญ", is_active: false, starts_at: sent.banners[0].startsAt, ends_at: sent.banners[0].endsAt }]);
    expect(back).toEqual([{ imageUrl: IMG, imageMobileUrl: "", linkUrl: "/resources", altText: "ประกาศ สำคัญ", isActive: false, startDate: "2030-01-01", endDate: "2030-01-31" }]);
  });
  it("reorders and sizes pictures", () => {
    expect(moveBanner(["a", "b", "c"], 2, -1)).toEqual(["a", "c", "b"]);
    expect(moveBanner(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(fitSize(4000, 2250, 1600)).toEqual({ width: 1600, height: 900 });
    expect(fitSize(800, 450, 1600)).toEqual({ width: 800, height: 450 });
  });
});

describe("PromoBanners view", () => {
  const banners = [
    { imageUrl: IMG, imageMobileUrl: MOB, linkUrl: "/resources", altText: "แบนเนอร์หนึ่ง" },
    { imageUrl: IMG, imageMobileUrl: MOB, linkUrl: "https://example.org/x", altText: "แบนเนอร์สอง" },
    { imageUrl: IMG, imageMobileUrl: MOB, linkUrl: null, altText: "แบนเนอร์สาม" },
  ];
  const render = (items = banners) => renderToStaticMarkup(React.createElement(PromoBanners, { banners: items }));
  it("renders nothing without banners", () => expect(render([])).toBe(""));
  it("renders accessible slides, dots and arrows; internal links stay in the site, external open a new tab safely", () => {
    const html = render();
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(3);
    expect(html).toContain('alt="แบนเนอร์หนึ่ง"');
    expect(html).toContain('href="/resources"');
    expect(html).toMatch(/href="https:\/\/example\.org\/x" target="_blank" rel="noopener noreferrer"/);
    expect(html).toContain('aria-label="แบนเนอร์ก่อนหน้า"');
    expect(html).toContain('aria-label="แบนเนอร์ถัดไป"');
    expect(html.match(/aria-label="ไปแบนเนอร์ที่ \d"/g)).toHaveLength(3);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('media="(max-width: 719px)"');
    expect(html).toContain('data-tall="true"');
    expect(html.match(/loading="eager"/g)).toHaveLength(1);
  });
  it("a single banner has no controls; the frame keeps a fixed aspect ratio; autoplay is 5 s and honours reduced motion", () => {
    const html = render([banners[0]]);
    expect(html).not.toContain("ไปแบนเนอร์ที่");
    const source = read("src/app/landing/PromoBanners.tsx");
    expect(source).toContain("AUTOPLAY_MS = 5000");
    expect(source).toContain("aspect-ratio: 16 / 9");
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toMatch(/!reduced && !userPaused && !hold/);
  });
});
