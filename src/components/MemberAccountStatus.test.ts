import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemberAccountStatus } from "./MemberAccountStatus";
import type { UpgradeRequest } from "@/lib/data";
import type { MemberSubscription } from "@/lib/memberAccount";

const subscription: MemberSubscription = {
  id: "subscription-1",
  planId: "teacher",
  planName: "Teacher",
  status: "active",
  source: "upgrade_request",
  billingInterval: "year",
  currentPeriodEnd: "2099-10-02T00:00:00.000Z",
  createdAt: "2098-10-02T00:00:00.000Z",
};

const pendingApplication: UpgradeRequest = {
  id: "application-1",
  referenceCode: "KA-00000001",
  planId: "teacher",
  status: "pending",
  quotedAmountThb: 599,
  paymentReportedAt: "2098-10-02T00:00:00.000Z",
  paymentPaidAt: null,
  paymentConfirmedAt: null,
  paymentConfirmedAmountThb: null,
  paymentReference: null,
  resolutionReasonCode: null,
  createdAt: "2098-10-02T00:00:00.000Z",
};

describe("MemberAccountStatus", () => {
  it("shows plan, request, expiry, remaining days and the renewal action", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription,
      subscriptionError: false,
      applications: [pendingApplication],
      applicationsError: false,
    }));

    expect(markup).toContain("แพ็กปัจจุบัน");
    expect(markup).toContain("Teacher");
    expect(markup).toContain("วันสิ้นสุดสิทธิ์");
    expect(markup).toContain("จำนวนวันที่เหลือ");
    expect(markup).toContain("แจ้งชำระแล้ว · รอตรวจสอบ");
    expect(markup).toContain("KA-00000001");
    expect(markup).toContain("ขอรหัสอ้างอิงต่ออายุทาง LINE");
    expect(markup).toContain("ขอรหัสอ้างอิงต่ออายุจากทีมงานก่อน");
    expect(markup).toContain('target="_blank"');
  });

  it("offers the membership page to Free accounts", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "free",
      plans: [{ id: "free", name: "Free" }],
      subscription: null,
      subscriptionError: false,
      applications: [],
      applicationsError: false,
    }));

    expect(markup).toContain("บัญชีฟรี");
    expect(markup).toContain('href="/membership"');
    expect(markup).toContain("ดูแพ็กสมาชิก");
  });

  it("fails closed when the latest application cannot be read", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "free",
      plans: [{ id: "free", name: "Free" }],
      subscription: null,
      subscriptionError: false,
      applications: [],
      applicationsError: true,
    }));

    expect(markup).toContain("ตรวจสอบไม่ได้ในขณะนี้");
    expect(markup).not.toContain("ยังไม่มีคำขอ");
  });
});
