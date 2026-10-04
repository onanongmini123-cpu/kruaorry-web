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
  lineSlipReceivedAt: "2098-10-02T00:05:00.000Z",
  paymentPaidAt: null,
  paymentConfirmedAt: null,
  paymentConfirmedAmountThb: null,
  paymentReference: null,
  resolutionReasonCode: null,
  createdAt: "2098-10-02T00:00:00.000Z",
};

const now = Date.parse("2099-09-25T00:00:00.000Z");

describe("MemberAccountStatus", () => {
  it("shows plan, request, expiry, remaining days and the renewal action", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription,
      subscriptionError: false,
      applications: [pendingApplication],
      applicationsError: false,
      now,
    }));

    expect(markup).toContain("แพ็กปัจจุบัน");
    expect(markup).toContain("Teacher Pro");
    expect(markup).not.toContain(">Teacher<");
    expect(markup).toContain("วันสิ้นสุดสิทธิ์");
    expect(markup).toContain("จำนวนวันที่เหลือ");
    expect(markup).toContain("รับสลิปทาง LINE แล้ว · รอตรวจยอด");
    expect(markup).toContain("KA-00000001");
    expect(markup).toContain("ขอรหัสอ้างอิงต่ออายุทาง LINE");
    expect(markup).toContain("ขอรหัสอ้างอิงต่ออายุจากทีมงานก่อน");
    expect(markup).toContain('target="_blank"');
  });

  it("does not present a legacy member timestamp as an admin-recorded LINE receipt", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "free",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription: null,
      subscriptionError: false,
      applications: [{ ...pendingApplication, lineSlipReceivedAt: null }],
      applicationsError: false,
    }));

    expect(markup).toContain("มีสถานะแจ้งชำระเดิม · รอยืนยันยอด");
    expect(markup).not.toContain("รับสลิปทาง LINE แล้ว");
  });

  it("only offers active renewal inside the seven-day window", () => {
    const atEightDays = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription: { ...subscription, currentPeriodEnd: "2099-10-03T00:00:00.000Z" },
      subscriptionError: false,
      applications: [],
      applicationsError: false,
      now,
    }));
    const atSevenDays = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription: { ...subscription, currentPeriodEnd: "2099-10-02T00:00:00.000Z" },
      subscriptionError: false,
      applications: [],
      applicationsError: false,
      now,
    }));

    expect(atEightDays).not.toContain("ขอรหัสอ้างอิงต่ออายุทาง LINE");
    expect(atSevenDays).toContain("ขอรหัสอ้างอิงต่ออายุทาง LINE");
  });

  it("clearly distinguishes past-due and expired memberships", () => {
    const pastDue = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription: { ...subscription, status: "past_due" },
      subscriptionError: false,
      applications: [],
      applicationsError: false,
      now,
    }));
    const expired = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription: { ...subscription, status: "expired", currentPeriodEnd: "2099-09-24T00:00:00.000Z" },
      subscriptionError: false,
      applications: [],
      applicationsError: false,
      now,
    }));

    expect(pastDue).toContain("รอต่ออายุ");
    expect(pastDue).toContain("ขอรหัสอ้างอิงต่ออายุทาง LINE");
    expect(expired).toContain("หมดอายุ");
    expect(expired).toContain("ขอรหัสอ้างอิงต่ออายุทาง LINE");
  });

  it("offers the membership page to Free accounts", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "free",
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
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
      entitlementsStatus: "loaded",
      onRetryEntitlements: () => {},
      plans: [{ id: "free", name: "Free" }],
      subscription: null,
      subscriptionError: false,
      applications: [],
      applicationsError: true,
    }));

    expect(markup).toContain("ตรวจสอบไม่ได้ในขณะนี้");
    expect(markup).not.toContain("ยังไม่มีคำขอ");
  });

  it("shows the known paid subscription and a Thai retry action when entitlements fail", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "teacher",
      entitlementsStatus: "error",
      onRetryEntitlements: () => {},
      plans: [{ id: "teacher", name: "Teacher" }],
      subscription,
      subscriptionError: false,
      applications: [],
      applicationsError: false,
      now,
    }));

    expect(markup).toContain("Teacher Pro");
    expect(markup).toContain("แสดงแพ็กจากรอบสมาชิกที่ยืนยันล่าสุด");
    expect(markup).toContain("ลองตรวจสอบสิทธิ์อีกครั้ง");
    expect(markup).not.toContain("บัญชีฟรี");
    expect(markup).not.toContain("ดูแพ็กสมาชิก");
  });

  it("never labels an unknown entitlement read as Free", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: null,
      entitlementsStatus: "error",
      onRetryEntitlements: () => {},
      plans: [{ id: "free", name: "Free" }],
      subscription: null,
      subscriptionError: false,
      applications: [],
      applicationsError: false,
    }));

    expect(markup).toContain("ยังตรวจสอบไม่ได้");
    expect(markup).toContain("ลองตรวจสอบสิทธิ์อีกครั้ง");
    expect(markup).not.toContain("บัญชีฟรี");
    expect(markup).not.toContain(">Free<");
    expect(markup).not.toContain("ดูแพ็กสมาชิก");
  });

  it("does not turn a stale known-Free snapshot into an upsell after a refresh error", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "free",
      entitlementsStatus: "error",
      onRetryEntitlements: () => {},
      plans: [{ id: "free", name: "Free" }],
      subscription: null,
      subscriptionError: false,
      applications: [],
      applicationsError: false,
    }));

    expect(markup).toContain("ยังตรวจสอบไม่ได้");
    expect(markup).toContain("ลองตรวจสอบสิทธิ์อีกครั้ง");
    expect(markup).not.toContain("บัญชีฟรี");
    expect(markup).not.toContain(">Free<");
    expect(markup).not.toContain("ดูแพ็กสมาชิก");
  });

  it("keeps a retrying known-Free snapshot in the loading state", () => {
    const markup = renderToStaticMarkup(React.createElement(MemberAccountStatus, {
      currentPlanId: "free",
      entitlementsStatus: "loading",
      onRetryEntitlements: () => {},
      plans: [{ id: "free", name: "Free" }],
      subscription: null,
      subscriptionError: false,
      applications: [],
      applicationsError: false,
    }));

    expect(markup).toContain("กำลังตรวจสอบสิทธิ์");
    expect(markup).not.toContain("บัญชีฟรี");
    expect(markup).not.toContain(">Free<");
    expect(markup).not.toContain("ดูแพ็กสมาชิก");
  });
});
