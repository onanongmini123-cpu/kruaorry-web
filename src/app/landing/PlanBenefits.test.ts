import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanBenefits, billingIntervalLabel, formatPlanBenefit, type LandingPlanBenefit } from "./PlanBenefits";

const benefit = (featureId: string, overrides: Partial<LandingPlanBenefit> = {}): LandingPlanBenefit => ({
  featureId,
  name: `สิทธิ์ ${featureId}`,
  description: null,
  valueType: "boolean",
  limitValue: null,
  ...overrides,
});

describe("formatPlanBenefit", () => {
  it("keeps boolean capability copy grounded in its catalogue name and description", () => {
    expect(formatPlanBenefit(benefit("download", {
      name: "ดาวน์โหลดสื่อพรีเมียม",
      description: "ดาวน์โหลดไฟล์ที่แพ็กนี้เปิดให้ใช้",
    }))).toEqual({
      title: "ดาวน์โหลดสื่อพรีเมียม",
      description: "ดาวน์โหลดไฟล์ที่แพ็กนี้เปิดให้ใช้",
    });
  });

  it("formats finite and unlimited integer entitlements without inventing a unit", () => {
    expect(formatPlanBenefit(benefit("favorites.limit", {
      name: "จำนวนรายการโปรด",
      valueType: "integer",
      limitValue: 2500,
    })).title).toBe(`จำนวนรายการโปรด: ${new Intl.NumberFormat("th-TH").format(2500)}`);
    expect(formatPlanBenefit(benefit("favorites.limit", {
      name: "จำนวนรายการโปรด",
      valueType: "integer",
      limitValue: null,
    })).title).toBe("จำนวนรายการโปรด: ไม่จำกัด");
  });
});

describe("PlanBenefits", () => {
  it("renders only supplied benefits and offers a native mobile disclosure for the remainder", () => {
    const benefits = [
      benefit("one"),
      benefit("two"),
      benefit("three"),
      benefit("four"),
    ];
    const html = renderToStaticMarkup(React.createElement(PlanBenefits, { benefits }));

    expect(html).toContain("สิทธิ์ที่ได้รับ");
    expect(html).toContain("ดูสิทธิ์ทั้งหมด");
    expect(html).toContain("สิทธิ์ one");
    expect(html).toContain("สิทธิ์ four");
    expect(html).not.toContain("สิทธิ์ที่ไม่ได้ส่งมา");
  });

  it("does not render an invented fallback when a plan has no enabled benefits", () => {
    expect(renderToStaticMarkup(React.createElement(PlanBenefits, { benefits: [] }))).toBe("");
  });
});

describe("billingIntervalLabel", () => {
  it("labels only real billing intervals", () => {
    expect(billingIntervalLabel("month")).toBe("ต่อเดือน");
    expect(billingIntervalLabel("year")).toBe("ต่อปี");
    expect(billingIntervalLabel("lifetime")).toBe("ชำระครั้งเดียว");
    expect(billingIntervalLabel(null)).toBeNull();
  });
});
