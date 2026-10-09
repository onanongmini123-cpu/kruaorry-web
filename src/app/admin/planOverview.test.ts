import { describe, expect, it } from "vitest";
import type { AdminSubscription } from "@/lib/adminMembership";
import { FIXED_CUSTOMER_BENEFIT_IDS } from "@/lib/benefitCopy";
import type { AdminMemberListItem } from "./memberList";
import {
  benefitValueLabel,
  buildPlanComparisonRows,
  calculatePlanMemberCounts,
  isBenefitCopyEditable,
  planPriceLabel,
  planSaleStatus,
  previewCustomerBenefitCopy,
  sortPlansForOverview,
  uniqueBenefits,
  type AdminPlanOverviewItem,
  type PlanBenefitRow,
} from "./planOverview";

const NOW = Date.parse("2026-10-09T00:00:00.000Z");

const plans: AdminPlanOverviewItem[] = [
  { id: "teacher", name: "Teacher", lifecycle_status: "active", price_amount_thb: 599, renewal_price_amount_thb: 599, is_upgradeable: true, is_public: true, sort_order: 2 },
  { id: "free", name: "Free", lifecycle_status: "active", price_amount_thb: 0, renewal_price_amount_thb: null, is_upgradeable: false, is_public: true, sort_order: 1 },
  { id: "legacy", name: "Plus เดิม", lifecycle_status: "legacy", price_amount_thb: null, renewal_price_amount_thb: null, is_upgradeable: false, is_public: false, sort_order: 0 },
];

const member = (id: string, role: AdminMemberListItem["role"] = "member"): AdminMemberListItem => ({
  id,
  full_name: `ครู ${id}`,
  email: `${id}@example.test`,
  plan: "free",
  role,
  created_at: "2026-10-01T00:00:00.000Z",
});

const subscription = (userId: string, overrides: Partial<AdminSubscription> = {}): AdminSubscription => ({
  id: `subscription-${userId}`,
  user_id: userId,
  plan_id: "teacher",
  status: "active",
  source: "admin",
  billing_interval: "year",
  current_period_end: "2026-10-19T00:00:00.000Z",
  founder_status: null,
  founder_price_lock: false,
  ...overrides,
});

const benefit = (overrides: Partial<PlanBenefitRow> = {}): PlanBenefitRow => ({
  plan_id: "teacher",
  feature_id: "library.premium",
  feature_name: "คลังสื่อพรีเมียม",
  feature_description: "ข้อความจากฐานข้อมูล",
  value_type: "boolean",
  limit_value: null,
  sort_order: 1,
  ...overrides,
});

describe("admin plan member summaries", () => {
  it("counts only non-staff members under their effective plan", () => {
    const members = [member("teacher"), member("free"), member("expired"), member("staff", "admin")];
    const subscriptions = new Map<string, AdminSubscription>([
      ["teacher", subscription("teacher")],
      ["expired", subscription("expired", { status: "expired", current_period_end: "2026-10-08T23:59:59.000Z" })],
      ["staff", subscription("staff")],
    ]);

    expect(calculatePlanMemberCounts(plans, members, subscriptions, NOW)).toEqual({
      teacher: { active: 1, expiring: 1 },
      free: { active: 2, expiring: 0 },
      legacy: { active: 0, expiring: 0 },
    });
  });

  it("includes exactly 30 days in the expiry count but excludes one millisecond later", () => {
    const members = [member("edge"), member("outside")];
    const subscriptions = new Map<string, AdminSubscription>([
      ["edge", subscription("edge", { current_period_end: "2026-11-08T00:00:00.000Z" })],
      ["outside", subscription("outside", { current_period_end: "2026-11-08T00:00:00.001Z" })],
    ]);
    expect(calculatePlanMemberCounts(plans, members, subscriptions, NOW).teacher).toEqual({ active: 2, expiring: 1 });
  });

  it("places legacy plans last and reports sale status from real plan flags", () => {
    expect(sortPlansForOverview(plans).map((plan) => plan.id)).toEqual(["free", "teacher", "legacy"]);
    expect(planSaleStatus(plans[0])).toBe("เปิดขาย");
    expect(planSaleStatus({ ...plans[0], is_public: false })).toBe("ปิดรับใหม่");
    expect(planSaleStatus(plans[2])).toBe("แพ็กเดิม");
  });
});

describe("admin plan comparison", () => {
  it("shows customer-facing copy and per-plan boolean/integer values", () => {
    const rows = [
      benefit(),
      benefit({ plan_id: "teacher", feature_id: "favorites.limit", feature_name: "จำนวนรายการโปรด", value_type: "integer", limit_value: null, sort_order: 2 }),
      benefit({ plan_id: "free", feature_id: "favorites.limit", feature_name: "จำนวนรายการโปรด", value_type: "integer", limit_value: 5, sort_order: 2 }),
    ];
    const comparison = buildPlanComparisonRows(plans, rows);
    expect(comparison[0].name).toBe("เกมและสื่อ Pro");
    expect(comparison[0].cells.free).toEqual({ included: false, value: "ไม่มี" });
    expect(comparison[0].cells.teacher).toEqual({ included: true, value: "มี" });
    expect(comparison[1].cells.free.value).toBe("5");
    expect(comparison[1].cells.teacher.value).toBe("ไม่จำกัด");
  });

  it("handles empty plan and benefit data without inventing rows", () => {
    expect(buildPlanComparisonRows([], [])).toEqual([]);
    expect(uniqueBenefits([])).toEqual([]);
  });

  it("formats prices and benefit limits without inventing missing values", () => {
    expect(planPriceLabel(0)).toBe("ฟรี");
    expect(planPriceLabel(null)).toBe("ไม่ระบุ");
    expect(benefitValueLabel(benefit({ value_type: "integer", limit_value: null }))).toBe("ไม่จำกัด");
  });
});

describe("customer benefit copy ownership", () => {
  it("derives every read-only key from the one exported fixed-copy list", () => {
    expect(FIXED_CUSTOMER_BENEFIT_IDS).toEqual([
      "library.premium",
      "download.premium",
      "favorites.enabled",
      "favorites.limit",
    ]);
    expect(FIXED_CUSTOMER_BENEFIT_IDS.every((id) => !isBenefitCopyEditable(id))).toBe(true);
  });

  it("keeps editable keys disjoint from fixed copy and allows future unknown keys", () => {
    const editable = ["membership.founder_badge", "membership.early_access", "future.capability"];
    expect(editable.every(isBenefitCopyEditable)).toBe(true);
    expect(editable.filter((id) => FIXED_CUSTOMER_BENEFIT_IDS.includes(id))).toEqual([]);
  });

  it("uses the same customer copy sanitizer for the live preview", () => {
    expect(previewCustomerBenefitCopy("membership.early_access", "เข้าถึงก่อน", "รับชมสื่อใหม่ก่อนใคร")).toEqual({
      name: "เข้าถึงก่อน",
      description: "รับชมสื่อใหม่ก่อนใคร",
      filtered: false,
    });
    expect(previewCustomerBenefitCopy("membership.early_access", "signed URL", "เรียก API แล้วคืน null")).toEqual({
      name: "สิทธิ์สำหรับสมาชิก",
      description: null,
      filtered: true,
    });
  });
});
