import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UpgradeRequest } from "@/lib/data";
import { founderSeatsBadge } from "@/lib/founderCapacity";
import { lineSlipAction } from "@/lib/lineSlipLink";
import { PLAN_CARD_COPY, START_HINT, planBenefitLines } from "@/lib/membershipPlanCopy";
import { MEMBERSHIP_STEPS } from "@/lib/membershipSteps";
import { MembershipStepper, PaymentDetailsView } from "./PaymentFlow";
import { resolvePaymentView, type BankPayment, type MethodState, type QrPayment } from "@/lib/paymentMethods";
import {
  ApplicationHistory, ApprovedPanel, PendingSummary, PlanStep, RejectedPanel, SlipStep, TransferStep, WaitingStep,
  type PlanCardView,
} from "./WizardSteps";

const noop = () => {};
const h = renderToStaticMarkup;
const el = React.createElement;
/** What a person reads: tags, attributes and <style> blocks removed. */
const textOf = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const count = (text: string, needle: string | RegExp) => (typeof needle === "string"
  ? text.split(needle).length - 1
  : (text.match(new RegExp(needle.source, needle.flags.includes("g") ? needle.flags : `${needle.flags}g`)) ?? []).length);

const application = { id: "11111111-2222-4333-8444-555555555555", referenceCode: "KA-00000005", quotedAmountThb: 599, planId: "teacher" };
const ACCOUNT = "123-4-56789-0";

const card = (over: Partial<PlanCardView> & { id: "founder" | "teacher" }): PlanCardView => ({
  title: PLAN_CARD_COPY[over.id].title, price: PLAN_CARD_COPY[over.id].price, priceNote: PLAN_CARD_COPY[over.id].priceNote,
  badge: null, unavailableLabel: null, selected: false, ...over,
});
const planStep = (over: Record<string, unknown> = {}) => h(el(PlanStep, {
  cards: [card({ id: "founder", badge: "เหลือ 90 ที่" }), card({ id: "teacher", selected: true })],
  benefits: planBenefitLines("teacher"),
  cta: { kind: "button", label: "สมัครแพ็กนี้", loading: false, disabled: false, onClick: noop },
  onSelect: noop, focusHeading: false, ...over,
}));

const qr: MethodState<QrPayment> = { status: "ready", amountThb: 599, accountName: "ชื่อพร้อมเพย์", referenceCode: "KA-00000005", qrSvg: "<svg data-qr></svg>" };
const bank: MethodState<BankPayment> = { status: "ready", bankName: "ธนาคารตัวอย่าง", accountNumber: ACCOUNT, accountName: "ชื่อบัญชีธนาคาร", amountThb: 599, referenceCode: "KA-00000005" };
const off = { status: "not_configured" } as const;

describe("stepper always shows the current step", () => {
  it("has the four labels in the agreed order", () => {
    expect(MEMBERSHIP_STEPS).toEqual(["เลือกแพ็ก", "โอนเงิน", "ส่งสลิป", "รออนุมัติ"]);
  });

  it("marks exactly one step as current, earlier steps done, later ones to do", () => {
    for (const current of [1, 2, 3, 4]) {
      const html = h(el(MembershipStepper, { current }));
      expect(html.split('aria-current="step"').length - 1).toBe(1);
      const states = [...html.matchAll(/<li data-state="(done|current|todo)"/g)].map((m) => m[1]);
      expect(states).toEqual(MEMBERSHIP_STEPS.map((_, i) => (i + 1 < current ? "done" : i + 1 === current ? "current" : "todo")));
    }
  });
});

