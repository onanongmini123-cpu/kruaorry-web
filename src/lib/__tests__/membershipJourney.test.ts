import { describe, expect, it } from "vitest";
import type { UpgradeRequest } from "../data";
import type { MemberSubscription } from "../memberAccount";
import {
  canStartMembershipApplication,
  entitlementSatisfiesRequestedPlan,
  founderApplicationConversionConfirmation,
  founderChecksBlockPlan,
  founderChecksBlockPlanSelection,
  founderChecksRequiredForPlanSelection,
  hasCurrentPaidMembership,
  membershipApplicationPlanMismatch,
  membershipAutoReturnDestination,
  membershipDisplayError,
  membershipPlanChangeConfirmation,
  membershipPlanUnlocksResource,
  membershipResourceHasSelectablePlan,
  membershipReturnResourceId,
  membershipReturnResourceState,
  membershipReturnTarget,
  pendingMembershipApplication,
  resolveMembershipPlanSelection,
  requestedMembershipPlan,
} from "../membershipJourney";

const now = Date.parse("2026-10-03T00:00:00.000Z");

const application = (status: UpgradeRequest["status"]): UpgradeRequest => ({
  id: `application-${status}`,
  referenceCode: `KA-${status}`,
  planId: "teacher",
  status,
  quotedAmountThb: 599,
  paymentReportedAt: null,
  lineSlipReceivedAt: null,
  paymentPaidAt: null,
  paymentConfirmedAt: status === "approved" ? "2026-10-02T00:00:00.000Z" : null,
  paymentConfirmedAmountThb: status === "approved" ? 599 : null,
  paymentReference: null,
  resolutionReasonCode: null,
  createdAt: "2026-10-01T00:00:00.000Z",
});

const subscription = (overrides: Partial<MemberSubscription> = {}): MemberSubscription => ({
  id: "subscription-1",
  planId: "teacher",
  planName: "Teacher",
  status: "active",
  source: "upgrade_request",
  billingInterval: "year",
  currentPeriodEnd: "2027-10-03T00:00:00.000Z",
  createdAt: "2026-10-03T00:00:00.000Z",
  ...overrides,
});

