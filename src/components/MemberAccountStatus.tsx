import Link from "next/link";
import { CalendarClock, ReceiptText, RefreshCw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui";
import { LINE_OA_URL } from "@/lib/config";
import type { Plan, UpgradeRequest } from "@/lib/data";
import {
  canRequestMembershipRenewal,
  isMembershipExpired,
  membershipDaysRemaining,
  preferredMembershipApplication,
  type MemberSubscription,
} from "@/lib/memberAccount";

interface MemberAccountStatusProps {
  currentPlanId: string;
  plans: Pick<Plan, "id" | "name">[];
  subscription: MemberSubscription | null;
  subscriptionError: boolean;
  applications: UpgradeRequest[];
  applicationsError: boolean;
}

function formatThaiDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString("th-TH", { dateStyle: "long" })
    : "ตรวจสอบไม่ได้";
}

function subscriptionStatus(subscription: MemberSubscription | null): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (!subscription) return { label: "บัญชีฟรี", tone: "neutral" };
  if (isMembershipExpired(subscription)) return { label: "หมดอายุ", tone: "danger" };
  if (subscription.status === "past_due") return { label: "รอต่ออายุ", tone: "warning" };
  return { label: "ใช้งานอยู่", tone: "success" };
}

function applicationStatus(application: UpgradeRequest): { label: string; tone: "success" | "warning" | "info" | "neutral" } {
  if (application.status === "approved") return { label: "อนุมัติแล้ว", tone: "success" };
  if (application.status === "declined") return { label: "ปิดคำขอแล้ว", tone: "neutral" };
  return application.paymentReportedAt
    ? { label: "แจ้งชำระแล้ว · รอตรวจสอบ", tone: "info" }
    : { label: "รอแจ้งชำระ", tone: "warning" };
}

