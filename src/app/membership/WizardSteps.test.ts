import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UpgradeRequest } from "@/lib/data";
import { lineSlipAction, lineSlipMessage } from "@/lib/lineSlipLink";
import { MEMBERSHIP_STEPS } from "@/lib/membershipSteps";
import { MembershipStepper } from "./PaymentFlow";
import { ApplicationHistory, ApprovedPanel, SlipStep, TransferStep, WaitingStep } from "./WizardSteps";

const noop = () => {};
const application = { id: "11111111-2222-4333-8444-555555555555", referenceCode: "KA-00000005", quotedAmountThb: 599, planId: "teacher" };
const message = lineSlipMessage({ planName: "Teacher Pro", referenceCode: "KA-00000005", amountThb: 599 });
const h = renderToStaticMarkup;
const el = React.createElement;

const slip = (oaId: string | undefined, over: Record<string, unknown> = {}) => {
  const action = lineSlipAction(oaId, { planName: "Teacher Pro", referenceCode: "KA-00000005", amountThb: 599 });
  return h(el(SlipStep, {
    message, href: action.href, copyFirst: action.copyFirst, feedback: null, messageCopied: false,
    onOpenLine: noop, onCopyMessage: noop, onSent: noop, onBack: noop, focusHeading: false, ...over,
  }));
};

describe("stepper always shows the current step", () => {
  it("marks exactly one step as current, earlier steps done, later ones to do", () => {
    for (const current of [1, 2, 3, 4]) {
      const html = h(el(MembershipStepper, { current }));
      expect(html.split('aria-current="step"').length - 1).toBe(1);
      expect(html).toContain(`data-state="current" aria-current="step"`);
      const states = [...html.matchAll(/<li data-state="(done|current|todo)"/g)].map((m) => m[1]);
      expect(states).toEqual(MEMBERSHIP_STEPS.map((_, i) => (i + 1 < current ? "done" : i + 1 === current ? "current" : "todo")));
    }
  });
});

describe("step 2: transfer", () => {
  const html = h(el(TransferStep, { application, referenceCopied: false, legacyReportedAt: null, onCopyReference: noop, onBack: noop, onNext: noop, focusHeading: false }));

  it("shows the amount and reference once, the main button, and a back button", () => {
    expect(html).toContain("โอนเงิน");
    expect(html.split("599 บาท").length - 1).toBe(1);
    expect(html.split("KA-00000005").length - 1).toBe(2); // the reference and its copy-button label
    expect(html).toContain("กรุณาโอนยอดนี้ให้ตรงทุกบาท");
    expect(html).toContain("โอนแล้ว ไปขั้นต่อไป");
    expect(html).toContain("ย้อนกลับ");
  });

  it("has no LINE or slip wording yet (that is step 3)", () => {
    expect(html).not.toContain("เปิด LINE ส่งสลิป");
    expect(html).not.toContain("ไม่เก็บสลิป");
  });
});

describe("step 3: send the slip on LINE", () => {
  it("explains in one line and has the main button, the message box, a separate copy button, 'sent' and back", () => {
    const html = slip("@abc1234d");
    expect(html).toContain("กดปุ่มด้านล่าง → แนบรูปสลิปในแชต → กดส่ง");
    expect(html).toContain("เปิด LINE ส่งสลิป");
    expect(html).toContain("ข้อความที่จะส่ง");
    expect(html).toContain(message);
    expect(html).toContain("คัดลอกข้อความ");
    expect(html).toContain("ส่งสลิปแล้ว");
    expect(html).toContain("ย้อนกลับ");
  });

  it("with an OA ID: the button opens the oaMessage link that already carries the message", () => {
    const html = slip("@abc1234d");
    const href = /href="([^"]+)"/.exec(html)?.[1].replace(/&amp;/g, "&") ?? "";
    expect(href.startsWith("https://line.me/R/oaMessage/@abc1234d/?")).toBe(true);
    expect(decodeURIComponent(href.split("/?")[1])).toBe(message);
    expect(html).toContain('data-copy-first="false"');
  });

  it("without an OA ID: the button opens lin.ee and the page copies the message first", () => {
    const html = slip(undefined);
    expect(html).toContain('href="https://lin.ee/wDZy0GhC"');
    expect(html).toContain('data-copy-first="true"');
    expect(html).toContain(message); // still shown, and copyable, in its own box
    expect(html).toContain("คัดลอกข้อความ");
  });

  it("shows the feedback the page gives after the copy, politely and readable by screen readers", () => {
    const html = slip(undefined, { feedback: "คัดลอกข้อความแล้ว วางในแชตแล้วแนบสลิป" });
    expect(html).toMatch(/role="status"[^>]*>คัดลอกข้อความแล้ว วางในแชตแล้วแนบสลิป</);
  });

  it("says 'we do not keep the slip' once, short", () => {
    expect(slip("@abc1234d").split("ไม่เก็บสลิปบนเว็บไซต์").length - 1).toBe(1);
  });
});

