import { describe, expect, it } from "vitest";
import { LINE_OA_URL } from "@/lib/config";
import { lineSlipHref, lineSlipMessage, normalizeLineOaId } from "@/lib/lineSlipLink";
import { MEMBERSHIP_STEPS, membershipStepNumber } from "@/lib/membershipSteps";

const input = { planName: "Teacher Pro", referenceCode: "KA-00000005", amountThb: 599 };

describe("LINE slip link", () => {
  it("writes the agreed message", () => {
    expect(lineSlipMessage(input)).toBe("ส่งสลิปสมัคร Teacher Pro เลขอ้างอิง KA-00000005 ยอด 599 บาท");
  });

  it("builds the oaMessage URL with the encoded message", () => {
    const href = lineSlipHref("@abc1234d", input);
    expect(href.startsWith("https://line.me/R/oaMessage/@abc1234d/?")).toBe(true);
    expect(decodeURIComponent(href.split("/?")[1])).toBe(lineSlipMessage(input));
  });

  it("falls back to the normal LINE link when the OA ID is missing or malformed", () => {
    for (const bad of [undefined, "", "abc", "@", "@a b", "https://evil.example/", "@x/../y"]) {
      expect(lineSlipHref(bad, input)).toBe(LINE_OA_URL);
    }
    expect(normalizeLineOaId(" @abc1234d ")).toBe("@abc1234d");
  });
});

describe("membership steps", () => {
  it("has the four labels in order", () => {
    expect(MEMBERSHIP_STEPS).toEqual(["กรอกใบสมัคร", "โอนเงิน", "ส่งสลิปทาง LINE", "รออนุมัติ"]);
  });

  it("moves 1 → 2 → 4 → done without touching approval logic", () => {
    expect(membershipStepNumber({ hasPendingApplication: false, lineSlipReceived: false, membershipActive: false })).toBe(1);
    expect(membershipStepNumber({ hasPendingApplication: true, lineSlipReceived: false, membershipActive: false })).toBe(2);
    expect(membershipStepNumber({ hasPendingApplication: true, lineSlipReceived: true, membershipActive: false })).toBe(4);
    expect(membershipStepNumber({ hasPendingApplication: false, lineSlipReceived: false, membershipActive: true })).toBe(5);
  });
});
