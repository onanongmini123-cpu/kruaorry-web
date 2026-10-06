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
    expect(membership).toContain("การสร้างเลขอ้างอิงยังไม่นับสิทธิ์และยังไม่จองสิทธิ์");
    // Public copy never shows how many Founder places are taken or left.
    expect(membership).toContain("founderPublicNotice(capacity)");
    expect(membership).not.toContain("capacity.used");
    expect(membership).not.toContain("capacity.remaining");
  });

  it("waits for a created pending application before exposing LINE and preserves a stable reference", () => {
    expect(membership).toContain("pendingMembershipApplication(applications)");
    expect(membership).toContain("const hasOpenApplication = pendingApplication !== null");
    expect(membership).toContain("await createMembershipApplication");
    expect(membership).toContain("latestApplication?.status === \"pending\"");
    expect(membership).toContain("referenceCode");
    expect(membership).toContain("LINE_OA_URL");
    expect(membership).toContain("navigator.clipboard.writeText");
    expect(membership).toContain("handleLineCtaClick(latestApplication.referenceCode)");
    expect(membership).toContain("วางใน LINE และส่งพร้อมสลิปได้เลย");
    expect(membership).toContain("เปิด LINE ต่อได้เลย");
    expect(membership).toContain("fetchUpgradeRequestsResult(supabase, userId)");
    expect(membership).toContain('applicationResult.applications.some((application) => application.status === "pending")');
  });

  it("keeps member payment status read-only and safely converts a full pending Founder application", () => {
    expect(membership).toContain("paymentReportedAt");
    expect(membership).toContain("lineSlipReceivedAt");
    expect(membership).toContain("รอส่งเลขอ้างอิงและสลิปทาง LINE");
    expect(membership).toContain("รับสลิปทาง LINE แล้ว · รอตรวจยอด");
    expect(membership).toContain("มีสถานะแจ้งชำระเดิม · รอยืนยันยอด");
    expect(membership).toContain("ไม่ต้องอัปโหลดสลิปหรือกดแจ้งซ้ำบนเว็บ");
    expect(membership).not.toContain("reportMembershipPayment");
    expect(membership).not.toContain("ฉันส่งเลขอ้างอิงและหลักฐานแล้ว");
    expect(membership).toContain("pendingFounderUnavailable");
    expect(membership).toContain("convertFounderApplicationToTeacher");
    expect(membership).toContain("ยืนยันเปลี่ยนเป็น Teacher Pro 599 บาท/ปี");
  });

  it("lets membership card content shrink without overflowing narrow screens", () => {
    expect(membership).toContain(
      ".kru-membership-application, .kru-membership-payment { min-width: 0; padding: clamp(20px, 4vw, 32px); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--sp-5); }",
    );
  });

  it("fails closed globally for schema drift and only applies Founder facts to Founder flows", () => {
    expect(membership).toContain('if (applicationPlanId === "founder" && !capacity)');
    expect(membership).toContain('const founderChecksUnavailable = schemaReadiness !== "ready"');
    expect(membership).toContain('const selectedFounderChecksUnavailable = founderChecksBlockPlan(selectedPlanId, founderChecksUnavailable)');
    expect(membership).toContain('const shouldLoadFounderChecks = founderChecksRequiredForPlanSelection(selectedPlanPreference)');
    expect(membership).toContain('shouldLoadFounderChecks ? fetchFounderCapacity(supabase) : Promise.resolve(null)');
    expect(membership).toContain('user && shouldLoadFounderChecks');
    expect(membership).toContain('const founderChecksDeferred = plan.id === "founder" && !shouldLoadFounderChecks');
    expect(membership).toContain('founderChecksBlockPlanSelection(planId, founderChecksUnavailable, founderChecksDeferred)');
    expect(membership).toContain('const applicationFounderChecksUnavailable = founderChecksBlockPlan(applicationPlanId, founderChecksUnavailable)');
    expect(membership).toContain('const pendingFounderChecksUnavailable = founderChecksBlockPlan(latestApplication?.planId, founderChecksUnavailable)');
    expect(membership).toContain('const teacherRequestedForPendingFounder = selectedPlanId === "teacher"');
    expect(membership).toContain('&& schemaReadiness === "ready"');
    expect(membership).toContain('if (schemaReadiness !== "ready")');
    expect(membership).toContain('const pendingPaymentBlocked = memberStatusError');
    expect(membership).toContain('|| applicationsError');
    expect(membership).toContain('|| pendingFounderChecksUnavailable');
    expect(membership).toContain('!founderChecksBlockPlan(membershipStatusPlanId, founderChecksUnavailable)');
    expect(membership).toContain('applicationPlanId === "founder" ? (');
    expect(membership).toContain('<strong>Teacher Pro</strong>');
    expect(membership).toContain('{applicationPlanId === "founder" && (');

    expect(membership).not.toContain("const handleReportPayment");

    const conversionHandler = membership.slice(
      membership.indexOf("const handleConvertToTeacher"),
      membership.indexOf("const handleCopyReference"),
    );
    expect(conversionHandler).toContain('if (schemaReadiness !== "ready")');
    expect(conversionHandler).not.toContain("if (founderChecksUnavailable)");
    expect(conversionHandler).not.toContain("fetchFounderCapacity");
  });

  it("never exposes stale pending-payment actions when the application refresh fails", () => {
    expect(membership).toContain('const pendingPaymentBlocked = memberStatusError');
    expect(membership).toContain('setMemberStatusError(entitlementResult.error || subscriptionResult.error)');
    expect(membership).toContain('if (applicationsError) {');
    expect(membership).toContain("ยังตรวจสอบใบสมัครล่าสุดไม่ได้");
    expect(membership).toContain("เพื่อไม่ให้ใช้รายการเก่าที่อาจมีสถานะเปลี่ยนไปแล้ว");
    expect(membership).toContain("membershipDisplayError(result.error");
  });

  it("gates every new membership path behind the old-schema readiness marker", () => {
    expect(membership).toContain("fetchMembershipSchemaReadiness");
    expect(membership).toContain('schemaReadiness === "unavailable"');
    expect(membership).toContain("MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE");
    expect(membership).toContain("ลองตรวจสอบอีกครั้ง");
    expect(membership).toContain('if (schemaReadiness !== "ready")');
    expect(membership).toContain('schemaReadiness !== "ready" ? (');
    expect(membership).toContain("ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว");
  });

  it("shows maintenance instead of stale Founder capacity on public and member package cards", () => {
    for (const page of [landing, memberApp]) {
      expect(page).toContain("fetchMembershipSchemaReadiness");
      expect(page).toContain('membershipSchemaReadiness === "unavailable"');
      expect(page).toContain("ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว");
    }
  });

  it("labels owner test cleanup without presenting it as a rejected customer application", () => {
    expect(membership).toContain('"owner_test_cleanup"');
    expect(membership).toContain('"ยกเลิกรายการทดสอบ"');
    expect(membership).toContain("ไม่มีการให้สิทธิ์หรือใช้โควตา Founder");
    expect(membership).toContain("isTestCleanupReason(latestApplication.resolutionReasonCode)");
    expect(membership).toContain("รายการทดสอบถูกยกเลิกแล้ว คุณสามารถส่งใบสมัครจริงได้");
  });

  it("loads the live plan catalog and renders its benefits", () => {
    expect(membership).toContain("fetchPlans");
    expect(membership).toContain("<PlanBenefits benefits={selectedPlan.benefits ?? []} />");
  });

  it("keeps membership public, sends auth back safely, and redirects the old payment route", () => {
    expect(membership).toContain("membershipReturnTarget");
    expect(membership).toContain("new URLSearchParams({ returnTo })");
    expect(membership).toContain("const signupHref = FREE_SIGNUP_HREF;");
    expect(membership.match(/href=\{signupHref\}/g)).toHaveLength(2);
    expect(payment).toContain('redirect("/membership#how-to-pay")');
  });

  it("separates free signup from intentional paid-upgrade CTAs", () => {
    expect(landing).toContain('href={`/membership?plan=${plan.id === "founder" && founderCapacity?.isFull ? "teacher" : plan.id}`}');
    expect(landing).toContain("initialPublicAuthState(isSupabaseConfigured)");
    expect(landing).toContain("observePublicAuthState(createClient().auth, setPublicAuthState)");
    expect(landing.match(/freeAccountAction\.href/g)).toHaveLength(2);
    expect(landing).not.toContain('href="/membership"');
    expect(memberApp).toContain('href={`/membership?plan=${plan.id === "founder" && founderCapacity?.isFull ? "teacher" : plan.id}`}');
    expect(landing).not.toContain("LINE_OA_URL");
    expect(memberApp).not.toContain("submitUpgradeRequest");
    expect(memberApp).not.toContain("onClick={() => void handleRequestUpgrade");
    expect(memberApp).toContain("membershipUpgradeHref(r, `/app?resource=${r.id}`)");
  });

  it("preserves founder and teacher selection in membership URLs", () => {
    expect(membership).toContain('useSearchParams()');
    expect(membership).toContain("requestedMembershipPlan(requestedPlan)");
    expect(membership).toContain('nextUrl.searchParams.set("plan", planId)');
    expect(membership).toContain('searchParams.getAll("returnTo")');
  });

  it("refreshes live membership access and returns an approved member to the validated resource", () => {
    expect(membership).toContain("fetchMemberSubscription");
    expect(membership.match(/fetchEntitlementsResult\(supabase\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(membership).toContain("membershipAutoReturnDestination");
    expect(membership).toContain("router.replace(destination)");
    expect(membership).toContain("กลับไปเปิดสื่อ");
    expect(membership).toContain("ไปพื้นที่สมาชิก");
    expect(memberApp).toContain("fetchEntitlementsResult(supabase)");
    expect(memberApp).toContain("completeMemberEntitlementsRefresh(current, entitlementResult)");
    expect(membership).toContain("fetchMembershipReturnResource");
    expect(membership).toContain("returnResourcePlanIds");
    expect(membership).toContain("membershipPlanUnlocksResource");
    expect(membership).toContain("membershipReturnResourceState(returnResourceId, returnResourceRead)");
    expect(membership).toContain("pendingPlanMismatch");
    expect(membership).toContain("pendingPaymentBlocked");
    expect(membership).toContain("ปิดปุ่ม LINE และการแจ้งหลักฐาน");
  });

  it("does not sell an unrelated plan for Plus-only or Lifetime-only resources", () => {
    expect(membership).toContain("noSelectablePlanForResource");
    expect(membership).toContain("membershipResourceHasSelectablePlan(returnResourcePlanIds)");
    expect(membership).toContain("&& !noSelectablePlanForResource");
    expect(membership).toContain("ไม่มีแพ็กที่เปิดขายสำหรับสื่อนี้");
    expect(membership).toContain("ระบบจะไม่รับใบสมัครหรือการแจ้งชำระสำหรับแพ็กอื่นที่ไม่สามารถเปิดสื่อนี้ได้");
    const legacyGuestBranch = membership.indexOf("!userId && noSelectablePlanForResource");
    const genericGuestBranch = membership.indexOf(") : !userId ? (");
    expect(legacyGuestBranch).toBeGreaterThan(-1);
    expect(genericGuestBranch).toBeGreaterThan(legacyGuestBranch);
    expect(membership).toContain("เข้าสู่ระบบเพื่อตรวจสอบสิทธิ์เดิม");
    expect(membership).toContain("const legacyReturnQuery = new URLSearchParams({ returnTo })");
    expect(membership).toContain("const signInHref = `/login?next=");
    expect(membership).toContain("เข้าสู่ระบบตรวจสอบสิทธิ์");
    expect(membership).toContain('href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"');
    expect(membership).toContain("ใช้สิทธิ์สมาชิกเดิม");
    expect(membership).toContain("ตรวจสอบสิทธิ์เดิม");
    expect(membership).toContain("ตรวจสอบสิทธิ์สมาชิกเดิม");
    expect(membership).toContain("{!noSelectablePlanForResource && (");
    expect(membership).toContain("ไม่ได้เปิดรับสมัครด้วยแพ็ก Founder หรือ Teacher Pro");
    expect(membership).toContain("const showLegacySupportOnly = noSelectablePlanForResource");
    expect(membership).toContain("&& pendingApplication === null");
    expect(membership).toContain("{showLegacySupportOnly ? (");
    expect(membership).toContain("membershipApplicationPlanLabel(application.planId)");

    expect(membership.slice(legacyGuestBranch, genericGuestBranch)).not.toContain("LINE_OA_URL");

    const unlockedAction = membership.indexOf(") : hasUnlockedMembership ? (");
    const pendingAction = membership.indexOf(") : latestApplication && hasOpenApplication ? (", unlockedAction);
    const noSelectableAction = membership.indexOf(") : noSelectablePlanForResource ? (", pendingAction);
    const genericActiveAction = membership.indexOf(") : hasCurrentMembership && !requestedPlanMismatch", noSelectableAction);
    expect(unlockedAction).toBeGreaterThan(-1);
    expect(pendingAction).toBeGreaterThan(unlockedAction);
    expect(noSelectableAction).toBeGreaterThan(pendingAction);
    expect(genericActiveAction).toBeGreaterThan(noSelectableAction);
    expect(membership.slice(noSelectableAction, genericActiveAction)).not.toContain("LINE_OA_URL");

    const paymentStart = membership.indexOf('id="membership-payment-title"');
    const paymentUnlocked = membership.indexOf(") : hasUnlockedMembership ? (", paymentStart);
    const paymentBlocked = membership.indexOf(") : pendingPaymentBlocked ? (", paymentUnlocked);
    const paymentPending = membership.indexOf(') : latestApplication?.status === "pending" ? (', paymentBlocked);
    const paymentGenericActive = membership.indexOf(") : hasCurrentMembership && !requestedPlanMismatch", paymentPending);
    expect(paymentStart).toBeGreaterThan(-1);
    expect(paymentUnlocked).toBeGreaterThan(paymentStart);
    expect(paymentBlocked).toBeGreaterThan(paymentUnlocked);
    expect(paymentPending).toBeGreaterThan(paymentBlocked);
    expect(paymentGenericActive).toBeGreaterThan(paymentPending);
    const legacyPaymentStart = membership.indexOf("{showLegacySupportOnly ? (");
    expect(membership.slice(legacyPaymentStart, paymentStart)).not.toContain("LINE_OA_URL");
  });

  it("fails closed on repeat Founder eligibility and warns before irreversible plan changes", () => {
    expect(membership).toContain("fetchMyFounderHistory");
    expect(membership).toContain("founderOfferUnavailable");
    expect(membership).toContain("membershipPlanChangeConfirmation");
    expect(membership).toContain("founderApplicationConversionConfirmation");
    expect(membership).toContain("สิทธิ์ Founder 299 บาทใช้ได้เฉพาะปีแรกและครั้งแรกเท่านั้น");
    expect(membership).toContain("สื่อที่ต้องการรองรับเฉพาะ Founder");
  });

  it("keeps approved applications as history while only pending work blocks another submission", () => {
    expect(membership).toContain("pendingMembershipApplication(applications)");
    expect(membership).toContain("รายการนี้เป็นประวัติที่อนุมัติแล้ว");
    expect(membership).not.toContain('latestApplication?.status === "pending" || latestApplication?.status === "approved"');
    expect(membership).toContain("สิทธิ์สมาชิกที่ใช้งานอยู่แล้ว");
  });

  it("uses explicit payment confirmation and records the audit fields in admin", () => {
    for (const field of ["reference_code", "quoted_amount_thb", "payment_reported_at", "line_slip_received_at", "line_slip_received_by", "payment_paid_at", "payment_confirmed_at", "payment_confirmed_by", "payment_confirmed_amount_thb", "payment_reference"]) {
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
