"use client";

import { useEffect, useState } from "react";
import { Check, Clipboard } from "lucide-react";
import { MEMBERSHIP_STEPS } from "@/lib/membershipSteps";
import { accountNumberDigits } from "@/lib/accountNumberDigits";
import { parseBankResponse, parseQrResponse, resolvePaymentView, type BankPayment, type MethodState, type PaymentView, type QrPayment } from "@/lib/paymentMethods";

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

/**
 * Transfer details for the signed-in applicant's own pending application:
 * the PromptPay QR and/or the bank account, whichever the owner configured.
 * Both are fetched from server routes that check the application belongs to
 * the caller; neither the account number nor the amount is in the page bundle.
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
  const [qr, setQr] = useState<MethodState<QrPayment>>({ status: "loading" });
  const [bank, setBank] = useState<MethodState<BankPayment>>({ status: "loading" });
  const [accountCopied, setAccountCopied] = useState(false);

  useEffect(() => {
    let active = true;
    const load = <T,>(path: string, parse: (body: unknown) => MethodState<T>, set: (state: MethodState<T>) => void) => {
      fetch(`${path}?request=${encodeURIComponent(applicationId)}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json().catch(() => null) as unknown;
          if (active) set(parse(body));
        })
        .catch(() => { if (active) set({ status: "unavailable" }); });
    };
    load("/api/membership/promptpay", parseQrResponse, setQr);
    load("/api/membership/bank-account", parseBankResponse, setBank);
    return () => { active = false; };
  }, [applicationId]);

  const copyAccount = async (accountNumber: string) => {
    try {
      await navigator.clipboard.writeText(accountNumberDigits(accountNumber));
      setAccountCopied(true);
      window.setTimeout(() => setAccountCopied(false), 2500);
    } catch {
      setAccountCopied(false);
    }
  };

  return (
    <PaymentDetailsView
      view={resolvePaymentView(qr, bank)}
      referenceCopied={copied}
      accountCopied={accountCopied}
      onCopyReference={onCopyReference}
      onCopyAccount={(accountNumber) => void copyAccount(accountNumber)}
    />
  );
}

export function PaymentDetailsView({
  view,
  referenceCopied,
  accountCopied,
  onCopyReference,
  onCopyAccount,
}: {
  view: PaymentView;
  referenceCopied: boolean;
  accountCopied: boolean;
  onCopyReference: (referenceCode: string) => void;
  onCopyAccount: (accountNumber: string) => void;
}) {
  if (view.kind === "loading") return <p role="status" className="kru-pp-note">กำลังเตรียมช่องทางโอนเงิน…</p>;
  if (view.kind === "line_only") {
    return <p role="status" className="kru-pp-note">ยังไม่เปิดให้โอนผ่านเว็บ กรุณาแจ้งเลขอ้างอิงทาง LINE เพื่อรับรายละเอียดการโอน</p>;
  }
  if (view.kind === "unavailable") {
    return <p role="alert" className="kru-pp-note">แสดงช่องทางโอนเงินไม่ได้ในขณะนี้ กรุณาลองใหม่ หรือแจ้งเลขอ้างอิงทาง LINE เพื่อรับรายละเอียดการโอน</p>;
  }

  const { qr, bank, amountThb, referenceCode } = view;
  return (
    <div className="kru-pp">
      <div className="kru-pp__amount" data-testid="transfer-amount">
        <span>ยอดที่ต้องโอน</span>
        <strong>{amountThb.toLocaleString("th-TH")} บาท</strong>
        <p>กรุณาโอนยอดนี้ให้ตรงทุกบาท</p>
      </div>

      {qr ? (
        <section className="kru-pp__method" aria-label="โอนผ่านพร้อมเพย์">
          <h3>สแกน QR พร้อมเพย์</h3>
          {/* The SVG is generated on the server from the payload only; it carries no scripts. */}
          <div className="kru-pp__qr" role="img" aria-label={`QR พร้อมเพย์ ยอด ${qr.amountThb} บาท`} dangerouslySetInnerHTML={{ __html: qr.qrSvg }} />
          <dl><div><dt>ชื่อบัญชี</dt><dd>{qr.accountName}</dd></div></dl>
        </section>
      ) : null}

      {bank ? (
        <section className="kru-pp__method" aria-label="โอนเข้าบัญชีธนาคาร">
          <h3>{qr ? "หรือโอนเข้าบัญชีธนาคาร" : "โอนเข้าบัญชีธนาคาร"}</h3>
          <dl>
            <div><dt>ธนาคาร</dt><dd>{bank.bankName}</dd></div>
            <div>
              <dt>เลขบัญชี</dt>
              <dd>
                <strong>{bank.accountNumber}</strong>
                <button type="button" onClick={() => onCopyAccount(bank.accountNumber)} aria-label={`คัดลอกเลขบัญชี ${bank.accountNumber}`}>
                  {accountCopied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
                  {accountCopied ? "คัดลอกแล้ว" : "คัดลอก"}
                </button>
              </dd>
            </div>
            <div><dt>ชื่อบัญชี</dt><dd>{bank.accountName}</dd></div>
          </dl>
        </section>
      ) : null}

      {view.partialFailure ? (
        <p role="status" className="kru-pp-note">ช่องทางโอนอีกแบบแสดงไม่ได้ในขณะนี้ ใช้ช่องทางที่แสดงอยู่ หรือแจ้งเลขอ้างอิงทาง LINE</p>
      ) : null}

      <dl>
        <div>
          <dt>เลขอ้างอิง</dt>
          <dd>
            <strong>{referenceCode}</strong>
            <button type="button" onClick={() => onCopyReference(referenceCode)} aria-label={`คัดลอกเลขอ้างอิง ${referenceCode}`}>
              {referenceCopied ? <Check size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
              {referenceCopied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </dd>
        </div>
      </dl>
      <style jsx>{`
        .kru-pp { display: grid; gap: var(--sp-4); }
        .kru-pp__amount { display: grid; gap: 4px; justify-items: center; text-align: center; padding: var(--sp-4); background: var(--purple-50); border: 2px solid var(--purple-700); border-radius: var(--r-md); }
        .kru-pp__amount span { color: var(--text-muted); font-size: var(--fs-13); }
        .kru-pp__amount strong { font-size: clamp(2rem, 9vw, 2.75rem); line-height: 1.1; color: var(--purple-700); }
        .kru-pp__amount p { margin: 0; font-weight: var(--fw-semibold); color: var(--text-strong); }
        .kru-pp__method { display: grid; gap: var(--sp-3); }
        .kru-pp__method h3 { margin: 0; font-size: var(--fs-16, 1rem); }
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
