import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FeaturedResourceCarousel, featuredAccessLabel, selectFeaturedResources, type FeaturedCarouselResource } from "./FeaturedResourceCarousel";

const resource = (id: string, featuredRank: number | null, overrides: Partial<FeaturedCarouselResource> = {}): FeaturedCarouselResource => ({
  id,
  title: `สื่อ ${id}`,
  meta: "พร้อมใช้ในห้องเรียน",
  description: "รายละเอียดจากรายการจริง",
  affordance: "web_app",
  coverImageUrl: null,
  requiredPlanNames: [],
  accessMode: "public",
  isNew: false,
  featuredRank,
  reviewAverage: null,
  reviewCount: 0,
  ...overrides,
});

describe("selectFeaturedResources", () => {
  it("deduplicates, orders configured ranks, and caps the carousel at five", () => {
    const rows = [
      resource("third", 30),
      resource("first", 10),
      resource("first", 10),
      resource("sixth", 60),
      resource("second", 20),
      resource("fifth", 50),
      resource("fourth", 40),
      resource("unranked", null),
    ];

    expect(selectFeaturedResources(rows).map((item) => item.id))
      .toEqual(["first", "second", "third", "fourth", "fifth"]);
  });

  it("uses unique latest-first resources only when no featured configuration exists", () => {
    const rows = [
      resource("latest", null),
      resource("next", null),
      resource("latest", null),
      resource("older", null),
    ];

    expect(selectFeaturedResources(rows).map((item) => item.id))
      .toEqual(["latest", "next", "older"]);
  });
});

describe("FeaturedResourceCarousel accessibility", () => {
  it("renders a labelled, keyboard-focusable carousel with slides, controls, and real badges", () => {
    const html = renderToStaticMarkup(React.createElement(FeaturedResourceCarousel, {
      resources: [
        resource("free", 1, { isNew: true }),
        resource("paid", 2, {
          accessMode: "plans",
          requiredPlanNames: ["Teacher"],
          reviewAverage: 4.75,
          reviewCount: 12,
        }),
      ],
    }));

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-roledescription="carousel"');
    expect(html.match(/aria-roledescription="slide"/g)).toHaveLength(2);
    expect(html).toContain('tabindex="0"');
    expect(html).toContain('aria-label="ดูสื่อก่อนหน้า"');
    expect(html).toContain('aria-label="ดูสื่อถัดไป"');
    expect(html).toContain('href="/resources/free"');
    expect(html).toContain("ใช้ได้ฟรี");
    expect(html).toContain("สำหรับ Teacher");
    expect(html).toContain("ใหม่");
    expect(html).toContain("4.8 (12)");
  });

  it("derives access copy only from the supplied access mode and plan names", () => {
    expect(featuredAccessLabel({ accessMode: "public", requiredPlanNames: [] })).toBe("ใช้ได้ฟรี");
    expect(featuredAccessLabel({ accessMode: "authenticated", requiredPlanNames: [] })).toBe("สำหรับสมาชิก");
    expect(featuredAccessLabel({ accessMode: "plans", requiredPlanNames: ["Founder", "Teacher"] }))
      .toBe("สำหรับ Founder หรือ Teacher");
    expect(featuredAccessLabel({ accessMode: "locked", requiredPlanNames: ["Ignored"] })).toBe("ยังไม่เปิดใช้งาน");
  });
});
