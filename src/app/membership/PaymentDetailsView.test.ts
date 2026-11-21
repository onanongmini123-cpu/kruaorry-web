import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentDetailsView } from "./PaymentFlow";
import { resolvePaymentView, type BankPayment, type MethodState, type QrPayment } from "@/lib/paymentMethods";

const qr: MethodState<QrPayment> = { status: "ready", amountThb: 599, accountName: "ชื่อพร้อมเพย์", referenceCode: "KA-00000005", qrSvg: "<svg data-qr></svg>" };
const bank: MethodState<BankPayment> = { status: "ready", bankName: "ธนาคารตัวอย่าง", accountNumber: "123-4-56789-0", accountName: "ชื่อบัญชีธนาคาร", amountThb: 599, referenceCode: "KA-00000005" };
const off = { status: "not_configured" } as const;

const render = (q: MethodState<QrPayment>, b: MethodState<BankPayment>) => renderToStaticMarkup(
  React.createElement(PaymentDetailsView, { view: resolvePaymentView(q, b), referenceCopied: false, accountCopied: false, onCopyReference: () => {}, onCopyAccount: () => {} }),
);

describe("payment details view", () => {
  it("PromptPay + bank account: shows the QR first, then the account, with the big amount and the exact-amount warning", () => {
    const html = render(qr, bank);
    expect(html).toContain("data-qr");
    expect(html).toContain("ธนาคารตัวอย่าง");
    expect(html).toContain("123-4-56789-0");
    expect(html).toContain("ชื่อบัญชีธนาคาร");
    expect(html.indexOf("data-qr")).toBeLessThan(html.indexOf("123-4-56789-0"));
    expect(html).toContain("599 บาท");
    expect(html).toContain("กรุณาโอนยอดนี้ให้ตรงทุกบาท");
    expect(html).toContain("KA-00000005");
    expect(html).toContain("คัดลอกเลขบัญชี");
    expect(html).toContain("คัดลอกเลขอ้างอิง");
    expect(html).toContain("หรือโอนเข้าบัญชีธนาคาร");
  });

  it("bank account only: no QR, account shown with copy button and the amount", () => {
    const html = render(off, bank);
    expect(html).not.toContain("data-qr");
    expect(html).not.toContain("สแกน QR พร้อมเพย์");
    expect(html).toContain("123-4-56789-0");
    expect(html).toContain("คัดลอกเลขบัญชี");
    expect(html).toContain("599 บาท");
    expect(html).toContain("กรุณาโอนยอดนี้ให้ตรงทุกบาท");
    expect(html).not.toContain("หรือโอนเข้าบัญชีธนาคาร");
  });

  it("neither configured: only the LINE message, no account, no amount", () => {
    const html = render(off, off);
    expect(html).toContain("แจ้งเลขอ้างอิงทาง LINE");
    expect(html).not.toContain("123-4-56789-0");
    expect(html).not.toContain("บาท");
  });

  it("PromptPay only keeps working as before", () => {
    const html = render(qr, off);
    expect(html).toContain("data-qr");
    expect(html).not.toContain("คัดลอกเลขบัญชี");
    expect(html).toContain("599 บาท");
  });

  it("shows the amount from the application data it is given, not from anywhere else", () => {
    const html = render({ ...qr, amountThb: 299 } as MethodState<QrPayment>, { ...bank, amountThb: 299 } as MethodState<BankPayment>);
    expect(html).toContain("299 บาท");
    expect(html).not.toContain("599 บาท");
  });
});
