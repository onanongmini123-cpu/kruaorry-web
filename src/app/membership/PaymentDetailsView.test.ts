import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentDetailsView, ReferenceLine, TransferAmount } from "./PaymentFlow";
import { resolvePaymentView, type BankPayment, type MethodState, type QrPayment } from "@/lib/paymentMethods";

const qr: MethodState<QrPayment> = { status: "ready", amountThb: 599, accountName: "ชื่อบัญชีเดียวกัน", referenceCode: "KA-00000005", qrSvg: "<svg data-qr></svg>" };
const bank: MethodState<BankPayment> = { status: "ready", bankName: "ธนาคารตัวอย่าง", accountNumber: "123-4-56789-0", accountName: "ชื่อบัญชีเดียวกัน", amountThb: 599, referenceCode: "KA-00000005" };
const off = { status: "not_configured" } as const;

const render = (q: MethodState<QrPayment>, b: MethodState<BankPayment>) => renderToStaticMarkup(
  React.createElement(PaymentDetailsView, { view: resolvePaymentView(q, b), accountCopied: false, onCopyAccount: () => {} }),
);
const count = (html: string, text: string) => html.split(text).length - 1;

describe("transfer amount and reference line (step 2)", () => {
  it("shows the big amount with 'โอนให้ตรงทุกบาท'", () => {
    const html = renderToStaticMarkup(React.createElement(TransferAmount, { amountThb: 599 }));
    expect(html).toContain("599 บาท");
    expect(html).toContain("โอนให้ตรงทุกบาท");
    expect(html).toContain('data-testid="transfer-amount"');
  });

  it("shows the reference small, with a copy button", () => {
    const html = renderToStaticMarkup(React.createElement(ReferenceLine, { referenceCode: "KA-00000005", copied: false, onCopy: () => {} }));
    expect(html).toContain("เลขอ้างอิง");
    expect(html).toContain("KA-00000005");
    expect(html).toContain("คัดลอกเลขอ้างอิง KA-00000005");
  });
});

describe("transfer methods", () => {
  it("PromptPay + bank account: the QR first, then the account; shared account name printed once", () => {
    const html = render(qr, bank);
    expect(html).toContain("data-qr");
    expect(html).toContain("123-4-56789-0");
    expect(html.indexOf("data-qr")).toBeLessThan(html.indexOf("123-4-56789-0"));
    expect(html).toContain("หรือโอนเข้าบัญชีธนาคาร");
    expect(html).toContain("คัดลอกเลขบัญชี");
    expect(count(html, "ชื่อบัญชีเดียวกัน")).toBe(1);
    expect(count(html, "123-4-56789-0")).toBe(2); // the number and its copy button label
  });

  it("two different account names are both shown (the QR owner is not hidden)", () => {
    const html = render({ ...qr, accountName: "ชื่อพร้อมเพย์" } as MethodState<QrPayment>, bank);
    expect(html).toContain("ชื่อพร้อมเพย์");
    expect(html).toContain("ชื่อบัญชีเดียวกัน");
  });

  it("bank account only: no QR, account with copy button", () => {
    const html = render(off, bank);
    expect(html).not.toContain("data-qr");
    expect(html).toContain("123-4-56789-0");
    expect(html).toContain("คัดลอกเลขบัญชี");
    expect(html).not.toContain("หรือโอนเข้าบัญชีธนาคาร");
  });

  it("PromptPay only: the QR and its owner's name, no bank block", () => {
    const html = render(qr, off);
    expect(html).toContain("data-qr");
    expect(html).toContain("ชื่อบัญชีเดียวกัน");
    expect(html).not.toContain("คัดลอกเลขบัญชี");
  });

  it("neither configured: only the LINE message", () => {
    const html = render(off, off);
    expect(html).toContain("แจ้งเลขอ้างอิงทาง LINE");
    expect(html).not.toContain("123-4-56789-0");
    expect(html).not.toContain("data-qr");
  });

  it("never prints the amount or the reference itself (the summary above owns them)", () => {
    const html = render(qr, bank);
    expect(html).not.toContain("transfer-amount");
    expect(html).not.toContain("ยอดที่ต้องโอน");
    expect(html).not.toContain("KA-00000005");
  });
});
