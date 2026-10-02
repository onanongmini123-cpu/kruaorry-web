"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Clipboard, ExternalLink, Home, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Badge, Button } from "@/components/ui";
import { PlanBenefits } from "@/app/landing/PlanBenefits";
import { LINE_OA_URL } from "@/lib/config";
import {
  convertFounderApplicationToTeacher,
  createMembershipApplication,
  fetchFounderCapacity,
  fetchPlans,
  fetchUpgradeRequests,
  reportMembershipPayment,
  type Plan,
  type UpgradeRequest,
} from "@/lib/data";
import type { FounderCapacity } from "@/lib/founderCapacity";
import {
  fetchMembershipSchemaReadiness,
  MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE,
  type MembershipSchemaReadiness,
} from "@/lib/membershipSchemaReadiness";
import { createClient } from "@/lib/supabase/client";

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

type MembershipPlanId = "founder" | "teacher";

function isTestCleanupReason(reasonCode: string | null): boolean {
  return ["owner_test_cleanup", "test_application_cleanup"].includes(reasonCode ?? "");
}

function resolvedStatusCopy(application: UpgradeRequest): { label: string; tone: "success" | "neutral"; detail: string } {
  if (application.status === "approved") return {
    label: "ยืนยันชำระแล้ว",
    tone: "success",
    detail: "ครูอรรี่ยืนยันการชำระแล้ว สิทธิ์สมาชิกจะนับจากรายการที่อนุมัตินี้",
  };
  if (isTestCleanupReason(application.resolutionReasonCode)) return {
    label: "ยกเลิกรายการทดสอบ",
    tone: "neutral",
    detail: "รายการนี้เป็นข้อมูลทดสอบของเจ้าของระบบและถูกยกเลิกแล้ว ไม่มีการให้สิทธิ์หรือใช้โควตา Founder",
  };
  return {
    label: "ไม่ผ่านการตรวจสอบ",
    tone: "neutral",
    detail: "รายการนี้ไม่ได้รับสิทธิ์ หากต้องการสอบถามรายละเอียด กรุณาติดต่อครูอรรี่ทาง LINE",
  };
}

function pendingStatusCopy(application: UpgradeRequest) {
  return application.paymentReportedAt
    ? {
        label: "แจ้งหลักฐานแล้ว · รอตรวจสอบ",
        tone: "info" as const,
        detail: "ครูอรรี่ได้รับสถานะการแจ้งชำระแล้ว และกำลังตรวจยอดจริงก่อนออกสิทธิ์สมาชิก",
      }
    : {
        label: "รอแจ้งชำระ",
        tone: "warning" as const,
        detail: "ใบสมัครนี้ยังไม่จองสิทธิ์ กรุณาส่งเลขอ้างอิงและหลักฐานทาง LINE แล้วกดแจ้งทีมงานบนหน้านี้",
      };
}

function formatThaiDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export default function MembershipPage() {
  return (
    <Suspense fallback={<div className="kru-membership-page" aria-busy="true" />}>
      <MembershipContent />
    </Suspense>
  );
}

