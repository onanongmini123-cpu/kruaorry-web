import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const membership = readFileSync(new URL("../../app/membership/page.tsx", import.meta.url), "utf8");
const payment = readFileSync(new URL("../../app/payment/page.tsx", import.meta.url), "utf8");
const landing = readFileSync(new URL("../../app/page.tsx", import.meta.url), "utf8");
const memberApp = readFileSync(new URL("../../app/app/page.tsx", import.meta.url), "utf8");
const admin = readFileSync(new URL("../../app/admin/page.tsx", import.meta.url), "utf8");
const terms = readFileSync(new URL("../../app/terms/page.tsx", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../../app/privacy/page.tsx", import.meta.url), "utf8");

describe("canonical manual membership flow", () => {
  it("states the exact price, capacity and allocation rules", () => {
    expect(membership).toContain("299 บาทเฉพาะปีแรก");
    expect(membership).toContain("สำหรับ 100 คนแรกที่ครูอรรี่ยืนยันการชำระเงินจริง");
    expect(membership).toContain("ต่ออายุปีถัดไป 599 บาท/ปี");
    expect(membership).toContain("กรอกใบสมัครยังไม่นับสิทธิ์และยังไม่จองสิทธิ์");
    expect(membership).toContain("ยืนยันชำระแล้ว {capacity.used}/{capacity.capacity}");
  });

  it("waits for a created pending application before exposing LINE and preserves a stable reference", () => {
    expect(membership).toContain("await createMembershipApplication");
    expect(membership).toContain("latestApplication?.status === \"pending\"");
    expect(membership).toContain("referenceCode");
    expect(membership).toContain("LINE_OA_URL");
    expect(membership).toContain("navigator.clipboard.writeText");
  });

  it("keeps membership public, sends auth back safely, and redirects the old payment route", () => {
    expect(membership).toContain("/login?mode=signup&next=%2Fmembership");
    expect(payment).toContain('redirect("/membership#how-to-pay")');
  });

  it("routes all sales CTAs through membership without an insert-and-external-navigation race", () => {
    expect(landing).toContain('href="/membership"');
    expect(memberApp).toContain('href="/membership"');
    expect(landing).not.toContain("LINE_OA_URL");
    expect(memberApp).not.toContain("submitUpgradeRequest");
    expect(memberApp).not.toContain("onClick={() => void handleRequestUpgrade");
  });

  it("uses explicit payment confirmation and records the audit fields in admin", () => {
    for (const field of ["reference_code", "quoted_amount_thb", "payment_paid_at", "payment_confirmed_at", "payment_confirmed_by", "payment_confirmed_amount_thb", "payment_reference"]) {
      expect(admin).toContain(field);
    }
    expect(admin).toContain("confirmMembershipPayment");
    expect(admin).toContain("confirmSubscriptionRenewal");
    expect(admin).toContain("ยืนยันรับเงินจริง");
    expect(admin).not.toContain('rpc("approve_upgrade_request"');
    expect(admin).not.toContain('rpc("renew_subscription"');
  });

  it("documents the first-year offer and accurately says slips are not stored on the website", () => {
    expect(terms).toContain("ราคา 299 บาทใช้สำหรับปีแรก");
    expect(terms).toContain("การต่ออายุปีถัดไปมีราคา 599 บาท/ปี");
    expect(privacy).toContain("ไม่เก็บข้อมูลบัตรเครดิต เลขบัญชีธนาคาร หรือไฟล์สลิปบนเว็บไซต์");
    expect(privacy).toContain("เลขอ้างอิงการชำระ");
  });
});
