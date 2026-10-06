import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
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
    deliveryMode: "web_app" as const,
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
    deliveryMode: "file_download" as const,
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
    deliveryMode: "google_template" as const,
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
    deliveryMode: "web_app" as const,
  },
  {
    id: "vocab-fishing",
    title: "ตกปลาคำศัพท์",
    meta: "เว็บเกมคำศัพท์ · 40 คำ · 4 หมวด",
    description: "เกมฝึกคำศัพท์ภาษาอังกฤษสำหรับห้องเรียน",
    category: "ภาษาอังกฤษ",
    tags: ["เกม", "คำศัพท์", "Vocabulary"],
    gradeLevels: ["p1", "p2", "p3"],
    isFree: true,
    accessMode: "public" as const,
    deliveryMode: "web_app" as const,
  },
];

describe("resource discovery", () => {
  it("combines keyword, category, grade, and access filters", () => {
    expect(filterDiscoveredResources(resources, {
      query: "ใบงาน",
      category: "คณิตศาสตร์",
      grade: "p4",
      access: "pro",
    }).map((resource) => resource.id)).toEqual(["math-p4"]);
  });

  it("searches structured grades and descriptive metadata without guessing grades from titles", () => {
    expect(filterDiscoveredResources(resources, { query: "ป.2" }).map((resource) => resource.id)).toEqual(["thai-p2", "vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { grade: "p2" }).map((resource) => resource.id)).toEqual(["thai-p2", "all-grades", "vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { grade: "p3" }).map((resource) => resource.id)).toEqual(["all-grades", "vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { grade: "all" }).map((resource) => resource.id)).toEqual(["all-grades"]);
  });

  it("filters by one customer-facing access tier each: ใช้ฟรี, สมาชิกฟรี, Teacher Pro", () => {
    const ids = (access: "free" | "member" | "pro") => filterDiscoveredResources(resources, { access }).map((resource) => resource.id);
    expect(ids("free")).toEqual(["all-grades", "vocab-fishing"]);
    expect(ids("member")).toEqual(["thai-p2"]);
    expect(ids("pro")).toEqual(["math-p4"]);
    // Locked resources belong to no tier a visitor can filter for.
    for (const access of ["free", "member", "pro"] as const) {
      expect(ids(access)).not.toContain("thai-p4");
    }
    expect(filterDiscoveredResources(resources, { access: "all" })).toHaveLength(resources.length);
  });

  it("filters by resource type", () => {
    expect(filterDiscoveredResources(resources, { type: "online" }).map((resource) => resource.id))
      .toEqual(["thai-p2", "all-grades", "vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { type: "file" }).map((resource) => resource.id)).toEqual(["math-p4"]);
    expect(filterDiscoveredResources(resources, { type: "template" }).map((resource) => resource.id)).toEqual(["thai-p4"]);
    expect(filterDiscoveredResources(resources, { type: "form" })).toEqual([]);
  });

  it("matches every search word, in any order, and understands Thai school-year phrases", () => {
    expect(filterDiscoveredResources(resources, { query: "เศษส่วน ใบงาน" }).map((r) => r.id)).toEqual(["math-p4"]);
    expect(filterDiscoveredResources(resources, { query: "เศษส่วน เกม" })).toEqual([]);
    for (const phrase of ["ป.4", "ป4", "ป 4", "ประถม 4", "ประถมศึกษาปีที่ 4", "P4"]) {
      expect(filterDiscoveredResources(resources, { query: phrase }).map((r) => r.id), phrase).toEqual(["math-p4", "thai-p4"]);
    }
  });

  it("treats Thai and English words for the same idea as one search", () => {
    expect(filterDiscoveredResources(resources, { query: "vocabulary" }).map((r) => r.id)).toEqual(["vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { query: "ศัพท์" }).map((r) => r.id)).toEqual(["vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { query: "math" }).map((r) => r.id)).toEqual(["math-p4"]);
    expect(filterDiscoveredResources(resources, { query: "game" }).map((r) => r.id)).toEqual(["thai-p2", "all-grades", "vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { query: "worksheet" }).map((r) => r.id)).toEqual(["math-p4", "thai-p4"]);
  });

  it("finds resources by access and type words people type", () => {
    expect(filterDiscoveredResources(resources, { query: "ฟรี" }).map((r) => r.id)).toEqual(["thai-p2", "all-grades", "vocab-fishing"]);
    expect(filterDiscoveredResources(resources, { query: "Teacher Pro" }).map((r) => r.id)).toEqual(["math-p4"]);
    expect(filterDiscoveredResources(resources, { query: "เทมเพลต" }).map((r) => r.id)).toEqual(["thai-p4"]);
  });

  it("does not match unrelated words and tolerates an empty list", () => {
    expect(filterDiscoveredResources(resources, { query: "ไดโนเสาร์" })).toEqual([]);
    expect(filterDiscoveredResources([], { query: "เกม" })).toEqual([]);
  });

  it("normalizes Thai-compatible text and ignores unsupported filter values", () => {
    expect(filterDiscoveredResources(resources, { query: "  อ่านออกเสียง  ", access: "member" })).toEqual([resources[0]]);
    expect(normalizeDiscoveryFilters({ access: "unknown" as never, type: "nope" as never })).toEqual({
      query: "",
      category: "",
      grade: "",
      access: "all",
      type: "all",
    });
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
      access: "pro",
      type: "file",
    })).toBe("/resources?q=%E0%B9%80%E0%B8%A8%E0%B8%A9%E0%B8%AA%E0%B9%88%E0%B8%A7%E0%B8%99+%E0%B8%9B.4&category=%E0%B8%84%E0%B8%93%E0%B8%B4%E0%B8%95%E0%B8%A8%E0%B8%B2%E0%B8%AA%E0%B8%95%E0%B8%A3%E0%B9%8C&grade=p4&access=pro&type=file");
    expect(resourceDiscoveryHref("/resources", { query: " ", access: "all" })).toBe("/resources");
  });

  it("counts only the filters that narrow the list", () => {
    expect(activeFilterCount({ query: "เกม" })).toBe(0);
    expect(activeFilterCount({ grade: "p2", access: "free", type: "all", category: "" })).toBe(2);
    expect(activeFilterCount({ grade: "p2", access: "pro", type: "file", category: "ภาษาไทย" })).toBe(4);
  });
});