describe("step 1: choose a plan", () => {
  it("one heading, two plan cards, three benefit lines, one main button, one small line", () => {
    const html = planStep();
    const text = textOf(html);
    expect(text).toContain("เลือกแพ็กที่ต้องการ");
    expect(count(html, 'role="radio"')).toBe(2);
    expect(text).toContain("Founder 100");
    expect(text).toContain("299 บาท ปีแรก");
    expect(text).toContain("(ปีต่อไป 599)");
    expect(text).toContain("เหลือ 90 ที่");
    expect(text).toContain("Teacher Pro");
    expect(text).toContain("599 บาท/ปี");
    expect(count(html, "<li")).toBe(3);
    expect(text).toContain("เล่นเกมและใช้สื่อ Pro ได้ทุกชิ้น");
    expect(text).toContain("ดาวน์โหลดไฟล์ Pro");
    expect(text).toContain("บันทึกสื่อโปรดไม่จำกัด");
    expect(text).toContain("สมัครแพ็กนี้");
    expect(count(text, START_HINT)).toBe(1);
  });

  it("Founder adds the Founder badge line", () => {
    expect(planBenefitLines("founder")).toEqual([...planBenefitLines("teacher"), "ตรา Founder"]);
    expect(textOf(planStep({ benefits: planBenefitLines("founder"), cards: [card({ id: "founder", selected: true }), card({ id: "teacher" })] }))).toContain("ตรา Founder");
  });

  it("not signed in: the button says 'เข้าสู่ระบบ / สมัครฟรี เพื่อไปต่อ' and is a link to login", () => {
    const html = planStep({ cta: { kind: "link", href: "/login?next=%2Fmembership%3Fplan%3Dteacher", label: "เข้าสู่ระบบ / สมัครฟรี เพื่อไปต่อ" } });
    expect(textOf(html)).toContain("เข้าสู่ระบบ / สมัครฟรี เพื่อไปต่อ");
    expect(html).toContain('href="/login?next=%2Fmembership%3Fplan%3Dteacher"');
    expect(textOf(html)).not.toContain("สมัครแพ็กนี้");
  });

  it("Founder full: the card is grey, says 'เต็มแล้ว' and cannot be chosen; Teacher Pro stays selectable", () => {
    const html = planStep({ cards: [card({ id: "founder", unavailableLabel: "เต็มแล้ว" }), card({ id: "teacher", selected: true })] });
    expect(textOf(html)).toContain("เต็มแล้ว");
    expect(textOf(html)).not.toContain("เหลือ");
    const [founder, teacher] = html.split("</button>");
    expect(founder).toContain("Founder 100");
    expect(founder).toMatch(/\sdisabled/);
    expect(founder).toContain('aria-checked="false"');
    expect(teacher).toContain("Teacher Pro");
    expect(teacher).not.toMatch(/\sdisabled/);
    expect(teacher).toContain('aria-checked="true"');
  });

  it("Founder first year already used on this account: same grey card with its own words", () => {
    expect(textOf(planStep({ cards: [card({ id: "founder", unavailableLabel: "ใช้สิทธิ์ปีแรกแล้ว" }), card({ id: "teacher", selected: true })] }))).toContain("ใช้สิทธิ์ปีแรกแล้ว");
  });

  it("no button when the only plan that can unlock the media cannot be bought (the reason is shown instead)", () => {
    const html = planStep({ cta: null, notices: el("p", null, "Founder ครบ 100 สิทธิ์แล้ว และ Teacher Pro ไม่สามารถเปิดสื่อรายการนี้ได้") });
    expect(textOf(html)).toContain("ไม่สามารถเปิดสื่อรายการนี้ได้");
    expect(textOf(html)).not.toContain("สมัครแพ็กนี้");
    expect(textOf(html)).not.toContain(START_HINT);
  });

  it("the Founder badge says how many places are left, or that it is full", () => {
    expect(founderSeatsBadge({ isFull: false, remaining: 90 })).toBe("เหลือ 90 ที่");
    expect(founderSeatsBadge({ isFull: false, remaining: 1 })).toBe("เหลือ 1 ที่");
    expect(founderSeatsBadge({ isFull: true, remaining: 0 })).toBe("เต็มแล้ว");
  });
});

describe("step 1 again with an application already waiting", () => {
  it("shows the plan and amount once, and one button to the transfer; blocked applications show the reason instead", () => {
    const html = h(el(PendingSummary, { planLabel: "Teacher Pro", amountThb: 599, onContinue: noop, focusHeading: false }));
    expect(textOf(html)).toContain("ใบสมัครของคุณ");
    expect(count(textOf(html), "599 บาท")).toBe(1);
    expect(textOf(html)).toContain("ไปโอนเงิน");
    const blocked = h(el(PendingSummary, { planLabel: "Founder", amountThb: 299, onContinue: null, extra: el("p", null, "Founder ครบ 100 สิทธิ์ก่อนการยืนยันยอด"), focusHeading: false }));
    expect(textOf(blocked)).toContain("Founder ครบ 100 สิทธิ์ก่อนการยืนยันยอด");
    expect(textOf(blocked)).not.toContain("ไปโอนเงิน");
  });
});

