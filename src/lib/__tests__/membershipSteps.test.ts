import { describe, expect, it } from "vitest";
import { shouldShowMembershipStepper } from "../membershipSteps";

const base = {
  authLoaded: true,
  signedIn: true,
  memberStatusLoaded: true,
  membershipActive: false,
  hasPendingApplication: false,
};

describe("shouldShowMembershipStepper", () => {
  it("shows for a visitor who is not signed in", () => {
    expect(shouldShowMembershipStepper({ ...base, signedIn: false, memberStatusLoaded: false })).toBe(true);
  });

  it("shows for a free member, and for one with a pending application", () => {
    expect(shouldShowMembershipStepper(base)).toBe(true);
    expect(shouldShowMembershipStepper({ ...base, hasPendingApplication: true })).toBe(true);
  });

  it("hides for a member with an active paid plan", () => {
    expect(shouldShowMembershipStepper({ ...base, membershipActive: true })).toBe(false);
  });

  it("stays hidden while the status is still loading", () => {
    expect(shouldShowMembershipStepper({ ...base, authLoaded: false })).toBe(false);
    expect(shouldShowMembershipStepper({ ...base, memberStatusLoaded: false })).toBe(false);
  });
});
