import { describe, expect, it } from "vitest";
import { parseBankResponse, parseQrResponse, resolvePaymentView, type BankPayment, type MethodState, type QrPayment } from "../paymentMethods";

const qr: MethodState<QrPayment> = { status: "ready", amountThb: 599, accountName: "พร้อมเพย์ ทดสอบ", referenceCode: "KA-1", qrSvg: "<svg></svg>" };
const bank: MethodState<BankPayment> = { status: "ready", bankName: "ธนาคารตัวอย่าง", accountNumber: "123-4-56789-0", accountName: "บัญชี ทดสอบ", amountThb: 599, referenceCode: "KA-1" };
const off = { status: "not_configured" } as const;
const down = { status: "unavailable" } as const;

describe("resolvePaymentView", () => {
  it("shows both when PromptPay and the bank account are configured", () => {
    const view = resolvePaymentView(qr, bank);
    expect(view).toMatchObject({ kind: "ready", amountThb: 599, referenceCode: "KA-1", partialFailure: false });
    expect(view.kind === "ready" && view.qr && view.bank).toBeTruthy();
  });

  it("shows only the bank account when PromptPay is not configured", () => {
    const view = resolvePaymentView(off, bank);
    expect(view).toMatchObject({ kind: "ready", qr: null, amountThb: 599, partialFailure: false });
    expect(view.kind === "ready" && view.bank?.accountNumber).toBe("123-4-56789-0");
  });

  it("shows only the QR when the bank account is not configured (unchanged behaviour)", () => {
    const view = resolvePaymentView(qr, off);
    expect(view).toMatchObject({ kind: "ready", bank: null, amountThb: 599 });
    expect(view.kind === "ready" && view.qr?.qrSvg).toBe("<svg></svg>");
  });

  it("tells the member to use LINE when neither is configured", () => {
    expect(resolvePaymentView(off, off)).toEqual({ kind: "line_only" });
  });

  it("waits until both answers are in, so the layout does not jump", () => {
    expect(resolvePaymentView({ status: "loading" }, bank)).toEqual({ kind: "loading" });
    expect(resolvePaymentView(qr, { status: "loading" })).toEqual({ kind: "loading" });
  });

  it("says it is unavailable when nothing could be shown but a configured method failed", () => {
    expect(resolvePaymentView(down, off)).toEqual({ kind: "unavailable" });
    expect(resolvePaymentView(off, down)).toEqual({ kind: "unavailable" });
    expect(resolvePaymentView(down, down)).toEqual({ kind: "unavailable" });
  });

  it("shows the method that worked and flags the one that failed", () => {
    expect(resolvePaymentView(down, bank)).toMatchObject({ kind: "ready", qr: null, partialFailure: true });
    expect(resolvePaymentView(qr, down)).toMatchObject({ kind: "ready", bank: null, partialFailure: true });
  });

  it("refuses to show two different amounts or references", () => {
    expect(resolvePaymentView(qr, { ...bank, amountThb: 299 })).toEqual({ kind: "unavailable" });
    expect(resolvePaymentView(qr, { ...bank, referenceCode: "KA-2" })).toEqual({ kind: "unavailable" });
  });
});

describe("response parsers", () => {
  it("accept only complete, well-typed answers", () => {
    expect(parseBankResponse({ status: "ready", bankName: "b", accountNumber: "1234567890", accountName: "n", amountThb: 299, referenceCode: "KA-1" }).status).toBe("ready");
    expect(parseBankResponse({ status: "ready", bankName: "b", accountNumber: 1234567890, accountName: "n", amountThb: 299, referenceCode: "KA-1" }).status).toBe("unavailable");
    expect(parseBankResponse({ status: "not_configured" }).status).toBe("not_configured");
    expect(parseBankResponse({ status: "unauthenticated" }).status).toBe("unavailable");
    expect(parseBankResponse(null).status).toBe("unavailable");
    expect(parseQrResponse({ status: "ready", qrSvg: "<svg/>", amountThb: 299, accountName: "n", referenceCode: "KA-1" }).status).toBe("ready");
    expect(parseQrResponse({ status: "ready", qrSvg: "<svg/>" }).status).toBe("unavailable");
    expect(parseQrResponse("oops").status).toBe("unavailable");
  });
});
