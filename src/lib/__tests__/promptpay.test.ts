import { describe, expect, it } from "vitest";
import { buildPromptPayPayload, crc16, parsePromptPayId } from "@/lib/promptpay";

describe("PromptPay payload", () => {
  it("implements CRC-16/CCITT-FALSE (standard check value for 123456789 is 29B1)", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("builds the exact EMVCo payload for a phone number and amount", () => {
    const payload = buildPromptPayPayload("081-234-5678", 599);
    const body = "00020101021229370016A0000006770101110113006681234567853037645406599.005802TH6304";
    expect(payload).toBe(`${body}${crc16(body)}`);
    expect(payload?.startsWith("000201010212")).toBe(true);
    expect(payload).toContain("5406599.00");
  });

  it("accepts the three PromptPay ID kinds and rejects everything else", () => {
    expect(parsePromptPayId("0812345678")).toEqual({ kind: "phone", value: "0066812345678" });
    expect(parsePromptPayId("66812345678")).toEqual({ kind: "phone", value: "0066812345678" });
    expect(parsePromptPayId("1234567890123")).toEqual({ kind: "nationalId", value: "1234567890123" });
    expect(parsePromptPayId("123456789012345")).toEqual({ kind: "eWallet", value: "123456789012345" });
    for (const bad of ["", "abc", "12345", "0812345", null, undefined, 812345678]) {
      expect(parsePromptPayId(bad)).toBeNull();
    }
  });

  it("uses the national-ID and e-wallet sub-tags", () => {
    expect(buildPromptPayPayload("1234567890123", 299)).toContain("0213" + "1234567890123");
    expect(buildPromptPayPayload("123456789012345", 299)).toContain("0315" + "123456789012345");
  });

  it("refuses to build a QR for an unsafe amount instead of guessing", () => {
    for (const amount of [0, -1, NaN, Infinity, 10.005, 99_999_999]) {
      expect(buildPromptPayPayload("0812345678", amount)).toBeNull();
    }
    expect(buildPromptPayPayload("not-an-id", 599)).toBeNull();
    expect(buildPromptPayPayload("0812345678", 299.5)).toContain("299.50");
  });
});
