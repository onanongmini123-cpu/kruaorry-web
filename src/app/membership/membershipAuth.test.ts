import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("membership auth boundary", () => {
  it("loads member and payment state only for a verified permanent identity", () => {
    expect(pageSource).toContain("supabase.auth.getUser().catch(() => null)");
    expect(pageSource).toContain("!authResult.error");
    expect(pageSource).toContain("isPermanentAuthUser(authResult.data.user)");
    expect(pageSource).toContain("setUserId(user?.id ?? null)");
  });

  it("blocks payment actions and preserves paid fallback state when entitlement reads fail", () => {
    expect(pageSource.match(/setMemberStatusError\(entitlementResult\.error \|\| subscriptionResult\.error\)/g))
      .toHaveLength(3);
    expect(pageSource.match(/if \(!subscriptionResult\.error\) setSubscription\(subscriptionResult\.subscription\)/g))
      .toHaveLength(3);
    expect(pageSource).toContain("const pendingPaymentBlocked = memberStatusError");
    expect(pageSource).toContain('schemaReadiness !== "ready" || memberStatusError || applicationsError');
    expect(pageSource).toContain("ยังตรวจสอบสิทธิ์สมาชิกไม่ได้");
    expect(pageSource).toContain("ลองตรวจสอบอีกครั้ง");
  });
});
