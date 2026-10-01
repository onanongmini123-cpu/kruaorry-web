"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clipboard, ExternalLink, Home, MessageCircle, ShieldCheck, Sparkles } from "lucide-react";
import { Mascot } from "@/components/Mascot";
import { Badge, Button } from "@/components/ui";
import { LINE_OA_URL } from "@/lib/config";
import {
  createMembershipApplication,
  fetchFounderCapacity,
  fetchUpgradeRequests,
  type UpgradeRequest,
} from "@/lib/data";
import type { FounderCapacity } from "@/lib/founderCapacity";
import { createClient } from "@/lib/supabase/client";

const isSupabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const STATUS_COPY: Record<UpgradeRequest["status"], { label: string; tone: "warning" | "success" | "neutral"; detail: string }> = {
  pending: {
    label: "รอส่ง/ตรวจสอบการชำระ",
    tone: "warning",
    detail: "ใบสมัครนี้ยังไม่จองสิทธิ์ กรุณาส่งเลขอ้างอิงทาง LINE และรอครูอรรี่ตรวจสอบยอดจริง",
  },
  approved: {
    label: "ยืนยันชำระแล้ว",
    tone: "success",
    detail: "ครูอรรี่ยืนยันการชำระแล้ว สิทธิ์สมาชิกจะนับจากรายการที่อนุมัตินี้",
  },
  declined: {
    label: "ไม่ผ่านการตรวจสอบ",
    tone: "neutral",
    detail: "รายการนี้ไม่ได้รับสิทธิ์ หากต้องการสอบถามรายละเอียด กรุณาติดต่อครูอรรี่ทาง LINE",
  },
};

function formatThaiDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

