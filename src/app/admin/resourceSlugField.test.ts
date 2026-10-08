import { describe, expect, it } from "vitest";
import { isMissingSlugColumn, isSlugUnavailable, resourceAddress, slugFieldState, slugParamForSave, suggestSlug, thaiSlugSaveError } from "./resourceSlugField";

describe("slugFieldState", () => {
  it("is empty for blank input and remembers whether a slug is already saved", () => {
    expect(slugFieldState("", "")).toEqual({ kind: "empty", hasSaved: false });
    expect(slugFieldState("   ", "sentence-train")).toEqual({ kind: "empty", hasSaved: true });
  });

  it("refuses what the database refuses", () => {
    for (const bad of ["Sentence-Train", "sentence_train", "ab", "-x", "x-", "a--b", "เกมใหม่", "6cc12b2d-5ebc-4533-85d0-13038a0dc189", "a".repeat(81)]) {
      expect(slugFieldState(bad, ""), bad).toMatchObject({ kind: "invalid" });
    }
  });

  it("separates a first slug, an unchanged one and a replacement", () => {
    expect(slugFieldState("sentence-train", "")).toEqual({ kind: "new" });
    expect(slugFieldState("  sentence-train ", "sentence-train")).toEqual({ kind: "unchanged" });
    expect(slugFieldState("sentence-train-2", "sentence-train")).toEqual({ kind: "changed" });
  });
});
describe("slugParamForSave", () => {
  it("sends the slug only when it is new or changed, trimmed", () => {
    expect(slugParamForSave(" new-slug ", "")).toBe("new-slug");
    expect(slugParamForSave("other-slug", "old-slug")).toBe("other-slug");
  });

  it("leaves the argument out when blank, unchanged or invalid (so an older database still saves)", () => {
    expect(slugParamForSave("", "")).toBeNull();
    expect(slugParamForSave("", "old-slug")).toBeNull();
    expect(slugParamForSave("old-slug", "old-slug")).toBeNull();
    expect(slugParamForSave("Bad Slug", "")).toBeNull();
  });
});

describe("addresses and suggestions", () => {
  it("shows the public address", () => {
    expect(resourceAddress("sentence-train")).toBe("https://kruaorry.com/resources/sentence-train");
  });

  it("suggests a slug from Latin titles only", () => {
    expect(suggestSlug("Sentence Train")).toBe("sentence-train");
    expect(suggestSlug("เกมรถไฟ")).toBe("");
  });
});

describe("thaiSlugSaveError", () => {
  it("translates the two slug refusals", () => {
    expect(thaiSlugSaveError("Resource slug is invalid")).toMatch(/รูปแบบ slug ไม่ถูกต้อง/);
    expect(thaiSlugSaveError("Resource slug is already in use")).toMatch(/ถูกใช้กับสื่ออื่นแล้ว/);
  });

  it("explains a database that does not know p_slug yet, without leaking the raw message", () => {
    const message = "Could not find the function public.admin_save_resource(p_access_mode, ..., p_slug) in the schema cache";
    const thai = thaiSlugSaveError(message);
    expect(thai).toMatch(/migration 055/);
    expect(thai).not.toContain("schema cache");
  });

  it("leaves every other message to the caller", () => {
    expect(thaiSlugSaveError("Admin access required")).toBeNull();
    expect(thaiSlugSaveError(null)).toBeNull();
  });
});

describe("isMissingSlugColumn", () => {
  it("recognises the missing column before migration 053 and nothing else", () => {
    expect(isMissingSlugColumn({ code: "42703", message: "column resources.slug does not exist" })).toBe(true);
    expect(isMissingSlugColumn({ code: "PGRST204", message: "Could not find the 'slug' column of 'resources' in the schema cache" })).toBe(true);
    expect(isMissingSlugColumn({ code: "42501", message: "permission denied for table resources" })).toBe(false);
    expect(isMissingSlugColumn({ code: "42703", message: "column resources.context does not exist" })).toBe(false);
    expect(isMissingSlugColumn(null)).toBe(false);
  });
});

describe("isSlugUnavailable", () => {
  it("also covers a database where the column exists but the signed-in role may not read it yet", () => {
    expect(isSlugUnavailable({ code: "42501", message: "permission denied for table resources" })).toBe(true);
    expect(isSlugUnavailable({ code: "42703", message: "column resources.slug does not exist" })).toBe(true);
    expect(isSlugUnavailable({ code: null, message: "permission denied for table resources" })).toBe(true);
  });

  it("does not hide unrelated failures", () => {
    expect(isSlugUnavailable({ code: "PGRST000", message: "mock outage" })).toBe(false);
    expect(isSlugUnavailable({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isSlugUnavailable(null)).toBe(false);
  });
});