describe("step 2: transfer", () => {
  const methods = (q: MethodState<QrPayment>, b: MethodState<BankPayment>) => h(el(PaymentDetailsView, { view: resolvePaymentView(q, b), accountCopied: false, onCopyAccount: noop }));
  const step2 = h(el(TransferStep, { application, referenceCopied: false, legacyReportedAt: null, onCopyReference: noop, onBack: noop, onNext: noop, onAlreadySent: noop, focusHeading: false }));

  it("heading, big amount, 'โอนให้ตรงทุกบาท', reference once, main button 'โอนแล้ว ไปส่งสลิป', back, and the link for someone who already sent it", () => {
    const text = textOf(step2);
    expect(text).toContain("โอนเงิน");
    expect(count(text, "599 บาท")).toBe(1);
    expect(text).toContain("โอนให้ตรงทุกบาท");
    expect(count(text, "KA-00000005")).toBe(1);
    expect(text).toContain("โอนแล้ว ไปส่งสลิป");
    expect(text).toContain("ย้อนกลับ");
    expect(text).toContain("ส่งสลิปแล้ว? ดูสถานะ");
  });

  it("has no LINE or slip wording yet (that is step 3)", () => {
    expect(textOf(step2)).not.toContain("เปิด LINE ส่งสลิป");
    expect(textOf(step2)).not.toContain("ไม่เก็บ");
  });

  it("the transfer methods: QR first then account / account only / QR only / neither", () => {
    const both = methods(qr, bank);
    expect(both.indexOf("data-qr")).toBeLessThan(both.indexOf(ACCOUNT));
    expect(count(textOf(both), ACCOUNT)).toBe(1);
    expect(count(textOf(methods(off, bank)), ACCOUNT)).toBe(1);
    expect(methods(off, bank)).not.toContain("data-qr");
    expect(methods(qr, off)).toContain("data-qr");
    expect(methods(qr, off)).not.toContain(ACCOUNT);
    expect(textOf(methods(off, off))).toContain("แจ้งเลขอ้างอิงทาง LINE");
    expect(methods(off, off)).not.toContain(ACCOUNT);
  });
});

describe("step 3: send the slip on LINE", () => {
  const slip = (oaId: string | undefined, over: Record<string, unknown> = {}) => {
    const action = lineSlipAction(oaId, { planName: "Teacher Pro", referenceCode: "KA-00000005", amountThb: 599 });
    return h(el(SlipStep, { href: action.href, copyFirst: action.copyFirst, feedback: null, fallbackMessage: null, onOpenLine: noop, onSent: noop, onBack: noop, focusHeading: false, ...over }));
  };

  it("heading, the one-line explanation, main button, 'ส่งสลิปแล้ว', one privacy line and the small back button", () => {
    const text = textOf(slip("@abc1234d"));
    expect(text).toContain("ส่งสลิปทาง LINE");
    expect(text).toContain("กดปุ่มด้านล่าง แชตจะเปิดพร้อมข้อความ แนบรูปสลิปแล้วกดส่ง");
    expect(text).toContain("เปิด LINE ส่งสลิป");
    expect(text).toContain("ส่งสลิปแล้ว");
    expect(count(text, "เว็บไม่เก็บรูปสลิป ส่งทาง LINE ที่เดียว")).toBe(1);
    expect(text).toContain("ย้อนกลับไปดูเลขบัญชี");
  });

  it("with an OA ID: the button is the oaMessage link and nothing has to be copied first", () => {
    const html = slip("@abc1234d");
    const href = /href="([^"]+)"/.exec(html)?.[1].replace(/&amp;/g, "&") ?? "";
    expect(href.startsWith("https://line.me/R/oaMessage/@abc1234d/?")).toBe(true);
    expect(decodeURIComponent(href.split("/?")[1])).toBe("ส่งสลิปสมัคร Teacher Pro เลขอ้างอิง KA-00000005 ยอด 599 บาท");
    expect(html).toContain('data-copy-first="false"');
  });

  it("without an OA ID: the button opens lin.ee and the page copies the message first", () => {
    const html = slip(undefined);
    expect(html).toContain('href="https://lin.ee/wDZy0GhC"');
    expect(html).toContain('data-copy-first="true"');
  });

  it("shows the toast after copying, and the message to copy by hand only if copying failed", () => {
    expect(slip(undefined, { feedback: "คัดลอกข้อความแล้ว วางในแชตได้เลย" })).toMatch(/role="status"[^>]*>คัดลอกข้อความแล้ว วางในแชตได้เลย</);
    expect(textOf(slip(undefined))).not.toContain("ส่งสลิปสมัคร");
    expect(textOf(slip(undefined, { fallbackMessage: "ส่งสลิปสมัคร Teacher Pro เลขอ้างอิง KA-00000005 ยอด 599 บาท" }))).toContain("ส่งสลิปสมัคร Teacher Pro เลขอ้างอิง KA-00000005 ยอด 599 บาท");
  });
});

