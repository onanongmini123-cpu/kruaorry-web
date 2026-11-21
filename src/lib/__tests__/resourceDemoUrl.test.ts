import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEMO_URL_MAX_LENGTH, demoModeFromUrl, demoParamForSave, demoSameAsFullVersion, demoUrlProblem,
  isDemoUnavailable, publicDemoUrl, thaiDemoSaveError,
} from "../resourceDemoUrl";

// The same corpus is run against public.resource_demo_url_is_safe by
// scripts/test-resource-demo-sql.mjs, so the TypeScript and SQL rules cannot drift.
const corpus = JSON.parse(readFileSync(new URL("./fixtures/demo-url-corpus.json", import.meta.url), "utf8")) as { accept: string[]; reject: string[] };

describe("demo URL rules", () => {
  it.each(corpus.accept)("accepts %s", (url) => {
    expect(demoUrlProblem(url)).toBeNull();
    expect(publicDemoUrl(url)).toBe(url);
  });

  it.each(corpus.reject.filter((url) => url.trim() !== ""))("rejects %j", (url) => {
    expect(demoUrlProblem(url)).not.toBeNull();
    expect(publicDemoUrl(url)).toBeNull();
  });

  it("treats a blank value as 'no demo' in the form but never as a link", () => {
    expect(demoUrlProblem("")).toBeNull();
    expect(demoUrlProblem("   ")).toBeNull();
    expect(publicDemoUrl("   ")).toBeNull();
    expect(publicDemoUrl(null)).toBeNull();
    expect(publicDemoUrl(42)).toBeNull();
  });

  it("refuses over-long links and gives a Thai reason", () => {
    const long = `https://games.kruaorry.com/${"a".repeat(DEMO_URL_MAX_LENGTH)}`;
    expect(demoUrlProblem(long)).toMatch(/ยาวเกิน/);
    expect(demoUrlProblem("http://games.kruaorry.com/x")).toMatch(/https/);
    expect(demoUrlProblem("https://localhost.local/x")).toMatch(/ภายใน|ทดสอบ/);
  });

  it("is never built from the visitor: only a stored value can pass, and relative or protocol-relative values do not", () => {
    for (const value of ["/api/resources/x/open", "//evil.example-school.ac.th/x", "https://games.kruaorry.com@evil.example-school.ac.th/x"]) {
      expect(publicDemoUrl(value)).toBeNull();
    }
  });
});

describe("demo and full version stay separate", () => {
  it("detects a demo that is the full version's own address (case, trailing slash)", () => {
    expect(demoSameAsFullVersion("https://games.kruaorry.com/full/x", "https://GAMES.kruaorry.com/full/x/")).toBe(true);
    expect(demoSameAsFullVersion("https://games.kruaorry.com/demo/x", "https://games.kruaorry.com/full/x")).toBe(false);
    expect(demoSameAsFullVersion("", "https://games.kruaorry.com/full/x")).toBe(false);
    expect(demoSameAsFullVersion("https://games.kruaorry.com/demo/x", null)).toBe(false);
  });
});

describe("what the admin form sends", () => {
  it("sends nothing when unchanged, the URL when set or changed, null to remove", () => {
    expect(demoParamForSave("none", "", "", true)).toBeUndefined();
    expect(demoParamForSave("url", " https://games.kruaorry.com/demo/a ", "https://games.kruaorry.com/demo/a", true)).toBeUndefined();
    expect(demoParamForSave("url", "https://games.kruaorry.com/demo/b", "https://games.kruaorry.com/demo/a", true)).toBe("https://games.kruaorry.com/demo/b");
    expect(demoParamForSave("url", "https://games.kruaorry.com/demo/a", "", true)).toBe("https://games.kruaorry.com/demo/a");
    expect(demoParamForSave("none", "https://games.kruaorry.com/demo/a", "https://games.kruaorry.com/demo/a", true)).toBeNull();
  });

  it("never calls the database function before migration 061", () => {
    expect(demoParamForSave("url", "https://games.kruaorry.com/demo/a", "", false)).toBeUndefined();
    expect(demoParamForSave("none", "", "https://games.kruaorry.com/demo/a", false)).toBeUndefined();
  });

  it("derives the mode from the saved URL", () => {
    expect(demoModeFromUrl("")).toBe("none");
    expect(demoModeFromUrl("https://games.kruaorry.com/demo/a")).toBe("url");
  });

  it("translates database refusals and recognises a missing migration", () => {
    expect(thaiDemoSaveError("Resource demo URL is invalid")).toMatch(/ไม่ถูกต้อง/);
    expect(thaiDemoSaveError("Resource demo URL must differ from the full version URL")).toMatch(/ไม่ซ้ำ/);
    expect(thaiDemoSaveError("Admin access required")).toMatch(/แอดมิน/);
    expect(thaiDemoSaveError("something else")).toBeNull();
    expect(isDemoUnavailable({ code: "42703", message: "column resources.demo_url does not exist" })).toBe(true);
    expect(isDemoUnavailable({ code: "PGRST202", message: "Could not find the function public.admin_set_resource_demo" })).toBe(true);
    expect(isDemoUnavailable({ code: "57P01", message: "terminating connection" })).toBe(false);
    expect(isDemoUnavailable(null)).toBe(false);
  });
});
