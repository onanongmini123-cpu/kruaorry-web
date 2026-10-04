import { describe, expect, it } from "vitest";
import {
  beginMemberEntitlementsRefresh,
  canRequestMembershipRenewal,
  completeMemberEntitlementsRefresh,
  INITIAL_MEMBER_ENTITLEMENTS_STATE,
  isMembershipExpired,
  memberPlanIdForDisplay,
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
  lineSlipReceivedAt: null,
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

  it("offers active renewal at seven days, but not at eight days", () => {
    expect(canRequestMembershipRenewal(subscription({ currentPeriodEnd: "2026-10-10T00:00:00.000Z" }), now)).toBe(false);
    expect(canRequestMembershipRenewal(subscription({ currentPeriodEnd: "2026-10-09T00:00:00.000Z" }), now)).toBe(true);
    expect(canRequestMembershipRenewal(subscription({ currentPeriodEnd: "2026-10-02T00:00:00.000Z" }), now)).toBe(true);
  });

  it("keeps past-due and expired annual memberships renewable", () => {
    expect(canRequestMembershipRenewal(subscription({ status: "past_due" }), now)).toBe(true);
    expect(canRequestMembershipRenewal(subscription({ status: "expired" }), now)).toBe(true);
  });

  it("never renews non-renewable membership records", () => {
    expect(canRequestMembershipRenewal(subscription({ source: "legacy", currentPeriodEnd: null }), now)).toBe(false);
    expect(canRequestMembershipRenewal(subscription({ billingInterval: "one_time", currentPeriodEnd: null }), now)).toBe(false);
    expect(canRequestMembershipRenewal(subscription({ status: "cancelled" }), now)).toBe(false);
    expect(canRequestMembershipRenewal(null, now)).toBe(false);
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

describe("member entitlement UI state", () => {
  it("keeps an initial error unknown instead of manufacturing a Free result", () => {
    const failed = completeMemberEntitlementsRefresh(INITIAL_MEMBER_ENTITLEMENTS_STATE, {
      entitlements: null,
      error: true,
    });

    expect(failed).toEqual({ status: "error", entitlements: null });
    expect(memberPlanIdForDisplay(failed.entitlements, null, now)).toBeNull();
  });

  it("preserves the last known snapshot through retry and a later failure", () => {
    const loaded = completeMemberEntitlementsRefresh(INITIAL_MEMBER_ENTITLEMENTS_STATE, {
      entitlements: { planId: "teacher", features: {} },
      error: false,
    });
    const retrying = beginMemberEntitlementsRefresh(loaded);
    const failed = completeMemberEntitlementsRefresh(retrying, { entitlements: null, error: true });

    expect(retrying).toEqual({ status: "loading", entitlements: { planId: "teacher", features: {} } });
    expect(failed).toEqual({ status: "error", entitlements: { planId: "teacher", features: {} } });
  });

  it("accepts a successful retry after an error", () => {
    const failed = completeMemberEntitlementsRefresh(INITIAL_MEMBER_ENTITLEMENTS_STATE, {
      entitlements: null,
      error: true,
    });
    const retrying = beginMemberEntitlementsRefresh(failed);
    const recovered = completeMemberEntitlementsRefresh(retrying, {
      entitlements: { planId: "free", features: {} },
      error: false,
    });

    expect(recovered).toEqual({ status: "loaded", entitlements: { planId: "free", features: {} } });
  });

  it("uses a current paid subscription as display-only fallback", () => {
    expect(memberPlanIdForDisplay(null, subscription(), now)).toBe("teacher");
    expect(memberPlanIdForDisplay({ planId: "free", features: {} }, subscription(), now)).toBe("teacher");
    expect(memberPlanIdForDisplay(
      { planId: "founder", features: {} },
      subscription(),
      now,
    )).toBe("founder");
  });

  it("does not use expired or revoked subscription history as a paid fallback", () => {
    expect(memberPlanIdForDisplay(null, subscription({ status: "expired" }), now)).toBeNull();
    expect(memberPlanIdForDisplay(
      { planId: "free", features: {} },
      subscription({ status: "revoked" }),
      now,
    )).toBe("free");
  });
});
