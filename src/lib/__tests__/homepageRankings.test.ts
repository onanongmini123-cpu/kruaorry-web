import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildRankingRows, parseHomepageRankings, RANKING_MIN_ITEMS } from "@/lib/homepageRankings";
import { HomepageRankings } from "@/app/landing/HomepageRankings";
import { ResourceCard } from "@/components/ui/ResourceCard";
import type { Resource } from "@/lib/data";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const resource = (n: number): Resource => ({
  id: uuid(n), title: `สื่อ ${n}`, meta: "", description: null, category: "ภาษาอังกฤษ", affordance: "web_app", coverImageUrl: null,
  tags: [], gradeLevels: ["p1"], accessMode: "public", requiredPlanIds: [], requiredPlanNames: [], free: true, isNew: false,
  fileSize: null, featuredRank: null, reviewAverage: null, reviewCount: 0,
});
const catalogue = Array.from({ length: 12 }, (_, i) => resource(i + 1));
const entries = (...ns: number[]) => ns.map((n) => ({ id: uuid(n) }));

describe("homepage rankings data", () => {
  it("validates the database answer and keeps ids and counts only", () => {
    const parsed = parseHomepageRankings({
      hearts: [{ id: uuid(1), count: 5 }, { id: "not-a-uuid" }, null, { id: uuid(1) }],
      popular: { basis: "30d", items: entries(2, 3) },
      newest: entries(4),
      heart_counts: { [uuid(1)]: 5, [uuid(2)]: 0, [uuid(3)]: -1, "bad": 2, [uuid(4)]: 1.5, [uuid(5)]: 3 },
      user_id: "secret", email: "secret@example.com",
    });
    expect(parsed).toEqual({
      hearts: [uuid(1)], popular: [uuid(2), uuid(3)], popularBasis: "30d", newest: [uuid(4)],
      heartCounts: { [uuid(1)]: 5, [uuid(5)]: 3 },
    });
    expect(JSON.stringify(parsed)).not.toMatch(/secret|user_id|email/);
    for (const bad of [null, undefined, "x", 3, []]) expect(parseHomepageRankings(bad)).toBeNull();
    expect(parseHomepageRankings({ popular: { basis: "weird", items: [] } })?.popularBasis).toBe("all_time");
  });

  it("builds a row only when it has at least three published items, skips ids missing from the catalogue, keeps order", () => {
    const rows = buildRankingRows({
      hearts: [uuid(3), uuid(99), uuid(1), uuid(2)],
      popular: [uuid(4), uuid(5)],
      popularBasis: "30d",
      newest: [uuid(6), uuid(7), uuid(8)],
      heartCounts: {},
    }, catalogue);
    expect(RANKING_MIN_ITEMS).toBe(3);
    expect(rows.map((row) => row.key)).toEqual(["newest", "hearts"]);
    expect(rows[1].items.map((item) => item.id)).toEqual([uuid(3), uuid(1), uuid(2)]);
    expect(rows[0].items).toHaveLength(3);
  });

  it("caps a row at ten and returns no rows without rankings", () => {
    const rows = buildRankingRows({ hearts: catalogue.map((item) => item.id), popular: [], popularBasis: "all_time", newest: [], heartCounts: {} }, catalogue);
    expect(rows[0].items).toHaveLength(10);
    expect(buildRankingRows(null, catalogue)).toEqual([]);
  });

  it("never lists an item that is not in the (published-only) catalogue, so a draft id is dropped", () => {
    const rows = buildRankingRows({ hearts: [uuid(100), uuid(101), uuid(102)], popular: [], popularBasis: "all_time", newest: [], heartCounts: {} }, catalogue);
    expect(rows).toEqual([]);
  });
});

describe("homepage rankings view", () => {
  it("renders nothing when no row qualifies (the section stays hidden)", () => {
    expect(renderToStaticMarkup(React.createElement(HomepageRankings, { rows: [], heartCounts: {} }))).toBe("");
  });

  it("renders the three Thai headings with cards, tier badge, tags and the heart count", () => {
    const rows = buildRankingRows({
      hearts: [uuid(1), uuid(2), uuid(3)], popular: [uuid(4), uuid(5), uuid(6)], popularBasis: "30d", newest: [uuid(7), uuid(8), uuid(9)], heartCounts: { [uuid(1)]: 12 },
    }, catalogue);
    const html = renderToStaticMarkup(React.createElement(HomepageRankings, { rows, heartCounts: { [uuid(1)]: 12 } }));
    for (const heading of ["❤️ ครูกดหัวใจมากที่สุด", "🔥 ยอดนิยม", "🆕 ใหม่ล่าสุด"]) expect(html).toContain(heading);
    // Order on the page: newest, then popular, then most hearted.
    expect(html.indexOf("🆕 ใหม่ล่าสุด")).toBeLessThan(html.indexOf("🔥 ยอดนิยม"));
    expect(html.indexOf("🔥 ยอดนิยม")).toBeLessThan(html.indexOf("❤️ ครูกดหัวใจมากที่สุด"));
    expect(html).toContain("ใช้ฟรี");
    expect(html).toContain("ครูกดหัวใจ 12 คน");
    expect(html.match(/<article/g)).toHaveLength(9);
    expect(html).toContain("tabindex=\"0\"");
  });

  it("shows the heart chip only above zero", () => {
    const card = (heartCount?: number) => renderToStaticMarkup(React.createElement(ResourceCard, { title: "x", deliveryMode: "web_app", accessTier: "free", href: "/x", heartCount }));
    expect(card(3)).toContain("ครูกดหัวใจ 3 คน");
    expect(card(0)).not.toContain("ครูกดหัวใจ");
    expect(card(undefined)).not.toContain("ครูกดหัวใจ");
  });
});
