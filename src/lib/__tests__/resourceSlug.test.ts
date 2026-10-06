import { describe, expect, it } from "vitest";
import { isResourceUuid, isValidSlug, slugify, uniqueSlug } from "../resourceSlug";

describe("slug rules", () => {
  it("accepts readable ASCII slugs and rejects everything else", () => {
    for (const ok of ["sentence-train", "grammar-boss-battle", "abc", "word-squad-2"]) expect(isValidSlug(ok), ok).toBe(true);
    for (const bad of ["", "ab", "Sentence-Train", "sentence_train", "-lead", "trail-", "double--dash", "กู้ระเบิด", "a".repeat(81), null, undefined, 42]) {
      expect(isValidSlug(bad), String(bad)).toBe(false);
    }
  });

  it("never lets a UUID pass as a slug, so the two URL forms cannot collide", () => {
    const uuid = "11111111-2222-4333-8444-555555555555";
    expect(isResourceUuid(uuid)).toBe(true);
    expect(isValidSlug(uuid)).toBe(false);
    expect(isResourceUuid("sentence-train")).toBe(false);
  });
});

describe("slugify", () => {
  it("builds a slug from the Latin part of a title", () => {
    expect(slugify("Sentence Train")).toBe("sentence-train");
    expect(slugify("Grammar Boss Battle — ศึกบอสไวยากรณ์")).toBe("grammar-boss-battle");
    expect(slugify("  AR Phonics Quest: ภารกิจล่าเสียง!! ")).toBe("ar-phonics-quest");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });

  it("returns an empty string rather than guessing for Thai-only or too-short titles", () => {
    expect(slugify("กู้ระเบิดคำศัพท์")).toBe("");
    expect(slugify("A")).toBe("");
    expect(slugify(null)).toBe("");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = slugify(`${"word ".repeat(40)}end`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-")).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe("uniqueSlug", () => {
  it("returns the base when free and numbers collisions deterministically", () => {
    expect(uniqueSlug("sentence-train", new Set())).toBe("sentence-train");
    expect(uniqueSlug("sentence-train", new Set(["sentence-train"]))).toBe("sentence-train-2");
    expect(uniqueSlug("sentence-train", new Set(["sentence-train", "sentence-train-2", "sentence-train-3"]))).toBe("sentence-train-4");
  });

  it("keeps the suffix inside the length limit", () => {
    const base = "a".repeat(80);
    const slug = uniqueSlug(base, new Set([base]));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith("-2")).toBe(true);
    expect(isValidSlug(slug)).toBe(true);
  });

  it("refuses an invalid base instead of inventing one", () => {
    expect(uniqueSlug("", new Set())).toBe("");
    expect(uniqueSlug("Not Valid", new Set())).toBe("");
  });
});
