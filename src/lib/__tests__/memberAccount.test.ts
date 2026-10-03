import { describe, expect, it } from "vitest";
import {
  canRequestMembershipRenewal,
  isMembershipExpired,
  membershipDaysRemaining,
  preferredMemberSubscription,
  preferredMembershipApplication,
  type MemberSubscription,
} from "../memberAccount";
import type { UpgradeRequest } from "../data";

const now = Date.parse("2026-10-02T00:00:00.000Z");

const subscription = (overrides: Partial<MemberSubscription> = {}): MemberSubscription => ({
  id: "subscription-1",
  planId: "teacher",
  planName: "Teacher",
  status: "active",
  source: "upgrade_request",
  billingInterval: "year",
  currentPeriodEnd: "2026-10-12T00:00:00.000Z",
  createdAt: "2025-10-12T00:00:00.000Z",
  ...overrides,
});

const application = (overrides: Partial<UpgradeRequest> = {}): UpgradeRequest => ({
  id: "application-1",
  referenceCode: "KA-00000001",
  planId: "teacher",
  status: "approved",
  quotedAmountThb: 599,
  paymentReportedAt: null,
  paymentPaidAt: null,
  paymentConfirmedAt: null,
  paymentConfirmedAmountThb: null,
  paymentReference: null,
  resolutionReasonCode: null,
  createdAt: "2026-10-02T00:00:00.000Z",
  ...overrides,
});

describe("member account membership dates", () => {
  it("reports calendar-facing remaining days and clamps expired periods to zero", () => {
    expect(membershipDaysRemaining("2026-10-12T00:00:00.000Z", now)).toBe(10);
    expect(membershipDaysRemaining("2026-10-02T12:00:00.000Z", now)).toBe(1);
    expect(membershipDaysRemaining("2026-10-01T00:00:00.000Z", now)).toBe(0);
    expect(membershipDaysRemaining(null, now)).toBeNull();
  });

  it("treats a stale active row past its paid-through date as expired", () => {
    expect(isMembershipExpired(subscription(), now)).toBe(false);
    expect(isMembershipExpired(subscription({ currentPeriodEnd: "2026-10-01T00:00:00.000Z" }), now)).toBe(true);
    expect(isMembershipExpired(subscription({ status: "revoked" }), now)).toBe(true);
  });

  it("offers renewal only for dated, non-legacy annual memberships", () => {
    expect(canRequestMembershipRenewal(subscription())).toBe(true);
    expect(canRequestMembershipRenewal(subscription({ status: "expired" }))).toBe(true);
    expect(canRequestMembershipRenewal(subscription({ source: "legacy", currentPeriodEnd: null }))).toBe(false);
    expect(canRequestMembershipRenewal(subscription({ billingInterval: "one_time", currentPeriodEnd: null }))).toBe(false);
    expect(canRequestMembershipRenewal(null)).toBe(false);
  });
});

describe("member account record selection", () => {
  it("prefers a current subscription over newer expired history", () => {
    const expired = subscription({ id: "expired", status: "expired", currentPeriodEnd: "2026-10-01T00:00:00.000Z", createdAt: "2026-10-01T00:00:00.000Z" });
    const active = subscription({ id: "active", createdAt: "2025-10-01T00:00:00.000Z" });
    expect(preferredMemberSubscription(expired, active)).toBe(active);
  });

  it("keeps a pending application visible ahead of resolved history", () => {
    const approved = application({ id: "approved", createdAt: "2026-10-03T00:00:00.000Z" });
    const pending = application({ id: "pending", status: "pending", createdAt: "2026-10-01T00:00:00.000Z" });
    expect(preferredMembershipApplication([approved, pending])).toBe(pending);
    expect(preferredMembershipApplication([])).toBeNull();
  });
});
