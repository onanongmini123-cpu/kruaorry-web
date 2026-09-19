import { describe, expect, it } from "vitest";
import {
  canOfferAdminPlan,
  canRenewMember,
  effectiveMemberPlan,
  memberPlanChangeConfirmation,
  type AdminPlan,
  type AdminSubscription,
} from "../adminMembership";

const member = (overrides: Partial<AdminSubscription> = {}): AdminSubscription => ({
  id: "subscription-1",
  user_id: "member-1",
  plan_id: "teacher",
  status: "active",
  source: "admin",
  billing_interval: "year",
  current_period_end: "2026-10-01T00:00:00.000Z",
  founder_status: null,
  founder_price_lock: false,
  ...overrides,
});

const now = Date.parse("2026-09-18T00:00:00.000Z");

const plan = (overrides: Partial<AdminPlan> = {}): AdminPlan => ({
  id: "teacher",
  name: "Teacher",
  lifecycle_status: "active",
  price_amount_thb: 599,
  is_upgradeable: true,
  ...overrides,
});

describe("admin plan offers", () => {
  it("offers active upgradeable plans and keeps Free available for downgrades", () => {
    expect(canOfferAdminPlan(plan(), "free")).toBe(true);
    expect(canOfferAdminPlan(plan({ id: "free", name: "Free", price_amount_thb: 0, is_upgradeable: false }), "teacher")).toBe(true);
  });

  it("keeps a current hidden plan visible without offering it to other members", () => {
    const teacherPro = plan({ id: "teacher_pro", name: "Teacher Pro", price_amount_thb: 990, is_upgradeable: false });
    expect(canOfferAdminPlan(teacherPro, "teacher_pro")).toBe(true);
    expect(canOfferAdminPlan(teacherPro, "teacher")).toBe(false);
  });

  it("keeps a current legacy or retired plan visible only until the member switches away", () => {
    const plus = plan({ id: "plus", name: "Plus", lifecycle_status: "legacy", price_amount_thb: 990, is_upgradeable: false });
    const lifetime = plan({ id: "lifetime", name: "Lifetime", lifecycle_status: "retired", price_amount_thb: null, is_upgradeable: false });
    expect(canOfferAdminPlan(plus, "plus")).toBe(true);
    expect(canOfferAdminPlan(lifetime, "lifetime")).toBe(true);
    expect(canOfferAdminPlan(plus, "teacher")).toBe(false);
    expect(canOfferAdminPlan(lifetime, "teacher")).toBe(false);
  });
});

describe("admin membership display", () => {
  it("shows Free after a period ends even if the cached profile still says Teacher", () => {
    expect(effectiveMemberPlan(member({ current_period_end: "2026-09-17T00:00:00.000Z" }), now)).toBe("free");
    expect(effectiveMemberPlan(member(), now)).toBe("teacher");
    expect(effectiveMemberPlan(null, now)).toBe("free");
  });

  it("preserves non-expiring legacy access but never offers renewal", () => {
    const legacy = member({ plan_id: "plus", source: "legacy", current_period_end: null });
    expect(effectiveMemberPlan(legacy, now)).toBe("plus");
    expect(canRenewMember(legacy, now)).toBe(false);
  });

  it("allows late normal renewal but never restores a lapsed Founder price lock", () => {
    expect(canRenewMember(member({ current_period_end: "2026-09-17T00:00:00.000Z" }), now)).toBe(true);
    const founder = member({ plan_id: "founder", founder_status: "active", founder_price_lock: true });
    expect(canRenewMember(founder, now)).toBe(true);
    expect(canRenewMember({ ...founder, current_period_end: "2026-09-17T00:00:00.000Z" }, now)).toBe(false);
    expect(canRenewMember({ ...founder, founder_price_lock: false }, now)).toBe(false);
  });

  it("blocks cancelled, revoked and expired subscriptions", () => {
    for (const status of ["cancelled", "revoked", "expired"] as const) {
      expect(effectiveMemberPlan(member({ status }), now)).toBe("free");
      expect(canRenewMember(member({ status }), now)).toBe(false);
    }
  });
});

describe("admin plan change confirmation", () => {
  it("names both plans and warns that existing access is cancelled", () => {
    const message = memberPlanChangeConfirmation("Teacher", "Free", member());
    expect(message).toContain("จาก Teacher เป็น Free");
    expect(message).toContain("ยกเลิกสิทธิ์แพ็กเดิม");
    expect(message).not.toContain("ตลอดชีพ");
    expect(message).not.toContain("Founder");
  });

  it("warns that legacy or lifetime access may not be recoverable", () => {
    const legacy = member({ plan_id: "plus", source: "legacy", billing_interval: "one_time", current_period_end: null });
    const message = memberPlanChangeConfirmation("Plus เดิม", "Teacher", legacy);
    expect(message).toContain("จาก Plus เดิม เป็น Teacher");
    expect(message).toContain("สิทธิ์เดิม/ตลอดชีพอาจกู้คืนไม่ได้");
  });

  it("warns that changing Founder forfeits the locked price", () => {
    const founder = member({ plan_id: "founder", founder_status: "active", founder_price_lock: true });
    const message = memberPlanChangeConfirmation("Founder", "Teacher", founder);
    expect(message).toContain("จาก Founder เป็น Teacher");
    expect(message).toContain("สิทธิ์ราคาพิเศษ Founder จะสิ้นสุดและไม่สามารถกู้คืนได้");
  });
});