describe("step 4: waiting", () => {
  const html = h(el(WaitingStep, { referenceCode: "KA-00000005", referenceCopied: false, slipReceivedAt: null, legacyReportedAt: null, onCopyReference: noop, onBackToSlip: noop, focusHeading: false }));

  it("says the application was received, 1 business day, shows the reference and the way back to step 3", () => {
    expect(html).toContain("ได้รับใบสมัครแล้ว ครูอรรี่จะตรวจสอบและอนุมัติภายใน 1 วันทำการ");
    expect(html).toContain("KA-00000005");
    expect(html).toContain("ยังไม่ได้ส่งสลิป? กลับไปขั้นที่ 3");
    expect(html).toContain("ตรวจสถานะให้เองทุก 1 นาที");
  });

  it("tells when staff recorded the slip", () => {
    const received = h(el(WaitingStep, { referenceCode: "KA-00000005", referenceCopied: false, slipReceivedAt: "2026-11-20T03:00:00Z", legacyReportedAt: null, onCopyReference: noop, onBackToSlip: noop, focusHeading: false }));
    expect(received).toContain("ทีมงานบันทึกรับสลิปจาก LINE");
    expect(html).not.toContain("ทีมงานบันทึกรับสลิปจาก LINE");
  });
});

describe("applications from the old flow", () => {
  it("say plainly that a web 'payment reported' time is not a slip received by staff", () => {
    const step2 = h(el(TransferStep, { application, referenceCopied: false, legacyReportedAt: "2026-11-10T03:00:00Z", onCopyReference: noop, onBack: noop, onNext: noop, focusHeading: false }));
    const step4 = h(el(WaitingStep, { referenceCode: "KA-00000005", referenceCopied: false, slipReceivedAt: null, legacyReportedAt: "2026-11-10T03:00:00Z", onCopyReference: noop, onBackToSlip: noop, focusHeading: false }));
    for (const html of [step2, step4]) expect(html).toContain("ยังไม่ถือว่าทีมงานรับสลิป");
  });
});

describe("approved", () => {
  it("celebrates when approved during this visit and links to the library", () => {
    const html = h(el(ApprovedPanel, { planName: "Teacher Pro", celebrate: true, periodEnd: null, href: "/app", actionLabel: "ไปที่คลังสื่อ" }));
    expect(html).toContain("🎉 ใช้งาน Teacher Pro ได้แล้ว");
    expect(html).toContain('href="/app"');
    expect(html).toContain("ไปที่คลังสื่อ");
  });

  it("is plainer when the member simply comes back with an active plan", () => {
    const html = h(el(ApprovedPanel, { planName: "Teacher Pro", celebrate: false, periodEnd: null, href: "/app", actionLabel: "ไปที่คลังสื่อ" }));
    expect(html).toContain("สิทธิ์ Teacher Pro ใช้งานอยู่");
    expect(html).not.toContain("🎉");
  });
});

describe("application history (old applications are folded away)", () => {
  const app = (over: Partial<UpgradeRequest>): UpgradeRequest => ({
    id: "id", referenceCode: "KA-1", planId: "teacher", status: "declined", quotedAmountThb: 599, paymentReportedAt: null, lineSlipReceivedAt: null,
    paymentPaidAt: null, paymentConfirmedAt: null, paymentConfirmedAmountThb: null, paymentReference: null, resolutionReasonCode: null, createdAt: "2026-11-01T00:00:00Z", ...over,
  });

  it("is a collapsed <details> (not open), titled with the count", () => {
    const html = h(el(ApplicationHistory, { applications: [app({ id: "a", referenceCode: "KA-OLD1" }), app({ id: "b", referenceCode: "KA-OLD2" })] }));
    expect(html).toContain("<details");
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain("ประวัติใบสมัคร (2)");
    expect(html).toContain("KA-OLD1");
    expect(html).toContain("ไม่ผ่านการตรวจสอบ");
  });

  it("is absent when there is nothing old, and never lists the pending application", () => {
    expect(h(el(ApplicationHistory, { applications: [] }))).toBe("");
    expect(h(el(ApplicationHistory, { applications: [app({ status: "pending", referenceCode: "KA-NOW" })] }))).toBe("");
  });
});

describe("no duplicated or leftover wording in the membership page sources", () => {
  const dir = import.meta.dirname;
  const sources = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts")).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");

  it("'ไม่เก็บสลิปบนเว็บไซต์' appears in one place only", () => {
    expect(sources.split("ไม่เก็บสลิปบนเว็บไซต์").length - 1).toBe(1);
  });

  it("the old yellow notice, the facts cards and the combined 'transfer then send the slip' box are gone", () => {
    expect(sources).not.toContain("kru-membership-payment__notice");
    expect(sources).not.toContain("kru-membership-facts");
    expect(sources).not.toContain("โอนเงินแล้วส่งสลิปทาง LINE");
    expect(sources).not.toContain("ส่งสลิปทาง LINE</a>");
    expect(sources).not.toContain("ExternalLink");
  });
});