describe("membership journey state", () => {
  it("treats only pending applications as open work", () => {
    expect(pendingMembershipApplication([application("approved")])).toBeNull();
    expect(pendingMembershipApplication([application("declined")])).toBeNull();
    expect(pendingMembershipApplication([application("approved"), application("pending")])?.status).toBe("pending");
  });

  it("recognizes active, unexpired past-due, and legacy paid access from live entitlements", () => {
    const teacher = { planId: "teacher", features: {} };
    const free = { planId: "free", features: {} };
    expect(hasCurrentPaidMembership(teacher, subscription(), now)).toBe(true);
    expect(hasCurrentPaidMembership(free, subscription(), now)).toBe(true);
    expect(hasCurrentPaidMembership(teacher, subscription({ status: "past_due" }), now)).toBe(true);
    expect(hasCurrentPaidMembership(teacher, subscription({ source: "legacy", billingInterval: "none", currentPeriodEnd: null }), now)).toBe(true);
    expect(hasCurrentPaidMembership(teacher, null, now)).toBe(true);
  });

  it("allows a new application after resolved history or expired access, but not while pending or active", () => {
    const free = { planId: "free", features: {} };
    const teacher = { planId: "teacher", features: {} };
    expect(canStartMembershipApplication([application("approved")], free, subscription({ status: "expired" }), null, false, now)).toBe(true);
    expect(canStartMembershipApplication([application("declined")], free, null, null, false, now)).toBe(true);
    expect(canStartMembershipApplication([application("pending")], free, null, null, false, now)).toBe(false);
    expect(canStartMembershipApplication([], teacher, subscription(), null, false, now)).toBe(false);
    expect(canStartMembershipApplication([], teacher, subscription(), "teacher", false, now)).toBe(false);
    expect(canStartMembershipApplication([], { planId: "founder", features: {} }, subscription({ planId: "founder" }), "teacher", false, now)).toBe(true);
    expect(canStartMembershipApplication([], teacher, subscription({ status: "past_due", currentPeriodEnd: "2026-10-02T00:00:00.000Z" }), null, false, now)).toBe(true);
  });

  it("never allows the Founder 299 offer after a confirmed grant across active, renewal, late, and expired states", () => {
    const free = { planId: "free", features: {} };
    const founderStates: MemberSubscription[] = [
      subscription({ planId: "founder", status: "active", currentPeriodEnd: "2027-10-03T00:00:00.000Z" }),
      subscription({ planId: "founder", status: "active", currentPeriodEnd: "2026-10-10T00:00:00.000Z" }),
      subscription({ planId: "founder", status: "past_due", currentPeriodEnd: "2026-10-02T00:00:00.000Z" }),
      subscription({ planId: "founder", status: "expired", currentPeriodEnd: "2026-10-01T00:00:00.000Z" }),
    ];

    for (const founder of founderStates) {
      expect(canStartMembershipApplication([], free, founder, "founder", true, now)).toBe(false);
    }
    expect(canStartMembershipApplication([], free, founderStates.at(-1) ?? null, "teacher", true, now)).toBe(true);
  });

  it("requires the live entitlement to satisfy the requested resource plan", () => {
    expect(requestedMembershipPlan("teacher")).toBe("teacher");
    expect(requestedMembershipPlan("pro")).toBeNull();
    expect(entitlementSatisfiesRequestedPlan({ planId: "teacher", features: {} }, "teacher")).toBe(true);
    expect(entitlementSatisfiesRequestedPlan({ planId: "founder", features: {} }, "teacher")).toBe(false);
    expect(entitlementSatisfiesRequestedPlan({ planId: "teacher", features: {} }, null)).toBe(true);
  });

  it("keeps Founder-only checks from blocking the canonical Teacher plan", () => {
    expect(founderChecksBlockPlan("founder", true)).toBe(true);
    expect(founderChecksBlockPlan("teacher", true)).toBe(false);
    expect(founderChecksBlockPlan("teacher_pro", true)).toBe(false);
    expect(founderChecksBlockPlan(null, true)).toBe(false);
    expect(founderChecksBlockPlan("founder", false)).toBe(false);
    expect(founderChecksRequiredForPlanSelection("teacher")).toBe(false);
    expect(founderChecksRequiredForPlanSelection("founder")).toBe(true);
    expect(founderChecksRequiredForPlanSelection(null)).toBe(true);
    expect(founderChecksBlockPlanSelection("founder", true, true)).toBe(false);
    expect(founderChecksBlockPlanSelection("founder", true, false)).toBe(true);
    expect(founderChecksBlockPlanSelection("teacher", true, false)).toBe(false);
  });

  it("returns once only to a validated internal target and keeps unsafe or missing input on the safe fallback", () => {
    const teacher = { planId: "teacher", features: {} };
    const resource = "/resources/123e4567-e89b-42d3-a456-426614174000";
    expect(membershipReturnTarget(resource)).toEqual({ destination: resource, canAutoReturn: true });
    expect(membershipReturnTarget("https://evil.example")).toEqual({ destination: "/app", canAutoReturn: false });
    expect(membershipReturnTarget(null)).toEqual({ destination: "/app", canAutoReturn: false });
    expect(membershipReturnResourceId(resource)).toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(membershipReturnResourceId("/app?resource=123e4567-e89b-42d3-a456-426614174000"))
      .toBe("123e4567-e89b-42d3-a456-426614174000");
    expect(membershipReturnResourceId("https://evil.example")).toBeNull();
    expect(membershipAutoReturnDestination(resource, ["founder", "teacher"], teacher, false)).toBe(resource);
    expect(membershipAutoReturnDestination(resource, ["founder", "teacher"], teacher, true)).toBeNull();
    expect(membershipAutoReturnDestination(resource, ["founder"], teacher, false)).toBeNull();
    expect(membershipAutoReturnDestination("/app", ["teacher"], teacher, false)).toBe("/app");
    expect(membershipAutoReturnDestination(resource, [], teacher, false)).toBeNull();
    expect(membershipAutoReturnDestination("https://evil.example", ["teacher"], teacher, false)).toBeNull();
    expect(membershipAutoReturnDestination(null, ["teacher"], teacher, false)).toBeNull();
  });

  it("does not reuse resource A access metadata after client-side navigation to resource B", () => {
    const readForA = {
      resourceId: "123e4567-e89b-42d3-a456-426614174000",
      requiredPlanIds: ["founder", "teacher"],
      error: false,
    };
    expect(membershipReturnResourceState(readForA.resourceId, readForA)).toEqual({
      loaded: true,
      error: false,
      requiredPlanIds: ["founder", "teacher"],
    });
    expect(membershipReturnResourceState("223e4567-e89b-42d3-a456-426614174000", readForA)).toEqual({
      loaded: false,
      error: false,
      requiredPlanIds: [],
    });
  });

  it("uses all actual resource plans and preserves Founder renewal for Founder-only media", () => {
    expect(membershipPlanUnlocksResource("teacher", ["founder", "teacher"])).toBe(true);
    expect(membershipPlanUnlocksResource("founder", ["founder", "teacher"])).toBe(true);
    expect(membershipPlanUnlocksResource("plus", ["plus", "teacher"])).toBe(true);
    expect(membershipPlanUnlocksResource("teacher", ["founder"])).toBe(false);
    expect(resolveMembershipPlanSelection("teacher", ["founder"], true, true, false)).toBe("founder");
    expect(resolveMembershipPlanSelection("teacher", ["founder"], true, true, true)).toBe("founder");
    expect(resolveMembershipPlanSelection("founder", ["founder", "teacher"], true, true, true)).toBe("teacher");
  });

  it("distinguishes retired-plan-only resources from resources that still offer Teacher", () => {
    expect(membershipResourceHasSelectablePlan(["plus"])).toBe(false);
    expect(membershipResourceHasSelectablePlan(["lifetime"])).toBe(false);
    expect(membershipResourceHasSelectablePlan(["plus", "teacher"])).toBe(true);
    expect(membershipPlanUnlocksResource("founder", ["plus"])).toBe(false);
    expect(membershipPlanUnlocksResource("teacher", ["plus"])).toBe(false);
    expect(resolveMembershipPlanSelection("founder", ["plus", "teacher"], true, true, false)).toBe("teacher");
    const resource = "/resources/123e4567-e89b-42d3-a456-426614174000";
    expect(membershipAutoReturnDestination(resource, ["plus"], { planId: "plus", features: {} }, false)).toBe(resource);
    expect(membershipAutoReturnDestination(resource, ["lifetime"], { planId: "lifetime", features: {} }, false)).toBe(resource);
  });

  it("blocks payment when a pending plan cannot unlock the live return resource", () => {
    expect(membershipApplicationPlanMismatch("founder", ["teacher"], true, true, false)).toBe(true);
    expect(membershipApplicationPlanMismatch("teacher", ["founder"], true, true, false)).toBe(true);
    expect(membershipApplicationPlanMismatch("founder", ["founder", "teacher"], true, true, false)).toBe(false);
    expect(membershipApplicationPlanMismatch("teacher", ["plus", "teacher"], true, true, false)).toBe(false);
    expect(membershipApplicationPlanMismatch("plus", ["plus"], true, true, false)).toBe(false);
    expect(membershipApplicationPlanMismatch("teacher", ["plus"], true, true, false)).toBe(true);
    expect(membershipApplicationPlanMismatch("founder", ["teacher"], true, false, false)).toBe(false);
    expect(membershipApplicationPlanMismatch("founder", ["teacher"], true, true, true)).toBe(false);
  });

  it("warns about irreversible plan changes without overstating a pending-only conversion", () => {
    const founder = subscription({ planId: "founder" });
    const legacy = subscription({ planId: "plus", source: "legacy", billingInterval: "one_time", currentPeriodEnd: null });
    expect(membershipPlanChangeConfirmation(founder, "teacher")).toContain("สิทธิ์ Founder ราคาเดิมจะสิ้นสุด");
    expect(membershipPlanChangeConfirmation(legacy, "teacher")).toContain("สิทธิ์ Legacy หรือสิทธิ์ตลอดชีพ");
    expect(membershipPlanChangeConfirmation(subscription(), "teacher")).toBeNull();
    expect(founderApplicationConversionConfirmation(null)).toContain("ยังไม่เปลี่ยนสิทธิ์สมาชิกปัจจุบัน");
    expect(founderApplicationConversionConfirmation(founder)).toContain("สิทธิ์ Founder ราคาเดิม");
  });

  it("normalizes legacy Teacher wording in server errors without duplicating the new name", () => {
    expect(membershipDisplayError("เปลี่ยนใบสมัครเป็นแพ็ก Teacher แล้ว", "fallback"))
      .toBe("เปลี่ยนใบสมัครเป็นแพ็ก Teacher Pro แล้ว");
    expect(membershipDisplayError("ขณะนี้ Teacher Pro ยังไม่เปิดรับ", "fallback"))
      .toBe("ขณะนี้ Teacher Pro ยังไม่เปิดรับ");
    expect(membershipDisplayError(null, "เกิดข้อผิดพลาด"))
      .toBe("เกิดข้อผิดพลาด");
  });

  it("turns server and network wording into friendly Thai before a member sees it", () => {
    expect(membershipDisplayError("Plan is not available for membership applications", "fallback"))
      .toBe("แพ็กเกจนี้ยังไม่เปิดรับสมัครในตอนนี้ กรุณาเลือกแพ็กเกจอื่น");
    expect(membershipDisplayError("create membership application timed out after 8000ms", "ส่งใบสมัครไม่สำเร็จ"))
      .toBe("เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง");
    expect(membershipDisplayError("Could not find the function public.x in the schema cache", "fallback"))
      .not.toMatch(/schema|function|public\./i);
    expect(membershipDisplayError("some unexpected English text", "ส่งใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง"))
      .toBe("ส่งใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง");
  });
});
