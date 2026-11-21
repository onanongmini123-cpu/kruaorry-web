"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Badge, Button } from "@/components/ui";
import type { UpgradeRequest } from "@/lib/data";
import { applicationHistory } from "@/lib/membershipHistory";
import { formatThaiDate, membershipApplicationPlanLabel, resolvedStatusCopy } from "@/lib/membershipCopy";
import { START_HINT } from "@/lib/membershipPlanCopy";
import { LINE_OA_URL } from "@/lib/config";
import { ReferenceLine, TransferAmount, TransferMethods } from "./PaymentFlow";

/** The application fields the steps need. */
export interface StepApplication {
  id: string;
  referenceCode: string;
  quotedAmountThb: number;
  planId: string;
}

/**
 * One screen of the wizard: a heading that takes keyboard/screen-reader focus
 * when the member moves between steps (and the page opens at the top), then
 * the step's content.
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

/** The main button on top, the secondary one below it, full width on a phone. */
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

/** A small text-style back / secondary action (not a second big button). */
export function TextAction({ onClick, children, backArrow = false }: { onClick: () => void; children: ReactNode; backArrow?: boolean }) {
  return (
    <button type="button" className="kru-text-action" onClick={onClick}>
      {backArrow ? <ArrowLeft size={16} aria-hidden="true" /> : null}
      {children}
      <style jsx>{`
        .kru-text-action { min-height: 44px; padding: 0 var(--sp-3); margin: 0 auto; display: inline-flex; align-items: center; justify-content: center; gap: 6px; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: var(--fs-14); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
      `}</style>
    </button>
  );
}

/* ------------------------------------------------------------------ step 1 */

export interface PlanCardView {
  id: "founder" | "teacher";
  title: string;
  price: string;
  priceNote: string | null;
  /** "เหลือ 90 ที่" on the Founder card. */
  badge: string | null;
  /** When set the card is grey and cannot be chosen (full, used, checking). */
  unavailableLabel: string | null;
  selected: boolean;
}

export type PlanCta =
  | { kind: "link"; href: string; label: string }
  | { kind: "button"; label: string; loading: boolean; disabled: boolean; onClick: () => void };

/** Step 1: two plan cards, three short benefits, one main button. */
export function PlanStep({
  cards,
  benefits,
  cta,
  notices,
  onSelect,
  focusHeading,
}: {
  cards: PlanCardView[];
  benefits: string[];
  cta: PlanCta | null;
  /** Anything that must be said (loading, a check that failed, why the plan cannot be bought). */
  notices?: ReactNode;
  onSelect: (planId: "founder" | "teacher") => void;
  focusHeading: boolean;
}) {
  return (
    <StepFrame title="เลือกแพ็กที่ต้องการ" focusHeading={focusHeading}>
      <div className="kru-cards" role="radiogroup" aria-label="เลือกแพ็กสมาชิก">
        {cards.map((card) => {
          const unavailable = card.unavailableLabel !== null;
          return (
            <button
              key={card.id}
              type="button"
              role="radio"
              aria-checked={card.selected}
              disabled={unavailable}
              className={`kru-card-plan${card.selected ? " is-selected" : ""}`}
              onClick={() => onSelect(card.id)}
            >
              <span className="kru-card-plan__text">
                <strong>{card.title}</strong>
                <span>{card.price}{card.priceNote ? <small> {card.priceNote}</small> : null}</span>
              </span>
              {unavailable ? <em>{card.unavailableLabel}</em> : card.badge ? <em className="kru-card-plan__badge">{card.badge}</em> : null}
            </button>
          );
        })}
      </div>

      <ul className="kru-benefits">
        {benefits.map((line) => (
          <li key={line}><Check size={16} aria-hidden="true" />{line}</li>
        ))}
      </ul>

      {notices}

      {cta ? (
        <StepActions>
          {cta.kind === "link" ? (
            <Link href={cta.href} className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block">{cta.label}</Link>
          ) : (
            <Button type="button" size="lg" block loading={cta.loading} disabled={cta.disabled} onClick={cta.onClick}>{cta.label}</Button>
          )}
        </StepActions>
      ) : null}
      {cta ? <p className="kru-hint">{START_HINT}</p> : null}
      <style jsx>{`
        .kru-cards { display: grid; gap: var(--sp-3); }
        .kru-card-plan { min-height: 72px; padding: var(--sp-3) var(--sp-4); display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); text-align: left; border: 2px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-card); color: var(--text-body); font: inherit; cursor: pointer; }
        .kru-card-plan.is-selected { border-color: var(--purple-700); background: var(--purple-50); }
        .kru-card-plan:disabled { cursor: not-allowed; background: var(--surface-sunken); color: var(--text-muted); border-style: dashed; }
        .kru-card-plan__text { display: grid; gap: 2px; min-width: 0; }
        .kru-card-plan__text strong { color: inherit; font-size: var(--fs-18); }
        .kru-card-plan__text span { font-size: var(--fs-14); }
        .kru-card-plan__text small { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-card-plan em { flex: 0 0 auto; font-style: normal; font-size: var(--fs-13); font-weight: var(--fw-semibold); padding: 4px 10px; border-radius: var(--r-pill); background: var(--surface-card); color: var(--text-muted); }
        .kru-card-plan em.kru-card-plan__badge { background: var(--status-warning-bg); color: var(--status-warning-fg); }
        .kru-benefits { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; }
        .kru-benefits li { display: flex; align-items: center; gap: 8px; color: var(--text-body); font-size: var(--fs-14); }
        .kru-benefits :global(svg) { flex: 0 0 auto; color: var(--status-success-fg); }
        .kru-hint { margin: 0; text-align: center; color: var(--text-muted); font-size: var(--fs-13); }
      `}</style>
    </StepFrame>
  );
}