export function MemberAccountStatus({ currentPlanId, plans, subscription, subscriptionError, applications, applicationsError }: MemberAccountStatusProps) {
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]));
  const currentPlanName = planNameById.get(currentPlanId)
    ?? (subscription?.planId === currentPlanId ? subscription.planName : null)
    ?? (currentPlanId === "free" ? "Free" : currentPlanId);
  const request = preferredMembershipApplication(applications);
  const requestStatus = request ? applicationStatus(request) : null;
  const status = subscriptionStatus(subscription);
  const daysRemaining = membershipDaysRemaining(subscription?.currentPeriodEnd ?? null);
  const canRenew = canRequestMembershipRenewal(subscription);
  const expirationCopy = subscription?.currentPeriodEnd
    ? formatThaiDate(subscription.currentPeriodEnd)
    : subscription
      ? "ไม่กำหนดวันหมดอายุ"
      : "ไม่มีรอบสมาชิกแบบชำระเงิน";

  return (
    <section className="kru-account-membership" aria-labelledby="account-membership-heading">
      <div className="kru-account-membership__heading">
        <div>
          <span><ShieldCheck size={16} aria-hidden="true" /> สิทธิ์จากระบบสมาชิก</span>
          <h2 id="account-membership-heading">สถานะสมาชิก</h2>
        </div>
        {!subscriptionError && <Badge tone={status.tone}>{status.label}</Badge>}
      </div>

      {subscriptionError ? (
        <p role="alert" className="kru-account-membership__error">ยังตรวจสอบรอบสมาชิกไม่ได้ในขณะนี้ กรุณาลองเปิดหน้านี้ใหม่ภายหลัง</p>
      ) : (
        <dl className="kru-account-membership__facts">
          <div>
            <dt>แพ็กปัจจุบัน</dt>
            <dd>{currentPlanName}</dd>
          </div>
          <div>
            <dt><CalendarClock size={15} aria-hidden="true" /> วันสิ้นสุดสิทธิ์</dt>
            <dd>{expirationCopy}</dd>
          </div>
          <div>
            <dt>จำนวนวันที่เหลือ</dt>
            <dd>{daysRemaining === null ? "—" : daysRemaining === 0 ? "หมดอายุแล้ว" : `${daysRemaining.toLocaleString("th-TH")} วัน`}</dd>
          </div>
          <div>
            <dt><ReceiptText size={15} aria-hidden="true" /> สถานะคำขอล่าสุด</dt>
            <dd>{applicationsError ? "ตรวจสอบไม่ได้ในขณะนี้" : requestStatus ? <Badge tone={requestStatus.tone}>{requestStatus.label}</Badge> : "ยังไม่มีคำขอ"}</dd>
          </div>
        </dl>
      )}

      {request && (
        <div className="kru-account-membership__request">
          <div>
            <span>เลขอ้างอิง {request.referenceCode}</span>
            <strong>คำขอแพ็ก {planNameById.get(request.planId) ?? request.planId}</strong>
          </div>
          <Link href={`/membership?plan=${encodeURIComponent(request.planId)}`}>ดูคำขอและวิธีชำระ</Link>
        </div>
      )}

      <div className="kru-account-membership__actions">
        {canRenew ? (
          <a className="kru-btn kru-btn--primary" href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
            <RefreshCw size={17} aria-hidden="true" /> ขอรหัสอ้างอิงต่ออายุทาง LINE
          </a>
        ) : currentPlanId === "free" ? (
          <Link className="kru-btn kru-btn--primary" href="/membership">ดูแพ็กสมาชิก</Link>
        ) : (
          <Link className="kru-btn kru-btn--soft" href="/membership">ดูรายละเอียดสมาชิก</Link>
        )}
        {canRenew && <p>ขอรหัสอ้างอิงต่ออายุจากทีมงานก่อน แล้วจึงชำระและส่งหลักฐานทาง LINE ทีมงานจะตรวจยอดก่อนยืนยันวันต่ออายุในระบบ</p>}
      </div>

      <style jsx>{`
        .kru-account-membership { padding: var(--sp-6); display: grid; gap: var(--sp-5); border: 1px solid var(--border-brand); border-radius: var(--r-card); background: linear-gradient(145deg, var(--surface-card), var(--surface-brand-wash)); box-shadow: var(--shadow-xs); }
        .kru-account-membership__heading { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--sp-4); flex-wrap: wrap; }
        .kru-account-membership__heading > div > span { display: inline-flex; align-items: center; gap: 6px; color: var(--purple-700); font-size: var(--fs-13); font-weight: var(--fw-semibold); }
        .kru-account-membership__heading h2 { margin-top: 4px; font-size: var(--fs-20); }
        .kru-account-membership__facts { margin: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--sp-3); }
        .kru-account-membership__facts > div { min-width: 0; padding: var(--sp-4); border-radius: var(--r-md); background: rgba(255,255,255,.82); }
        .kru-account-membership__facts dt { display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: var(--fs-13); }
        .kru-account-membership__facts dd { margin: var(--sp-2) 0 0; color: var(--text-strong); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
        .kru-account-membership__request { padding: var(--sp-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-4); border-radius: var(--r-md); background: var(--surface-card); }
        .kru-account-membership__request > div { min-width: 0; display: grid; gap: 3px; }
        .kru-account-membership__request span { color: var(--text-muted); font-family: var(--font-mono); font-size: var(--fs-12); overflow-wrap: anywhere; }
        .kru-account-membership__request a { flex: 0 0 auto; font-weight: var(--fw-semibold); }
        .kru-account-membership__actions { display: flex; align-items: center; gap: var(--sp-4); flex-wrap: wrap; }
        .kru-account-membership__actions p { max-width: 460px; color: var(--text-muted); font-size: var(--fs-13); line-height: 1.55; }
        .kru-account-membership__error { padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-warning-bg); color: var(--status-warning-fg); }
        @media (max-width: 560px) {
          .kru-account-membership__facts { grid-template-columns: minmax(0, 1fr); }
          .kru-account-membership__request { align-items: stretch; flex-direction: column; }
          .kru-account-membership__request a { min-height: 44px; display: inline-flex; align-items: center; }
          .kru-account-membership__actions, .kru-account-membership__actions :global(.kru-btn) { width: 100%; }
          .kru-account-membership__actions :global(.kru-btn) { justify-content: center; }
        }
      `}</style>
    </section>
  );
}
