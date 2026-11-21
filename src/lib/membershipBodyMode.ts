export type MembershipBodyMode =
  | "unconfigured" | "checking" | "unavailable" | "authLoading"
  | "legacySignIn" | "signedOut" | "approved" | "pending" | "rejected"
  | "legacyNote" | "updating" | "errors" | "create";

export interface MembershipBodyModeInput {
  supabaseConfigured: boolean;
  schemaReadiness: "checking" | "ready" | "unavailable";
  authLoaded: boolean;
  signedIn: boolean;
  /** The resource the member came from has no plan that is on sale. */
  noSelectablePlanForResource: boolean;
  /** The paid plan is active and unlocks what the member asked for. */
  hasUnlockedMembership: boolean;
  /** There is an application waiting for approval. */
  hasOpenApplication: boolean;
  /** The application the member sent a slip for was declined and they have not started over yet. */
  rejectedNotice: boolean;
  /** Reading the member's status failed. */
  memberStatusError: boolean;
  /** A paid plan is active but does not unlock the requested resource's plan change. */
  activeMembershipStillSettling: boolean;
  /** Any read behind the application form failed. */
  readsFailed: boolean;
}

/**
 * What /membership shows, checked in this order (the same order the page used
 * before it became a wizard). Only signedOut, create and pending are wizard
 * steps; everything else is a status message or the approved panel.
 */
export function resolveMembershipBodyMode(i: MembershipBodyModeInput): MembershipBodyMode {
  if (!i.supabaseConfigured) return "unconfigured";
  if (i.schemaReadiness === "checking") return "checking";
  if (i.schemaReadiness === "unavailable") return "unavailable";
  if (!i.authLoaded) return "authLoading";
  if (!i.signedIn && i.noSelectablePlanForResource) return "legacySignIn";
  if (!i.signedIn) return "signedOut";
  if (i.hasUnlockedMembership) return "approved";
  if (i.hasOpenApplication) return "pending";
  if (i.rejectedNotice) return "rejected";
  if (i.noSelectablePlanForResource && !i.memberStatusError) return "legacyNote";
  if (i.activeMembershipStillSettling) return "updating";
  if (i.readsFailed) return "errors";
  return "create";
}
