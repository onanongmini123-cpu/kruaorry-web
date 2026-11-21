import { describe, expect, it } from "vitest";
import { resolveMembershipBodyMode, type MembershipBodyModeInput } from "../membershipBodyMode";

const ready: MembershipBodyModeInput = {
  supabaseConfigured: true, schemaReadiness: "ready", authLoaded: true, signedIn: true,
  noSelectablePlanForResource: false, hasUnlockedMembership: false, hasOpenApplication: false, rejectedNotice: false,
  memberStatusError: false, activeMembershipStillSettling: false, readsFailed: false,
};
const mode = (over: Partial<MembershipBodyModeInput>) => resolveMembershipBodyMode({ ...ready, ...over });

describe("resolveMembershipBodyMode: which screen /membership opens on", () => {
  it("not signed in → step 1 with the sign-in button", () => {
    expect(mode({ signedIn: false })).toBe("signedOut");
  });

  it("signed in, no pending application → step 1 (create)", () => {
    expect(mode({})).toBe("create");
  });

  it("a pending application → the wizard continues (step 2/3/4 decided by resolveWizardStep)", () => {
    expect(mode({ hasOpenApplication: true })).toBe("pending");
  });

  it("an active plan → the wizard is gone and the approved panel shows", () => {
    expect(mode({ hasUnlockedMembership: true })).toBe("approved");
    expect(mode({ hasUnlockedMembership: true, hasOpenApplication: true })).toBe("approved");
  });

  it("a declined application the member had sent a slip for → the rejected message; a pending one always wins", () => {
    expect(mode({ rejectedNotice: true })).toBe("rejected");
    expect(mode({ rejectedNotice: true, hasOpenApplication: true })).toBe("pending");
    expect(mode({ rejectedNotice: true, hasUnlockedMembership: true })).toBe("approved");
  });

  it("an old declined application never makes a screen of its own: it is just 'create' (history is collapsed)", () => {
    expect(mode({ hasOpenApplication: false })).toBe("create");
  });

  it("system states come first and no wizard is shown", () => {
    expect(mode({ supabaseConfigured: false })).toBe("unconfigured");
    expect(mode({ schemaReadiness: "checking" })).toBe("checking");
    expect(mode({ schemaReadiness: "unavailable" })).toBe("unavailable");
    expect(mode({ authLoaded: false })).toBe("authLoading");
  });

  it("a resource with no plan on sale gets the legacy messages, not the wizard", () => {
    expect(mode({ signedIn: false, noSelectablePlanForResource: true })).toBe("legacySignIn");
    expect(mode({ noSelectablePlanForResource: true })).toBe("legacyNote");
  });

  it("failed reads show a retry message instead of the wizard", () => {
    expect(mode({ readsFailed: true })).toBe("errors");
    expect(mode({ readsFailed: true, memberStatusError: true })).toBe("errors");
  });

  it("an approved plan that is still settling shows the updating message", () => {
    expect(mode({ activeMembershipStillSettling: true })).toBe("updating");
  });
});
