import { describe, expect, it } from "vitest";
import { planDisplayName, planDisplayNames } from "../planDisplay";

describe("customer-facing plan names", () => {
  it("renames only the canonical teacher id", () => {
    expect(planDisplayName("teacher", "Teacher")).toBe("Teacher Pro");
    expect(planDisplayName("teacher_pro", "Teacher Pro")).toBe("Teacher Pro (แพ็กเดิม)");
    expect(planDisplayName("founder", "Founder 100")).toBe("Founder 100");
    expect(planDisplayName("plus", "Plus เดิม")).toBe("Plus เดิม");
  });

  it("normalizes resource plan labels without changing ids", () => {
    expect(planDisplayNames(["founder", "teacher"], ["Founder 100", "Teacher"]))
      .toEqual(["Founder 100", "Teacher Pro"]);
    expect(planDisplayNames(["teacher", "teacher"], ["Teacher", "Teacher"]))
      .toEqual(["Teacher Pro"]);
    expect(planDisplayNames(["teacher_pro", "teacher"], ["Teacher"]))
      .toEqual(["Teacher Pro (แพ็กเดิม)", "Teacher Pro"]);
  });
});
