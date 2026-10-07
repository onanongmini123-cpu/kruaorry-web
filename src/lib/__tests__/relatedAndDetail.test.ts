import { describe, expect, it } from "vitest";
import { relatedResources, type RelatedCandidate } from "../relatedResources";
import { hasDetailContent, parseDetailContent } from "../resourceDetail";

function item(id: string, over: Partial<RelatedCandidate> = {}): RelatedCandidate {
  return { id, title: id, category: "ภาษาอังกฤษ", tags: [], gradeLevels: ["p1"], deliveryMode: "web_app", featuredRank: null, ...over };
}

describe("relatedResources", () => {
  const target = item("target", { tags: ["เกม", "คำศัพท์"], gradeLevels: ["p1", "p2", "p3"] });

  it("ranks same subject and shared tags above grade-only overlap and never includes itself", () => {
    const all = [
      target,
      item("math", { category: "คณิตศาสตร์", tags: ["เกม"], gradeLevels: ["p1"] }),
      item("vocab", { tags: ["เกม", "คำศัพท์"], gradeLevels: ["p2", "p3"] }),
      item("same-subject", { tags: [], gradeLevels: ["m1"] }),
    ];
    expect(relatedResources(target, all).map((r) => r.id)).toEqual(["vocab", "same-subject", "math"]);
  });

  it("drops candidates that only share a delivery mode", () => {
    const all = [target, item("unrelated", { category: "สังคม", tags: ["x"], gradeLevels: ["m6"] })];
    expect(relatedResources(target, all)).toEqual([]);
  });

  it("treats an all-grades resource as overlapping every grade", () => {
    const all = [target, item("all", { category: "วิทยาศาสตร์", gradeLevels: ["all"] })];
    expect(relatedResources(target, all).map((r) => r.id)).toEqual([]);
    const withTag = [target, item("all", { category: "วิทยาศาสตร์", tags: ["เกม"], gradeLevels: ["all"] })];
    expect(relatedResources(target, withTag).map((r) => r.id)).toEqual(["all"]);
  });

  it("is deterministic: ties break by featured rank, then title, and the list is capped", () => {
    const all = [
      target,
      ...Array.from({ length: 10 }, (_, i) => item(`r${i}`, { title: `สื่อ ${String(9 - i)}`, featuredRank: i === 3 ? 1 : null })),
    ];
    const first = relatedResources(target, all, 6);
    expect(first).toHaveLength(6);
    expect(first[0].id).toBe("r3");
    expect(relatedResources(target, [...all].reverse(), 6).map((r) => r.id)).toEqual(first.map((r) => r.id));
  });
});

describe("parseDetailContent", () => {
  it("returns null for nothing useful so the page hides every section", () => {
    for (const value of [null, undefined, "x", 3, [], {}, { objectives: [], faq: [] }, { audience: "   " }]) {
      expect(parseDetailContent(value), JSON.stringify(value)).toBeNull();
    }
    expect(hasDetailContent(null)).toBe(false);
  });

  it("keeps clean content, bounds it, and drops malformed entries", () => {
    const parsed = parseDetailContent({
      audience: "ครูประถมต้น",
      objectives: ["ฝึกคำศัพท์", "", 5, "ฝึกฟัง"],
      contents: Array.from({ length: 30 }, (_, i) => `ข้อ ${i}`),
      estimatedMinutes: 15.4,
      players: "เดี่ยวหรือทีม",
      faq: [{ question: "เล่นกี่คน", answer: "1–4 คน" }, { question: "ไม่มีคำตอบ" }, "bad"],
      previews: [{ url: "https://images.example.org/a.png", caption: "หน้าจอ" }, { url: "javascript:alert(1)" }],
    });
    expect(parsed?.audience).toBe("ครูประถมต้น");
    expect(parsed?.objectives).toEqual(["ฝึกคำศัพท์", "ฝึกฟัง"]);
    expect(parsed?.contents).toHaveLength(12);
    expect(parsed?.estimatedMinutes).toBe(15);
    expect(parsed?.faq).toEqual([{ question: "เล่นกี่คน", answer: "1–4 คน" }]);
    expect(parsed?.previews).toEqual([{ url: "https://images.example.org/a.png", caption: "หน้าจอ" }]);
  });

  it("rejects an implausible duration", () => {
    expect(parseDetailContent({ estimatedMinutes: 0, audience: "x" })?.estimatedMinutes).toBeNull();
    expect(parseDetailContent({ estimatedMinutes: 99999, audience: "x" })?.estimatedMinutes).toBeNull();
  });
});
