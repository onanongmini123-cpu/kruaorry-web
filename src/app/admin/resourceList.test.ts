import { describe, expect, it } from "vitest";
import { filterResources, matchesQuery, normalizeSearch, resourceAttention, statusCounts, type AdminResourceListItem } from "./resourceList";

const item = (over: Partial<AdminResourceListItem>): AdminResourceListItem => ({
  id: over.id ?? "id",
  title: "สื่อทดสอบ",
  meta: null,
  status: "published",
  grade_levels: ["p1"],
  slug: "test-resource",
  ...over,
});

const LIST: AdminResourceListItem[] = [
  item({ id: "a", title: "โรงงานคำไทย", meta: "เว็บเกมภาษาไทย", grade_levels: [], slug: null }),
  item({ id: "b", title: "Sentence Train", meta: "เว็บเกมภาษาอังกฤษ", slug: "sentence-train" }),
  item({ id: "c", title: "ใบงานคณิต", status: "draft", slug: null, grade_levels: [] }),
  item({ id: "d", title: "ชุดเก่า", status: "archived" }),
  item({ id: "e", title: "Kru Random", slug: undefined, grade_levels: [] }),
];

describe("resourceAttention", () => {
  it("flags only published resources", () => {
    expect(resourceAttention(LIST[2])).toEqual([]); // draft with no grade and no slug
    expect(resourceAttention(LIST[3])).toEqual([]);
  });

  it("flags a missing grade and a missing slug", () => {
    expect(resourceAttention(LIST[0])).toEqual(["grade", "slug"]);
    expect(resourceAttention(LIST[1])).toEqual([]);
  });

  it("does not flag the slug when the column could not be read (undefined)", () => {
    expect(resourceAttention(LIST[4])).toEqual(["grade"]);
  });
});

describe("matchesQuery / normalizeSearch", () => {
  it("is case- and spacing-insensitive and searches title, description line and slug", () => {
    expect(normalizeSearch("  Sentence   TRAIN ")).toBe("sentence train");
    expect(matchesQuery(LIST[1], "sentence")).toBe(true);
    expect(matchesQuery(LIST[1], "TRAIN sentence")).toBe(true);
    expect(matchesQuery(LIST[1], "ภาษาอังกฤษ")).toBe(true);
    expect(matchesQuery(LIST[1], "sentence-train")).toBe(true);
    expect(matchesQuery(LIST[1], "ไทย")).toBe(false);
  });

  it("treats an empty query as everything", () => {
    expect(matchesQuery(LIST[0], "")).toBe(true);
    expect(matchesQuery(LIST[0], "   ")).toBe(true);
  });
});

describe("filterResources", () => {
  it("filters by status chip", () => {
    expect(filterResources(LIST, { status: "published" }).map((r) => r.id)).toEqual(["a", "b", "e"]);
    expect(filterResources(LIST, { status: "draft" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterResources(LIST, { status: "archived" }).map((r) => r.id)).toEqual(["d"]);
    expect(filterResources(LIST, { status: "all" })).toHaveLength(5);
  });

  it("'attention' lists the published resources that need a look", () => {
    expect(filterResources(LIST, { status: "attention" }).map((r) => r.id)).toEqual(["a", "e"]);
  });

  it("combines the chip with the search words", () => {
    expect(filterResources(LIST, { status: "published", query: "เกม" }).map((r) => r.id)).toEqual(["a", "b"]);
    expect(filterResources(LIST, { status: "draft", query: "เกม" })).toEqual([]);
  });

  it("keeps the original order", () => {
    expect(filterResources(LIST, { query: "" }).map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("statusCounts", () => {
  it("counts each chip", () => {
    expect(statusCounts(LIST)).toEqual({ all: 5, published: 3, draft: 1, archived: 1, attention: 2 });
    expect(statusCounts([])).toEqual({ all: 0, published: 0, draft: 0, archived: 0, attention: 0 });
  });
});
