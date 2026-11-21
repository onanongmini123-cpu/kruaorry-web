export const MEMBERSHIP_STEPS = [
  "กรอกใบสมัคร",
  "โอนเงิน",
  "ส่งสลิปทาง LINE",
  "รออนุมัติ",
] as const;

export type WizardStep = 1 | 2 | 3 | 4;

export interface WizardStepInput {
  /** The member has an application waiting for approval. */
  hasPendingApplication: boolean;
  /**
   * The slip was sent: staff recorded it from LINE, or the member pressed
   * "ส่งสลิปแล้ว" in this browser (remembered per reference code).
   */
  slipSent: boolean;
  /** Payment cannot go ahead for this application (the page shows why on step 1). */
  paymentBlocked: boolean;
  /** The step the member moved to with the next / back buttons during this visit. */
  requested: WizardStep | null;
}

/**
 * One step per screen. Opening the page fresh lands on:
 * no pending application → 1, pending and slip not sent → 2, slip sent → 4.
 * Next / back buttons override that for the current visit only. Without a
 * pending application there is nothing to pay for, so it is always step 1; a
 * blocked application stays on step 1 where the reason and the fix are shown.
 */
export function resolveWizardStep({ hasPendingApplication, slipSent, paymentBlocked, requested }: WizardStepInput): WizardStep {
  if (!hasPendingApplication || paymentBlocked) return 1;
  if (requested !== null) return requested;
  return slipSent ? 4 : 2;
}

export interface MembershipStepperVisibilityInput {
  /** The sign-in check has finished. */
  authLoaded: boolean;
  signedIn: boolean;
  /** Entitlements, subscription and applications have all answered. */
  memberStatusLoaded: boolean;
  /** The member already has a paid plan (Teacher Pro / Founder) active. */
  membershipActive: boolean;
  /** The member has an application waiting for approval. */
  hasPendingApplication: boolean;
}

/**
 * The step wizard is for people who are still joining: visitors who are not
 * signed in, free members, and anyone with an application waiting for
 * approval. Members with an active paid plan do not see it. While the status
 * is still loading it stays hidden, so an active member never sees it flash.
 */
export function shouldShowMembershipStepper({
  authLoaded,
  signedIn,
  memberStatusLoaded,
  membershipActive,
  hasPendingApplication,
}: MembershipStepperVisibilityInput): boolean {
  if (!authLoaded) return false;
  if (!signedIn) return true;
  if (!memberStatusLoaded) return false;
  return hasPendingApplication || !membershipActive;
}
