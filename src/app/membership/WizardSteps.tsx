"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Clipboard, MessageCircle } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { UpgradeRequest } from "@/lib/data";
import { applicationHistory } from "@/lib/membershipHistory";
import { formatThaiDate, membershipApplicationPlanLabel, resolvedStatusCopy } from "@/lib/membershipCopy";
import { TransferMethods, TransferSummary } from "./PaymentFlow";

/** The application fields the steps need. */
export interface StepApplication {
  id: string;
  referenceCode: string;
  quotedAmountThb: number;
  planId: string;
}

/**
 * One screen of the wizard: a heading that takes keyboard/screen-reader focus
 * when the member moves between steps, then the step's content.
 */
export function StepFrame({
  title,
  lead,
  focusHeading,
  children,
}: {
  title: string;
  lead?: string;
  focusHeading: boolean;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!focusHeading) return;
    // A new step opens at the top, with its heading focused for screen readers.
    window.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [focusHeading]);
  return (
    <section className="kru-step" aria-labelledby="kru-step-title">
      <h2 id="kru-step-title" ref={heading} tabIndex={-1}>{title}</h2>
      {lead ? <p className="kru-step__lead">{lead}</p> : null}
      {children}
      <style jsx>{`
        .kru-step { display: grid; gap: var(--sp-4); }
        h2 { margin: 0; font-size: var(--fs-24); outline: none; }
        .kru-step__lead { margin: 0; color: var(--text-muted); }
      `}</style>
    </section>
  );
}

/** Back on the left, the main action full width above it on a phone. */
export function StepActions({ children }: { children: ReactNode }) {
  return (
    <div className="kru-actions">
      {children}
      <style jsx>{`
        .kru-actions { display: grid; gap: var(--sp-3); }
        .kru-actions :global(a.kru-btn:hover) { color: var(--white); text-decoration: none; }
      `}</style>
    </div>
  );
}

export function BackButton({ onClick, children = "ย้อนกลับ" }: { onClick: () => void; children?: ReactNode }) {
  return (
    <Button type="button" variant="ghost" icon={ArrowLeft} block onClick={onClick}>{children}</Button>
  );
}

/** An application from the old flow may carry a web "payment reported" time; it is not a slip received by staff. */
function LegacyReportNote({ reportedAt }: { reportedAt: string | null }) {
  if (!reportedAt) return null;
  return (
    <p role="status" className="kru-legacy-note">
      ระบบมีสถานะแจ้งชำระเดิมเมื่อ {formatThaiDate(reportedAt)} · ยังไม่ถือว่าทีมงานรับสลิป และยังต้องรอยืนยันยอดจริง
      <style jsx>{`
        .kru-legacy-note { margin: 0; padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-info-bg); color: var(--status-info-fg); overflow-wrap: anywhere; }
      `}</style>
    </p>
  );
}

/** Step 2: the amount, the reference, and the transfer methods, once. */
export function TransferStep({
  application,
  referenceCopied,
  legacyReportedAt,
  onCopyReference,
  onBack,
  onNext,
  focusHeading,
}: {
  application: StepApplication;
  referenceCopied: boolean;
  legacyReportedAt: string | null;
  onCopyReference: (referenceCode: string) => void;
  onBack: () => void;
  onNext: () => void;
  focusHeading: boolean;
}) {
  return (
    <StepFrame title="โอนเงิน" focusHeading={focusHeading}>
      <LegacyReportNote reportedAt={legacyReportedAt} />
      <TransferSummary
        amountThb={application.quotedAmountThb}
        referenceCode={application.referenceCode}
        referenceCopied={referenceCopied}
        onCopyReference={onCopyReference}
      />
      <TransferMethods
        key={`${application.id}:${application.quotedAmountThb}`}
        applicationId={application.id}
        amountThb={application.quotedAmountThb}
        referenceCode={application.referenceCode}
      />
      <StepActions>
        <Button type="button" size="lg" block onClick={onNext}>โอนแล้ว ไปขั้นต่อไป</Button>
        <BackButton onClick={onBack} />
      </StepActions>
    </StepFrame>
  );
}