export default function MembershipPage() {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [authLoaded, setAuthLoaded] = useState(!isSupabaseConfigured);
  const [capacity, setCapacity] = useState<FounderCapacity | null>(null);
  const [capacityLoaded, setCapacityLoaded] = useState(!isSupabaseConfigured);
  const [applications, setApplications] = useState<UpgradeRequest[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const latestApplication = applications[0] ?? null;
  const hasOpenApplication = latestApplication?.status === "pending" || latestApplication?.status === "approved";
  const applicationPlanId = capacity?.isFull ? "teacher" : "founder";
  const applicationAmount = applicationPlanId === "founder" ? 299 : 599;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    const load = async () => {
      const [founderCapacity, authResult] = await Promise.all([
        fetchFounderCapacity(supabase),
        supabase.auth.getUser(),
      ]);
      if (!active) return;
      setCapacity(founderCapacity);
      setCapacityLoaded(true);
      const user = authResult.data.user;
      setUserId(user?.id ?? null);
      if (user) {
        const nextApplications = await fetchUpgradeRequests(supabase, user.id);
        if (!active) return;
        setApplications(nextApplications);
      }
      if (active) setAuthLoaded(true);
    };
    void load();
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
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
  }, [supabase, userId]);

  const handleCreateApplication = async () => {
    if (!userId || submitting || !capacity) return;
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
            <Link href="/login?mode=signup&next=%2Fmembership" className="kru-btn kru-btn--soft">เข้าสู่ระบบ / สมัครบัญชี</Link>
          )}
        </nav>
      </header>

      <main>
        <section className="kru-membership-hero">
          <div className="kru-membership-hero__copy">
            <span className="kru-membership-eyebrow"><Sparkles size={16} aria-hidden="true" /> สิทธิ์เปิดตัว Founder 100</span>
            <h1>299 บาทเฉพาะปีแรก</h1>
            <p className="kru-membership-hero__lead">สำหรับ 100 คนแรกที่ครูอรรี่ยืนยันการชำระเงินจริง</p>
            <div className="kru-membership-renewal"><ShieldCheck size={20} aria-hidden="true" /><strong>ต่ออายุปีถัดไป 599 บาท/ปี</strong></div>
            <p className="kru-membership-rule">กรอกใบสมัครยังไม่นับสิทธิ์และยังไม่จองสิทธิ์</p>
          </div>

          <aside className="kru-membership-capacity" aria-live="polite" aria-busy={!capacityLoaded}>
            <span>จำนวนสิทธิ์จากฐานข้อมูล</span>
            {capacity ? (
              <>
                <strong>ยืนยันชำระแล้ว {capacity.used}/{capacity.capacity}</strong>
                <p>{capacity.isFull ? "สิทธิ์ราคาเปิดตัวครบแล้ว" : `เหลือ ${capacity.remaining} สิทธิ์`}</p>
                <span className="kru-membership-capacity__track" aria-hidden="true">
                  <span style={{ width: `${Math.min(100, (capacity.used / capacity.capacity) * 100)}%` }} />
                </span>
              </>
            ) : (
              <strong>{capacityLoaded ? "ตรวจสอบจำนวนสิทธิ์ไม่ได้ในขณะนี้" : "กำลังตรวจสอบจำนวนสิทธิ์…"}</strong>
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

            {!isSupabaseConfigured ? (
              <p role="status" className="kru-membership-alert kru-membership-alert--warning">ระบบสมาชิกยังไม่พร้อมใช้งาน กรุณากลับมาใหม่ภายหลัง</p>
            ) : !authLoaded ? (
              <p role="status" className="kru-membership-alert">กำลังตรวจสอบบัญชีสมาชิก…</p>
            ) : !userId ? (
              <div className="kru-membership-action-block">
                <p>เข้าสู่ระบบหรือสมัครบัญชีฟรีก่อน ระบบจะพากลับมายังหน้านี้หลังยืนยันอีเมล</p>
                <Link href="/login?mode=signup&next=%2Fmembership" className="kru-btn kru-btn--primary kru-btn--lg">เข้าสู่ระบบเพื่อกรอกใบสมัคร</Link>
              </div>
            ) : latestApplication && hasOpenApplication ? (
              <ApplicationStatus
                application={latestApplication}
                copied={copied === latestApplication.referenceCode}
                onCopy={() => void handleCopyReference(latestApplication.referenceCode)}
              />
            ) : !capacity ? (
              <p role="status" className="kru-membership-alert kru-membership-alert--warning">ยังตรวจสอบจำนวนสิทธิ์ไม่ได้ จึงปิดการส่งใบสมัครชั่วคราวเพื่อป้องกันสิทธิ์เกินจำนวน</p>
            ) : (
              <div className="kru-membership-action-block">
                {latestApplication?.status === "declined" && (
                  <p className="kru-membership-alert">ใบสมัครก่อนหน้าไม่ผ่านการตรวจสอบ คุณสามารถส่งใบสมัครใหม่ได้</p>
                )}
                <p>
                  {applicationPlanId === "founder"
                    ? "เมื่อส่งสำเร็จ คุณจะได้รับเลขอ้างอิงสำหรับสิทธิ์ปีแรก 299 บาท"
                    : "สิทธิ์ราคาเปิดตัวครบแล้ว คุณยังสมัครแพ็ก Teacher ราคา 599 บาท/ปีได้"}
                </p>
                <Button size="lg" block loading={submitting} onClick={() => void handleCreateApplication()}>
                  {submitting ? "กำลังสร้างเลขอ้างอิง…" : `ส่งใบสมัคร ${applicationAmount.toLocaleString("th-TH")} บาท`}
                </Button>
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
              <li>รอครูอรรี่ตรวจสอบและกดยืนยันในระบบ</li>
            </ol>
            <p className="kru-membership-payment__notice">การส่งสลิปหรือกรอกใบสมัครยังไม่นับสิทธิ์ จนกว่าระบบจะแสดงสถานะ “ยืนยันชำระแล้ว”</p>
            {latestApplication?.status === "pending" ? (
              <a className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block" href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
                <MessageCircle size={19} aria-hidden="true" /> เปิด LINE OA เพื่อแจ้งชำระ
              </a>
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
        .kru-membership-action-block { display: grid; gap: var(--sp-4); }
        .kru-membership-action-block > a { width: fit-content; }
        .kru-membership-alert { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-info-bg); color: var(--status-info-fg); overflow-wrap: anywhere; }
        .kru-membership-alert--warning { background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-membership-alert--danger { background: var(--status-danger-bg); color: var(--status-danger-fg); }
        .kru-membership-payment { scroll-margin-top: 88px; }
        .kru-membership-payment ol { margin: 0; padding-left: 1.3rem; display: grid; gap: var(--sp-3); color: var(--text-body); }
        .kru-membership-payment__notice { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-warning-bg); color: var(--status-warning-fg) !important; font-size: var(--fs-14); font-weight: var(--fw-semibold); }
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
        }
      `}</style>
    </div>
  );
}

function ApplicationStatus({ application, copied, onCopy }: { application: UpgradeRequest; copied: boolean; onCopy: () => void }) {
  const copy = STATUS_COPY[application.status];
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
