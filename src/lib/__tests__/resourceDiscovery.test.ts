import { describe, expect, it } from "vitest";
import {
  filterDiscoveredResources,
  normalizeDiscoveryFilters,
  resourceDiscoveryHref,
} from "../resourceDiscovery";

const resources = [
  {
    id: "thai-p2",
    title: "เกมจับคู่คำไทย",
    meta: "กิจกรรมพร้อมสอน",
    description: "ฝึกอ่านคำและจับคู่ภาพ",
    category: "ภาษาไทย",
    tags: ["เกม", "อ่านออกเสียง"],
    gradeLevels: ["p2"],
    isFree: true,
    accessMode: "authenticated" as const,
  },
  {
    id: "math-p4",
    title: "ใบงานเศษส่วน",
    meta: "ใบงานพร้อมเฉลย",
    description: "แบบฝึกคณิตศาสตร์เรื่องเศษส่วน",
    category: "คณิตศาสตร์",
    tags: ["ใบงาน"],
    gradeLevels: ["p4"],
    isFree: false,
    accessMode: "plans" as const,
  },
  {
    id: "thai-p4",
    title: "อ่านจับใจความ",
    meta: "แบบฝึกภาษาไทย",
    description: "กิจกรรมอ่านเรื่องสั้น",
    category: "ภาษาไทย",
    tags: ["ใบงาน"],
    gradeLevels: ["p4"],
    isFree: false,
    accessMode: "locked" as const,
  },
  {
    id: "all-grades",
    title: "เกมทบทวนทุกระดับ",
    meta: "กิจกรรมปรับใช้ได้ทุกชั้น",
    description: "ครูเลือกความยากให้เหมาะกับผู้เรียนได้",
    category: "กิจกรรม",
    tags: ["เกม"],
    gradeLevels: ["all"],
    isFree: true,
    accessMode: "public" as const,
  },
];

describe("resource discovery", () => {
  it("combines keyword, category, grade, and access filters", () => {
    expect(filterDiscoveredResources(resources, {
      query: "ใบงาน",
      category: "คณิตศาสตร์",
      grade: "p4",
      access: "member",
    }).map((resource) => resource.id)).toEqual(["math-p4"]);
  });

  it("searches structured grades and descriptive metadata without guessing grades from titles", () => {
    expect(filterDiscoveredResources(resources, { query: "ป.2" }).map((resource) => resource.id)).toEqual(["thai-p2"]);
    expect(filterDiscoveredResources(resources, { grade: "p2" }).map((resource) => resource.id)).toEqual(["thai-p2", "all-grades"]);
    expect(filterDiscoveredResources(resources, { grade: "p3" }).map((resource) => resource.id)).toEqual(["all-grades"]);
    expect(filterDiscoveredResources(resources, { grade: "all" }).map((resource) => resource.id)).toEqual(["all-grades"]);
  });

  it("normalizes Thai-compatible text and ignores unsupported access values", () => {
    expect(filterDiscoveredResources(resources, { query: "  อ่านออกเสียง  ", access: "free" })).toEqual([resources[0]]);
    expect(normalizeDiscoveryFilters({ access: "unknown" as never })).toEqual({
      query: "",
      category: "",
      grade: "",
      access: "all",
    });
  });

  it("does not misclassify locked resources as a paid member offer", () => {
    expect(filterDiscoveredResources(resources, { access: "member" }).map((resource) => resource.id)).toEqual(["math-p4"]);
    expect(filterDiscoveredResources(resources, { access: "free" }).map((resource) => resource.id)).toEqual(["thai-p2", "all-grades"]);
  });

  it("searches the full resource description while bounding the URL query", () => {
    const longDescription = `${"บทนำ ".repeat(30)}คำสำคัญท้ายบท`;
    expect(filterDiscoveredResources([
      { ...resources[0], description: longDescription },
    ], { query: "คำสำคัญท้ายบท" })).toHaveLength(1);
    expect(normalizeDiscoveryFilters({ query: "ก".repeat(140) }).query).toHaveLength(100);
  });

  it("builds a bounded, encoded URL and omits empty/default filters", () => {
    expect(resourceDiscoveryHref("/resources", {
      query: " เศษส่วน ป.4 ",
      category: "คณิตศาสตร์",
      grade: "p4",
      access: "member",
    })).toBe("/resources?q=%E0%B9%80%E0%B8%A8%E0%B8%A9%E0%B8%AA%E0%B9%88%E0%B8%A7%E0%B8%99+%E0%B8%9B.4&category=%E0%B8%84%E0%B8%93%E0%B8%B4%E0%B8%95%E0%B8%A8%E0%B8%B2%E0%B8%AA%E0%B8%95%E0%B8%A3%E0%B9%8C&grade=p4&access=member");
    expect(resourceDiscoveryHref("/resources", { query: " ", access: "all" })).toBe("/resources");
  });
});