describe("step 4: waiting", () => {
  const wait = (over: Record<string, unknown> = {}) => h(el(WaitingStep, { referenceCode: "KA-00000005", referenceCopied: false, slipReceivedAt: null, legacyReportedAt: null, onCopyReference: noop, onBackToSlip: noop, focusHeading: false, ...over }));

  it("⏳, the heading, the one-business-day line, the reference once and the way back", () => {
    const html = wait();
    const text = textOf(html);
    expect(html).toContain("⏳");
    expect(text).toContain("ได้รับแล้ว รอครูอรรี่ตรวจสอบ");
    expect(text).toContain("อนุมัติภายใน 1 วันทำการ ไม่ต้องกดอะไรเพิ่ม หน้านี้จะอัปเดตเอง");
    expect(count(text, "KA-00000005")).toBe(1);
    expect(text).toContain("ยังไม่ได้ส่งสลิป? กลับไปส่ง");
  });

  it("tells when staff recorded the slip, and flags a payment status from the old flow", () => {
    expect(textOf(wait({ slipReceivedAt: "2026-11-20T03:00:00Z" }))).toContain("ทีมงานบันทึกรับสลิปจาก LINE");
    expect(textOf(wait())).not.toContain("ทีมงานบันทึกรับสลิปจาก LINE");
    expect(textOf(wait({ legacyReportedAt: "2026-11-10T03:00:00Z" }))).toContain("ยังไม่ถือว่าทีมงานรับสลิป");
  });
});

describe("approved and rejected", () => {
  it("approved while watching: 🎉 ยินดีด้วย ใช้งาน {แพ็ก} ได้แล้ว + 'ไปที่คลังสื่อ'", () => {
    const html = h(el(ApprovedPanel, { planName: "Teacher Pro", celebrate: true, periodEnd: null, href: "/app", actionLabel: "ไปที่คลังสื่อ" }));
    expect(textOf(html)).toContain("🎉 ยินดีด้วย ใช้งาน Teacher Pro ได้แล้ว");
    expect(html).toContain('href="/app"');
    expect(textOf(html)).toContain("ไปที่คลังสื่อ");
  });

  it("an active member coming back: plain status, no party, expiry date when known", () => {
    const html = h(el(ApprovedPanel, { planName: "Teacher Pro", celebrate: false, periodEnd: "2027-11-20T00:00:00Z", href: "/app", actionLabel: "ไปที่คลังสื่อ" }));
    expect(textOf(html)).toContain("สิทธิ์ Teacher Pro ใช้งานอยู่");
    expect(textOf(html)).not.toContain("🎉");
    expect(textOf(html)).toContain("สิ้นสุดรอบสมาชิก");
  });

  it("rejected: says so, points to LINE with a button, and offers 'สมัครใหม่'", () => {
    const html = h(el(RejectedPanel, { onStartOver: noop, focusHeading: false }));
    expect(textOf(html)).toContain("ใบสมัครนี้ไม่ผ่าน กรุณาทักครูอรรี่ทาง LINE");
    expect(html).toContain('href="https://lin.ee/wDZy0GhC"');
    expect(textOf(html)).toContain("สมัครใหม่");
  });
});

