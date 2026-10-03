import { describe, expect, it } from "vitest";
import type { UpgradeRequest } from "../data";
import type { MemberSubscription } from "../memberAccount";
import {
  canStartMembershipApplication,
  entitlementSatisfiesRequestedPlan,
  hasCurrentPaidMembership,
  membershipAutoReturnDestination,
  membershipReturnTarget,
  pendingMembershipApplication,
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
    expect(canStartMembershipApplication([application("approved")], free, subscription({ status: "expired" }), null, now)).toBe(true);
    expect(canStartMembershipApplication([application("declined")], free, null, null, now)).toBe(true);
    expect(canStartMembershipApplication([application("pending")], free, null, null, now)).toBe(false);
    expect(canStartMembershipApplication([], teacher, subscription(), null, now)).toBe(false);
    expect(canStartMembershipApplication([], teacher, subscription(), "teacher", now)).toBe(false);
    expect(canStartMembershipApplication([], { planId: "founder", features: {} }, subscription({ planId: "founder" }), "teacher", now)).toBe(true);
    expect(canStartMembershipApplication([], teacher, subscription({ status: "past_due", currentPeriodEnd: "2026-10-02T00:00:00.000Z" }), null, now)).toBe(true);
  });

  it("requires the live entitlement to satisfy the requested resource plan", () => {
    expect(requestedMembershipPlan("teacher")).toBe("teacher");
    expect(requestedMembershipPlan("pro")).toBeNull();
    expect(entitlementSatisfiesRequestedPlan({ planId: "teacher", features: {} }, "teacher")).toBe(true);
    expect(entitlementSatisfiesRequestedPlan({ planId: "founder", features: {} }, "teacher")).toBe(false);
    expect(entitlementSatisfiesRequestedPlan({ planId: "teacher", features: {} }, null)).toBe(true);
  });

  it("returns once only to a validated internal target and keeps unsafe or missing input on the safe fallback", () => {
    const teacher = { planId: "teacher", features: {} };
    const resource = "/resources/123e4567-e89b-42d3-a456-426614174000";
    expect(membershipReturnTarget(resource)).toEqual({ destination: resource, canAutoReturn: true });
    expect(membershipReturnTarget("https://evil.example")).toEqual({ destination: "/app", canAutoReturn: false });
    expect(membershipReturnTarget(null)).toEqual({ destination: "/app", canAutoReturn: false });
    expect(membershipAutoReturnDestination(resource, "teacher", teacher, false)).toBe(resource);
    expect(membershipAutoReturnDestination(resource, "teacher", teacher, true)).toBeNull();
    expect(membershipAutoReturnDestination(resource, "teacher", { planId: "founder", features: {} }, false)).toBeNull();
    expect(membershipAutoReturnDestination(resource, null, teacher, false)).toBeNull();
    expect(membershipAutoReturnDestination("https://evil.example", "teacher", teacher, false)).toBeNull();
    expect(membershipAutoReturnDestination(null, "teacher", teacher, false)).toBeNull();
  });
});