function MembershipContent() {
  const searchParams = useSearchParams();
  const requestedPlan = searchParams.get("plan");
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(!isSupabaseConfigured);
  const [schemaReadiness, setSchemaReadiness] = useState<MembershipSchemaReadiness>(isSupabaseConfigured ? "checking" : "unavailable");
  const [capacity, setCapacity] = useState<FounderCapacity | null>(null);
  const [capacityLoaded, setCapacityLoaded] = useState(!isSupabaseConfigured);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState<MembershipPlanId>(
    requestedPlan === "teacher" || requestedPlan === "founder" ? requestedPlan : "founder",
  );
  const [applications, setApplications] = useState<UpgradeRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // A legacy account can legitimately have an older pending application and a
  // newer resolved record. Keep the still-actionable request visible instead
  // of hiding it behind history; the membership schema migration prevents
  // more than one pending request per member once it is ready.
  const latestApplication = applications.find((application) => application.status === "pending")
    ?? applications[0]
    ?? null;
  const hasOpenApplication = latestApplication?.status === "pending" || latestApplication?.status === "approved";
  const applicationPlanId: MembershipPlanId = hasOpenApplication && latestApplication && ["founder", "teacher"].includes(latestApplication.planId)
    ? latestApplication.planId as MembershipPlanId
    : selectedPlanId;
  const applicationAmount = applicationPlanId === "founder" ? 299 : 599;
  const selectedPlan = plans.find((plan) => plan.id === applicationPlanId) ?? null;
  const planChoices = plans.filter((plan): plan is Plan & { id: MembershipPlanId } => plan.id === "founder" || plan.id === "teacher");
  const pendingFounderFull = latestApplication?.status === "pending"
    && latestApplication.planId === "founder"
    && capacity?.isFull === true;
  const signupHref = `/login?mode=signup&next=${encodeURIComponent(`/membership?plan=${applicationPlanId}`)}`;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const load = async () => {
      const [readiness, authResult, publicPlans] = await Promise.all([
        fetchMembershipSchemaReadiness(supabase),
        supabase.auth.getUser(),
        fetchPlans(supabase),
      ]);
      if (!active) return;
      setSchemaReadiness(readiness);
      setPlans(publicPlans);
      const user = authResult.data.user;
      setUserId(user?.id ?? null);
      if (readiness !== "ready") {
        setCapacity(null);
        setCapacityLoaded(true);
        setApplications([]);
        setAuthLoaded(true);
        return;
      }
      const [founderCapacity, nextApplications] = await Promise.all([
        fetchFounderCapacity(supabase),
        user ? fetchUpgradeRequests(supabase, user.id) : Promise.resolve([]),
      ]);
      if (!active) return;
      setCapacity(founderCapacity);
      setCapacityLoaded(true);
      if (user) {
        setApplications(nextApplications);
      }
      setAuthLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!isSupabaseConfigured || schemaReadiness !== "ready") return;
    let active = true;
    const refreshStatus = () => {
      void Promise.all([
        fetchFounderCapacity(supabase),
        userId ? fetchUpgradeRequests(supabase, userId) : Promise.resolve(null),
      ]).then(([nextCapacity, nextApplications]) => {
        if (!active) return;
        setCapacity(nextCapacity);
        if (nextApplications) setApplications(nextApplications);
      });
    };
    const timer = window.setInterval(refreshStatus, 60_000);
    window.addEventListener("focus", refreshStatus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshStatus);
    };
  }, [schemaReadiness, supabase, userId]);

  const handleRetrySchemaReadiness = async () => {
    if (!isSupabaseConfigured || schemaReadiness === "checking") return;
    setSchemaReadiness("checking");
    setCapacityLoaded(false);
    setError(null);
    const readiness = await fetchMembershipSchemaReadiness(supabase);
    setSchemaReadiness(readiness);
    if (readiness !== "ready") {
      setCapacity(null);
      setCapacityLoaded(true);
      setApplications([]);
      return;
    }
    const [nextCapacity, nextApplications] = await Promise.all([
      fetchFounderCapacity(supabase),
      userId ? fetchUpgradeRequests(supabase, userId) : Promise.resolve([]),
    ]);
    setCapacity(nextCapacity);
    setCapacityLoaded(true);
    setApplications(nextApplications);
  };

  const selectPlan = (planId: MembershipPlanId) => {
    if (hasOpenApplication) return;
    setSelectedPlanId(planId);
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("plan", planId);
    window.history.replaceState(window.history.state, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  };

  const handleCreateApplication = async () => {
    if (!userId || submitting) return;
    if (schemaReadiness !== "ready") {
      setError(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);
      return;
    }
    if (applicationPlanId === "founder" && !capacity) {
      setError("ยังตรวจสอบจำนวนสิทธิ์ Founder ไม่ได้ จึงปิดการส่งใบสมัครชั่วคราว");
      return;
    }
    if (applicationPlanId === "founder" && capacity?.isFull) {
      setError("สิทธิ์ Founder ครบแล้ว กรุณาเลือกแพ็ก Teacher 599 บาท/ปี");
      return;
    }
    setSubmitting(true);
    setError(null);
    const result = await createMembershipApplication(supabase, applicationPlanId);
    setSubmitting(false);
    if (!result.application) {
      setError(result.error ?? "ส่งใบสมัครไม่สำเร็จ กรุณาลองอีกครั้ง");
      setCapacity(await fetchFounderCapacity(supabase));
      return;
    }
    const application = result.application;
    setApplications((current) => [application, ...current.filter((item) => item.id !== application.id)]);
    setCapacity(await fetchFounderCapacity(supabase));
  };

  const handleReportPayment = async () => {
    if (!latestApplication || latestApplication.status !== "pending" || reporting || pendingFounderFull) return;
    if (schemaReadiness !== "ready") {
      setError(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);
      return;
    }
    setReporting(true);
    setError(null);
    const result = await reportMembershipPayment(supabase, latestApplication.id);
    if (result.error || !result.application) {
      const nextCapacity = await fetchFounderCapacity(supabase);
      setCapacity(nextCapacity);
      setError(latestApplication.planId === "founder" && nextCapacity?.isFull
        ? "Founder ครบ 100 สิทธิ์แล้ว กรุณาเปลี่ยนใบสมัครเป็น Teacher ก่อนแจ้งชำระ"
        : `แจ้งทีมงานไม่สำเร็จ: ${result.error ?? "ระบบไม่ได้ส่งข้อมูลใบสมัครกลับมา"}`);
    } else if (userId) {
      const application = result.application;
      setApplications((current) => [application, ...current.filter((item) => item.id !== application.id)]);
    }
    setReporting(false);
  };

  const handleConvertToTeacher = async () => {
    if (!latestApplication || latestApplication.status !== "pending" || latestApplication.planId !== "founder" || converting) return;
    if (schemaReadiness !== "ready") {
      setError(MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!window.confirm("เปลี่ยนใบสมัครนี้เป็นแพ็ก Teacher ราคา 599 บาท/ปีใช่หรือไม่? เลขอ้างอิงเดิมจะใช้ต่อได้")) return;
    setConverting(true);
    setError(null);
    const result = await convertFounderApplicationToTeacher(supabase, latestApplication.id);
    if (result.error || !result.application) {
      setError(`เปลี่ยนแพ็กไม่สำเร็จ: ${result.error ?? "ระบบไม่ได้ส่งข้อมูลใบสมัครกลับมา"}`);
    } else if (userId) {
      const application = result.application;
      setSelectedPlanId("teacher");
      setApplications((current) => [application, ...current.filter((item) => item.id !== application.id)]);
      setCapacity(await fetchFounderCapacity(supabase));
    }
    setConverting(false);
  };

  const handleCopyReference = async (referenceCode: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(referenceCode);
      setCopied(referenceCode);
      window.setTimeout(() => setCopied((current) => current === referenceCode ? null : current), 2500);
    } catch {
      setError("คัดลอกเลขอ้างอิงไม่สำเร็จ กรุณาแตะค้างที่เลขแล้วคัดลอกด้วยตนเอง");
    }
  };

  return (
    <div className="kru-membership-page">
      <header className="kru-membership-header">
        <Link href="/" className="kru-membership-brand" aria-label="กลับหน้าแรก KruAorry">
          <Mascot size={36} />
          <strong>KruAorry</strong>
        </Link>
        <nav aria-label="เมนูสมาชิก">
          <Link href="/" className="kru-btn kru-btn--ghost"><Home size={17} aria-hidden="true" /> หน้าแรก</Link>
          {authLoaded && userId ? (
            <Link href="/app" className="kru-btn kru-btn--soft">พื้นที่สมาชิก</Link>
          ) : (
            <Link href={signupHref} className="kru-btn kru-btn--soft">เข้าสู่ระบบ / สมัครบัญชี</Link>
          )}
        </nav>
      </header>

      <main>
        <section className="kru-membership-hero">
          <div className="kru-membership-hero__copy">
            <span className="kru-membership-eyebrow"><Sparkles size={16} aria-hidden="true" /> {applicationPlanId === "founder" ? "สิทธิ์เปิดตัว Founder 100" : "แพ็ก Teacher"}</span>
            <h1>{selectedPlan?.priceLabel ?? (applicationPlanId === "founder" ? "299 บาทเฉพาะปีแรก" : "599 บาท/ปี")}</h1>
            <p className="kru-membership-hero__lead">
              {applicationPlanId === "founder"
                ? "สำหรับ 100 คนแรกที่ครูอรรี่ยืนยันการชำระเงินจริง"
                : "แพ็กสมาชิกรายปีสำหรับเข้าถึงคลังสื่อพรีเมียม"}
            </p>
            <div className="kru-membership-renewal"><ShieldCheck size={20} aria-hidden="true" /><strong>{applicationPlanId === "founder" ? "ต่ออายุปีถัดไป 599 บาท/ปี" : "ต่ออายุ 599 บาท/ปี"}</strong></div>
            <p className="kru-membership-rule">กรอกใบสมัครยังไม่นับสิทธิ์และยังไม่จองสิทธิ์ การแจ้งหลักฐานก็ยังต้องรอทีมงานยืนยันยอดจริง</p>
          </div>

          <aside className="kru-membership-capacity" aria-live="polite" aria-busy={!capacityLoaded}>
            <span>จำนวนสิทธิ์จากฐานข้อมูล</span>
            {schemaReadiness === "unavailable" ? (
              <strong>ระบบสมัครสมาชิกกำลังปรับปรุงชั่วคราว</strong>
            ) : capacity ? (
              <>
                <strong>ยืนยันชำระแล้ว {capacity.used}/{capacity.capacity}</strong>
                <p>{capacity.isFull ? "สิทธิ์ราคาเปิดตัวครบแล้ว" : `เหลือ ${capacity.remaining} สิทธิ์`}</p>
                <span className="kru-membership-capacity__track" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (capacity.used / capacity.capacity) * 100)}%` }} />
                </span>
              </>
            ) : (
              <strong>{schemaReadiness === "checking" || !capacityLoaded ? "กำลังตรวจสอบความพร้อมของระบบ…" : "ตรวจสอบจำนวนสิทธิ์ไม่ได้ในขณะนี้"}</strong>
            )}
          </aside>
        </section>

        <section className="kru-membership-layout" aria-labelledby="membership-application-title">
          <div className="kru-card kru-membership-application">
            <div>
              <span className="kru-membership-step">ขั้นตอนที่ 1</span>
              <h2 id="membership-application-title">กรอกใบสมัครในระบบก่อน</h2>
              <p>ระบบจะสร้างเลขอ้างอิงที่ใช้จับคู่บัญชีเว็บไซต์กับหลักฐานการชำระใน LINE</p>
            </div>

            <section className="kru-membership-plan" aria-labelledby="membership-plan-title">
              <div className="kru-membership-plan__heading">
                <h3 id="membership-plan-title">แพ็กที่ต้องการสมัคร</h3>
                {hasOpenApplication && <Badge tone="neutral">ยึดตามใบสมัครล่าสุด</Badge>}
              </div>
              {planChoices.length > 0 && (
                <div className="kru-membership-plan__choices" role="group" aria-label="เลือกแพ็กสมาชิก">
                  {planChoices.map((plan) => {
                    const active = applicationPlanId === plan.id;
                    const unavailable = plan.id === "founder" && capacity?.isFull === true && !hasOpenApplication;
                    return (
                      <button
                        key={plan.id}
                        type="button"
                        className={active ? "is-active" : ""}
                        aria-pressed={active}
                        disabled={hasOpenApplication || unavailable}
                        onClick={() => selectPlan(plan.id)}
                      >
                        <strong>{plan.name}</strong>
                        <span>{plan.priceLabel}</span>
                        {unavailable && <small>ครบ 100 สิทธิ์แล้ว</small>}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedPlan && (
                <div className="kru-membership-plan__details">
                  {selectedPlan.note && <p>{selectedPlan.note}</p>}
                  <PlanBenefits benefits={selectedPlan.benefits ?? []} />
                </div>
              )}
            </section>

            {!isSupabaseConfigured ? (
              <p role="status" className="kru-membership-alert kru-membership-alert--warning">ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณากลับมาใหม่ภายหลัง</p>
            ) : schemaReadiness === "checking" ? (
              <p role="status" className="kru-membership-alert">กำลังตรวจสอบความพร้อมของระบบสมัครสมาชิก…</p>
            ) : schemaReadiness === "unavailable" ? (
              <div className="kru-membership-action-block">
                <p role="alert" className="kru-membership-alert kru-membership-alert--warning">{MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE}</p>
                <Button type="button" variant="secondary" onClick={() => void handleRetrySchemaReadiness()}>ลองตรวจสอบอีกครั้ง</Button>
              </div>
            ) : !authLoaded ? (
              <p role="status" className="kru-membership-alert">กำลังตรวจสอบบัญชีสมาชิก…</p>
            ) : !userId ? (
              <div className="kru-membership-action-block">
                <p>เข้าสู่ระบบหรือสมัครบัญชีฟรีก่อน ระบบจะพากลับมายังหน้านี้หลังยืนยันอีเมล</p>
                <Link href={signupHref} className="kru-btn kru-btn--primary kru-btn--lg">เข้าสู่ระบบเพื่อกรอกใบสมัคร</Link>
              </div>
            ) : latestApplication && hasOpenApplication ? (
              <>
                <ApplicationStatus
                  application={latestApplication}
                  copied={copied === latestApplication.referenceCode}
                  onCopy={() => void handleCopyReference(latestApplication.referenceCode)}
                />
                {pendingFounderFull && (
                  <div role="alert" className="kru-membership-conversion">
                    <strong>Founder ครบ 100 สิทธิ์ก่อนการยืนยันยอด</strong>
                    <p>ใบสมัคร Founder นี้ไม่สามารถส่งต่อเพื่อยืนยันได้ เปลี่ยนเป็น Teacher 599 บาท/ปีโดยใช้เลขอ้างอิงเดิมได้</p>
                    <Button size="lg" block loading={converting} onClick={() => void handleConvertToTeacher()}>
                      ยืนยันเปลี่ยนเป็น Teacher 599 บาท/ปี
                    </Button>
                  </div>
                )}
              </>
            ) : applicationPlanId === "founder" && !capacity ? (
              <p role="status" className="kru-membership-alert kru-membership-alert--warning">ยังตรวจสอบจำนวนสิทธิ์ไม่ได้ จึงปิดการส่งใบสมัครชั่วคราวเพื่อป้องกันสิทธิ์เกินจำนวน</p>
            ) : (
              <div className="kru-membership-action-block">
                {latestApplication?.status === "declined" && (
                  <>
                    <ApplicationStatus
                      application={latestApplication}
                      copied={copied === latestApplication.referenceCode}
                      onCopy={() => void handleCopyReference(latestApplication.referenceCode)}
                    />
                    <p className="kru-membership-alert">
                      {isTestCleanupReason(latestApplication.resolutionReasonCode)
                        ? "รายการทดสอบถูกยกเลิกแล้ว คุณสามารถส่งใบสมัครจริงได้"
                        : "ใบสมัครก่อนหน้าไม่ผ่านการตรวจสอบ คุณสามารถส่งใบสมัครใหม่ได้"}
                    </p>
                  </>
                )}
                {applicationPlanId === "founder" && capacity?.isFull ? (
                  <>
                    <p className="kru-membership-alert kru-membership-alert--warning">Founder ครบ 100 สิทธิ์แล้ว กรุณาเลือก Teacher เพื่อสร้างใบสมัครใหม่</p>
                    <Button size="lg" block onClick={() => selectPlan("teacher")}>เลือก Teacher 599 บาท/ปี</Button>
                  </>
                ) : (
                  <>
                    <p>{applicationPlanId === "founder" ? "เมื่อส่งสำเร็จ คุณจะได้รับเลขอ้างอิงสำหรับสิทธิ์ปีแรก 299 บาท" : "เมื่อส่งสำเร็จ คุณจะได้รับเลขอ้างอิงสำหรับแพ็ก Teacher 599 บาท/ปี"}</p>
                    <Button size="lg" block loading={submitting} onClick={() => void handleCreateApplication()}>
                      {submitting ? "กำลังสร้างเลขอ้างอิง…" : `ส่งใบสมัคร ${applicationAmount.toLocaleString("th-TH")} บาท`}
                    </Button>
                  </>
                )}
              </div>
            )}

            {error && <p role="alert" className="kru-membership-alert kru-membership-alert--danger">{error}</p>}
          </div>

          <section id="how-to-pay" className="kru-card kru-membership-payment" aria-labelledby="membership-payment-title">
            <span className="kru-membership-step">ขั้นตอนที่ 2</span>
            <h2 id="membership-payment-title">แจ้งชำระผ่าน LINE OA</h2>
            <ol>
              <li>ส่งเลขอ้างอิงจากเว็บไซต์ให้ครูอรรี่ทาง LINE</li>
              <li>รอรับรายละเอียดการชำระจากครูอรรี่ก่อนโอน</li>
              <li>หลังชำระแล้ว ส่งเลขอ้างอิงพร้อมสลิปในแชตเดิม</li>
              <li>กลับมากด “ฉันส่งหลักฐานแล้ว” แล้วรอครูอรรี่ตรวจสอบยอดจริง</li>
            </ol>
            <p className="kru-membership-payment__notice">การส่งสลิปหรือกรอกใบสมัครยังไม่นับสิทธิ์ จนกว่าระบบจะแสดงสถานะ “ยืนยันชำระแล้ว”</p>
            {schemaReadiness !== "ready" ? (
              <p role="status" className="kru-membership-alert kru-membership-alert--warning">{MEMBERSHIP_SCHEMA_UNAVAILABLE_MESSAGE}</p>
            ) : pendingFounderFull ? (
              <p role="alert" className="kru-membership-alert kru-membership-alert--danger">Founder ครบแล้ว จึงปิดปุ่ม LINE และการแจ้งหลักฐานสำหรับใบสมัครนี้ กรุณาเปลี่ยนเป็น Teacher ก่อน</p>
            ) : latestApplication?.status === "pending" ? (
              <>
                <a className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block" href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                  <MessageCircle size={19} aria-hidden="true" /> เปิด LINE OA เพื่อแจ้งชำระ
                </a>
                {latestApplication.paymentReportedAt ? (
                  <p role="status" className="kru-membership-alert">แจ้งหลักฐานแล้วเมื่อ {formatThaiDate(latestApplication.paymentReportedAt)} · อยู่ระหว่างรอตรวจสอบยอดจริง</p>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="soft"
                      size="lg"
                      block
                      loading={reporting}
                      aria-describedby="membership-payment-report-help"
                      onClick={() => void handleReportPayment()}
                    >
                      ฉันส่งเลขอ้างอิงและหลักฐานแล้ว
                    </Button>
                    <p id="membership-payment-report-help" className="kru-membership-payment__help">กดหลังส่งใน LINE แล้ว เพื่อย้ายรายการจาก “รอแจ้งชำระ” ไปเป็น “รอตรวจสอบ”</p>
                  </>
                )}
              </>
            ) : (
              <button type="button" className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block" disabled>
                สร้างเลขอ้างอิงก่อนเปิด LINE
              </button>
            )}
            <small>LINE Official Account: Kru Aorry Web</small>
          </section>
        </section>

        <section className="kru-membership-facts" aria-label="เงื่อนไขสำคัญ">
          <article><Check size={20} aria-hidden="true" /><div><strong>นับจากยอดจริง</strong><p>นับสิทธิ์เมื่อครูอรรี่ตรวจสอบและยืนยันการชำระเงินจริงในระบบเท่านั้น</p></div></article>
          <article><Check size={20} aria-hidden="true" /><div><strong>จำกัด 100 คน</strong><p>ระบบฐานข้อมูลป้องกันการอนุมัติสิทธิ์ราคา 299 บาทเกิน 100 คน</p></div></article>
          <article><Check size={20} aria-hidden="true" /><div><strong>ไม่เก็บสลิปบนเว็บไซต์</strong><p>ส่งหลักฐานใน LINE OA เว็บไซต์เก็บเฉพาะเลขอ้างอิง ยอด สถานะ และเวลายืนยันเพื่อดูแลสมาชิก</p></div></article>
        </section>
      </main>

      <footer>
        <span>KruAorry — ระบบสมาชิกสำหรับครูไทย</span>
        <span><Link href="/terms">เงื่อนไขการใช้งาน</Link> · <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link></span>
      </footer>

      <style jsx>{`
        .kru-membership-page { min-height: 100vh; background: var(--surface-page); }
        .kru-membership-header { position: sticky; top: 0; z-index: 20; min-height: 68px; padding: var(--sp-4) max(var(--sp-5), env(safe-area-inset-right)) var(--sp-4) max(var(--sp-5), env(safe-area-inset-left)); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); border-bottom: 1px solid var(--border-subtle); background: rgba(255,255,255,.94); backdrop-filter: blur(14px); }
        .kru-membership-brand { min-width: 0; display: inline-flex; align-items: center; gap: 10px; color: var(--text-strong); text-decoration: none; font-family: var(--font-display); font-size: var(--fs-18); }
        .kru-membership-header nav { display: flex; align-items: center; gap: var(--sp-2); }
        main { width: min(100%, var(--container-max)); margin: 0 auto; padding: var(--sp-8) var(--sp-5) var(--sp-13); }
        .kru-membership-hero { overflow: hidden; padding: clamp(28px, 6vw, 64px); display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(260px, .8fr); align-items: center; gap: clamp(24px, 5vw, 64px); border: 1px solid rgba(195,176,252,.62); border-radius: var(--r-panel); background: radial-gradient(circle at 92% 10%, rgba(255,255,255,.95), transparent 36%), linear-gradient(135deg, var(--purple-100), var(--pink-50) 54%, var(--blue-100)); box-shadow: var(--shadow-lg); }
        .kru-membership-hero__copy { min-width: 0; }
        .kru-membership-eyebrow, .kru-membership-step { width: fit-content; display: inline-flex; align-items: center; gap: 7px; color: var(--purple-700); font-size: var(--fs-13); font-weight: var(--fw-bold); }
        .kru-membership-hero h1 { margin-top: var(--sp-4); font-size: clamp(2.25rem, 7vw, 4.5rem); letter-spacing: -.04em; }
        .kru-membership-hero__lead { margin-top: var(--sp-4); color: var(--text-body); font-size: clamp(1.05rem, 2.5vw, 1.35rem); line-height: var(--lh-loose); }
        .kru-membership-renewal { width: fit-content; margin-top: var(--sp-6); padding: 10px 14px; display: flex; align-items: center; gap: 9px; border-radius: var(--r-pill); background: rgba(255,255,255,.84); color: var(--text-strong); }
        .kru-membership-renewal svg { color: var(--status-success-fg); }
        .kru-membership-rule { margin-top: var(--sp-4); color: var(--status-danger-fg); font-size: var(--fs-14); font-weight: var(--fw-semibold); }
        .kru-membership-capacity { min-width: 0; padding: var(--sp-7); display: grid; gap: var(--sp-2); border-radius: var(--r-card); background: rgba(255,255,255,.9); box-shadow: var(--shadow-md); }
        .kru-membership-capacity > span:first-child { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-membership-capacity strong { color: var(--text-strong); font-family: var(--font-display); font-size: clamp(1.35rem, 4vw, var(--fs-24)); }
        .kru-membership-capacity p { color: var(--purple-700); font-weight: var(--fw-semibold); }
        .kru-membership-capacity__track { height: 9px; margin-top: var(--sp-3); overflow: hidden; border-radius: var(--r-pill); background: var(--purple-100); }
        .kru-membership-capacity__track > span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--purple-600), var(--pink-500)); }
        .kru-membership-layout { margin-top: var(--sp-8); display: grid; grid-template-columns: minmax(0, 1.12fr) minmax(300px, .88fr); gap: var(--gap-grid); align-items: start; }
        .kru-membership-application, .kru-membership-payment { min-width: 0; padding: clamp(20px, 4vw, 32px); display: grid; gap: var(--sp-5); }
        .kru-membership-application h2, .kru-membership-payment h2 { margin-top: var(--sp-2); font-size: var(--fs-24); }
        .kru-membership-application > div > p, .kru-membership-payment > p { margin-top: var(--sp-3); color: var(--text-muted); }
        .kru-membership-plan { padding: var(--sp-4); display: grid; gap: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-sunken); }
        .kru-membership-plan__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-membership-plan__heading h3 { font-size: var(--fs-18); }
        .kru-membership-plan__choices { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
        .kru-membership-plan__choices button { min-height: 84px; padding: var(--sp-4); display: grid; gap: 3px; border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-card); color: var(--text-body); text-align: left; cursor: pointer; }
        .kru-membership-plan__choices button.is-active { border-color: var(--border-brand); background: var(--purple-50); box-shadow: 0 0 0 2px color-mix(in srgb, var(--brand) 16%, transparent); }
        .kru-membership-plan__choices button:disabled { cursor: not-allowed; opacity: .62; }
        .kru-membership-plan__choices strong { color: var(--text-strong); }
        .kru-membership-plan__choices small { color: var(--status-danger-fg); }
        .kru-membership-plan__details { padding-top: var(--sp-2); border-top: 1px solid var(--border-subtle); }
        .kru-membership-plan__details > p { color: var(--text-muted); font-size: var(--fs-14); }
        .kru-membership-action-block { display: grid; gap: var(--sp-4); }
        .kru-membership-action-block > a { width: fit-content; }
        .kru-membership-alert { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-info-bg); color: var(--status-info-fg); overflow-wrap: anywhere; }
        .kru-membership-alert--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-membership-alert--danger { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-membership-conversion { padding: var(--sp-5); display: grid; gap: var(--sp-3); border: 1px solid color-mix(in srgb, var(--status-danger-fg) 28%, transparent); border-radius: var(--r-card); background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-membership-conversion p { line-height: var(--lh-loose); }
        .kru-membership-payment { scroll-margin-top: 88px; }
        .kru-membership-payment ol { margin: 0; padding-left: 1.3rem; display: grid; gap: var(--sp-3); color: var(--text-body); }
        .kru-membership-payment__notice { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-warning-bg); color: var(--status-warning-fg) !important; font-size: var(--fs-14); font-weight: var(--fw-semibold); }
        .kru-membership-payment__help { margin-top: calc(var(--sp-2) * -1) !important; color: var(--text-muted) !important; font-size: var(--fs-13); text-align: center; }
        .kru-membership-payment > small { color: var(--text-muted); text-align: center; }
        .kru-membership-payment :global(a.kru-btn:hover) { color: var(--white); text-decoration: none; }
        .kru-membership-facts { margin-top: var(--sp-8); display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--sp-5); }
        .kru-membership-facts article { min-width: 0; padding: var(--sp-5); display: flex; align-items: flex-start; gap: var(--sp-3); border: 1px solid var(--border-subtle); border-radius: var(--r-card); background: var(--surface-card); }
        .kru-membership-facts svg { flex: 0 0 auto; color: var(--status-success-fg); }
        .kru-membership-facts p { margin-top: 4px; color: var(--text-muted); font-size: var(--fs-14); }
        footer { padding: var(--sp-7) var(--sp-5) calc(var(--sp-7) + env(safe-area-inset-bottom)); display: flex; justify-content: center; gap: var(--sp-5); flex-wrap: wrap; border-top: 1px solid var(--border-subtle); color: var(--text-muted); font-size: var(--fs-13); text-align: center; }
        @media (max-width: 820px) {
          .kru-membership-hero, .kru-membership-layout { grid-template-columns: minmax(0, 1fr); }
          .kru-membership-facts { grid-template-columns: minmax(0, 1fr); }
        }
        @media (max-width: 620px) {
          .kru-membership-header { align-items: flex-start; }
          .kru-membership-brand strong, .kru-membership-header nav > :global(.kru-btn--ghost) { display: none; }
          .kru-membership-header nav > :global(.kru-btn) { white-space: normal; text-align: center; }
          main { padding-top: var(--sp-5); }
          .kru-membership-hero { padding: var(--sp-7); }
          .kru-membership-renewal { width: 100%; align-items: flex-start; border-radius: var(--r-md); }
          .kru-membership-action-block > a { width: 100%; }
          .kru-membership-plan__choices { grid-template-columns: minmax(0, 1fr); }
        }
      `}</style>
    </div>
  );
}

function ApplicationStatus({ application, copied, onCopy }: { application: UpgradeRequest; copied: boolean; onCopy: () => void }) {
  const copy = application.status === "pending" ? pendingStatusCopy(application) : resolvedStatusCopy(application);
  return (
    <section className="kru-membership-status" aria-live="polite">
      <div className="kru-membership-status__heading">
        <Badge tone={copy.tone}>{copy.label}</Badge>
        <span>ส่งเมื่อ {formatThaiDate(application.createdAt)}</span>
      </div>
      <div>
        <span>เลขอ้างอิงใบสมัคร</span>
        <div className="kru-membership-reference">
          <strong>{application.referenceCode}</strong>
          <button type="button" onClick={onCopy} aria-label={`คัดลอกเลขอ้างอิง ${application.referenceCode}`}>
            {copied ? <Check size={18} aria-hidden="true" /> : <Clipboard size={18} aria-hidden="true" />}
            {copied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
      </div>
      <p>{copy.detail}</p>
      <small>ยอดตามใบสมัคร {application.quotedAmountThb.toLocaleString("th-TH")} บาท</small>
      {application.status === "approved" && application.paymentConfirmedAt && (
        <small>ยืนยันในระบบเมื่อ {formatThaiDate(application.paymentConfirmedAt)}</small>
      )}
      {application.status === "pending" && application.paymentReportedAt && (
        <small>แจ้งหลักฐานเมื่อ {formatThaiDate(application.paymentReportedAt)}</small>
      )}
      {application.status === "pending" && (
        <a href="#how-to-pay">ดูวิธีแจ้งชำระ <ExternalLink size={15} aria-hidden="true" /></a>
      )}
      <style jsx>{`
        .kru-membership-status { padding: var(--sp-5); display: grid; gap: var(--sp-4); border: 1px solid var(--border-brand); border-radius: var(--r-card); background: var(--purple-50); }
        .kru-membership-status__heading { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-membership-status__heading > span { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-membership-status > div > span { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-membership-reference { margin-top: var(--sp-2); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); }
        .kru-membership-reference strong { min-width: 0; overflow-wrap: anywhere; color: var(--text-strong); font-family: var(--font-mono); font-size: clamp(1.15rem, 5vw, var(--fs-24)); letter-spacing: .04em; }
        .kru-membership-reference button { min-height: 44px; padding: 0 var(--sp-4); flex: 0 0 auto; display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border-brand); border-radius: var(--r-pill); background: var(--surface-card); color: var(--purple-700); font: inherit; font-weight: var(--fw-semibold); cursor: pointer; }
        p { color: var(--text-body); }
        small { color: var(--text-muted); }
        a { min-height: 44px; display: inline-flex; align-items: center; gap: 7px; font-weight: var(--fw-semibold); }
        @media (max-width: 420px) {
          .kru-membership-reference { align-items: stretch; flex-direction: column; }
          .kru-membership-reference button { justify-content: center; }
        }
      `}</style>
    </section>
  );
}
