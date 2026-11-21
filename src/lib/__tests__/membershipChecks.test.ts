import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  failedMembershipChecks,
  failedMembershipChecksMessage,
  membershipChecksLoading,
  onlyFounderChecksFailed,
  planCheckLabel,
  type MembershipChecksInput,
} from "@/lib/membershipChecks";

const settled: MembershipChecksInput = {
  isConfigured: true, schemaReadiness: "ready", authLoaded: true, signedIn: true, memberStatusLoaded: true,
  capacityLoaded: true, founderHistoryLoaded: true, founderChecksNeeded: true, capacityMissing: false,
  founderHistoryError: false, applicationsError: false, entitlementsError: false, subscriptionError: false,
};
const input = (over: Partial<MembershipChecksInput> = {}): MembershipChecksInput => ({ ...settled, ...over });

describe("membership checks: loading versus failed", () => {
  it("is neither loading nor failed when every read answered", () => {
    expect(membershipChecksLoading(input())).toBe(false);
    expect(failedMembershipChecks(input())).toEqual([]);
  });

  it("is loading (and reports no failure yet) until every read the page needs has answered", () => {
    for (const over of [
      { schemaReadiness: "checking" as const }, { authLoaded: false }, { memberStatusLoaded: false },
      { capacityLoaded: false }, { founderHistoryLoaded: false },
    ]) {
      const state = input({ ...over, capacityMissing: true, founderHistoryError: true, applicationsError: true });
      expect(membershipChecksLoading(state)).toBe(true);
      expect(failedMembershipChecks(state)).toEqual([]);
    }
  });

  it("does not wait for Founder history when the visitor is signed out or Teacher is selected", () => {
    expect(membershipChecksLoading(input({ signedIn: false, founderHistoryLoaded: false }))).toBe(false);
    expect(membershipChecksLoading(input({ founderChecksNeeded: false, founderHistoryLoaded: false }))).toBe(false);
  });

  it("reports exactly the reads that failed, in a stable order", () => {
    const failed = failedMembershipChecks(input({
      capacityMissing: true, founderHistoryError: true, applicationsError: true, entitlementsError: true, subscriptionError: true,
    }));
    expect(failed).toEqual(["founderCapacity", "founderHistory", "applications", "entitlements", "subscription"]);
    expect(failedMembershipChecks(input({ subscriptionError: true }))).toEqual(["subscription"]);
    expect(failedMembershipChecks(input({ entitlementsError: true }))).toEqual(["entitlements"]);
  });

  it("never blames Founder reads while Teacher Pro is selected (they are not requested then)", () => {
    expect(failedMembershipChecks(input({ founderChecksNeeded: false, capacityMissing: true, founderHistoryError: true }))).toEqual([]);
  });

  it("never reports member reads for a signed-out visitor", () => {
    expect(failedMembershipChecks(input({ signedIn: false, applicationsError: true, entitlementsError: true, subscriptionError: true, founderHistoryError: true }))).toEqual([]);
    expect(failedMembershipChecks(input({ signedIn: false, capacityMissing: true }))).toEqual(["founderCapacity"]);
  });

  it("reports an unavailable readiness check on its own, and nothing when Supabase is not configured", () => {
    expect(failedMembershipChecks(input({ schemaReadiness: "unavailable", applicationsError: true }))).toEqual(["readiness"]);
    expect(failedMembershipChecks(input({ isConfigured: false, capacityMissing: true }))).toEqual([]);
    expect(membershipChecksLoading(input({ isConfigured: false, schemaReadiness: "checking" }))).toBe(false);
  });

  it("says in Thai which reads failed, and whether Teacher Pro is still available", () => {
    expect(failedMembershipChecksMessage(["founderCapacity", "applications"])).toBe("ตรวจสอบไม่สำเร็จ: จำนวนที่นั่ง Founder, ใบสมัครของบัญชี");
    expect(onlyFounderChecksFailed(["founderCapacity", "founderHistory"])).toBe(true);
    expect(onlyFounderChecksFailed(["founderCapacity", "applications"])).toBe(false);
    expect(onlyFounderChecksFailed([])).toBe(false);
  });

  it("labels a disabled plan button differently while loading and after a failure", () => {
    expect(planCheckLabel(true)).toBe("กำลังตรวจสอบสิทธิ์…");
    expect(planCheckLabel(false)).toBe("ตรวจสอบไม่สำเร็จ");
  });
});

describe("membership page wiring", () => {
  const page = readFileSync(join(__dirname, "..", "..", "app", "membership", "page.tsx"), "utf8");

  it("uses the shared label and shows a retry button for failed reads", () => {
    expect(page).toContain("planCheckLabel(checksLoading)");
    expect(page).toContain("failedMembershipChecksMessage(failedChecks)");
    expect(page).toContain("ลองอีกครั้ง");
  });

  it("does not change prices, seats or approval: the page still never calls payment confirmation", () => {
    expect(page).not.toContain("confirmMembershipPayment");
    expect(page).not.toContain("reportMembershipPayment");
    // Prices are the fixed card copy (299 first year Founder, 599 Teacher Pro); the application's own quote is what is charged.
    const copy = readFileSync(join(__dirname, "..", "membershipPlanCopy.ts"), "utf8");
    expect(copy).toContain('price: "299 บาท ปีแรก"');
    expect(copy).toContain('price: "599 บาท/ปี"');
  });
});
