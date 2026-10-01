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
    expect(membership).toContain('applications.find((application) => application.status === "pending")');
    expect(membership).toContain("await createMembershipApplication");
    expect(membership).toContain("latestApplication?.status === \"pending\"");
    expect(membership).toContain("referenceCode");
    expect(membership).toContain("LINE_OA_URL");
    expect(membership).toContain("navigator.clipboard.writeText");
  });

  it("separates payment reporting from review and safely converts a full pending Founder application", () => {
    expect(membership).toContain("paymentReportedAt");
    expect(membership).toContain("รอแจ้งชำระ");
    expect(membership).toContain("แจ้งหลักฐานแล้ว · รอตรวจสอบ");
    expect(membership).toContain("reportMembershipPayment");
    expect(membership).toContain("ฉันส่งเลขอ้างอิงและหลักฐานแล้ว");
    expect(membership).toContain("pendingFounderFull");
    expect(membership).toContain("convertFounderApplicationToTeacher");
    expect(membership).toContain("ยืนยันเปลี่ยนเป็น Teacher 599 บาท/ปี");
    expect(membership).toContain('const nextCapacity = await fetchFounderCapacity(supabase)');
    expect(membership).toContain('latestApplication.planId === "founder" && nextCapacity?.isFull');
  });

  it("fails closed for an unknown Founder capacity without blocking Teacher applications", () => {
    expect(membership).toContain('if (applicationPlanId === "founder" && !capacity)');
    expect(membership).toContain('applicationPlanId === "founder" && !capacity ? (');
    expect(membership).not.toContain('if (!userId || submitting || !capacity)');
  });

  it("loads the live plan catalog and renders its benefits", () => {
    expect(membership).toContain("fetchPlans");
    expect(membership).toContain("<PlanBenefits benefits={selectedPlan.benefits ?? []} />");
  });

  it("keeps membership public, sends auth back safely, and redirects the old payment route", () => {
    expect(membership).toContain('const signupHref = `/login?mode=signup&next=${encodeURIComponent(`/membership?plan=${applicationPlanId}`)}`');
    expect(membership.match(/href=\{signupHref\}/g)).toHaveLength(2);
    expect(payment).toContain('redirect("/membership#how-to-pay")');
  });

  it("routes all sales CTAs through membership without an insert-and-external-navigation race", () => {
    expect(landing).toContain('href={`/membership?plan=${plan.id === "founder" && founderCapacity?.isFull ? "teacher" : plan.id}`}');
    expect(landing.match(/href="\/membership"/g)).toHaveLength(3);
    expect(landing).not.toContain('/login?mode=signup');
    expect(memberApp).toContain('href={`/membership?plan=${plan.id === "founder" && founderCapacity?.isFull ? "teacher" : plan.id}`}');
    expect(landing).not.toContain("LINE_OA_URL");
    expect(memberApp).not.toContain("submitUpgradeRequest");
    expect(memberApp).not.toContain("onClick={() => void handleRequestUpgrade");
  });

  it("preserves founder and teacher selection in membership URLs", () => {
    expect(membership).toContain('useSearchParams()');
    expect(membership).toContain('requestedPlan === "teacher" || requestedPlan === "founder"');
    expect(membership).toContain('nextUrl.searchParams.set("plan", planId)');
  });

  it("uses explicit payment confirmation and records the audit fields in admin", () => {
    for (const field of ["reference_code", "quoted_amount_thb", "payment_reported_at", "payment_paid_at", "payment_confirmed_at", "payment_confirmed_by", "payment_confirmed_amount_thb", "payment_reference"]) {
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
