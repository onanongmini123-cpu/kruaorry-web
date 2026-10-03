import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("member account integration", () => {
  it("loads only the signed-in member lifecycle and application status", () => {
    expect(pageSource).toContain("fetchMemberSubscription(supabase, user.id)");
    expect(pageSource).toContain("fetchUpgradeRequestsResult(supabase, user.id)");
    expect(pageSource).toContain("subscription={subscription}");
    expect(pageSource).toContain("applications={upgradeRequests}");
    expect(pageSource).toContain("applicationsError={upgradeRequestsError}");
    expect(pageSource).toContain("membershipSummary={(");
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
});