describe("application history (old applications are folded away, at the bottom)", () => {
  const app = (over: Partial<UpgradeRequest>): UpgradeRequest => ({
    id: "id", referenceCode: "KA-1", planId: "teacher", status: "declined", quotedAmountThb: 599, paymentReportedAt: null, lineSlipReceivedAt: null,
    paymentPaidAt: null, paymentConfirmedAt: null, paymentConfirmedAmountThb: null, paymentReference: null, resolutionReasonCode: null, createdAt: "2026-11-01T00:00:00Z", ...over,
  });

  it("is a collapsed <details> (not open), titled with the count; declined, expired and cancelled ones are inside", () => {
    const html = h(el(ApplicationHistory, { applications: [app({ id: "a", referenceCode: "KA-OLD1" }), app({ id: "b", referenceCode: "KA-OLD2", resolutionReasonCode: "owner_test_cleanup" })] }));
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(textOf(html)).toContain("ประวัติใบสมัคร (2)");
    expect(textOf(html)).toContain("ไม่ผ่านการตรวจสอบ");
    expect(textOf(html)).toContain("ยกเลิกรายการทดสอบ");
  });

  it("is absent when there is nothing old, and never lists the pending application", () => {
    expect(h(el(ApplicationHistory, { applications: [] }))).toBe("");
    expect(h(el(ApplicationHistory, { applications: [app({ status: "pending", referenceCode: "KA-NOW" })] }))).toBe("");
  });
});

/**
 * Every screen the member can be on, as the text a person reads. Each fact is
 * said once per screen: the Founder limit, "we do not keep the slip", the
 * account number, the amount, the reference code and the start-of-rights hint.
 */
