import { describe, expect, it } from "vitest";
import { resolveWizardStep, shouldShowMembershipStepper, type WizardStep } from "../membershipSteps";

const base = { hasPendingApplication: true, slipSent: false, paymentBlocked: false, requested: null as WizardStep | null };

describe("resolveWizardStep: which step opens", () => {
  it("no pending application → step 1, whatever else is remembered", () => {
    expect(resolveWizardStep({ ...base, hasPendingApplication: false })).toBe(1);
    expect(resolveWizardStep({ ...base, hasPendingApplication: false, slipSent: true, requested: 3 })).toBe(1);
  });

  it("pending and the slip not sent → step 2", () => {
    expect(resolveWizardStep(base)).toBe(2);
  });

  it("slip sent (pressed here, or recorded by staff) → step 4", () => {
    expect(resolveWizardStep({ ...base, slipSent: true })).toBe(4);
  });

  it("an application that cannot be paid stays on step 1 where the reason is shown", () => {
    expect(resolveWizardStep({ ...base, paymentBlocked: true })).toBe(1);
    expect(resolveWizardStep({ ...base, paymentBlocked: true, slipSent: true, requested: 3 })).toBe(1);
  });

  it("next / back during the visit override the opening step", () => {
    expect(resolveWizardStep({ ...base, requested: 3 })).toBe(3);                    // 2 → next
    expect(resolveWizardStep({ ...base, requested: 1 })).toBe(1);                    // 2 → back
    expect(resolveWizardStep({ ...base, slipSent: true, requested: 3 })).toBe(3);    // 4 → back to 3
    expect(resolveWizardStep({ ...base, requested: 4 })).toBe(4);                    // 3 → "ส่งสลิปแล้ว"
  });
});

describe("shouldShowMembershipStepper", () => {
  const input = { authLoaded: true, signedIn: true, memberStatusLoaded: true, membershipActive: false, hasPendingApplication: false };

  it("shows for a visitor who is not signed in", () => {
    expect(shouldShowMembershipStepper({ ...input, signedIn: false, memberStatusLoaded: false })).toBe(true);
  });

  it("shows for a free member, and for one with a pending application", () => {
    expect(shouldShowMembershipStepper(input)).toBe(true);
    expect(shouldShowMembershipStepper({ ...input, hasPendingApplication: true })).toBe(true);
  });

  it("hides for a member with an active paid plan, and while loading", () => {
    expect(shouldShowMembershipStepper({ ...input, membershipActive: true })).toBe(false);
    expect(shouldShowMembershipStepper({ ...input, authLoaded: false })).toBe(false);
    expect(shouldShowMembershipStepper({ ...input, memberStatusLoaded: false })).toBe(false);
  });
});
