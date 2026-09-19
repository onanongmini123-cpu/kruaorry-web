import { describe, expect, it } from "vitest";
import { collectResourcePages, RESOURCE_PAGE_SIZE } from "../pagination";

describe("public resource pagination", () => {
  it("includes an older matching resource beyond the first 100 rows", async () => {
    const rows = Array.from({ length: 231 }, (_, index) => ({ id: index, title: index === 218 ? "สื่อเก่า วิทยาศาสตร์" : "สื่ออื่น" }));
    const ranges: Array<[number, number]> = [];
    const result = await collectResourcePages(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });

    expect(result?.filter((row) => row.title.includes("วิทยาศาสตร์"))).toEqual([rows[218]]);
    expect(result).toHaveLength(231);
    expect(ranges).toEqual([[0, 99], [100, 199], [200, 299]]);
  });

  it("fetches one more page when the last populated page is exactly full", async () => {
    const rows = Array.from({ length: RESOURCE_PAGE_SIZE }, (_, index) => index);
    const ranges: Array<[number, number]> = [];
    const result = await collectResourcePages(async (from, to) => {
      ranges.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });

    expect(result).toEqual(rows);
    expect(ranges).toEqual([[0, 99], [100, 199]]);
  });

  it("never presents a truncated catalogue as complete if a later page fails", async () => {
    const result = await collectResourcePages(async (from) => from === 0
      ? { data: Array.from({ length: RESOURCE_PAGE_SIZE }, (_, index) => index), error: null }
      : { data: null, error: new Error("unavailable") });

    expect(result).toBeNull();
  });
});
