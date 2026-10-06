import { describe, expect, it } from "vitest";
import type { Plan, PlanBenefit } from "../data";
import { buildPlanComparison } from "../planComparison";
import { customerBenefitCopy } from "../benefitCopy";

function benefit(featureId: string, name: string, valueType: PlanBenefit["valueType"] = "boolean", limitValue: number | null = null): PlanBenefit {
  const copy = customerBenefitCopy({ featureId, name, description: null });
  return { featureId, name: copy.name, description: copy.description, valueType, limitValue };
}

function plan(id: string, benefits: PlanBenefit[]): Plan {
  return { id, name: id, priceLabel: "", note: null, features: [], benefits, billingInterval: null, isPopular: false };
}

const free = plan("free", [
  benefit("favorites.enabled", "บันทึกสื่อที่ชอบ"),
  benefit("favorites.limit", "จำนวนรายการโปรด", "integer", 10),
]);
const pro = plan("teacher", [
  benefit("library.premium", "คลังสื่อพรีเมียม"),
  benefit("favorites.enabled", "บันทึกสื่อที่ชอบ"),
  benefit("favorites.limit", "จำนวนรายการโปรด", "integer", null),
  benefit("download.premium", "ดาวน์โหลดพรีเมียม"),
]);

describe("buildPlanComparison", () => {
  const rows = buildPlanComparison(free, pro);
  const byId = Object.fromEntries(rows.map((row) => [row.featureId, row]));

  it("states what the free access labels mean, true for both plans", () => {
    expect(rows[0].featureId).toBe("access.free");
    expect(rows[0].name).toContain("ใช้ฟรี");
    expect(rows[0].free.included && rows[0].pro.included).toBe(true);
  });

  it("shows Pro-only capabilities as missing for Free and included for Teacher Pro", () => {
    expect(byId["library.premium"].name).toBe("เกมและสื่อ Pro");
    expect(byId["library.premium"].free).toEqual({ included: false });
    expect(byId["library.premium"].pro).toEqual({ included: true, text: null });
    expect(byId["download.premium"].name).toBe("ดาวน์โหลดสื่อ Pro");
    expect(byId["download.premium"].free.included).toBe(false);
  });

  it("reads limits from configuration: a number for Free, ไม่จำกัด when the limit is null", () => {
    expect(byId["favorites.limit"].free).toEqual({ included: true, text: "10" });
    expect(byId["favorites.limit"].pro).toEqual({ included: true, text: "ไม่จำกัด" });
  });

  it("folds the favourites on/off row into the limit row", () => {
    expect(byId["favorites.enabled"]).toBeUndefined();
  });

  it("never invents a capability that neither plan grants", () => {
    const ids = rows.map((row) => row.featureId);
    expect(ids).not.toContain("ai.enabled");
    expect(ids.sort()).toEqual(["access.free", "download.premium", "favorites.limit", "library.premium"]);
  });

  it("degrades gracefully when a plan has not loaded", () => {
    const onlyFree = buildPlanComparison(free, undefined);
    expect(onlyFree.every((row) => row.pro.included === (row.featureId === "access.free"))).toBe(true);
    expect(buildPlanComparison(undefined, undefined)).toHaveLength(1);
  });
});
