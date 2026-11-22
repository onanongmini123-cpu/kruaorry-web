import { describe, expect, it } from "vitest";
import { LINE_OA_URL } from "@/lib/config";
import { lineSlipAction, lineSlipHref, lineSlipMessage, normalizeLineOaId } from "@/lib/lineSlipLink";
import { MEMBERSHIP_STEPS } from "@/lib/membershipSteps";

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

describe("LINE slip action (with / without an OA ID)", () => {
  it("with a configured OA ID: the chat opens with the message typed in, nothing to copy first", () => {
    const action = lineSlipAction("@abc1234d", input);
    expect(action.copyFirst).toBe(false);
    expect(action.href.startsWith("https://line.me/R/oaMessage/@abc1234d/?")).toBe(true);
    expect(decodeURIComponent(action.href.split("/?")[1])).toBe("ส่งสลิปสมัคร Teacher Pro เลขอ้างอิง KA-00000005 ยอด 599 บาท");
  });

  it("without an OA ID (or a malformed one): plain LINE link, and the message must be copied first", () => {
    for (const bad of [undefined, "", "abc", "https://evil.example/", "@x/../y"]) {
      expect(lineSlipAction(bad, input)).toEqual({ href: LINE_OA_URL, copyFirst: true });
    }
  });
});

describe("membership step labels", () => {
  it("has the four labels in order", () => {
    expect(MEMBERSHIP_STEPS).toEqual(["เลือกแพ็ก", "โอนเงิน", "ส่งสลิป", "รออนุมัติ"]);
  });
});
