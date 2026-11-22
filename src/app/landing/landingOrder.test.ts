import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HomepageVideosSection } from "./HomepageVideosSection";

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
      "kru-discovery-hero\">",
      "<PromoBanners",
      "<FeaturedResourceCarousel",
      "<HomepageRankings",
      "<HomepageVideosSection",
      "kru-free-showcase\">",
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