/** Step 1 again when the member goes back with an application already waiting. */
export function PendingSummary({
  planLabel,
  amountThb,
  onContinue,
  extra,
  focusHeading,
}: {
  planLabel: string;
  amountThb: number;
  onContinue: (() => void) | null;
  /** A conversion offer or the reason payment is blocked. */
  extra?: ReactNode;
  focusHeading: boolean;
}) {
  return (
    <StepFrame title="ใบสมัครของคุณ" lead={`${planLabel} · ${amountThb.toLocaleString("th-TH")} บาท`} focusHeading={focusHeading}>
      {extra}
      {onContinue ? (
        <StepActions>
          <Button type="button" size="lg" block onClick={onContinue}>ไปโอนเงิน</Button>
        </StepActions>
      ) : null}
    </StepFrame>
  );
}

/* ------------------------------------------------------------------ step 2 */

export function TransferStep({
  application,
  referenceCopied,
  legacyReportedAt,
  onCopyReference,
  onBack,
  onNext,
  onAlreadySent,
  focusHeading,
}: {
  application: StepApplication;
  referenceCopied: boolean;
  legacyReportedAt: string | null;
  onCopyReference: (referenceCode: string) => void;
  onBack: () => void;
  onNext: () => void;
  /** "ส่งสลิปแล้ว? ดูสถานะ": for someone who already sent the slip from another device. */
  onAlreadySent: () => void;
  focusHeading: boolean;
}) {
  return (
    <StepFrame title="โอนเงิน" focusHeading={focusHeading}>
      <LegacyReportNote reportedAt={legacyReportedAt} />
      <TransferAmount amountThb={application.quotedAmountThb} />
      <TransferMethods
        key={`${application.id}:${application.quotedAmountThb}`}
        applicationId={application.id}
        amountThb={application.quotedAmountThb}
        referenceCode={application.referenceCode}
      />
      <ReferenceLine referenceCode={application.referenceCode} copied={referenceCopied} onCopy={onCopyReference} />
      <StepActions>
        <Button type="button" size="lg" block onClick={onNext}>โอนแล้ว ไปส่งสลิป</Button>
        <Button type="button" variant="ghost" icon={ArrowLeft} block onClick={onBack}>ย้อนกลับ</Button>
      </StepActions>
      <TextAction onClick={onAlreadySent}>ส่งสลิปแล้ว? ดูสถานะ</TextAction>
    </StepFrame>
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

/* ------------------------------------------------------------------ step 3 */

export function SlipStep({
  href,
  copyFirst,
  feedback,
  fallbackMessage,
  onOpenLine,
  onSent,
  onBack,
  focusHeading,
}: {
  href: string;
  copyFirst: boolean;
  /** The short note shown after the button is pressed. */
  feedback: string | null;
  /** Only set when copying failed: the message to select and copy by hand. */
  fallbackMessage: string | null;
  onOpenLine: () => void;
  onSent: () => void;
  onBack: () => void;
  focusHeading: boolean;
}) {
  return (
    <StepFrame
      title="ส่งสลิปทาง LINE"
      lead="กดปุ่มด้านล่าง แชตจะเปิดพร้อมข้อความ แนบรูปสลิปแล้วกดส่ง"
      focusHeading={focusHeading}
    >
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
          เปิด LINE ส่งสลิป
        </a>
        <Button type="button" variant="secondary" size="lg" block onClick={onSent}>ฉันส่งสลิปใน LINE แล้ว</Button>
      </StepActions>
      <p id="kru-slip-feedback" role="status" className="kru-slip__feedback">{feedback ?? ""}</p>
      {fallbackMessage ? <output className="kru-slip__fallback">{fallbackMessage}</output> : null}
      <p className="kru-slip__privacy">เว็บไม่เก็บรูปสลิป ส่งทาง LINE ที่เดียว</p>
      <TextAction onClick={onBack} backArrow>ย้อนกลับไปดูเลขบัญชี</TextAction>
      <style jsx>{`
        .kru-slip__feedback { margin: 0; min-height: 1.5em; color: var(--status-success-fg); font-weight: var(--fw-semibold); overflow-wrap: anywhere; text-align: center; }
        .kru-slip__feedback:empty { min-height: 0; }
        .kru-slip__fallback { display: block; padding: var(--sp-4); border: 1px solid var(--border-subtle); border-radius: var(--r-md); background: var(--surface-sunken); color: var(--text-strong); font-weight: var(--fw-semibold); overflow-wrap: anywhere; user-select: all; }
        .kru-slip__privacy { margin: 0; text-align: center; color: var(--text-muted); font-size: var(--fs-13); }
      `}</style>
    </StepFrame>
  );
}

/* ------------------------------------------------------------------ step 4 */

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
    <StepFrame title="รอครูอรรี่ตรวจสลิป" lead="ถ้าส่งสลิปใน LINE แล้ว ครูอรรี่จะอนุมัติภายใน 1 วันทำการ หน้านี้จะอัปเดตเอง" focusHeading={focusHeading}>
      <div className="kru-wait__icon" aria-hidden="true">⏳</div>
      {slipReceivedAt ? (
        <p role="status" className="kru-wait__received">ทีมงานบันทึกสลิปจาก LINE ไว้เมื่อ {formatThaiDate(slipReceivedAt)} · กำลังตรวจยอดจริง</p>
      ) : null}
      <LegacyReportNote reportedAt={legacyReportedAt} />
      <ReferenceLine referenceCode={referenceCode} copied={referenceCopied} onCopy={onCopyReference} />
      <StepActions>
        <Button type="button" variant="secondary" size="lg" block onClick={onBackToSlip}>ยังไม่ได้แนบสลิปในแชต? กลับไปส่ง</Button>
      </StepActions>
      <style jsx>{`
        .kru-wait__icon { font-size: 3rem; text-align: center; line-height: 1; }
        .kru-wait__received { margin: 0; padding: var(--sp-4); border-radius: var(--r-md); background: var(--status-info-bg); color: var(--status-info-fg); }
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
      <h2>{celebrate ? `🎉 ยินดีด้วย ใช้งาน ${planName} ได้แล้ว` : `สิทธิ์ ${planName} ใช้งานอยู่`}</h2>
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

/** Declined after a slip was sent: say so plainly, point to LINE, offer a new application. */
export function RejectedPanel({ onStartOver, focusHeading }: { onStartOver: () => void; focusHeading: boolean }) {
  return (
    <StepFrame title="ใบสมัครนี้ไม่ผ่าน กรุณาทักครูอรรี่ทาง LINE" focusHeading={focusHeading}>
      <StepActions>
        <a className="kru-btn kru-btn--primary kru-btn--lg kru-btn--block" href={LINE_OA_URL} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
          ทักครูอรรี่ทาง LINE
        </a>
        <Button type="button" variant="secondary" size="lg" block onClick={onStartOver}>สมัครใหม่</Button>
      </StepActions>
    </StepFrame>
  );
}

/* ------------------------------------------------------------------ history */

/** Older applications, collapsed at the bottom so they never compete with the current step. */
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
