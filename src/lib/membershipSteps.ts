export const MEMBERSHIP_STEPS = [
  "กรอกใบสมัคร",
  "โอนเงิน",
  "ส่งสลิปทาง LINE",
  "รออนุมัติ",
] as const;

export interface MembershipStepInput {
  /** A pending application exists for the signed-in member. */
  hasPendingApplication: boolean;
  /** Staff recorded the LINE slip receipt for that application. */
  lineSlipReceived: boolean;
  /** The member already has the paid plan active. */
  membershipActive: boolean;
}

/**
 * The current step, 1-based. Steps 2 and 3 are done together (transfer, then
 * send the slip), so a pending application stays on step 2 until staff record
 * the slip, which moves it to step 4. An active membership completes all four.
 */
export function membershipStepNumber({ hasPendingApplication, lineSlipReceived, membershipActive }: MembershipStepInput): 1 | 2 | 4 | 5 {
  if (membershipActive) return 5;
  if (!hasPendingApplication) return 1;
  return lineSlipReceived ? 4 : 2;
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
 * The 4-step bar is for people who are still joining: visitors who are not
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
