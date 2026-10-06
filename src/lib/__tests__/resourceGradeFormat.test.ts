import { describe, expect, it } from "vitest";
import { formatResourceGrades, resourceGradeProblem } from "../resourceGrades";
import { evaluatePublishGuard, publishValidationError } from "../resourceFile";

describe("formatResourceGrades", () => {
  it("collapses a run so a P1-P6 resource never shows only its first two grades", () => {
    expect(formatResourceGrades(["p1", "p2", "p3", "p4", "p5", "p6"])).toBe("ป.1–6");
    expect(formatResourceGrades(["p1", "p2", "p3"])).toBe("ป.1–3");
    expect(formatResourceGrades(["p4", "p5", "p6"])).toBe("ป.4–6");
  });

  it("spans stages and kindergarten and keeps order independent of input order", () => {
    expect(formatResourceGrades(["m3", "p4", "m1", "p6", "p5", "m2"])).toBe("ป.4–ม.3");
    expect(formatResourceGrades(["p3", "kindergarten", "p1", "p2"])).toBe("อนุบาล–ป.3");
    expect(formatResourceGrades(["p2", "p3", "p4", "p5", "p6", "m1", "m2", "m3", "m4", "m5", "m6"])).toBe("ป.2–ม.6");
    expect(formatResourceGrades(["m4", "m5", "m6"])).toBe("ม.4–6");
  });

  it("lists short and split selections explicitly", () => {
    expect(formatResourceGrades(["p2"])).toBe("ป.2");
    expect(formatResourceGrades(["p2", "p3"])).toBe("ป.2, ป.3");
    expect(formatResourceGrades(["p1", "p3"])).toBe("ป.1, ป.3");
    expect(formatResourceGrades(["p1", "p2", "p3", "p5"])).toBe("ป.1–3, ป.5");
    expect(formatResourceGrades(["p6", "m1"])).toBe("ป.6, ม.1");
  });

  it("handles all-levels, vocational, duplicates and bad data", () => {
    expect(formatResourceGrades(["all"])).toBe("ทุกระดับ");
    expect(formatResourceGrades(["vocational"])).toBe("อาชีวศึกษา");
    expect(formatResourceGrades(["p1", "p1", "p2", "p3"])).toBe("ป.1–3");
    expect(formatResourceGrades(["p1", "p2", "p3", "vocational"])).toBe("ป.1–3, อาชีวศึกษา");
    expect(formatResourceGrades(["nonsense"])).toBe("");
    expect(formatResourceGrades(null)).toBe("");
    expect(formatResourceGrades([])).toBe("");
  });
});

describe("grade validation for publishing", () => {
  it("reports missing, invalid and conflicting grade data", () => {
    expect(resourceGradeProblem([])).toBe("ยังไม่ระบุระดับชั้น");
    expect(resourceGradeProblem(null)).toBe("ยังไม่ระบุระดับชั้น");
    expect(resourceGradeProblem(["p9"])).toBe("มีระดับชั้นที่ไม่ถูกต้อง");
    expect(resourceGradeProblem(["all", "p1"])).toContain("เพียงรายการเดียว");
    expect(resourceGradeProblem(["p1"])).toBeNull();
    expect(resourceGradeProblem(["all"])).toBeNull();
  });

  const base = { status: "published" as const, deliveryMode: "web_app" as const, coverImageUrl: "https://x/y.png", filePath: null, ctaUrl: "/t" };

  it("blocks publishing a resource that has no valid grade, but not when grades are unknown to the caller", () => {
    expect(publishValidationError({ ...base, gradeLevels: [] })).toContain("ยังไม่ระบุระดับชั้น");
    expect(publishValidationError({ ...base, gradeLevels: ["p1", "p2"] })).toBeNull();
    // Existing callers that do not supply grades keep their previous behaviour.
    expect(publishValidationError(base)).toBeNull();
    expect(publishValidationError({ ...base, status: "draft", gradeLevels: [] })).toBeNull();
  });

  it("fails the publish guard when the pre-publish lookup shows no grade", () => {
    expect(evaluatePublishGuard({ data: { ...base, gradeLevels: [] }, error: null }).allow).toBe(false);
    expect(evaluatePublishGuard({ data: { ...base, gradeLevels: ["m1"] }, error: null }).allow).toBe(true);
  });
});