describe("each fact appears at most once on any screen", () => {
  const stepper = (current: number) => h(el(MembershipStepper, { current }));
  const history = h(el(ApplicationHistory, { applications: [{
    id: "old", referenceCode: "KA-OLD1", planId: "founder", status: "declined", quotedAmountThb: 299, paymentReportedAt: null, lineSlipReceivedAt: null,
    paymentPaidAt: null, paymentConfirmedAt: null, paymentConfirmedAmountThb: null, paymentReference: null, resolutionReasonCode: null, createdAt: "2026-10-01T00:00:00Z",
  }] }));
  const methods = (q: MethodState<QrPayment>, b: MethodState<BankPayment>) => h(el(PaymentDetailsView, { view: resolvePaymentView(q, b), accountCopied: false, onCopyAccount: noop }));
  const s2 = (q: MethodState<QrPayment>, b: MethodState<BankPayment>) => h(el(TransferStep, { application, referenceCopied: false, legacyReportedAt: null, onCopyReference: noop, onBack: noop, onNext: noop, onAlreadySent: noop, focusHeading: false })) + methods(q, b);
  const slipHtml = (oa: string | undefined) => { const a = lineSlipAction(oa, { planName: "Teacher Pro", referenceCode: "KA-00000005", amountThb: 599 }); return h(el(SlipStep, { href: a.href, copyFirst: a.copyFirst, feedback: "คัดลอกข้อความแล้ว วางในแชตได้เลย", fallbackMessage: null, onOpenLine: noop, onSent: noop, onBack: noop, focusHeading: false })); };

  const screens: Record<string, string> = {
    "step 1, not signed in": stepper(1) + planStep({ cta: { kind: "link", href: "/login", label: "เข้าสู่ระบบ / สมัครฟรี เพื่อไปต่อ" } }),
    "step 1, signed in": stepper(1) + planStep() + history,
    "step 1, Founder full": stepper(1) + planStep({ cards: [card({ id: "founder", unavailableLabel: "เต็มแล้ว" }), card({ id: "teacher", selected: true })] }),
    "step 1, Founder selected": stepper(1) + planStep({ benefits: planBenefitLines("founder"), cards: [card({ id: "founder", selected: true, badge: "เหลือ 5 ที่" }), card({ id: "teacher" })] }),
    "step 2, QR + account": stepper(2) + s2(qr, bank) + history,
    "step 2, account only": stepper(2) + s2(off, bank),
    "step 2, QR only": stepper(2) + s2(qr, off),
    "step 2, neither (LINE)": stepper(2) + s2(off, off),
    "step 3, with LINE OA ID": stepper(3) + slipHtml("@abc1234d"),
    "step 3, without LINE OA ID": stepper(3) + slipHtml(undefined),
    "step 4, waiting": stepper(4) + h(el(WaitingStep, { referenceCode: "KA-00000005", referenceCopied: false, slipReceivedAt: null, legacyReportedAt: null, onCopyReference: noop, onBackToSlip: noop, focusHeading: false })) + history,
    "approved": h(el(ApprovedPanel, { planName: "Teacher Pro", celebrate: true, periodEnd: "2027-11-20T00:00:00Z", href: "/app", actionLabel: "ไปที่คลังสื่อ" })),
    "rejected": h(el(RejectedPanel, { onStartOver: noop, focusHeading: false })) + history,
  };

  for (const [name, html] of Object.entries(screens)) {
    it(`${name}`, () => {
      const text = textOf(html);
      expect(count(text, /จำกัด\s*100/), "จำกัด 100").toBeLessThanOrEqual(1);
      expect(count(text, /ไม่เก็บ(รูป)?สลิป/), "ไม่เก็บสลิป").toBeLessThanOrEqual(1);
      expect(count(text, ACCOUNT), "เลขบัญชี").toBeLessThanOrEqual(1);
      expect(count(text, START_HINT), "สิทธิ์เริ่มใช้ได้หลังครูอรรี่ตรวจยอดเงินแล้ว").toBeLessThanOrEqual(1);
      expect(count(text, "ยังไม่จองสิทธิ์"), "ยังไม่จองสิทธิ์").toBe(0);
      expect(count(text, /Early Access|ฐานข้อมูล|จับคู่บัญชี/), "technical wording").toBe(0);
      expect(count(text, /ยอดที่ต้องโอน|โอนให้ตรงทุกบาท/), "amount reminder").toBeLessThanOrEqual(1);
      expect(count(text, "KA-00000005"), "reference").toBeLessThanOrEqual(1);
    });
  }

  it("the one fixed facts are said somewhere: 'เว็บไม่เก็บรูปสลิป' on step 3 only, the account only on step 2", () => {
    expect(count(textOf(screens["step 3, with LINE OA ID"]), /ไม่เก็บ(รูป)?สลิป/)).toBe(1);
    for (const name of ["step 1, signed in", "step 2, QR + account", "step 4, waiting", "approved"]) {
      expect(count(textOf(screens[name]), /ไม่เก็บ(รูป)?สลิป/), name).toBe(0);
    }
    expect(count(textOf(screens["step 2, QR + account"]), ACCOUNT)).toBe(1);
    for (const name of ["step 1, signed in", "step 3, with LINE OA ID", "step 4, waiting"]) expect(count(textOf(screens[name]), ACCOUNT), name).toBe(0);
  });
});

describe("page sources: removed boxes stay removed, wording is said once", () => {
  const dir = import.meta.dirname;
  const sources = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
  const copyLibs = ["../../lib/membershipPlanCopy.ts", "../../lib/membershipCopy.ts"].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");

  it("the big price box, the facts cards, the yellow notice and the combined transfer/slip box are gone", () => {
    for (const gone of ["kru-membership-hero", "kru-membership-facts", "kru-membership-payment__notice", "kru-membership-capacity", "โอนเงินแล้วส่งสลิปทาง LINE", "PlanBenefits"]) {
      expect(sources, gone).not.toContain(gone);
    }
  });

  it("'เว็บไม่เก็บรูปสลิป' and 'ยังไม่จองสิทธิ์' wording: one place / none", () => {
    expect(count(sources + copyLibs, "ไม่เก็บรูปสลิป")).toBe(1);
    expect(count(sources + copyLibs, "ไม่เก็บสลิปบนเว็บไซต์")).toBe(0);
    expect(count(sources + copyLibs, "ยังไม่จองสิทธิ์")).toBe(0);
    expect(count(sources + copyLibs, START_HINT)).toBe(1);
  });
});
