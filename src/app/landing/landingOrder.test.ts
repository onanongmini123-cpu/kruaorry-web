import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HomepageVideosSection } from "./HomepageVideosSection";
import { FreeSamplesRow, pickFreeSamples } from "./FreeSamplesRow";

const source = readFileSync(path.join(process.cwd(), "src/app/landing/LandingExperience.tsx"), "utf8");

describe("homepage order and hero copy", () => {
  it("shows the big question as the page heading and the new tagline; the old sentence is gone", () => {
    expect(source).toContain("<h1>วันนี้มีอะไรให้ครูอรรี่ช่วยคะ?</h1>");
    expect(source).toContain("KruAorry.com ผู้ช่วยครูและผู้ปกครองในยุคดิจิทัล");
    expect(source).not.toContain("เกม สื่อ และเครื่องมือที่ช่วยให้ครูเตรียมสอนน้อยลง");
    expect(source).toContain('id="landing-discovery-search"');
  });

  it("sections appear in the agreed order", () => {
    const at = (needle: string) => {
      const index = source.indexOf(needle);
      expect(index, needle).toBeGreaterThan(-1);
      return index;
    };
    const order = [
      "className={`kru-discovery-hero${",
      "<MyHome ",
      "<PromoBanners",
      "<FeaturedResourceCarousel",
      "<HomepageRankings",
      "kru-free-showcase\">",
      "<HomepageVideosSection",
      "<nav className=\"kru-entry-cards\"",
      "<PricingSection",
    ].map(at);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("the four entry cards keep their wording", () => {
    for (const text of ["เกมในห้องเรียน", "สื่อพร้อมสอน", "เครื่องมือครู", "Teacher Pro"]) expect(source).toContain(`title: "${text}"`);
  });
});

describe("HomepageVideosSection", () => {
  const video = (n: number) => ({ videoId: String(n).repeat(11), title: `คลิป ${n}` });
  const render = (n: number) => renderToStaticMarkup(React.createElement(HomepageVideosSection, { videos: Array.from({ length: n }, (_, i) => video(i + 1)) }));
  it("shows up to four clips: a 2x2 grid on desktop and one swipeable row on phones", () => {
    const html = render(4);
    expect(html.match(/<figure/g)).toHaveLength(4);
    expect(html).toContain("repeat(2, minmax(0, 1fr))");
    expect(html).toContain("overflow-x: auto");
    expect(html).toContain('class="kru-home-videos__grid"');
  });
  it("a single clip is centred, and no clip hides the section", () => {
    expect(render(1)).toContain('class="kru-home-videos__grid kru-home-videos__grid--single"');
    expect(render(0)).toBe("");
  });
});

describe("free media row", () => {
  const item = (id: string, publishedAt: string | null, accessMode = "public") => ({ id, accessMode, publishedAt });
  const render = (n: number) => renderToStaticMarkup(React.createElement(FreeSamplesRow, {
    samples: Array.from({ length: n }, (_, i) => ({
      id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`, slug: `r-${i + 1}`, title: `ฟรี ${i + 1}`, meta: "", description: "d", category: null, affordance: "web_app", coverImageUrl: null,
      tags: [], gradeLevels: [], accessMode: "public", requiredPlanIds: [], requiredPlanNames: [], free: true, isNew: false, fileSize: null, featuredRank: null, reviewAverage: null, reviewCount: 0,
    })) as never,
  }));

  it("picks only free resources, newest first, dated ones before undated, capped", () => {
    const picked = pickFreeSamples([item("old", "2026-01-01"), item("pro", "2026-12-01", "plans"), item("none", null), item("new", "2026-11-01"), item("mid", "2026-06-01")]);
    expect(picked.map((r) => r.id)).toEqual(["new", "mid", "old", "none"]);
    expect(pickFreeSamples(Array.from({ length: 30 }, (_, i) => item(`r${i}`, `2026-01-${String((i % 28) + 1).padStart(2, "0")}`)))).toHaveLength(12);
  });
  it("shows the heading 'สื่อฟรี ใช้ได้ทันที' and one card per item", () => {
    const html = render(4);
    expect(html).toContain("สื่อฟรี ใช้ได้ทันที");
    expect(html.match(/<article/g)).toHaveLength(4);
    expect(html).not.toContain("kru-free-row__arrows\" aria-label");
  });
  it("more than four: arrow buttons and a scrolling track; fewer: centred, no arrows", () => {
    const many = render(7);
    expect(many.match(/<article/g)).toHaveLength(7);
    expect(many).toContain("ดูสื่อฟรีถัดไป");
    const few = render(2);
    expect(few).toContain('data-count="2"');
    expect(few).not.toContain("ดูสื่อฟรีถัดไป");
    expect(few).toContain("justify-content: center");
  });
  it("four fill the row exactly on desktop; the track swipes on phones", () => {
    const css = render(4);
    expect(css).toContain("calc((100% - 3 * var(--sp-4)) / 4)");
    expect(css).toContain("overflow-x: auto");
    expect(css).toContain("scroll-snap-type: x proximity");
  });
  it("order: free media comes before the videos, and the 'see all' button stays", () => {
    expect(source.indexOf("<FreeSamplesRow")).toBeLessThan(source.indexOf("<HomepageVideosSection"));
    expect(source).toContain("ดูสื่อฟรีทั้งหมด");
  });
});
