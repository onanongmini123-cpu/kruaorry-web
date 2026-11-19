"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { MEMBERSHIP_STEPS } from "@/lib/membershipSteps";

export function MembershipStepper({ current }: { current: number }) {
  return (
    <nav className="kru-stepper" aria-label="ขั้นตอนสมัคร Teacher Pro">
      <ol>
        {MEMBERSHIP_STEPS.map((label, index) => {
          const number = index + 1;
          const state = number < current ? "done" : number === current ? "current" : "todo";
          return (
            <li key={label} data-state={state} aria-current={state === "current" ? "step" : undefined}>
              <span className="kru-stepper__dot" aria-hidden="true">{state === "done" ? <Check size={14} /> : number}</span>
              <span className="kru-stepper__label">{label}</span>
            </li>
          );
        })}
      </ol>
      <style jsx>{`
        .kru-stepper { margin: 0 0 var(--sp-5); }
        ol { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--sp-2); }
        li { display: grid; justify-items: center; gap: 6px; text-align: center; color: var(--text-muted); font-size: var(--fs-13); }
        .kru-stepper__dot { width: 30px; height: 30px; display: inline-grid; place-items: center; border-radius: 50%; border: 2px solid var(--border-brand); background: var(--surface-card); font-weight: var(--fw-semibold); }
        li[data-state="current"] { color: var(--text-strong); font-weight: var(--fw-semibold); }
        li[data-state="current"] .kru-stepper__dot { background: var(--purple-700); border-color: var(--purple-700); color: #fff; }
        li[data-state="done"] .kru-stepper__dot { background: var(--purple-50); color: var(--purple-700); }
        @media (max-width: 420px) { li { font-size: 12px; } }
      `}</style>
    </nav>
  );
}

type QrState =
  | { status: "loading" }
  | { status: "not_configured" }
  | { status: "unavailable" }
  | { status: "ready"; amountThb: number; accountName: string; referenceCode: string; qrSvg: string };

/**
 * PromptPay QR with the exact quoted amount. Fetched from the server only for
 * the signed-in applicant's own pending application; the account details
 * never ship in the page bundle.
 */
export function PromptPayCard({
  applicationId,
  copied,
  onCopyReference,
}: {
  applicationId: string;
  copied: boolean;
  onCopyReference: (referenceCode: string) => void;
}) {
  const [qr, setQr] = useState<QrState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    fetch(`/api/membership/promptpay?request=${encodeURIComponent(applicationId)}`, { cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as Record<string, unknown> | null;
        if (!active) return;
        if (body?.status === "ready" && typeof body.qrSvg === "string" && typeof body.amountThb === "number"
          && typeof body.accountName === "string" && typeof body.referenceCode === "string") {
          setQr({ status: "ready", amountThb: body.amountThb, accountName: body.accountName, referenceCode: body.referenceCode, qrSvg: body.qrSvg });
        } else if (body?.status === "not_configured") {
          setQr({ status: "not_configured" });
        } else {
          setQr({ status: "unavailable" });
        }
      })
      .catch(() => { if (active) setQr({ status: "unavailable" }); });
    return () => { active = false; };
  }, [applicationId]);

  if (qr.status === "loading") return <p role="status" className="kru-pp-note">กำลังเตรียม QR สำหรับโอนเงิน…</p>;
  if (qr.status === "not_configured") {
    return <p role="status" className="kru-pp-note">ยังไม่เปิดให้โอนผ่าน QR บนเว็บ กรุณาแจ้งเลขอ้างอิงทาง LINE เพื่อรับรายละเอียดการโอน</p>;
  }
  if (qr.status === "unavailable") {
    return <p role="alert" className="kru-pp-note">แสดง QR ไม่ได้ในขณะนี้ กรุณาลองใหม่ หรือแจ้งเลขอ้างอิงทาง LINE เพื่อรับรายละเอียดการโอน</p>;
  }

  return (
    <div className="kru-pp">
      {/* The SVG is generated on the server from the payload only; it carries no scripts. */}
      <div className="kru-pp__qr" role="img" aria-label={`QR พร้อมเพย์ ยอด ${qr.amountThb} บาท`} dangerouslySetInnerHTML={{ __html: qr.qrSvg }} />
      <dl>
        <div><dt>ชื่อบัญชี</dt><dd>{qr.accountName}</dd></div>
        <div><dt>ยอดที่ต้องโอน</dt><dd>{qr.amountThb.toLocaleString("th-TH")} บาท</dd></div>
        <div>
          <dt>เลขอ้างอิง</dt>
          <dd>
            <strong>{qr.referenceCode}</strong>
            <button type="button" onClick={() => onCopyReference(qr.referenceCode)} aria-label={`คัดลอกเลขอ้างอิง ${qr.referenceCode}`}>
              {copied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </dd>
        </div>
      </dl>
      <style jsx>{`
        .kru-pp { display: grid; gap: var(--sp-4); }
        .kru-pp__qr { width: min(260px, 100%); margin: 0 auto; padding: var(--sp-3); background: #fff; border: 1px solid var(--border-brand); border-radius: var(--r-md); }
        .kru-pp__qr :global(svg) { display: block; width: 100%; height: auto; }
        dl { margin: 0; display: grid; gap: var(--sp-3); }
        dl > div { display: grid; gap: 2px; }
        dt { color: var(--text-muted); font-size: var(--fs-13); }
        dd { margin: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--sp-3); flex-wrap: wrap; color: var(--text-strong); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
        dd strong { font-family: var(--font-mono); letter-spacing: .04em; }
        dd button { min-height: 44px; padding: 0 var(--sp-4); display: inline-flex; align-items: center; gap: 7px; border: 1px solid var(--border-brand); border-radius: var(--r-pill); background: var(--surface-card); color: var(--purple-700); font: inherit; font-weight: var(--fw-semibold); cursor: pointer; }
      `}</style>
    </div>
  );
}