/** Step 3: open LINE with the message, or copy the message first when there is no OA ID. */
export function SlipStep({
  message,
  href,
  copyFirst,
  feedback,
  messageCopied,
  onOpenLine,
  onCopyMessage,
  onSent,
  onBack,
  focusHeading,
}: {
  message: string;
  href: string;
  copyFirst: boolean;
  feedback: string | null;
  messageCopied: boolean;
  onOpenLine: () => void;
  onCopyMessage: () => void;
  onSent: () => void;
  onBack: () => void;
  focusHeading: boolean;
}) {
  return (
    <StepFrame title="ส่งสลิปทาง LINE" focusHeading={focusHeading}>
      <p className="kru-slip__how">กดปุ่มด้านล่าง → แนบรูปสลิปในแชต → กดส่ง</p>
      <StepActions>
        <a
          className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          onClick={onOpenLine}
          aria-describedby="kru-slip-feedback"
          data-copy-first={copyFirst ? "true" : "false"}
        >
          <MessageCircle size={19} aria-hidden="true" /> เปิด LINE ส่งสลิป
        </a>
      </StepActions>
      <p id="kru-slip-feedback" role="status" className="kru-slip__feedback">{feedback ?? ""}</p>

      <div className="kru-slip__message">
        <span>ข้อความที่จะส่ง</span>
        <output>{message}</output>
        <button type="button" onClick={onCopyMessage}>
          {messageCopied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
          {messageCopied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
        </button>
      </div>

      <p className="kru-slip__privacy">ไม่เก็บสลิปบนเว็บไซต์ ส่งทาง LINE เท่านั้น</p>
      <StepActions>
        <Button type="button" variant="secondary" size="lg" block onClick={onSent}>ส่งสลิปแล้ว</Button>
        <BackButton onClick={onBack} />
      </StepActions>
      <style jsx>{`
        .kru-slip__how { margin: 0; font-size: var(--fs-18); font-weight: var(--fw-semibold); color: var(--text-strong); }
        .kru-slip__feedback { margin: 0; min-height: 1.5em; color: var(--status-success-fg); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
        .kru-slip__feedback:empty { min-height: 0; }
        .kru-slip__message { display: grid; gap: var(--sp-2); padding: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-sunken); }
        .kru-slip__message > span { color: var(--text-muted); font-size: var(--fs-13); }
        output { display: block; color: var(--text-strong); font-weight: var(--fw-semibold); overflow-wrap: anywhere; user-select: all; }
        .kru-slip__message button { min-height: 44px; width: fit-content; padding: 0 var(--sp-4); display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border-brand); border-radius: var(--r-pill); background: var(--surface-card); color: var(--purple-700); font: inherit; font-weight: var(--fw-semibold); cursor: pointer; }
        .kru-slip__privacy { margin: 0; color: var(--text-muted); font-size: var(--fs-14); }
      `}</style>
    </StepFrame>
  );
}

/** Step 4: waiting for the team to confirm the transfer. */
export function WaitingStep({
  referenceCode,
  referenceCopied,
  slipReceivedAt,
  legacyReportedAt,
  onCopyReference,
  onBackToSlip,
  focusHeading,
}: {
  referenceCode: string;
  referenceCopied: boolean;
  slipReceivedAt: string | null;
  legacyReportedAt: string | null;
  onCopyReference: (referenceCode: string) => void;
  onBackToSlip: () => void;
  focusHeading: boolean;
}) {
  return (
    <StepFrame title="รออนุมัติ" focusHeading={focusHeading}>
      <p className="kru-wait__lead">ได้รับใบสมัครแล้ว ครูอรรี่จะตรวจสอบและอนุมัติภายใน 1 วันทำการ</p>
      {slipReceivedAt ? (
        <p role="status" className="kru-wait__received">ทีมงานบันทึกรับสลิปจาก LINE เมื่อ {formatThaiDate(slipReceivedAt)} · กำลังตรวจยอดจริง</p>
      ) : null}
      <LegacyReportNote reportedAt={legacyReportedAt} />
      <div className="kru-wait__reference">
        <span>เลขอ้างอิง</span>
        <div>
          <strong>{referenceCode}</strong>
          <button type="button" onClick={() => onCopyReference(referenceCode)} aria-label={`คัดลอกเลขอ้างอิง ${referenceCode}`}>
            {referenceCopied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
            {referenceCopied ? "คัดลอกแล้ว" : "คัดลอก"}
          </button>
        </div>
      </div>
      <p className="kru-wait__auto">หน้านี้ตรวจสถานะให้เองทุก 1 นาที เมื่ออนุมัติแล้วจะแจ้งที่นี่</p>
      <StepActions>
        <BackButton onClick={onBackToSlip}>ยังไม่ได้ส่งสลิป? กลับไปขั้นที่ 3</BackButton>
      </StepActions>
      <style jsx>{`
        .kru-wait__lead { margin: 0; font-size: var(--fs-18); font-weight: var(--fw-semibold); color: var(--text-strong); }
        .kru-wait__received { margin: 0; padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-info-bg); color: var(--status-info-fg); }
        .kru-wait__reference { display: grid; gap: 4px; padding: var(--sp-4); border: 1px solid var(--border-brand); border-radius: var(--r-md); background: var(--purple-50); }
        .kru-wait__reference > span { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-wait__reference > div { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
        .kru-wait__reference strong { font-family: var(--font-mono); letter-spacing: .04em; font-size: clamp(1.15rem, 5vw, var(--fs-24)); color: var(--text-strong); overflow-wrap: anywhere; }
        .kru-wait__reference button { min-height: 44px; padding: 0 var(--sp-4); display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border-brand); border-radius: var(--r-pill); background: var(--surface-card); color: var(--purple-700); font: inherit; font-weight: var(--fw-semibold); cursor: pointer; }
        .kru-wait__auto { margin: 0; color: var(--text-muted); font-size: var(--fs-14); }
      `}</style>
    </StepFrame>
  );
}

/** Approved: the wizard is gone, one clear way forward. */
export function ApprovedPanel({
  planName,
  celebrate,
  periodEnd,
  href,
  actionLabel,
}: {
  planName: string;
  /** The member watched this application get approved in this visit. */
  celebrate: boolean;
  periodEnd: string | null;
  href: string;
  actionLabel: string;
}) {
  return (
    <section className="kru-approved" aria-live="polite">
      <h2>{celebrate ? `🎉 ใช้งาน ${planName} ได้แล้ว` : `สิทธิ์ ${planName} ใช้งานอยู่`}</h2>
      {periodEnd ? <p>สิ้นสุดรอบสมาชิก {formatThaiDate(periodEnd)}</p> : null}
      <Link className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block" href={href}>{actionLabel}</Link>
      <style jsx>{`
        .kru-approved { display: grid; gap: var(--sp-4); text-align: center; padding: var(--sp-5); border: 1px solid var(--border-brand); border-radius: var(--r-card); background: var(--purple-50); }
        h2 { margin: 0; font-size: var(--fs-24); }
        p { margin: 0; color: var(--text-muted); }
        .kru-approved :global(a.kru-btn:hover) { color: var(--white); text-decoration: none; }
      `}</style>
    </section>
  );
}

/** Older applications, collapsed so they never compete with the current step. */
export function ApplicationHistory({ applications }: { applications: readonly UpgradeRequest[] }) {
  const items = applicationHistory(applications);
  if (items.length === 0) return null;
  return (
    <details className="kru-history">
      <summary>ประวัติใบสมัคร ({items.length})</summary>
      <ul>
        {items.map((application) => {
          const copy = resolvedStatusCopy(application);
          return (
            <li key={application.id}>
              <div className="kru-history__row">
                <strong>{application.referenceCode}</strong>
                <Badge tone={copy.tone}>{copy.label}</Badge>
              </div>
              <small>{membershipApplicationPlanLabel(application.planId)} · {application.quotedAmountThb.toLocaleString("th-TH")} บาท · {formatThaiDate(application.createdAt)}</small>
            </li>
          );
        })}
      </ul>
      <style jsx>{`
        .kru-history { max-width: 640px; margin: var(--sp-4) auto 0; border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-card); }
        summary { min-height: 48px; padding: 0 var(--sp-4); display: flex; align-items: center; cursor: pointer; font-weight: var(--fw-semibold); color: var(--text-muted); }
        ul { margin: 0; padding: 0 var(--sp-4) var(--sp-4); list-style: none; display: grid; gap: var(--sp-3); }
        li { display: grid; gap: 4px; padding-top: var(--sp-3); border-top: 1px solid var(--border-subtle); }
        .kru-history__row { display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; }
        strong { font-family: var(--font-mono); overflow-wrap: anywhere; }
        small { color: var(--text-muted); }
      `}</style>
    </details>
  );
}
