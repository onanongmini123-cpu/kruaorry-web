import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("member account integration", () => {
  it("keeps anonymous and expired identities outside the member app", () => {
    expect(pageSource).toContain("supabase.auth.getUser().catch(() => null)");
    expect(pageSource).toContain("!authResult.error");
    expect(pageSource).toContain("isPermanentAuthUser(authResult.data.user)");
    expect(pageSource).toContain("router.replace(`/login?next=${encodeURIComponent(requestedPath)}`)");
  });

  it("loads only the signed-in member lifecycle and application status", () => {
    expect(pageSource).toContain("fetchMemberSubscription(supabase, user.id)");
    expect(pageSource).toContain("fetchUpgradeRequestsResult(supabase, user.id)");
    expect(pageSource).toContain("subscription={subscription}");
    expect(pageSource).toContain("entitlementsStatus={entitlementState.status}");
    expect(pageSource).toContain("onRetryEntitlements={retryEntitlements}");
    expect(pageSource).toContain("applications={upgradeRequests}");
    expect(pageSource).toContain("applicationsError={upgradeRequestsError}");
    expect(pageSource).toContain("membershipSummary={(");
  });

  it("renders the member plan through the shared display-name policy", () => {
    expect(pageSource).toContain("planDisplayName(");
    expect(pageSource).toContain("memberPlanIdForDisplay(entitlements, subscription)");
    expect(pageSource).toContain("<small>แพ็ก {currentPlanDisplayName}</small>");
    expect(pageSource).toContain("แพ็กปัจจุบันของคุณคือ {currentPlanDisplayName}");
    expect(pageSource).not.toContain("<small>แพ็ก {entitlements.planId}</small>");
    expect(pageSource).not.toContain("แพ็กปัจจุบันของคุณคือ {entitlements.planId}");
  });

  it("uses a large labelled home link in the responsive member hero", () => {
    expect(pageSource).toContain('<BrandLogo href="/" mascotSize="clamp(96px, 24vw, 144px)"');
    expect(pageSource).toContain(".kru-member-hero__mascot { min-height: 180px;");
    expect(pageSource).toContain(".kru-member-hero__mascot { min-height: 230px; margin-top: 0; }");
  });

  it("preserves the explicit premium upgrade journey", () => {
    expect(pageSource).toContain("membershipUpgradeHref");
    expect(pageSource).toContain("router.push(membershipUpgradeHref(r, `/app?resource=${r.id}`))");
  });

  it("shows pending upgrade status only for a matching required plan", () => {
    expect(pageSource).toContain('application.status === "pending" && resource.requiredPlanIds.includes(application.planId)');
    expect(pageSource).toContain("upgradePending={hasPendingUpgradeFor(resource)}");
    expect(pageSource).toContain("คำขออัปเกรดอยู่ระหว่างดำเนินการ");
    expect(pageSource).toContain("ติดตามคำขออัปเกรด");
  });

  it("exposes the current member destination in both desktop and mobile navigation", () => {
    expect(pageSource).toContain('ariaLabel="เมนูสมาชิก"');
    expect(pageSource).toContain('aria-label="เมนูสมาชิกบนมือถือ"');
    expect(pageSource).toContain('aria-current={active ? "page" : undefined}');
  });
});
